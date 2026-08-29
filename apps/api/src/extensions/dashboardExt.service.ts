/**
 * DashboardExtService — Slice 242: Installable dashboard/widget packs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DashboardExt, DashboardWidgetKind } from "@windels/shared";

const LIST = "ext:dashboards";
const DETAIL = (id: string) => `ext:dash:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const KINDS: DashboardWidgetKind[] = ["kpi","chart","table","feed","map","timeline","gauge","heatmap","funnel","ai-insight"];

export const DashboardExtService = {
  async list(): Promise<DashboardExt[]> {
    const ids = await redis.smembers(LIST);
    const out: DashboardExt[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (r) out.push(JSON.parse(r) as DashboardExt);
    }
    return out.sort((a,b)=>b.installations - a.installations);
  },
  async get(id: string): Promise<DashboardExt | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as DashboardExt) : null;
  },
  async register(input: Omit<DashboardExt,"id"|"updatedAt">): Promise<DashboardExt> {
    const id = randomUUID();
    const d: DashboardExt = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(d));
    await redis.sadd(LIST, id);
    return d;
  },
  kinds: KINDS,
};
