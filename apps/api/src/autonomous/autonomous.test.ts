/** Session 106 — Autonomous Organization approval-register tests. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));

const { AutonomousService: Aut } = await import("./autonomous.service.js");
const { AutDecisionCreateSchema, AutDecisionResolveSchema, AutDecisionListQuerySchema } = await import("@windels/shared/autonomous");

const A = "org-aut-a";
const B = "org-aut-b";
const proposal = (overrides: Partial<Parameters<typeof Aut.propose>[1]> = {}) => ({
  title: "Optimize inference spend", department: "finance", recommendation: "Move batch jobs to reserved capacity.", confidence: 0.8, riskLevel: "med" as const, estimatedImpactUsd: 1000, reasoning: "Observed demand is stable.", ...overrides,
});

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("Autonomous Organization — approval register", () => {
  it("stores proposals as individual org-scoped records awaiting a human", async () => {
    const row = await Aut.propose(A, proposal());
    expect(row.id).toMatch(/^decision-/);
    expect(row.status).toBe("awaiting_human");
    expect(await Aut.listDecisions(A)).toHaveLength(1);
    expect(await Aut.listDecisions(B)).toHaveLength(0);
    expect([...kv.hashes.keys()].some((key) => key.startsWith(`aut:decision:i:${A}:`))).toBe(true);
  });

  it("supports status and department filters with stable list output", async () => {
    const a = await Aut.propose(A, proposal({ department: "finance" }));
    await Aut.propose(A, proposal({ title: "Hire reviewer", department: "people" }));
    await Aut.decide(A, a.id, "human-1", true, "approved");
    expect((await Aut.listDecisions(A, { status: "approved", limit: 50 })).map((d) => d.id)).toEqual([a.id]);
    expect((await Aut.listDecisions(A, { department: "people", limit: 50 })).map((d) => d.department)).toEqual(["people"]);
  });

  it("resolves with an authenticated approver and rejects a second resolution", async () => {
    const row = await Aut.propose(A, proposal());
    const resolved = await Aut.decide(A, row.id, "human-1", { approved: false, note: "Insufficient evidence" });
    expect(resolved).toMatchObject({ status: "rejected", humanApprover: "human-1", decisionNote: "Insufficient evidence" });
    await expect(Aut.decide(A, row.id, "human-2", { approved: true })).rejects.toThrow("already been resolved");
  });

  it("fails closed for cross-tenant get, resolve and delete", async () => {
    const row = await Aut.propose(A, proposal());
    expect(await Aut.getDecision(B, row.id)).toBeNull();
    await expect(Aut.decide(B, row.id, "human-b", true)).rejects.toThrow("Decision not found");
    expect(await Aut.deleteDecision(B, row.id)).toBe(false);
    expect(await Aut.getDecision(A, row.id)).not.toBeNull();
  });

  it("deletes only pending decisions and preserves resolved history", async () => {
    const pending = await Aut.propose(A, proposal({ title: "Draft" }));
    const resolved = await Aut.propose(A, proposal({ title: "Resolved" }));
    await Aut.decide(A, resolved.id, "human", true);
    expect(await Aut.deleteDecision(A, pending.id)).toBe(true);
    await expect(Aut.deleteDecision(A, resolved.id)).rejects.toThrow("Resolved decisions");
    expect((await Aut.listDecisions(A)).map((d) => d.id)).toEqual([resolved.id]);
  });
});

describe("Autonomous Organization — honest dashboard", () => {
  it("returns no fabricated compliance, plans, budgets or impact for an empty org", async () => {
    const d = await Aut.dashboard(A);
    expect(d.autonomyIndex).toBe(0);
    expect(d.governanceCompliancePct).toBe(0);
    expect(d.constitutionEnforced).toBe(0);
    expect(d.departments).toEqual([]);
    expect(d.plans).toEqual([]);
    expect(d.budgetsTotalUsd).toBe(0);
    expect(d.autonomousSavings30dUsd).toBe(0);
    expect(d.impactKind).toBe("none");
  });

  it("derives review rate, overrides, departments and approved estimates from records", async () => {
    const approved = await Aut.propose(A, proposal({ department: "finance", estimatedImpactUsd: 1000 }));
    await Aut.propose(A, proposal({ title: "People plan", department: "people", riskLevel: "low", estimatedImpactUsd: 500 }));
    await Aut.decide(A, approved.id, "human", true, "go");
    const people = (await Aut.listDecisions(A, { department: "people", limit: 50 }))[0]!;
    await Aut.decide(A, people.id, "human", false, "not now");
    const d = await Aut.dashboard(A);
    expect(d.autonomyIndex).toBe(100);
    expect(d.humanOverrideRatePct).toBe(50);
    expect(d.governanceCompliancePct).toBe(100);
    expect(d.openApprovals).toBe(0);
    expect(d.departments).toHaveLength(2);
    expect(d.autonomousSavings30dUsd).toBe(1000);
    expect(d.impactKind).toBe("approved_estimate");
    expect(d.guardrails[0]!.blockedActions30d).toBe(0);
  });

  it("keeps pending actions visibly blocked and returns deterministic values", async () => {
    await Aut.propose(A, proposal());
    const first = await Aut.dashboard(A);
    const second = await Aut.dashboard(A);
    expect(first.openApprovals).toBe(1);
    expect(first.guardrails[0]!.blockedActions30d).toBe(1);
    expect(second.autonomyIndex).toBe(first.autonomyIndex);
    expect(second.departments).toEqual(first.departments);
  });

  it("migrates the legacy organization proposal blob once", async () => {
    await kv.set(`aut:${A}:decisions`, JSON.stringify([{ id: "legacy-decision", title: "Legacy", department: "platform", recommendation: "review", confidence: 0.5, riskLevel: "low", estimatedImpactUsd: 2, reasoning: "legacy", status: "awaiting_human", createdAt: new Date().toISOString() }]));
    expect((await Aut.listDecisions(A))[0]!.id).toBe("legacy-decision");
    expect(await kv.get(`aut:${A}:decisions`)).toBeNull();
  });
});

describe("Autonomous Organization — shared contracts", () => {
  it("validates proposal, resolution and list inputs", () => {
    expect(AutDecisionCreateSchema.safeParse(proposal()).success).toBe(true);
    expect(AutDecisionCreateSchema.safeParse({ ...proposal(), confidence: 2 }).success).toBe(false);
    expect(AutDecisionResolveSchema.safeParse({ approved: true }).success).toBe(true);
    expect(AutDecisionResolveSchema.safeParse({ approved: "yes" }).success).toBe(false);
    expect(AutDecisionListQuerySchema.safeParse({ status: "awaiting_human", limit: "10" }).success).toBe(true);
    expect(AutDecisionListQuerySchema.safeParse({ status: "running" }).success).toBe(false);
  });
});
