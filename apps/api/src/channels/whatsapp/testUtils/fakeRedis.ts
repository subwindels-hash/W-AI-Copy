/**
 * List-capable in-memory Redis stand-in for the WhatsApp channel suites.
 *
 * `db/redis.ts`'s built-in MockRedis implements strings, hashes, sets and
 * sorted sets but not the LIST commands (`rpush`/`lpop`/`llen`) that
 * WhatsAppQueue is built on, so a queue test against it would silently exercise
 * nothing. This fake implements exactly the command surface the channel uses,
 * with real semantics, so the queue's claim/retry/DLQ behaviour is genuinely
 * verified rather than stubbed.
 */
type Value = string | string[];

export class FakeRedis {
  store = new Map<string, Value>();
  /** Set by a test to make the next command throw, simulating an outage. */
  failNext: string | null = null;

  private guard(cmd: string) {
    if (this.failNext === cmd) {
      this.failNext = null;
      throw new Error(`simulated redis failure: ${cmd}`);
    }
  }

  reset() {
    this.store.clear();
    this.hashes.clear();
    this.zsets.clear();
    this.failNext = null;
  }

  private list(key: string): string[] {
    const cur = this.store.get(key);
    if (Array.isArray(cur)) return cur;
    const fresh: string[] = [];
    this.store.set(key, fresh);
    return fresh;
  }

  async rpush(key: string, ...values: string[]) {
    this.guard("rpush");
    const l = this.list(key);
    l.push(...values);
    return l.length;
  }

  async lpush(key: string, ...values: string[]) {
    this.guard("lpush");
    const l = this.list(key);
    l.unshift(...values);
    return l.length;
  }

  async lpop(key: string) {
    this.guard("lpop");
    const l = this.list(key);
    return l.shift() ?? null;
  }

  async llen(key: string) {
    this.guard("llen");
    return this.list(key).length;
  }

  async lrange(key: string, start: number, stop: number) {
    const l = this.list(key);
    return l.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async get(key: string) {
    this.guard("get");
    const v = this.store.get(key);
    return typeof v === "string" ? v : null;
  }

  async set(key: string, value: string, ..._opts: unknown[]) {
    this.guard("set");
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]) {
    this.guard("del");
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async incr(key: string) {
    this.guard("incr");
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(_key: string, _seconds: number) {
    return 1;
  }

  async exists(key: string) {
    return this.store.has(key) ? 1 : 0;
  }

  async keys(pattern: string) {
    const rx = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return [...this.store.keys()].filter((k) => rx.test(k));
  }

  // ── Lists (trailing ops) ─────────────────────────────────────────────
  async ltrim(key: string, start: number, stop: number) {
    this.guard("ltrim");
    const l = this.list(key);
    const end = stop < 0 ? l.length + stop + 1 : stop + 1;
    this.store.set(key, l.slice(start, end));
    return "OK";
  }

  // ── Hashes ───────────────────────────────────────────────────────────
  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) { h = new Map(); this.hashes.set(key, h); }
    return h;
  }

  hashes = new Map<string, Map<string, string>>();

  async hset(key: string, field: string, value: string) {
    this.guard("hset");
    this.hash(key).set(field, value);
    return 1;
  }

  async hget(key: string, field: string) {
    this.guard("hget");
    return this.hash(key).get(field) ?? null;
  }

  async hgetall(key: string) {
    this.guard("hgetall");
    return Object.fromEntries(this.hash(key).entries());
  }

  /**
   * Sorted sets. KernelService.dispatch writes every orchestration event with
   * `zadd`, so without these the God-Node bridge silently no-ops in tests and
   * the pipeline's orchestration step would appear to work while doing nothing.
   */
  zsets = new Map<string, Array<{ score: number; member: string }>>();

  private zset(key: string) {
    let z = this.zsets.get(key);
    if (!z) { z = []; this.zsets.set(key, z); }
    return z;
  }

  async zadd(key: string, score: number, member: string) {
    this.guard("zadd");
    const z = this.zset(key);
    const existing = z.find((e) => e.member === member);
    if (existing) { existing.score = score; return 0; }
    z.push({ score, member });
    z.sort((a, b) => a.score - b.score);
    return 1;
  }

  async zrange(key: string, start: number, stop: number, ...opts: string[]) {
    this.guard("zrange");
    let z = [...this.zset(key)];
    if (opts.some((o) => String(o).toUpperCase() === "REV")) z.reverse();
    const end = stop < 0 ? z.length + stop + 1 : stop + 1;
    return z.slice(start, end).map((e) => e.member);
  }

  async zremrangebyrank(key: string, start: number, stop: number) {
    this.guard("zremrangebyrank");
    const z = this.zset(key);
    const end = stop < 0 ? z.length + stop + 1 : stop + 1;
    const removed = z.splice(start, Math.max(0, end - start));
    return removed.length;
  }

  async zcard(key: string) {
    this.guard("zcard");
    return this.zset(key).length;
  }

  /** Pipelined writes, executed eagerly — ordering is all the callers rely on. */
  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const self = this;
    const chain: any = {
      zadd: (...a: [string, number, string]) => { ops.push(() => self.zadd(...a)); return chain; },
      hset: (...a: [string, string, string]) => { ops.push(() => self.hset(...a)); return chain; },
      set: (...a: [string, string]) => { ops.push(() => self.set(...a)); return chain; },
      incr: (...a: [string]) => { ops.push(() => self.incr(...a)); return chain; },
      del: (...a: string[]) => { ops.push(() => self.del(...a)); return chain; },
      expire: (...a: [string, number]) => { ops.push(() => self.expire(...a)); return chain; },
      async exec() {
        const out: unknown[] = [];
        for (const op of ops) out.push(await op());
        return out.map((r) => [null, r]);
      },
    };
    return chain;
  }

  async publish() { return 0; }
  async subscribe() { return 0; }
  on() { return this; }
  async connect() { /* no-op */ }
  get status() { return "ready"; }
}
