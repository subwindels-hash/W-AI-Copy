/**
 * Observability — AI Observability (Slice 107).
 *
 * Aggregates AiRequest rows plus live in-memory stats to answer:
 *  - total requests, success/error rates, avg latency, p95 latency
 *  - by model, by feature, by agent
 *  - cost estimates (per-token pricing for common models — best-effort)
 *  - recent traces (last 100)
 *
 * This layer adds cost/p50/p95 calculations and a live tail to the AiRequest
 * persistence already provided by aiMonitoring.service.ts.
 */

import { prisma } from "../db/client.js";

const COST_PER_1K: Record<string, { prompt: number; completion: number }> = {
  // USD per 1K tokens, very rough estimates for dashboard purposes.
  "gpt-4o": { prompt: 0.005, completion: 0.015 },
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 },
  "claude-3-opus": { prompt: 0.015, completion: 0.075 },
  "claude-3-sonnet": { prompt: 0.003, completion: 0.015 },
  "claude-3-haiku": { prompt: 0.00025, completion: 0.00125 },
  "windels-assistant": { prompt: 0, completion: 0 }, // self-hosted proxy
  "echo": { prompt: 0, completion: 0 },
};

function estimateCost(modelId: string | null | undefined, promptTokens: number, completionTokens: number) {
  if (!modelId) return 0;
  const key = Object.keys(COST_PER_1K).find((k) => modelId.toLowerCase().includes(k));
  const prices = key ? COST_PER_1K[key] : { prompt: 0.002, completion: 0.002 };
  return (promptTokens / 1000) * prices.prompt + (completionTokens / 1000) * prices.completion;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface AiObsSummary {
  windowMinutes: number;
  totals: {
    requests: number;
    succeeded: number;
    failed: number;
    errorRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCostUsd: number;
  };
  byModel: Record<string, { requests: number; avgLatencyMs: number; errorRate: number; tokens: number; costUsd: number }>;
  byFeature: Record<string, { requests: number; errors: number }>;
  recent: Array<{ id: string; modelId: string | null; feature: string | null; status: string; durationMs: number | null; promptTokens: number | null; completionTokens: number | null; error: string | null; createdAt: string }>;
  timeSeries: Array<{ t: string; requests: number; errors: number; latencyMs: number; tokens: number }>;
}

export async function getAiObservability(userId: string, windowMinutes = 60): Promise<AiObsSummary> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  // Resolve org scope via workspace service lazily to avoid cyclic import.
  const { resolveUserContext } = await import("../services/workspace.service.js");
  const ctx = await resolveUserContext(userId);
  const requests = await prisma.aiRequest.findMany({
    where: { organizationId: ctx.organizationId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const total = requests.length;
  const succ = requests.filter((r) => r.status !== "failed").length;
  const fail = total - succ;
  const latencies = requests.map((r) => r.durationMs ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const totalPrompt = requests.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  const totalCompletion = requests.reduce((s, r) => s + (r.completionTokens ?? 0), 0);

  const byModel: AiObsSummary["byModel"] = {};
  const byFeature: AiObsSummary["byFeature"] = {};
  let totalCost = 0;
  for (const r of requests) {
    const m = r.modelId ?? "unknown";
    if (!byModel[m]) byModel[m] = { requests: 0, avgLatencyMs: 0, errorRate: 0, tokens: 0, costUsd: 0 };
    byModel[m].requests++;
    byModel[m].avgLatencyMs += r.durationMs ?? 0;
    if (r.status === "failed") byModel[m].errorRate++;
    byModel[m].tokens += (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
    const cost = estimateCost(r.modelId, r.promptTokens ?? 0, r.completionTokens ?? 0);
    byModel[m].costUsd += cost;
    totalCost += cost;
    const f = r.feature ?? "unknown";
    if (!byFeature[f]) byFeature[f] = { requests: 0, errors: 0 };
    byFeature[f].requests++;
    if (r.status === "failed") byFeature[f].errors++;
  }
  for (const k of Object.keys(byModel)) {
    const b = byModel[k];
    if (b.requests) {
      b.avgLatencyMs = Math.round(b.avgLatencyMs / b.requests);
      b.errorRate = b.errorRate / b.requests;
      b.costUsd = Number(b.costUsd.toFixed(4));
    }
  }

  // Time series: bucket by 1/10 of window size.
  const bucketSizeMs = Math.max(60_000, Math.floor((windowMinutes * 60_000) / 30));
  const buckets = new Map<number, { requests: number; errors: number; latency: number; tokens: number }>();
  for (const r of requests) {
    const bt = Math.floor(new Date(r.createdAt).getTime() / bucketSizeMs) * bucketSizeMs;
    let b = buckets.get(bt);
    if (!b) { b = { requests: 0, errors: 0, latency: 0, tokens: 0 }; buckets.set(bt, b); }
    b.requests++;
    if (r.status === "failed") b.errors++;
    b.latency += r.durationMs ?? 0;
    b.tokens += (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
  }
  const series: AiObsSummary["timeSeries"] = [];
  const now = Date.now();
  for (let t = Math.floor(since.getTime() / bucketSizeMs) * bucketSizeMs; t <= now; t += bucketSizeMs) {
    const b = buckets.get(t);
    series.push({
      t: new Date(t).toISOString(),
      requests: b?.requests ?? 0,
      errors: b?.errors ?? 0,
      latencyMs: b && b.requests ? Math.round(b.latency / b.requests) : 0,
      tokens: b?.tokens ?? 0,
    });
  }

  return {
    windowMinutes,
    totals: {
      requests: total,
      succeeded: succ,
      failed: fail,
      errorRate: total ? fail / total : 0,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      totalPromptTokens: totalPrompt,
      totalCompletionTokens: totalCompletion,
      totalCostUsd: Number(totalCost.toFixed(4)),
    },
    byModel,
    byFeature,
    recent: requests.slice(0, 100).map((r) => ({
      id: r.id, modelId: r.modelId, feature: r.feature, status: r.status,
      durationMs: r.durationMs, promptTokens: r.promptTokens, completionTokens: r.completionTokens,
      error: r.error, createdAt: r.createdAt.toISOString(),
    })),
    timeSeries: series,
  };
}
