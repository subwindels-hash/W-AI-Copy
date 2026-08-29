import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import * as keys from "../../publicApi/publicApi.service.js";
import * as wh from "../../services/webhook.service.js";

const Id = z.object({ id: z.string().cuid() });
export function registerDeveloperRoutes(router: Router) {
  router.use(authenticate);
  router.get("/api-keys", async (req, res, next) => { try { res.json({ ok: true, data: await keys.listApiKeys(req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/api-keys", validate({ body: keys.CreateApiKeySchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await keys.createApiKey(req.user!.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.delete("/api-keys/:id", validate({ params: Id }), async (req, res, next) => { try { await keys.revokeApiKey(req.user!.id, req.params.id); res.status(204).end(); } catch (e) { next(e); } });

  // Static event catalog must precede /webhooks/:id.
  router.get("/webhooks/events", (_req, res) => res.json({ ok: true, data: wh.WEBHOOK_EVENTS }));
  router.get("/webhooks", async (req, res, next) => { try { res.json({ ok: true, data: await wh.listWebhooks(req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/webhooks", validate({ body: wh.CreateWebhookSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await wh.createWebhook(req.user!.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.patch("/webhooks/:id", validate({ params: Id, body: wh.UpdateWebhookSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await wh.updateWebhook(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.delete("/webhooks/:id", validate({ params: Id }), async (req, res, next) => { try { await wh.deleteWebhook(req.user!.id, req.params.id); res.status(204).end(); } catch (e) { next(e); } });
  router.get("/webhooks/:id/deliveries", validate({ params: Id }), async (req, res, next) => { try { res.json({ ok: true, data: await wh.listDeliveries(req.user!.id, req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
