/**
 * SkillsService — Slice 239: Installable AI Skills (spreadsheet/contract/tax/engineering/CAD/...).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { AISkill, SkillCategory } from "@windels/shared";

const LIST = "ext:skills";
const DETAIL = (id: string) => `ext:skill:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const CATEGORIES: SkillCategory[] = [
  "spreadsheet","contract-review","tax","engineering","cad","procurement",
  "financial-modeling","healthcare-coding","erp","crm","marketing","research",
  "legal","data-analysis","writing","translation","custom",
];

export const SkillsService = {
  async list(category?: SkillCategory): Promise<AISkill[]> {
    const ids = await redis.smembers(LIST);
    const out: AISkill[] = [];
    for (const id of ids) {
      const r = await redis.get(DETAIL(id));
      if (!r) continue;
      const s = JSON.parse(r) as AISkill;
      if (category && s.category !== category) continue;
      out.push(s);
    }
    return out.sort((a,b)=>b.uses - a.uses);
  },
  async get(id: string): Promise<AISkill | null> {
    const r = await redis.get(DETAIL(id));
    return r ? (JSON.parse(r) as AISkill) : null;
  },
  async register(input: Omit<AISkill,"id"|"updatedAt">): Promise<AISkill> {
    const id = randomUUID();
    const s: AISkill = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(s));
    await redis.sadd(LIST, id);
    return s;
  },
  async invoke(id: string): Promise<AISkill | null> {
    const s = await this.get(id);
    if (!s) return null;
    s.uses += 1;
    s.updatedAt = iso();
    await redis.set(DETAIL(id), SER(s));
    return s;
  },
  categories: CATEGORIES,
};
