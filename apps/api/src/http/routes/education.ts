/** Session 67 — Education & Learning + Lecturer AI adaptive tutor (Session 82 completion).
 * Session 159 adds list/create for catalog content and skills; existing
 * dashboard / tutor / path / assessment / lecturer paths keep their shapes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { EducationService } from "../../education/education.service.js";
import { LecturerService } from "../../education/lecturer.service.js";

const TutorSchema = z.object({ topic: z.string().min(2) });
const PathSchema = z.object({ title: z.string().min(2), goal: z.string().min(2), contentIds: z.array(z.string()).min(1), targetDate: z.string().optional() });
const AssessSchema = z.object({ contentId: z.string(), scorePct: z.number().min(0).max(100), correct: z.number().int().nonnegative(), questions: z.number().int().positive(), timeSpentSec: z.number().int().positive() });

const LecStart = z.object({ topic: z.string().min(2), level: z.enum(["beginner","intermediate","advanced"]).optional() });
const LecAnswer = z.object({ answerIndex: z.number().int().min(0).max(3), explanation: z.string().max(1000).optional() });
const LecAsk = z.object({ question: z.string().min(2), mode: z.enum(["simplify","more_detail","examples","why","how"]).default("why") });

const CreateContentSchema = z.object({
  title: z.string().min(2).max(300),
  kind: z.enum(["course", "lesson", "quiz", "project", "path", "assessment", "certification_prep"]),
  description: z.string().max(4000).optional(),
  durationMin: z.number().int().min(0).max(100_000),
  difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});
const CreateSkillSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  level: z.number().int().min(0).max(5).optional(),
  target: z.number().int().min(0).max(5).optional(),
});

export function registerEducationRoutes(router: Router) {
  const uid = (req: any) => (req.user as any).id;
  const oid = (req: any) => (req.user as any).organizationId ?? "org-windels";

  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await EducationService.dashboard(oid(req)) }); } catch (e) { next(e); } });
  router.post("/tutor/start", validate({ body: TutorSchema }), async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.startTutor(req.body.topic, uid(req), oid(req)) });
  } catch (e) { next(e); } });
  router.post("/paths", validate({ body: PathSchema }), async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.createPath({ ...req.body, userId: uid(req), organizationId: oid(req) }) });
  } catch (e) { next(e); } });
  router.post("/assessments", validate({ body: AssessSchema }), async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.assess(req.body.contentId, uid(req), req.body.scorePct, req.body.correct, req.body.questions, req.body.timeSpentSec, oid(req)) });
  } catch (e) { next(e); } });

  // Session 159 — catalog / skill / list surfaces (additive)
  router.get("/content", async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.listContent(oid(req)) });
  } catch (e) { next(e); } });
  router.post("/content", validate({ body: CreateContentSchema }), async (req, res, next) => { try {
    const c = await EducationService.createContent(oid(req), uid(req), req.body);
    res.status(201).json({ ok: true, data: c });
  } catch (e) { next(e); } });
  router.get("/paths", async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.listPaths(oid(req)) });
  } catch (e) { next(e); } });
  router.get("/assessments", async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.listAssessments(oid(req)) });
  } catch (e) { next(e); } });
  router.get("/skills", async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.listSkills(oid(req)) });
  } catch (e) { next(e); } });
  router.post("/skills", validate({ body: CreateSkillSchema }), async (req, res, next) => { try {
    const s = await EducationService.createSkill(oid(req), req.body);
    res.status(201).json({ ok: true, data: s });
  } catch (e) { next(e); } });
  router.get("/tutor", async (req, res, next) => { try {
    res.json({ ok: true, data: await EducationService.listTutorSessions(oid(req)) });
  } catch (e) { next(e); } });

  // ── Lecturer AI adaptive tutoring ────────────────────────────────
  router.post("/lecturer/start", validate({ body: LecStart }), async (req, res, next) => { try {
    res.json({ ok: true, data: await LecturerService.start(uid(req), req.body.topic, req.body.level) });
  } catch (e) { next(e); } });
  router.post("/lecturer/:id/answer", validate({ params: z.object({ id: z.string().cuid() }), body: LecAnswer }), async (req, res, next) => { try {
    res.json({ ok: true, data: await LecturerService.answer(uid(req), req.params.id, req.body.answerIndex, req.body.explanation) });
  } catch (e) { next(e); } });
  router.post("/lecturer/:id/ask", validate({ params: z.object({ id: z.string().cuid() }), body: LecAsk }), async (req, res, next) => { try {
    res.json({ ok: true, data: await LecturerService.ask(uid(req), req.params.id, req.body.question, req.body.mode) });
  } catch (e) { next(e); } });
  router.get("/lecturer/:id", validate({ params: z.object({ id: z.string().cuid() }) }), async (req, res, next) => { try {
    const s = await LecturerService.getSession(uid(req), req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    res.json({ ok: true, data: s });
  } catch (e) { next(e); } });
  router.get("/lecturer", async (req, res, next) => { try {
    res.json({ ok: true, data: await LecturerService.listSessions(uid(req)) });
  } catch (e) { next(e); } });
  router.get("/lecturer/topic/:topic/mastery", async (req, res, next) => { try {
    res.json({ ok: true, data: await LecturerService.topicMastery(uid(req), req.params.topic) });
  } catch (e) { next(e); } });
}
