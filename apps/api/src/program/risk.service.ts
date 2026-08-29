/**
 * RiskService - Slice 209: Risk Management Agent.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Mitigation, Risk, RiskCategory, RiskMatrix, RiskStatus } from "@windels/shared";

const LIST_KEY = "pgm:risks";
const DETAIL = (id: string) => `pgm:risk:${id}`;
const COUNTER = "pgm:risk:counter";

function iso() { return new Date().toISOString(); }
const ser = <T>(v: T) => JSON.stringify(v);

export const RiskService = {
  async list(): Promise<Risk[]> {
    const ids = await redis.zrange(LIST_KEY, 0, -1);
    const out: Risk[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as Risk);
    }
    return out;
  },
  async create(input: Partial<Risk>): Promise<Risk> {
    const n = await redis.incr(COUNTER);
    const id = randomUUID();
    const risk: Risk = {
      id,
      key: `RSK-${String(n).padStart(3, "0")}`,
      title: input.title ?? `Risk ${n}`,
      category: (input.category as RiskCategory) ?? "technical",
      likelihood: (input.likelihood ?? 3) as Risk["likelihood"],
      impact: (input.impact ?? 3) as Risk["impact"],
      status: (input.status as RiskStatus) ?? "identified",
      owner: input.owner ?? "tbd",
      description: input.description ?? "",
      mitigations: (input.mitigations as Mitigation[]) ?? [],
      createdAt: iso(),
    };
    await redis.set(DETAIL(id), ser(risk));
    await redis.zadd(LIST_KEY, n, id);
    return risk;
  },
  async addMitigation(riskId: string, action: string, owner: string): Promise<Risk | null> {
    const raw = await redis.get(DETAIL(riskId));
    if (!raw) return null;
    const risk = JSON.parse(raw) as Risk;
    risk.mitigations.push({
      id: randomUUID(),
      action,
      owner,
      status: "planned",
    });
    risk.status = "mitigating";
    await redis.set(DETAIL(riskId), ser(risk));
    return risk;
  },
  async setStatus(riskId: string, status: RiskStatus): Promise<Risk | null> {
    const raw = await redis.get(DETAIL(riskId));
    if (!raw) return null;
    const risk = JSON.parse(raw) as Risk;
    risk.status = status;
    await redis.set(DETAIL(riskId), ser(risk));
    return risk;
  },
  async matrix(): Promise<RiskMatrix> {
    const risks = await this.list();
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let critical = 0, high = 0, residual = 0;
    for (const r of risks) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      const score = r.likelihood * r.impact;
      if (score >= 20) critical++;
      else if (score >= 12) high++;
      const mitigationFactor = r.status === "resolved" ? 0.1 : r.status === "mitigating" ? 0.6 : r.status === "accepted" ? 0.8 : 1;
      residual += score * mitigationFactor;
    }
    return {
      total: risks.length,
      byCategory,
      byStatus,
      criticalCount: critical,
      highCount: high,
      residualScore: Math.round(residual),
    };
  },
};
