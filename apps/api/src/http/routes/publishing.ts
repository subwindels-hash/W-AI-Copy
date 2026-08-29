import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import publishingModule from "../../publishing/publishing.module.js";
import { z } from "zod";
import { publishingRoutesSchema } from "@windels/shared/publishing";

const platformParam = z.object({ platform: z.enum(["youtube","tiktok","instagram","facebook","x","pinterest"]) });

export function registerPublishingRoutes(router: Router) {
  router.use(authenticate);
  router.get("/platforms", async (req, res, next) => {
    try { const data = await publishingModule.getPlatforms((req as any).user?.id); res.json({ ok:true, data, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/:platform/connect/start", validate({ params: platformParam }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.connectStart(req.params.platform, orgId, (req as any).user?.id); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/oauth/callback", async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.handleCallback((req.query as any).platform as string, req as any, orgId); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.delete("/:platform/connect", validate({ params: platformParam }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.disconnect(req.params.platform, orgId, (req as any).user?.id); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.get("/:platform/status", validate({ params: platformParam }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.getStatus(req.params.platform, orgId, (req as any).user?.id); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/:platform/publish", validate({ params: platformParam, body: publishingRoutesSchema.publish }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.publish(orgId, req.params.platform, (req.body as any).jobId, (req.body as any).options); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.get("/jobs", async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const jobs=await publishingModule.getJobs(orgId, parseInt((req.query as any).limit)||50, parseInt((req.query as any).offset)||0); res.json({ ok:true, data:jobs, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.get("/jobs/:id", validate({ params: z.object({ id: z.string().min(1) }) }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const job=await publishingModule.getJob(orgId, req.params.id); if(!job) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"}}); res.json({ ok:true, data:job, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/jobs/:id/retry", validate({ params: z.object({ id: z.string().min(1) }) }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.retryJob(orgId, req.params.id); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/jobs/:id/cancel", validate({ params: z.object({ id: z.string().min(1) }) }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.cancelJob(orgId, req.params.id); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.get("/audit", async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const a=await publishingModule.getAudit(orgId, parseInt((req.query as any).limit)||100); res.json({ ok:true, data:a, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/webhooks/:platform/register", validate({ params: platformParam, body: publishingRoutesSchema.registerWebhook }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.registerWebhook(req.params.platform, orgId, (req.body as any).endpoint); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.delete("/webhooks/:platform", validate({ params: platformParam }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.deleteWebhook(req.params.platform, orgId); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.post("/upload/:kind", validate({ params: publishingRoutesSchema.uploadKind }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.uploadFile(orgId, req.params.kind, Buffer.from([]), "file.mp4"); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.get("/uploads", async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const u=await publishingModule.getUploads(orgId, (req.query as any).platform); res.json({ ok:true, data:u, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.delete("/uploads/:file", validate({ params: z.object({ file: z.string().min(1) }) }), async (req, res, next) => {
    try { const orgId=(req as any).user!.organizationId!; const r=await publishingModule.deleteUpload(orgId, req.params.file); res.json({ ok:true, data:r, meta:{ requestId:(req as any).requestId }}); } catch(e){ next(e); }
  });
  router.get("/notes", async (req, res) => { res.json({ ok:true, data:[], meta:{ requestId:(req as any).requestId }}); });
  router.post("/notes", async (req, res) => { res.json({ ok:true, data:(req as any).body, meta:{ requestId:(req as any).requestId }}); });
  router.patch("/notes/:id", async (req, res) => { res.json({ ok:true, data:{ ...(req as any).body, id:(req as any).params.id }, meta:{ requestId:(req as any).requestId }}); });
  router.delete("/notes/:id", async (req, res) => { res.json({ ok:true, data:{ deleted:true }, meta:{ requestId:(req as any).requestId }}); });
}
