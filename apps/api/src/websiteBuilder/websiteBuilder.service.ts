/**
 * Session 93 — Website Builder (Enterprise Site & Page Builder).
 *
 * Org-scoped sites, pages built from typed/validated blocks, a pure
 * deterministic block→HTML renderer (snapshots are real renderer output),
 * an honest publish pipeline (status flips + publishedAt stamped only on the
 * transition), AI copy assistance with explicit provider labeling, and a
 * deterministic rollup computed per read.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids come from CSPRNG (randomUUID).
 *   - `renderedHtml` is always the output of renderPageHtml() at the moment
 *     of publish/preview — never a fabricated string.
 *   - `publishedAt`/`publishedSiteAt` are stamped only when status actually
 *     transitions to published; publishing an already-published site is a
 *     no-op (idempotent) and re-snapshots current renderer output.
 *   - AI copy carries `modelSource: real|echo-demo`; the deterministic
 *     fallback is explicit.
 *
 * Keys: wb:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { renderPageHtml } from "./renderer.js";
import type {
  WbSite,
  WbPage,
  WbBlock,
  WbSiteDetail,
  WbRollup,
  WbSiteCreateInput,
  WbPageCreateInput,
  WbBlockAddInput,
  WbBlockPatchInput,
  WbCopyInput,
  WbBlockProps,
  WbSiteUpsertInput,
  WbPageUpsertInput,
} from "@windels/shared/websiteBuilder";

type Entity = "site" | "page";

const K = {
  item: (e: Entity, org: string, id: string) => `wb:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `wb:${e}:idx:${org}`,
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
    await KernelService.dispatch({ kind, source: "website-builder", payload });
  } catch {
    /* best effort */
  }
}

export const WebsiteBuilderService = {
  // ── Sites ─────────────────────────────────────────────────────────
  async listSites(org: string, filter?: { q?: string; status?: string }): Promise<WbSite[]> {
    const ids = await listIds("site", org);
    const out: WbSite[] = [];
    for (const id of ids) {
      const s = await readOwned<WbSite>("site", org, id);
      if (!s) continue;
      if (filter?.status && s.status !== filter.status) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!`${s.name} ${s.slug} ${s.domain ?? ""}`.toLowerCase().includes(q)) continue;
      }
      out.push(s);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getSite(org: string, id: string): Promise<WbSite | null> {
    return readOwned<WbSite>("site", org, id);
  },

  async createSite(org: string, input: WbSiteCreateInput, _userId: string | null): Promise<WbSite> {
    const existing = await this.listSites(org);
    if (existing.some((s) => s.slug === input.slug)) throw new Error("SLUG_ALREADY_EXISTS");
    const now = new Date().toISOString();
    const rec: WbSite = {
      id: uid("wbs-"),
      organizationId: org,
      name: input.name,
      slug: input.slug,
      domain: input.domain ?? null,
      description: input.description ?? null,
      themeColor: input.themeColor ?? "#0ea5e9",
      status: input.status ?? "draft",
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("site", org, rec);
    void emitKernel("wb.site.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateSite(org: string, id: string, patch: Partial<WbSiteUpsertInput>, _userId: string | null): Promise<WbSite | null> {
    const cur = await readOwned<WbSite>("site", org, id);
    if (!cur) return null;
    if (patch.slug && patch.slug !== cur.slug) {
      const existing = await this.listSites(org);
      if (existing.some((s) => s.slug === patch.slug && s.id !== id)) throw new Error("SLUG_ALREADY_EXISTS");
    }
    const next: WbSite = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      ...(patch.domain !== undefined ? { domain: patch.domain ?? null } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.themeColor !== undefined ? { themeColor: patch.themeColor } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("site", org, next);
    void emitKernel("wb.site.updated", { id, organizationId: org });
    return next;
  },

  async deleteSite(org: string, id: string): Promise<boolean> {
    // Cascade: remove the site's pages too.
    const pages = await this.listPages(org, { siteId: id });
    for (const p of pages) await deleteItem("page", org, p.id);
    const ok = await deleteItem("site", org, id);
    if (ok) void emitKernel("wb.site.deleted", { id, organizationId: org });
    return ok;
  },

  async getSiteDetail(org: string, id: string): Promise<WbSiteDetail | null> {
    const site = await readOwned<WbSite>("site", org, id);
    if (!site) return null;
    const pages = await this.listPages(org, { siteId: id });
    return {
      ...site,
      pages,
      blocksTotal: pages.reduce((sum, p) => sum + p.blocks.length, 0),
    };
  },

  /** Publish a site: flips status, stamps publishedAt only on transition, re-snapshots every page. */
  async publishSite(org: string, id: string, _userId: string | null): Promise<WbSite | null> {
    const site = await readOwned<WbSite>("site", org, id);
    if (!site) return null;
    if (site.status === "archived") throw new Error("SITE_ARCHIVED");
    const pages = await this.listPages(org, { siteId: id });
    if (pages.length === 0) throw new Error("NO_PAGES");
    const now = new Date().toISOString();
    for (const p of pages) {
      const snapshot = renderPageHtml(p);
      const nextPage: WbPage = { ...p, status: "published", publishedAt: p.publishedAt ?? now, renderedHtml: snapshot, updatedAt: now };
      await writeItem("page", org, nextPage);
    }
    const next: WbSite = {
      ...site,
      status: "published",
      publishedAt: site.publishedAt ?? now,
      updatedAt: now,
    };
    await writeItem("site", org, next);
    void emitKernel("wb.site.published", { id, organizationId: org });
    return next;
  },

  async archiveSite(org: string, id: string, _userId: string | null): Promise<WbSite | null> {
    const site = await readOwned<WbSite>("site", org, id);
    if (!site) return null;
    const next: WbSite = { ...site, status: "archived", updatedAt: new Date().toISOString() };
    await writeItem("site", org, next);
    void emitKernel("wb.site.archived", { id, organizationId: org });
    return next;
  },

  // ── Pages ─────────────────────────────────────────────────────────
  async listPages(org: string, filter?: { siteId?: string }): Promise<WbPage[]> {
    const ids = await listIds("page", org);
    const out: WbPage[] = [];
    for (const id of ids) {
      const p = await readOwned<WbPage>("page", org, id);
      if (!p) continue;
      if (filter?.siteId && p.siteId !== filter.siteId) continue;
      out.push(p);
    }
    return out.sort((a, b) => (a.path === b.path ? 0 : a.path === "/" ? -1 : b.path === "/" ? 1 : a.path < b.path ? -1 : 1));
  },

  async getPage(org: string, id: string): Promise<WbPage | null> {
    return readOwned<WbPage>("page", org, id);
  },

  async createPage(org: string, siteId: string, input: WbPageCreateInput, _userId: string | null): Promise<WbPage> {
    const site = await this.getSite(org, siteId);
    if (!site) throw new Error("SITE_NOT_FOUND");
    const existing = await this.listPages(org, { siteId });
    if (existing.some((p) => p.path === input.path)) throw new Error("PATH_ALREADY_EXISTS");
    const now = new Date().toISOString();
    const rec: WbPage = {
      id: uid("wbp-"),
      organizationId: org,
      siteId,
      path: input.path,
      title: input.title,
      seoDescription: input.seoDescription ?? null,
      isHome: input.path === "/",
      status: input.status ?? "draft",
      publishedAt: null,
      renderedHtml: null,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("page", org, rec);
    void emitKernel("wb.page.created", { id: rec.id, organizationId: org, siteId });
    return rec;
  },

  async updatePage(org: string, id: string, patch: Partial<WbPageUpsertInput>, _userId: string | null): Promise<WbPage | null> {
    const cur = await readOwned<WbPage>("page", org, id);
    if (!cur) return null;
    if (patch.path && patch.path !== cur.path) {
      const existing = await this.listPages(org, { siteId: cur.siteId });
      if (existing.some((p) => p.path === patch.path && p.id !== id)) throw new Error("PATH_ALREADY_EXISTS");
    }
    const now = new Date().toISOString();
    const next: WbPage = {
      ...cur,
      ...(patch.path !== undefined ? { path: patch.path, isHome: patch.path === "/" } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription ?? null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: now,
    };
    await writeItem("page", org, next);
    void emitKernel("wb.page.updated", { id, organizationId: org });
    return next;
  },

  async deletePage(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("page", org, id);
    if (ok) void emitKernel("wb.page.deleted", { id, organizationId: org });
    return ok;
  },

  /** Publish one page: renders a real snapshot and stamps publishedAt on transition. */
  async publishPage(org: string, id: string, _userId: string | null): Promise<WbPage | null> {
    const page = await readOwned<WbPage>("page", org, id);
    if (!page) return null;
    const now = new Date().toISOString();
    const snapshot = renderPageHtml(page);
    const next: WbPage = {
      ...page,
      status: "published",
      publishedAt: page.publishedAt ?? now,
      renderedHtml: snapshot,
      updatedAt: now,
    };
    await writeItem("page", org, next);
    void emitKernel("wb.page.published", { id, organizationId: org });
    return next;
  },

  /** Render the current page state via the real renderer (no snapshot stored). */
  async previewPage(org: string, id: string): Promise<{ html: string; pageId: string } | null> {
    const page = await readOwned<WbPage>("page", org, id);
    if (!page) return null;
    return { html: renderPageHtml(page), pageId: page.id };
  },

  // ── Blocks ────────────────────────────────────────────────────────
  async addBlock(org: string, pageId: string, input: WbBlockAddInput, _userId: string | null): Promise<WbPage | null> {
    const page = await readOwned<WbPage>("page", org, pageId);
    if (!page) return null;
    const nextOrder = page.blocks.reduce((m, b) => Math.max(m, b.order), -1) + 1;
    const props: WbBlockProps =
      input.type === "hero"
        ? { ...input, align: input.align ?? "center" }
        : (input as WbBlockProps);
    const block: WbBlock = {
      id: uid("wbb-"),
      type: input.type,
      props,
      order: nextOrder,
    };
    const next: WbPage = { ...page, blocks: [...page.blocks, block], updatedAt: new Date().toISOString() };
    await writeItem("page", org, next);
    void emitKernel("wb.block.added", { pageId, organizationId: org, blockType: block.type });
    return next;
  },

  async updateBlock(org: string, pageId: string, blockId: string, patch: WbBlockPatchInput, _userId: string | null): Promise<WbPage | null> {
    const page = await readOwned<WbPage>("page", org, pageId);
    if (!page) return null;
    const idx = page.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return null;
    const blocks = [...page.blocks];
    const props = { ...(blocks[idx].props as object), ...patch };
    // Keep discriminated-union invariants: hero always carries a default align.
    if ((blocks[idx].type === "hero") && props && typeof props === "object" && !("align" in props)) {
      (props as { align?: string }).align = "center";
    }
    blocks[idx] = { ...blocks[idx], props: props as WbBlockProps };
    const next: WbPage = { ...page, blocks, updatedAt: new Date().toISOString() };
    await writeItem("page", org, next);
    void emitKernel("wb.block.updated", { pageId, blockId, organizationId: org });
    return next;
  },

  async removeBlock(org: string, pageId: string, blockId: string, _userId: string | null): Promise<WbPage | null> {
    const page = await readOwned<WbPage>("page", org, pageId);
    if (!page) return null;
    const blocks = page.blocks.filter((b) => b.id !== blockId);
    if (blocks.length === page.blocks.length) return null;
    const next: WbPage = { ...page, blocks, updatedAt: new Date().toISOString() };
    await writeItem("page", org, next);
    void emitKernel("wb.block.removed", { pageId, blockId, organizationId: org });
    return next;
  },

  /** Reassign block order by the given id array (idempotent, index-based). */
  async reorderBlocks(org: string, pageId: string, blockIds: string[], _userId: string | null): Promise<WbPage | null> {
    const page = await readOwned<WbPage>("page", org, pageId);
    if (!page) return null;
    const byId = new Map(page.blocks.map((b) => [b.id, b]));
    if (!blockIds.every((id) => byId.has(id)) || blockIds.length !== page.blocks.length) {
      throw new Error("BLOCK_LIST_MISMATCH");
    }
    const blocks = blockIds.map((id, order) => ({ ...byId.get(id)!, order }));
    const next: WbPage = { ...page, blocks, updatedAt: new Date().toISOString() };
    await writeItem("page", org, next);
    void emitKernel("wb.block.reordered", { pageId, organizationId: org });
    return next;
  },

  // ── AI copy (explicit provider labeling, deterministic fallback) ──
  async generateCopy(input: WbCopyInput): Promise<{ text: string; provider: string; modelSource: "real" | "echo-demo"; durationMs: number }> {
    const tone = input.tone ?? "professional";
    const brand = input.brand ?? "the company";
    const started = Date.now();
    const fallback = () => {
      const ctx = input.context.slice(0, 140);
      const text =
        input.kind === "hero"
          ? `${ctx}\n\nBuild for what's next. ${brand} helps teams move faster with less friction.`
          : input.kind === "cta"
          ? `Ready to get started? ${ctx} — talk to the ${brand} team today.`
          : `${ctx}\n\nAt ${brand}, we combine strategy, technology and focus to deliver measurable results.`;
      return { text, provider: "deterministic-fallback", modelSource: "echo-demo" as const, durationMs: 0 };
    };
    try {
      const { aiRegistry } = await import("../services/ai/registry.js");
      const system = "You are the WINDELS AI OS website copywriter. Write concise, conversion-focused marketing copy. Return ONLY the copy, no preamble.";
      const user = `Kind: ${input.kind}\nTone: ${tone}\nBrand: ${brand}\nContext: ${input.context}`;
      const res = await aiRegistry.complete(
        { model: "default", messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.7, maxTokens: 300 },
        { organizationId: undefined, feature: "website-builder-copy" }
      );
      const text = res.content.trim();
      if (!text) return fallback();
      return { text, provider: res.provider, modelSource: res.modelSource, durationMs: Date.now() - started };
    } catch {
      return fallback();
    }
  },

  // ── Rollup (computed per read — never invented) ───────────────────
  async rollup(org: string): Promise<WbRollup> {
    const [sites, pages] = await Promise.all([this.listSites(org), this.listPages(org)]);
    const publishedPages = pages.filter((p) => p.status === "published");
    const blocks = pages.reduce((sum, p) => sum + p.blocks.length, 0);
    const totalRenderedBytes = publishedPages.reduce((sum, p) => sum + (p.renderedHtml?.length ?? 0), 0);
    const recentSites = [...sites].sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5);
    const stamps = [sites[0]?.createdAt, pages[0]?.createdAt].filter(Boolean).sort().reverse()[0] ?? null;
    return {
      counts: {
        sites: sites.length,
        publishedSites: sites.filter((s) => s.status === "published").length,
        archivedSites: sites.filter((s) => s.status === "archived").length,
        pages: pages.length,
        publishedPages: publishedPages.length,
        blocks,
      },
      recentSites,
      totalRenderedBytes,
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-wb";
    const existing = await this.listSites(demoOrg);
    if (existing.length > 0) return false;

    const site = await this.createSite(demoOrg, {
      name: "Windels Example",
      slug: "windels-example",
      domain: "example.windels.ai",
      description: "Demo marketing site",
      themeColor: "#0ea5e9",
    }, null);

    const home = await this.createPage(demoOrg, site.id, {
      path: "/", title: "Home", seoDescription: "Welcome to Windels Example",
    }, null);
    await this.addBlock(demoOrg, home.id, {
      type: "hero",
      headline: "The AI-native operating system for work",
      subheadline: "One platform for teams, workflows and intelligence.",
      ctaLabel: "Get started",
      ctaHref: "/contact",
      align: "center",
    }, null);
    await this.addBlock(demoOrg, home.id, {
      type: "features",
      title: "What you get",
      items: [
        { title: "Unified workspace", description: "Chat, tasks, files and analytics in one place." },
        { title: "Enterprise security", description: "Tenant isolation, encryption and audit by default." },
        { title: "Extensible by design", description: "Add modules as your organization grows." },
      ],
    }, null);
    await this.addBlock(demoOrg, home.id, {
      type: "cta",
      headline: "Ready to transform your operations?",
      subheadline: "Talk to our team today.",
      buttonLabel: "Contact sales",
      buttonHref: "/contact",
    }, null);

    const about = await this.createPage(demoOrg, site.id, {
      path: "/about", title: "About us", seoDescription: "Who we are",
    }, null);
    await this.addBlock(demoOrg, about.id, {
      type: "text",
      body: "WINDELS AI OS is built session-by-session against a master specification, shipping real enterprise modules with honest data.",
    }, null);

    const contact = await this.createPage(demoOrg, site.id, {
      path: "/contact", title: "Contact", seoDescription: "Get in touch",
    }, null);
    await this.addBlock(demoOrg, contact.id, {
      type: "button",
      label: "Email us",
      href: "mailto:hello@windels.ai",
      variant: "primary",
    }, null);

    await this.publishSite(demoOrg, site.id, null);

    logger?.info?.("[website-builder] demo seed complete (org-demo-wb): 1 site, 3 pages published + rendered");
    return true;
  },
};
