/** Platform-global site keys. These are not tenant data. */
import { redisCmd as redis } from "../db/redis.js";

export const SpKeys = {
  announcement: "sp:announcement",
  seo: "sp:seo",
  pages: "sp:seo:pages",
  page: (path: string) => `sp:seo:page:${path}`,
  smtp: "sp:smtp",
  chat: (id: string) => `sp:chat:${id}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export async function spGet<T>(key: string): Promise<T | null> {
  return j<T>(await redis.hget(key, "_doc"));
}
export async function spSet(key: string, value: unknown): Promise<void> {
  await redis.hset(key, "_doc", s2(value));
}
export async function spDel(key: string): Promise<void> {
  await redis.del(key);
}
export async function spPageIndex(): Promise<string[]> {
  const raw = await redis.hget(SpKeys.pages, "_doc");
  return raw ? (JSON.parse(raw) as string[]) : [];
}
export async function spRememberPage(path: string): Promise<void> {
  const idx = await spPageIndex();
  if (!idx.includes(path)) {
    idx.push(path);
    await redis.hset(SpKeys.pages, "_doc", s2(idx));
  }
}
