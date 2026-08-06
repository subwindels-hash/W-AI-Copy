import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { WebsiteBuilderService } from "../../websiteBuilder/websiteBuilder.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  WbSiteUpsertSchema,
  WbPageUpsertSchema,
  WbBlockAddSchema,
  WbBlockPatchSchema,
  WbBlockReorderSchema,
  WbCopySchema,
} from "@windels/shared/websiteBuilder";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });
const PageParam = z.object({ pageId: z.string().min(1).max(64) });
const BlockParam = z.object({ pageId: z.string().min(1).max(64), blockId: z.string().min(1).max(64) });

export function registerWebsiteBuilderRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard & intelligence ──────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await WebsiteBuilderService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/intelligence/copy", validate({ body: WbCopySchema }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.generateCopy(req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Sites ─────────────────────────────────────────────────────────
  router.get("/sites", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const data = await WebsiteBuilderService.listSites(orgOf(req), { q, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sites", validate({ body: WbSiteUpsertSchema }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.createSite(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/sites/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.getSite(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Site not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/sites/:id/detail", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.getSiteDetail(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Site not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/sites/:id", validate({ params: IdParam, body: WbSiteUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.updateSite(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Site not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/sites/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await WebsiteBuilderService.deleteSite(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Site not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sites/:id/publish", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.publishSite(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Site not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sites/:id/archive", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.archiveSite(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Site not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Pages ─────────────────────────────────────────────────────────
  router.get("/sites/:id/pages", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.listPages(orgOf(req), { siteId: req.params.id });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sites/:id/pages", validate({ params: IdParam, body: WbPageUpsertSchema }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.createPage(orgOf(req), req.params.id, req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/pages/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.getPage(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/pages/:id", validate({ params: IdParam, body: WbPageUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.updatePage(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/pages/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await WebsiteBuilderService.deletePage(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/pages/:id/publish", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.publishPage(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/pages/:id/preview", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.previewPage(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Blocks ────────────────────────────────────────────────────────
  router.post("/pages/:pageId/blocks", validate({ params: PageParam, body: WbBlockAddSchema }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.addBlock(orgOf(req), req.params.pageId, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/pages/:pageId/blocks/:blockId", validate({ params: BlockParam, body: WbBlockPatchSchema }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.updateBlock(orgOf(req), req.params.pageId, req.params.blockId, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page or block not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/pages/:pageId/blocks/:blockId", validate({ params: BlockParam }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.removeBlock(orgOf(req), req.params.pageId, req.params.blockId, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page or block not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/pages/:pageId/blocks/reorder", validate({ params: PageParam, body: WbBlockReorderSchema }), async (req, res, next) => {
    try {
      const data = await WebsiteBuilderService.reorderBlocks(orgOf(req), req.params.pageId, req.body.blockIds, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Page not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
