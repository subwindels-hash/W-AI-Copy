/**
 * Org-scoped Language Learning store.
 * Keys: ll:<entity>:i:<org>:<id>
 */

import { redisCmd as redis } from "../db/redis.js";

export type LlEntity =
  | "profile"
  | "assessment"
  | "path"
  | "lesson"
  | "vocab"
  | "grammar"
  | "conversation"
  | "writing"
  | "speaking"
  | "listening"
  | "session"
  | "plan"
  | "rec"
  | "audit"
  | "event";

export const LlKeys = {
  item: (e: LlEntity, org: string, id: string) => `ll:${e}:i:${org}:${id}`,
  idx: (e: LlEntity, org: string) => `ll:${e}:idx:${org}`,
  userIdx: (e: LlEntity, org: string, userId: string) => `ll:${e}:uix:${org}:${userId}`,
  uniq: (e: LlEntity, org: string, natural: string) => `ll:${e}:u:${org}:${natural}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export async function llRead<T extends { organizationId: string }>(
  entity: LlEntity,
  org: string,
  id: string,
): Promise<T | null> {
  const raw = await redis.hget(LlKeys.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

export async function llWrite(
  entity: LlEntity,
  org: string,
  rec: { id: string; createdAt?: string; userId?: string },
): Promise<void> {
  const score = rec.createdAt ? Date.parse(rec.createdAt) || Date.now() : Date.now();
  await redis.hset(LlKeys.item(entity, org, rec.id), "_doc", s2(rec));
  await redis.zadd(LlKeys.idx(entity, org), score, rec.id);
  if (rec.userId) {
    await redis.zadd(LlKeys.userIdx(entity, org, rec.userId), score, rec.id);
  }
}

export async function llDelete(entity: LlEntity, org: string, id: string): Promise<boolean> {
  const existed = await llRead<{ organizationId: string; userId?: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(LlKeys.item(entity, org, id));
  await redis.zrem(LlKeys.idx(entity, org), id);
  if (existed.userId) {
    await redis.zrem(LlKeys.userIdx(entity, org, existed.userId), id);
  }
  return true;
}

export async function llListIds(entity: LlEntity, org: string): Promise<string[]> {
  return redis.zrange(LlKeys.idx(entity, org), 0, -1);
}

export async function llList<T extends { organizationId: string }>(
  entity: LlEntity,
  org: string,
): Promise<T[]> {
  const ids = await llListIds(entity, org);
  const out: T[] = [];
  for (const id of ids) {
    const rec = await llRead<T>(entity, org, id);
    if (rec) out.push(rec);
  }
  return out;
}

export async function llUserIds(entity: LlEntity, org: string, userId: string): Promise<string[]> {
  return redis.zrange(LlKeys.userIdx(entity, org, userId), 0, -1);
}

export async function llListUser<T extends { organizationId: string; userId: string }>(
  entity: LlEntity,
  org: string,
  userId: string,
): Promise<T[]> {
  const ids = await llUserIds(entity, org, userId);
  const out: T[] = [];
  for (const id of ids) {
    const rec = await llRead<T>(entity, org, id);
    if (rec && rec.userId === userId) out.push(rec);
  }
  return out;
}

export async function llRememberNatural(
  entity: LlEntity,
  org: string,
  natural: string,
  id: string,
): Promise<void> {
  await redis.hset(LlKeys.uniq(entity, org, natural), "_id", id);
}

export async function llLookupNatural(
  entity: LlEntity,
  org: string,
  natural: string,
): Promise<string | null> {
  return redis.hget(LlKeys.uniq(entity, org, natural), "_id");
}

export async function llForgetNatural(entity: LlEntity, org: string, natural: string): Promise<void> {
  await redis.del(LlKeys.uniq(entity, org, natural));
}
