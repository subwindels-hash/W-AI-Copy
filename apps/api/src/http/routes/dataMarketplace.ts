/** Session 61 — Data & Knowledge Marketplace */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { DataMarketplaceService } from "../../dataMarketplace/dataMarketplace.service.js";
import { MKT_ASSET_KINDS, MKT_LICENSE_MODELS } from "@windels/shared";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const PublishSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(MKT_ASSET_KINDS),
  description: z.string().min(5),
  licenseModel: z.enum(MKT_LICENSE_MODELS),
  priceUsd: z.number().nonnegative().optional(),
  subscriptionMonthlyUsd: z.number().nonnegative().optional(),
  royaltyPct: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  complianceTags: z.array(z.string()).optional(),
  rows: z.number().int().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  publisher: z.string().optional(),
});
const ReviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().optional() });

export function registerDataMarketplaceRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ok:true,data:await DataMarketplaceService.dashboard((req.user as any).organizationId)}); } catch(e){next(e);} });
  router.get("/assets", async (req, res, next) => { try {
    const kind = (req.query.kind as any) || undefined;
    res.json({ok:true,data:await DataMarketplaceService.list((req.user as any).organizationId, kind)});
  } catch(e){next(e);} });
  router.get("/assets/:id", async (req, res, next) => { try {
    const a = await DataMarketplaceService.get(req.params.id, (req.user as any).organizationId);
    if (!a) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"asset not found"}});
    res.json({ok:true,data:a});
  } catch(e){next(e);} });
  router.post("/assets", validate({body:PublishSchema}), async (req,res,next) => { try {
    res.json({ok:true,data:await DataMarketplaceService.publish({...req.body, organizationId:(req.user as any).organizationId, createdBy:(req.user as any).id})});
  } catch(e){next(e);} });
  router.post("/assets/:id/install", async (req,res,next) => { try {
    res.json({ok:true,data:await DataMarketplaceService.install(req.params.id, (req.user as any).id, (req.user as any).organizationId)});
  } catch(e){next(e);} });
  router.post("/assets/:id/review", validate({body:ReviewSchema}), async (req,res,next) => { try {
    res.json({ok:true,data:await DataMarketplaceService.review(req.params.id, (req.user as any).id, req.body.rating, req.body.comment, (req.user as any).organizationId)});
  } catch(e){next(e);} });


  // Real tenant-scoped notes ledger for dataMarketplace — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "dm:notes", idPrefix: "dm-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
