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
  lastBackupAt: string; backupStatus: string; replicationLagMs: number;
  failover: { active: boolean; toRegion: string|null; reason: string|null; since: string|null };
}
export interface CdnConfig {
  enabled: boolean; provider: string; popCount: number; cacheHitRate: number; bandwidthGb: number;
  rules: Array<{ pathPattern: string; ttlSeconds: number; staleWhileRevalidate: number; cacheKeyIncludes: string[]; enabled: boolean }>;
  recentPurges: any[];
}
export interface PurgeEntry { id: string; paths: string[]; status: string; createdAt: string; completedAt?: string }
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
};
