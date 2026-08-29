/**
 * Session 26 — Engineering: technical-debt register.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `create()` carries an explicit warning in its own source:
 *
 *   // Effort is a human estimate and churn is derived from VCS history —
 *   // both were invented here (2-24h, 10-90) and then ranked debt items.
 *
 * i.e. this module used to fabricate the two numbers that drive the hotspot
 * ranking, so teams were prioritising refactors against made-up figures. The
 * fix was to leave them `undefined` unless supplied. The module inventory
 * reported `tests=0`, so nothing stopped a future "sensible default" from
 * quietly restoring the behaviour.
 *
 * These cases pin the de-faked contract:
 *
 *   - an unestimated item keeps effort/churn undefined — no invented numbers
 *   - the effort rollup counts only estimated items
 *   - severity/category/status rollups reflect real records
 *   - trend is derived from what was added vs resolved, not asserted
 *
 * Redis is substituted with FakeKv; no infrastructure required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { TechDebtService } = await import("./techDebt.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("no invented estimates", () => {
  it("leaves effort and churn undefined when the caller supplied none", async () => {
    const item = await TechDebtService.create({ title: "Split god object" });

    // The whole point of the de-faking pass: an unestimated item must stay
    // unestimated. A plausible-looking number here would be indistinguishable
    // from a real engineering estimate once rendered.
    expect(item.estimatedEffortHours).toBeUndefined();
    expect(item.churnScore).toBeUndefined();
  });

  it("preserves estimates that were genuinely supplied", async () => {
    const item = await TechDebtService.create({
      title: "Replace deprecated client",
      estimatedEffortHours: 12,
      churnScore: 40,
    });
    expect(item.estimatedEffortHours).toBe(12);
    expect(item.churnScore).toBe(40);
  });

  it("excludes unestimated items from the effort rollup", async () => {
    await TechDebtService.create({ title: "estimated", estimatedEffortHours: 8 });
    await TechDebtService.create({ title: "not estimated" });

    const s = await TechDebtService.summary();
    // 8, not 8 + some default for the second item.
    expect(s.totalEffortHours).toBe(8);
    expect(s.totalItems).toBe(2);
  });
});

describe("record keeping", () => {
  it("assigns sequential, human-readable keys", async () => {
    const a = await TechDebtService.create({ title: "first" });
    const b = await TechDebtService.create({ title: "second" });
    expect(a.key).toBe("DEBT-001");
    expect(b.key).toBe("DEBT-002");
  });

  it("applies sane defaults without inventing measurements", async () => {
    const item = await TechDebtService.create({});
    expect(item.category).toBe("code");
    expect(item.severity).toBe("medium");
    expect(item.status).toBe("open");
    expect(item.owner).toBe("tbd");        // explicitly unassigned, not a name
    expect(item.estimatedEffortHours).toBeUndefined();
  });

  it("lists created items", async () => {
    await TechDebtService.create({ title: "a" });
    await TechDebtService.create({ title: "b" });
    const list = await TechDebtService.list();
    expect(list.map((i) => i.title)).toEqual(["a", "b"]);
  });

  it("starts empty — a fresh install has no debt register", async () => {
    expect(await TechDebtService.list()).toEqual([]);
    const s = await TechDebtService.summary();
    expect(s.totalItems).toBe(0);
    expect(s.totalEffortHours).toBe(0);
    expect(s.hotspots).toEqual([]);
  });
});

describe("status transitions", () => {
  it("updates status and bumps updatedAt", async () => {
    const item = await TechDebtService.create({ title: "x" });
    const updated = await TechDebtService.setStatus(item.id, "resolved");
    expect(updated!.status).toBe("resolved");
    expect(updated!.updatedAt).toBeTruthy();
  });

  it("returns null for an unknown id rather than creating one", async () => {
    await expect(TechDebtService.setStatus("no-such-id", "resolved")).resolves.toBeNull();
    expect(await TechDebtService.list()).toHaveLength(0);
  });
});

describe("summary is derived from real records", () => {
  it("groups by severity, category, and status", async () => {
    await TechDebtService.create({ title: "1", severity: "high", category: "code", status: "open" });
    await TechDebtService.create({ title: "2", severity: "high", category: "tests", status: "open" });
    await TechDebtService.create({ title: "3", severity: "low", category: "code", status: "open" });

    const s = await TechDebtService.summary();
    expect(s.bySeverity.high).toBe(2);
    expect(s.bySeverity.low).toBe(1);
    expect(s.byCategory.code).toBe(2);
    expect(s.byCategory.tests).toBe(1);
    expect(s.byStatus.open).toBe(3);
  });

  it("ranks hotspots by average churn of estimated items", async () => {
    await TechDebtService.create({ title: "a", area: "billing", churnScore: 90, estimatedEffortHours: 5 });
    await TechDebtService.create({ title: "b", area: "docs", churnScore: 10, estimatedEffortHours: 1 });

    const s = await TechDebtService.summary();
    expect(s.hotspots[0]!.area).toBe("billing");
    expect(s.hotspots[0]!.churnScore).toBe(90);
  });

  it("reports an upward trend when more was added than resolved", async () => {
    await TechDebtService.create({ title: "new debt" });
    const s = await TechDebtService.summary();
    expect(s.debtAddedLast30d).toBe(1);
    expect(s.debtResolvedLast30d).toBe(0);
    expect(s.trend30d).toBe("up");
  });

  it("reports a downward trend once items are resolved", async () => {
    const a = await TechDebtService.create({ title: "one" });
    await TechDebtService.setStatus(a.id, "resolved");

    const s = await TechDebtService.summary();
    // Resolved items drop out of "added" and count as resolved.
    expect(s.debtResolvedLast30d).toBe(1);
    expect(s.debtAddedLast30d).toBe(0);
    expect(s.trend30d).toBe("down");
  });
});
