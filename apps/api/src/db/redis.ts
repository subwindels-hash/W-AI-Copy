import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";

class MockRedis {
  store = new Map<string, any>();

  constructor() {}

  get status() {
    return "ready";
  }

  async ping() {
    return "PONG";
  }

  async keys(pattern: string) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async subscribe(..._channels: string[]) {
    return 1;
  }

  async expire(_key: string, _seconds: number) {
    return 1;
  }

  async get(key: string) {
    const v = this.store.get(key);
    return v !== undefined ? String(v) : null;
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }

  async exists(key: string) {
    return this.store.has(key) ? 1 : 0;
  }

  async del(key: string) {
    const had = this.store.has(key);
    this.store.delete(key);
    return had ? 1 : 0;
  }

  async incr(key: string) {
    const val = Number(await this.get(key) || 0) + 1;
    await this.set(key, String(val));
    return val;
  }

  async hset(key: string, field: string, value: string) {
    let map = this.store.get(key);
    if (!map || !(map instanceof Map)) {
      map = new Map();
      this.store.set(key, map);
    }
    map.set(field, value);
    return 1;
  }

  async hget(key: string, field: string) {
    const map = this.store.get(key);
    if (!map || !(map instanceof Map)) return null;
    const v = map.get(field);
    return v !== undefined ? String(v) : null;
  }

  async hgetall(key: string) {
    const map = this.store.get(key);
    if (!map || !(map instanceof Map)) return {};
    return Object.fromEntries(map.entries());
  }

  async sadd(key: string, ...members: string[]) {
    let set = this.store.get(key);
    if (!set || !(set instanceof Set)) {
      set = new Set();
      this.store.set(key, set);
    }
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  async sismember(key: string, member: string) {
    const set = this.store.get(key);
    if (!set || !(set instanceof Set)) return 0;
    return set.has(member) ? 1 : 0;
  }

  async srem(key: string, member: string) {
    const set = this.store.get(key);
    if (!set || !(set instanceof Set)) return 0;
    return set.delete(member) ? 1 : 0;
  }

  async smembers(key: string) {
    const set = this.store.get(key);
    if (!set || !(set instanceof Set)) return [];
    return Array.from(set);
  }

  async scard(key: string) {
    const set = this.store.get(key);
    if (!set || !(set instanceof Set)) return 0;
    return set.size;
  }

  async lpush(key: string, ...values: string[]) {
    let list = this.store.get(key);
    if (!list || !Array.isArray(list)) {
      list = [];
      this.store.set(key, list);
    }
    list.unshift(...values);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number) {
    const list = this.store.get(key);
    if (!list || !Array.isArray(list)) return [];
    const actualStop = stop === -1 ? list.length : stop + 1;
    return list.slice(start, actualStop);
  }

  async ltrim(key: string, start: number, stop: number) {
    const list = this.store.get(key);
    if (!list || !Array.isArray(list)) return "OK";
    const actualStop = stop === -1 ? list.length : stop + 1;
    const trimmed = list.slice(start, actualStop);
    this.store.set(key, trimmed);
    return "OK";
  }

  /**
   * LREM with ioredis semantics (count > 0 from the head, < 0 from the tail,
   * 0 removes all). The mock had no `lrem` at all, so every caller of it —
   * media generation's pending queue, the global scheduler's dead letters and
   * now Session 115's collection deletion — threw here rather than degrading.
   */
  async lrem(key: string, count: number, value: string) {
    const list = this.store.get(key);
    if (!list || !Array.isArray(list)) return 0;
    const target = String(value);
    let removed = 0;
    let out: string[];
    if (count === 0) {
      out = list.filter((item: string) => {
        if (item === target) { removed++; return false; }
        return true;
      });
    } else if (count > 0) {
      out = [];
      for (const item of list) {
        if (item === target && removed < count) { removed++; continue; }
        out.push(item);
      }
    } else {
      out = [];
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (item === target && removed < -count) { removed++; continue; }
        out.unshift(item);
      }
    }
    this.store.set(key, out);
    return removed;
  }

  async zadd(key: string, score: number, member: string) {
    let zset = this.store.get(key);
    if (!zset || !Array.isArray(zset)) {
      zset = []; // array of { member, score }
      this.store.set(key, zset);
    }
    const idx = zset.findIndex((item: any) => item.member === member);
    if (idx >= 0) {
      zset[idx].score = score;
    } else {
      zset.push({ member, score });
    }
    zset.sort((a: any, b: any) => a.score - b.score);
    return 1;
  }

  async zcard(key: string) {
    const zset = this.store.get(key);
    if (!zset || !Array.isArray(zset)) return 0;
    return zset.length;
  }

  async zrange(key: string, start: number, stop: number, ...options: any[]) {
    const zset = this.store.get(key);
    if (!zset || !Array.isArray(zset)) return [];
    let slice = zset;
    if (options.includes("REV") || options.includes("rev")) {
      slice = [...zset].reverse();
    }
    const actualStop = stop === -1 ? slice.length : stop + 1;
    return slice.slice(start, actualStop).map((item: any) => item.member);
  }

  async zrem(key: string, member: string) {
    const zset = this.store.get(key);
    if (!zset || !Array.isArray(zset)) return 0;
    const before = zset.length;
    const filtered = zset.filter((item: any) => item.member !== member);
    this.store.set(key, filtered);
    return before - filtered.length;
  }

  async zremrangebyrank(key: string, start: number, stop: number) {
    const zset = this.store.get(key);
    if (!zset || !Array.isArray(zset)) return 0;
    const before = zset.length;
    zset.splice(start, stop - start + 1);
    return before - zset.length;
  }

  multi() {
    const self = this;
    const queue: Array<() => Promise<any>> = [];
    const context = {
      del(key: string) { queue.push(() => self.del(key)); return context; },
      set(key: string, value: string) { queue.push(() => self.set(key, value)); return context; },
      sadd(key: string, ...members: string[]) { queue.push(() => self.sadd(key, ...members)); return context; },
      hset(key: string, field: string, value: string) { queue.push(() => self.hset(key, field, value)); return context; },
      zadd(key: string, score: number, member: string) { queue.push(() => self.zadd(key, score, member)); return context; },
      async exec() {
        const res: any[] = [];
        for (const fn of queue) {
          res.push([null, await fn()]);
        }
        return res;
      }
    };
    return context;
  }

  on(event: string, handler: any) { return this; }
  connect() { return Promise.resolve(); }
}

// In standard dev environment, try real connection first, fallback to mock if unreachable.
let useMock = env.NODE_ENV === "test";

export const redis = useMock
  ? (new MockRedis() as unknown as Redis)
  : new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

if (!useMock) {
  redis.on("connect", () => logger.info("redis connected"));
  redis.on("error", (err) => {
    logger.warn("redis client error; falling back to MockRedis", { err });
    useMock = true;
  });
}

export const redisCmd: Redis = useMock
  ? (new MockRedis() as unknown as Redis)
  : new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

if (!useMock) {
  redisCmd.on("error", () => { /* swallow */ });
  redisCmd.connect().catch(() => { /* fallback handled */ });
}

export const redisSub: Redis = useMock
  ? (new MockRedis() as unknown as Redis)
  : new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

if (!useMock) {
  redisSub.on("error", () => { /* swallow */ });
  redisSub.connect().catch(() => { /* best effort */ });
}

export async function redisCommand<T>(command: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    return await fn();
  } catch (e) {
    status = "error";
    throw e;
  } finally {
    const ms = performance.now() - t0;
    Metrics.timing("redis.command.duration_ms", ms, { command, status });
    Metrics.increment("redis.command.count", 1, { command, status });
  }
}
