import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { ApiEnvelope } from "@windels/shared/api";
import {
  AkApiKeyCreateSchema,
  AkApiKeyIdSchema,
  AkApiKeyListQuerySchema,
  AkApiKeyUpdateSchema,
} from "@windels/shared/apiKeys";
import { createApiKey, getApiKey, listApiKeys, revokeApiKey, updateApiKey } from "../../publicApi/publicApi.service.js";

function meta(req: any) {
  return { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) };
}

/**
 * API-key routes. Plaintext keys are CSPRNG-generated, hashed at rest and
 * returned only from the create response. All reads and mutations are scoped
 * through the authenticated user's organization membership.
 */
export function registerApiKeyRoutes(router: Router) {
  const keys = Router();
  keys.use(authenticate);

  keys.get("/", validate({ query: AkApiKeyListQuerySchema }), async (req, res, next) => {
    try {
      const data = await listApiKeys(req.user!.id, req.query as any);
      const envelope: ApiEnvelope<typeof data> = { ok: true, data, meta: meta(req) };
      res.json(envelope);
    } catch (e) { next(e); }
  });

  keys.get("/:id", validate({ params: AkApiKeyIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await getApiKey(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); }
  });

  keys.post("/", validate({ body: AkApiKeyCreateSchema }), async (req, res, next) => {
    try {
      const data = await createApiKey(req.user!.id, req.body);
      const envelope: ApiEnvelope<typeof data> = { ok: true, data, meta: meta(req) };
      res.status(201).json(envelope);
    } catch (e) { next(e); }
  });

  keys.patch("/:id", validate({ params: AkApiKeyIdSchema, body: AkApiKeyUpdateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await updateApiKey(req.user!.id, req.params.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });

  keys.delete("/:id", validate({ params: AkApiKeyIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await revokeApiKey(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); }
  });

  router.use("/apikeys", keys);
}
