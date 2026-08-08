/**
 * Cyber & Cloud Academy — Lecturer AI teaching tracks.
 * Mounted at /api/v1/cyber-cloud-academy (see server.ts).
 *
 * Bridges the Cybersecurity/Ethical-Hacking + Cloud Computing catalog to the
 * Lecturer AI adaptive tutor. Unauthorized → authenticate middleware (mounted
 * in server.ts). Unknown topics → 404 TOPIC_NOT_FOUND.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { CyberCloudAcademyService, TopicNotFoundError } from "../../education/cyberCloudAcademy.service.js";

const topicParam = z.object({ id: z.string().min(1).max(80) });
const startSchema = z.object({
  topicId: z.string().min(1).max(80),
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
});

export function registerCyberCloudAcademyRoutes(router: Router) {
  const uid = (req: any) => (req.user as any).id;

  router.get("/catalog", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: CyberCloudAcademyService.catalog() });
    } catch (e) { next(e); }
  });

  router.get("/progress", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CyberCloudAcademyService.progress(uid(req)) });
    } catch (e) { next(e); }
  });

  router.get("/path", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CyberCloudAcademyService.path(uid(req)) });
    } catch (e) { next(e); }
  });

  // Start a Lecturer AI session teaching a catalog topic.
  router.post("/start", validate({ body: startSchema }), async (req, res, next) => {
    try {
      const result = await CyberCloudAcademyService.startTopic(
        uid(req),
        req.body.topicId,
        req.body.level,
      );
      res.json({ ok: true, data: result });
    } catch (e) {
      if (e instanceof TopicNotFoundError) {
        return res.status(404).json({ ok: false, error: { code: "TOPIC_NOT_FOUND", message: e.message } });
      }
      next(e);
    }
  });

  // Lecturer AI session round-trips reuse the /education/lecturer endpoints
  // (answer / ask / get / mastery). This endpoint exposes mastery scoped to one
  // academy topic for convenience.
  router.get("/topic/:id", validate({ params: topicParam }), async (req, res, next) => {
    try {
      const topic = CyberCloudAcademyService.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ ok: false, error: { code: "TOPIC_NOT_FOUND" } });
      }
      const mastery = await (await import("../../education/lecturer.service.js")).LecturerService.topicMastery(
        uid(req),
        topic.teachingTopic,
      );
      res.json({ ok: true, data: { topic, mastery } });
    } catch (e) { next(e); }
  });
}
