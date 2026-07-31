/**
 * agentComm (Slices 171-176) — the largest untested module in the repo:
 * 42 routes and ~1,100 SLOC across six services, with zero coverage.
 *
 * It is also the most security-sensitive of the untested set, because it mints
 * agent credentials and claims to verify message signatures. These tests pin
 * the identity/credential lifecycle, the message bus, teams and handoffs,
 * reasoning artefacts, feedback scoring and escalation routing — and, in
 * particular, the three defects found while reading it:
 *
 *   1. `verify()` accepted ANY 64-character hex string as a valid signature,
 *      stamping `metadata.verified = true` on forged envelopes.
 *   2. `avgLatencyMs` was `(avg + new) / 2` — an EWMA labelled as an average,
 *      which halves the very first sample and lets one outlier dominate.
 *   3. `getMetrics()` reported `approvalRate: 0.5` for agents with no feedback
 *      at all, which reads as "half this agent's work was approved".
 *
 * Runs fully in-memory: FakeKv replaces Redis, Prisma is stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
// No agent rows: identities are synthesised, which is the path the bus uses.
vi.mock("../../db/client.js", () => ({
  prisma: { agent: { findUnique: async () => null } },
}));

const { AgentIdentityService } = await import("./agentIdentity.service.js");
const { CommProtocolService } = await import("./commProtocol.service.js");
const { CollaborationService } = await import("./collaboration.service.js");
const { ReasoningService } = await import("./reasoning.service.js");
const { FeedbackService } = await import("./feedback.service.js");
const { EscalationService } = await import("./escalation.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  CommProtocolService.resolveSecret = undefined;
});

describe("agent identity lifecycle", () => {
  it("synthesises an identity on first use and indexes it", async () => {
    const id = await AgentIdentityService.ensure("agent-1");
    expect(id.agentId).toBe("agent-1");
    expect(id.lifecycle).toBe("created");
    expect(await AgentIdentityService.count()).toBe(1);
  });

  it("is idempotent — ensure() does not duplicate or reset", async () => {
    await AgentIdentityService.ensure("agent-1");
    await AgentIdentityService.transition("agent-1", "active");
    const again = await AgentIdentityService.ensure("agent-1");
    expect(again.lifecycle).toBe("active");
    expect(await AgentIdentityService.count()).toBe(1);
  });

  it("records capability attestations with an attesting party", async () => {
    await AgentIdentityService.ensure("agent-1");
    const updated = await AgentIdentityService.attestCapability("agent-1", {
      id: "billing.refund", attestedBy: "compliance", version: "1.0.0",
    } as never);
    const cap = updated!.capabilities.find((c) => c.id === "billing.refund");
    expect(cap).toBeDefined();
    expect(cap!.attestedBy).toBe("compliance");
    expect(cap!.attestedAt).toBeTruthy();
  });
});

describe("agent credentials", () => {
  it("returns the raw key once and never stores it in the clear", async () => {
    const minted = await AgentIdentityService.mintCredential("agent-1", ["comm.send"]);
    expect(minted).not.toBeNull();
    const { credential, rawKey } = minted!;
    expect(rawKey).toMatch(/^windels-ag-[0-9a-f]{48}$/);
    // Only a masked hint is persisted on the identity.
    expect(credential.keyHint).not.toContain(rawKey.slice(11));
    const stored = JSON.stringify(await AgentIdentityService.get("agent-1"));
    expect(stored).not.toContain(rawKey);
  });

  it("resolves an agent from a presented key", async () => {
    const { rawKey } = (await AgentIdentityService.mintCredential("agent-1", ["comm.send"]))!;
    const found = await AgentIdentityService.lookupByKey(rawKey);
    expect(found!.identity.agentId).toBe("agent-1");
  });

  it("rejects an unknown key", async () => {
    await AgentIdentityService.mintCredential("agent-1", ["comm.send"]);
    expect(await AgentIdentityService.lookupByKey("windels-ag-deadbeef")).toBeNull();
  });

  it("rejects a revoked key", async () => {
    const minted = (await AgentIdentityService.mintCredential("agent-1", ["comm.send"]))!;
    await AgentIdentityService.revokeCredential("agent-1", minted.credential.id);
    expect(await AgentIdentityService.lookupByKey(minted.rawKey)).toBeNull();
  });

  it("rejects an expired key", async () => {
    const minted = (await AgentIdentityService.mintCredential("agent-1", ["comm.send"], -1))!;
    expect(await AgentIdentityService.lookupByKey(minted.rawKey)).toBeNull();
  });
});

describe("message signatures are not faked", () => {
  it("delivers unsigned messages but marks them unverified", async () => {
    const env = await CommProtocolService.send({
      from: "agent-1", to: "agent-2", type: "request", subject: "hello",
    });
    expect((env.metadata as Record<string, unknown>).verified).toBe(false);
    expect((await CommProtocolService.listInbox("agent-2")).length).toBe(1);
  });

  it("does not accept arbitrary hex as proof of authorship", async () => {
    await AgentIdentityService.ensure("agent-1");
    const forged = "a".repeat(64); // passed the old /^[0-9a-f]{64}$/ check
    const env = await CommProtocolService.send({
      from: "agent-1", to: "agent-2", type: "request", subject: "forged",
      metadata: {},
    });
    (env as { signature?: string }).signature = forged;
    await CommProtocolService.verify(env);
    const meta = env.metadata as Record<string, unknown>;
    // The signature could not be checked, so it must not read as verified.
    expect(meta.verified).toBe(false);
    expect(meta.signatureChecked).toBe(false);
  });

  it("verifies a genuine HMAC once a secret is resolvable", async () => {
    await AgentIdentityService.ensure("agent-1");
    CommProtocolService.resolveSecret = async () => "shared-secret";
    const env = await CommProtocolService.send({
      from: "agent-1", to: "agent-2", type: "request", subject: "signed",
    });
    (env as { signature?: string }).signature = CommProtocolService.sign(env, "shared-secret");
    expect(await CommProtocolService.verify(env)).toBe(true);
    const meta = env.metadata as Record<string, unknown>;
    expect(meta.verified).toBe(true);
    expect(meta.signatureChecked).toBe(true);
  });

  it("rejects a tampered payload under a real secret", async () => {
    await AgentIdentityService.ensure("agent-1");
    CommProtocolService.resolveSecret = async () => "shared-secret";
    const env = await CommProtocolService.send({
      from: "agent-1", to: "agent-2", type: "request", subject: "signed",
      payload: { amount: 10 },
    });
    (env as { signature?: string }).signature = CommProtocolService.sign(env, "shared-secret");
    env.payload = { amount: 1_000_000 };
    expect(await CommProtocolService.verify(env)).toBe(false);
    expect((env.metadata as Record<string, unknown>).verified).toBe(false);
  });

  it("rejects a signature from an unknown sender", async () => {
    const env = await CommProtocolService.send({
      from: "agent-1", to: "agent-2", type: "request", subject: "x",
    });
    await kv.del("agentComm:identity:agent-1");
    (env as { signature?: string }).signature = "b".repeat(64);
    expect(await CommProtocolService.verify(env)).toBe(false);
  });
});

describe("the message bus", () => {
  it("writes to the recipient inbox and the sender outbox", async () => {
    await CommProtocolService.send({ from: "a", to: "b", type: "request", subject: "s" });
    expect((await CommProtocolService.listInbox("b")).length).toBe(1);
    expect((await CommProtocolService.listOutbox("a")).length).toBe(1);
    expect((await CommProtocolService.listInbox("a")).length).toBe(0);
  });

  it("delivers to in-process subscribers and honours unsubscribe", async () => {
    const seen: string[] = [];
    const off = CommProtocolService.subscribe("b", (m) => { seen.push(m.subject); });
    await CommProtocolService.send({ from: "a", to: "b", type: "request", subject: "one" });
    off();
    await CommProtocolService.send({ from: "a", to: "b", type: "request", subject: "two" });
    expect(seen).toEqual(["one"]);
  });

  it("carries a correlation id so a conversation can be reassembled", async () => {
    const first = await CommProtocolService.send({ from: "a", to: "b", type: "request", subject: "q" });
    const reply = await CommProtocolService.send({
      from: "b", to: "a", type: "response", subject: "r",
      correlationId: first.correlationId, causationId: first.id,
    });
    expect(reply.correlationId).toBe(first.correlationId);
    expect(reply.causationId).toBe(first.id);
  });
});

describe("teams and task handoffs", () => {
  it("creates a team and manages membership", async () => {
    const team = await CollaborationService.createTeam({
      name: "support", purpose: "tier-1", members: [{ agentId: "a", role: "coordinator" }],
    } as never);
    await CollaborationService.addMember(team.id, { agentId: "b", role: "worker" } as never);
    let cur = await CollaborationService.getTeam(team.id);
    expect(cur!.members.map((m) => m.agentId).sort()).toEqual(["a", "b"]);

    await CollaborationService.setMemberRole(team.id, "b", "reviewer");
    cur = await CollaborationService.getTeam(team.id);
    expect(cur!.members.find((m) => m.agentId === "b")!.role).toBe("reviewer");

    await CollaborationService.removeMember(team.id, "b");
    cur = await CollaborationService.getTeam(team.id);
    expect(cur!.members.map((m) => m.agentId)).toEqual(["a"]);
  });

  it("opens a handoff as pending, not accepted", async () => {
    const h = await CollaborationService.createHandoff({
      taskId: "t-1", fromAgentId: "a", toAgentId: "b", reason: "needs billing scope",
    });
    // A handoff nobody has answered must not present as agreed.
    expect(h.status).toBe("pending");
    const byAgent = await CollaborationService.listHandoffs({ agentId: "b" });
    expect(byAgent.map((x) => x.id)).toContain(h.id);
  });
});

describe("reasoning artefacts", () => {
  it("accumulates evidence and steps, then concludes", async () => {
    const art = await ReasoningService.create({
      authorAgentId: "a", question: "refund?", chainId: "chain-1",
    } as never);
    await ReasoningService.addEvidence(art.id, { source: "policy.md", excerpt: "30 days" } as never);
    await ReasoningService.addStep(art.id, { description: "within window", kind: "deduction" } as never);
    const done = await ReasoningService.conclude(art.id, "approve refund", 0.9);
    expect(done!.evidence.length).toBe(1);
    expect(done!.steps.length).toBe(1);
    expect(done!.conclusion).toBe("approve refund");
    expect(done!.confidence).toBe(0.9);
  });

  it("groups a chain so a multi-agent argument stays linked", async () => {
    await ReasoningService.create({ authorAgentId: "a", question: "q1", chainId: "c" } as never);
    await ReasoningService.create({ authorAgentId: "b", question: "q2", chainId: "c" } as never);
    await ReasoningService.create({ authorAgentId: "c", question: "q3", chainId: "other" } as never);
    expect((await ReasoningService.listChain("c")).length).toBe(2);
  });

  it("records a critique verdict against the artefact", async () => {
    const art = await ReasoningService.create({ authorAgentId: "a", question: "q" } as never);
    const critiqued = await ReasoningService.critique(art.id, "reviewer", "missing evidence", "revise");
    expect(critiqued!.critiques.length).toBe(1);
    expect(critiqued!.critiques[0].verdict).toBe("revise");
  });
});

describe("performance metrics are measured, not assumed", () => {
  it("reports zeros for an agent with no feedback", async () => {
    const m = await FeedbackService.getMetrics("agent-1");
    expect(m.tasksCompleted).toBe(0);
    expect(m.tasksFailed).toBe(0);
    // 0.5 read as "half of this agent's work was approved" when none of it
    // had been assessed at all.
    expect(m.approvalRate).toBe(0);
    expect(m.avgLatencyMs).toBe(0);
  });

  it("reports the first task's latency exactly, not half of it", async () => {
    await FeedbackService.recordTaskCompleted("agent-1", 200, true);
    const m = await FeedbackService.getMetrics("agent-1");
    // `(0 + 200) / 2` reported 100 ms for a task that took 200 ms.
    expect(m.avgLatencyMs).toBe(200);
    expect(m.tasksCompleted).toBe(1);
  });

  it("computes a true mean rather than an EWMA", async () => {
    for (const ms of [100, 200, 300]) {
      await FeedbackService.recordTaskCompleted("agent-1", ms, true);
    }
    const m = await FeedbackService.getMetrics("agent-1");
    // Arithmetic mean is 200. The old `(avg + new) / 2` gave 237.5, weighting
    // the most recent sample at 50% no matter how much history existed.
    expect(m.avgLatencyMs).toBeCloseTo(200, 5);
    expect(m.tasksCompleted).toBe(3);
  });

  it("counts failures separately from completions", async () => {
    await FeedbackService.recordTaskCompleted("agent-1", 50, true);
    await FeedbackService.recordTaskCompleted("agent-1", 50, false);
    const m = await FeedbackService.getMetrics("agent-1");
    expect(m.tasksCompleted).toBe(1);
    expect(m.tasksFailed).toBe(1);
  });

  it("moves reputation up on praise and down on criticism", async () => {
    await AgentIdentityService.ensure("agent-1");
    const before = (await AgentIdentityService.get("agent-1"))!.reputationScore;
    await FeedbackService.record({
      targetAgentId: "agent-1", authorId: "human", kind: "upvote", refType: "task",
    } as never);
    const up = (await AgentIdentityService.get("agent-1"))!.reputationScore;
    expect(up).toBeGreaterThan(before);

    await FeedbackService.record({
      targetAgentId: "agent-1", authorId: "human", kind: "downvote", refType: "task",
    } as never);
    expect((await AgentIdentityService.get("agent-1"))!.reputationScore).toBeLessThan(up);
  });
});

describe("escalation routing", () => {
  async function lowConfidencePolicy(routeTo?: string) {
    return EscalationService.createPolicy({
      name: "low confidence", scope: "*", enabled: true,
      conditions: { minConfidence: 0.7 }, actions: ["notify_manager"], routeTo,
    } as never);
  }

  it("escalates when a condition is met", async () => {
    await lowConfidencePolicy("supervisor");
    const esc = await EscalationService.evaluate({ fromAgentId: "agent-1", confidence: 0.2 });
    expect(esc).not.toBeNull();
    expect(esc!.status).toBe("open");
    expect(esc!.toId).toBe("supervisor");
  });

  it("does not escalate a confident action", async () => {
    await lowConfidencePolicy();
    expect(await EscalationService.evaluate({ fromAgentId: "agent-1", confidence: 0.95 })).toBeNull();
  });

  it("ignores a disabled policy", async () => {
    const p = await lowConfidencePolicy("supervisor");
    await EscalationService.togglePolicy(p.id, false);
    expect(await EscalationService.evaluate({ fromAgentId: "agent-1", confidence: 0.1 })).toBeNull();
  });

  it("notifies the approver over the bus", async () => {
    await lowConfidencePolicy("supervisor");
    await EscalationService.evaluate({ fromAgentId: "agent-1", confidence: 0.1, taskId: "t-9" });
    const inbox = await CommProtocolService.listInbox("supervisor");
    expect(inbox.length).toBe(1);
    expect(inbox[0].type).toBe("escalation");
    expect(inbox[0].requiresAck).toBe(true);
  });

  it("respects policy scope", async () => {
    await EscalationService.createPolicy({
      name: "finance only", scope: "Finance", enabled: true,
      conditions: { minConfidence: 0.9 }, actions: ["notify_manager"],
    } as never);
    // The synthesised identity's department is "General", not "Finance".
    expect(await EscalationService.evaluate({ fromAgentId: "agent-1", confidence: 0.1 })).toBeNull();
  });
});
