/**
 * Session 55 — Usage Intelligence (Session 123 completion).
 *
 * Every figure is counted from records this organization actually holds.
 * Session 123 fixes the defects that remained in that arithmetic:
 *
 *   1. **`deltaPct` returned 0 without a prior baseline** — 0 reads as "no
 *      change". It is now `null` (and the trend with it).
 *   2. **The AI metrics had hardcoded `deltaPct: 0, trend: "flat"`** — the
 *      prior 30-day AI window was never even queried. It now is: request
 *      counts, tokens, latency and error-rate deltas are measured.
 *   3. **Empty denominators reported 0.** No AI requests → "0 ms latency"
 *      (the *perfectly fast* reading) and "0 % error rate" (the *no
 *      failures* reading); no workflow runs → "0 % automation"; no members
 *      → "0 % adoption". All are now `null`.
 *   4. **Per-module p95 latency, error rate and user counts were hardcoded
 *      0** — the data to compute them (durationMs, status, userId per
 *      request) was sitting in AiRequest. They are now measured from the
 *      window's rows; `null` where a module has no requests.
 *   5. **The 30-day series never carried tokens** (the field existed but
 *      the row fetch did not select token counts, so it was always 0) and
 *      empty days reported `latencyMs: 0`. Tokens are now summed per day
 *      and empty days report `latencyMs: null`, `automationTasks: null`.
 *   6. **Structural zeros are named.** resources, cost, savings, ROI and
 *      carbon have no backing feed and keep their 0, but the rollup now
 *      ships a `provenance` block naming them (the Session 118 pattern).
 *
 * Anything that genuinely has no backing store still reports 0 rather than
 * a plausible guess — see the provenance block.
 */
import { prisma } from "../db/client.js";
import type {
  UsageByModule,
  UsageDashboard,
  UsageMetric,
  UsageProvenance,
  UsageTimeSeriesPoint,
} from "@windels/shared";
import { USAGE_PROVENANCE_NOTE } from "@windels/shared/usage";

const DAY_MS = 86_400_000;
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Same-window percentage change; `null` without a prior baseline. */
function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}
const trendOf = (d: number | null): "up" | "down" | "flat" | null =>
  d === null ? null : d > 1 ? "up" : d < -1 ? "down" : "flat";

/** Nearest-rank percentile; null for an empty sample. */
function percentile(values: number[], pct: number): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const idx = Math.min(clean.length - 1, Math.max(0, Math.ceil((pct / 100) * clean.length) - 1));
  return clean[idx]!;
}

interface WindowRequest {
  createdAt: Date;
  durationMs: number | null;
  status: string | null;
  channel: string | null;
  modelId: string | null;
  userId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export const UsageService = {
  async ensureBootstrapped(_logger?: any, _oid = "org-windels") {},

  async dashboard(oid = "org-windels", now: Date = new Date()): Promise<UsageDashboard> {
    const nowMs = now.getTime();
    const since = new Date(nowMs - 30 * DAY_MS);
    const prevSince = new Date(nowMs - 60 * DAY_MS);

    const [
      conversations, messages, workflowRuns, agents, members, tasks,
      prevConversations, prevMessages, prevWorkflowRuns, prevTasks,
      aiRequests, prevAiRequests, aiAgg, prevAiAgg, aiFailed, prevAiFailed,
      activeMemberRows, workflowsTotal, workflowsAuto, dayRows,
    ] = await Promise.all([
      prisma.conversation.count({ where: { organizationId: oid, createdAt: { gte: since }, deletedAt: null } }),
      prisma.talkMessage.count({ where: { channel: { organizationId: oid }, createdAt: { gte: since }, deletedAt: null } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, createdAt: { gte: since } } }),
      prisma.agent.count({ where: { organizationId: oid } }),
      prisma.membership.count({ where: { organizationId: oid } }),
      prisma.task.count({ where: { organizationId: oid, createdAt: { gte: since } } }),

      // Prior 30-day window, so deltas are measured rather than assumed flat.
      prisma.conversation.count({ where: { organizationId: oid, createdAt: { gte: prevSince, lt: since }, deletedAt: null } }),
      prisma.talkMessage.count({ where: { channel: { organizationId: oid }, createdAt: { gte: prevSince, lt: since }, deletedAt: null } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, createdAt: { gte: prevSince, lt: since } } }),
      prisma.task.count({ where: { organizationId: oid, createdAt: { gte: prevSince, lt: since } } }),

      // Current and prior AI windows: counts, token sums, latency, failures.
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since } } }),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: prevSince, lt: since } } }),
      prisma.aiRequest.aggregate({
        where: { organizationId: oid, createdAt: { gte: since } },
        _sum: { promptTokens: true, completionTokens: true, durationMs: true },
        _avg: { durationMs: true },
      }),
      prisma.aiRequest.aggregate({
        where: { organizationId: oid, createdAt: { gte: prevSince, lt: since } },
        _sum: { promptTokens: true, completionTokens: true, durationMs: true },
        _avg: { durationMs: true },
      }),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since }, status: { not: "succeeded" } } }),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: prevSince, lt: since }, status: { not: "succeeded" } } }),

      // Distinct members who actually produced AI traffic in the window.
      prisma.aiRequest.findMany({
        where: { organizationId: oid, createdAt: { gte: since }, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      }).catch(() => [] as Array<{ userId: string | null }>),

      prisma.workflow.count({ where: { organizationId: oid } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, createdAt: { gte: since }, status: "SUCCEEDED" } }),

      // The window's request rows, fetched once: per-day series, per-module
      // p95/error/users and per-model tokens all derive from this.
      prisma.aiRequest.findMany({
        where: { organizationId: oid, createdAt: { gte: since } },
        select: {
          createdAt: true, durationMs: true, status: true, channel: true,
          modelId: true, userId: true, promptTokens: true, completionTokens: true,
        },
      }).catch(() => [] as WindowRequest[]),
    ]);

    const rows = dayRows as WindowRequest[];
    const totalTokens = (aiAgg._sum.promptTokens ?? 0) + (aiAgg._sum.completionTokens ?? 0);
    const prevTotalTokens = (prevAiAgg._sum.promptTokens ?? 0) + (prevAiAgg._sum.completionTokens ?? 0);
    const avgLatencyMs = aiRequests && aiAgg._avg.durationMs != null
      ? Math.round(aiAgg._avg.durationMs)
      : null;
    const prevAvgLatencyMs = prevAiRequests && prevAiAgg._avg.durationMs != null
      ? Math.round(prevAiAgg._avg.durationMs)
      : null;
    const errorRatePct = aiRequests ? round((aiFailed / aiRequests) * 100, 2) : null;
    const prevErrorRatePct = prevAiRequests ? round((prevAiFailed / prevAiRequests) * 100, 2) : null;
    const totalRequests30d = messages + workflowRuns + conversations + aiRequests;

    // ── Day-by-day series from the window's rows ────────────────────────
    const buckets = new Map<string, { requests: number; tokens: number; durations: number[] }>();
    for (let i = 29; i >= 0; i--) {
      buckets.set(new Date(nowMs - i * DAY_MS).toISOString().slice(0, 10), { requests: 0, tokens: 0, durations: [] });
    }
    for (const r of rows) {
      const key = r.createdAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      b.requests += 1;
      b.tokens += (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
      if (r.durationMs != null) b.durations.push(r.durationMs);
    }
    const series: UsageTimeSeriesPoint[] = [...buckets.entries()].map(([date, b]) => ({
      ts: date,
      requests: b.requests,
      tokens: b.tokens, // Session 123: real per-day token counts
      latencyMs: b.requests && b.durations.length ? Math.round(b.durations.reduce((a, x) => a + x, 0) / b.durations.length) : null,
      automationTasks: null, // no automation-task metering exists; null, never 0
    }));

    // ── Per-module metrics from the rows (Session 123: measured, not 0) ──
    const byChannel = new Map<string, { requests: number; users: Set<string>; durations: number[]; failed: number }>();
    for (const r of rows) {
      const ch = r.channel ?? "unknown";
      const g = byChannel.get(ch) ?? { requests: 0, users: new Set<string>(), durations: [], failed: 0 };
      g.requests += 1;
      if (r.userId) g.users.add(r.userId);
      if (r.durationMs != null) g.durations.push(r.durationMs);
      if (r.status && r.status !== "succeeded") g.failed += 1;
      byChannel.set(ch, g);
    }
    const modules: UsageByModule[] = [...byChannel.entries()]
      .map(([channel, g]) => ({
        module: channel,
        requests: g.requests,
        users: g.users.size,
        p95LatencyMs: percentile(g.durations, 95),
        errorRate: g.requests ? round((g.failed / g.requests) * 100, 2) : null,
        sharePct: aiRequests ? round((g.requests / aiRequests) * 100, 1) : 0,
      }))
      .sort((a, b) => b.requests - a.requests);

    // ── Per-model rollup from the rows ──────────────────────────────────
    const byModel = new Map<string, { requests: number; tokens: number }>();
    for (const r of rows) {
      const mid = r.modelId ?? "unknown";
      const g = byModel.get(mid) ?? { requests: 0, tokens: 0 };
      g.requests += 1;
      g.tokens += (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
      byModel.set(mid, g);
    }
    const topModels = [...byModel.entries()]
      .map(([modelId, g]) => ({ modelId, requests: g.requests, tokens: g.tokens }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const activeMembers = activeMemberRows.length;

    const metric = (
      label: string, value: number | null, unit: string,
      prev: number | null, delta: (current: number, previous: number) => number | null = deltaPct,
    ): UsageMetric => {
      const d = value === null || prev === null ? null : delta(value, prev);
      return { label, value, unit, deltaPct: d, trend: trendOf(d) };
    };

    const metrics: UsageMetric[] = [
      metric("Conversations (30d)", conversations, "", prevConversations),
      metric("Messages (30d)", messages, "", prevMessages),
      metric("Workflow runs (30d)", workflowRuns, "", prevWorkflowRuns),
      metric("Tasks (30d)", tasks, "", prevTasks),
      metric("AI requests (30d)", aiRequests, "", prevAiRequests),
      metric("AI tokens (30d)", totalTokens, "tokens", prevTotalTokens),
      metric("Avg AI latency", avgLatencyMs, "ms", prevAvgLatencyMs),
      metric("AI error rate", errorRatePct, "%", prevErrorRatePct),
      // Point-in-time counts have no prior-period baseline; the delta is
      // honestly null, never 0/"flat".
      metric("AI employees", agents, "", null),
      metric("Members", members, "", null),
    ];

    // Session 123 — provenance: name the measured numbers and the structural
    // zeros field by field (the Session 118 pattern).
    const provenance: UsageProvenance = {
      entries: [
        { field: "metrics", basis: "measured", detail: "counted from AiRequest/conversation/talkMessage/workflowRun/task rows; deltas vs the prior 30-day window, null without a baseline" },
        { field: "modules", basis: "measured", detail: "requests/users/p95LatencyMs/errorRate derived from the window's AiRequest rows" },
        { field: "topModels", basis: "measured", detail: "requests and tokens per modelId from the window's rows" },
        { field: "series", basis: "measured", detail: "requests/tokens/latency per day; empty days have null latency and automationTasks" },
        { field: "automationRate", basis: "measured", detail: "SUCCEEDED workflow runs over all runs in the window; null without runs" },
        { field: "adoptionPct", basis: "measured", detail: "members with AI traffic over members; null without members" },
        { field: "resources", basis: "structural_zero", detail: "no host telemetry feed is connected" },
        { field: "totalCost30dUsd / totalSavings30dUsd / productivityGainHours30d / roiPct / carbonKgCO2e30d", basis: "structural_zero", detail: "no billing or carbon feed is connected" },
        { field: "departments", basis: "structural_zero", detail: "no department attribution is recorded" },
      ],
      note: USAGE_PROVENANCE_NOTE,
    };

    return {
      metrics,
      departments: [],
      modules,
      topModels,
      series,
      // Host-level resource telemetry and cloud spend have no backing store in
      // this deployment; they stay 0 rather than being estimated (named by
      // `provenance`).
      resources: { cpuPct: 0, memPct: 0, gpuPct: 0, storageGb: 0, storageQuotaGb: 0, networkMbps: 0, carbonKgCO2e: 0, costPerDayUsd: 0 },
      totalRequests30d,
      totalCost30dUsd: 0,
      totalSavings30dUsd: 0,
      // Share of workflow runs in the window that completed without a human.
      automationRate: workflowRuns ? round(workflowsAuto / workflowRuns, 3) : null,
      productivityGainHours30d: 0,
      roiPct: 0,
      // Adoption: members who actually generated AI traffic, not merely enrolled.
      adoptionPct: members ? round(activeMembers / members, 3) : null,
      carbonKgCO2e30d: 0,
      activeMembers30d: activeMembers,
      workflowsTotal,
      provenance,
    } as UsageDashboard;
  },
};
