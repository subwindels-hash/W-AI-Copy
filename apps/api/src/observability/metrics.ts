/**
 * Observability — Metrics (Slice 104).
 *
 * In-memory counters/gauges/histograms with tagged dimensions plus a rolling
 * 1-hour/24-hour time-series for dashboard charts. Redis is used opportunistically
 * (if connected) to share counters across processes — failures degrade silently.
 */

import { redis } from "../db/redis.js";

type Tags = Record<string, string | number | boolean | undefined | null>;

function tagKey(tags?: Tags) {
  if (!tags) return "";
  return Object.entries(tags)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

interface Counter {
  name: string;
  value: Map<string, number>;
}
interface Gauge {
  name: string;
  value: Map<string, number>;
}
interface Histogram {
  name: string;
  buckets: Map<string, { count: number; sum: number; min: number; max: number }>;
}

const counters = new Map<string, Counter>();
const gauges = new Map<string, Gauge>();
const histograms = new Map<string, Histogram>();

// Time series: fixed-window 1-minute buckets, retained 60 minutes (1h) and 24h (hourly).
const SERIES_MINUTES = 60;
const SERIES_HOURS = 24;
interface SeriesPoint { t: number; v: number; tags: string }
const minuteSeries = new Map<string, SeriesPoint[]>(); // key = name
const hourSeries = new Map<string, SeriesPoint[]>();

function bucketIdx(ts: number, windowMs: number) {
  return Math.floor(ts / windowMs) * windowMs;
}

function recordSeries(name: string, value: number, tags: string) {
  const now = Date.now();
  const minKey = bucketIdx(now, 60_000);
  {
    let arr = minuteSeries.get(name);
    if (!arr) { arr = []; minuteSeries.set(name, arr); }
    // Find/merge the same minute+tags
    const p = arr.find((x) => x.t === minKey && x.tags === tags);
    if (p) p.v += value; else arr.push({ t: minKey, v: value, tags });
    // Drop anything older than SERIES_MINUTES
    const cutoff = now - SERIES_MINUTES * 60_000;
    while (arr.length && arr[0].t < cutoff) arr.shift();
  }
  const hourKey = bucketIdx(now, 60 * 60_000);
  {
    let arr = hourSeries.get(name);
    if (!arr) { arr = []; hourSeries.set(name, arr); }
    const p = arr.find((x) => x.t === hourKey && x.tags === tags);
    if (p) p.v += value; else arr.push({ t: hourKey, v: value, tags });
    const cutoff = now - SERIES_HOURS * 60 * 60_000;
    while (arr.length && arr[0].t < cutoff) arr.shift();
  }
}

async function redisIncr(name: string, tags: string, n: number) {
  try {
    const key = `windels:metrics:${name}:${tags || "_"}`;
    await redis.incrby(key, n);
    await redis.expire(key, 60 * 60 * 24);
  } catch { /* offline redis is OK */ }
}

export const Metrics = {
  counter(name: string, tags?: Tags) {
    return {
      incr(n = 1) { Metrics.increment(name, n, tags); },
    };
  },
  increment(name: string, n = 1, tags?: Tags) {
    let c = counters.get(name);
    if (!c) { c = { name, value: new Map() }; counters.set(name, c); }
    const k = tagKey(tags);
    c.value.set(k, (c.value.get(k) ?? 0) + n);
    recordSeries(name, n, k);
    redisIncr(name, k, n).catch(() => {});
  },
  timing(name: string, ms: number, tags?: Tags) {
    let h = histograms.get(name);
    if (!h) { h = { name, buckets: new Map() }; histograms.set(name, h); }
    const k = tagKey(tags);
    const cur = h.buckets.get(k) ?? { count: 0, sum: 0, min: ms, max: ms };
    cur.count++; cur.sum += ms; cur.min = Math.min(cur.min, ms); cur.max = Math.max(cur.max, ms);
    h.buckets.set(k, cur);
    recordSeries(name + "_ms", ms, k);
  },
  gauge(name: string, value: number, tags?: Tags) {
    let g = gauges.get(name);
    if (!g) { g = { name, value: new Map() }; gauges.set(name, g); }
    g.value.set(tagKey(tags), value);
  },
  /** Observe a timer — returns a handle whose .stop() records the elapsed ms. */
  startTimer(name: string, tags?: Tags) {
    const start = performance.now();
    return {
      end(extraTags?: Tags) {
        const ms = performance.now() - start;
        Metrics.timing(name, ms, { ...(tags ?? {}), ...(extraTags ?? {}) });
        return ms;
      },
    };
  },
  snapshot() {
    const c: Record<string, any> = {};
    for (const [name, counter] of counters) {
      const v: any = { total: 0, byTags: {} as Record<string, number> };
      for (const [k, n] of counter.value) { v.total += n; if (k) v.byTags[k] = n; }
      c[name] = v;
    }
    const g: Record<string, any> = {};
    for (const [name, gg] of gauges) {
      const v: any = { byTags: {} as Record<string, number> };
      for (const [k, n] of gg.value) { v.byTags[k || "_"] = n; v.value = n; }
      g[name] = v;
    }
    const h: Record<string, any> = {};
    for (const [name, hh] of histograms) {
      const v: any = { byTags: {} as Record<string, any> };
      for (const [k, b] of hh.buckets) {
        v.byTags[k || "_"] = { count: b.count, sum: b.sum, avg: b.sum / b.count, min: b.min, max: b.max };
      }
      h[name] = v;
    }
    const series: Record<string, { minute: SeriesPoint[]; hour: SeriesPoint[] }> = {};
    for (const name of new Set([...minuteSeries.keys(), ...hourSeries.keys()])) {
      series[name] = { minute: minuteSeries.get(name) ?? [], hour: hourSeries.get(name) ?? [] };
    }
    return { counters: c, gauges: g, histograms: h, series, collectedAt: new Date().toISOString() };
  },
};

/**
 * Render current metrics in Prometheus text exposition format (0.0.4).
 * Used by Prometheus/VictoriaMetrics/Grafana Agent scrape at GET /metrics.
 *
 * Counters are rendered as MONOTONIC totals (we only reset on process start).
 * Gauges are rendered as-is. Histograms expose _count/_sum/_min/_max.
 * Node.js runtime gauges are refreshed at scrape time.
 */
function safePromName(s: string) {
  return s.replace(/[^a-zA-Z0-9_:]/g, "_").replace(/^_+/, "").replace(/_+/g, "_");
}
function renderTags(tags: string): string {
  if (!tags) return "";
  const pairs = tags.split(",").map((kv) => {
    const [k, ...rest] = kv.split("=");
    const v = rest.join("=");
    return `${safePromName(k)}="${String(v).replace(/"/g, '\\"')}"`;
  }).join(",");
  return pairs ? `{${pairs}}` : "";
}

function collectNodeGauges() {
  const mem = process.memoryUsage();
  const rt = process.hrtime();
  Metrics.gauge("nodejs_heap_total_bytes", mem.heapTotal);
  Metrics.gauge("nodejs_heap_used_bytes", mem.heapUsed);
  Metrics.gauge("nodejs_rss_bytes", mem.rss);
  Metrics.gauge("nodejs_external_bytes", mem.external);
  Metrics.gauge("nodejs_array_buffers_bytes", mem.arrayBuffers ?? 0);
  Metrics.gauge("nodejs_active_requests", Number((process as any)._getActiveRequests?.()?.length ?? 0));
  Metrics.gauge("nodejs_active_handles", Number((process as any)._getActiveHandles?.()?.length ?? 0));
  Metrics.gauge("nodejs_uptime_seconds", process.uptime());
  try {
    const cpus = require("node:os").cpus();
    Metrics.gauge("nodejs_cpu_count", cpus.length);
    const loadavg = require("node:os").loadavg();
    Metrics.gauge("system_loadavg_1m", loadavg[0] ?? 0);
    Metrics.gauge("system_loadavg_5m", loadavg[1] ?? 0);
    Metrics.gauge("system_loadavg_15m", loadavg[2] ?? 0);
    Metrics.gauge("system_freemem_bytes", require("node:os").freemem());
    Metrics.gauge("system_totalmem_bytes", require("node:os").totalmem());
  } catch { /* ignore */ }
  // Counter wrappers
  nodeGcCountersInstalled || installGcCounters();
}

let nodeGcCountersInstalled = false;
function installGcCounters() {
  try {
    const v8 = require("node:v8");
    if (typeof v8.setFlagsFromString === "function" && !(globalThis as any).__windelsGcHooked) {
      // Try async_hooks gc via perf_hooks if available
      const perfHooks = require("node:perf_hooks");
      if (perfHooks.PerformanceObserver) {
        const obs = new perfHooks.PerformanceObserver((list: any) => {
          for (const entry of list.getEntries()) {
            if (entry.detail?.kind) {
              Metrics.increment(`nodejs_gc_duration_ms_count`, 1, { kind: gcKindName(entry.detail.kind) });
              // entry.duration is in ms
              Metrics.increment(`nodejs_gc_duration_ms_sum`, Math.round(entry.duration), { kind: gcKindName(entry.detail.kind) });
            }
          }
        });
        try { obs.observe({ entryTypes: ["gc"] }); (globalThis as any).__windelsGcHooked = true; nodeGcCountersInstalled = true; } catch { /* --expose-gc not needed, gc flag may be off */ }
      }
    }
  } catch { /* ignore */ }
}
function gcKindName(kind: number) {
  // From v8 GC types
  switch (kind) {
    case 1: return "scavenge";
    case 2: return "minor_mark_compact";
    case 4: return "mark_sweep_compact";
    case 8: return "incremental_marking";
    case 16: return "process_weak_callbacks";
    default: return `kind_${kind}`;
  }
}

export function MetricsPrometheus(): string {
  collectNodeGauges();
  const lines: string[] = [];
  lines.push("# HELP windels_build_info Build and version info");
  lines.push("# TYPE windels_build_info gauge");
  lines.push(`windels_build_info{version="${process.env.npm_package_version ?? "0.1.0"}",nodejs="${process.version}",env="${process.env.NODE_ENV ?? "development"}"} 1`);

  for (const [name, c] of counters) {
    let n = safePromName(name);
    // Prometheus convention: counters MUST end with _total; avoid doubling.
    if (!n.endsWith("_total")) n += "_total";
    lines.push(`# HELP ${n} counter`);
    lines.push(`# TYPE ${n} counter`);
    for (const [tags, v] of c.value) lines.push(`${n}${renderTags(tags)} ${v}`);
  }
  for (const [name, g] of gauges) {
    const n = safePromName(name);
    lines.push(`# HELP ${n} gauge`);
    lines.push(`# TYPE ${n} gauge`);
    for (const [tags, v] of g.value) lines.push(`${n}${renderTags(tags)} ${v}`);
  }
  for (const [name, h] of histograms) {
    const n = safePromName(name);
    lines.push(`# HELP ${n}_ms summary`);
    lines.push(`# TYPE ${n}_ms summary`);
    for (const [tags, b] of h.buckets) {
      lines.push(`${n}_ms_count${renderTags(tags)} ${b.count}`);
      lines.push(`${n}_ms_sum${renderTags(tags)} ${b.sum.toFixed(3)}`);
      lines.push(`${n}_ms_min${renderTags(tags)} ${b.min.toFixed(3)}`);
      lines.push(`${n}_ms_max${renderTags(tags)} ${b.max.toFixed(3)}`);
    }
  }
  return lines.join("\n") + "\n";
}

export default Metrics;
