/**
 * TechDebtService - Slice 213: Technical Debt Dashboard.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DebtCategory, DebtItem, DebtSeverity, DebtStatus, DebtSummary } from "@windels/shared";

const LIST_KEY = "eng:debt";
const COUNTER = "eng:debt:counter";
const DETAIL = (id: string) => `eng:debt:${id}`;

function iso() { return new Date().toISOString(); }
const SER = <T>(v: T) => JSON.stringify(v);

function rand(min: number, max: number) { return Math.round((min + max) / 2); } // deterministic

export const TechDebtService = {
  async list(limit = 100): Promise<DebtItem[]> {
    const ids = await redis.zrange(LIST_KEY, 0, limit - 1);
    const out: DebtItem[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as DebtItem);
    }
    return out;
  },
  async create(input: Partial<DebtItem>): Promise<DebtItem> {
    const n = await redis.incr(COUNTER);
    const id = randomUUID();
    const item: DebtItem = {
      id,
      key: `DEBT-${String(n).padStart(3, "0")}`,
      title: input.title ?? `Debt item ${n}`,
      category: (input.category as DebtCategory) ?? "code",
      severity: (input.severity as DebtSeverity) ?? "medium",
      area: input.area ?? "platform",
      owner: input.owner ?? "tbd",
      status: (input.status as DebtStatus) ?? "open",
      estimatedEffortHours: input.estimatedEffortHours ?? rand(2, 24),
      churnScore: input.churnScore ?? rand(10, 90),
      createdAt: iso(),
      updatedAt: iso(),
    };
    await redis.set(DETAIL(id), SER(item));
    await redis.zadd(LIST_KEY, n, id);
    return item;
  },
  async setStatus(id: string, status: DebtStatus): Promise<DebtItem | null> {
    const raw = await redis.get(DETAIL(id));
    if (!raw) return null;
    const item = JSON.parse(raw) as DebtItem;
    item.status = status;
    item.updatedAt = iso();
    await redis.set(DETAIL(id), SER(item));
    return item;
  },
  async summary(): Promise<DebtSummary> {
    const items = await this.list();
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const areaMap: Record<string, { items: number; effortHours: number; churn: number }> = {};
    let totalEffort = 0, added = 0, resolved = 0;
    const now = Date.now();
    for (const i of items) {
      bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
      byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
      totalEffort += i.estimatedEffortHours;
      if (!areaMap[i.area]) areaMap[i.area] = { items: 0, effortHours: 0, churn: 0 };
      areaMap[i.area].items++;
      areaMap[i.area].effortHours += i.estimatedEffortHours;
      areaMap[i.area].churn += i.churnScore;
      if (now - new Date(i.createdAt).getTime() < 30*86400_000 && i.status !== "resolved") added++;
      if (i.updatedAt && i.status === "resolved" && now - new Date(i.updatedAt).getTime() < 30*86400_000) resolved++;
    }
    const hotspots = Object.entries(areaMap)
      .map(([area, v]) => ({
        area,
        items: v.items,
        effortHours: v.effortHours,
        churnScore: Math.round(v.churn / v.items),
      }))
      .sort((a, b) => b.churnScore - a.churnScore)
      .slice(0, 6);
    return {
      totalItems: items.length,
      totalEffortHours: totalEffort,
      bySeverity, byCategory, byStatus,
      hotspots,
      trend30d: added > resolved ? "up" : added === resolved ? "flat" : "down",
      debtAddedLast30d: added,
      debtResolvedLast30d: resolved,
    };
  },
};
