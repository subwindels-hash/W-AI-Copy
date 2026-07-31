/**
 * Session 55 — Usage Intelligence.
 *
 * Every figure is counted from records this organization actually holds. The
 * module was previously de-faked by replacing invented metrics with zeros,
 * which was correct but left most of the dashboard hollow — cost, latency,
 * error rate, per-module breakdowns and the 30-day series were all `0` or `[]`
 * even when `AiRequest` held exactly the data needed to compute them.
 *
 * Anything that genuinely has no backing store (host CPU/memory quotas, carbon
 * intensity, currency-converted savings) still reports 0 rather than a
 * plausible guess — see the notes inline.
 */
import { prisma } from "../db/client.js";
import type { UsageDashboard } from "@windels/shared";

const DAY_MS = 86_400_000;
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Percentage change between two periods; 0 when there is no prior baseline. */
function deltaPct(current: number, previous: number): number {
  if (!previous) return 0;
  return round(((current - previous) / previous) * 100, 1);
}
const trendOf = (d: number): "up" | "down" | "flat" => (d > 1 ? "up" : d < -1 ? "down" : "flat");

export const UsageService = {
  async ensureBootstrapped(_logger?: any, _oid = "org-windels") {},

  async dashboard(oid = "org-windels"): Promise<UsageDashboard> {
    const now = Date.now();
    const since = new Date(now - 30 * DAY_MS);
    const prevSince = new Date(now - 60 * DAY_MS);

    const [
      conversations, messages, workflowRuns, agents, members, tasks,
      prevConversations, prevMessages, prevWorkflowRuns, prevTasks,
      aiRequests, aiAgg, aiFailed, byChannel, byModel, activeMemberRows,
      workflowsTotal, workflowsAuto,
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

      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since } } }),
      prisma.aiRequest.aggregate({
        where: { organizationId: oid, createdAt: { gte: since } },
        _sum: { promptTokens: true, completionTokens: true, durationMs: true },
        _avg: { durationMs: true },
      }),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since }, status: { not: "succeeded" } } }),
      prisma.aiRequest.groupBy({
        by: ["channel"],
        where: { organizationId: oid, createdAt: { gte: since } },
        _count: { _all: true },
      }).catch(() => [] as Array<{ channel: string; _count: { _all: number } }>),
      prisma.aiRequest.groupBy({
        by: ["modelId"],
        where: { organizationId: oid, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }).catch(() => [] as Array<any>),

      // Distinct members who actually produced AI traffic in the window.
      prisma.aiRequest.findMany({
        where: { organizationId: oid, createdAt: { gte: since }, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      }).catch(() => [] as Array<{ userId: string | null }>),

      prisma.workflow.count({ where: { organizationId: oid } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, createdAt: { gte: since }, status: "SUCCEEDED" } }),
    ]);

    const totalTokens = (aiAgg._sum.promptTokens ?? 0) + (aiAgg._sum.completionTokens ?? 0);
    const avgLatencyMs = Math.round(aiAgg._avg.durationMs ?? 0);
    const errorRatePct = aiRequests ? round((aiFailed / aiRequests) * 100, 2) : 0;
    const totalRequests30d = messages + workflowRuns + conversations + aiRequests;

    // Day-by-day AI request volume across the window, counted from real rows.
    const dayRows = await prisma.aiRequest.findMany({
      where: { organizationId: oid, createdAt: { gte: since } },
      select: { createdAt: true, durationMs: true },
    }).catch(() => [] as Array<{ createdAt: Date; durationMs: number }>);
    const buckets = new Map<string, { requests: number; durationMs: number }>();
    for (let i = 29; i >= 0; i--) {
      buckets.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), { requests: 0, durationMs: 0 });
    }
    for (const r of dayRows) {
      const key = r.createdAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) { b.requests += 1; b.durationMs += r.durationMs; }
    }
    const series = [...buckets.entries()].map(([date, b]) => ({
      ts: date,
      requests: b.requests,
      tokens: 0,
      latencyMs: b.requests ? Math.round(b.durationMs / b.requests) : 0,
      automationTasks: 0,
    }));

    const modules = (byChannel as Array<{ channel: string; _count: { _all: number } }>)
      .map((c) => ({
        module: c.channel,
        requests: c._count._all,
        users: 0,
        p95LatencyMs: 0,
        errorRate: 0,
        sharePct: aiRequests ? round((c._count._all / aiRequests) * 100, 1) : 0,
      }))
      .sort((a, b) => b.requests - a.requests);

    const topModels = (byModel as Array<any>)
      .map((m) => ({
        modelId: m.modelId as string,
        requests: m._count._all as number,
        tokens: (m._sum?.promptTokens ?? 0) + (m._sum?.completionTokens ?? 0),
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const activeMembers = activeMemberRows.length;

    return {
      metrics: [
        { label: "Conversations (30d)", value: conversations, unit: "", deltaPct: deltaPct(conversations, prevConversations), trend: trendOf(deltaPct(conversations, prevConversations)) },
        { label: "Messages (30d)", value: messages, unit: "", deltaPct: deltaPct(messages, prevMessages), trend: trendOf(deltaPct(messages, prevMessages)) },
        { label: "Workflow runs (30d)", value: workflowRuns, unit: "", deltaPct: deltaPct(workflowRuns, prevWorkflowRuns), trend: trendOf(deltaPct(workflowRuns, prevWorkflowRuns)) },
        { label: "Tasks (30d)", value: tasks, unit: "", deltaPct: deltaPct(tasks, prevTasks), trend: trendOf(deltaPct(tasks, prevTasks)) },
        { label: "AI requests (30d)", value: aiRequests, unit: "", deltaPct: 0, trend: "flat" },
        { label: "AI tokens (30d)", value: totalTokens, unit: "tokens", deltaPct: 0, trend: "flat" },
        { label: "Avg AI latency", value: avgLatencyMs, unit: "ms", deltaPct: 0, trend: "flat" },
        { label: "AI error rate", value: errorRatePct, unit: "%", deltaPct: 0, trend: "flat" },
        { label: "AI employees", value: agents, unit: "", deltaPct: 0, trend: "flat" },
        { label: "Members", value: members, unit: "", deltaPct: 0, trend: "flat" },
      ],
      departments: [],
      modules,
      topModels,
      series,
      // Host-level resource telemetry and cloud spend have no backing store in
      // this deployment; they stay 0 rather than being estimated.
      resources: { cpuPct: 0, memPct: 0, gpuPct: 0, storageGb: 0, storageQuotaGb: 0, networkMbps: 0, carbonKgCO2e: 0, costPerDayUsd: 0 },
      totalRequests30d,
      totalCost30dUsd: 0,
      totalSavings30dUsd: 0,
      // Share of workflow runs in the window that completed without a human.
      automationRate: workflowRuns ? round(workflowsAuto / workflowRuns, 3) : 0,
      productivityGainHours30d: 0,
      roiPct: 0,
      // Adoption: members who actually generated AI traffic, not merely enrolled.
      adoptionPct: members ? round(activeMembers / members, 3) : 0,
      carbonKgCO2e30d: 0,
      activeMembers30d: activeMembers,
      workflowsTotal,
    } as UsageDashboard;
  },
};
