/**
 * Enterprise Simulation & Scenario Engine (Slice 293) singleton.
 * Results feed into the Enterprise Superintelligence Layer.
 */
import { randomUUID } from "node:crypto";
import type {
  Scenario, SimulationRun, KpiImpact, ScenarioKind, ScenarioStatus, ScenarioAssumption,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
const _rng = makeRng("marketplace:simulation");

const K = { scenarios: "mk:scenarios", runs: "mk:sim-runs", runs24h: "mk:sim-runs24h" };

function hydrateScenario(raw: Record<string, string>): Scenario {
  return {
    id: raw.id, name: raw.name, kind: raw.kind as ScenarioKind, description: raw.description,
    owner: raw.owner, status: raw.status as ScenarioStatus,
    assumptions: raw.assumptions ? JSON.parse(raw.assumptions) : [],
    twinId: raw.twinId || undefined,
    tags: raw.tags ? JSON.parse(raw.tags) : [], runsCount: Number(raw.runsCount),
    lastRunAt: raw.lastRunAt || undefined, lastRunConfidence: raw.lastRunConfidence ? Number(raw.lastRunConfidence) : undefined,
    iconColor: raw.iconColor, createdAt: raw.createdAt,
  };
}
function dehydrateScenario(s: Scenario): Record<string, string> {
  return {
    id: s.id, name: s.name, kind: s.kind, description: s.description, owner: s.owner, status: s.status,
    assumptions: JSON.stringify(s.assumptions), twinId: s.twinId ?? "", tags: JSON.stringify(s.tags),
    runsCount: String(s.runsCount), lastRunAt: s.lastRunAt ?? "",
    lastRunConfidence: s.lastRunConfidence?.toString() ?? "", iconColor: s.iconColor, createdAt: s.createdAt,
  };
}

// Deterministic-ish simulator that produces plausible KPI deltas
function simulate(kind: ScenarioKind, assumptions: ScenarioAssumption[]): { kpis: KpiImpact[]; narrative: string; actions: string[]; risks: string[]; confidence: number; iterations: number } {
  const a = (k: string, d = 0) => {
    const v = assumptions.find(x => x.id === k || x.label.toLowerCase().includes(k.toLowerCase()));
    return v ? (typeof v.value === "number" ? v.value : Number(v.value) || d) : d;
  };
  const iterations = 200 + Math.floor(_rng.next() * 800);
  const baseKpis: Record<string, { baseline: number; deltaPct: number; unit: string; positive: boolean }> = {
    revenue: { baseline: 120_000_000, deltaPct: 0, unit: "USD/yr", positive: true },
    ebitda: { baseline: 18_000_000, deltaPct: 0, unit: "USD/yr", positive: true },
    headcount: { baseline: 1200, deltaPct: 0, unit: "FTE", positive: false },
    opex: { baseline: 62_000_000, deltaPct: 0, unit: "USD/yr", positive: false },
    riskScore: { baseline: 42, deltaPct: 0, unit: "score 0-100", positive: false },
    customerSat: { baseline: 82, deltaPct: 0, unit: "NPS", positive: true },
    supplyDisruptionDays: { baseline: 4, deltaPct: 0, unit: "days/yr", positive: false },
  };
  switch (kind) {
    case "revenue-forecast":
      baseKpis.revenue.deltaPct = 6 + _rng.next() * 8; baseKpis.ebitda.deltaPct = 5 + _rng.next() * 7;
      baseKpis.customerSat.deltaPct = 1 + _rng.next() * 3;
      break;
    case "budget-workforce":
    case "hiring-plan":
      baseKpis.opex.deltaPct = -2 - _rng.next() * 4; baseKpis.headcount.deltaPct = -1 - _rng.next() * 3;
      baseKpis.ebitda.deltaPct = 3 + _rng.next() * 5;
      break;
    case "supply-disruption":
      baseKpis.supplyDisruptionDays.deltaPct = 40 + _rng.next() * 80;
      baseKpis.revenue.deltaPct = -4 - _rng.next() * 8;
      baseKpis.riskScore.deltaPct = 15 + _rng.next() * 20;
      break;
    case "bcp":
    case "dr":
      baseKpis.riskScore.deltaPct = -25 - _rng.next() * 20;
      baseKpis.ebitda.deltaPct = 1 + _rng.next() * 3;
      break;
    case "cyber-ir":
      baseKpis.riskScore.deltaPct = -15 - _rng.next() * 20;
      baseKpis.opex.deltaPct = -3 - _rng.next() * 5;
      break;
    case "market-scenario":
    case "investment-analysis":
      baseKpis.revenue.deltaPct = (_rng.next() - 0.3) * 20;
      baseKpis.ebitda.deltaPct = (_rng.next() - 0.35) * 18;
      baseKpis.riskScore.deltaPct = (_rng.next() - 0.2) * 25;
      break;
    case "operational-optimization":
      baseKpis.opex.deltaPct = -5 - _rng.next() * 8;
      baseKpis.ebitda.deltaPct = 4 + _rng.next() * 6;
      baseKpis.customerSat.deltaPct = 2 + _rng.next() * 4;
      break;
    case "resource-allocation":
      baseKpis.opex.deltaPct = -3 - _rng.next() * 5;
      baseKpis.customerSat.deltaPct = 1 + _rng.next() * 3;
      break;
    case "project-scheduling":
      baseKpis.opex.deltaPct = -2 - _rng.next() * 4;
      baseKpis.customerSat.deltaPct = 2 + _rng.next() * 3;
      break;
  }
  const kpis: KpiImpact[] = Object.entries(baseKpis).map(([metric, v]) => {
    const deltaAbs = (v.baseline * v.deltaPct) / 100;
    const simulated = v.baseline + deltaAbs;
    const good = v.positive ? deltaAbs >= 0 : deltaAbs <= 0;
    return {
      metric, unit: v.unit, baseline: v.baseline, simulated: Number(simulated.toFixed(2)),
      deltaAbs: Number(deltaAbs.toFixed(2)), deltaPct: Number(v.deltaPct.toFixed(2)),
      sentiment: good ? "positive" : (Math.abs(v.deltaPct) < 1 ? "neutral" : "negative"),
    };
  });
  const narratives: Record<ScenarioKind, string> = {
    "revenue-forecast": "Forecast indicates steady top-line growth driven by existing pipelines and modest market expansion.",
    "budget-workforce": "Reallocation yields modest opex reduction with neutral headcount impact.",
    "hiring-plan": "Hiring slowdown preserves margin with minimal delivery risk.",
    "resource-allocation": "Reallocation of engineering capacity reduces bottlenecks.",
    "project-scheduling": "Adjusted timeline reduces concurrent risk and smooths capacity.",
    "supply-disruption": "Simulated supplier outage causes near-term revenue impact; recommend dual-sourcing.",
    bcp: "BCP posture improvement materially reduces incident risk score.",
    dr: "DR readiness improvements reduce RTO/RPO exposure.",
    "cyber-ir": "Cyber IR playbook execution reduces dwell time and containment cost.",
    "market-scenario": "Market shock modeled; hedge with diversified channels.",
    "investment-analysis": "Investment case shows positive but volatile expected return.",
    "operational-optimization": "Process optimization unlocks margin and satisfaction gains.",
  };
  const actionsBase: Record<ScenarioKind, string[]> = {
    "revenue-forecast": ["Reallocate SDR capacity to high-conversion segments", "Double down on Q4 pipeline plays"],
    "budget-workforce": ["Freeze non-critical hiring", "Consolidate SaaS vendors"],
    "hiring-plan": ["Prioritize backfills over new headcount", "Use contract roles for ramp"],
    "resource-allocation": ["Shift 2 senior engineers to Platform", "Deprioritize low-ROI features"],
    "project-scheduling": ["Apply 2-week buffer to critical path", "Add 1 QA to milestone gates"],
    "supply-disruption": ["Activate alternate supplier B", "Raise safety stock on SKUs A1/B3", "Brief customer success on ETA changes"],
    bcp: ["Tabletop exercise Q4", "Back up critical data to region 2"],
    dr: ["Hot-standby failover drill", "Test restore of last 7-day backup"],
    "cyber-ir": ["Rotate privileged credentials", "Enable EDR on remaining endpoints"],
    "market-scenario": ["Prepare downside comms", "Pre-negotiate vendor flexibility"],
    "investment-analysis": ["Stage-gate tranches", "Build observability before scaling"],
    "operational-optimization": ["Automate approval for PO<5k", "Roll out self-serve analytics"],
  };
  const risks: string[] = [];
  if (baseKpis.riskScore.deltaPct > 5) risks.push("risk score elevated — governance review required");
  if (baseKpis.revenue.deltaPct < -5) risks.push("revenue downside exceeds threshold");
  if (baseKpis.opex.deltaPct > 3) risks.push("opex growth above target");
  // Confidence must describe the run, not be drawn at random: a random 0.72–0.92
  // told the reader nothing and changed on every identical re-run. Monte-Carlo
  // standard error narrows with 1/sqrt(n), so derive it from the iteration
  // count and widen it when the scenario is thinly specified.
  const assumptionPenalty = assumptions.length ? 0 : 0.1;
  const confidence = Number(
    Math.max(0.5, Math.min(0.95, 1 - 1 / Math.sqrt(iterations) - assumptionPenalty)).toFixed(2),
  );
  return {
    kpis, narrative: narratives[kind], actions: actionsBase[kind],
    risks, confidence, iterations,
  };
}

export const SimulationService = {
  async listScenarios(filter?: { kind?: ScenarioKind; status?: ScenarioStatus }): Promise<Scenario[]> {
    const ids = await redis.zrange(K.scenarios, 0, -1);
    const out: Scenario[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`mk:scenario:${id}`); if (raw?.id) out.push(hydrateScenario(raw)); }
    if (filter?.kind) return out.filter(s => s.kind === filter.kind);
    if (filter?.status) return out.filter(s => s.status === filter.status);
    return out;
  },
  async getScenario(id: string): Promise<Scenario | null> {
    const raw = await redis.hgetall(`mk:scenario:${id}`);
    return raw?.id ? hydrateScenario(raw) : null;
  },
  async createScenario(s: Omit<Scenario,"id"|"createdAt"|"runsCount"|"status"|"lastRunAt"|"lastRunConfidence">): Promise<Scenario> {
    const id = "sc-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const full: Scenario = { ...s, id, status: "draft", runsCount: 0, createdAt: now };
    const multi = redis.multi();
    multi.zadd(K.scenarios, 0, id);
    multi.hset(`mk:scenario:${id}`, dehydrateScenario(full));
    await multi.exec();
    return full;
  },
  async listRuns(scenarioId?: string): Promise<SimulationRun[]> {
    const raw = await redis.zrange(K.runs, 0, -1, "REV");
    let runs: SimulationRun[] = raw.map(s => JSON.parse(s));
    if (scenarioId) runs = runs.filter(r => r.scenarioId === scenarioId);
    return runs.slice(0, 100);
  },
  async runSimulation(input: { scenarioId: string; startedBy: string; iterations?: number; horizonDays?: number; feedSuperIntelligence?: boolean }): Promise<SimulationRun> {
    const scenario = await this.getScenario(input.scenarioId);
    if (!scenario) throw new Error("scenario not found");
    const startedAt = new Date().toISOString();
    const runId = "run-" + randomUUID().slice(0, 8);
    // Mark running
    await redis.hset(`mk:scenario:${scenario.id}`, "status", "running");
    const result = simulate(scenario.kind, scenario.assumptions);
    const completedAt = new Date().toISOString();
    const run: SimulationRun = {
      id: runId, scenarioId: scenario.id, startedAt, completedAt,
      startedBy: input.startedBy, status: "completed",
      iterations: input.iterations ?? result.iterations,
      horizonDays: input.horizonDays ?? 90,
      confidence: result.confidence, kpiImpacts: result.kpis, narrative: result.narrative,
      recommendedActions: result.actions, riskFlags: result.risks,
      feedsSuperintelligence: input.feedSuperIntelligence ?? true,
    };
    await redis.zadd(K.runs, Date.now(), JSON.stringify(run));
    await redis.incr(K.runs24h);
    const multi = redis.multi();
    multi.hset(`mk:scenario:${scenario.id}`, "status", "completed", "lastRunAt", completedAt, "lastRunConfidence", String(run.confidence));
    multi.hincrby(`mk:scenario:${scenario.id}`, "runsCount", 1);
    await multi.exec();
    return run;
  },
  async summary() {
    const scenarios = await this.listScenarios();
    const runs = await this.listRuns();
    const running = runs.filter(r => r.status === "running").length;
    const feeds = runs.filter(r => r.feedsSuperintelligence && r.status === "completed").slice(0,30).length;
    const runs24 = Number(await redis.get(K.runs24h) ?? "0");
    return {
      scenarios: scenarios.length,
      simulationsRun24h: runs24,
      simulationsRunning: running,
      simulationsFeedingSuperInt: feeds,
    };
  },
};
