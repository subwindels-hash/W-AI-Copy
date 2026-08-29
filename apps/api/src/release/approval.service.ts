/**
 * ApprovalService - Slice 200: Governance Approval gates.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ApprovalGate, ApprovalStatus, ApprovalRecord, ApprovalSummary } from "@windels/shared";

const KEY = (rid: string) => `rel:approvals:${rid}`;

const DEFAULT_GATES: ApprovalGate[] = [
  "engineering_lead",
  "security_review",
  "qa_signoff",
  "product_owner",
];

const HIGH_RISK_GATES: ApprovalGate[] = [...DEFAULT_GATES, "change_advisory_board", "sre_oncall"];

function iso() { return new Date().toISOString(); }

function gatesForRisk(risk: string): ApprovalGate[] {
  if (risk === "high" || risk === "critical") return HIGH_RISK_GATES;
  return DEFAULT_GATES;
}

export const ApprovalService = {
  async seedGates(releaseId: string, risk: string): Promise<ApprovalRecord[]> {
    const required = gatesForRisk(risk);
    const multi = redis.multi();
    multi.del(KEY(releaseId));
    const records: ApprovalRecord[] = required.map((g) => ({
      id: randomUUID(),
      releaseId,
      gate: g,
      approver: "",
      status: "pending" as ApprovalStatus,
    }));
    for (const r of records) {
      multi.hset(KEY(releaseId), r.gate, JSON.stringify(r));
    }
    await multi.exec();
    return records;
  },
  async list(releaseId: string): Promise<ApprovalRecord[]> {
    const raw = await redis.hgetall(KEY(releaseId));
    return Object.values(raw).map((s) => JSON.parse(s) as ApprovalRecord);
  },
  async vote(
    releaseId: string,
    gate: ApprovalGate,
    approver: string,
    status: ApprovalStatus,
    comment?: string,
  ): Promise<ApprovalRecord | null> {
    const raw = await redis.hget(KEY(releaseId), gate);
    if (!raw) return null;
    const rec: ApprovalRecord = JSON.parse(raw);
    rec.approver = approver;
    rec.status = status;
    rec.comment = comment;
    rec.at = iso();
    await redis.hset(KEY(releaseId), gate, JSON.stringify(rec));
    return rec;
  },
  async summary(releaseId: string, risk: string): Promise<ApprovalSummary> {
    const required = gatesForRisk(risk);
    let all = await this.list(releaseId);
    if (all.length === 0) {
      await this.seedGates(releaseId, risk);
      all = await this.list(releaseId);
    }
    const approved = all.filter((r) => r.status === "approved").map((r) => r.gate);
    const rejected = all.filter((r) => r.status === "rejected").map((r) => r.gate);
    const pending = all.filter((r) => r.status === "pending" || r.status === "waived").map((r) => r.gate);
    const quorumMet = approved.length >= required.length && rejected.length === 0;
    return { required, approved, rejected, pending, quorumMet };
  },
};
