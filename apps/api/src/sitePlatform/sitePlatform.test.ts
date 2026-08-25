import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string>>();
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!map) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      return this.store.get(key)?.get(field) ?? null;
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    hasRealModelConfigured: () => false,
    providerHealth: () => [],
    complete: async () => { throw new Error("not configured"); },
    guardedStream: async function* () { throw new Error("not configured"); },
    applyDashboardProvider: () => {},
  },
}));
vi.mock("../emailIntel/smtp.client.js", () => ({
  sendSmtp: async () => ({ ok: false, response: null, errorCode: "SMTP_CONNECTION_FAILED", error: "refused" }),
}));
vi.mock("../db/client.js", () => ({ prisma: {} }));
vi.mock("@prisma/client", () => ({
  Role: { USER: "USER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" },
}));

import { SitePlatformService, announcementIsLive } from "./sitePlatform.service.js";

beforeEach(() => { fake.store.clear(); });

describe("Announcement", () => {
  it("is hidden when disabled or outside the window", async () => {
    const a = await SitePlatformService.updateAnnouncement({
      enabled: true,
      message: "WINDELS AI WORKFORCE • Explore AI Agents",
      startAt: "2099-01-01T00:00:00.000Z",
    }, "admin");
    expect(announcementIsLive(a)).toBe(false);
    expect(await SitePlatformService.publicAnnouncement()).toBeNull();
    await SitePlatformService.updateAnnouncement({ startAt: null, enabled: false }, "admin");
    expect(await SitePlatformService.publicAnnouncement()).toBeNull();
  });

  it("returns the live ticker when enabled", async () => {
    await SitePlatformService.updateAnnouncement({ enabled: true, message: "New AI Workforce Features Available", startAt: null, endAt: null }, "admin");
    const live = await SitePlatformService.publicAnnouncement();
    expect(live?.message).toMatch(/Workforce/i);
  });
});

describe("SEO", () => {
  it("resolves page metadata without leaking secrets", async () => {
    await SitePlatformService.updateSeo({ siteTitle: "WINDELS", googleVerification: "abc", metaDescription: "Enterprise AI workforce OS for teams." }, "sa");
    const meta = await SitePlatformService.resolvedMeta("/pricing");
    expect(meta.title).toBeTruthy();
    expect(JSON.stringify(meta)).not.toMatch(/password|secret|smtp/i);
    const xml = await SitePlatformService.sitemapXml("https://example.com");
    expect(xml).toContain("/pricing");
    const robots = await SitePlatformService.robotsTxt("https://example.com");
    expect(robots).toContain("Sitemap:");
    expect(robots).toContain("Disallow: /admin/");
  });
});

describe("SMTP", () => {
  it("never returns a stored password", async () => {
    const saved = await SitePlatformService.saveSmtp({
      active: "cpanel",
      cpanel: { host: "mail.example.com", port: 465, secure: true, username: "u", password: "super-secret-pass", fromEmail: "ops@example.com" },
    }, "sa");
    expect(saved.active).toBe("cpanel");
    expect(JSON.stringify(saved)).not.toContain("super-secret-pass");
    expect(saved.slots.find((s) => s.id === "cpanel")?.passwordSet).toBe(true);
  });

  it("does not claim a test succeeded when the connection fails", async () => {
    await SitePlatformService.saveSmtp({
      active: "external",
      external: { host: "smtp.invalid", port: 587, fromEmail: "ops@example.com" },
    }, "sa");
    const test = await SitePlatformService.testSmtp("qa@example.com");
    expect(test.ok).toBe(false);
    expect(test.sent).toBe(false);
    expect(test.error || test.reason).toBeTruthy();
  });
});

describe("Brand, pages, reviews, map", () => {
  it("applies Super Admin brand and page edits to the public payload", async () => {
    await SitePlatformService.updateBrand({ logo: "/uploads/logo.png", chatName: "WINDELS Guide" }, "sa");
    await SitePlatformService.upsertPageContent({
      path: "/about", title: "About us", lead: "Edited lead", body: "Edited body", image: "/brand/workforce-hero.png", enabled: true,
    }, "sa");
    const site = await SitePlatformService.publicSite();
    expect(site.brand.logo).toBe("/uploads/logo.png");
    expect(site.brand.chatName).toBe("WINDELS Guide");
    expect(site.pages.find((p) => p.path === "/about")?.lead).toBe("Edited lead");
    expect(JSON.stringify(site)).not.toMatch(/password|apiKeyEnc|secret/i);
  });

  it("keeps reviews illustrative and hides the map until coordinates are set", async () => {
    await SitePlatformService.saveReviews({
      reviews: [{ name: "Ada", title: "Illustrative reviewer", quote: "This is a product-story quote, not a verified customer.", image: "/reviews/reviewer-1.png" }],
    }, "sa");
    const reviews = await SitePlatformService.getReviews();
    expect(reviews[0]?.illustrative).toBe(true);
    const map = await SitePlatformService.updateMap({ enabled: true, label: "Office" }, "sa");
    expect(map.enabled).toBe(true);
    expect(map.lat).toBeNull();
    const summary = await SitePlatformService.controlSummary();
    expect(summary.mapEnabled).toBe(false);
    await SitePlatformService.updateMap({ lat: 9.0765, lng: 7.3986, city: "Abuja", country: "Nigeria" }, "sa");
    expect((await SitePlatformService.controlSummary()).mapEnabled).toBe(true);
  });
});

describe("Platform APIs", () => {
  it("never returns a stored API key and supports add/remove", async () => {
    const listed = await SitePlatformService.upsertApi({
      slot: "openai", enabled: true, apiKey: "sk-super-secret-test-key",
    }, "sa");
    expect(JSON.stringify(listed)).not.toContain("sk-super-secret-test-key");
    expect(listed.find((a) => a.slot === "openai")?.keySet).toBe(true);
    const custom = await SitePlatformService.upsertApi({
      slot: "custom-maps", label: "Internal geo", category: "custom", enabled: true, baseUrl: "https://geo.example.com", apiKey: "geo-secret",
    }, "sa");
    const row = custom.find((a) => a.label === "Internal geo");
    expect(row?.removable).toBe(true);
    expect(JSON.stringify(custom)).not.toContain("geo-secret");
    const after = await SitePlatformService.removeApi(row!.id, "sa");
    expect(after.some((a) => a.id === row!.id)).toBe(false);
  });
});

describe("Visitor chat", () => {
  it("answers from site knowledge when no AI provider is configured", async () => {
    const start = await SitePlatformService.startChat("How do I sign in?");
    expect(start.source).toBe("UNCONFIGURED");
    expect(start.reply.toLowerCase()).toMatch(/sign in|login/);
    expect(start.links.some((l) => l.href === "/auth/login")).toBe(true);
    const again = await SitePlatformService.chatMessage(start.conversationId, "What about pricing?");
    expect(again.messages.length).toBeGreaterThan(2);
    expect(again.reply.toLowerCase()).toMatch(/pricing/);
  });
});
