/**
 * Governance Gates — org-scoped AI-decision approval gates.
 *
 * This backs the opex rollup's previously-structural `governance.gates` field
 * with a real store. A *gate* is an approval checkpoint at an authority level
 * (l1_auto…l5_board); a *request* is a decision that must pass a gate, and each
 * request is approved or rejected exactly once by a named actor with a recorded
 * timestamp. The rollup figures (pending, approved24h, rejected24h,
 * avgDecisionMin) are computed from those recorded decisions — never estimated.
 *
 * Everything is tenant-scoped in Redis (`opex:gov:*:<org>:*`); reads never leak
 * across organizations.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type {
  GovernanceGate,
  OpexGateLevel,
  OpexGateDecision,
  OpexGateRecord,
  OpexGateRequestRecord,
} from "@windels/shared/opex";

const K = {
  gateIdx: (org: string) => `opex:gov:gates:${org}`,
  gate: (org: string, id: string) => `opex:gov:gate:${org}:${id}`,
  reqIdx: (org: string, gateId: string) => `opex:gov:reqs:${org}:${gateId}`,
  req: (org: string, id: string) => `opex:gov:req:${org}:${id}`,
};
const DAY_MS = 86_400_000;

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw AppError.badRequest("organizationId is required");
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export const GovernanceGatesService = {
  async createGate(
    oid: string,
    input: { name: string; level: OpexGateLevel; description?: string },
    createdBy?: string,
  ): Promise<OpexGateRecord> {
    assertOrg(oid);
    const gate: OpexGateRecord = {
      id: `gate_${randomUUID().slice(0, 8)}`,
      name: input.name,
      level: input.level,
      description: input.description ?? null,
      createdAt: new Date().toISOString(),
      createdBy: createdBy ?? null,
    };
    await redis.set(K.gate(oid, gate.id), JSON.stringify(gate));
    await redis.zadd(K.gateIdx(oid), Date.now(), gate.id);
    return gate;
  },

  async listGates(oid: string): Promise<OpexGateRecord[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.gateIdx(oid), 0, -1, "REV");
    const out: OpexGateRecord[] = [];
    for (const id of ids) {
      const g = await readJson<OpexGateRecord>(K.gate(oid, id));
      if (g) out.push(g);
    }
    return out;
  },

  async getGate(oid: string, gateId: string): Promise<OpexGateRecord | null> {
    assertOrg(oid);
    return readJson<OpexGateRecord>(K.gate(oid, gateId));
  },

  /** Open a pending approval request against a gate. */
  async openRequest(
    oid: string,
    gateId: string,
    input: { subject: string; detail?: string },
    requestedBy?: string,
  ): Promise<OpexGateRequestRecord> {
    assertOrg(oid);
    const gate = await this.getGate(oid, gateId);
    if (!gate) throw AppError.notFound("Governance gate not found in organization");
    const req: OpexGateRequestRecord = {
      id: `greq_${randomUUID().slice(0, 8)}`,
      gateId,
      subject: input.subject,
      detail: input.detail ?? null,
      status: "pending",
      requestedBy: requestedBy ?? null,
      requestedAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
    };
    await redis.set(K.req(oid, req.id), JSON.stringify(req));
    await redis.zadd(K.reqIdx(oid, gateId), Date.now(), req.id);
    return req;
  },

  /** Decide a pending request. A request is decided exactly once. */
  async decideRequest(
    oid: string,
    gateId: string,
    requestId: string,
    decision: OpexGateDecision,
    decidedBy: string,
    reason?: string,
  ): Promise<OpexGateRequestRecord> {
    assertOrg(oid);
    if (!decidedBy) throw AppError.badRequest("A deciding user is required");
    const req = await readJson<OpexGateRequestRecord>(K.req(oid, requestId));
    if (!req || req.gateId !== gateId) throw AppError.notFound("Gate request not found in organization");
    if (req.status !== "pending") throw AppError.conflict(`Request is already ${req.status}`);
    const next: OpexGateRequestRecord = {
      ...req,
      status: decision,
      decidedBy,
      decidedAt: new Date().toISOString(),
      decisionReason: reason ?? null,
    };
    await redis.set(K.req(oid, requestId), JSON.stringify(next));
    return next;
  },

  async listRequests(oid: string, gateId: string, limit = 200): Promise<OpexGateRequestRecord[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.reqIdx(oid, gateId), 0, -1, "REV");
    const out: OpexGateRequestRecord[] = [];
    for (const id of ids.slice(0, limit)) {
      const r = await readJson<OpexGateRequestRecord>(K.req(oid, id));
      if (r) out.push(r);
    }
    return out;
  },

  /**
   * Compute the opex governance rollup from stored gates and their decisions.
   * `pendingTotal` and every per-gate figure are real counts over recorded
   * requests; `avgDecisionMin` is the mean wall-clock minutes from request to
   * decision over the last 24h of decisions (0 when none were decided).
   */
  async rollup(oid: string, now = Date.now()): Promise<{ gates: GovernanceGate[]; pendingTotal: number }> {
    assertOrg(oid);
    const gates = await this.listGates(oid);
    const cutoff = now - DAY_MS;
    let pendingTotal = 0;

    const rows: GovernanceGate[] = [];
    for (const gate of gates) {
      const requests = await this.listRequests(oid, gate.id, 1000);
      const pending = requests.filter((r) => r.status === "pending").length;
      pendingTotal += pending;

      const decided24h = requests.filter(
        (r) => r.status !== "pending" && r.decidedAt !== null && Date.parse(r.decidedAt) >= cutoff,
      );
      const approved24h = decided24h.filter((r) => r.status === "approved").length;
      const rejected24h = decided24h.filter((r) => r.status === "rejected").length;

      const durations = decided24h.map((r) => Date.parse(r.decidedAt!) - Date.parse(r.requestedAt));
      const avgDecisionMin =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60_000)
          : 0;

      rows.push({ id: gate.id, name: gate.name, level: gate.level, pending, approved24h, rejected24h, avgDecisionMin });
    }

    return { gates: rows, pendingTotal };
  },
};

export default GovernanceGatesService;
