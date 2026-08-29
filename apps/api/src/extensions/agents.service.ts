/**
 * AgentsService — Slice 240: Custom AI Agent templates installable as extensions.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { CustomAgentDef, AgentDepartment } from "@windels/shared";

const LIST = "ext:agents";
const DETAIL = (id: string) => `ext:agent:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const DEPTS: AgentDepartment[] = ["executive","engineering","marketing","sales","support","finance","legal","hr","research","operations","custom"];

export const AgentsService = {
  async list(dept?: AgentDepartment): Promise<CustomAgentDef[]> {
    const ids = await redis.smembers(LIST);
    const out: CustomAgentDef[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (!r) continue;
      const a = JSON.parse(r) as CustomAgentDef;
      if (dept && a.department !== dept) continue;
      out.push(a);
    }
    return out.sort((a,b)=>b.tasksCompleted - a.tasksCompleted);
  },
  async get(id: string): Promise<CustomAgentDef | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as CustomAgentDef) : null;
  },
  async register(input: Omit<CustomAgentDef,"id"|"updatedAt">): Promise<CustomAgentDef> {
    const id = randomUUID();
    const a: CustomAgentDef = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(a));
    await redis.sadd(LIST, id);
    return a;
  },
  departments: DEPTS,
};
