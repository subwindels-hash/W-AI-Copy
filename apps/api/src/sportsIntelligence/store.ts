/**
 * Org-scoped Sports Intelligence store.
 *
 * Keys: si:<entity>:i:<org>:<id>  +  si:<entity>:idx:<org>
 * Tenant isolation matches CRM / Session 89 (org segment after the prefix).
 */

import { redisCmd as redis } from "../db/redis.js";

export type SiEntity =
  | "league"
  | "team"
  | "match"
  | "odds"
  | "pred"
  | "ticket"
  | "result"
  | "job"
  | "cfg"
  | "model"
  | "backtest"
  | "audit"
  | "health"
  | "alert"
  | "dayticket";

export const SiKeys = {
  item: (e: SiEntity, org: string, id: string) => `si:${e}:i:${org}:${id}`,
  idx: (e: SiEntity, org: string) => `si:${e}:idx:${org}`,
  uniq: (e: SiEntity, org: string, natural: string) => `si:${e}:u:${org}:${natural}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export async function siRead<T extends { organizationId: string }>(
  entity: SiEntity,
  org: string,
  id: string,
): Promise<T | null> {
  const raw = await redis.hget(SiKeys.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

export async function siWrite(entity: SiEntity, org: string, rec: { id: string; createdAt?: string }): Promise<void> {
  const score = rec.createdAt ? Date.parse(rec.createdAt) || Date.now() : Date.now();
  await redis.hset(SiKeys.item(entity, org, rec.id), "_doc", s2(rec));
  await redis.zadd(SiKeys.idx(entity, org), score, rec.id);
}

export async function siDelete(entity: SiEntity, org: string, id: string): Promise<boolean> {
  const existed = await siRead(entity, org, id);
  if (!existed) return false;
  await redis.del(SiKeys.item(entity, org, id));
  await redis.zrem(SiKeys.idx(entity, org), id);
  return true;
}

export async function siListIds(entity: SiEntity, org: string): Promise<string[]> {
  return redis.zrange(SiKeys.idx(entity, org), 0, -1);
}

export async function siList<T extends { organizationId: string }>(entity: SiEntity, org: string): Promise<T[]> {
  const ids = await siListIds(entity, org);
  const out: T[] = [];
  for (const id of ids) {
    const rec = await siRead<T>(entity, org, id);
    if (rec) out.push(rec);
  }
  return out;
}

export async function siRememberNatural(entity: SiEntity, org: string, natural: string, id: string): Promise<void> {
  await redis.hset(SiKeys.uniq(entity, org, natural), "_id", id);
}

export async function siLookupNatural(entity: SiEntity, org: string, natural: string): Promise<string | null> {
  return redis.hget(SiKeys.uniq(entity, org, natural), "_id");
}
