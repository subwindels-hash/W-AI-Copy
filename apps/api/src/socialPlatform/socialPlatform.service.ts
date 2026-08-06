/**
 * Session 94 — Social Platform (Enterprise Collaboration Feed).
 *
 * Org-scoped posts, comments, and a real reactions ledger from which
 * engagement is computed per read (never stored as a counter). Toggling a
 * reaction is idempotent (same author + post + emoji removes it). Hashtag
 * extraction is deterministic; the rollup is computed from stored records —
 * no fabricated numbers.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids come from CSPRNG (randomUUID).
 *   - Engagement (reactions per emoji, comments count) is always computed
 *     from the ledgers on read — never persisted as a counter.
 *   - `publishedAt` is stamped only when status actually transitions to
 *     published; re-publishing an already-published post is a no-op.
 *   - Hashtags come from a pure regex extractor, stored at write time.
 *
 * Keys: sp:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  SpPost,
  SpComment,
  SpReaction,
  SpReactionGroup,
  SpPostDetail,
  SpFeedItem,
  SpRollup,
  SpPostCreateInput,
  SpCommentCreateInput,
  SpReactionToggleInput,
  SpPostUpsertInput,
} from "@windels/shared/socialPlatform";

type Entity = "post" | "comment" | "reaction";

const K = {
  item: (e: Entity, org: string, id: string) => `sp:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `sp:${e}:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** Read a record ONLY when it belongs to `org` — fail-closed cross-tenant. */
async function readOwned<T extends { organizationId: string }>(
  entity: Entity,
  org: string,
  id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.idx(entity, org), 0, -1);
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "social-platform", payload });
  } catch {
    /* best effort */
  }
}

/** Pure deterministic hashtag extractor: #tag → lowercase, deduped, ordered. */
export function extractHashtags(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(/#([\p{L}\p{N}_]{1,40})/gu)) {
    const tag = m[1]!.toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export const SocialPlatformService = {
  // ── Posts ─────────────────────────────────────────────────────────
  async listPosts(org: string, filter?: { status?: SpPost["status"]; kind?: SpPost["kind"]; hashtag?: string; q?: string }): Promise<SpPost[]> {
    const ids = await listIds("post", org);
    const out: SpPost[] = [];
    for (const id of ids) {
      const p = await readOwned<SpPost>("post", org, id);
      if (!p) continue;
      if (filter?.status && p.status !== filter.status) continue;
      if (filter?.kind && p.kind !== filter.kind) continue;
      if (filter?.hashtag && !p.hashtags.includes(filter.hashtag.toLowerCase())) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!`${p.content} ${p.authorName}`.toLowerCase().includes(q)) continue;
      }
      out.push(p);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getPost(org: string, id: string): Promise<SpPost | null> {
    return readOwned<SpPost>("post", org, id);
  },

  async createPost(org: string, input: SpPostCreateInput, userId: string | null): Promise<SpPost> {
    const now = new Date().toISOString();
    const hashtags = extractHashtags(input.content);
    const rec: SpPost = {
      id: uid("spp-"),
      organizationId: org,
      authorId: userId,
      authorName: input.authorName,
      content: input.content,
      hashtags,
      kind: input.kind ?? "post",
      status: input.status ?? "published",
      publishedAt: (input.status ?? "published") === "published" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("post", org, rec);
    void emitKernel("sp.post.created", { id: rec.id, organizationId: org, kind: rec.kind });
    return rec;
  },

  async updatePost(org: string, id: string, patch: Partial<SpPostUpsertInput>, _userId: string | null): Promise<SpPost | null> {
    const cur = await readOwned<SpPost>("post", org, id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const next: SpPost = {
      ...cur,
      ...(patch.authorName !== undefined ? { authorName: patch.authorName } : {}),
      ...(patch.content !== undefined ? { content: patch.content, hashtags: extractHashtags(patch.content) } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.status !== undefined ? { status: patch.status, publishedAt: patch.status === "published" ? cur.publishedAt ?? now : cur.publishedAt } : {}),
      updatedAt: now,
    };
    await writeItem("post", org, next);
    void emitKernel("sp.post.updated", { id, organizationId: org });
    return next;
  },

  async deletePost(org: string, id: string): Promise<boolean> {
    // Cascade: remove comments + reactions, then the post.
    for (const c of await this.listComments(org, { postId: id })) await deleteItem("comment", org, c.id);
    for (const r of await this.listReactions(org, { postId: id })) await deleteItem("reaction", org, r.id);
    const ok = await deleteItem("post", org, id);
    if (ok) void emitKernel("sp.post.deleted", { id, organizationId: org });
    return ok;
  },

  async publishPost(org: string, id: string, _userId: string | null): Promise<SpPost | null> {
    const post = await readOwned<SpPost>("post", org, id);
    if (!post) return null;
    if (post.status === "archived") throw new Error("POST_ARCHIVED");
    if (post.status === "published") return post; // idempotent
    const now = new Date().toISOString();
    const next: SpPost = { ...post, status: "published", publishedAt: now, updatedAt: now };
    await writeItem("post", org, next);
    void emitKernel("sp.post.published", { id, organizationId: org });
    return next;
  },

  async archivePost(org: string, id: string, _userId: string | null): Promise<SpPost | null> {
    const post = await readOwned<SpPost>("post", org, id);
    if (!post) return null;
    const next: SpPost = { ...post, status: "archived", updatedAt: new Date().toISOString() };
    await writeItem("post", org, next);
    void emitKernel("sp.post.archived", { id, organizationId: org });
    return next;
  },

  // ── Comments ──────────────────────────────────────────────────────
  async listComments(org: string, filter?: { postId?: string }): Promise<SpComment[]> {
    const ids = await listIds("comment", org);
    const out: SpComment[] = [];
    for (const id of ids) {
      const c = await readOwned<SpComment>("comment", org, id);
      if (!c) continue;
      if (filter?.postId && c.postId !== filter.postId) continue;
      out.push(c);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  },

  async createComment(org: string, postId: string, input: SpCommentCreateInput, userId: string | null): Promise<SpComment | null> {
    const post = await readOwned<SpPost>("post", org, postId);
    if (!post) return null;
    const rec: SpComment = {
      id: uid("spc-"),
      organizationId: org,
      postId,
      authorId: userId,
      authorName: input.authorName,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    await writeItem("comment", org, rec);
    void emitKernel("sp.comment.created", { id: rec.id, postId, organizationId: org });
    return rec;
  },

  async deleteComment(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("comment", org, id);
    if (ok) void emitKernel("sp.comment.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Reactions (ledger — engagement computed, never stored) ────────
  async listReactions(org: string, filter?: { postId?: string }): Promise<SpReaction[]> {
    const ids = await listIds("reaction", org);
    const out: SpReaction[] = [];
    for (const id of ids) {
      const r = await readOwned<SpReaction>("reaction", org, id);
      if (!r) continue;
      if (filter?.postId && r.postId !== filter.postId) continue;
      out.push(r);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1));
  },

  /** Compute a post's reactions grouped by emoji — from the ledger, per read. */
  async reactionGroups(org: string, postId: string): Promise<SpReactionGroup[]> {
    const reactions = await this.listReactions(org, { postId });
    const map = new Map<string, number>();
    for (const r of reactions) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
    return [...map.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count);
  },

  /**
   * Toggle a reaction idempotently: same author + post + emoji adds when
   * absent and removes when present. Returns the resulting state.
   */
  async toggleReaction(org: string, postId: string, input: SpReactionToggleInput, userId: string | null): Promise<{ added: boolean; reactions: SpReactionGroup[] } | null> {
    const post = await readOwned<SpPost>("post", org, postId);
    if (!post) return null;
    const authorId = userId ?? "anonymous";
    const existing = (await this.listReactions(org, { postId })).find(
      (r) => r.authorId === authorId && r.emoji === input.emoji
    );
    if (existing) {
      await deleteItem("reaction", org, existing.id);
    } else {
      await writeItem("reaction", org, {
        id: uid("spr-"),
        organizationId: org,
        postId,
        authorId,
        emoji: input.emoji,
        createdAt: new Date().toISOString(),
      } satisfies SpReaction);
    }
    void emitKernel("sp.reaction.toggled", { postId, organizationId: org, emoji: input.emoji, added: !existing });
    return { added: !existing, reactions: await this.reactionGroups(org, postId) };
  },

  // ── Feed & detail ─────────────────────────────────────────────────
  async feed(org: string, filter?: { hashtag?: string; kind?: SpPost["kind"]; q?: string }): Promise<SpFeedItem[]> {
    const posts = await this.listPosts(org, { status: "published", hashtag: filter?.hashtag, kind: filter?.kind, q: filter?.q });
    const out: SpFeedItem[] = [];
    for (const p of posts) {
      const [reactions, comments] = await Promise.all([
        this.reactionGroups(org, p.id),
        this.listComments(org, { postId: p.id }),
      ]);
      out.push({
        post: p,
        reactions,
        reactionsTotal: reactions.reduce((s, r) => s + r.count, 0),
        commentsCount: comments.length,
        commentPreview: comments[0]?.content ?? null,
      });
    }
    return out;
  },

  async getPostDetail(org: string, id: string): Promise<SpPostDetail | null> {
    const post = await readOwned<SpPost>("post", org, id);
    if (!post) return null;
    const [comments, reactions] = await Promise.all([
      this.listComments(org, { postId: id }),
      this.reactionGroups(org, id),
    ]);
    return {
      ...post,
      comments,
      reactions,
      reactionsTotal: reactions.reduce((s, r) => s + r.count, 0),
      commentsCount: comments.length,
    };
  },

  /** Top hashtags from stored posts — computed, never invented. */
  async topHashtags(org: string, limit = 8): Promise<Array<{ tag: string; count: number }>> {
    const posts = await this.listPosts(org);
    const map = new Map<string, number>();
    for (const p of posts) {
      for (const tag of p.hashtags) map.set(tag, (map.get(tag) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  },

  // ── Rollup (computed per read — never invented) ───────────────────
  async rollup(org: string): Promise<SpRollup> {
    const [posts, comments, reactions] = await Promise.all([
      this.listPosts(org),
      this.listComments(org),
      this.listReactions(org),
    ]);
    const authors = new Map<string, number>();
    for (const p of posts) authors.set(p.authorName, (authors.get(p.authorName) ?? 0) + 1);
    const topAuthors = [...authors.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 5)
      .map(([authorName, postCount]) => ({ authorName, postCount }));

    const stamps = [posts[0]?.createdAt, comments[0]?.createdAt, reactions[0]?.createdAt]
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

    return {
      counts: {
        posts: posts.length,
        publishedPosts: posts.filter((p) => p.status === "published").length,
        draftPosts: posts.filter((p) => p.status === "draft").length,
        archivedPosts: posts.filter((p) => p.status === "archived").length,
        comments: comments.length,
        reactions: reactions.length,
        posters: authors.size,
      },
      topHashtags: await this.topHashtags(org),
      topAuthors,
      recentPosts: (await this.feed(org)).slice(0, 6),
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-sp";
    const existing = await this.listPosts(demoOrg);
    if (existing.length > 0) return false;

    const p1 = await this.createPost(demoOrg, {
      authorName: "Ada Okafor",
      content: "Shipping Session 94 — the Social Platform is live! 🎉 #windels #launch #collaboration",
    }, null);
    const p2 = await this.createPost(demoOrg, {
      authorName: "Chidi Eze",
      content: "Reminder: quarterly review is Friday. Please confirm attendance in #team-updates",
      kind: "announcement",
    }, null);
    const p3 = await this.createPost(demoOrg, {
      authorName: "Zainab Bello",
      content: "Pushed v2.1 to staging — the new dashboard is fast. Feedback welcome #engineering #release",
      kind: "update",
    }, null);
    await this.createPost(demoOrg, {
      authorName: "Emeka Nwosu",
      content: "Welcome to the new joiners this week! 🎉 #welcome #culture",
    }, null);

    await this.createComment(demoOrg, p1.id, { authorName: "Chidi Eze", content: "Congrats team! 🚀" }, null);
    await this.createComment(demoOrg, p1.id, { authorName: "Zainab Bello", content: "Looks great — nice work." }, null);
    await this.createComment(demoOrg, p2.id, { authorName: "Ada Okafor", content: "Confirmed for Friday." }, null);

    await this.toggleReaction(demoOrg, p1.id, { emoji: "🎉" }, "user-ada");
    await this.toggleReaction(demoOrg, p1.id, { emoji: "🚀" }, "user-chidi");
    await this.toggleReaction(demoOrg, p2.id, { emoji: "👍" }, "user-zainab");
    await this.toggleReaction(demoOrg, p3.id, { emoji: "🚀" }, "user-ada");

    logger?.info?.("[social-platform] demo seed complete (org-demo-sp): 4 posts, 3 comments, 4 reactions");
    return true;
  },
};
