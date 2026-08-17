import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { orgScope } from "../middleware/orgScope.js";
import { validate } from "../middleware/validate.js";
import { nativeAiMemberQuota } from "../middleware/nativeAiQuota.js";
import { NativeAiConsoleChatSchema, NativeAiConsoleEmbeddingSchema } from "@windels/shared/nativeAi";
import { NativeAiConsoleService } from "../../nativeAi/console.service.js";
import { nativeAiOpenApi } from "../../nativeAi/openapi.js";
import { recordUsage } from "../../publicApi/apiUsage.service.js";
import { AppError } from "../../utils/result.js";

function context(req: any) {
  const organizationId = req.org?.organizationId;
  const userId = req.user?.id;
  if (!organizationId || !userId) throw AppError.forbidden("Organization context required");
  return { organizationId, userId };
}

/**
 * First-party Native AI Studio.
 *
 * `/v1` remains the API-key-authenticated external compatibility surface. This
 * authenticated browser surface uses the same real-provider-only router but
 * deliberately offers no streaming, files, media, or key-management bypass.
 */
export function registerNativeAiRoutes(router: Router) {
  router.use(authenticate);
  // Unlike a JWT claim alone, orgScope also verifies a current membership and
  // attaches the validated organization context before any Studio endpoint.
  router.use(orgScope());

  router.get("/status", async (_req, res, next) => {
    try { res.json({ ok: true, data: await NativeAiConsoleService.status() }); }
    catch (error) { next(error); }
  });

  router.get("/models", async (_req, res, next) => {
    try { res.json({ ok: true, data: await NativeAiConsoleService.models() }); }
    catch (error) { next(error); }
  });

  router.get("/openapi", (req, res) => {
    const origin = process.env.WINDELS_PUBLIC_API_ORIGIN || `${req.protocol}://${req.get("host")}`;
    res.json({ ok: true, data: nativeAiOpenApi(origin) });
  });

  router.get("/usage", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await NativeAiConsoleService.usage(context(req).organizationId) });
    } catch (error) { next(error); }
  });

  router.post("/chat", nativeAiMemberQuota, validate({ body: NativeAiConsoleChatSchema }), async (req, res, next) => {
    const started = Date.now();
    try {
      const caller = context(req);
      const data = await NativeAiConsoleService.complete(req.body, caller);
      // The durable native-ai product ledger is shared with /v1. It is
      // intentionally best effort and cannot turn a real completion into a
      // failure merely because telemetry storage is unavailable.
      void recordUsage({
        organizationId: caller.organizationId,
        apiKeyId: null,
        appId: null,
        userId: caller.userId,
        method: req.method,
        path: "/api/v1/native-ai/chat",
        endpoint: "native.studio.chat",
        status: 200,
        durationMs: Date.now() - started,
        channel: "studio",
        productSlug: "native-ai",
        tokensIn: data.usage.tokensIn,
        tokensOut: data.usage.tokensOut,
        aiCostMicros: data.usage.costMicros,
        actualCostMicros: null,
        requestId: req.requestId ?? null,
        model: data.model,
        provider: null,
        toolCalls: data.toolCalls.length,
        sourceIp: req.ip ?? null,
        environment: process.env.NODE_ENV ?? "development",
        permission: "session:member",
      });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  router.post("/embeddings", nativeAiMemberQuota, validate({ body: NativeAiConsoleEmbeddingSchema }), async (req, res, next) => {
    const started = Date.now();
    try {
      const caller = context(req);
      const data = await NativeAiConsoleService.embed(req.body, caller);
      void recordUsage({
        organizationId: caller.organizationId,
        apiKeyId: null,
        appId: null,
        userId: caller.userId,
        method: req.method,
        path: "/api/v1/native-ai/embeddings",
        endpoint: "native.studio.embeddings",
        status: 200,
        durationMs: Date.now() - started,
        channel: "studio",
        productSlug: "native-ai",
        tokensIn: data.usage.tokensIn,
        tokensOut: 0,
        aiCostMicros: data.usage.costMicros,
        actualCostMicros: null,
        requestId: req.requestId ?? null,
        model: data.model,
        provider: null,
        sourceIp: req.ip ?? null,
        environment: process.env.NODE_ENV ?? "development",
        permission: "session:member",
      });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
}
