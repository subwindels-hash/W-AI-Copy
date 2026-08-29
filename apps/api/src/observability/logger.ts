/**
 * Observability — Structured logger (Slice 105).
 *
 * - Emits structured JSON records (level, time, msg, traceId, userId, orgId, ...meta).
 * - Keeps a bounded in-memory ring buffer (most recent N entries) for in-app log tailing.
 * - Pretty-prints to stdout in development (for human-friendly console tailing) while
 *   still retaining the JSON record for the buffer.
 */

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug";

export interface LogEntry {
  level: LogLevel;
  time: string; // ISO
  msg: string;
  traceId?: string;
  userId?: string;
  orgId?: string;
  requestId?: string;
  [key: string]: any;
}

const LEVEL_VAL: Record<LogLevel, number> = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20 };

const RING_MAX = 2000;
const ring: LogEntry[] = [];
let ringIdx = 0;

function pushRing(entry: LogEntry) {
  if (ring.length < RING_MAX) {
    ring.push(entry);
  } else {
    ring[ringIdx] = entry;
    ringIdx = (ringIdx + 1) % RING_MAX;
  }
}

export function snapshotRing(opts: { level?: LogLevel; limit?: number; search?: string } = {}): LogEntry[] {
  // Ring is in insertion order starting at ringIdx (if full) otherwise index 0.
  const ordered: LogEntry[] = [];
  if (ring.length < RING_MAX) ordered.push(...ring);
  else {
    for (let i = 0; i < RING_MAX; i++) ordered.push(ring[(ringIdx + i) % RING_MAX]);
  }
  const minLevel = opts.level ? LEVEL_VAL[opts.level] : LEVEL_VAL.debug;
  let filtered = ordered.filter((e) => LEVEL_VAL[e.level] >= minLevel);
  if (opts.search) {
    const s = opts.search.toLowerCase();
    filtered = filtered.filter((e) => JSON.stringify(e).toLowerCase().includes(s));
  }
  if (opts.limit) filtered = filtered.slice(-opts.limit);
  return filtered;
}

function write(entry: LogEntry) {
  pushRing(entry);
  // Pretty stdout for dev; single-line JSON is easy to grep in prod.
  const ts = entry.time.slice(11, 23);
  const color = {
    fatal: "\u001b[35m", error: "\u001b[31m", warn: "\u001b[33m", info: "\u001b[32m", debug: "\u001b[36m",
  }[entry.level];
  const extras: Record<string, any> = {};
  for (const k of Object.keys(entry)) {
    if (!["level", "time", "msg", "traceId", "userId", "orgId", "requestId"].includes(k)) {
      extras[k] = entry[k];
    }
  }
  const ctx = [entry.traceId && `trace=${entry.traceId.slice(0, 8)}`, entry.userId && `uid=${entry.userId.slice(0, 8)}`, entry.orgId && `org=${entry.orgId.slice(0, 8)}`].filter(Boolean).join(" ");
  const extraStr = Object.keys(extras).length ? " " + JSON.stringify(extras) : "";
  const line = `${color}[${ts}] ${entry.level.toUpperCase().padEnd(5)}\u001b[39m${ctx ? " \u001b[35m" + ctx + "\u001b[39m" : ""}: ${entry.msg}${extraStr}`;
  if (entry.level === "error" || entry.level === "fatal") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

import { redact } from "../security/piiRedact.js";

function make(level: LogLevel) {
  return (msg: string, meta: Record<string, any> = {}) => {
    const safeMeta = redact(meta);
    const entry: LogEntry = { level, time: new Date().toISOString(), msg, ...safeMeta };
    // Resolve async-local context from tracer (if set) to attach trace/user/org automatically.
    try {
      const ctx = (globalThis as any).__WINDELS_CTX__?.();
      if (ctx) {
        if (ctx.traceId && !entry.traceId) entry.traceId = ctx.traceId;
        if (ctx.userId && !entry.userId) entry.userId = ctx.userId;
        if (ctx.orgId && !entry.orgId) entry.orgId = ctx.orgId;
        if (ctx.requestId && !entry.requestId) entry.requestId = ctx.requestId;
      }
    } catch { /* ignore */ }
    write(entry);
  };
}

export const logger = {
  fatal: make("fatal"),
  error: make("error"),
  warn: make("warn"),
  info: make("info"),
  debug: make("debug"),
  child(bindings: Record<string, any>) {
    return {
      fatal: (m: string, meta?: any) => this.fatal(m, { ...bindings, ...meta }),
      error: (m: string, meta?: any) => this.error(m, { ...bindings, ...meta }),
      warn: (m: string, meta?: any) => this.warn(m, { ...bindings, ...meta }),
      info: (m: string, meta?: any) => this.info(m, { ...bindings, ...meta }),
      debug: (m: string, meta?: any) => this.debug(m, { ...bindings, ...meta }),
    } as typeof logger;
  },
};

export default logger;
