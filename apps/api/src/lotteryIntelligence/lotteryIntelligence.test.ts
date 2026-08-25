import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | string>();
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      return map.get(field) ?? null;
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
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));
vi.mock("../config/env.js", () => ({
  env: {
    WINDELS_LOTTERY_MODE: "SANDBOX",
    WINDELS_LOTTERY_EUROMILLIONS_FEED_URL: undefined,
    WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN: undefined,
    WINDELS_DEMO_DATA: true,
    NODE_ENV: "test",
  },
}));
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => true,
  skipDemoSeed: () => undefined,
}));

import { LotteryIntelligenceService as Li } from "./lotteryIntelligence.service.js";
import { combinations } from "./engines.js";
import { parseOfficialFeed } from "./providers.js";
import { EUROMILLIONS_RULES } from "@windels/shared/lotteryIntelligence";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => { fake.store.clear(); });

describe("Lottery Intelligence — official feed honesty", () => {
  it("paper/production without a feed does not invent official draws", async () => {
    await Li.updateConfig(ORG_A, { mode: "PAPER", reason: "no feed" }, "admin");
    const { providersForMode } = await import("./providers.js");
    expect(providersForMode("PAPER")).toHaveLength(0);
    const sync = await Li.syncDraws(ORG_A);
    expect(sync.created).toBe(0);
    expect(sync.errors.join(" ")).toMatch(/not be invented|not configured/i);
    expect(await Li.listDraws(ORG_A)).toEqual([]);
  });

  it("rejects invalid official JSON instead of inserting it as official", () => {
    const parsed = parseOfficialFeed(JSON.stringify([
      { drawId: "x", date: "2026-01-01", numbers: [1, 2], stars: [1] },
    ]), EUROMILLIONS_RULES);
    expect(parsed).toHaveLength(0);
  });

  it("parses a valid official JSON row", () => {
    const parsed = parseOfficialFeed(JSON.stringify([
      { drawId: "20260102-001", date: "2026-01-02", numbers: [7, 18, 24, 36, 49], stars: [3, 11], jackpot: 17_000_000, currency: "EUR" },
    ]), EUROMILLIONS_RULES);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.dataClass).toBe("OFFICIAL");
    expect(parsed[0]!.mainNumbers).toEqual([7, 18, 24, 36, 49]);
  });
});

describe("Lottery Intelligence — sandbox pipeline", () => {
  it("syncs labelled sandbox draws and computes number intelligence from them", async () => {
    await Li.updateConfig(ORG_A, { mode: "SANDBOX", reason: "test" }, "admin");
    const sync = await Li.syncDraws(ORG_A);
    expect(sync.created).toBeGreaterThan(10);
    const draws = await Li.listDraws(ORG_A);
    expect(draws.every((d) => d.dataClass === "SANDBOX")).toBe(true);
    expect(draws.every((d) => d.validationStatus === "VALID")).toBe(true);
    const nums = await Li.numberIntelligence(ORG_A, "MAIN", { lastN: 20 });
    expect(nums).toHaveLength(50);
    expect(nums.reduce((s, n) => s + n.appearances, 0)).toBeGreaterThan(0);
  });

  it("never leaks org A tickets or draws to org B", async () => {
    await Li.updateConfig(ORG_A, { mode: "SANDBOX", reason: "a" }, "admin");
    await Li.syncDraws(ORG_A);
    const ticket = await Li.saveTicket(ORG_A, "user-1", {
      lotteryId: "euromillions", name: "Mine", generationMode: "RANDOM",
      lockedMain: [], excludedMain: [], lockedBonus: [], excludedBonus: [],
      lines: [{ mainNumbers: [7, 18, 24, 36, 49], bonusNumbers: [3, 11] }],
    });
    expect((await Li.listDraws(ORG_B)).length).toBe(0);
    expect(await Li.getTicket(ORG_B, "user-2", ticket.id)).toBeNull();
    expect(await Li.getTicket(ORG_A, "user-2", ticket.id)).toBeNull();
    expect((await Li.getTicket(ORG_A, "user-1", ticket.id))?.name).toBe("Mine");
  });

  it("refuses to save an illegal line", async () => {
    await expect(Li.saveTicket(ORG_A, "user-1", {
      lotteryId: "euromillions", name: "Bad", generationMode: "RANDOM",
      lockedMain: [], excludedMain: [], lockedBonus: [], excludedBonus: [],
      lines: [{ mainNumbers: [1, 2, 3, 4, 99], bonusNumbers: [1, 2] }],
    })).rejects.toMatchObject({ code: "INVALID_COMBINATION" });
  });

  it("system plan uses C(n,k) and paginates expansion", async () => {
    const plan = await Li.systemPlan(ORG_A, {
      lotteryId: "euromillions",
      mainPool: [1, 2, 3, 4, 5, 6],
      bonusPool: [1, 2, 3],
      expand: true,
    });
    expect(plan.mainCombinations).toBe(combinations(6, 5));
    expect(plan.totalLines).toBe(6 * 3);
    expect(plan.lines.length).toBe(18);
  });
});

describe("Lottery Intelligence — backtest honesty", () => {
  it("labels simulation and includes a random baseline", async () => {
    await Li.updateConfig(ORG_A, { mode: "SANDBOX", reason: "bt" }, "admin");
    await Li.syncDraws(ORG_A);
    const run = await Li.backtest(ORG_A, {
      lotteryId: "euromillions", strategy: "BALANCED", linesPerDraw: 1, lastN: 12,
    }, "admin");
    expect(run.label).toBe("HISTORICAL_SIMULATION");
    expect(run.randomBaseline).not.toBeNull();
    expect(run.drawsEvaluated).toBeGreaterThan(0);
    expect(run.versions.modelVersion).toBe("1.0");
  });

  it("empty org dashboard is zeros, not fabricated jackpots", async () => {
    const dash = await Li.dashboard(ORG_A);
    expect(dash.disclaimer).toMatch(/cannot guarantee/i);
    expect(dash.lastDraw).toBeNull();
    expect(dash.jackpotMinor).toBeNull();
    expect(dash.performance.savedTickets).toBe(0);
    expect(dash.rules.mainCount).toBe(5);
    expect(dash.rules.bonusLabel).toBe("Lucky Stars");
  });
});
