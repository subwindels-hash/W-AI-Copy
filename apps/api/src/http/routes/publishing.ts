import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { z } from "zod";
import publishingModule from "../../publishing/publishing.module.js";

export function registerPublishingRoutes(router: Router) {
  router.use(authenticate);

  /**
   * GET /publishing/platforms
   * Get list of supported publishing platforms
   */
  router.get("/platforms", async (_req, res, next) => {
    try {
      const platforms = await publishingModule.getPlatforms();
      res.json({ ok: true, data: platforms, meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * POST /publishing/:platform/connect/start
   * Start OAuth connection to a platform
   */
  router.post(
    "/:platform/connect/start",
    z.object({ platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "pinterest"]) }).merge,
    async (req, res, next) => {
      try {
        const orgId = _req.user!.organizationId!;
        const result = await publishingModule.connectStart(req.params.platform, orgId);
        res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  /**
   * POST /publishing/oauth/callback
   * Handle OAuth callback
   */
  router.post("/oauth/callback", async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const result = await publishingModule.handleCallback(
        req.query.platform as string,
        req,
        orgId,
      );
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * DELETE /publishing/:platform/connect
   * Disconnect from a platform
   */
  router.delete(
    "/:platform/connect",
    z.object({ platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "pinterest"]) }).merge,
    async (req, res, next) => {
      try {
        const orgId = _req.user!.organizationId!;
        const result = await publishingModule.disconnect(req.params.platform, orgId);
        res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  /**
   * GET /publishing/:platform/status
   * Get platform connection status
   */
  router.get(
    "/:platform/status",
    z.object({ platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "pinterest"]) }).merge,
    async (req, res, next) => {
      try {
        const orgId = _req.user!.organizationId!;
        const status = await publishingModule.getStatus(req.params.platform, orgId);
        res.json({ ok: true, data: status, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  /**
   * POST /publishing/:platform/publish
   * Publish content to a platform
   */
  router.post(
    "/:platform/publish",
    z.object({
      platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "pinterest"]),
    }).merge,
    async (req, res, next) => {
      try {
        const orgId = _req.user!.organizationId!;
        const result = await publishingModule.publish(orgId, req.params.platform, req.body.jobId, req.body.options);
        res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  /**
   * GET /publishing/jobs
   * Get publish jobs
   */
  router.get("/jobs", async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const jobs = await publishingModule.getJobs(orgId, parseInt(req.query.limit as string) || 50, parseInt(req.query.offset as string) || 0);
      res.json({ ok: true, data: jobs, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /publishing/jobs/:id
   * Get single publish job
   */
  router.get("/jobs/:id", z.object({ id: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const job = await publishingModule.getJob(orgId, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: job, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * POST /publishing/jobs/:id/retry
   * Retry a failed publish job
   */
  router.post("/jobs/:id/retry", z.object({ id: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const result = await publishingModule.retryJob(orgId, req.params.id);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * POST /publishing/jobs/:id/cancel
   * Cancel a publish job
   */
  router.post("/jobs/:id/cancel", z.object({ id: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const result = await publishingModule.cancelJob(orgId, req.params.id);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /publishing/audit
   * Get publish audit log
   */
  router.get("/audit", async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const audit = await publishingModule.getAudit(orgId, parseInt(req.query.limit as string) || 100);
      res.json({ ok: true, data: audit, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * POST /publishing/webhooks/:platform/register
   * Register a webhook for a platform
   */
  router.post(
    "/webhooks/:platform/register",
    z.object({ platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "pinterest"]) }).merge,
    async (req, res, next) => {
      try {
        const orgId = _req.user!.organizationId!;
        const result = await publishingModule.registerWebhook(req.params.platform, orgId, req.body.endpoint);
        res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  /**
   * DELETE /publishing/webhooks/:platform
   * Delete a webhook
   */
  router.delete(
    "/webhooks/:platform",
    z.object({ platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "pinterest"]) }).merge,
    async (req, res, next) => {
      try {
        const orgId = _req.user!.organizationId!;
        const result = await publishingModule.deleteWebhook(req.params.platform, orgId);
        res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  /**
   * POST /publishing/upload/:kind
   * Upload a file for publishing
   */
  router.post("/upload/:kind", async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      // File handling would go here
      const result = await publishingModule.uploadFile(orgId, req.params.kind, Buffer.from([]), "file.mp4");
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /publishing/uploads
   * List uploaded files
   */
  router.get("/uploads", async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const uploads = await publishingModule.getUploads(orgId, req.query.platform as string);
      res.json({ ok: true, data: uploads, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * DELETE /publishing/uploads/:file
   * Delete an uploaded file
   */
  router.delete("/uploads/:file", z.object({ file: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = _req.user!.organizationId!;
      const result = await publishingModule.deleteUpload(orgId, req.params.file);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * Notes endpoints (shared pattern)
   */
  router.get("/notes", async (_req, res) => {
    res.json({ ok: true, data: [], meta: { requestId: _req.requestId } });
  });

  router.post("/notes", async (req, res) => {
    res.json({ ok: true, data: req.body, meta: { requestId: req.requestId } });
  });

  router.patch("/notes/:id", async (req, res) => {
    res.json({ ok: true, data: { ...req.body, id: req.params.id }, meta: { requestId: req.requestId } });
  });

  router.delete("/notes/:id", async (_req, res) => {
    res.json({ ok: true, data: { deleted: true }, meta: { requestId: _req.requestId } });
  });
}
