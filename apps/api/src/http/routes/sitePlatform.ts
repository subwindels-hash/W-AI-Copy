import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { SitePlatformService } from "../../sitePlatform/sitePlatform.service.js";
import {
  SpAnnouncementPatchSchema,
  SpApiUpsertSchema,
  SpBrandPatchSchema,
  SpChatMessageSchema,
  SpChatStartSchema,
  SpContactMapPatchSchema,
  SpCreateAdminSchema,
  SpMediaUploadSchema,
  SpPageContentSchema,
  SpPageSeoSchema,
  SpReviewsSaveSchema,
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
  router.get("/public", async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.publicSite(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/media/:id", async (req, res, next) => {
    try {
      const media = await SitePlatformService.getMedia(req.params.id);
      if (!media) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Asset not found" } });
      res.setHeader("Content-Type", media.mime);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.send(media.buffer);
    } catch (e) { next(e); }
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

  router.get("/brand", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.getBrand(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/brand", requireSuperAdmin, validate({ body: SpBrandPatchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.updateBrand(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/images", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.getImages(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/images/:slot", requireSuperAdmin, validate({ body: z.object({ url: z.string().trim().min(1).max(500) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.setImageSlot(req.params.slot, req.body.url, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/media", requireSuperAdmin, validate({ body: SpMediaUploadSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await SitePlatformService.uploadMedia(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/pages", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.listPageContent(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/pages", requireSuperAdmin, validate({ body: SpPageContentSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.upsertPageContent(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/reviews", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.getReviews(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/reviews", requireSuperAdmin, validate({ body: SpReviewsSaveSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.saveReviews(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/map", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.getMap(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/map", requireSuperAdmin, validate({ body: SpContactMapPatchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.updateMap(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/apis", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.listApis(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/apis", requireSuperAdmin, validate({ body: SpApiUpsertSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.upsertApi(req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/apis/:id", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.removeApi(req.params.id, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/summary", requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await SitePlatformService.controlSummary(), meta: { requestId: req.requestId } }); }
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
