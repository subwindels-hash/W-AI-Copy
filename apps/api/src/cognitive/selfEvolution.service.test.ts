/**
 * Self-evolution register — org-scoped store + cognitive rollup.
 *
 * Backs selfEvolutionHealth / autoFixes30d / dnaCompleteness (previously
 * structural null). FakeKv, no real infra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { SelfEvolutionService } = await import("./selfEvolution.service.js");
const ORG = "org-evo";
const OTHER = "org-other";

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("component registry", () => {
  it("upserts components idempotently by name and lists per-org", async () => {
    await SelfEvolutionService.upsertComponent(ORG, { component: "memory", health: 0.5 });
    await SelfEvolutionService.upsertComponent(ORG, { component: "memory", health: 0.8 }); // update, not duplicate
    const list = await SelfEvolutionService.listComponents(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]!.health).toBe(0.8);
    expect(await SelfEvolutionService.listComponents(OTHER)).toHaveLength(0);
  });

  it("preserves the auto-fix counter across health updates", async () => {
    await SelfEvolutionService.upsertComponent(ORG, { component: "memory", health: 0.5 });
    await SelfEvolutionService.recordAutoFix(ORG, "memory");
    await SelfEvolutionService.upsertComponent(ORG, { component: "memory", health: 0.9 });
    const list = await SelfEvolutionService.listComponents(ORG);
    expect(list[0]!.autoFixes).toBe(1);
  });

  it("refuses an auto-fix on an unknown component", async () => {
    await expect(SelfEvolutionService.recordAutoFix(ORG, "ghost")).rejects.toMatchObject({ status: 404 });
  });
});

describe("rollup", () => {
  it("returns nulls (hasData=false) for an empty org", async () => {
    expect(await SelfEvolutionService.rollup(ORG)).toMatchObject({ health: null, autoFixes30d: null, dnaCompleteness: null, hasData: false });
  });

  it("computes mean health %, auto-fixes in window, and DNA completeness", async () => {
    await SelfEvolutionService.upsertComponent(ORG, { component: "observability", health: 1.0 });
    await SelfEvolutionService.upsertComponent(ORG, { component: "reasoning", health: 0.6 });
    await SelfEvolutionService.upsertComponent(ORG, { component: "custom_thing", health: 0.8 }); // not an expected DNA component
    await SelfEvolutionService.recordAutoFix(ORG, "reasoning");
    await SelfEvolutionService.recordAutoFix(ORG, "reasoning");

    const r = await SelfEvolutionService.rollup(ORG);
    expect(r.health).toBe(80); // (1.0 + 0.6 + 0.8)/3 = 0.8 -> 80
    expect(r.autoFixes30d).toBe(2);
    // 2 of 6 expected DNA components (observability, reasoning) -> 33%
    expect(r.dnaCompleteness).toBe(33);
    expect(r.hasData).toBe(true);
  });

  it("excludes auto-fixes older than the 30-day window", async () => {
    await SelfEvolutionService.upsertComponent(ORG, { component: "memory", health: 0.5 });
    await SelfEvolutionService.recordAutoFix(ORG, "memory");
    // Evaluate 45 days later: the fix is out of the trailing window.
    const future = Date.now() + 45 * 86_400_000;
    expect(await SelfEvolutionService.autoFixesSince(ORG, future)).toBe(0);
  });
});
