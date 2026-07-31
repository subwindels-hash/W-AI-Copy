import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { CameraService } from "../../camera/camera.service.js";

const createFeedSchema = {
  body: z.object({
    name: z.string().min(1).max(100),
    streamUrl: z.string().url(),
    locationName: z.string().max(200).optional(),
    resolution: z.string().max(50).optional(),
  }),
};

export function registerCameraRoutes(router: Router) {
  router.use(authenticate);

  router.get("/camera/feeds", async (req, res, next) => {
    try {
      const data = await CameraService.listFeeds(req.user!.organizationId!);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/camera/feeds", validate(createFeedSchema), async (req, res, next) => {
    try {
      const data = await CameraService.createFeed(req.user!.organizationId!, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/camera/feeds/:id/stream", async (req, res, next) => {
    try {
      const feed = await CameraService.getFeed(req.user!.organizationId!, req.params.id);
      if (!feed) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Feed not found" } });
      
      // Return WebRTC low-latency stream session tokens
      res.json({
        ok: true,
        data: {
          webrtcSessionToken: "session_" + Math.random().toString(36).slice(2, 10),
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "turn:turn.windels.ai:3478", username: "windels", credential: "change-me-in-production" }
          ]
        },
        meta: { requestId: req.requestId }
      });
    } catch (e) { next(e); }
  });

  router.get("/camera/feeds/:id/alerts", async (req, res, next) => {
    try {
      const data = await CameraService.listAlerts(req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
