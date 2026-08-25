import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { SitePlatformService } from "../../sitePlatform/sitePlatform.service.js";
import {
  SpAnnouncementPatchSchema,
  SpChatMessageSchema,
  SpChatStartSchema,
  SpCreateAdminSchema,
  SpPageSeoSchema,
  SpSeoPatchSchema,
  SpSmtpSaveSchema,
  SpSmtpTestSchema,
} from "@windels/shared/sitePlatform";

const IdParam = z.object({ id: z.string().min(8).max(80) });

export function registerSitePlatformPublicRoutes(router: Router) {
  router.get("/announcement", async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.publicAnnouncement(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/seo", async (req, res, next) => {
    try {
      const path = typeof req.query.path === "string" ? req.query.path : "/";
      res.json({ ok: true, data: await SitePlatformService.resolvedMeta(path), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.get("/chat/health", async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.chatHealth(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/chat", rateLimit("contact"), validate({ body: SpChatStartSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await SitePlatformService.startChat(req.body.message), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/chat/:id/message", rateLimit("contact"), validate({ params: IdParam, body: SpChatMessageSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.chatMessage(req.params.id, req.body.message), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/chat/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SitePlatformService.getChat(req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Conversation not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.delete("/chat/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      await SitePlatformService.clearChat(req.params.id);
      res.json({ ok: true, data: { cleared: true }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}

export function registerSitePlatformAdminRoutes(router: Router) {
  router.use(authenticate);

  router.get("/announcement", requireAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.getAnnouncement(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/announcement", requireAdmin, validate({ body: SpAnnouncementPatchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.updateAnnouncement(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/seo", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.getSeo(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/seo", requireSuperAdmin, validate({ body: SpSeoPatchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.updateSeo(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/seo/pages", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.listPageSeo(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/seo/pages", requireSuperAdmin, validate({ body: SpPageSeoSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.upsertPageSeo(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/smtp", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.publicSmtp(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/smtp", requireSuperAdmin, validate({ body: SpSmtpSaveSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.saveSmtp(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/smtp/test", requireSuperAdmin, validate({ body: SpSmtpTestSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.testSmtp(req.body.to), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/admins", requireSuperAdmin, validate({ body: SpCreateAdminSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await SitePlatformService.createAdmin(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
}

export async function sendPublicSeoDocuments(app: import("express").Express) {
  const origin = process.env.WINDELS_WEB_ORIGIN || process.env.WINDELS_PUBLIC_API_ORIGIN || "https://windels.ai";
  app.get("/sitemap.xml", async (_req, res, next) => {
    try {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(await SitePlatformService.sitemapXml(origin.replace(/\/api\/v1$/, "")));
    } catch (e) { next(e); }
  });
  app.get("/robots.txt", async (_req, res, next) => {
    try {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(await SitePlatformService.robotsTxt(origin.replace(/\/api\/v1$/, "")));
    } catch (e) { next(e); }
  });
}
