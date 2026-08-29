/**
 * Observability — Tracing (Slice 106).
 *
 * Minimal OpenTelemetry/W3C-traceparent-inspired tracer:
 *  - 32-char hex traceId + 16-char hex spanId.
 *  - Accepts/propagates a `traceparent` header (`00-<traceId>-<parentId>-01`).
 *  - Maintains an in-memory bounded ring of recent spans (default 500) for in-app viewing.
 *  - Uses async-local-style context via globalThis.__WINDELS_CTX__ getter/setter pattern
 *    (avoids requiring async_hooks — we simply set/restore context at every await boundary
 *    the user crosses; for HTTP middleware it's set for the duration of the request).
 */

import { randomBytes } from "node:crypto";

export interface SpanAttrs {
  [key: string]: string | number | boolean | undefined | null;
}
export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  kind: "server" | "client" | "internal" | "producer" | "consumer";
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "ok" | "error";
  errorMessage?: string;
  attrs: SpanAttrs;
  children: string[]; // child span ids
}

const SPAN_RING_MAX = 500;
const spanRing: SpanRecord[] = [];
let ringIdx = 0;
const spanIndex = new Map<string, SpanRecord>(); // traceId -> roots; also by spanId for quick lookup
const bySpanId = new Map<string, SpanRecord>();

function hex(n: number) { return randomBytes(n).toString("hex"); }

export function newTraceId() { return hex(16); }
export function newSpanId() { return hex(8); }

function pushSpan(span: SpanRecord) {
  if (spanRing.length < SPAN_RING_MAX) {
    spanRing.push(span);
  } else {
    const old = spanRing[ringIdx];
    bySpanId.delete(old.spanId);
    // detach from parent's children list if present
    if (old.parentSpanId) {
      const parent = bySpanId.get(old.parentSpanId);
      if (parent) parent.children = parent.children.filter((id) => id !== old.spanId);
    }
    spanRing[ringIdx] = span;
    ringIdx = (ringIdx + 1) % SPAN_RING_MAX;
  }
  bySpanId.set(span.spanId, span);
}

// ─── Context management (no async_hooks; caller must run within runInSpan/withContext) ──

interface Ctx {
  traceId: string;
  spanId: string;
  userId?: string;
  orgId?: string;
  requestId?: string;
}
let currentCtx: Ctx | null = null;
export function getCtx(): Ctx | null { return currentCtx; }
export function setCtx(c: Ctx | null) { currentCtx = c; }

// Bind getter for logger to read context synchronously
(globalThis as any).__WINDELS_CTX__ = () => currentCtx;

export function runInCtx<T>(ctx: Ctx, fn: () => T): T {
  const prev = currentCtx;
  currentCtx = ctx;
  try { return fn(); }
  finally { currentCtx = prev; }
}

// ─── Span API ────────────────────────────────────────────────────

export interface Span {
  record: SpanRecord;
  end(status?: "ok" | "error", errorMessage?: string): void;
  setAttrs(attrs: SpanAttrs): void;
  run<T>(fn: () => T): T;
}

export function startSpan(name: string, opts: { kind?: SpanRecord["kind"]; attrs?: SpanAttrs; parent?: { traceId: string; spanId: string } | null } = {}): Span {
  const parentCtx = opts.parent ?? currentCtx;
  const traceId = parentCtx?.traceId ?? newTraceId();
  const parentSpanId = parentCtx?.spanId;
  const spanId = newSpanId();
  const record: SpanRecord = {
    traceId, spanId, parentSpanId, name,
    kind: opts.kind ?? "internal",
    startedAt: new Date().toISOString(),
    status: "ok", attrs: { ...(opts.attrs ?? {}) }, children: [],
  };
  pushSpan(record);
  if (parentSpanId) {
    const parent = bySpanId.get(parentSpanId);
    if (parent) parent.children.push(spanId);
  }
  const span: Span = {
    record,
    end(status = "ok", errorMessage?: string) {
      record.endedAt = new Date().toISOString();
      record.durationMs = new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
      record.status = status;
      if (errorMessage) record.errorMessage = errorMessage;
    },
    setAttrs(attrs) { Object.assign(record.attrs, attrs); },
    run<T>(fn: () => T): T {
      const prev = currentCtx;
      currentCtx = { ...(prev ?? { traceId }), traceId, spanId };
      try {
        const r = fn();
        if (r && typeof (r as any).then === "function") {
          return (r as unknown as Promise<any>).then(
            (v) => { span.end(); return v; },
            (e) => { span.end("error", e?.message); throw e; },
          ) as unknown as T;
        }
        span.end();
        return r;
      } catch (e: any) {
        span.end("error", e?.message);
        throw e;
      } finally {
        currentCtx = prev;
      }
    },
  };
  return span;
}

/** Parse incoming traceparent header or create new. */
export function contextFromTraceparent(header?: string | null) {
  if (header) {
    const m = header.match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
    if (m) return { traceId: m[2], spanId: m[3] };
  }
  return null;
}

export function makeTraceparent(ctx: { traceId: string; spanId: string }) {
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

// ─── Query ───────────────────────────────────────────────────────

export function getTrace(traceId: string): SpanRecord[] {
  return Array.from(bySpanId.values()).filter((s) => s.traceId === traceId);
}

export function recentTraces(limit = 50): SpanRecord[] {
  // Return root spans (no parent in ring) or those with spanId's traceId roots, ordered by time desc.
  const roots: SpanRecord[] = [];
  for (const s of bySpanId.values()) {
    if (!s.parentSpanId || !bySpanId.has(s.parentSpanId)) roots.push(s);
  }
  roots.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return roots.slice(0, limit);
}

export function getSpanById(spanId: string) { return bySpanId.get(spanId) ?? null; }
