/**
 * In-memory stand-in for the Redis command surface used by the publishing
 * engine and token store. Used by unit tests; implements ioredis argument
 * shapes actually exercised (set EX/NX, zrange REV, zrangebyscore LIMIT).
 */
export class FakeKv {
  strings = new Map<string, { value: string; expiresAt?: number }>();
  hashes = new Map<string, Record<string, string>>();
  zsets = new Map<string, Map<string, number>>();
  lists = new Map<string, string[]>();
  sets = new Map<string, Set<string>>();

  private fresh(key: string): { value: string; expiresAt?: number } | undefined {
    const e = this.strings.get(key);
    if (e && e.expiresAt && e.expiresAt <= Date.now()) { this.strings.delete(key); return undefined; }
    return e;
  }

  async get(key: string): Promise<string | null> { return this.fresh(key)?.value ?? null; }

  async set(key: string, value: string, ...args: any[]): Promise<"OK" | null> {
    const strArgs = args.map(String);
    const nx = strArgs.includes("NX");
    const exIdx = strArgs.indexOf("EX");
    if (nx && this.fresh(key)) return null;
    this.strings.set(key, {
      value,
      expiresAt: exIdx >= 0 ? Date.now() + Number(args[exIdx + 1]) * 1000 : undefined,
    });
    return "OK";
  }

  async del(key: string): Promise<number> {
    const had =
      this.strings.delete(key) || this.hashes.delete(key) || this.zsets.delete(key) ||
      this.lists.delete(key) || this.sets.delete(key);
    return had ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.fresh(key) || this.hashes.has(key) || this.zsets.has(key) ||
      this.lists.has(key) || this.sets.has(key) ? 1 : 0;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key) ?? new Set<string>();
    let added = 0;
    for (const m of members.flat()) if (!s.has(String(m))) { s.add(String(m)); added++; }
    this.sets.set(key, s);
    return added;
  }

  async smembers(key: string): Promise<string[]> { return [...(this.sets.get(key) ?? [])]; }

  async srem(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members.flat()) if (s.delete(String(m))) removed++;
    return removed;
  }

  async scard(key: string): Promise<number> { return this.sets.get(key)?.size ?? 0; }

  async hset(key: string, field: string, value: string): Promise<number> {
    const h = this.hashes.get(key) ?? {};
    h[field] = value;
    this.hashes.set(key, h);
    return 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> { return this.hashes.get(key) ?? {}; }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    z.set(member, score);
    this.zsets.set(key, z);
    return 1;
  }

  async zrange(key: string, start: number, stop: number, ...args: any[]): Promise<string[]> {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    let members = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    if (args.map(String).includes("REV")) members = members.reverse();
    const end = stop === -1 ? members.length : stop + 1;
    return members.slice(start, end);
  }

  async zrangebyscore(key: string, min: number | string, max: number | string, ...args: any[]): Promise<string[]> {
    const lo = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const hi = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
    const z = this.zsets.get(key) ?? new Map<string, number>();
    let members = [...z.entries()].filter(([, sc]) => sc >= lo && sc <= hi).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    const strArgs = args.map(String);
    const li = strArgs.indexOf("LIMIT");
    if (li >= 0) members = members.slice(Number(args[li + 1]), Number(args[li + 1]) + Number(args[li + 2]));
    return members;
  }

  async zrem(key: string, member: string): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    return z.delete(member) ? 1 : 0;
  }

  async zcard(key: string): Promise<number> { return this.zsets.get(key)?.size ?? 0; }

  async lpush(key: string, value: string): Promise<number> {
    const l = this.lists.get(key) ?? [];
    l.unshift(value);
    this.lists.set(key, l);
    return l.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    const l = this.lists.get(key) ?? [];
    this.lists.set(key, l.slice(start, stop + 1));
    return "OK";
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const l = this.lists.get(key) ?? [];
    const end = stop === -1 ? l.length : stop + 1;
    return l.slice(start, end);
  }
}
