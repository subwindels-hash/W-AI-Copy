/**
 * The seven "thin stub" rollup modules: cognitive, command, usage, opex,
 * sustainability, aiEconomy, autonomous.
 *
 * Each was previously de-faked by replacing invented metrics with zeros. That
 * was right, but it left most fields hardcoded to 0 even where the data to
 * compute them already existed (AiRequest, Alert, WorkflowRun, Task, and each
 * module's own ledger). These tests pin the two properties that matter:
 *
 *   1. an empty organization reports zeros — nothing is invented; and
 *   2. once real records exist, the rollups actually reflect them.
 *
 * Runs fully in-memory: FakePrisma for Postgres, FakeKv for Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const db = new FakePrisma();
const kv = new FakeKv();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { UsageService } = await import("./usage.service.js");
const { CognitiveService } = await import("../cognitive/cognitive.service.js");
const { CommandService } = await import("../command/command.service.js");
const { OpexService } = await import("../opex/opex.service.js");
const { SustainabilityService } = await import("../sustainability/sustainability.service.js");
const { AiEconomyService } = await import("../aiEconomy/aiEconomy.service.js");
const { AutonomousService } = await import("../autonomous/autonomous.service.js");

const OID = "org-alpha";
const OTHER = "org-beta";
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();

function seedAiRequests(orgId: string, rows: Array<{ status?: string; durationMs?: number; channel?: string; modelId?: string; userId?: string; daysAgo?: number }>) {
  db.seed("AiRequest", rows.map((r) => ({
    id: cuid(), organizationId: orgId,
    userId: r.userId ?? "user-1",
    channel: r.channel ?? "chat",
    provider: "test", modelId: r.modelId ?? "m-1",
    durationMs: r.durationMs ?? 100,
    promptTokens: 10, completionTokens: 20,
    status: r.status ?? "succeeded",
    createdAt: new Date(Date.now() - (r.daysAgo ?? 0) * 86_400_000),
  })));
}

beforeEach(() => {
  db.reset();
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

// ─── empty organization: nothing invented ──────────────────────────────
describe("an empty organization reports zeros, not plausible numbers", () => {
  it("usage", async () => {
    const d = await UsageService.dashboard(OID);
    expect(d.totalRequests30d).toBe(0);
    expect(d.adoptionPct).toBe(0);
    expect(d.automationRate).toBe(0);
    expect(d.topModels).toHaveLength(0);
    // The 30-day series still has 30 points, all empty — an honest shape.
    expect(d.series).toHaveLength(30);
    expect(d.series.every((p) => p.requests === 0)).toBe(true);
  });

  it("cognitive", async () => {
    const d = await CognitiveService.dashboard(OID);
    expect(d.reasoningAccuracyAvg).toBe(0);
    expect(d.predictionsMade30d).toBe(0);
    expect(d.globalMemoryEntries).toBe(0);
    // No traffic and no failures means every category is healthy.
    expect(d.observatoryHealthyPct).toBe(100);
  });

  it("command", async () => {
    const d = await CommandService.dashboard(OID);
    expect(d.incidentsOpen).toBe(0);
    expect(d.aiDecisions24h).toBe(0);
    expect(d.globalRevenueMtd).toBe(0);
  });

  it("opex", async () => {
    const d = await OpexService.dashboard(OID);
    // No evidence of reliability is not evidence of reliability.
    expect(d.trust.reliability).toBe(0);
    expect(d.safety.passRate).toBe(0);
    expect(d.safety.alertsOpen).toBe(0);
  });

  it("sustainability", async () => {
    const d = await SustainabilityService.dashboard(OID);
    expect(d.emissionsTotalTCO2e).toBe(0);
    expect(d.emissionsBySource).toHaveLength(0);
    // Session 121: an ESG score without an attested assessment is null with a
    // note (the Session 64 formula invented ratings; a bare 0 would read as
    // a score of zero). A same-period change without a baseline is null too.
    expect(d.scores.overall).toBeNull();
    expect(typeof d.scores.note).toBe("string");
    expect(d.emissionsYtdChangePct).toBeNull();
    expect(d.energySeries).toHaveLength(12);
  });

  it("aiEconomy", async () => {
    const d = await AiEconomyService.dashboard(OID);
    expect(d.computeCost30d).toBe(0);
    expect(d.creditsInCirculation).toBe(0);
    expect(d.forecasts).toHaveLength(0);
  });

  it("autonomous", async () => {
    const d = await AutonomousService.dashboard(OID);
    expect(d.autonomyIndex).toBe(0);
    expect(d.openApprovals).toBe(0);
    expect(d.departmentsCount).toBe(0);
  });
});

// ─── rollups reflect real records ──────────────────────────────────────
describe("usage derives real metrics from AiRequest", () => {
  it("counts requests, latency and error rate", async () => {
    seedAiRequests(OID, [
      { durationMs: 100 }, { durationMs: 300 },
      { durationMs: 200, status: "failed" }, { durationMs: 200, channel: "agent" },
    ]);
    const d = await UsageService.dashboard(OID);
    const get = (label: string) => d.metrics.find((m) => m.label === label)!.value;

    expect(get("AI requests (30d)")).toBe(4);
    expect(get("Avg AI latency")).toBe(200);
    expect(get("AI error rate")).toBe(25);   // 1 of 4 failed
    expect(get("AI tokens (30d)")).toBe(120); // 4 x (10 + 20)
  });

  it("splits modules by channel and ranks models", async () => {
    seedAiRequests(OID, [
      { channel: "chat", modelId: "gpt" }, { channel: "chat", modelId: "gpt" },
      { channel: "workflow", modelId: "claude" },
    ]);
    const d = await UsageService.dashboard(OID);
    expect(d.modules[0]).toMatchObject({ module: "chat", requests: 2 });
    expect(Math.round(d.modules[0]!.sharePct!)).toBe(67);
    expect(d.topModels[0]).toMatchObject({ modelId: "gpt", requests: 2 });
  });

  it("measures adoption from members who actually generated traffic", async () => {
    db.seed("Membership", [
      { id: cuid(), userId: "u1", organizationId: OID, joinedAt: new Date(1) },
      { id: cuid(), userId: "u2", organizationId: OID, joinedAt: new Date(1) },
      { id: cuid(), userId: "u3", organizationId: OID, joinedAt: new Date(1) },
      { id: cuid(), userId: "u4", organizationId: OID, joinedAt: new Date(1) },
    ]);
    seedAiRequests(OID, [{ userId: "u1" }, { userId: "u1" }, { userId: "u2" }]);
    const d = await UsageService.dashboard(OID);
    // 2 of 4 members produced traffic — enrolment alone is not adoption.
    expect(d.adoptionPct).toBe(0.5);
    expect(d.activeMembers30d).toBe(2);
  });

  it("does not count another organization's traffic", async () => {
    seedAiRequests(OTHER, [{}, {}, {}]);
    const d = await UsageService.dashboard(OID);
    expect(d.totalRequests30d).toBe(0);
  });
});

describe("cognitive and command reflect real health signals", () => {
  it("cognitive derives accuracy from the AI success rate", async () => {
    seedAiRequests(OID, [{}, {}, {}, { status: "failed" }]);
    const d = await CognitiveService.dashboard(OID);
    expect(d.reasoningAccuracyAvg).toBe(75);
    expect(d.predictionsMade30d).toBe(4);
    // A failing category drags the observatory below 100%.
    expect(d.observatoryHealthyPct).toBeLessThan(100);
  });

  it("command health drops when incidents are open", async () => {
    db.seed("Alert", [
      { id: cuid(), organizationId: OID, severity: "CRITICAL", dismissedAt: null, createdAt: new Date() },
      { id: cuid(), organizationId: OID, severity: "WARNING", dismissedAt: null, createdAt: new Date() },
    ]);
    const d = await CommandService.dashboard(OID);
    expect(d.incidentsOpen).toBe(2);
    expect(d.incidentsCritical).toBe(1);
    // Was previously pinned at 100 regardless of incident load.
    expect(d.enterpriseHealth).toBeLessThan(100);
  });
});

describe("opex reports measured reliability and safety", () => {
  it("derives reliability from real traffic and safety from the register", async () => {
    seedAiRequests(OID, [{}, {}, {}, {}, { status: "failed" }]);
    await OpexService.createAlert(OID, { category: "bias", severity: "critical", source: "eval", message: "flagged" });
    const open = await OpexService.dashboard(OID);
    expect(open.trust.reliability).toBe(80);       // 4 of 5 succeeded
    expect(open.safety.alertsOpen).toBe(1);
    expect(open.safety.alertsCritical).toBe(1);
    expect(open.safety.passRate).toBe(0);          // nothing resolved yet
    expect(open.continuous.bottlenecks).toHaveLength(1);
  });
});

describe("sustainability computes emissions from the ledger", () => {
  it("totals tCO2e from quantity x disclosed factor", async () => {
    await SustainabilityService.record(OID, {
      category: "scope2", activity: "grid electricity", quantity: 1000,
      unit: "kWh", emissionFactorKg: 0.4, occurredAt: iso(), source: "utility bill", kwh: 1000,
    });
    const d = await SustainabilityService.dashboard(OID);
    // 1000 kWh x 0.4 kg / 1000 = 0.4 tCO2e
    expect(d.emissionsTotalTCO2e).toBe(0.4);
    expect(d.emissionsBySource[0]).toMatchObject({ category: "scope2", source: "grid electricity" });
    expect(d.energySeries.at(-1)!.kwh).toBe(1000);
  });

  it("groups repeated activities instead of listing duplicates", async () => {
    for (let i = 0; i < 3; i++) {
      await SustainabilityService.record(OID, {
        category: "scope1", activity: "fleet diesel", quantity: 100,
        unit: "L", emissionFactorKg: 2.68, occurredAt: iso(), source: "fuel card",
      });
    }
    const d = await SustainabilityService.dashboard(OID);
    expect(d.emissionsBySource).toHaveLength(1);
    expect(d.emissionsBySource[0]!.tCO2e).toBeCloseTo(0.804, 3);
  });

  it("rolls compute emissions up under scope2", async () => {
    await SustainabilityService.record(OID, {
      category: "compute", activity: "gpu training", quantity: 500,
      unit: "kWh", emissionFactorKg: 0.3, occurredAt: iso(), source: "cluster meter", kwh: 500,
    });
    const d = await SustainabilityService.dashboard(OID);
    expect(d.emissionsBySource[0]!.category).toBe("scope2");
    expect(d.greenAi).toHaveLength(1);
    expect(d.greenAi[0]!.co2eKg).toBe(150);
  });
});

describe("aiEconomy and autonomous roll up their own ledgers", () => {
  it("aiEconomy totals recorded spend and projects forward", async () => {
    await AiEconomyService.recordUsage(OID, { resource: "gpu", quantity: 10, unit: "hr", costCents: 5000, department: "research" });
    await AiEconomyService.recordUsage(OID, { resource: "tokens", quantity: 1000, unit: "tok", costCents: 250, department: "product" });
    const d = await AiEconomyService.dashboard(OID);
    expect(d.computeCost30d).toBe(52.5);
    expect(d.creditsInCirculation).toBe(1010);
    expect(d.topDepartments[0]).toMatchObject({ department: "research" });
    expect(d.forecasts[0]!.usageTokens).toBe(1000);
  });

  it("autonomous reports review rate and never auto-executes", async () => {
    const a = await AutonomousService.propose(OID, {
      title: "Increase spend", department: "finance", recommendation: "raise cap",
      confidence: 0.8, riskLevel: "med", estimatedImpactUsd: 1000, reasoning: "demand",
    } as any);
    await AutonomousService.propose(OID, {
      title: "Hire", department: "hr", recommendation: "open req",
      confidence: 0.6, riskLevel: "low", estimatedImpactUsd: 500, reasoning: "growth",
    } as any);

    let d = await AutonomousService.dashboard(OID);
    expect(d.openApprovals).toBe(2);
    expect(d.autonomyIndex).toBe(0);          // nothing reviewed yet
    expect(d.departmentsCount).toBe(2);
    // The guardrail must count everything still blocked awaiting a human.
    expect(d.guardrails[0]!.blockedActions30d).toBe(2);

    await AutonomousService.decide(OID, a.id, "approver-1", true, "ok");
    d = await AutonomousService.dashboard(OID);
    expect(d.autonomyIndex).toBe(50);         // 1 of 2 resolved
    expect(d.humanOverrideRatePct).toBe(0);   // approved, not rejected
    expect(d.autonomousSavings30dUsd).toBe(1000);
  });
});
