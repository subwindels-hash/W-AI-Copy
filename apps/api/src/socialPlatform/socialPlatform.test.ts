/**
 * Session 94 — Social Platform.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): post/comment/reaction CRUD, deterministic hashtag
 * extraction, idempotent reaction toggling, engagement computed from the
 * ledgers (never stored), publish lifecycle, rollup determinism, cross-tenant
 * isolation, demo-seed idempotency, and the shared Zod input contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
      return slice.map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));

import { SocialPlatformService, extractHashtags } from "./socialPlatform.service.js";
import {
  SpPostUpsertSchema,
  SpCommentCreateSchema,
  SpReactionToggleSchema,
} from "@windels/shared/socialPlatform";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function seedOrgA() {
  const p1 = await SocialPlatformService.createPost(ORG_A, {
    authorName: "Ada Okafor", content: "Launching the new platform! #windels #launch", kind: "post",
  }, "user-ada");
  const p2 = await SocialPlatformService.createPost(ORG_A, {
    authorName: "Chidi Eze", content: "Quarterly review Friday #team-updates", kind: "announcement",
  }, "user-chidi");
  return { p1, p2 };
}

describe("SP — hashtag extraction (deterministic)", () => {
  it("extracts, lowercases and dedupes hashtags in order", () => {
    expect(extractHashtags("Hello #World and #world again")).toEqual(["world"]);
    expect(extractHashtags("#Alpha #Beta #alpha #Gamma")).toEqual(["alpha", "beta", "gamma"]);
    expect(extractHashtags("no tags here")).toEqual([]);
    expect(extractHashtags("Mixed case #Launch and #release_v2")).toEqual(["launch", "release_v2"]);
  });
});

describe("SP — posts (org-scoped, honest lifecycle)", () => {
  it("creates published posts with hashtags and a publishedAt stamp", async () => {
    const { p1 } = await seedOrgA();
    expect(p1.id).toMatch(/^spp-/);
    expect(p1.status).toBe("published");
    expect(p1.publishedAt).toBeTruthy();
    expect(p1.hashtags).toEqual(["windels", "launch"]);
  });

  it("creates drafts without publishedAt; publish stamps it; re-publish is idempotent", async () => {
    const d = await SocialPlatformService.createPost(ORG_A, {
      authorName: "Zainab Bello", content: "Draft post", status: "draft",
    }, "user-z");
    expect(d.status).toBe("draft");
    expect(d.publishedAt).toBeNull();

    const pub = await SocialPlatformService.publishPost(ORG_A, d.id, null);
    expect(pub?.status).toBe("published");
    expect(pub?.publishedAt).toBeTruthy();

    const again = await SocialPlatformService.publishPost(ORG_A, d.id, null);
    expect(again?.publishedAt).toBe(pub?.publishedAt); // idempotent

    await SocialPlatformService.archivePost(ORG_A, d.id, null);
    await expect(SocialPlatformService.publishPost(ORG_A, d.id, null)).rejects.toThrow("POST_ARCHIVED");
  });

  it("recomputes hashtags on content update", async () => {
    const { p1 } = await seedOrgA();
    const updated = await SocialPlatformService.updatePost(ORG_A, p1.id, { content: "Now with #v2" }, null);
    expect(updated?.hashtags).toEqual(["v2"]);
  });

  it("deleting a post cascades comments and reactions", async () => {
    const { p1 } = await seedOrgA();
    await SocialPlatformService.createComment(ORG_A, p1.id, { authorName: "C", content: "nice" }, null);
    await SocialPlatformService.toggleReaction(ORG_A, p1.id, { emoji: "👍" }, "user-x");

    expect(await SocialPlatformService.deletePost(ORG_A, p1.id)).toBe(true);
    expect(await SocialPlatformService.listComments(ORG_A)).toHaveLength(0);
    expect(await SocialPlatformService.listReactions(ORG_A)).toHaveLength(0);
  });
});

describe("SP — comments & reactions (ledger → computed engagement)", () => {
  it("creates comments and computes commentsCount from the ledger", async () => {
    const { p1 } = await seedOrgA();
    await SocialPlatformService.createComment(ORG_A, p1.id, { authorName: "Ada", content: "First!" }, "u1");
    await SocialPlatformService.createComment(ORG_A, p1.id, { authorName: "Chidi", content: "Second!" }, "u2");

    const detail = await SocialPlatformService.getPostDetail(ORG_A, p1.id);
    expect(detail?.comments).toHaveLength(2);
    expect(detail?.commentsCount).toBe(2);
  });

  it("toggles reactions idempotently and computes groups from the ledger", async () => {
    const { p1 } = await seedOrgA();
    const add1 = await SocialPlatformService.toggleReaction(ORG_A, p1.id, { emoji: "🚀" }, "user-ada");
    expect(add1?.added).toBe(true);
    expect(add1?.reactions).toEqual([{ emoji: "🚀", count: 1 }]);

    await SocialPlatformService.toggleReaction(ORG_A, p1.id, { emoji: "🎉" }, "user-chidi");
    const groups = await SocialPlatformService.reactionGroups(ORG_A, p1.id);
    expect(groups).toHaveLength(2);

    // Same author + same emoji → remove (idempotent toggle).
    const remove = await SocialPlatformService.toggleReaction(ORG_A, p1.id, { emoji: "🚀" }, "user-ada");
    expect(remove?.added).toBe(false);
    expect(remove?.reactions).toEqual([{ emoji: "🎉", count: 1 }]);
  });

  it("feed items carry computed engagement", async () => {
    const { p1 } = await seedOrgA();
    await SocialPlatformService.createComment(ORG_A, p1.id, { authorName: "Ada", content: "Looking good!" }, "u1");
    await SocialPlatformService.toggleReaction(ORG_A, p1.id, { emoji: "👍" }, "u1");
    await SocialPlatformService.toggleReaction(ORG_A, p1.id, { emoji: "👍" }, "u2");

    const feed = await SocialPlatformService.feed(ORG_A);
    const item = feed.find((f) => f.post.id === p1.id);
    expect(item?.commentsCount).toBe(1);
    expect(item?.reactionsTotal).toBe(2);
    expect(item?.commentPreview).toBe("Looking good!");
  });
});

describe("SP — rollup (deterministic, honest)", () => {
  it("computes counts, top hashtags and top authors from stored records", async () => {
    const { p1, p2 } = await seedOrgA();
    await SocialPlatformService.createPost(ORG_A, { authorName: "Ada Okafor", content: "Another #windels update" }, "user-ada");
    await SocialPlatformService.createComment(ORG_A, p1.id, { authorName: "C", content: "nice" }, null);
    await SocialPlatformService.toggleReaction(ORG_A, p2.id, { emoji: "👍" }, "user-x");
    await SocialPlatformService.createPost(ORG_A, { authorName: "Zainab", content: "Draft only", status: "draft" }, "user-z");

    const r1 = await SocialPlatformService.rollup(ORG_A);
    const r2 = await SocialPlatformService.rollup(ORG_A);
    expect(r2).toEqual(r1); // deterministic

    expect(r1.counts.posts).toBe(4);
    expect(r1.counts.publishedPosts).toBe(3);
    expect(r1.counts.draftPosts).toBe(1);
    expect(r1.counts.comments).toBe(1);
    expect(r1.counts.reactions).toBe(1);
    expect(r1.counts.posters).toBe(3);

    expect(r1.topHashtags[0]).toEqual({ tag: "windels", count: 2 });
    expect(r1.topAuthors[0]).toEqual({ authorName: "Ada Okafor", postCount: 2 });
    expect(r1.recentPosts.length).toBeGreaterThan(0);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await SocialPlatformService.rollup(ORG_B);
    expect(r.counts.posts).toBe(0);
    expect(r.counts.comments).toBe(0);
    expect(r.counts.reactions).toBe(0);
    expect(r.counts.posters).toBe(0);
    expect(r.topHashtags).toEqual([]);
    expect(r.topAuthors).toEqual([]);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("SP — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read or write org A posts, comments or reactions", async () => {
    const { p1 } = await seedOrgA();

    expect(await SocialPlatformService.listPosts(ORG_B)).toHaveLength(0);
    expect(await SocialPlatformService.getPost(ORG_B, p1.id)).toBeNull();
    expect(await SocialPlatformService.getPostDetail(ORG_B, p1.id)).toBeNull();
    expect(await SocialPlatformService.feed(ORG_B)).toHaveLength(0);
    expect(await SocialPlatformService.createComment(ORG_B, p1.id, { authorName: "X", content: "nope" }, null)).toBeNull();
    expect(await SocialPlatformService.toggleReaction(ORG_B, p1.id, { emoji: "👍" }, "user-x")).toBeNull();
    expect(await SocialPlatformService.deletePost(ORG_B, p1.id)).toBe(false);
    expect(await SocialPlatformService.topHashtags(ORG_B)).toEqual([]);

    // Org A data intact.
    expect((await SocialPlatformService.getPost(ORG_A, p1.id))?.content).toContain("windels");
  });
});

describe("SP — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await SocialPlatformService.ensureDemoSeed()).toBe(true);
    const r = await SocialPlatformService.rollup("org-demo-sp");
    expect(r.counts.posts).toBe(4);
    expect(r.counts.comments).toBe(3);
    expect(r.counts.reactions).toBe(4);
    expect(r.counts.publishedPosts).toBe(4);

    expect(await SocialPlatformService.ensureDemoSeed()).toBe(false);
    expect((await SocialPlatformService.rollup("org-demo-sp")).counts.posts).toBe(4);
  });
});

describe("SP — shared input contracts", () => {
  it("validates post input", () => {
    expect(SpPostUpsertSchema.safeParse({ authorName: "", content: "x" }).success).toBe(false);
    expect(SpPostUpsertSchema.safeParse({ authorName: "A", content: "" }).success).toBe(false);
    expect(SpPostUpsertSchema.safeParse({ authorName: "A", content: "x", kind: "nonsense" }).success).toBe(false);
    expect(SpPostUpsertSchema.safeParse({ authorName: "A", content: "x" }).success).toBe(true);
  });

  it("validates comment input", () => {
    expect(SpCommentCreateSchema.safeParse({ authorName: "A", content: "" }).success).toBe(false);
    expect(SpCommentCreateSchema.safeParse({ authorName: "A", content: "hi" }).success).toBe(true);
  });

  it("validates reaction input (emoji allowlist)", () => {
    expect(SpReactionToggleSchema.safeParse({ emoji: "🚀" }).success).toBe(true);
    expect(SpReactionToggleSchema.safeParse({ emoji: "💩" }).success).toBe(false);
    expect(SpReactionToggleSchema.safeParse({ emoji: "" }).success).toBe(false);
  });
});
