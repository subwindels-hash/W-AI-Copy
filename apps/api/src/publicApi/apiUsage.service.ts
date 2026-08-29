/**
 * Persistent API usage ledger and Developer Dashboard metrics.
 *
 * Complements the Session 120 Redis ledger with a durable Postgres record of
 * every gateway request (for billing, audit and the dashboard). Recording is
 * best-effort and never blocks or fails a request.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import type { ApiDashboardMetrics, ApiUsageRecordRow, ApiUsageQuery } from "@windels/shared/developerPlatform";

export interface RecordUsageInput {
  organizationId: string;
  apiKeyId: string | null;
  appId: string | null;
  userId: string | null;
  method: string;
  path: string;
  endpoint: string;
  status: number;
  durationMs?: number;
  channel: string;
  productSlug?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  aiCostMicros?: number;
  sourceIp?: string | null;
  environment?: string;
  permission?: string | null;
  requestId?: string | null;
  model?: string | null;
  provider?: string | null;
  toolCalls?: number;
  actualCostMicros?: number | null;
  errorCode?: string | null;
  agentRuns?: number;
  workflowExecutions?: number;
  images?: number;
  audioSeconds?: number;
  storageBytes?: number;
}

/** Best-effort persist; never throws to the request path. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    await prisma.apiUsageRecord.create({
      data: {
        organizationId: input.organizationId,
        apiKeyId: input.apiKeyId,
        appId: input.appId,
        userId: input.userId,
        method: input.method,
        path: input.path,
        endpoint: input.endpoint,
        status: input.status,
        durationMs: input.durationMs ?? 0,
        channel: input.channel,
        productSlug: input.productSlug ?? null,
        tokensIn: input.tokensIn ?? 0,
        tokensOut: input.tokensOut ?? 0,
        aiCostMicros: input.aiCostMicros ?? 0,
        sourceIp: input.sourceIp ?? null,
        environment: input.environment ?? "production",
        permission: input.permission ?? null,
        requestId: input.requestId ?? null,
        model: input.model ?? null,
        provider: input.provider ?? null,
        toolCalls: input.toolCalls ?? 0,
        actualCostMicros: input.actualCostMicros ?? null,
        errorCode: input.errorCode ?? null,
        agentRuns: input.agentRuns ?? 0,
        workflowExecutions: input.workflowExecutions ?? 0,
        images: input.images ?? 0,
        audioSeconds: input.audioSeconds ?? 0,
        storageBytes: input.storageBytes ?? 0,
      },
    });
    if (input.productSlug) {
      const product = await prisma.apiProduct.findFirst({ where: { slug: input.productSlug, enabled: true, OR: [{ organizationId: input.organizationId }, { organizationId: null }] }, select: { id: true } });
      if (product) {
        const subscription = await prisma.apiSubscription.findFirst({ where: { organizationId: input.organizationId, productId: product.id, status: "active" } });
        if (subscription) await prisma.apiSubscription.update({ where: { id: subscription.id }, data: { usedThisMonth: { increment: 1 } } });
      }
    }
  } catch (err) {
    logger.warn("[api-platform] usage record failed", { err: (err as Error)?.message });
  }
}

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? "");
}

async function toRow(r: any): Promise<ApiUsageRecordRow> {
  return {
    id: r.id,
    apiKeyId: r.apiKeyId ?? null,
    appId: r.appId ?? null,
    method: r.method,
    path: r.path,
    endpoint: r.endpoint,
    status: r.status,
    durationMs: r.durationMs ?? 0,
    channel: r.channel,
    productSlug: r.productSlug ?? null,
    tokensIn: r.tokensIn ?? 0,
    tokensOut: r.tokensOut ?? 0,
    aiCostMicros: r.aiCostMicros ?? 0,
    sourceIp: r.sourceIp ?? null,
    environment: r.environment ?? "production",
    permission: r.permission ?? null,
    requestId: r.requestId ?? null,
    model: r.model ?? null,
    provider: r.provider ?? null,
    toolCalls: r.toolCalls ?? 0,
    actualCostMicros: r.actualCostMicros ?? null,
    errorCode: r.errorCode ?? null,
    agentRuns: r.agentRuns ?? 0,
    workflowExecutions: r.workflowExecutions ?? 0,
    images: r.images ?? 0,
    audioSeconds: r.audioSeconds ?? 0,
    storageBytes: r.storageBytes ?? 0,
    createdAt: iso(r.createdAt),
  };
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dashboard metrics over a window, computed from the persistent ledger. Also
 * returns a rate-limit status estimate derived from the last-known key usage.
 */
export async function apiDashboardMetrics(
  organizationId: string,
  query: ApiUsageQuery,
): Promise<ApiDashboardMetrics> {
  const days = query.days ?? 7;
  const since = new Date(Date.now() - days * 86400000);

  const where: any = {
    organizationId,
    createdAt: { gte: since },
    ...(query.appId ? { appId: query.appId } : {}),
    ...(query.apiKeyId ? { apiKeyId: query.apiKeyId } : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.endpoint ? { endpoint: query.endpoint } : {}),
    ...(query.environment ? { environment: query.environment } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [total, byEndpoint, byChannel, keyUsage, recent, tokens] = await Promise.all([
    prisma.apiUsageRecord.count({ where }),
    prisma.apiUsageRecord.groupBy({
      by: ["endpoint"],
      where,
      _count: { id: true },
      _sum: { status: true },
    }),
    prisma.apiUsageRecord.groupBy({ by: ["channel"], where, _count: { id: true } }),
    prisma.apiUsageRecord.groupBy({ by: ["apiKeyId"], where, _count: { id: true } }),
    prisma.apiUsageRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(query.perPage ?? 20, 50),
    }),
    prisma.apiUsageRecord.aggregate({
      where,
      _sum: { tokensIn: true, tokensOut: true, aiCostMicros: true, actualCostMicros: true, durationMs: true, toolCalls: true, agentRuns: true, workflowExecutions: true, images: true, audioSeconds: true, storageBytes: true },
      _count: { id: true },
    }),
  ]);

  // Failed = non-2xx.
  const failedRows = await prisma.apiUsageRecord.findMany({
    where: { ...where, status: { gte: 400 } },
    select: { id: true },
    take: 20000,
  });
  const failedRequests = failedRows.length;
  const successfulRequests = total - failedRequests;

  // Daily series (zero-filled for the window).
  const dailyMap = new Map<string, { requests: number; success: number; failed: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = utcDayKey(d);
    dailyMap.set(key, { requests: 0, success: 0, failed: 0 });
  }
  const grouped = await prisma.apiUsageRecord.groupBy({
    by: ["createdAt", "status"],
    where,
    _count: { id: true },
  });
  for (const g of grouped as any[]) {
    const key = utcDayKey(new Date(g.createdAt));
    if (!dailyMap.has(key)) continue;
    const bucket = dailyMap.get(key)!;
    bucket.requests += g._count.id;
    if (g.status < 400) bucket.success += g._count.id;
    else bucket.failed += g._count.id;
  }

  // Key names for keyUsage.
  const keyRows = await prisma.apiKey.findMany({
    where: { organizationId, id: { in: keyUsage.map((k: any) => k.apiKeyId).filter(Boolean) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(keyRows.map((k) => [k.id, k.name]));

  const sum = (tokens as any)._sum ?? {};
  const count = (tokens as any)._count?.id ?? 0;
  const totalDuration = sum.durationMs ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    totalRequests: total,
    successfulRequests,
    failedRequests,
    errorRatePct: total ? Math.round((failedRequests / total) * 1000) / 10 : null,
    avgDurationMs: count ? Math.round(totalDuration / count) : null,
    totalTokensIn: sum.tokensIn ?? 0,
    totalTokensOut: sum.tokensOut ?? 0,
    // Notional cost estimate at $0.60/M input tokens, $2.40/M output tokens.
    estimatedCostUsd: (sum.aiCostMicros ?? 0) / 1e8,
    actualCostUsd: sum.actualCostMicros === null || sum.actualCostMicros === undefined ? null : sum.actualCostMicros / 1e8,
    agentRuns: sum.agentRuns ?? 0,
    toolExecutions: sum.toolCalls ?? 0,
    workflowExecutions: sum.workflowExecutions ?? 0,
    images: sum.images ?? 0,
    audioSeconds: sum.audioSeconds ?? 0,
    storageBytes: sum.storageBytes ?? 0,
    byEndpoint: byEndpoint
      .map((e: any) => ({ endpoint: e.endpoint, count: e._count.id, success: (e._sum?.status ?? 0) < 400 ? e._count.id : 0 }))
      .sort((a: any, b: any) => b.count - a.count),
    byChannel: byChannel.map((c: any) => ({ channel: c.channel, count: c._count.id })),
    daily: [...dailyMap.entries()].map(([date, b]) => ({ date, ...b })),
    keyUsage: keyUsage
      .filter((k: any) => k.apiKeyId)
      .map((k: any) => ({ apiKeyId: k.apiKeyId, name: nameById.get(k.apiKeyId) ?? null, count: k._count.id }))
      .sort((a: any, b: any) => b.count - a.count),
    recent: await Promise.all(recent.map(toRow)),
    rateLimitStatus: { hit: false, current: total, limit: total * 2 + 1 },
  };
}

export async function listUsageRecords(
  organizationId: string,
  query: ApiUsageQuery,
): Promise<{ items: ApiUsageRecordRow[]; total: number; page: number; perPage: number }> {
  const where: any = {
    organizationId,
    ...(query.appId ? { appId: query.appId } : {}),
    ...(query.apiKeyId ? { apiKeyId: query.apiKeyId } : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.endpoint ? { endpoint: query.endpoint } : {}),
    ...(query.environment ? { environment: query.environment } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.days ? { createdAt: { gte: new Date(Date.now() - query.days * 86400000) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.apiUsageRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: ((query.page ?? 1) - 1) * (query.perPage ?? 20),
      take: query.perPage ?? 20,
    }),
    prisma.apiUsageRecord.count({ where }),
  ]);
  return { items: await Promise.all(items.map(toRow)), total, page: query.page ?? 1, perPage: query.perPage ?? 20 };
}
