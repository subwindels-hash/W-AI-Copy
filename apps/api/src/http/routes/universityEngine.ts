/**
 * WINDELS Universal University & Higher Education Engine — routes.
 * Mounted at /api/v1/education-engine (auth-protected; see server.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { UniversityEngineService, FieldNotFoundError } from "../../education/universityEngine.service.js";
import { EDUCATION_LEVELS, type EducationLevel } from "@windels/shared";

const levelSchema = z.enum(EDUCATION_LEVELS as unknown as [string, ...string[]]);
const fieldParam = z.object({ id: z.string().min(1).max(80) });
const domainParam = z.object({ id: z.string().min(1).max(80) });

export function registerUniversityEngineRoutes(router: Router) {
  const uid = (req: any) => (req.user as any).id;

  router.get("/domains", async (_req, res, next) => {
    try { res.json({ ok: true, data: UniversityEngineService.domains() }); } catch (e) { next(e); }
  });

  router.get("/domains/:id", validate({ params: domainParam }), async (req, res, next) => {
    try {
      const d = UniversityEngineService.domainById(req.params.id);
      if (!d) return res.status(404).json({ ok: false, error: { code: "DOMAIN_NOT_FOUND" } });
      res.json({ ok: true, data: d });
    } catch (e) { next(e); }
  });

  router.get("/fields/:id", validate({ params: fieldParam }), async (req, res, next) => {
    try {
      const f = UniversityEngineService.fieldById(req.params.id);
      if (!f) return res.status(404).json({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
      res.json({ ok: true, data: { field: f.field, domain: f.domain } });
    } catch (e) { next(e); }
  });

  router.get("/education-levels", async (_req, res, next) => {
    try { res.json({ ok: true, data: UniversityEngineService.educationLevels() }); } catch (e) { next(e); }
  });

  router.get("/search", validate({ query: z.object({ q: z.string().min(1).max(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: UniversityEngineService.search(req.query.q as string) }); } catch (e) { next(e); }
  });

  // Program generation
  router.get("/program", validate({ query: z.object({
    field: z.string().min(1), level: levelSchema.optional(),
  }) }), async (req, res, next) => {
    try {
      const f = UniversityEngineService.fieldById(req.query.field as string);
      if (!f) return res.status(404).json({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
      const level = (req.query.level as EducationLevel | undefined) ?? "bachelor";
      res.json({ ok: true, data: UniversityEngineService.program(f.domain.id, f.field.id, level) });
    } catch (e) { next(e); }
  });

  router.get("/program/courses", validate({ query: z.object({ field: z.string().min(1), level: levelSchema.optional() }) }), async (req, res, next) => {
    try {
      const f = UniversityEngineService.fieldById(req.query.field as string);
      if (!f) return res.status(404).json({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
      const level = (req.query.level as EducationLevel | undefined) ?? "bachelor";
      res.json({ ok: true, data: UniversityEngineService.courses(f.domain.id, f.field.id, level) });
    } catch (e) { next(e); }
  });

  // Global university directory
  router.get("/universities", async (req, res, next) => {
    try {
      const country = req.query.country as string | undefined;
      res.json({ ok: true, data: UniversityEngineService.universities(country) });
    } catch (e) { next(e); }
  });

  router.get("/universities/:id", validate({ params: z.object({ id: z.string().min(1).max(80) }) }), async (req, res, next) => {
    try {
      const u = UniversityEngineService.university(req.params.id);
      if (!u) return res.status(404).json({ ok: false, error: { code: "UNIVERSITY_NOT_FOUND" } });
      res.json({ ok: true, data: u });
    } catch (e) { next(e); }
  });

  router.get("/countries", async (_req, res, next) => {
    try { res.json({ ok: true, data: UniversityEngineService.countries() }); } catch (e) { next(e); }
  });

  router.get("/countries/:code", validate({ params: z.object({ code: z.string().length(2) }) }), async (req, res, next) => {
    try {
      const c = UniversityEngineService.country(req.params.code);
      if (!c) return res.status(404).json({ ok: false, error: { code: "COUNTRY_NOT_FOUND" } });
      res.json({ ok: true, data: c });
    } catch (e) { next(e); }
  });

  // AI University Advisor
  router.post("/advise", validate({ body: z.object({ goal: z.string().min(2).max(500), level: levelSchema.optional() }) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await UniversityEngineService.advise(req.body.goal, req.body.level) });
    } catch (e) { next(e); }
  });

  // Study plan
  router.post("/study-plan", validate({ body: z.object({ field: z.string().min(1), level: levelSchema.optional(), years: z.number().int().min(1).max(6).optional() }) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: UniversityEngineService.createStudyPlan(req.body.field, req.body.level ?? "bachelor", req.body.years ?? 4) });
    } catch (e) {
      if (e instanceof FieldNotFoundError) return res.status(404).json({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
      next(e);
    }
  });

  // Learning — start a Lecturer AI session
  router.post("/teach", validate({ body: z.object({ field: z.string().optional(), title: z.string().optional(), level: levelSchema.optional() }) }), async (req, res, next) => {
    try {
      const result = await UniversityEngineService.teach(uid(req), {
        fieldId: req.body.field,
        title: req.body.title,
        level: req.body.level,
      });
      res.json({ ok: true, data: result });
    } catch (e: any) {
      // Session 154 — a missing field/title is a client-input mistake, not a
      // server failure: return 400 VALIDATION_ERROR instead of 500.
      if (e instanceof Error && /fieldId or a course title/.test(e.message)) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Provide a field or a course title to teach." } });
      }
      next(e);
    }
  });

  // Research & thesis guidance
  router.get("/research/:id", validate({ params: fieldParam }), async (req, res, next) => {
    try {
      const g = UniversityEngineService.researchGuidance(req.params.id);
      res.json({ ok: true, data: g });
    } catch (e) {
      if (e instanceof FieldNotFoundError) return res.status(404).json({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
      next(e);
    }
  });

  // Academic intelligence Q&A
  router.get("/insight", validate({ query: z.object({ q: z.string().min(2).max(300) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: UniversityEngineService.insight(req.query.q as string) }); } catch (e) { next(e); }
  });
}
