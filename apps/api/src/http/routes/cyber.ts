/** Session 82 — Cybersecurity Academy, Ethical Hacking & Multi-Cloud Security */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { CyberService } from "../../cyber/cyber.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const LabSchema = z.object({ domain: z.string(), difficulty: z.string(), cloud: z.string().optional() });

/* Session 161 — completion schemas. */
const CloudEnum = z.enum(["aws", "azure", "gcp"]);
const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);
const StatusEnum = z.enum(["open", "remediated", "accepted"]);
const RangeKindEnum = z.enum([
  "red_team", "blue_team", "purple_team", "capture_the_flag", "bug_bounty", "adversary_emulation",
]);
const IdParam = z.object({ id: z.string().min(3).max(64) });

const FindingSchema = z.object({
  cloud: CloudEnum,
  service: z.string().min(1).max(80),
  severity: SeverityEnum,
  rule: z.string().min(2).max(300),
  resource: z.string().min(1).max(300),
  region: z.string().min(1).max(60),
  source: z.enum(["operator_entered", "scanner_reported"]).optional(),
  detectedAt: z.string().datetime().optional(),
});
const FindingPatch = z.object({ status: StatusEnum.optional(), severity: SeverityEnum.optional() });

const CertSchema = z.object({
  name: z.string().min(2).max(160),
  vendor: z.string().min(1).max(80),
  passed: z.boolean().optional(),
  scorePct: z.number().min(0).max(100).optional(),
  achievedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  preparationProgressPct: z.number().min(0).max(100).optional(),
  holderUserId: z.string().max(64).optional(),
});

const RangeSchema = z.object({
  name: z.string().min(2).max(160),
  kind: RangeKindEnum,
  cloudTargets: z.array(z.string().max(60)).max(20).optional(),
  durationHours: z.number().min(0).max(720).optional(),
  startsAt: z.string().optional(),
  players: z.number().int().min(0).max(100000).optional(),
});
const RangePatch = z.object({
  status: z.enum(["scheduled", "live", "completed"]).optional(),
  score: z.number().optional(),
  rank: z.number().int().optional(),
  players: z.number().int().min(0).optional(),
});

/** Every write path needs an organization context. */
function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerCyberRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await CyberService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.post("/labs", validate({body:LabSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await CyberService.startLab((req.user as any).organizationId, req.body, (req.user as any)?.id)});
  }catch(e){next(e);}});

  /* ------------------------- Session 161 ------------------------- */

  // Catalogue — static curriculum, safe to serve as configuration.
  router.get("/courses", async (_req, res, next) => {
    try { res.json({ ok: true, data: CyberService.courses() }); } catch (e) { next(e); }
  });
  router.get("/challenges", async (_req, res, next) => {
    try { res.json({ ok: true, data: CyberService.challenges() }); } catch (e) { next(e); }
  });
  router.get("/certification-tracks", async (_req, res, next) => {
    try { res.json({ ok: true, data: CyberService.certificationTracks() }); } catch (e) { next(e); }
  });
  router.get("/connectors", async (_req, res, next) => {
    try { res.json({ ok: true, data: CyberService.connectors() }); } catch (e) { next(e); }
  });
  router.get("/health", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await CyberService.health(oid) });
    } catch (e) { next(e); }
  });

  // Labs
  router.get("/labs", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await CyberService.listLabs(oid) });
    } catch (e) { next(e); }
  });
  router.post("/labs/:id/stop", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const lab = await CyberService.stopLab(oid, req.params.id);
      if (!lab) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: lab });
    } catch (e) { next(e); }
  });

  // Cloud findings — a register. WINDELS scans nothing itself.
  router.get("/findings", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await CyberService.listFindings(oid) });
    } catch (e) { next(e); }
  });
  router.post("/findings", validate({ body: FindingSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.status(201).json({ ok: true, data: await CyberService.createFinding(oid, req.body) });
    } catch (e) { next(e); }
  });
  router.patch("/findings/:id", validate({ params: IdParam, body: FindingPatch }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const rec = await CyberService.updateFinding(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: rec });
    } catch (e) { next(e); }
  });

  // Certifications — earned credentials, not the catalogue.
  router.get("/certifications", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await CyberService.listCertifications(oid) });
    } catch (e) { next(e); }
  });
  router.post("/certifications", validate({ body: CertSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.status(201).json({ ok: true, data: await CyberService.createCertification(oid, req.body) });
    } catch (e) { next(e); }
  });

  // Ranges
  router.get("/ranges", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await CyberService.listRanges(oid) });
    } catch (e) { next(e); }
  });
  router.post("/ranges", validate({ body: RangeSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.status(201).json({ ok: true, data: await CyberService.createRange(oid, req.body) });
    } catch (e) { next(e); }
  });
  router.patch("/ranges/:id", validate({ params: IdParam, body: RangePatch }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const rec = await CyberService.updateRange(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: rec });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for cyber — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "cy:notes", idPrefix: "cy-" });
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
