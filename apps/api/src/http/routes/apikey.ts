import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { ApiEnvelope } from "@windels/shared/api";
import {
  AkApiKeyCreateSchema,
  AkApiKeyIdSchema,
  AkApiKeyListQuerySchema,
  AkApiKeyUpdateSchema,
} from "@windels/shared/apiKeys";
import { PubUsageQuerySchema } from "@windels/shared/publicApi";
import { createApiKey, deleteApiKey, getApiKey, listApiKeys, rotateApiKey, updateApiKey } from "../../publicApi/publicApi.service.js";
import { publicApiUsage } from "../../publicApi/publicApiUsage.service.js";
import { resolveUserContext } from "../../services/workspace.service.js";

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

  // Session 120 — internal view of the public API call ledger (declared
  // before `/:id` so the literal path is not captured by the id parameter).
  keys.get("/usage", validate({ query: PubUsageQuerySchema }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      const days = Number((req.query as any).days ?? 7);
      const data = await publicApiUsage(ctx.organizationId, days);
      const envelope: ApiEnvelope<typeof data> = { ok: true, data, meta: meta(req) };
      res.json(envelope);
    } catch (e) { next(e); }
  });

  keys.post("/:id/revoke", validate({ params: AkApiKeyIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await updateApiKey(req.user!.id, req.params.id, { revoked: true }), meta: meta(req) }); } catch (e) { next(e); }
  });
  keys.post("/:id/rotate", validate({ params: AkApiKeyIdSchema, body: z.object({ expiresInDays: z.number().int().min(1).max(365).optional() }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await rotateApiKey(req.user!.id, req.params.id, req.body.expiresInDays), meta: meta(req) }); } catch (e) { next(e); }
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

  // Session 120 semantic correction: DELETE now hard-deletes the key row
  // (previously it silently *revoked* — there was no way to ever remove a
  // key, and revoked keys accumulated forever). Soft revocation remains
  // available via PATCH { revoked: true }.
  keys.delete("/:id", validate({ params: AkApiKeyIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await deleteApiKey(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); }
  });

  router.use("/apikeys", keys);
}
