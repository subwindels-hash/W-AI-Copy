/**
 * Session 125 — Super Admin Biography, Identity Memory & AI Knowledge System.
 *
 * Mounted at `/api/v1/identity-knowledge`. Security model:
 *
 *   - **Record management (create/edit/approve/publish/archive/delete/
 *     import/export/grant/relations/sync) is SUPER-ADMIN ONLY** — enforced
 *     by `requireSuperAdmin` on every mutating route, and re-checked inside
 *     the service, so a mis-wired route still cannot bypass the authority
 *     rule.
 *   - **Reads are permission-aware**: super admin sees everything; org
 *     members see organization + public; any authenticated caller sees
 *     public; private records additionally require an explicit grant or
 *     ORG_ADMIN permission.
 *   - The **AI response engine** (`POST /ask`) answers only from records the
 *     caller may see, ranks Verified highest, labels AI-generated summaries,
 *     returns its sources, and says it lacks sufficient approved knowledge
 *     rather than fabricating.
 *   - Every mutation is versioned and audit-logged; publishes synchronize
 *     into the Enterprise Memory Fabric and dispatch Kernel (God-Node)
 *     events.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import { multipartSingle } from "../middleware/multipart.js";
import { AppError } from "../../utils/result.js";
import { IdentityKnowledgeService } from "../../identityKnowledge/identityKnowledge.service.js";
import { uploadAttachment } from "../../attachments/attachments.service.js";
import {
  IkAgentRunSchema,
  IkAskSchema,
  IkGrantSchema,
  IkImportSchema,
  IkRecordCreateSchema,
  IkRecordQuerySchema,
  IkRecordUpdateSchema,
  IkRelationSchema,
} from "@windels/shared/identityKnowledge";

const IdParam = z.object({ id: z.string().min(1).max(64) });

const UploadBody = z.object({
  title: z.string().trim().min(1).max(200),
  classification: z.enum(["private", "organization", "public"]).default("organization"),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export function registerIdentityKnowledgeRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) throw AppError.forbidden("The identity knowledge system is organization-scoped and this session carries no organization.");
    return org;
  };
  const actorOf = (req: any) => ({ id: req.user!.id, role: req.user!.role ?? null });
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Records ─────────────────────────────────────────────────────── */

  router.get("/records", validate({ query: IkRecordQuerySchema }), async (req, res, next) => {
    try {
      const q = req.query as any;
      const records = await IdentityKnowledgeService.listRecords(orgOf(req), actorOf(req), {
        kind: q.kind, classification: q.classification, status: q.status, tag: q.tag, search: q.q, limit: q.limit,
      });
      res.json({ ok: true, data: records, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/records", requireSuperAdmin, validate({ body: IkRecordCreateSchema }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.create(orgOf(req), actorOf(req), req.body);
      res.status(201).json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/records/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const viewer = actorOf(req);
      const rec = await IdentityKnowledgeService.getRecord(oid, req.params.id);
      if (!rec || !(await IdentityKnowledgeService.canView(oid, rec, viewer))) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      }
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/records/:id", requireSuperAdmin, validate({ params: IdParam, body: IkRecordUpdateSchema }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.update(orgOf(req), actorOf(req), req.params.id, req.body);
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/records/:id", requireSuperAdmin, validate({ params: IdParam }), async (req, res, next) => {
    try {
      const removed = await IdentityKnowledgeService.remove(orgOf(req), actorOf(req), req.params.id);
      if (!removed) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      res.json({ ok: true, data: { id: req.params.id, deleted: true }, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Lifecycle: approve / publish / archive (Super Admin only) ───── */

  router.post("/records/:id/approve", requireSuperAdmin, validate({ params: IdParam }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.setStatus(orgOf(req), actorOf(req), req.params.id, "approved");
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/records/:id/publish", requireSuperAdmin, validate({ params: IdParam }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.setStatus(orgOf(req), actorOf(req), req.params.id, "published");
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/records/:id/archive", requireSuperAdmin, validate({ params: IdParam }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.setStatus(orgOf(req), actorOf(req), req.params.id, "archived");
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Versions, grants, relations (version history + permission
   *    controls + knowledge graph edges) ───────────────────────────── */

  router.get("/records/:id/versions", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const viewer = actorOf(req);
      const rec = await IdentityKnowledgeService.getRecord(oid, req.params.id);
      if (!rec || !(await IdentityKnowledgeService.canView(oid, rec, viewer))) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      }
      res.json({ ok: true, data: await IdentityKnowledgeService.listVersions(oid, req.params.id), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/records/:id/grants", requireSuperAdmin, validate({ params: IdParam, body: IkGrantSchema }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.grant(orgOf(req), actorOf(req), req.params.id, req.body.userId);
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/records/:id/grants/:userId", requireSuperAdmin, validate({ params: IdParam.extend({ userId: z.string().cuid() }) }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.revokeGrant(orgOf(req), actorOf(req), req.params.id, req.params.userId);
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/records/:id/relations", requireSuperAdmin, validate({ params: IdParam, body: IkRelationSchema }), async (req, res, next) => {
    try {
      const rec = await IdentityKnowledgeService.addRelation(orgOf(req), actorOf(req), req.params.id, req.body.targetId, req.body.relation);
      res.json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Synchronization (Continuous Memory Synchronization) ─────────── */

  router.post("/sync", requireSuperAdmin, async (req, res, next) => {
    try {
      const result = await IdentityKnowledgeService.syncAll(orgOf(req), actorOf(req));
      res.json({ ok: true, data: result, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── AI response engine + agents ─────────────────────────────────── */

  router.post("/ask", validate({ body: IkAskSchema }), async (req, res, next) => {
    try {
      const answer = await IdentityKnowledgeService.ask(orgOf(req), actorOf(req), req.body.question);
      res.json({ ok: true, data: answer, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/agents", async (req, res, next) => {
    try {
      res.json({ ok: true, data: IdentityKnowledgeService.agents(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/agents/:agentId/run", validate({ params: z.object({ agentId: z.string().min(1).max(60) }), body: IkAgentRunSchema }), async (req, res, next) => {
    try {
      const run = await IdentityKnowledgeService.runAgent(orgOf(req), actorOf(req), req.params.agentId as any);
      res.json({ ok: true, data: run, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Dashboard, graph, activity, documents, import/export ────────── */

  router.get("/dashboard", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await IdentityKnowledgeService.dashboard(orgOf(req), actorOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/graph", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await IdentityKnowledgeService.graph(orgOf(req), actorOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/activity", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await IdentityKnowledgeService.activity(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/documents", requireSuperAdmin, multipartSingle("file"), validate({ body: UploadBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const file = (req as any).file;
      if (!file) throw AppError.badRequest("A file is required");
      // Reuse the attachments infrastructure for bytes + checksums.
      const att = await uploadAttachment(req.user!.id, { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype, size: file.size });
      const rec = await IdentityKnowledgeService.addDocument(oid, actorOf(req), {
        title: req.body.title,
        classification: req.body.classification,
        category: req.body.category,
        tags: req.body.tags,
        attachment: { id: att.id, filename: att.filename, mimeType: att.mimeType, sizeBytes: att.sizeBytes },
      });
      res.status(201).json({ ok: true, data: rec, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/import", requireSuperAdmin, validate({ body: IkImportSchema }), async (req, res, next) => {
    try {
      const result = await IdentityKnowledgeService.bulkImport(orgOf(req), actorOf(req), req.body);
      res.status(201).json({ ok: true, data: result, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/export", requireSuperAdmin, async (req, res, next) => {
    try {
      const result = await IdentityKnowledgeService.bulkExport(orgOf(req), actorOf(req));
      res.json({ ok: true, data: result, meta: meta(req) });
    } catch (e) { next(e); }
  });
}
