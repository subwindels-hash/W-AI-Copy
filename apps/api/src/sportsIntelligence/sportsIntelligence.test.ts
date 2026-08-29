/**
 * Sports Intelligence service tests.
 *
 * Exercises the real orchestrator against a fake KV: sync (sandbox),
 * prediction generation, ticket optimization (including NO QUALIFIED TICKET),
 * settlement, tenant isolation, and config governance.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | string>();
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value);
      return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      return map.get(field) ?? null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score));
      return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));
vi.mock("../config/env.js", () => ({
  env: {
    WINDELS_SPORTS_MODE: "SANDBOX",
    WINDELS_SPORTS_API_FOOTBALL_KEY: undefined,
    WINDELS_SPORTS_ODDS_API_KEY: undefined,
    WINDELS_DEMO_DATA: true,
    NODE_ENV: "test",
  },
}));
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => true,
  skipDemoSeed: () => undefined,
}));

import { SportsIntelligenceService as Si } from "./sportsIntelligence.service.js";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

describe("Sports Intelligence — config & safety", () => {
  it("refuses automated execution", async () => {
    await expect(Si.updateConfig(ORG_A, { automatedExecution: false, approvalMode: "AUTOMATED_EXECUTION", reason: "try live" } as any, "admin"))
      .rejects.toMatchObject({ code: "AUTOMATION_DISABLED" });
  });

  it("logs config changes with before/after", async () => {
    const next = await Si.updateConfig(ORG_A, { minConfidence: 0.8, reason: "tighten" }, "admin");
    expect(next.minConfidence).toBe(0.8);
    const audit = await Si.listAudit(ORG_A);
    expect(audit[0]?.action).toBe("sports.config.update");
    expect((audit[0]?.before as any).minConfidence).toBe(0.75);
    expect((audit[0]?.after as any).minConfidence).toBe(0.8);
  });
});

describe("Sports Intelligence — sandbox pipeline", () => {
  it("syncs labelled sandbox fixtures and odds, then produces real predictions", async () => {
    await Si.updateConfig(ORG_A, { mode: "SANDBOX", reason: "test" }, "admin");
    const fx = await Si.syncFixtures(ORG_A);
    expect(fx.created).toBeGreaterThan(0);
    const matches = await Si.listMatches(ORG_A);
    expect(matches.every((m) => m.dataClass === "SANDBOX")).toBe(true);
    expect(matches.some((m) => /Sandbox/.test(m.homeTeamName))).toBe(true);

    const od = await Si.syncOdds(ORG_A);
    expect(od.created).toBeGreaterThan(0);

    const pred = await Si.generatePredictions(ORG_A);
    expect(pred.created).toBeGreaterThan(0);
    const rows = await Si.listPredictions(ORG_A);
    for (const p of rows) {
      expect(p.modelProbability).toBeGreaterThanOrEqual(0);
      expect(p.calibratedProbability).toBeGreaterThanOrEqual(0);
      expect(p.decisionFactors.length).toBeGreaterThan(0);
      expect(p.versions.modelVersion).toBe("1.0");
    }
  });

  it("can return NO QUALIFIED TICKET when constraints cannot be met", async () => {
    await Si.updateConfig(ORG_A, {
      mode: "SANDBOX",
      minConfidence: 0.99,
      minDataQuality: 100,
      minExpectedValue: 5,
      targetOddsMin: 50,
      targetOddsMax: 51,
      reason: "impossible constraints",
    }, "admin");
    await Si.syncFixtures(ORG_A);
    await Si.syncOdds(ORG_A);
    await Si.generatePredictions(ORG_A);
    const result = await Si.generateDailyTicket(ORG_A, "admin");
    expect(result.ticket?.status).toBe("NO_QUALIFIED_TICKET");
    expect(result.ticket?.noQualifiedReason).toMatch(/NO QUALIFIED TICKET|disabled|no /i);
    expect(result.ticket?.selections).toEqual([]);
  });

  it("does not duplicate a daily ticket on a second run", async () => {
    await Si.updateConfig(ORG_A, { mode: "SANDBOX", targetOddsMin: 1.1, targetOddsMax: 50, minConfidence: 0.1, minDataQuality: 10, minExpectedValue: -1, reason: "open" }, "admin");
    await Si.syncFixtures(ORG_A);
    await Si.syncOdds(ORG_A);
    await Si.generatePredictions(ORG_A);
    const first = await Si.generateDailyTicket(ORG_A, "admin");
    const second = await Si.generateDailyTicket(ORG_A, "admin");
    expect(first.ticket?.id).toBe(second.ticket?.id);
    const all = await Si.dailyTickets(ORG_A);
    expect(all.length).toBe(1);
  });
});

describe("Sports Intelligence — settlement & isolation", () => {
  it("settles a finished sandbox match without inventing scores", async () => {
    await Si.updateConfig(ORG_A, { mode: "SANDBOX", reason: "test" }, "admin");
    await Si.syncFixtures(ORG_A);
    await Si.syncOdds(ORG_A);
    await Si.generatePredictions(ORG_A);
    const resultsIn = await Si.syncResults(ORG_A);
    expect(resultsIn.created).toBeGreaterThan(0);
    const unverified = await Si.listResults(ORG_A);
    expect(unverified.every((r) => r.verified === false)).toBe(true);
    await Si.verifyResults(ORG_A);
    const verified = await Si.listResults(ORG_A);
    expect(verified.some((r) => r.verified)).toBe(true);
    await Si.settlePending(ORG_A);
    const preds = await Si.listPredictions(ORG_A);
    const finished = preds.filter((p) => p.matchId.includes("0900") || verified.some((r) => r.matchId === p.matchId && r.verified));
    // Predictions on the finished sandbox match must leave PENDING
    const past = (await Si.listMatches(ORG_A)).find((m) => m.status === "FT");
    if (past) {
      const related = preds.filter((p) => p.matchId === past.id);
      expect(related.every((p) => p.result !== "PENDING")).toBe(true);
    }
  });

  it("never leaks org A records to org B", async () => {
    await Si.updateConfig(ORG_A, { mode: "SANDBOX", reason: "a" }, "admin");
    await Si.syncFixtures(ORG_A);
    const a = await Si.listMatches(ORG_A);
    const b = await Si.listMatches(ORG_B);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(0);
    const stolen = await Si.getMatch(ORG_B, a[0]!.id);
    expect(stolen).toBeNull();
  });

  it("paper mode without providers does not invent fixtures", async () => {
    await Si.updateConfig(ORG_A, { mode: "PAPER", reason: "no keys" }, "admin");
    // Force paper providers (none configured in this test env)
    const { providersForMode } = await import("./providers.js");
    expect(providersForMode("PAPER")).toHaveLength(0);
    const fx = await Si.syncFixtures(ORG_A);
    expect(fx.created).toBe(0);
    expect(fx.errors.join(" ")).toMatch(/not invent|not configured/i);
    const matches = await Si.listMatches(ORG_A);
    expect(matches).toEqual([]);
  });
});

describe("Sports Intelligence — dashboard honesty", () => {
  it("empty org dashboard is zeros, not fabricated stats", async () => {
    const dash = await Si.dashboard(ORG_A);
    expect(dash.disclaimer).toMatch(/does not guarantee/i);
    expect(dash.today.upcomingMatches).toBe(0);
    expect(dash.performance.totalTickets).toBe(0);
    expect(dash.performance.winRate).toBeNull();
    expect(dash.performance.roi).toBeNull();
  });
});
