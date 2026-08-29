import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import { EventBus } from "./eventBus.js";

// Record AI request telemetry and start model registry seed on boot.
import { ensureSeedModels } from "./modelRegistry.service.js";
void ensureSeedModels().catch((e) => console.warn("model seed failed:", e?.message));

interface RecordInput {
  userId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
  workflowRunId?: string | null;
  channel: "chat" | "agent" | "workflow" | "api" | "talk";
  provider: string;
  modelId: string;
  feature?: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  status?: "succeeded" | "failed";
  error?: string | null;
  organizationId: string;
}

export async function recordAiRequest(r: RecordInput) {
  try {
    // Find the registered model for cost lookup
    const model = await prisma.modelRegistry.findFirst({
      where: {
        provider: r.provider, modelId: r.modelId,
        OR: [{ organizationId: null }, { organizationId: r.organizationId }],
      },
      orderBy: { organizationId: "desc" },
    });
    const req = await prisma.aiRequest.create({
      data: {
        organizationId: r.organizationId,
        userId: r.userId ?? null,
        agentId: r.agentId ?? null,
        conversationId: r.conversationId ?? null,
        workflowRunId: r.workflowRunId ?? null,
        channel: r.channel,
        provider: r.provider,
        modelId: r.modelId,
        modelRegistryId: model?.id ?? null,
        durationMs: r.durationMs,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        status: r.status ?? "succeeded",
        error: r.error ?? null,
        feature: r.feature ?? null,
      },
    });
    await EventBus.emit(r.status === "failed" ? "ai.error" : "ai.response", {
      requestId: req.id, organizationId: r.organizationId, provider: r.provider, modelId: r.modelId,
      durationMs: r.durationMs, promptTokens: r.promptTokens, completionTokens: r.completionTokens,
    });
  } catch (e) {
    console.warn("[aiMonitoring] record failed:", (e as Error)?.message);
  }
}

export async function getAiMetrics(userId: string, periodDays = 30) {
  const ctx = await resolveUserContext(userId);
  // Snap since-boundary to UTC midnight so the reported window (and any
  // counts it implies) are byte-stable within a UTC day.
  const dayMs = 86_400_000;
  const nowMs = Math.floor(Date.now() / dayMs) * dayMs + dayMs;
  const since = new Date(nowMs - periodDays * dayMs);
  const [total, succeeded, failed, byModel, byChannel, recent, costs] = await Promise.all([
    prisma.aiRequest.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since } } }),
    prisma.aiRequest.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since }, status: "succeeded" } }),
    prisma.aiRequest.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since }, status: "failed" } }),
    prisma.aiRequest.groupBy({ by: ["modelId"], where: { organizationId: ctx.organizationId, createdAt: { gte: since } }, _count: { _all: true }, _avg: { durationMs: true }, _sum: { promptTokens: true, completionTokens: true } }),
    prisma.aiRequest.groupBy({ by: ["channel"], where: { organizationId: ctx.organizationId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.aiRequest.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 20, include: { modelRegistry: true } }),
    prisma.aiRequest.findMany({
      where: { organizationId: ctx.organizationId, createdAt: { gte: since }, modelRegistry: { isNot: null } },
      include: { modelRegistry: true },
    }),
  ]);

  let totalCost = 0;
  for (const r of costs) {
    if (r.modelRegistry) {
      totalCost += (r.promptTokens / 1000) * r.modelRegistry.costInputPer1k + (r.completionTokens / 1000) * r.modelRegistry.costOutputPer1k;
    }
  }
  const avgLatency = total > 0
    ? Math.round(recent.filter(r=>r.status==="succeeded").reduce((a,b)=>a+b.durationMs,0) / Math.max(1, succeeded))
    : 0;
  const totalPromptTokens = costs.reduce((a,b)=>a+b.promptTokens,0);
  const totalCompletionTokens = costs.reduce((a,b)=>a+b.completionTokens,0);

  return {
    periodDays, since,
    totals: { requests: total, succeeded, failed, avgLatency, totalCost, totalPromptTokens, totalCompletionTokens, successRate: total ? Math.round((succeeded/total)*1000)/10 : 0 },
    byModel: byModel.map((m) => ({ modelId: m.modelId, count: m._count._all, avgDurationMs: Math.round(m._avg.durationMs ?? 0), promptTokens: m._sum.promptTokens ?? 0, completionTokens: m._sum.completionTokens ?? 0 })),
    byChannel: byChannel.map((c) => ({ channel: c.channel, count: c._count._all })),
    recent: recent.map((r) => ({
      id: r.id, channel: r.channel, provider: r.provider, modelId: r.modelId,
      durationMs: r.durationMs, promptTokens: r.promptTokens, completionTokens: r.completionTokens,
      status: r.status, error: r.error, feature: r.feature, createdAt: r.createdAt,
    })),
  };
}
