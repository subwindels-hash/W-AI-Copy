/**
 * Session 200 — Extension Registry lifecycle tests (first dedicated suite).
 *
 * The extensions module shipped without a dedicated test file, yet it owns a
 * full dev→validation→security→test→approval→publish→install→enable→retire
 * state machine with strict transition rules. This suite exercises the real
 * service against an in-memory Redis fake (no network):
 *   - register mints NO fake social proof (0 installs/stars/rating/reviews)
 *   - the ALLOWED_TRANSITIONS state machine accepts valid moves & rejects invalid
 *   - install/uninstall/enable/disable and their status/decoration effects
 *   - install is gated on a publish-ready status
 *   - reviews recompute ratingAvg honestly and are clamped 1–5
 *   - version releases, recent-install log, counts, pending-review count
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any> = {};
vi.mock("../db/redis.js", () => ({ redisCmd: {
  get: vi.fn(async (k: string) => store[k] ?? null),
  set: vi.fn(async (k: string, v: any) => { store[k] = v; return "OK"; }),
  del: vi.fn(async (k: string) => { delete store[k]; return 1; }),
  sadd: vi.fn(async (k: string, m: string) => { store[k] = Array.from(new Set([...(store[k] ?? []), m])); return 1; }),
  smembers: vi.fn(async (k: string) => store[k] ?? []),
  srem: vi.fn(async (k: string, m: string) => { store[k] = (store[k] ?? []).filter((x: string) => x !== m); return 1; }),
  hget: vi.fn(async (k: string, f: string) => store[`${k}::${f}`] ?? null),
  hset: vi.fn(async (k: string, f: string, v: any) => { store[`${k}::${f}`] = v; return 1; }),
  hdel: vi.fn(async (k: string, f: string) => { delete store[`${k}::${f}`]; return 1; }),
  hkeys: vi.fn(async (k: string) => Object.keys(store).filter((key) => key.startsWith(`${k}::`)).map((key) => key.slice(k.length + 2))),
  lpush: vi.fn(async (k: string, v: any) => { store[k] = [v, ...(store[k] ?? [])]; return store[k].length; }),
  ltrim: vi.fn(async (k: string, a: number, b: number) => { store[k] = (store[k] ?? []).slice(a, b + 1); }),
  lrange: vi.fn(async (k: string, a: number, b: number) => (store[k] ?? []).slice(a, b === -1 ? undefined : b + 1)),
} }));

import { ExtensionRegistryService as ER } from "./registry.service.js";

let seq = 0;
function reg(over: Partial<any> = {}) {
  seq++;
  return ER.register({
    slug: over.slug ?? `ext-${seq}`,
    name: over.name ?? `Ext ${seq}`,
    kind: over.kind ?? "skill",
    author: "tester",
    description: over.description ?? "a test extension",
    tagline: "tag",
    version: "1.0.0",
    visibility: "public",
    category: over.category ?? "productivity",
    tags: over.tags ?? ["a", "b"],
    icon: "🧩",
    color: "azure",
    license: "MIT",
    minPlatformVersion: "0.28.0",
    sizeKb: 10,
    permissions: [],
    certified: "community",
    sliceNumber: 1,
    ...over,
  } as any);
}

/** Walk an extension all the way to `published` through the legal chain. */
async function publish(id: string) {
  for (const to of ["submitted", "validating", "security_review", "testing", "approved", "published"] as const) {
    await ER.transition(id, to);
  }
}

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe("register — no fabricated social proof", () => {
  it("starts a new extension in draft/dev with zeroed adoption metrics", async () => {
    const e = await reg();
    expect(e.status).toBe("draft");
    expect(e.lifecycleStage).toBe("dev");
    expect(e.installCount).toBe(0);
    expect(e.stars).toBe(0);
    expect(e.ratingAvg).toBe(0);
    expect(e.reviewCount).toBe(0);
    expect(e.versions).toHaveLength(1);
    expect(e.versions[0].version).toBe("1.0.0");
    expect(await ER.getBySlug(e.slug)).toMatchObject({ id: e.id });
  });
});

describe("lifecycle state machine", () => {
  it("accepts the full legal chain to published", async () => {
    const e = await reg();
    await publish(e.id);
    const after = await ER.get(e.id);
    expect(after?.status).toBe("published");
    expect(after?.lifecycleStage).toBe("deploy");
  });

  it("rejects an illegal transition", async () => {
    const e = await reg(); // draft
    await expect(ER.transition(e.id, "published")).rejects.toThrow(/Invalid transition/);
    await expect(ER.transition(e.id, "enabled")).rejects.toThrow(/Invalid transition/);
  });

  it("supports rejection and re-drafting", async () => {
    const e = await reg();
    await ER.transition(e.id, "submitted");
    await ER.transition(e.id, "rejected");
    expect((await ER.get(e.id))?.status).toBe("rejected");
    await ER.transition(e.id, "draft");
    expect((await ER.get(e.id))?.status).toBe("draft");
  });

  it("returns null when transitioning an unknown extension", async () => {
    expect(await ER.transition("nope", "submitted")).toBeNull();
  });
});

describe("install / uninstall / enable / disable", () => {
  it("refuses to install an unpublished extension", async () => {
    const e = await reg(); // draft
    await expect(ER.install(e.id)).rejects.toThrow(/Cannot install/);
  });

  it("installs a published extension, logs it, and decorates list state", async () => {
    const e = await reg();
    await publish(e.id);
    const installed = await ER.install(e.id);
    expect(installed?.status).toBe("installed");
    expect(installed?.installCount).toBe(1);
    expect(await ER.isInstalled(e.id)).toBe(true);

    const listed = (await ER.list()).find((x) => x.id === e.id);
    expect(listed?.installed).toBe(true);
    expect(listed?.enabled).toBe(true);

    const recent = await ER.recentInstalls();
    expect(recent[0]?.id).toBe(e.id);
  });

  it("toggles enabled/disabled and reflects it in status", async () => {
    const e = await reg();
    await publish(e.id);
    await ER.install(e.id);
    expect((await ER.setEnabled(e.id, false))?.status).toBe("disabled");
    expect((await ER.setEnabled(e.id, true))?.status).toBe("enabled");
  });

  it("refuses to enable an extension that is not installed", async () => {
    const e = await reg();
    await publish(e.id);
    await expect(ER.setEnabled(e.id, true)).rejects.toThrow(/not installed/);
  });

  it("uninstall clears install state and returns status to published", async () => {
    const e = await reg();
    await publish(e.id);
    await ER.install(e.id);
    const un = await ER.uninstall(e.id);
    expect(un?.status).toBe("published");
    expect(await ER.isInstalled(e.id)).toBe(false);
  });
});

describe("reviews — honest rating math", () => {
  it("clamps ratings to 1–5 and recomputes the average", async () => {
    const e = await reg();
    await ER.review(e.id, "u1", 9, "great");   // clamps to 5
    await ER.review(e.id, "u2", 0, "meh");     // clamps to 1
    const after = await ER.get(e.id);
    expect(after?.reviewCount).toBe(2);
    expect(after?.ratingAvg).toBe(3); // (5 + 1) / 2
    expect(after?.reviews[0].rating).toBeGreaterThanOrEqual(1);
    expect(after?.reviews[0].rating).toBeLessThanOrEqual(5);
  });
});

describe("versions & aggregates", () => {
  it("releaseVersion prepends the new version and updates the current pointer", async () => {
    const e = await reg();
    await ER.releaseVersion(e.id, "1.1.0", "second release");
    const after = await ER.get(e.id);
    expect(after?.version).toBe("1.1.0");
    expect(after?.versions[0].version).toBe("1.1.0");
    expect(after?.versions.length).toBe(2);
  });

  it("countByKind and pendingReviewCount reflect real records", async () => {
    const s = await reg({ kind: "skill" });
    const a = await reg({ kind: "agent" });
    await ER.transition(a.id, "submitted"); // now pending review
    const counts = await ER.countByKind();
    expect(counts.skill).toBeGreaterThanOrEqual(1);
    expect(counts.agent).toBeGreaterThanOrEqual(1);
    expect(await ER.pendingReviewCount()).toBe(1);
    void s;
  });

  it("list filters by kind, category and free-text query", async () => {
    await reg({ kind: "skill", category: "productivity", name: "Alpha Skill", tags: ["writing"] });
    await reg({ kind: "agent", category: "sales", name: "Beta Agent", tags: ["outreach"] });
    expect((await ER.list({ kind: "skill" })).every((x) => x.kind === "skill")).toBe(true);
    expect((await ER.list({ category: "sales" })).every((x) => x.category === "sales")).toBe(true);
    expect((await ER.list({ q: "outreach" })).some((x) => x.name === "Beta Agent")).toBe(true);
  });
});
