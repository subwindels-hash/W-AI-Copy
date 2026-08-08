/**
 * University Education — Lecturer AI teaching platform.
 * Mounted at /api/v1/university (auth-protected; see server.ts).
 *
 * Exposes the full university catalog (faculties, bachelor/master/doctor
 * courses), per-faculty degree plans, course search, progress, and the
 * endpoint to start a Lecturer AI teaching session on any course.
 * Session round-trips reuse the /education/lecturer/* endpoints.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { UniversityService, UniversityCourseNotFoundError } from "../../education/university.service.js";
import { LecturerService } from "../../education/lecturer.service.js";
import { UNIVERSITY_DEGREE_LEVELS, type UniversityDegreeLevel } from "@windels/shared";

const courseIdParam = z.object({ id: z.string().min(1).max(80) });
const facultyIdParam = z.object({ id: z.string().min(1).max(80) });
const startSchema = z.object({ courseId: z.string().min(1).max(80) });
const searchSchema = z.object({ q: z.string().min(1).max(100) });

export function registerUniversityRoutes(router: Router) {
  const uid = (req: any) => (req.user as any).id;

  router.get("/overview", async (_req, res, next) => {
    try { res.json({ ok: true, data: UniversityService.overview() }); } catch (e) { next(e); }
  });

  router.get("/catalog", async (_req, res, next) => {
    try { res.json({ ok: true, data: UniversityService.catalog() }); } catch (e) { next(e); }
  });

  router.get("/faculties", async (_req, res, next) => {
    try { res.json({ ok: true, data: UniversityService.faculties() }); } catch (e) { next(e); }
  });

  router.get("/faculties/:id/courses", validate({ params: facultyIdParam }), async (req, res, next) => {
    try {
      const raw = req.query.level as string | undefined;
      const level = raw && (UNIVERSITY_DEGREE_LEVELS as readonly string[]).includes(raw)
        ? (raw as UniversityDegreeLevel)
        : undefined;
      if (raw && !level) {
        return res.status(400).json({ ok: false, error: { code: "INVALID_LEVEL" } });
      }
      const courses = UniversityService.coursesByFaculty(req.params.id, level);
      if (!courses.length && !UniversityService.getFaculty(req.params.id)) {
        return res.status(404).json({ ok: false, error: { code: "FACULTY_NOT_FOUND" } });
      }
      res.json({ ok: true, data: courses });
    } catch (e) { next(e); }
  });

  router.get("/faculties/:id/degree-plan", validate({ params: facultyIdParam }), async (req, res, next) => {
    try {
      const plan = await UniversityService.degreePlan(uid(req), req.params.id);
      if (!plan) return res.status(404).json({ ok: false, error: { code: "FACULTY_NOT_FOUND" } });
      res.json({ ok: true, data: plan });
    } catch (e) { next(e); }
  });

  router.get("/progress", async (req, res, next) => {
    try { res.json({ ok: true, data: await UniversityService.progress(uid(req)) }); } catch (e) { next(e); }
  });

  router.get("/search", validate({ query: searchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: UniversityService.search(req.query.q as string) }); } catch (e) { next(e); }
  });

  // Start a Lecturer AI teaching session on a university course.
  router.post("/start", validate({ body: startSchema }), async (req, res, next) => {
    try {
      const result = await UniversityService.startCourse(uid(req), req.body.courseId);
      res.json({ ok: true, data: result });
    } catch (e) {
      if (e instanceof UniversityCourseNotFoundError) {
        return res.status(404).json({ ok: false, error: { code: "COURSE_NOT_FOUND", message: e.message } });
      }
      next(e);
    }
  });

  router.get("/courses/:id", validate({ params: courseIdParam }), async (req, res, next) => {
    try {
      const course = UniversityService.getCourse(req.params.id);
      if (!course) return res.status(404).json({ ok: false, error: { code: "COURSE_NOT_FOUND" } });
      const mastery = await LecturerService.topicMastery(uid(req), course.teachingTopic);
      res.json({ ok: true, data: { course, mastery } });
    } catch (e) { next(e); }
  });
}
