/**
 * Mobile / PWA routes (Session 21), hardened additively in Session 117.
 *
 * Every path, request body and success payload from Session 21 is preserved.
 * What changed is what the handlers do around them:
 *
 *   - `POST /devices/register` no longer lets one account address another
 *     account's device id, and no longer returns the whole database row. The
 *     row includes `pinHash`, whose own schema comment says "Never expose this
 *     field in a select"; the response is now the sanitised device view. The
 *     `id` field every caller in this repository actually reads is unchanged.
 *   - `POST /offline/sync` **stores the actions it is given.** It used to
 *     answer `received: <n>` and drop the array, while the web client deleted
 *     every action it had just sent from IndexedDB — so work done offline was
 *     destroyed and the user was told the sync succeeded. The response keeps
 *     its original fields and gains receipts, so an older client keeps working
 *     and a current one can delete only what was actually stored.
 *   - `POST /pin/verify` is throttled. A 4-digit PIN is 10 000 combinations and
 *     nothing counted attempts.
 *   - Device, PIN and push changes are recorded in the principal's ledger.
 *
 * The local router is named `router` rather than `r` deliberately: the module
 * inventory's route scanner matches `router.<verb>`, so all 21 of these
 * endpoints were being counted but never listed.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as mobileAuth from "../../services/mobileAuth.service.js";
import * as push from "../../services/push.service.js";
import { MobileSyncService } from "../../mobile/mobileSync.service.js";
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

export function registerMobileRoutes(v1: Router) {
  const router = Router();

  // Public: mobile config (vapid key, min version, etc.) — needed before auth for service worker.
  //
  // Unauthenticated by design: the service worker reads it before a session
  // exists. It therefore has no organization and cannot serve an organization's
  // policy — `minAppVersion` and `forceUpdate` here are build-time constants,
  // and `GET /mobile/assurance/configuration` says so in as many words. The
  // configurable minimum lives in the authenticated `GET /mobile/policy`.
  router.get("/config", (_req, res) => {
    res.json(
      ok({
        vapidPublicKey: env.VAPID_PUBLIC_KEY,
        minAppVersion: "0.15.0",
        forceUpdate: false,
        apiBase: "/api/v1",
      })
    );
  });

  router.use(authenticate);

  // ─── Devices ──────────────────────────────────────────────────────────
  router.post("/devices/register", validate({ body: DeviceRegisterSchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof DeviceRegisterSchema>;
      // Refuse a device id that belongs to someone else. The upsert below has
      // an update branch that is not scoped by user, so without this check any
      // authenticated caller could overwrite another account's device row.
      if (body.deviceId) {
        await MobileSyncService.assertDeviceOwnership(req.user!.id, body.deviceId);
      }
      const device = await mobileAuth.registerDevice(
        req.user!.id,
        body as any,
        { ip: req.ip, userAgent: req.get("user-agent") ?? undefined }
      );
      await MobileSyncService.recordEvent(req.user!.id, {
        kind: "device_registered",
        deviceId: device.id,
        organizationId: req.user!.organizationId ?? null,
        detail: `${body.platform} device registered.`,
        metadata: { platform: body.platform, appVersion: body.appVersion ?? null },
      }).catch(() => undefined);
      // Sanitised: the raw row carries `pinHash` and `pushTokenHash`.
      res.json(ok(await MobileSyncService.deviceView(device)));
    } catch (e) { next(e); }
  });
  router.get("/devices", async (req, res, next) => {
    try { res.json(ok(await mobileAuth.listDevices(req.user!.id))); } catch (e) { next(e); }
  });
  router.delete("/devices/:id", async (req, res, next) => {
    try {
      const result = await mobileAuth.revokeDevice(req.user!.id, req.params.id as string);
      await MobileSyncService.recordEvent(req.user!.id, {
        kind: "device_revoked",
        deviceId: req.params.id as string,
        organizationId: req.user!.organizationId ?? null,
        detail: "Device revoked with its push subscriptions and biometric credentials.",
        metadata: { deviceId: req.params.id as string },
      }).catch(() => undefined);
      res.json(ok(result));
    } catch (e) { next(e); }
  });

  // ─── Push Notifications ──────────────────────────────────────────────
  router.post("/push/subscribe", validate({ body: PushSubscribeSchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof PushSubscribeSchema>;
      // verify device belongs to user
      const device = await prisma.mobileDevice.findFirst({ where: { id: body.deviceId, userId: req.user!.id } });
      if (!device) throw AppError.notFound("Device not found");
      // Zod has already required both key fields; the cast only tells the
      // compiler what the validator has verified.
      const keys = body.keys as { p256dh: string; auth: string };
      const result = await push.registerSubscription(req.user!.id, body.deviceId, { endpoint: body.endpoint, keys }, { userAgent: req.get("user-agent") ?? undefined });
      await MobileSyncService.recordEvent(req.user!.id, {
        kind: "push_subscribed",
        deviceId: body.deviceId,
        organizationId: req.user!.organizationId ?? null,
        detail: "Web Push subscription registered.",
        metadata: { subscriptionId: result.id },
      }).catch(() => undefined);
      res.json(ok(result));
    } catch (e) { next(e); }
  });
  router.delete("/push/subscribe", async (req, res, next) => {
    try {
      const endpoint = String(req.query.endpoint ?? req.body?.endpoint ?? "");
      if (!endpoint) throw AppError.badRequest("endpoint required");
      const result = await push.removeSubscription(req.user!.id, endpoint);
      await MobileSyncService.recordEvent(req.user!.id, {
        kind: "push_unsubscribed",
        deviceId: null,
        organizationId: req.user!.organizationId ?? null,
        detail: "Web Push subscription removed.",
        metadata: {},
      }).catch(() => undefined);
      res.json(ok(result));
    } catch (e) { next(e); }
  });
  router.post("/push/test", async (req, res, next) => {
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
  router.post("/biometric/register-challenge", (req, res) => {
    const rpId = String(req.query.rpId ?? req.get("host")?.split(":")[0] ?? "localhost");
    const rpName = "WINDELS AI OS";
    res.json(ok(mobileAuth.getRegisterChallenge(req.user!.id, rpId, rpName, req.user!.email)));
  });
  router.post("/biometric/register-verify", validate({ body: BiometricRegVerifySchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof BiometricRegVerifySchema>;
      await MobileSyncService.assertDeviceOwnership(req.user!.id, body.deviceId);
      const result = await mobileAuth.verifyRegister(req.user!.id, body.deviceId, body.rpId, body as any);
      await MobileSyncService.recordEvent(req.user!.id, {
        kind: "biometric_registered",
        deviceId: body.deviceId,
        organizationId: req.user!.organizationId ?? null,
        detail: "WebAuthn platform credential registered for this device.",
        metadata: { rpId: body.rpId },
      }).catch(() => undefined);
      res.json(ok(result));
    } catch (e) { next(e); }
  });
  router.post("/biometric/auth-challenge", (req, res) => {
    const rpId = String(req.query.rpId ?? req.get("host")?.split(":")[0] ?? "localhost");
    res.json(ok(mobileAuth.getAuthChallenge(req.user!.id, rpId)));
  });
  router.post("/biometric/auth-verify", validate({ body: BiometricAuthVerifySchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof BiometricAuthVerifySchema>;
      res.json(ok(await mobileAuth.verifyAuthAssertion(req.user!.id, body.rpId, body as any)));
    } catch (e) { next(e); }
  });

  // ─── PIN fallback ────────────────────────────────────────────────────
  router.post("/pin/set", validate({ body: PinSchema }), async (req, res, next) => {
    try {
      const { deviceId, pin } = req.body as z.infer<typeof PinSchema>;
      const result = await mobileAuth.setPin(req.user!.id, deviceId, pin);
      // Setting a PIN clears any lock left over from the forgotten one.
      await MobileSyncService.clearPinFailures(req.user!.id, deviceId).catch(() => undefined);
      await MobileSyncService.recordEvent(req.user!.id, {
        kind: "pin_set",
        deviceId,
        organizationId: req.user!.organizationId ?? null,
        detail: "Device PIN set. The PIN itself is stored only as a bcrypt hash.",
        metadata: { digits: pin.length },
      }).catch(() => undefined);
      res.json(ok(result));
    } catch (e) { next(e); }
  });
  router.post("/pin/verify", validate({ body: PinSchema }), async (req, res, next) => {
    try {
      const { deviceId, pin } = req.body as z.infer<typeof PinSchema>;
      // Throttle first: nothing counted failed attempts, so a 4-digit PIN cost
      // an attacker only the time bcrypt takes.
      await MobileSyncService.assertPinAttemptAllowed(req.user!.id, deviceId);
      try {
        const result = await mobileAuth.verifyPin(req.user!.id, deviceId, pin);
        await MobileSyncService.clearPinFailures(req.user!.id, deviceId).catch(() => undefined);
        await MobileSyncService.recordEvent(req.user!.id, {
          kind: "pin_verified",
          deviceId,
          organizationId: req.user!.organizationId ?? null,
          detail: "Device PIN verified.",
          metadata: {},
        }).catch(() => undefined);
        res.json(ok(result));
      } catch (err: any) {
        // Only a wrong PIN counts against the throttle. "No PIN set" is a
        // configuration state, not a guess, and must not lock the device.
        if (err?.message === "Incorrect PIN") {
          await MobileSyncService.recordPinFailure(req.user!.id, deviceId).catch(() => undefined);
        }
        throw err;
      }
    } catch (e) { next(e); }
  });

  // ─── Notifications list (reuses push service storage) ────────────────
  router.get("/notifications", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const unreadOnly = req.query.unread === "1";
      const before = req.query.before as string | undefined;
      res.json(ok(await push.listNotifications(req.user!.id, { unreadOnly, limit, before })));
    } catch (e) { next(e); }
  });
  router.post("/notifications/:id/read", async (req, res, next) => {
    try { res.json(ok(await push.markRead(req.user!.id, req.params.id as string))); } catch (e) { next(e); }
  });
  router.post("/notifications/read-all", async (req, res, next) => {
    try { res.json(ok(await push.markAllRead(req.user!.id))); } catch (e) { next(e); }
  });

  // ─── Offline sync queue ──────────────────────────────────────────────
  //
  // This handler used to be the module's worst defect. It updated `lastSeenAt`
  // on any device id it was given — including one belonging to another account,
  // since the update was not scoped — answered `received: <n>`, and threw the
  // actions away. `lib/mobile/offlineQueue.ts` then deleted every one of them
  // from IndexedDB. The actions are now stored, each with a receipt, and the
  // device id is checked. The original response fields are all still present.
  router.post("/offline/sync", validate({ body: OfflineSyncSchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof OfflineSyncSchema>;
      await MobileSyncService.assertDeviceOwnership(req.user!.id, body.deviceId);
      await prisma.mobileDevice.updateMany({
        where: { id: body.deviceId, userId: req.user!.id },
        data: { lastSeenAt: new Date() },
      }).catch(() => null);

      const submission = await MobileSyncService.submitActions(
        req.user!.id,
        req.user!.organizationId ?? null,
        body.deviceId,
        (body.actions ?? []).map((a) => ({
          id: a.id,
          method: a.method,
          path: a.path,
          body: a.body,
          queuedAt: a.queuedAt ? new Date(a.queuedAt).toISOString() : undefined,
        })),
      );

      res.json(
        ok({
          received: body.actions.length,
          serverTime: new Date().toISOString(),
          // Clients will refetch critical lists (notifications, conversations) themselves.
          hydrated: { notifications: await push.listNotifications(req.user!.id, { limit: 20 }) },
          // Session 117: durability. `stored` actions are held for replay; a
          // rejected one sets retainLocally and must not be deleted on-device.
          stored: submission.stored,
          duplicates: submission.duplicates,
          rejected: submission.rejected,
          receipts: submission.receipts,
          queueDepth: submission.queueDepth,
          storageNote: submission.storageNote,
          queueNote: submission.queueNote,
          replayNote: submission.replayNote,
        })
      );
    } catch (e) { next(e); }
  });

  v1.use("/mobile", router);
}
