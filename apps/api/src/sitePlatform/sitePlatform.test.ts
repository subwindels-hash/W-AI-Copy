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
