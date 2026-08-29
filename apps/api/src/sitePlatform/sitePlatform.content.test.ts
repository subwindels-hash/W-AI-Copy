/**
 * Session 200 — deeper Site Platform coverage.
 *
 * The Session-89 suite covers announcement/SEO/SMTP-masking/brand/APIs/chat
 * happy paths. This suite hardens the surfaces left unverified: per-page SEO
 * precedence in resolvedMeta, sitemap/robots generation branches, SMTP
 * credential encryption round-trip + the email-send gate, media upload
 * validation/round-trip + slot→brand linking, and announcement window edges.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake, sendSmtpMock } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string>>();
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!map) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) { return this.store.get(key)?.get(field) ?? null; }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
  }
  return { fake: new FakeRedis(), sendSmtpMock: vi.fn() };
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
vi.mock("../emailIntel/smtp.client.js", () => ({ sendSmtp: sendSmtpMock }));
vi.mock("../db/client.js", () => ({ prisma: {} }));
vi.mock("@prisma/client", () => ({ Role: { USER: "USER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" } }));

import { SitePlatformService as SP, announcementIsLive } from "./sitePlatform.service.js";

beforeEach(() => { fake.store.clear(); sendSmtpMock.mockReset(); });

describe("announcement window logic", () => {
  it("is hidden after endAt has passed", () => {
    const a = { enabled: true, message: "hi", startAt: null, endAt: "2000-01-01T00:00:00.000Z" } as any;
    expect(announcementIsLive(a)).toBe(false);
  });
  it("is hidden when the message is blank even if enabled", () => {
    expect(announcementIsLive({ enabled: true, message: "   ", startAt: null, endAt: null } as any)).toBe(false);
  });
  it("is live within an open-ended window", () => {
    expect(announcementIsLive({ enabled: true, message: "live", startAt: null, endAt: null } as any)).toBe(true);
  });
});

describe("page SEO precedence & catalog fallback", () => {
  it("resolvedMeta prefers a per-page override, then falls back to site defaults", async () => {
    await SP.updateSeo({ siteTitle: "WINDELS", metaDescription: "site-level description" }, "sa");
    await SP.upsertPageSeo({ path: "/pricing", title: "Pricing • WINDELS", metaDescription: "page-level pricing copy" }, "sa");

    const overridden = await SP.resolvedMeta("/pricing");
    expect(overridden.title).toBe("Pricing • WINDELS");
    expect(overridden.description).toBe("page-level pricing copy");

    // A path with no per-page override falls back to the site title/description.
    const fallback = await SP.resolvedMeta("/some-unknown-path");
    expect(fallback.title).toBe("WINDELS");
    expect(fallback.description).toBe("site-level description");
  });

  it("normalizes the stored path and lists custom pages alongside the catalog", async () => {
    await SP.upsertPageSeo({ path: "/careers/", title: "Careers", metaDescription: "Join us" }, "sa");
    const list = await SP.listPageSeo();
    const careers = list.find((p) => p.path === "/careers");
    expect(careers?.title).toBe("Careers");
    // The catalog defaults are still present (not clobbered by the custom page).
    expect(list.length).toBeGreaterThan(1);
  });

  it("includes a custom page in the generated sitemap", async () => {
    await SP.upsertPageSeo({ path: "/careers", title: "Careers", metaDescription: "Join us" }, "sa");
    const xml = await SP.sitemapXml("https://example.com");
    expect(xml).toContain("<loc>https://example.com/careers</loc>");
    expect(xml).toContain("<?xml");
  });
});

describe("robots.txt branches", () => {
  it("disallows everything when the site is set to noindex", async () => {
    await SP.updateSeo({ robots: "noindex,nofollow" }, "sa");
    const robots = await SP.robotsTxt("https://example.com");
    expect(robots).toContain("Disallow: /\n");
    expect(robots).not.toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("allows crawling with app/admin carve-outs by default", async () => {
    const robots = await SP.robotsTxt("https://example.com");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toContain("Disallow: /app/");
  });
});

describe("SMTP credentials — encryption round-trip & send gate", () => {
  it("decrypts the stored password only through activeSmtpCredentials (never in the public view)", async () => {
    const publicView = await SP.saveSmtp({
      active: "cpanel",
      cpanel: { host: "mail.example.com", port: 465, secure: true, username: "u", password: "top-secret-xyz", fromEmail: "ops@example.com" },
    }, "sa");
    expect(JSON.stringify(publicView)).not.toContain("top-secret-xyz");

    const creds = await SP.activeSmtpCredentials();
    expect(creds?.host).toBe("mail.example.com");
    expect(creds?.password).toBe("top-secret-xyz"); // round-trips via decrypt()
    expect(creds?.provider).toBe("cpanel");
  });

  it("returns null active credentials when no host/port configured", async () => {
    expect(await SP.activeSmtpCredentials()).toBeNull();
  });

  it("sendEmail reports SMTP_NOT_CONFIGURED (sent:false) and never claims success when unconfigured", async () => {
    const res = await SP.sendEmail({ to: "a@b.com", subject: "x", text: "y" });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("SMTP_NOT_CONFIGURED");
    expect(sendSmtpMock).not.toHaveBeenCalled();
  });

  it("sends through the SMTP client with the decrypted credentials once configured", async () => {
    sendSmtpMock.mockResolvedValue({ ok: true, response: "250 OK", errorCode: null, error: null });
    await SP.saveSmtp({
      active: "cpanel",
      cpanel: { host: "mail.example.com", port: 465, secure: true, username: "u", password: "pw-123", fromEmail: "ops@example.com" },
    }, "sa");
    const res = await SP.sendEmail({ to: "dest@example.com", subject: "Hi", text: "Body" });
    expect(res.sent).toBe(true);
    expect(sendSmtpMock).toHaveBeenCalledTimes(1);
    const arg = sendSmtpMock.mock.calls[0][0];
    expect(arg.password).toBe("pw-123");
    expect(arg.to).toEqual(["dest@example.com"]);
    expect(arg.secure).toBe(true);
  });

  it("sendTemplate builds a password_reset body containing the reset URL", async () => {
    sendSmtpMock.mockResolvedValue({ ok: true, response: "250 OK", errorCode: null, error: null });
    await SP.saveSmtp({
      active: "external",
      external: { host: "smtp.example.com", port: 587, username: "u", password: "pw", fromEmail: "ops@example.com" },
    }, "sa");
    await SP.sendTemplate("password_reset", "user@example.com", { resetUrl: "https://app/reset?t=abc" });
    const arg = sendSmtpMock.mock.calls[0][0];
    expect(arg.subject).toMatch(/reset/i);
    expect(arg.text).toContain("https://app/reset?t=abc");
  });

  it("surfaces a connection failure as ok:false without claiming it was sent", async () => {
    sendSmtpMock.mockResolvedValue({ ok: false, response: null, errorCode: "SMTP_CONNECTION_FAILED", error: "refused" });
    await SP.saveSmtp({
      active: "external",
      external: { host: "smtp.invalid", port: 587, fromEmail: "ops@example.com" },
    }, "sa");
    const res = await SP.sendEmail({ to: "a@b.com", subject: "x", text: "y" });
    expect(res.ok).toBe(false);
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("SMTP_CONNECTION_FAILED");
  });
});

describe("media upload & retrieval", () => {
  // A minimal but >32-byte base64 payload.
  const payload = Buffer.from("x".repeat(64)).toString("base64");

  it("stores an uploaded image, links it to its brand slot, and serves it back", async () => {
    const up = await SP.uploadMedia({ slot: "logo", mime: "image/png", dataBase64: payload }, "sa");
    expect(up.url).toBe(`/api/v1/site/media/${up.id}`);
    // slot linking updated the brand logo to the media URL
    const brand = await SP.getBrand();
    expect(brand.logo).toBe(up.url);
    // retrievable as a buffer with the right mime
    const got = await SP.getMedia(up.id);
    expect(got?.mime).toBe("image/png");
    expect(Buffer.isBuffer(got?.buffer)).toBe(true);
    expect(got!.buffer.length).toBe(64);
  });

  it("accepts a data-URL prefixed payload (strips the prefix)", async () => {
    const up = await SP.uploadMedia({ slot: "hero", mime: "image/png", dataBase64: `data:image/png;base64,${payload}` }, "sa");
    const got = await SP.getMedia(up.id);
    expect(got!.buffer.length).toBe(64);
  });

  it("rejects an empty image", async () => {
    await expect(SP.uploadMedia({ slot: "logo", mime: "image/png", dataBase64: Buffer.from("x").toString("base64") }, "sa"))
      .rejects.toMatchObject({ code: "INVALID" });
  });

  it("rejects an over-size image (>1.2MB)", async () => {
    const big = Buffer.alloc(1_300_000, 1).toString("base64");
    await expect(SP.uploadMedia({ slot: "logo", mime: "image/png", dataBase64: big }, "sa"))
      .rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("getMedia returns null for an unknown id", async () => {
    expect(await SP.getMedia("nope")).toBeNull();
  });
});

describe("image slots → brand mapping", () => {
  it("mirrors known slots onto the brand payload", async () => {
    await SP.setImageSlot("favicon", "/uploads/fav.ico", "sa");
    await SP.setImageSlot("workforceHero", "/uploads/wf.png", "sa");
    const brand = await SP.getBrand();
    expect(brand.favicon).toBe("/uploads/fav.ico");
    expect(brand.workforceHero).toBe("/uploads/wf.png");
    const images = await SP.getImages();
    expect(images.favicon).toBe("/uploads/fav.ico");
  });

  it("rejects a blank image slot", async () => {
    await expect(SP.setImageSlot("  ", "/x.png", "sa")).rejects.toMatchObject({ code: "INVALID" });
  });
});

describe("platform API overlay masking on custom slots", () => {
  it("stores a key encrypted and never returns it, and removeApi is idempotently gone", async () => {
    const listed = await SP.upsertApi({ slot: "custom-x", label: "Custom X", category: "custom", enabled: true, baseUrl: "https://x.example", apiKey: "sekret-key-123" }, "sa");
    const row = listed.find((a) => a.label === "Custom X");
    expect(row?.keySet).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("sekret-key-123");
    const after = await SP.removeApi(row!.id, "sa");
    expect(after.some((a) => a.id === row!.id)).toBe(false);
    await expect(SP.removeApi(row!.id, "sa")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
