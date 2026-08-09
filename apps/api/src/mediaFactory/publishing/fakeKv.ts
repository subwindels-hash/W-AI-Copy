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

  /** DUMP — serialized value (here the string as a Buffer) or null. */
  async dump(key: string): Promise<Buffer | null> {
    const v = this.fresh(key)?.value;
    return v === undefined ? null : Buffer.from(v);
  }
  /** RESTORE — recreate a key from a DUMP value (ttl ignored, seconds→ms). */
  async restore(key: string, ttl: number, value: Buffer | string): Promise<"OK"> {
    const v = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
    const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : undefined;
    this.strings.set(key, { value: v, expiresAt });
    return "OK";
  }

  /** INCR / INCRBY / DECR — used by id counters (sprint numbers, story keys). */
  async incrby(key: string, by: number): Promise<number> {
    const next = Number(this.fresh(key)?.value ?? 0) + by;
    this.strings.set(key, { value: String(next) });
    return next;
  }
  async incr(key: string): Promise<number> { return this.incrby(key, 1); }
  async decr(key: string): Promise<number> { return this.incrby(key, -1); }

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

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys.flat()) {
      if (
        this.strings.delete(k) || this.hashes.delete(k) || this.zsets.delete(k) ||
        this.lists.delete(k) || this.sets.delete(k)
      ) n++;
    }
    return n;
  }

  async exists(key: string): Promise<number> {
    return this.fresh(key) || this.hashes.has(key) || this.zsets.has(key) ||
      this.lists.has(key) || this.sets.has(key) ? 1 : 0;
  }

  /** EXPIRE — set/adjust a string key's TTL (used by the auth refresh-token store). */
  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.strings.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key) ?? new Set<string>();
    let added = 0;
    for (const m of members.flat()) if (!s.has(String(m))) { s.add(String(m)); added++; }
    this.sets.set(key, s);
    return added;
  }

  async smembers(key: string): Promise<string[]> { return [...(this.sets.get(key) ?? [])]; }

  /** keys(pattern) — matches the Redis glob (supports `prefix*`). */
  async keys(pattern: string): Promise<string[]> {
    const out: string[] = [];
    const collect = (k: string) => {
      if (pattern === "*") { out.push(k); return; }
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        if (k.startsWith(prefix)) out.push(k);
      } else if (k === pattern) out.push(k);
    };
    for (const k of this.strings.keys()) collect(k);
    for (const k of this.hashes.keys()) collect(k);
    for (const k of this.zsets.keys()) collect(k);
    for (const k of this.lists.keys()) collect(k);
    for (const k of this.sets.keys()) collect(k);
    return out;
  }

  /**
   * SISMEMBER — returns 1/0 like ioredis (not a boolean).
   *
   * Added for MfaService.verify(), which checks a recovery-code hash for set
   * membership. Without it the fake threw `sismember is not a function`, which
   * is why the recovery-code branch of MFA had never been exercised.
   */
  async sismember(key: string, member: string): Promise<number> {
    return this.sets.get(key)?.has(String(member)) ? 1 : 0;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members.flat()) if (s.delete(String(m))) removed++;
    return removed;
  }

  async scard(key: string): Promise<number> { return this.sets.get(key)?.size ?? 0; }

  /**
   * HSET in all three shapes ioredis accepts:
   *   hset(key, field, value)
   *   hset(key, field, value, field2, value2, ...)
   *   hset(key, { field: value, ... })
   * Only the first was supported, so services that write a whole record in one
   * call (release/pipeline.service.ts) silently stored nothing under test.
   */
  async hset(key: string, ...rest: any[]): Promise<number> {
    const h = this.hashes.get(key) ?? {};
    let written = 0;
    if (rest.length === 1 && rest[0] && typeof rest[0] === "object") {
      for (const [f, v] of Object.entries(rest[0] as Record<string, unknown>)) {
        h[f] = String(v); written++;
      }
    } else {
      for (let i = 0; i + 1 < rest.length; i += 2) {
        h[String(rest[i])] = String(rest[i + 1]); written++;
      }
    }
    this.hashes.set(key, h);
    return written;
  }

  async hgetall(key: string): Promise<Record<string, string>> { return this.hashes.get(key) ?? {}; }

  async hlen(key: string): Promise<number> { return this.hashes.get(key) ? Object.keys(this.hashes.get(key)!).length : 0; }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const h = this.hashes.get(key);
    if (!h) return 0;
    let removed = 0;
    for (const f of fields) if (delete h[f]) removed++;
    return removed;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.[field] ?? null;
  }

  async hincrby(key: string, field: string, by: number): Promise<number> {
    const h = this.hashes.get(key) ?? {};
    const next = Number(h[field] ?? "0") + by;
    h[field] = String(next);
    this.hashes.set(key, h);
    return next;
  }

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

  async zscore(key: string, member: string): Promise<string | null> {
    const v = this.zsets.get(key)?.get(member);
    return v === undefined ? null : String(v);
  }

  /** zcount — count members with a score within [min,max] (inclusive bounds
   *  parsed from numbers; Redis "(min" exclusive syntax is not used here). */
  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    const lo = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const hi = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
    let n = 0;
    for (const sc of z.values()) if (sc >= lo && sc <= hi) n++;
    return n;
  }

  /** incrbyfloat — decimal increment on a string value. */
  async incrbyfloat(key: string, by: number): Promise<string> {
    const next = Number(this.fresh(key)?.value ?? 0) + by;
    this.strings.set(key, { value: String(next) });
    return String(next);
  }

  /** eval — supports the simple NX/PX SET lock script and check-and-del used by
   *  the gift-card redemption lock. Unknown scripts return 0. */
  async eval(script: string, _numkeys: number, ...args: any[]): Promise<number> {
    const a = args.map(String);
    if (script.includes("NX')") || /NX','PX/.test(script)) {
      // SET key val NX PX ttl
      const [key, val, , , ttl] = a;
      if (this.strings.has(key)) return 0;
      this.strings.set(key, { value: val, expiresAt: Date.now() + Number(ttl) });
      return 1;
    }
    if (script.includes("GET")) {
      // if GET key == val then DEL key
      const [key, val] = a;
      if (this.strings.get(key)?.value === val) { this.strings.delete(key); return 1; }
      return 0;
    }
    return 0;
  }

  /** Trim a sorted set to the given rank window (negative indexes count back). */
  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    const ordered = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    const n = ordered.length;
    const lo = start < 0 ? Math.max(0, n + start) : start;
    const hi = stop < 0 ? n + stop : stop;
    let removed = 0;
    for (let i = lo; i <= hi && i < n; i++) { if (z.delete(ordered[i]!)) removed++; }
    return removed;
  }

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

  async rpush(key: string, value: string): Promise<number> {
    const l = this.lists.get(key) ?? [];
    l.push(value);
    this.lists.set(key, l);
    return l.length;
  }

  /**
   * LREM — remove elements equal to `value`, matching ioredis semantics:
   * count > 0 removes that many from the head, count < 0 from the tail, and
   * count === 0 removes every occurrence. Added for Session 115's collection
   * deletion, which has to take an id back out of the per-org index list.
   */
  async lrem(key: string, count: number, value: string): Promise<number> {
    const l = this.lists.get(key);
    if (!l) return 0;
    const target = String(value);
    let removed = 0;
    let out: string[];
    if (count === 0) {
      out = l.filter((item) => {
        if (item === target) { removed++; return false; }
        return true;
      });
    } else if (count > 0) {
      out = [];
      for (const item of l) {
        if (item === target && removed < count) { removed++; continue; }
        out.push(item);
      }
    } else {
      out = [];
      for (let i = l.length - 1; i >= 0; i--) {
        const item = l[i]!;
        if (item === target && removed < -count) { removed++; continue; }
        out.unshift(item);
      }
    }
    this.lists.set(key, out);
    return removed;
  }

  /** RPOP — remove and return the rightmost element of a list (or null). */
  async rpop(key: string): Promise<string | null> {
    const l = this.lists.get(key);
    if (!l || l.length === 0) return null;
    return l.pop() ?? null;
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const lo = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const hi = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
    const z = this.zsets.get(key);
    if (!z) return 0;
    let removed = 0;
    for (const [m, sc] of [...z.entries()]) if (sc >= lo && sc <= hi) { z.delete(m); removed++; }
    return removed;
  }

  /**
   * Minimal ioredis pipeline. Commands are queued and applied in order on
   * exec(); this fake is single-threaded so no real atomicity is required.
   */
  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const self = this;
    const chain = {
      set(key: string, value: string, ...args: any[]) { ops.push(() => self.set(key, value, ...args)); return chain; },
      del(...keys: string[]) { for (const k of keys.flat()) ops.push(() => self.del(k)); return chain; },
      hset(key: string, ...rest: any[]) { ops.push(() => self.hset(key, ...rest)); return chain; },
      hincrby(key: string, field: string, by: number) { ops.push(() => self.hincrby(key, field, by)); return chain; },
      sadd(key: string, ...members: string[]) { ops.push(() => self.sadd(key, ...members)); return chain; },
      srem(key: string, ...members: string[]) { ops.push(() => self.srem(key, ...members)); return chain; },
      zadd(key: string, score: number, member: string) { ops.push(() => self.zadd(key, score, member)); return chain; },
      lpush(key: string, value: string) { ops.push(() => self.lpush(key, value)); return chain; },
      // rpush/incr/expire existed on the class but were missing from the multi
      // chain, so a queued call threw inside the pipeline. Services wrap
      // pipeline.exec() in try/catch, so the write was silently dropped and the
      // data simply never appeared — the failure mode is invisible.
      rpush(key: string, value: string) { ops.push(() => self.rpush(key, value)); return chain; },
      incr(key: string) { ops.push(() => self.incr(key)); return chain; },
      incrby(key: string, by: number) { ops.push(() => self.incrby(key, by)); return chain; },
      expire(_key: string, _sec: number) { ops.push(async () => 1); return chain; },
      zremrangebyrank(key: string, start: number, stop: number) { ops.push(() => self.zremrangebyrank(key, start, stop)); return chain; },
      ltrim(key: string, start: number, stop: number) { ops.push(() => self.ltrim(key, start, stop)); return chain; },
      async exec() {
        const out: Array<[null, unknown]> = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return chain;
  }
}
