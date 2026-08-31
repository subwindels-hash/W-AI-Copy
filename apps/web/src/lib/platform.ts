import { api } from "./api";

export interface MetricSnapshot {
  counters: Record<string, { total: number; byTags: Record<string, number> }>;
  gauges: Record<string, { value: number; byTags: Record<string, number> }>;
  histograms: Record<string, { byTags: Record<string, { count: number; avg: number; min: number; max: number }> }>;
  series: Record<string, { minute: { t: number; v: number; tags: string }[]; hour: { t: number; v: number; tags: string }[] }>;
  collectedAt: string;
}
export interface LogEntry {
  level: "fatal"|"error"|"warn"|"info"|"debug"; time: string; msg: string;
  traceId?: string; userId?: string; orgId?: string; requestId?: string; [k: string]: any;
}
export interface SpanRecord {
  traceId: string; spanId: string; parentSpanId?: string | null; name: string;
  kind: string; startedAt: string; endedAt?: string; durationMs?: number;
  status: "ok"|"error"; errorMessage?: string; attrs: Record<string, any>; children: string[];
}
export interface RegionRecord {
  id: string; name: string; city: string; country: string; lat: number; lng: number;
  role: "primary"|"replica"|"edge"|"dr"; status: "active"|"degraded"|"down"|"maintenance";
  rpoSeconds: number; rtoSeconds: number; lastPingAt?: string; latencyMs?: number;
}
export interface DRReport {
  status: "healthy"|"degraded"|"failover-active";
  primaryRegion?: string; drRegion?: string;
  replicas: { id: string; status: string; rpoSeconds: number; rtoSeconds: number }[];
  // Nullable, and null for a reason. Node returns `replicationLagMs: 42` as a
  // literal and `lastBackupAt` as a hardcoded timestamp; a single-database
  // deployment has neither a replica to measure nor a backup that has run, so
  // the PHP build reports null instead of a number nothing produced.
  lastBackupAt: string|null; backupStatus: string; replicationLagMs: number|null;
  failover: { active: boolean; toRegion: string|null; reason: string|null; since: string|null };
}
export interface CdnConfig {
  enabled: boolean;
  // Node's getCdnConfig() returns popCount 42, cacheHitRate 0.87 (labelled
  // "simulated" in its own source) and bandwidthGb 12.4 as literals. They are
  // null here unless a provider is configured and reporting.
  provider: string|null;
  popCount: number|null; cacheHitRate: number|null; bandwidthGb: number|null;
  rules: Array<{ pathPattern: string; ttlSeconds: number; staleWhileRevalidate: number; cacheKeyIncludes: string[]; enabled: boolean }>;
  recentPurges: any[];
}
export interface PurgeEntry {
  id: string; paths: string[];
  /** Node only ever reports pending→complete; a purge with no provider is `skipped` and explains why in `detail`. */
  status: "pending"|"complete"|"skipped";
  detail?: string|null;
  createdAt: string; completedAt?: string|null;
}
export interface AiObs {
  windowMinutes: number;
  totals: { requests: number; succeeded: number; failed: number; errorRate: number; avgLatencyMs: number; p50LatencyMs: number; p95LatencyMs: number; totalPromptTokens: number; totalCompletionTokens: number; totalCostUsd: number };
  byModel: Record<string, { requests: number; avgLatencyMs: number; errorRate: number; tokens: number; costUsd: number }>;
  byFeature: Record<string, { requests: number; errors: number }>;
  recent: Array<{ id: string; modelId: string|null; feature: string|null; status: string; durationMs: number|null; promptTokens: number|null; completionTokens: number|null; error: string|null; createdAt: string }>;
  timeSeries: Array<{ t: string; requests: number; errors: number; latencyMs: number; tokens: number }>;
}
export interface FailoverStatus { active: boolean; toRegion: string|null; reason: string|null; since: string|null }

export const platformApi = {
  overview: () => api<any>("/platform/overview"),
  metrics: () => api<MetricSnapshot>("/platform/metrics"),
  logs: (opts?: { level?: string; limit?: number; search?: string }) => api<LogEntry[]>("/platform/logs", { params: opts }),
  traces: (limit = 50) => api<SpanRecord[]>("/platform/traces", { params: { limit } }),
  trace: (traceId: string) => api<SpanRecord[]>(`/platform/traces/${traceId}`),
  aiObservability: (minutes = 60) => api<AiObs>("/platform/ai-observability", { params: { minutes } }),
  regions: () => api<RegionRecord[]>("/platform/regions"),
  dr: () => api<DRReport>("/platform/dr"),
  triggerFailover: (toRegion: string, reason: string) => api<FailoverStatus>("/platform/failover", { method: "POST", json: { toRegion, reason } }),
  clearFailover: () => api<FailoverStatus>("/platform/failover", { method: "DELETE" }),
  cdn: () => api<CdnConfig>("/platform/cdn"),
  updateCdnRules: (rules: CdnConfig["rules"]) => api<CdnConfig["rules"]>("/platform/cdn/rules", { method: "PUT", json: { rules } }),
  purgeCdn: (paths: string[]) => api<PurgeEntry>("/platform/cdn/purge", { method: "POST", json: { paths } }),
  signUrl: (url: string, ttlSeconds?: number) =>
    api<{ signedUrl: string; expiresAt: string }>("/platform/cdn/sign-url", { method: "POST", json: { url, ttlSeconds } }),
  span: (spanId: string) => api<SpanRecord>(`/platform/spans/${spanId}`),
};

/**
 * Formatting for the numbers Node hardcodes and this build leaves null. Each
 * helper returns a dash or a sentence when the measurement is absent, because
 * the alternative is rendering `nullms`, `NaN%` or Thursday 1 January 1970 on
 * an operations dashboard.
 */

/** Replication lag in ms. Null: no replica is being measured, which is not the same as zero lag. */
export function formatReplicationLag(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "—" : `${ms}ms`;
}

/** Last backup time. Null: a backup has never run, which is not the same as backing up at the epoch. */
export function formatBackupTime(iso: string | null | undefined): string {
  if (!iso) return "never recorded";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never recorded" : d.toLocaleString();
}

/** Cache hit rate as a percentage. Null: no CDN is reporting. */
export function formatCacheHitRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "—" : `${(rate * 100).toFixed(1)}%`;
}

/** Bandwidth in GB. Null: no CDN is reporting. */
export function formatBandwidth(gb: number | null | undefined): string {
  return gb === null || gb === undefined ? "—" : `${gb} GB`;
}

/**
 * Tone for a purge status. `skipped` exists because a purge recorded with no
 * CDN configured must be visible as "nothing happened" rather than coloured
 * like a completed job.
 */
export function purgeTone(status: string): "emerald" | "amber" | "azure" {
  if (status === "complete") return "emerald";
  if (status === "pending") return "amber";
  return "azure";
}
