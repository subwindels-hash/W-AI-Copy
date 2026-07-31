import { Router } from "express";
import { randomBytes } from "node:crypto";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { CameraService } from "../../camera/camera.service.js";

/**
 * ICE servers for WebRTC playback.
 *
 * TURN credentials are secrets and are handed to the browser, so they must come
 * from configuration — never from a literal in source. When TURN is not
 * configured we return STUN only rather than shipping a placeholder credential
 * that would fail (or, worse, work) in production.
 */
function iceServers() {
  const servers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: process.env.WEBRTC_STUN_URL || "stun:stun.l.google.com:19302" },
  ];
  const turnUrl = process.env.WEBRTC_TURN_URL;
  const turnUser = process.env.WEBRTC_TURN_USERNAME;
  const turnCredential = process.env.WEBRTC_TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCredential) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCredential });
  }
  return servers;
}

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
          // Session tokens gate access to a live camera feed, so they are drawn
          // from the CSPRNG. Math.random() produced a guessable 8-char token.
          webrtcSessionToken: "session_" + randomBytes(24).toString("base64url"),
          iceServers: iceServers(),
          turnConfigured: Boolean(process.env.WEBRTC_TURN_URL),
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
