/**
 * Org-scoped Lottery Intelligence store.
 * Keys: li:<entity>:i:<org>:<id>
 */

import { redisCmd as redis } from "../db/redis.js";

export type LiEntity =
  | "cfg"
  | "rules"
  | "draw"
  | "ticket"
  | "backtest"
  | "job"
  | "audit"
  | "stat"
  | "alert";

export const LiKeys = {
  item: (e: LiEntity, org: string, id: string) => `li:${e}:i:${org}:${id}`,
  idx: (e: LiEntity, org: string) => `li:${e}:idx:${org}`,
  uniq: (e: LiEntity, org: string, natural: string) => `li:${e}:u:${org}:${natural}`,
  userIdx: (org: string, userId: string) => `li:ticket:uix:${org}:${userId}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export async function liRead<T extends { organizationId: string }>(entity: LiEntity, org: string, id: string): Promise<T | null> {
  const raw = await redis.hget(LiKeys.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

export async function liWrite<T extends { id: string; createdAt?: string; userId?: string }>(entity: LiEntity, org: string, rec: T): Promise<void> {
  const score = rec.createdAt ? Date.parse(rec.createdAt) || Date.now() : Date.now();
  await redis.hset(LiKeys.item(entity, org, rec.id), "_doc", s2(rec));
  await redis.zadd(LiKeys.idx(entity, org), score, rec.id);
  if (entity === "ticket" && rec.userId) {
    await redis.zadd(LiKeys.userIdx(org, rec.userId), score, rec.id);
  }
}

export async function liDelete(entity: LiEntity, org: string, id: string): Promise<boolean> {
  const existed = await liRead<{ organizationId: string; userId?: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(LiKeys.item(entity, org, id));
  await redis.zrem(LiKeys.idx(entity, org), id);
  if (entity === "ticket" && existed.userId) {
    await redis.zrem(LiKeys.userIdx(org, existed.userId), id);
  }
  return true;
}

export async function liListIds(entity: LiEntity, org: string): Promise<string[]> {
  return redis.zrange(LiKeys.idx(entity, org), 0, -1);
}

export async function liList<T extends { organizationId: string }>(entity: LiEntity, org: string): Promise<T[]> {
  const ids = await liListIds(entity, org);
  const out: T[] = [];
  for (const id of ids) {
    const rec = await liRead<T>(entity, org, id);
    if (rec) out.push(rec);
  }
  return out;
}

export async function liRememberNatural(entity: LiEntity, org: string, natural: string, id: string): Promise<void> {
  await redis.hset(LiKeys.uniq(entity, org, natural), "_id", id);
}

export async function liLookupNatural(entity: LiEntity, org: string, natural: string): Promise<string | null> {
  return redis.hget(LiKeys.uniq(entity, org, natural), "_id");
}

export async function liUserTicketIds(org: string, userId: string): Promise<string[]> {
  return redis.zrange(LiKeys.userIdx(org, userId), 0, -1);
}
