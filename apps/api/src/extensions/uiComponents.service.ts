/**
 * UIComponentsService — Slice 243: Installable UI component packs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { UIComponentExt, UIComponentCategory } from "@windels/shared";

const LIST = "ext:uicomponents";
const DETAIL = (id: string) => `ext:ui:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const CATS: UIComponentCategory[] = ["input","display","feedback","navigation","data-viz","media","layout","ai-primitives","form","chart"];

export const UIComponentsService = {
  async list(category?: UIComponentCategory): Promise<UIComponentExt[]> {
    const ids = await redis.smembers(LIST);
    const out: UIComponentExt[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (!r) continue;
      const c = JSON.parse(r) as UIComponentExt;
      if (category && c.category !== category) continue;
      out.push(c);
    }
    return out.sort((a,b)=>b.downloads - a.downloads);
  },
  async get(id: string): Promise<UIComponentExt | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as UIComponentExt) : null;
  },
  async register(input: Omit<UIComponentExt,"id"|"updatedAt">): Promise<UIComponentExt> {
    const id = randomUUID();
    const c: UIComponentExt = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(c));
    await redis.sadd(LIST, id);
    return c;
  },
  categories: CATS,
};
