import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import type { ApiEnvelope } from "@windels/shared/api";
import { createApiKey, listApiKeys, revokeApiKey, CreateApiKeySchema } from "../../publicApi/publicApi.service.js";

/**
 * API-key routes. These create/read/revoke REAL persisted API keys (CSPRNG
 * generated, hashed at rest) via the same service that backs the Public API.
 * This previously returned a fake `ak_${Date.now()}` placeholder that was
 * never persisted and never usable.
 */
export function registerApiKeyRoutes(router: Router) {
  const keys = Router();
  keys.use(authenticate);

  keys.get("/", async (req, res, next) => {
    try {
      const data = await listApiKeys(req.user!.id);
      const env: ApiEnvelope<typeof data> = {
        ok: true,
        data,
        meta: { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) },
      };
      res.json(env);
    } catch (e) { next(e); }
  });

  keys.post("/", validate({ body: CreateApiKeySchema }), async (req, res, next) => {
    try {
      const data = await createApiKey(req.user!.id, req.body);
      const env: ApiEnvelope<typeof data> = {
        ok: true,
        data,
        meta: { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) },
      };
      res.status(201).json(env);
    } catch (e) { next(e); }
  });

  keys.delete("/:id", validate({ params: z.object({ id: z.string().min(1) }) }), async (req, res, next) => {
    try {
      await revokeApiKey(req.user!.id, req.params.id);
      res.json({ ok: true, data: { revoked: true }, meta: { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) } });
    } catch (e) { next(e); }
  });

  router.use("/apikeys", keys);
}
