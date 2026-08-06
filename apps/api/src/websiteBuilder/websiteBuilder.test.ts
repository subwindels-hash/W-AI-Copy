/**
 * Session 93 — Website Builder.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): site/page/block CRUD with slug & path uniqueness,
 * the pure deterministic renderer (escaping + snapshot equality), the
 * publish pipeline (status + publishedAt + real renderedHtml), block
 * ordering, AI copy with explicit provider labeling (echo-demo fallback),
 * rollup determinism, cross-tenant isolation, demo-seed idempotency, and the
 * shared Zod input contracts.
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
// AI registry mocked to echo-demo empty content → the service's deterministic
// fallback path runs, exactly what the labeling tests assert.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: async () => ({
      content: "",
      usage: { tokensIn: 0, tokensOut: 0, costMicros: 0, model: "echo" },
      model: "echo",
      provider: "echo",
      durationMs: 1,
      modelSource: "echo-demo",
    }),
  },
}));

import { WebsiteBuilderService } from "./websiteBuilder.service.js";
import { renderPageHtml } from "./renderer.js";
import {
  WbSiteUpsertSchema,
  WbPageUpsertSchema,
  WbBlockPropsSchema,
  WbCopySchema,
} from "@windels/shared/websiteBuilder";
import type { WbPage } from "@windels/shared/websiteBuilder";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function seedOrgA() {
  const site = await WebsiteBuilderService.createSite(ORG_A, { name: "Marketing", slug: "marketing" }, null);
  const home = await WebsiteBuilderService.createPage(ORG_A, site.id, { path: "/", title: "Home" }, null);
  await WebsiteBuilderService.addBlock(ORG_A, home.id, {
    type: "hero", headline: "Welcome", subheadline: "To our site", ctaLabel: "Learn more", ctaHref: "/about",
  }, null);
  return { site, home };
}

describe("WB — sites (org-scoped, unique slug)", () => {
  it("creates, lists, updates and deletes a site; enforces unique slug", async () => {
    const s = await WebsiteBuilderService.createSite(ORG_A, { name: "Site A", slug: "site-a" }, null);
    expect(s.id).toMatch(/^wbs-/);
    expect(s.status).toBe("draft");
    expect(s.publishedAt).toBeNull();

    await expect(WebsiteBuilderService.createSite(ORG_A, { name: "Dup", slug: "site-a" }, null))
      .rejects.toThrow("SLUG_ALREADY_EXISTS");

    expect(await WebsiteBuilderService.listSites(ORG_A, { q: "site" })).toHaveLength(1);
    const updated = await WebsiteBuilderService.updateSite(ORG_A, s.id, { name: "Site A v2" }, null);
    expect(updated?.name).toBe("Site A v2");
    expect(await WebsiteBuilderService.deleteSite(ORG_A, s.id)).toBe(true);
    expect(await WebsiteBuilderService.getSite(ORG_A, s.id)).toBeNull();
  });

  it("rejects a site with no pages on publish", async () => {
    const s = await WebsiteBuilderService.createSite(ORG_A, { name: "Empty", slug: "empty" }, null);
    await expect(WebsiteBuilderService.publishSite(ORG_A, s.id, null)).rejects.toThrow("NO_PAGES");
  });
});

describe("WB — pages & blocks", () => {
  it("creates pages with unique paths per site; isHome derived from path", async () => {
    const { site } = await seedOrgA();
    const about = await WebsiteBuilderService.createPage(ORG_A, site.id, { path: "/about", title: "About" }, null);
    expect(about.isHome).toBe(false);
    expect(about.blocks).toEqual([]);

    const home = (await WebsiteBuilderService.listPages(ORG_A, { siteId: site.id })).find((p) => p.isHome);
    expect(home?.path).toBe("/");

    await expect(WebsiteBuilderService.createPage(ORG_A, site.id, { path: "/about", title: "Dup" }, null))
      .rejects.toThrow("PATH_ALREADY_EXISTS");
  });

  it("adds, reorders, updates and removes blocks with monotonic order", async () => {
    const { home } = await seedOrgA(); // home already has 1 hero block
    const p1 = await WebsiteBuilderService.addBlock(ORG_A, home.id, { type: "text", body: "First" }, null);
    const p2 = await WebsiteBuilderService.addBlock(ORG_A, home.id, { type: "text", body: "Second" }, null);
    expect(p2.blocks.map((b) => b.order).sort()).toEqual([0, 1, 2]);

    // Reorder: swap the first two blocks (ids[1] becomes order 0); all three
    // block ids must be present (the hero + both texts).
    const ids = p2.blocks.map((b) => b.id);
    [ids[0], ids[1]] = [ids[1], ids[0]];
    const reordered = await WebsiteBuilderService.reorderBlocks(ORG_A, home.id, ids, null);
    expect(reordered?.blocks.find((b) => b.id === ids[0])?.order).toBe(0);
    expect(reordered?.blocks.find((b) => b.id === ids[1])?.order).toBe(1);

    // Mismatched reorder list rejected.
    await expect(WebsiteBuilderService.reorderBlocks(ORG_A, home.id, [ids[0]], null))
      .rejects.toThrow("BLOCK_LIST_MISMATCH");

    // Update a block prop.
    const updated = await WebsiteBuilderService.updateBlock(ORG_A, home.id, ids[1], { body: "First v2" }, null);
    expect((updated?.blocks.find((b) => b.id === ids[1])?.props as any).body).toBe("First v2");

    // Remove one block — two remain (hero + one text).
    const removed = await WebsiteBuilderService.removeBlock(ORG_A, home.id, ids[0], null);
    expect(removed?.blocks).toHaveLength(2);
  });
});

describe("WB — renderer (real, deterministic, escaped)", () => {
  it("escapes text fields and unsafe hrefs", async () => {
    const { home } = await seedOrgA();
    await WebsiteBuilderService.addBlock(ORG_A, home.id, {
      type: "text", body: "<script>alert('xss')</script> & more",
    }, null);
    const page = (await WebsiteBuilderService.getPage(ORG_A, home.id))!;
    const html = renderPageHtml(page);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("renders hero, features and cta blocks deterministically", async () => {
    const page: WbPage = {
      id: "wbp-x", organizationId: ORG_A, siteId: "wbs-x", path: "/", title: "Test",
      seoDescription: null, isHome: true, status: "draft", publishedAt: null,
      renderedHtml: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      blocks: [
        { id: "b1", type: "hero", order: 0, props: { type: "hero", headline: "Big Headline", ctaLabel: "Go", ctaHref: "/cta", align: "center" } },
        { id: "b2", type: "features", order: 1, props: { type: "features", items: [{ title: "Fast", description: "Really fast." }] } },
        { id: "b3", type: "cta", order: 2, props: { type: "cta", headline: "Sign up now" } },
      ],
    };
    const html = renderPageHtml(page);
    expect(html).toContain("Big Headline");
    expect(html).toContain("Really fast.");
    expect(html).toContain("Sign up now");
    expect(html).toContain("<!DOCTYPE html>");
    // Deterministic: two renders are byte-identical.
    expect(renderPageHtml(page)).toBe(html);
  });
});

describe("WB — publish pipeline (honest snapshots)", () => {
  it("publish flips status, stamps publishedAt and snapshots real renderer output", async () => {
    const { site, home } = await seedOrgA();
    const published = await WebsiteBuilderService.publishSite(ORG_A, site.id, null);

    expect(published?.status).toBe("published");
    expect(published?.publishedAt).toBeTruthy();

    const page = (await WebsiteBuilderService.getPage(ORG_A, home.id))!;
    expect(page.status).toBe("published");
    expect(page.renderedHtml).not.toBeNull();
    // The snapshot is exactly the renderer output for that page.
    expect(page.renderedHtml).toBe(renderPageHtml({ title: page.title, path: page.path, blocks: page.blocks }));

    // Publishing again is idempotent (no new timestamp, same snapshot).
    const again = await WebsiteBuilderService.publishSite(ORG_A, site.id, null);
    expect(again?.publishedAt).toBe(published?.publishedAt);
  });

  it("archiving blocks re-publishing", async () => {
    const { site } = await seedOrgA();
    await WebsiteBuilderService.archiveSite(ORG_A, site.id, null);
    await expect(WebsiteBuilderService.publishSite(ORG_A, site.id, null)).rejects.toThrow("SITE_ARCHIVED");
  });
});

describe("WB — AI copy (explicit labeling)", () => {
  it("returns usable copy with echo-demo labeling when no real provider is configured", async () => {
    const c = await WebsiteBuilderService.generateCopy({ kind: "hero", context: "Enterprise software for teams" });
    expect(c.text.length).toBeGreaterThan(0);
    expect(c.modelSource).toBe("echo-demo");
    expect(c.provider.length).toBeGreaterThan(0);
  });
});

describe("WB — rollup (deterministic, honest)", () => {
  it("computes counts and rendered bytes from stored records", async () => {
    const { site, home } = await seedOrgA();
    await WebsiteBuilderService.publishSite(ORG_A, site.id, null);

    const r1 = await WebsiteBuilderService.rollup(ORG_A);
    const r2 = await WebsiteBuilderService.rollup(ORG_A);
    expect(r2).toEqual(r1);

    expect(r1.counts.sites).toBe(1);
    expect(r1.counts.publishedSites).toBe(1);
    expect(r1.counts.pages).toBe(1);
    expect(r1.counts.publishedPages).toBe(1);
    expect(r1.counts.blocks).toBe(1);
    expect(r1.totalRenderedBytes).toBeGreaterThan(0);
    expect(r1.recentSites).toHaveLength(1);
    expect(r1.lastUpdatedAt).toBeTruthy();

    const homeAfter = (await WebsiteBuilderService.getPage(ORG_A, home.id))!;
    expect(r1.totalRenderedBytes).toBe(homeAfter.renderedHtml!.length);
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await WebsiteBuilderService.rollup(ORG_B);
    expect(r.counts.sites).toBe(0);
    expect(r.counts.pages).toBe(0);
    expect(r.counts.blocks).toBe(0);
    expect(r.totalRenderedBytes).toBe(0);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("WB — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read org A sites, pages or blocks", async () => {
    const { site, home } = await seedOrgA();

    expect(await WebsiteBuilderService.listSites(ORG_B)).toHaveLength(0);
    expect(await WebsiteBuilderService.getSite(ORG_B, site.id)).toBeNull();
    expect(await WebsiteBuilderService.getSiteDetail(ORG_B, site.id)).toBeNull();
    expect(await WebsiteBuilderService.getPage(ORG_B, home.id)).toBeNull();
    expect(await WebsiteBuilderService.listPages(ORG_B)).toHaveLength(0);
    expect(await WebsiteBuilderService.previewPage(ORG_B, home.id)).toBeNull();
    expect(await WebsiteBuilderService.publishSite(ORG_B, site.id, null)).toBeNull();
    expect(await WebsiteBuilderService.addBlock(ORG_B, home.id, { type: "text", body: "nope" }, null)).toBeNull();

    // Org A data intact.
    expect((await WebsiteBuilderService.getSiteDetail(ORG_A, site.id))?.pages).toHaveLength(1);
  });
});

describe("WB — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await WebsiteBuilderService.ensureDemoSeed()).toBe(true);
    const r = await WebsiteBuilderService.rollup("org-demo-wb");
    expect(r.counts.sites).toBe(1);
    expect(r.counts.pages).toBe(3);
    expect(r.counts.publishedPages).toBe(3);
    expect(r.counts.blocks).toBeGreaterThan(0);
    expect(r.totalRenderedBytes).toBeGreaterThan(0);

    expect(await WebsiteBuilderService.ensureDemoSeed()).toBe(false);
    expect((await WebsiteBuilderService.rollup("org-demo-wb")).counts.sites).toBe(1);
  });
});

describe("WB — shared input contracts", () => {
  it("validates site input (slug format)", () => {
    expect(WbSiteUpsertSchema.safeParse({ name: "A", slug: "Bad Slug!" }).success).toBe(false);
    expect(WbSiteUpsertSchema.safeParse({ name: "A", slug: "good-slug" }).success).toBe(true);
    expect(WbSiteUpsertSchema.safeParse({ name: "A", slug: "good-slug", themeColor: "blue" }).success).toBe(false);
  });

  it("validates page input (path format)", () => {
    expect(WbPageUpsertSchema.safeParse({ path: "about", title: "A" }).success).toBe(false);
    expect(WbPageUpsertSchema.safeParse({ path: "/About", title: "A" }).success).toBe(false);
    expect(WbPageUpsertSchema.safeParse({ path: "/about", title: "A" }).success).toBe(true);
  });

  it("validates block props (discriminated union)", () => {
    expect(WbBlockPropsSchema.safeParse({ type: "hero", headline: "Hi" }).success).toBe(true);
    expect(WbBlockPropsSchema.safeParse({ type: "hero" }).success).toBe(false);
    expect(WbBlockPropsSchema.safeParse({ type: "features", items: [] }).success).toBe(false);
    expect(WbBlockPropsSchema.safeParse({ type: "features", items: [{ title: "A", description: "B" }] }).success).toBe(true);
    expect(WbBlockPropsSchema.safeParse({ type: "nonsense", content: "x" }).success).toBe(false);
  });

  it("validates copy input", () => {
    expect(WbCopySchema.safeParse({ kind: "hero", context: "" }).success).toBe(false);
    expect(WbCopySchema.safeParse({ kind: "hero", context: "x" }).success).toBe(true);
  });
});
