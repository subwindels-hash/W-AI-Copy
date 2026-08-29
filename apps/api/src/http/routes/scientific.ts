/** Session 68 — Scientific Research.
 * Session 160 adds list/create for experiments, papers and hypotheses.
 * Existing dashboard / papers / notes paths keep their shapes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ScientificService } from "../../scientific/scientific.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { RESEARCH_DOMAINS } from "@windels/shared";

const SearchSchema = z.object({ q: z.string().min(1).max(200).optional() });
const DomainSchema = z.enum(RESEARCH_DOMAINS);
const ExpId = z.object({ id: z.string().min(3).max(64) });
const CreateExperimentSchema = z.object({
  title: z.string().min(2).max(300),
  hypothesis: z.string().min(2).max(2000),
  domain: DomainSchema,
  expectedOutcome: z.string().max(2000).optional(),
});
const ExperimentStatusSchema = z.object({
  status: z.enum(["planned", "running", "completed", "failed"]),
});
const CreatePaperSchema = z.object({
  title: z.string().min(2).max(400),
  authors: z.array(z.string().min(1).max(120)).min(1).max(40),
  year: z.number().int().min(1400).max(2100),
  venue: z.string().min(1).max(200),
  abstract: z.string().max(8000).optional(),
  doi: z.string().max(200).optional(),
  citations: z.number().int().min(0).optional(),
  domain: DomainSchema.optional(),
});
const CreateHypothesisSchema = z.object({
  statement: z.string().min(2).max(2000),
  domain: DomainSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export function registerScientificRoutes(router: Router) {
  const oid = (req: any) => (req.user as any).organizationId;

  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await ScientificService.dashboard(oid(req))});}catch(e){next(e);}});
  router.get("/papers", validate({query:SearchSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await ScientificService.searchPapers(oid(req), (req.query as any).q||"")});
  }catch(e){next(e);}});

  // Session 160 — experiments / papers / hypotheses (additive)
  router.get("/experiments", async (req, res, next) => { try {
    res.json({ ok: true, data: await ScientificService.listExperiments(oid(req)) });
  } catch (e) { next(e); } });
  router.post("/experiments", validate({ body: CreateExperimentSchema }), async (req, res, next) => { try {
    const e = await ScientificService.createExperiment(oid(req), req.body);
    res.status(201).json({ ok: true, data: e });
  } catch (e) { next(e); } });
  router.patch("/experiments/:id/status", validate({ params: ExpId, body: ExperimentStatusSchema }), async (req, res, next) => { try {
    const e = await ScientificService.updateExperimentStatus(oid(req), req.params.id, req.body.status);
    if (!e) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    res.json({ ok: true, data: e });
  } catch (e) { next(e); } });
  router.post("/papers", validate({ body: CreatePaperSchema }), async (req, res, next) => { try {
    const p = await ScientificService.createPaper(oid(req), req.body);
    res.status(201).json({ ok: true, data: p });
  } catch (e) { next(e); } });
  router.get("/hypotheses", async (req, res, next) => { try {
    res.json({ ok: true, data: await ScientificService.listHypotheses(oid(req)) });
  } catch (e) { next(e); } });
  router.post("/hypotheses", validate({ body: CreateHypothesisSchema }), async (req, res, next) => { try {
    const h = await ScientificService.createHypothesis(oid(req), req.body);
    res.status(201).json({ ok: true, data: h });
  } catch (e) { next(e); } });

  // Real tenant-scoped notes ledger for scientific — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "sci:notes", idPrefix: "sci-" });
  const _NoteSchema = z.object({
    title: z.string().min(2).max(200),
    body: z.string().min(2).max(4000),
    tags: z.array(z.string().max(40)).max(20).default([]),
  });
  const _NoteId = z.object({ id: z.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const org = (req.user as any)?.organizationId;
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(org, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const org = (req.user as any)?.organizationId;
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(org, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const org = (req.user as any)?.organizationId;
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(org, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const org = (req.user as any)?.organizationId;
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(org, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
