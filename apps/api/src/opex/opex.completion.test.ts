/**
 * Session 176 — opex completion (Tier 2 #11)
 * Read-path seeding + default tenant fallback.
 * Runs fully in-memory via FakeKv + FakePrisma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { OpexService } = await import("./opex.service.js");
const { OpexAssuranceService } = await import("./opexAssurance.service.js");

const ORG = "org-opex-comp";
const OTHER = "org-opex-other";
const ADMIN = "user-admin-opex";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset?.();
}

beforeEach(() => resetAll());

describe("opex completion — O1 read/write paths do not seed meta", () => {
  it("dashboard on empty org creates no opex:meta and no opx:alert (fails on O1 read)", async () => {
    await OpexService.dashboard(ORG);
    // dashboard must NOT create opex:meta (the S156 defect) and must NOT create any alert
    expect(await kv.exists(`opex:${ORG}:meta`)).toBe(0);
    const alerts = await OpexAssuranceService.listAlerts(ORG, { limit: 5 });
    expect(alerts.alerts).toHaveLength(0);
    // ensureLegacyImported is allowed to create opx:imported as a one-shot migration marker — that is not a seeder
  });

  it("createAlert on empty org does not create opex:meta via the write path (fails on O1 write)", async () => {
    const beforeMeta = await kv.exists(`opex:${ORG}:meta`);
    expect(beforeMeta).toBe(0);
    await OpexService.createAlert(ORG, { category: "drift", severity: "warning", source: "monitor", message: "e2e finding" }, ADMIN);
    // After S176, createAlert must NOT create opex:meta
    expect(await kv.exists(`opex:${ORG}:meta`)).toBe(0);
    // But it should have created an opx:alert
    const alerts = await OpexAssuranceService.listAlerts(ORG, { limit: 5 });
    expect(alerts.alerts.length).toBe(1);
  });

  it("ensureBootstrapped is idempotent and isolated", async () => {
    await OpexService.ensureBootstrapped(undefined, ORG);
    expect(await kv.exists(`opex:${ORG}:meta`)).toBe(1);
    const keysBefore = await kv.keys("opex:*");
    await OpexService.ensureBootstrapped(undefined, ORG);
    const keysAfter = await kv.keys("opex:*");
    expect(keysAfter.length).toBe(keysBefore.length);
    // Other org not affected
    expect(await kv.exists(`opex:${OTHER}:meta`)).toBe(0);
  });

  it("second-org isolation — alert written in org A not visible from org B", async () => {
    await OpexService.createAlert(ORG, { category: "alignment", severity: "critical", source: "monitor", message: "A finding" }, ADMIN);
    const otherAlerts = await OpexAssuranceService.listAlerts(OTHER, { limit: 10 });
    expect(otherAlerts.alerts).toHaveLength(0);
    const otherDash = await OpexService.dashboard(OTHER);
    expect(otherDash.safety.alertsOpen).toBe(0);
  });
});

describe("opex completion — O2 default tenant removed", () => {
  it("dashboard requires organizationId (throws on empty) (fails on O2)", async () => {
    await expect(OpexService.dashboard("" as any)).rejects.toThrow();
    await expect(OpexService.dashboard(null as any)).rejects.toThrow();
  });

  it("createAlert requires organizationId (throws on empty)", async () => {
    await expect(OpexService.createAlert("" as any, { category: "drift", severity: "warning", source: "monitor", message: "x" }, ADMIN)).rejects.toThrow();
    await expect(OpexService.createAlert(null as any, { category: "drift", severity: "warning", source: "monitor", message: "x" }, ADMIN)).rejects.toThrow();
  });

  it("ensureBootstrapped early-returns on empty oid without creating global key", async () => {
    await OpexService.ensureBootstrapped(undefined, "" as any);
    await OpexService.ensureBootstrapped(undefined, null as any);
    await OpexService.ensureBootstrapped(undefined, undefined as any);
    expect((await kv.keys("opex:*")).length).toBe(0);
    expect((await kv.keys("opx:*")).length).toBe(0);
  });
});

describe("opex completion — dashboard still honest via assurance", () => {
  it("dashboard on empty org returns empty register and provenance via assurance", async () => {
    const d = await OpexService.dashboard(ORG);
    expect(d.safety.alertsOpen).toBe(0);
    expect(d.recentAlerts).toHaveLength(0);
    expect(d.provenance).toBeTruthy();
  });
});

describe("opex completion — continuous.maturityScore is now measured", () => {
  it("is a structural 0 on an empty org and a real composite once signals exist", async () => {
    const empty = await OpexService.dashboard(ORG);
    expect(empty.continuous.maturityScore).toBe(0);
    expect(empty.provenance!.entries.find((e) => e.field === "continuous.maturityScore")!.basis).toBe("not_assessed");

    // Give the org measured signals: a tracked regulation + a passing benchmark.
    const { RegulationsRegistryService } = await import("./regulationsRegistry.service.js");
    const { SafetyBenchmarksService } = await import("./safetyBenchmarks.service.js");
    await RegulationsRegistryService.create(ORG, { name: "GDPR", jurisdiction: "EU", category: "privacy", status: "enforcing", summary: "", impactAreas: [], gapCount: 0, gapResolved: 0 }, ADMIN);
    await SafetyBenchmarksService.record(ORG, { category: "jailbreak", score: 95, passThreshold: 80 }, ADMIN);

    const d = await OpexService.dashboard(ORG);
    expect(d.continuous.maturityScore).toBeGreaterThan(0);
    expect(d.provenance!.entries.find((e) => e.field === "continuous.maturityScore")!.basis).toBe("observed");
  });
});

describe("opex completion — safety.benchmarks is now measured", () => {
  it("reports latest benchmark result per evaluated category in the dashboard", async () => {
    const { SafetyBenchmarksService } = await import("./safetyBenchmarks.service.js");

    const empty = await OpexService.dashboard(ORG);
    expect(empty.safety.benchmarks).toEqual({});

    await SafetyBenchmarksService.record(ORG, { category: "jailbreak", score: 91, passThreshold: 80 }, ADMIN);
    await SafetyBenchmarksService.record(ORG, { category: "bias", score: 40, passThreshold: 80 }, ADMIN);

    const d = await OpexService.dashboard(ORG);
    expect(d.safety.benchmarks.jailbreak).toEqual({ pass: true, score: 91 });
    expect(d.safety.benchmarks.bias).toEqual({ pass: false, score: 40 });
    // Unevaluated categories remain absent.
    expect(d.safety.benchmarks.toxicity).toBeUndefined();

    const other = await OpexService.dashboard(OTHER);
    expect(other.safety.benchmarks).toEqual({});
  });
});

describe("opex completion — explanations is now measured", () => {
  it("reports real explainability figures in the dashboard", async () => {
    const { ExplanationsRegistryService } = await import("./explanationsRegistry.service.js");

    const empty = await OpexService.dashboard(ORG);
    expect(empty.explanations).toEqual({ available24h: 0, avgEvidence: 0, avgConfidence: 0, challenged: 0, challengedUpheld: 0 });
    expect(empty.recentExplanations).toHaveLength(0);

    await ExplanationsRegistryService.record(ORG, { decisionId: "d1", decisionSummary: "Approved", confidence: 0.9, evidenceCount: 5, knowledgeSources: [], memoryTouches: 0, toolCalls: 0, policyChecks: [], risks: [] } as any);

    const d = await OpexService.dashboard(ORG);
    expect(d.explanations.available24h).toBe(1);
    expect(d.explanations.avgConfidence).toBe(90);
    expect(d.explanations.avgEvidence).toBe(5);
    expect(d.recentExplanations).toHaveLength(1);

    const other = await OpexService.dashboard(OTHER);
    expect(other.explanations.available24h).toBe(0);
  });
});

describe("opex completion — playbooks is now measured", () => {
  it("reports real playbook figures in the dashboard", async () => {
    const { PlaybooksRegistryService } = await import("./playbooksRegistry.service.js");

    const empty = await OpexService.dashboard(ORG);
    expect(empty.playbooks).toEqual({ total: 0, active: 0, simulating: 0, avgCompliancePct: 0 });

    await PlaybooksRegistryService.create(ORG, { name: "IR", category: "cyber", version: "1", steps: 5, status: "active", compliance: "verified" }, ADMIN);

    const d = await OpexService.dashboard(ORG);
    expect(d.playbooks.total).toBe(1);
    expect(d.playbooks.active).toBe(1);
    expect(d.playbooks.avgCompliancePct).toBe(100);

    const other = await OpexService.dashboard(OTHER);
    expect(other.playbooks.total).toBe(0);
  });
});

describe("opex completion — regulations is now measured", () => {
  it("reports real regulatory register figures in the dashboard", async () => {
    const { RegulationsRegistryService } = await import("./regulationsRegistry.service.js");

    const empty = await OpexService.dashboard(ORG);
    expect(empty.regulations).toEqual({ tracked: 0, changed30d: 0, openGaps: 0, upcoming: 0 });
    expect(empty.recentRegulations).toHaveLength(0);

    await RegulationsRegistryService.create(ORG, { name: "GDPR", jurisdiction: "EU", category: "privacy", status: "enforcing", summary: "", impactAreas: [], gapCount: 4, gapResolved: 1 }, ADMIN);

    const d = await OpexService.dashboard(ORG);
    expect(d.regulations.tracked).toBe(1);
    expect(d.regulations.openGaps).toBe(3);
    expect(d.recentRegulations).toHaveLength(1);

    const other = await OpexService.dashboard(OTHER);
    expect(other.regulations.tracked).toBe(0);
  });
});

describe("opex completion — governance.gates is now measured", () => {
  it("reports real gates and pending decisions in the dashboard governance block", async () => {
    const { GovernanceGatesService } = await import("./governanceGates.service.js");

    const empty = await OpexService.dashboard(ORG);
    expect(empty.governance.gates).toHaveLength(0);

    const gate = await GovernanceGatesService.createGate(ORG, { name: "Prod deploy", level: "l3_director" }, ADMIN);
    await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "Ship release 1.2" }, "user-1");

    const d = await OpexService.dashboard(ORG);
    expect(d.governance.gates).toHaveLength(1);
    expect(d.governance.gates[0]).toMatchObject({ name: "Prod deploy", level: "l3_director", pending: 1 });
    // pendingTotal includes the gate's pending request.
    expect(d.governance.pendingTotal).toBeGreaterThanOrEqual(1);

    // Isolated by organization.
    const other = await OpexService.dashboard(OTHER);
    expect(other.governance.gates).toHaveLength(0);
  });
});

describe("opex completion — collaborationSessionsActive is now measured", () => {
  it("reports 0 with no live collaboration and a real count once a canvas has presence", async () => {
    const empty = await OpexService.dashboard(ORG);
    expect(empty.collaborationSessionsActive).toBe(0);

    // Seed a live, org-scoped canvas presence heartbeat + active index directly
    // in the shared FakeKv (the mediaFactory fake has no pub/sub, so we avoid
    // heartbeat()'s publish and write the same state it would).
    const now = new Date().toISOString();
    const presence = JSON.stringify({ userId: "u1", displayName: "Ada", avatarColor: "#38bdf8", joinedAt: now, lastSeenAt: now });
    await kv.hset("canvas:presence:i:" + ORG + ":canvas-1", "u1", presence);
    await kv.sadd("canvas:active:i:" + ORG, "canvas-1");

    const d = await OpexService.dashboard(ORG);
    expect(d.collaborationSessionsActive).toBe(1);

    // Isolated by organization.
    const other = await OpexService.dashboard(OTHER);
    expect(other.collaborationSessionsActive).toBe(0);
  });
});
