/**
 * AI-Decision Explanations — org-scoped explainability register.
 *
 * Backs the opex rollup's previously-structural `explanations` field with a real
 * store. Each record is the recorded rationale for an AI/automated decision:
 * its confidence, evidence count, knowledge sources, policy checks and risks,
 * plus an optional challenge with an upheld/overturned outcome. The rollup
 * figures are computed from stored records only, never estimated:
 *   - available24h     = explanations recorded in the last 24h
 *   - avgEvidence      = mean evidenceCount (0 when none)
 *   - avgConfidence    = mean confidence % (0 when none)
 *   - challenged       = explanations with a recorded challenge
 *   - challengedUpheld = challenges whose outcome upheld the decision
 *
 * Tenant-scoped in Redis (`opex:xpl:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type {
  Explanation,
  OpexExplanationCreateInput,
} from "@windels/shared/opex";

interface ExplanationRecord extends Explanation {
  createdAt: string;
  challenge: { outcome: "upheld" | "overturned"; reason: string | null; at: string; by: string | null } | null;
}

const K = {
  idx: (org: string) => `opex:xpl:idx:${org}`,
  item: (org: string, id: string) => `opex:xpl:i:${org}:${id}`,
};
const DAY_MS = 86_400_000;

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw AppError.badRequest("organizationId is required");
  }
}

async function read(org: string, id: string): Promise<ExplanationRecord | null> {
  const raw = await redis.get(K.item(org, id));
  if (!raw) return null;
  const rec = JSON.parse(raw) as ExplanationRecord;
  return rec.id === id ? rec : null;
}

function toPublic(rec: ExplanationRecord): Explanation {
  const { createdAt: _c, challenge: _ch, ...pub } = rec;
  return pub;
}

export const ExplanationsRegistryService = {
  async record(oid: string, input: OpexExplanationCreateInput): Promise<Explanation> {
    assertOrg(oid);
    const rec: ExplanationRecord = {
      id: `xpl_${randomUUID().slice(0, 8)}`,
      decisionId: input.decisionId,
      decisionSummary: input.decisionSummary,
      confidence: input.confidence,
      evidenceCount: input.evidenceCount,
      knowledgeSources: input.knowledgeSources,
      memoryTouches: input.memoryTouches,
      toolCalls: input.toolCalls,
      policyChecks: input.policyChecks,
      risks: input.risks,
      ...(input.humanApprover ? { humanApprover: input.humanApprover } : {}),
      createdAt: new Date().toISOString(),
      challenge: null,
    };
    await redis.set(K.item(oid, rec.id), JSON.stringify(rec));
    await redis.zadd(K.idx(oid), Date.now(), rec.id);
    return toPublic(rec);
  },

  /** Record a challenge outcome against an explanation (decided once). */
  async challenge(
    oid: string,
    id: string,
    outcome: "upheld" | "overturned",
    by: string,
    reason?: string,
  ): Promise<Explanation> {
    assertOrg(oid);
    if (!by) throw AppError.badRequest("A challenging user is required");
    const rec = await read(oid, id);
    if (!rec) throw AppError.notFound("Explanation not found in organization");
    if (rec.challenge) throw AppError.conflict("Explanation has already been challenged");
    rec.challenge = { outcome, reason: reason ?? null, at: new Date().toISOString(), by };
    await redis.set(K.item(oid, id), JSON.stringify(rec));
    return toPublic(rec);
  },

  async get(oid: string, id: string): Promise<Explanation | null> {
    assertOrg(oid);
    const rec = await read(oid, id);
    return rec ? toPublic(rec) : null;
  },

  async list(oid: string, limit = 200): Promise<Explanation[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const out: Explanation[] = [];
    for (const id of ids.slice(0, limit)) {
      const rec = await read(oid, id);
      if (rec) out.push(toPublic(rec));
    }
    return out;
  },

  /** Compute the opex explanations rollup + recent list. `now` injectable. */
  async rollup(oid: string, now = Date.now()): Promise<{
    summary: { available24h: number; avgEvidence: number; avgConfidence: number; challenged: number; challengedUpheld: number };
    recent: Explanation[];
  }> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const records: ExplanationRecord[] = [];
    for (const id of ids) {
      const rec = await read(oid, id);
      if (rec) records.push(rec);
    }
    if (records.length === 0) {
      return { summary: { available24h: 0, avgEvidence: 0, avgConfidence: 0, challenged: 0, challengedUpheld: 0 }, recent: [] };
    }
    const cutoff = now - DAY_MS;
    const available24h = records.filter((r) => Date.parse(r.createdAt) >= cutoff).length;
    const avgEvidence = Math.round(records.reduce((s, r) => s + r.evidenceCount, 0) / records.length);
    const avgConfidence = Math.round((records.reduce((s, r) => s + r.confidence, 0) / records.length) * 100);
    const challengedRecords = records.filter((r) => r.challenge !== null);
    const challenged = challengedRecords.length;
    const challengedUpheld = challengedRecords.filter((r) => r.challenge!.outcome === "upheld").length;
    return {
      summary: { available24h, avgEvidence, avgConfidence, challenged, challengedUpheld },
      recent: records.slice(0, 20).map(toPublic),
    };
  },
};

export default ExplanationsRegistryService;
