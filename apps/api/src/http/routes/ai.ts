import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { aiRegistry } from "../../services/ai/registry.js";
import { getAiMetrics } from "../../services/aiMonitoring.service.js";
import { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } from "../../services/ai/types.js";
import { AppError } from "../../utils/result.js";

/**
 * AI routes:
 *   GET  /ai/models           — list available models (incl. health, source, capabilities)
 *   GET  /ai/providers        — list registered providers with health status
 *   GET  /ai/health           — quick boolean: is there at least one healthy real provider?
 *   GET  /ai/usage            — telemetry (requests/latency/cost) scoped to caller's org
 *   POST /ai/complete         — non-streaming completion (JSON in → JSON out)
 *   POST /ai/embed            — text embeddings for RAG/semantic search
 *   POST /ai/test-providers   — admin: live-probe every registered provider and report results
 */

const CompleteSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().min(1),
    name: z.string().optional(),
  })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(128000).optional(),
  system: z.string().optional(),
  responseFormat: z.object({ type: z.enum(["text", "json_object"]) }).optional(),
  requiredCapabilities: z.array(z.string()).optional(),
});

const EmbedSchema = z.object({
  model: z.string().optional(),
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(2048)]),
});

export function registerAIRoutes(router: Router) {
  const r = Router();
  r.use(authenticate);

  r.get("/models", (_req, res) => {
    res.json({ ok: true, data: aiRegistry.listModels() });
  });

  r.get("/providers", (_req, res) => {
    res.json({ ok: true, data: aiRegistry.providerHealth() });
  });

  r.get("/health", (_req, res) => {
    res.json({
      ok: true,
      data: {
        hasRealProvider: aiRegistry.hasRealModelConfigured(),
        providers: aiRegistry.providerHealth(),
        configMessage: aiRegistry.hasRealModelConfigured() ? null : AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE,
      },
    });
  });

  r.get("/usage", async (req, res, next) => {
    try {
      const periodDays = Math.min(Math.max(parseInt(String(req.query.periodDays ?? "30"), 10) || 30, 1), 365);
      const metrics = await getAiMetrics(req.user!.id, periodDays);
      res.json({ ok: true, data: metrics });
    } catch (e) { next(e); }
  });

  r.post(
    "/complete",
    validate({ body: CompleteSchema }),
    async (req, res, next) => {
      try {
        if (!aiRegistry.hasRealModelConfigured()) {
          throw new AppError("AI_PROVIDER_CONFIGURATION_REQUIRED", AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE);
        }
        const result = await aiRegistry.complete(req.body, {
          userId: req.user!.id,
          feature: "api",
          channel: "api",
        });
        res.json({ ok: true, data: result });
      } catch (e: any) {
        // Map error codes
        const code = e?.code ?? "AI_PROVIDER_ERROR";
        next(new AppError(code, e?.message ?? "completion failed"));
      }
    }
  );

  r.post(
    "/embed",
    validate({ body: EmbedSchema }),
    async (req, res, next) => {
      try {
        // Embeddings work in dev mode with the hash fallback, but in strict mode
        // require a real provider.
        const result = await aiRegistry.embed(req.body, {
          userId: req.user!.id,
          feature: "api",
        });
        res.json({ ok: true, data: result });
      } catch (e: any) {
        const code = e?.code ?? "AI_PROVIDER_ERROR";
        next(new AppError(code, e?.message ?? "embedding failed"));
      }
    }
  );

  r.post("/test-providers", async (req, res, next) => {
    try {
      // Admin only (role is lowercase from JWT)
      if (req.user!.role !== "super_admin" && req.user!.role !== "admin") {
        throw AppError.forbidden("Only admins can run provider tests");
      }
      const results = await aiRegistry.testProviders();
      res.json({ ok: true, data: results });
    } catch (e) { next(e); }
  });

  router.use("/ai", r);
}
