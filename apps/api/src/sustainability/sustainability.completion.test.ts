/**
 * Session 121 — Sustainability & ESG completion tests.
 *
 * The Session 64 module had no unit suite (E2E only). This suite drives the
 * real service against FakeKv (Redis stand-in), pinning the defects Session
 * 121 exists to close:
 *
 *   - **lost writes**: the whole org ledger was one JSON string and every
 *     record was a read-modify-write, so concurrent POSTs silently lost
 *     records; storage is now one key per record behind an append-only index;
 *   - **wrong comparison windows**: YTD-this-year vs full-last-year (and
 *     all-time vs last year per source) are now same-period comparisons;
 *   - **`0` without a baseline**: changes are `null`, never `0`;
 *   - **invented ESG scores**: `92 - ytd*2.5` and hard-coded 85/88 are gone —
 *     scores are `null` with a note until an attested assessment exists;
 *   - **mixed energy readings**: `greenAi[].kwh` sums compute records only;
 *   - **no correction path**: records can now be fetched singly and deleted;
 *   - **structural zeros are named**: the rollup ships a `provenance` block;
 *   - **legacy adoption**: the Session 64 blob is adopted once, left in place,
 *     and a corrupt blob is tolerated.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const S = (await import("./sustainability.service.js")).SustainabilityService;

// Deterministic reference instant: 2026-08-06 — every test pins this so the
// same-period windows (YTD 2026 vs YTD-2025-cutoff-2026-08-06) are stable.
const NOW = new Date("2026-08-06T12:00:00Z");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

type ActivityInput = Omit<import("@windels/shared/sustainability").EsgRecordRow, "id" | "tCO2e" | "recordedAt">;

function activity(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    category: "scope1",
    activity: "Natural Gas (heating)",
    quantity: 100,
    unit: "m3",
    emissionFactorKg: 2.03,
    occurredAt: "2026-02-15T12:00:00Z",
    source: "facility-heating",
    ...overrides,
  };
}

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

// ══════════════════════════════════════════════════════════════════════════
// Storage — lost writes (the headline fix)
// ══════════════════════════════════════════════════════════════════════════

describe("record storage (per-record keys + append-only index)", () => {
  it("stores each record under its own key with the id on the index", async () => {
    const r = await S.record(ORG_A, activity({ activity: "Boiler" }));
    expect(kv.strings.get(`esg:${ORG_A}:rec:${r.id}`)).toBeTruthy();
    expect(kv.lists.get(`esg:${ORG_A}:idx`)![0]).toBe(r.id);
    // No single-blob key is ever written by the new code path.
    expect(kv.strings.has(`esg:${ORG_A}:records`)).toBe(false);
  });

  it("FIXED: concurrent records are all preserved (no read-modify-write race)", async () => {
    const writes = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        S.record(ORG_A, activity({ activity: `Concurrent ${i}`, quantity: i + 1 })),
      ),
    );
    const ids = new Set(writes.map((w) => w.id));
    expect(ids.size).toBe(25);
    const listed = await S.listRecords(ORG_A, 1000);
    expect(listed.length).toBe(25);
    // Newest first: the last write is at the head.
    expect(listed[0]!.id).toBe(writes[24]!.id);
  });

  it("caps the index at SUSTAINABILITY_MAX_RECORDS", async () => {
    for (let i = 0; i < 10010; i++) {
      await S.record(ORG_A, activity({ activity: `r${i}` }));
    }
    expect(kv.lists.get(`esg:${ORG_A}:idx`)!.length).toBe(10000);
  });

  it("keeps organizations isolated", async () => {
    await S.record(ORG_A, activity({ activity: "A's" }));
    expect(await S.listRecords(ORG_B, 1000)).toHaveLength(0);
    const b = await S.record(ORG_B, activity({ activity: "B's" }));
    expect(await S.getRecord(ORG_A, b.id)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Legacy adoption
// ══════════════════════════════════════════════════════════════════════════

describe("Session 64 blob adoption", () => {
  function seedLegacyBlob(oid: string, records: unknown[]) {
    // Seed through FakeKv's own set() so the value is wrapped like a real
    // Redis string (kv.strings is the raw Map; direct insertion would not
    // round-trip through get()).
    kv.strings.set(`esg:${oid}:records`, { value: JSON.stringify(records) });
  }

  it("adopts the legacy blob once and leaves it in place", async () => {
    seedLegacyBlob(ORG_A, [
      { id: "esg-old-1", category: "scope1", activity: "Old Boiler", quantity: 1, unit: "m3", emissionFactorKg: 2, tCO2e: 0.002, occurredAt: "2025-01-01T00:00:00Z", source: "legacy", recordedAt: "2025-01-02T00:00:00Z" },
      { id: "esg-old-2", category: "scope2", activity: "Old Grid", quantity: 2, unit: "kWh", emissionFactorKg: 0.38, tCO2e: 0.00076, occurredAt: "2025-01-03T00:00:00Z", source: "legacy", recordedAt: "2025-01-04T00:00:00Z" },
    ]);
    const first = await S.listRecords(ORG_A, 1000);
    expect(first.map((r) => r.id).sort()).toEqual(["esg-old-1", "esg-old-2"]);
    expect((kv.strings.get(`esg:${ORG_A}:imported`) as any)?.value).toBe("1");
    // The legacy string is left in place, not deleted.
    expect(kv.strings.has(`esg:${ORG_A}:records`)).toBe(true);
    // Second access does not duplicate.
    const second = await S.listRecords(ORG_A, 1000);
    expect(second).toHaveLength(2);
    // New records coexist with adopted ones.
    await S.record(ORG_A, activity({ activity: "New" }));
    expect(await S.listRecords(ORG_A, 1000)).toHaveLength(3);
  });

  it("tolerates a corrupt legacy blob and still marks adoption", async () => {
    kv.strings.set(`esg:${ORG_A}:records`, { value: "{not json" });
    expect(await S.listRecords(ORG_A, 1000)).toHaveLength(0);
    expect((kv.strings.get(`esg:${ORG_A}:imported`) as any)?.value).toBe("1");
  });

  it("adopts nothing for a fresh org and records still work", async () => {
    await S.record(ORG_A, activity());
    expect(await S.listRecords(ORG_A, 1000)).toHaveLength(1);
  });

  it("drops malformed entries from a mixed legacy blob but keeps the valid ones", async () => {
    seedLegacyBlob(ORG_A, [
      { id: "esg-ok", category: "scope1", activity: "Ok", quantity: 1, unit: "m3", emissionFactorKg: 2, tCO2e: 0.002, occurredAt: "2025-01-01T00:00:00Z", source: "legacy", recordedAt: "2025-01-02T00:00:00Z" },
      { id: "esg-broken", nonsense: true },
      "a string entry",
    ]);
    const listed = await S.listRecords(ORG_A, 1000);
    expect(listed.map((r) => r.id)).toEqual(["esg-ok"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Same-period arithmetic (the wrong-window fix)
// ══════════════════════════════════════════════════════════════════════════

describe("dashboard arithmetic (Session 121 fixes)", () => {
  it("computes YTD change against the SAME period last year, not the full year", async () => {
    // This year: 100 tCO2e in Feb. Last year: 50 tCO2e in Feb (same period) +
    // 200 tCO2e in Dec (outside the YTD window on 2026-08-06).
    await S.record(ORG_A, activity({ occurredAt: "2026-02-15T12:00:00Z", quantity: 100 }));
    await S.record(ORG_A, activity({ occurredAt: "2025-02-15T12:00:00Z", quantity: 50 }));
    await S.record(ORG_A, activity({ occurredAt: "2025-12-15T12:00:00Z", quantity: 200 }));
    const d = await S.dashboard(ORG_A, NOW);
    // Same-period baseline is 50, so the change is +100%, NOT the +40% the
    // full-year comparison (250) would have produced.
    expect(d.emissionsYtdChangePct).toBe(100);
  });

  it("returns null for the YTD change when the prior period has no records", async () => {
    await S.record(ORG_A, activity({ occurredAt: "2026-02-15T12:00:00Z", quantity: 100 }));
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.emissionsYtdChangePct).toBeNull();
  });

  it("per-source changePct is same-period and null without a baseline", async () => {
    await S.record(ORG_A, activity({ activity: "Fleet", occurredAt: "2026-03-01T00:00:00Z", quantity: 10 }));
    await S.record(ORG_A, activity({ activity: "Fleet", occurredAt: "2025-03-01T00:00:00Z", quantity: 5 }));
    await S.record(ORG_A, activity({ activity: "Fleet", occurredAt: "2025-11-01T00:00:00Z", quantity: 5 }));
    await S.record(ORG_A, activity({ activity: "New Activity", occurredAt: "2026-03-01T00:00:00Z", quantity: 7 }));
    const d = await S.dashboard(ORG_A, NOW);
    const fleet = d.emissionsBySource.find((s) => s.source === "Fleet")!;
    expect(fleet.changePct).toBe(100); // YTD vs same-period YTD (5, not 10)
    const fresh = d.emissionsBySource.find((s) => s.source === "New Activity")!;
    expect(fresh.changePct).toBeNull();
  });

  it("truncates a signed change toward zero (never exaggerates a magnitude)", async () => {
    // Prior: 1000 kg → 1.0 tCO2e. This year: 1124.6 kg → 1.1246 tCO2e.
    // Change = +12.46 % → truncation gives 12.4 (round would give 12.5 —
    // exaggerating). The negative direction: 875.4 kg → -12.46 % → -12.4.
    await S.record(ORG_A, activity({ category: "scope1", activity: "Flue", occurredAt: "2026-02-15T12:00:00Z", quantity: 1124.6, unit: "kg", emissionFactorKg: 1 }));
    await S.record(ORG_A, activity({ category: "scope1", activity: "Flue", occurredAt: "2025-02-15T12:00:00Z", quantity: 1000, unit: "kg", emissionFactorKg: 1 }));
    let d = await S.dashboard(ORG_A, NOW);
    expect(d.emissionsYtdChangePct).toBe(12.4);
    // Negative: truncation toward zero reports -12.4, never -12.5.
    const thisYearFlue = (await S.listRecords(ORG_A, 1000)).find((r) => r.activity === "Flue" && r.occurredAt.startsWith("2026"))!;
    await S.deleteRecord(ORG_A, thisYearFlue.id);
    await S.record(ORG_A, activity({ category: "scope1", activity: "Flue", occurredAt: "2026-02-15T12:00:00Z", quantity: 875.4, unit: "kg", emissionFactorKg: 1 }));
    d = await S.dashboard(ORG_A, NOW);
    expect(d.emissionsYtdChangePct).toBe(-12.4);
  });

  it("trend is null without a baseline and up/down only with same-period data", async () => {
    const d1 = await S.dashboard(ORG_A, NOW);
    expect(d1.scores.trend).toBeNull();
    await S.record(ORG_A, activity({ occurredAt: "2026-02-15T12:00:00Z", quantity: 100 }));
    await S.record(ORG_A, activity({ occurredAt: "2025-02-15T12:00:00Z", quantity: 200 }));
    const d2 = await S.dashboard(ORG_A, NOW);
    expect(d2.scores.trend).toBe("up"); // emissions down = score up
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Honest scores, greenAi, structural zeros + provenance
// ══════════════════════════════════════════════════════════════════════════

describe("dashboard honesty (Session 121)", () => {
  it("reports every ESG score as null with a note — no invented formula", async () => {
    // Even with data, the invented `92 - ytd*2.5` / 85 / 88 formula must not
    // produce numbers.
    await S.record(ORG_A, activity({ occurredAt: "2026-02-15T12:00:00Z", quantity: 1000 }));
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.scores.environmental).toBeNull();
    expect(d.scores.social).toBeNull();
    expect(d.scores.governance).toBeNull();
    expect(d.scores.overall).toBeNull();
    expect(d.scores.note).toMatch(/attested/i);
  });

  it("greenAi.kwh sums compute records only, not other scopes' readings", async () => {
    await S.record(ORG_A, activity({ category: "compute", activity: "Training", occurredAt: "2026-02-15T12:00:00Z", quantity: 1, unit: "h", emissionFactorKg: 0.24, kwh: 450 }));
    await S.record(ORG_A, activity({ category: "scope2", activity: "Purchased Electricity", occurredAt: "2026-02-15T12:00:00Z", quantity: 18000, unit: "kWh", emissionFactorKg: 0.38, kwh: 18000 }));
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.greenAi).toHaveLength(1);
    expect(d.greenAi[0]!.kwh).toBe(450); // FIXED: was 18450 before Session 121
    expect(d.greenAi[0]!.gpuHours).toBeNull();
    expect(d.greenAi[0]!.optimizedPct).toBeNull();
  });

  it("greenAi is empty when no compute records exist", async () => {
    await S.record(ORG_A, activity({ occurredAt: "2026-02-15T12:00:00Z", quantity: 100 }));
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.greenAi).toEqual([]);
  });

  it("emissionsBySource totals still sum to the all-time rollup total", async () => {
    await S.record(ORG_A, activity({ activity: "A", occurredAt: "2026-02-15T12:00:00Z", quantity: 100 }));
    await S.record(ORG_A, activity({ activity: "B", occurredAt: "2025-02-15T12:00:00Z", quantity: 50 }));
    const d = await S.dashboard(ORG_A, NOW);
    const bySource = d.emissionsBySource.reduce((n, s) => n + s.tCO2e, 0);
    expect(Math.abs(bySource - d.emissionsTotalTCO2e)).toBeLessThan(0.001);
  });

  it("ships provenance naming the structural zeros and the measured fields", async () => {
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.provenance).toBeTruthy();
    const entries = d.provenance!.entries;
    expect(entries.some((e) => e.field === "emissionsTotalTCO2e" && e.basis === "measured")).toBe(true);
    expect(entries.some((e) => e.field === "scores" && e.basis === "not_assessed")).toBe(true);
    expect(entries.some((e) => e.field === "waterMl" && e.basis === "structural_zero")).toBe(true);
    expect(entries.some((e) => e.field === "netZeroTargetYear" && e.basis === "structural_zero")).toBe(true);
    expect(d.provenance!.note.length).toBeGreaterThan(20);
  });

  // Session 168 — this test previously asserted `toBe(0)` on all five fields,
  // under the title "keeps the structural zeros for contract compatibility".
  // It was a test that pinned a defect in place: Session 121 correctly labelled
  // these fields structural_zero in `provenance` but left the VALUES at 0, and
  // this test then made the 0 load-bearing. A dashboard renders 0 as a measured
  // 0% recycling rate and a net-zero target of the year 0. Unmeasured is null.
  it("reports unmeasured ESG fields as null, never 0", async () => {
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.energyRenewablePct).toBeNull();
    expect(d.waterMl).toBeNull();
    expect(d.wasteRecycledPct).toBeNull();
    expect(d.offsetsPurchasedT).toBeNull();
    expect(d.netZeroTargetYear).toBeNull();
    // Empty collections stay empty arrays: "no rows" is honestly expressible
    // as [], unlike "no measurement" as 0.
    expect(d.resources).toEqual([]);
    expect(d.suppliers).toEqual([]);
    expect(d.reportingFrameworks).toEqual([]);
  });

  it("reports per-month renewable share and cost as null, never 0", async () => {
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.energySeries).toHaveLength(12);
    expect(d.energySeries.every((m) => m.renewablePct === null)).toBe(true);
    expect(d.energySeries.every((m) => m.costUsd === null)).toBe(true);
  });

  it("records an empty dashboard honestly for a fresh org", async () => {
    const d = await S.dashboard(ORG_A, NOW);
    expect(d.emissionsTotalTCO2e).toBe(0);
    expect(d.emissionsYtdChangePct).toBeNull();
    expect(d.emissionsBySource).toEqual([]);
    expect(d.energySeries).toHaveLength(12);
    expect(d.energySeries.every((m) => m.kwh === 0)).toBe(true);
    expect(d.scores.overall).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Records surface + correction path
// ══════════════════════════════════════════════════════════════════════════

describe("record surface (Session 121 additions)", () => {
  it("computes tCO2e = quantity × factor ÷ 1000 with the disclosed factor", async () => {
    const r = await S.record(ORG_A, activity({ quantity: 2400, emissionFactorKg: 2.03 }));
    expect(r.tCO2e).toBe(4.872); // 2400 * 2.03 / 1000
    expect(r.id.startsWith("esg-")).toBe(true);
  });

  it("getRecord returns the record and null for unknown ids", async () => {
    const r = await S.record(ORG_A, activity());
    expect((await S.getRecord(ORG_A, r.id))!.id).toBe(r.id);
    expect(await S.getRecord(ORG_A, "esg-nope")).toBeNull();
  });

  it("deleteRecord removes the record and its index entry", async () => {
    const r = await S.record(ORG_A, activity());
    const r2 = await S.record(ORG_A, activity({ activity: "Other" }));
    expect((await S.deleteRecord(ORG_A, r.id))!.deleted).toBe(true);
    expect(await S.getRecord(ORG_A, r.id)).toBeNull();
    const listed = await S.listRecords(ORG_A, 1000);
    expect(listed.map((x) => x.id)).not.toContain(r.id);
    expect(listed.map((x) => x.id)).toContain(r2.id);
    expect(await S.deleteRecord(ORG_A, r.id)).toBeNull();
  });

  it("listRecords returns newest first and honours the limit", async () => {
    await S.record(ORG_A, activity({ activity: "First" }));
    await S.record(ORG_A, activity({ activity: "Second" }));
    await S.record(ORG_A, activity({ activity: "Third" }));
    const all = await S.listRecords(ORG_A, 1000);
    expect(all.map((r) => r.activity)).toEqual(["Third", "Second", "First"]);
    expect((await S.listRecords(ORG_A, 2)).map((r) => r.activity)).toEqual(["Third", "Second"]);
  });

  it("dashboard excludes deleted records", async () => {
    const r = await S.record(ORG_A, activity({ occurredAt: "2026-02-15T12:00:00Z", quantity: 100 }));
    const before = await S.dashboard(ORG_A, NOW);
    expect(before.emissionsTotalTCO2e).toBeGreaterThan(0);
    await S.deleteRecord(ORG_A, r.id);
    const after = await S.dashboard(ORG_A, NOW);
    expect(after.emissionsTotalTCO2e).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — Zod + demo gating
// ══════════════════════════════════════════════════════════════════════════

describe("shared sustainability schemas", () => {
  it("accepts a valid activity body with an optional kwh", async () => {
    const shared = await import("@windels/shared/sustainability");
    const ok = shared.SustainabilityActivitySchema.parse({
      category: "compute", activity: "Training", quantity: 2, unit: "h",
      emissionFactorKg: 0.24, occurredAt: "2026-08-06T00:00:00Z", source: "mlops", kwh: 450,
    });
    expect(ok.kwh).toBe(450);
    const noKwh = shared.SustainabilityActivitySchema.parse({
      category: "scope1", activity: "Boiler", quantity: 1, unit: "m3",
      emissionFactorKg: 2.03, occurredAt: "2026-08-06T00:00:00Z", source: "site",
    });
    expect(noKwh.kwh).toBeUndefined();
  });

  it("rejects bad categories, non-positive quantities and non-datetime occurredAt", async () => {
    const shared = await import("@windels/shared/sustainability");
    expect(shared.SustainabilityActivitySchema.safeParse({
      category: "scope4", activity: "x", quantity: 1, unit: "m3",
      emissionFactorKg: 1, occurredAt: "2026-08-06T00:00:00Z", source: "s",
    }).success).toBe(false);
    expect(shared.SustainabilityActivitySchema.safeParse({
      category: "scope1", activity: "x", quantity: 0, unit: "m3",
      emissionFactorKg: 1, occurredAt: "2026-08-06T00:00:00Z", source: "s",
    }).success).toBe(false);
    expect(shared.SustainabilityActivitySchema.safeParse({
      category: "scope1", activity: "x", quantity: 1, unit: "m3",
      emissionFactorKg: 1, occurredAt: "not-a-date", source: "s",
    }).success).toBe(false);
  });

  it("record id schema bounds the id", async () => {
    const shared = await import("@windels/shared/sustainability");
    expect(shared.SustainabilityRecordIdSchema.parse({ id: "esg-abc" }).id).toBe("esg-abc");
    expect(shared.SustainabilityRecordIdSchema.safeParse({ id: "" }).success).toBe(false);
  });
});
