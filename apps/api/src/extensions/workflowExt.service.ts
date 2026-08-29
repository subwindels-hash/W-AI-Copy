/**
 * WorkflowExtService — Slice 241: Workflow extension nodes (trigger/action/condition/connector/...).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { WorkflowExt, WorkflowExtCategory } from "@windels/shared";

const LIST = "ext:workflows";
const DETAIL = (id: string) => `ext:wf:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const CATS: WorkflowExtCategory[] = ["trigger","action","condition","connector","transform","approval","notification","scheduling","ai-node"];

export const WorkflowExtService = {
  async list(category?: WorkflowExtCategory): Promise<WorkflowExt[]> {
    const ids = await redis.smembers(LIST);
    const out: WorkflowExt[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (!r) continue;
      const w = JSON.parse(r) as WorkflowExt;
      if (category && w.category !== category) continue;
      out.push(w);
    }
    return out.sort((a,b)=>b.invocations - a.invocations);
  },
  async get(id: string): Promise<WorkflowExt | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as WorkflowExt) : null;
  },
  async register(input: Omit<WorkflowExt,"id"|"updatedAt">): Promise<WorkflowExt> {
    const id = randomUUID();
    const w: WorkflowExt = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(w));
    await redis.sadd(LIST, id);
    return w;
  },
  categories: CATS,
};
