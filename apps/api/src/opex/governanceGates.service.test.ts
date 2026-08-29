/**
 * Governance gates — org-scoped approval-gate store + opex rollup.
 *
 * Backs the opex `governance.gates` field, which used to be a structural zero.
 * These tests pin the real behaviour with FakeKv (no Redis/Postgres): gates and
 * requests are tenant-scoped, decisions are recorded once, and the rollup
 * figures (pending / approved24h / rejected24h / avgDecisionMin) are computed
 * from stored records — never estimated.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { GovernanceGatesService } = await import("./governanceGates.service.js");

const ORG = "org-gov";
const OTHER = "org-other";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("gate + request lifecycle", () => {
  it("creates a gate and lists it within the org only", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "Prod deploy", level: "l3_director" }, "admin-1");
    expect(gate.id).toMatch(/^gate_/);
    expect(await GovernanceGatesService.listGates(ORG)).toHaveLength(1);
    expect(await GovernanceGatesService.listGates(OTHER)).toHaveLength(0);
  });

  it("rejects a request against a gate from another org (not found)", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "G", level: "l2_manager" });
    await expect(GovernanceGatesService.openRequest(OTHER, gate.id, { subject: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("opens a pending request and decides it exactly once", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "G", level: "l2_manager" });
    const req = await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "Ship X" }, "user-1");
    expect(req.status).toBe("pending");

    const decided = await GovernanceGatesService.decideRequest(ORG, gate.id, req.id, "approved", "mgr-1", "looks good");
    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe("mgr-1");
    expect(decided.decidedAt).toBeTruthy();

    await expect(GovernanceGatesService.decideRequest(ORG, gate.id, req.id, "rejected", "mgr-1")).rejects.toMatchObject({ status: 409 });
  });

  it("requires a deciding user", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "G", level: "l2_manager" });
    const req = await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "Y" });
    await expect(GovernanceGatesService.decideRequest(ORG, gate.id, req.id, "approved", "")).rejects.toMatchObject({ status: 400 });
  });
});

describe("rollup", () => {
  it("computes pending / approved24h / rejected24h and org-scoped pendingTotal", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "Gate A", level: "l3_director" });
    const r1 = await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "a" });
    const r2 = await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "b" });
    await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "c" }); // stays pending
    await GovernanceGatesService.decideRequest(ORG, gate.id, r1.id, "approved", "d1");
    await GovernanceGatesService.decideRequest(ORG, gate.id, r2.id, "rejected", "d2");

    const rollup = await GovernanceGatesService.rollup(ORG);
    expect(rollup.gates).toHaveLength(1);
    expect(rollup.gates[0]).toMatchObject({ pending: 1, approved24h: 1, rejected24h: 1 });
    expect(rollup.pendingTotal).toBe(1);
  });

  it("excludes decisions older than 24h from the 24h figures", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "Gate B", level: "l2_manager" });
    const req = await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "old" });
    await GovernanceGatesService.decideRequest(ORG, gate.id, req.id, "approved", "d1");

    // Evaluate the rollup as if 48h have elapsed since the decision.
    const future = Date.now() + 48 * 3_600_000;
    const rollup = await GovernanceGatesService.rollup(ORG, future);
    expect(rollup.gates[0]).toMatchObject({ pending: 0, approved24h: 0, rejected24h: 0 });
  });

  it("reports avgDecisionMin from real request->decision durations", async () => {
    const gate = await GovernanceGatesService.createGate(ORG, { name: "Gate C", level: "l4_exec" });
    const req = await GovernanceGatesService.openRequest(ORG, gate.id, { subject: "z" });
    // Backdate the request 30 minutes so the recorded duration is ~30 min.
    const raw = JSON.parse(await kv.get(`opex:gov:req:${ORG}:${req.id}`) as string);
    raw.requestedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    await kv.set(`opex:gov:req:${ORG}:${req.id}`, JSON.stringify(raw));
    await GovernanceGatesService.decideRequest(ORG, gate.id, req.id, "approved", "d1");

    const rollup = await GovernanceGatesService.rollup(ORG);
    expect(rollup.gates[0]!.avgDecisionMin).toBeGreaterThanOrEqual(29);
    expect(rollup.gates[0]!.avgDecisionMin).toBeLessThanOrEqual(31);
  });

  it("returns empty rollup for an org with no gates", async () => {
    const rollup = await GovernanceGatesService.rollup(ORG);
    expect(rollup).toEqual({ gates: [], pendingTotal: 0 });
  });
});
