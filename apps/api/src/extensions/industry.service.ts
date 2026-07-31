/**
 * IndustryModuleService — Slice 238: Industry vertical modules (government, healthcare, banking, etc.).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { IndustryModule, IndustryVertical } from "@windels/shared";

const LIST = "ext:industry";
const DETAIL = (id: string) => `ext:industry:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const VERTICALS: IndustryVertical[] = [
  "government","healthcare","banking","insurance","construction","manufacturing","mining","oil-gas",
  "energy","agriculture","education","retail","telecom","aviation","maritime","logistics",
  "hospitality","legal-services","real-estate","pharma","media","nonprofit","defense",
];

export const IndustryModuleService = {
  async list(vertical?: IndustryVertical): Promise<IndustryModule[]> {
    const ids = await redis.smembers(LIST);
    const out: IndustryModule[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (!r) continue;
      const m = JSON.parse(r) as IndustryModule;
      if (vertical && m.vertical !== vertical) continue;
      out.push(m);
    }
    return out.sort((a,b)=>b.aiEmployees - a.aiEmployees);
  },
  async get(id: string): Promise<IndustryModule | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as IndustryModule) : null;
  },
  async register(input: Omit<IndustryModule, "id"|"updatedAt">): Promise<IndustryModule> {
    const id = randomUUID();
    const m: IndustryModule = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(m));
    await redis.sadd(LIST, id);
    return m;
  },
  verticals: VERTICALS,
};
