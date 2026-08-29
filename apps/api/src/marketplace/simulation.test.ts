/**
 * Enterprise Simulation & Scenario Engine tests (the SI / what-if layer).
 *
 * Verifies the synthetic what-if layer: creating a scenario and running a
 * simulation produces a real SimulationRun that feeds the Superintelligence
 * layer, with honest KPI impacts and confidence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import type { ScenarioAssumption } from "@windels/shared";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { SimulationService } = await import("./simulation.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("SI simulation layer", () => {
  it("creates and runs a what-if scenario, feeding the superintelligence layer", async () => {
    const sc = await SimulationService.createScenario({
      name: "Market expansion", kind: "market-scenario", description: "Expand to two new regions",
      owner: "u1", assumptions: [] as ScenarioAssumption[], tags: ["si"] as string[], iconColor: "blue",
    });
    expect(sc.id).toMatch(/^sc-/);

    const run = await SimulationService.runSimulation({
      scenarioId: sc.id, startedBy: "u1", iterations: 100, feedSuperIntelligence: true,
    });
    expect(run.status).toBe("completed");
    expect(run.feedsSuperintelligence).toBe(true);
    expect(run.confidence).toBeGreaterThan(0);
    expect(run.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(run.kpiImpacts)).toBe(true);
  });

  it("lists scenarios and runs", async () => {
    const sc = await SimulationService.createScenario({
      name: "Cost cutting", kind: "operational-optimization", description: "Reduce opex", owner: "u1", assumptions: [] as ScenarioAssumption[], tags: [] as string[], iconColor: "green",
    });
    await SimulationService.runSimulation({ scenarioId: sc.id, startedBy: "u1", feedSuperIntelligence: true });
    expect(await SimulationService.listScenarios()).toHaveLength(1);
    expect((await SimulationService.listRuns()).length).toBeGreaterThanOrEqual(1);
  });
});
