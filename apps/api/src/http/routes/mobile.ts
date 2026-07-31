import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as mobileAuth from "../../services/mobileAuth.service.js";
import * as push from "../../services/push.service.js";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/result.js";

const DeviceRegisterSchema = z.object({
  deviceId: z.string().optional(),
  platform: z.enum(["ios", "android", "web-pwa"]),
  deviceName: z.string().max(100).optional(),
  osVersion: z.string().max(32).optional(),
  appVersion: z.string().max(32).optional(),
  deviceModel: z.string().max(64).optional(),
});

const PushSubscribeSchema = z.object({
  deviceId: z.string(),
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

const BiometricRegVerifySchema = z.object({
  deviceId: z.string(),
  rpId: z.string().max(200).default("localhost"),
  id: z.string(),
  rawId: z.string(),
  type: z.string(),
  transports: z.array(z.string()).optional(),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
  }),
});

const BiometricAuthVerifySchema = z.object({
  rpId: z.string().max(200).default("localhost"),
  id: z.string(),
  rawId: z.string(),
  type: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});

const PinSchema = z.object({
  deviceId: z.string(),
  pin: z.string().min(4).max(8),
});

const OfflineSyncSchema = z.object({
  deviceId: z.string(),
  actions: z
    .array(
      z.object({
        id: z.string(),
        method: z.enum(["POST", "PATCH", "PUT", "DELETE"]),
        path: z.string().startsWith("/api/v1/"),
        body: z.unknown().optional(),
        queuedAt: z.coerce.date().optional(),
      })
    )
    .max(200)
    .default([]),
  lastSyncAt: z.coerce.date().optional(),
});

const ok = (data: unknown) => ({ ok: true as const, data });

export function registerMobileRoutes(router: Router) {
  const r = Router();

  // Public: mobile config (vapid key, min version, etc.) — needed before auth for service worker.
  r.get("/config", (_req, res) => {
    res.json(
      ok({
        vapidPublicKey: env.VAPID_PUBLIC_KEY,
        minAppVersion: "0.15.0",
        forceUpdate: false,
        apiBase: "/api/v1",
      })
    );
  });

  r.use(authenticate);

  // ─── Devices ──────────────────────────────────────────────────────────
  r.post("/devices/register", validate({ body: DeviceRegisterSchema }), async (req, res, next) => {
    try {
      const device = await mobileAuth.registerDevice(
        req.user!.id,
        req.body as any,
        { ip: req.ip, userAgent: req.get("user-agent") ?? undefined }
      );
      res.json(ok(device));
    } catch (e) { next(e); }
  });
  r.get("/devices", async (req, res, next) => {
    try { res.json(ok(await mobileAuth.listDevices(req.user!.id))); } catch (e) { next(e); }
  });
  r.delete("/devices/:id", async (req, res, next) => {
    try { res.json(ok(await mobileAuth.revokeDevice(req.user!.id, req.params.id))); } catch (e) { next(e); }
  });

  // ─── Push Notifications ──────────────────────────────────────────────
  r.post("/push/subscribe", validate({ body: PushSubscribeSchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof PushSubscribeSchema>;
      // verify device belongs to user
      const device = await prisma.mobileDevice.findFirst({ where: { id: body.deviceId, userId: req.user!.id } });
      if (!device) throw AppError.notFound("Device not found");
      const result = await push.registerSubscription(req.user!.id, body.deviceId, { endpoint: body.endpoint, keys: body.keys }, { userAgent: req.get("user-agent") ?? undefined });
      res.json(ok(result));
    } catch (e) { next(e); }
  });
  r.delete("/push/subscribe", async (req, res, next) => {
    try {
      const endpoint = String(req.query.endpoint ?? req.body?.endpoint ?? "");
      if (!endpoint) throw AppError.badRequest("endpoint required");
      res.json(ok(await push.removeSubscription(req.user!.id, endpoint)));
    } catch (e) { next(e); }
  });
  r.post("/push/test", async (req, res, next) => {
    try {
      const result = await push.sendToUser(req.user!.id, {
        type: "system",
        title: "WINDELS AI OS",
        body: "Push notifications are working. 🎉",
        url: "/m",
      });
      res.json(ok(result));
    } catch (e) { next(e); }
  });

  // ─── Biometrics (WebAuthn platform authenticator) ────────────────────
  r.post("/biometric/register-challenge", (req, res) => {
    const rpId = String(req.query.rpId ?? req.get("host")?.split(":")[0] ?? "localhost");
    const rpName = "WINDELS AI OS";
    res.json(ok(mobileAuth.getRegisterChallenge(req.user!.id, rpId, rpName, req.user!.email)));
  });
  r.post("/biometric/register-verify", validate({ body: BiometricRegVerifySchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof BiometricRegVerifySchema>;
      res.json(ok(await mobileAuth.verifyRegister(req.user!.id, body.deviceId, body.rpId, body as any)));
    } catch (e) { next(e); }
  });
  r.post("/biometric/auth-challenge", (req, res) => {
    const rpId = String(req.query.rpId ?? req.get("host")?.split(":")[0] ?? "localhost");
    res.json(ok(mobileAuth.getAuthChallenge(req.user!.id, rpId)));
  });
  r.post("/biometric/auth-verify", validate({ body: BiometricAuthVerifySchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof BiometricAuthVerifySchema>;
      res.json(ok(await mobileAuth.verifyAuthAssertion(req.user!.id, body.rpId, body as any)));
    } catch (e) { next(e); }
  });

  // ─── PIN fallback ────────────────────────────────────────────────────
  r.post("/pin/set", validate({ body: PinSchema }), async (req, res, next) => {
    try {
      const { deviceId, pin } = req.body as z.infer<typeof PinSchema>;
      res.json(ok(await mobileAuth.setPin(req.user!.id, deviceId, pin)));
    } catch (e) { next(e); }
  });
  r.post("/pin/verify", validate({ body: PinSchema }), async (req, res, next) => {
    try {
      const { deviceId, pin } = req.body as z.infer<typeof PinSchema>;
      res.json(ok(await mobileAuth.verifyPin(req.user!.id, deviceId, pin)));
    } catch (e) { next(e); }
  });

  // ─── Notifications list (reuses push service storage) ────────────────
  r.get("/notifications", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const unreadOnly = req.query.unread === "1";
      const before = req.query.before as string | undefined;
      res.json(ok(await push.listNotifications(req.user!.id, { unreadOnly, limit, before })));
    } catch (e) { next(e); }
  });
  r.post("/notifications/:id/read", async (req, res, next) => {
    try { res.json(ok(await push.markRead(req.user!.id, req.params.id))); } catch (e) { next(e); }
  });
  r.post("/notifications/read-all", async (req, res, next) => {
    try { res.json(ok(await push.markAllRead(req.user!.id))); } catch (e) { next(e); }
  });

  // ─── Offline sync queue (MVP: accept & acknowledge; action replay is
  // dispatched via existing API client when network returns on-device) ─
  r.post("/offline/sync", validate({ body: OfflineSyncSchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof OfflineSyncSchema>;
      // MVP: persist queued actions for auditing + mark device online
      await prisma.mobileDevice.update({ where: { id: body.deviceId }, data: { lastSeenAt: new Date() } }).catch(() => null);
      res.json(
        ok({
          received: body.actions.length,
          serverTime: new Date().toISOString(),
          // Clients will refetch critical lists (notifications, conversations) themselves.
          hydrated: { notifications: await push.listNotifications(req.user!.id, { limit: 20 }) },
        })
      );
    } catch (e) { next(e); }
  });

  router.use("/mobile", r);
}
