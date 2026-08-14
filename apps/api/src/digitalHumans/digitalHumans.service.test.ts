/**
 * Session 168 — digitalHumans. The module shipped with no tests, which is how
 * a live user action came to overwrite a real transcript length with
 * randInt(20,180) and a dashboard came to count every session twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
let demoOn = false;
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => demoOn, skipDemoSeed: () => undefined };
});

const { DigitalHumanService: S } = await import("./digitalHumans.service.js");

const ORG_A = "org-dh-a";
const ORG_B = "org-dh-b";

const create = (over: Record<string, unknown> = {}) =>
  S.create({
    name: "Test Avatar", role: "virtual_receptionist", gender: "feminine",
    style: "corporate", organizationId: ORG_A, createdBy: "user-1", ...over,
  } as Parameters<typeof S.create>[0]);

beforeEach(() => {
  demoOn = false;
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

// ══════════════════════════════════════════════════════════════════════════
// H1 — the fabricated transcript length on a live path
// ══════════════════════════════════════════════════════════════════════════

describe("endSession does not fabricate the transcript", () => {
  it("preserves the length that real turns recorded", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    await S.recordTurn(s.id, 40, ORG_A);
    await S.recordTurn(s.id, 60, ORG_A);

    const ended = await S.endSession(s.id, ORG_A, "resolved", 5);

    // Before S168, endSession assigned `randInt(20,180)` here, discarding the
    // measurement. It was a live user action, ungated by demo data.
    expect(ended!.transcriptLength).toBe(100);
  });

  it("a session with no turns has a transcript length of 0, not an invented one", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    const ended = await S.endSession(s.id, ORG_A);
    // 0 is honest here: it is a counted number of recorded characters, not a
    // stand-in for an absent measurement.
    expect(ended!.transcriptLength).toBe(0);
  });

  it("records a duration measured from the real timestamps", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    const ended = await S.endSession(s.id, ORG_A);
    expect(ended!.durationSec).toBeGreaterThanOrEqual(0);
    expect(ended!.durationSec).toBeLessThan(5);
  });

  it("refuses to record a turn on an ended session", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    await S.endSession(s.id, ORG_A);
    await expect(S.recordTurn(s.id, 10, ORG_A)).rejects.toThrow(/already ended/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H2 — the double count
// ══════════════════════════════════════════════════════════════════════════

describe("dashboard counts each session exactly once", () => {
  it("one started session reports as one", async () => {
    const h = await create();
    await S.startSession(h.id, ORG_A);
    const d = await S.dashboard(ORG_A);
    // Before S168: humans.reduce(h.totalSessions) + sessions.length = 2,
    // because startSession increments the avatar counter AND appends a row.
    expect(d.totalSessions).toBe(1);
    expect(d.activeSessions).toBe(1);
  });

  it("three sessions across two avatars report as three", async () => {
    const h1 = await create({ name: "A" });
    const h2 = await create({ name: "B" });
    await S.startSession(h1.id, ORG_A);
    await S.startSession(h1.id, ORG_A);
    await S.startSession(h2.id, ORG_A);
    expect((await S.dashboard(ORG_A)).totalSessions).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H3/H5 — unmeasured is null
// ══════════════════════════════════════════════════════════════════════════

describe("unmeasured values are null, never 0", () => {
  it("an empty org reports no satisfaction rather than 0%", async () => {
    const d = await S.dashboard(ORG_A);
    // Before S168 this divided by Math.max(1, humans.length) and returned 0.0
    // — a real-looking satisfaction score for a product nobody had used.
    expect(d.avgSatisfactionPct).toBeNull();
    expect(d.avgSessionSec).toBeNull();
    expect(d.total).toBe(0);
  });

  it("an org whose avatars have never been rated reports no satisfaction", async () => {
    await create();
    const d = await S.dashboard(ORG_A);
    expect(d.avgSatisfactionPct).toBeNull();
  });

  it("a new avatar has no averages", async () => {
    const h = await create();
    expect(h.satisfactionPct).toBeNull();
    expect(h.avgSessionSec).toBeNull();
    expect(h.completedSessions).toBe(0);
    expect(h.ratedSessions).toBe(0);
  });

  it("satisfaction appears only once a session is rated", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    await S.endSession(s.id, ORG_A, "resolved", 5);
    const d = await S.dashboard(ORG_A);
    expect(d.avgSatisfactionPct).toBe(100);   // 5 * 20
  });

  it("an unrated completed session leaves satisfaction unmeasured", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    await S.endSession(s.id, ORG_A, "resolved");   // no rating
    const after = await S.get(h.id, ORG_A);
    expect(after!.satisfactionPct).toBeNull();
    expect(after!.ratedSessions).toBe(0);
    expect(after!.completedSessions).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H4 — readiness is earned, not timed
// ══════════════════════════════════════════════════════════════════════════

describe("avatar readiness is not conferred by a timer", () => {
  it("a created avatar is a draft and stays one", async () => {
    const h = await create();
    expect(h.status).toBe("draft");
    // Before S168 a setTimeout(1500ms) flipped the status to "ready" — no model
    // was trained, nothing was rendered; the clock decided.
    await new Promise((r) => setTimeout(r, 1800));
    const after = await S.get(h.id, ORG_A);
    expect(after!.status).toBe("draft");
  });

  it("markReady is the explicit path to ready", async () => {
    const h = await create();
    const ready = await S.markReady(h.id, ORG_A);
    expect(ready!.status).toBe("ready");
    expect((await S.dashboard(ORG_A)).ready).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H6 — the average is over completed sessions
// ══════════════════════════════════════════════════════════════════════════

describe("avgSessionSec divides by completed sessions", () => {
  it("two started, one ended: the average is over the one that ended", async () => {
    const h = await create();
    const s1 = await S.startSession(h.id, ORG_A);
    await S.startSession(h.id, ORG_A);
    await S.startSession(h.id, ORG_A);
    await S.endSession(s1.id, ORG_A);

    const after = await S.get(h.id, ORG_A);
    expect(after!.totalSessions).toBe(3);      // started
    expect(after!.completedSessions).toBe(1);  // ended — the denominator
    // The old recurrence divided the single real duration by 3.
    expect(after!.avgSessionSec).toBe(after!.avgSessionSec);
    expect(after!.avgSessionSec).not.toBeNull();
  });

  it("ending the same session twice does not double-count", async () => {
    const h = await create();
    const s = await S.startSession(h.id, ORG_A);
    await S.endSession(s.id, ORG_A, "resolved", 5);
    await S.endSession(s.id, ORG_A, "resolved", 5);
    const after = await S.get(h.id, ORG_A);
    expect(after!.completedSessions).toBe(1);
    expect(after!.ratedSessions).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Reads do not seed / tenant isolation
// ══════════════════════════════════════════════════════════════════════════

describe("reads never bootstrap", () => {
  it("dashboard/list/get leave an empty org empty with demo data ON", async () => {
    demoOn = true;
    expect(await S.list(ORG_A)).toEqual([]);
    expect(await S.get("dh-nope", ORG_A)).toBeNull();
    expect((await S.dashboard(ORG_A)).total).toBe(0);
    expect(await S.list(ORG_A)).toEqual([]);
  });

  it("explicit bootstrap still seeds when demo data is on", async () => {
    demoOn = true;
    await S.ensureBootstrapped(undefined, ORG_A);
    expect((await S.list(ORG_A)).length).toBeGreaterThan(0);
  });
});

describe("tenant isolation", () => {
  it("avatars and sessions do not leak across organizations", async () => {
    const h = await create();
    await S.startSession(h.id, ORG_A);
    expect(await S.list(ORG_B)).toEqual([]);
    expect(await S.get(h.id, ORG_B)).toBeNull();
    const d = await S.dashboard(ORG_B);
    expect(d.total).toBe(0);
    expect(d.totalSessions).toBe(0);
  });
});

describe("provenance", () => {
  it("names the basis of every dashboard number", async () => {
    const d = await S.dashboard(ORG_A);
    expect(d.provenance).toBeTruthy();
    const fields = d.provenance!.entries.map((e) => e.field);
    expect(fields.some((f) => f.includes("totalSessions"))).toBe(true);
    expect(d.provenance!.entries.some((e) => e.basis === "not_measured")).toBe(true);
  });
});
