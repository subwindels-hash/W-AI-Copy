/**
 * BusinessModuleService — Slice 237: CRM/ERP/HR/Finance/Billing/Marketing/Sales/Support/Procurement/Legal modules.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { BusinessModule, BusinessModuleCategory } from "@windels/shared";
import { ExtensionRegistryService } from "./registry.service.js";

const LIST = "ext:business";
const DETAIL = (id: string) => `ext:business:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const CATEGORIES: BusinessModuleCategory[] = ["crm","erp","hr","finance","billing","marketing","sales","support","procurement","legal"];

export const BusinessModuleService = {
  async list(category?: BusinessModuleCategory): Promise<BusinessModule[]> {
    const ids = await redis.smembers(LIST);
    const out: BusinessModule[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (!r) continue;
      const m = JSON.parse(r) as BusinessModule;
      if (category && m.category !== category) continue;
      out.push(m);
    }
    return out.sort((a,b)=>b.users - a.users);
  },
  async get(id: string): Promise<BusinessModule | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as BusinessModule) : null;
  },
  async register(input: Omit<BusinessModule, "id"|"updatedAt">): Promise<BusinessModule> {
    const id = randomUUID();
    const m: BusinessModule = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(m));
    await redis.sadd(LIST, id);
    return m;
  },
  categories: CATEGORIES,
};
