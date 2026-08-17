import { prisma } from "../db/client.js";
import {
  nativeComplete,
  nativeEmbed,
  nativeModelCatalog,
} from "./nativeAi.service.js";
import type {
  NativeAiConsoleChatInput,
  NativeAiConsoleCompletion,
  NativeAiConsoleEmbeddingInput,
  NativeAiConsoleEmbeddingResult,
  NativeAiConsoleStatus,
  NativeAiConsoleUsage,
} from "@windels/shared/nativeAi";

export interface NativeAiStudioContext {
  organizationId: string;
  userId: string;
}

/**
 * First-party session-authenticated facade over the Native AI router.
 *
 * It does not maintain a second model registry or fallback path. Every model
 * lookup and invocation delegates to nativeAi.service, which is the same
 * health-gated, real-provider-only implementation used by `/v1`.
 */
export class NativeAiConsoleService {
  static async status(): Promise<NativeAiConsoleStatus> {
    const catalog = await nativeModelCatalog(true);
    const publicApiEnabled = process.env.WINDELS_NATIVE_API_ENABLED === "true";
    const availability = catalog.public.length > 0 ? "available" : "unavailable";
    return {
      publicApiEnabled,
      models: catalog.public,
      availability,
      unavailableReason: availability === "available"
        ? null
        : publicApiEnabled ? "no_accepted_real_model" : "native_api_disabled",
      publicApi: {
        path: "/v1",
        authentication: "api_key",
        documentationPath: "/v1/openapi.json",
      },
      studio: {
        path: "/api/v1/native-ai",
        authentication: "session",
        streaming: false,
        demoFallbackExposed: false,
      },
    };
  }

  static async models() {
    return (await nativeModelCatalog(true)).public;
  }

  static async complete(input: NativeAiConsoleChatInput, context: NativeAiStudioContext): Promise<NativeAiConsoleCompletion> {
    const result = await nativeComplete({ ...input, stream: false }, context);
    // Do not surface the selected internal provider/model even to the Studio;
    // it is an operator/audit concern, not a stable UI contract.
    return {
      model: "windels-native",
      content: result.content,
      toolCalls: result.toolCalls,
      finishReason: result.finishReason,
      usage: {
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costMicros: result.usage.costMicros,
      },
      durationMs: result.durationMs,
      provenance: "real_provider",
    };
  }

  static async embed(input: NativeAiConsoleEmbeddingInput, context: NativeAiStudioContext): Promise<NativeAiConsoleEmbeddingResult> {
    const result = await nativeEmbed(input.input, input.model, context);
    return {
      model: "windels-embedding",
      data: result.embeddings.map((embedding, index) => ({ index, embedding })),
      usage: { tokensIn: result.tokensIn, costMicros: result.costMicros },
      provenance: "real_provider",
    };
  }

  /** Usage recorded through either `/v1` or the Studio, scoped to one org. */
  static async usage(organizationId: string): Promise<NativeAiConsoleUsage> {
    const [summary, product] = await Promise.all([
      prisma.apiUsageRecord.aggregate({
        where: { organizationId, productSlug: "native-ai" },
        _count: { id: true },
        _sum: { tokensIn: true, tokensOut: true, aiCostMicros: true },
      }),
      prisma.apiProduct.findFirst({
        where: { slug: "native-ai", enabled: true, OR: [{ organizationId }, { organizationId: null }] },
        select: { id: true },
      }),
    ]);
    const subscription = product
      ? await prisma.apiSubscription.findFirst({
          where: { organizationId, productId: product.id, status: "active" },
          select: { quota: true, usedThisMonth: true },
        })
      : null;
    const quotaLimit = subscription?.quota ?? null;
    const quotaUsed = subscription ? subscription.usedThisMonth ?? 0 : null;
    return {
      generatedAt: new Date().toISOString(),
      requests: (summary as any)._count?.id ?? 0,
      tokensIn: (summary as any)._sum?.tokensIn ?? 0,
      tokensOut: (summary as any)._sum?.tokensOut ?? 0,
      aiCostMicros: (summary as any)._sum?.aiCostMicros ?? 0,
      quota: {
        configured: !!subscription,
        limit: quotaLimit,
        used: quotaUsed,
        remaining: quotaLimit === null || quotaUsed === null ? null : Math.max(0, quotaLimit - quotaUsed),
      },
    };
  }
}
