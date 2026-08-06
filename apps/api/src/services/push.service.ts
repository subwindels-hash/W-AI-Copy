import webpush from "web-push";
import crypto from "node:crypto";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { PushSubscription } from "@prisma/client";

webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  type?: string;
  data?: Record<string, unknown>;
};

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Register (or rotate) a Web Push subscription for a mobile/PWA device.
 */
export async function registerSubscription(
  userId: string,
  deviceId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  meta: { userAgent?: string } = {}
) {
  const endpoint = sub.endpoint;
  const record = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId,
      deviceId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      userAgent: meta.userAgent,
      failures: 0,
      updatedAt: new Date(),
    },
    create: {
      userId,
      deviceId,
      endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      userAgent: meta.userAgent,
    },
  });

  await prisma.mobileDevice.update({
    where: { id: deviceId },
    data: { pushTokenHash: sha256(endpoint) },
  }).catch(() => null);

  logger.info("push subscription registered", { userId, deviceId, endpoint: endpoint.slice(0, 48) });
  return { id: record.id };
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return { ok: true };
}

export async function removeAllSubscriptions(userId: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId } });
  return { ok: true };
}

export async function sendToUser(userId: string, payload: PushPayload) {
  // Create the notification record so it shows in-app regardless of push delivery
  const notif = await prisma.notification.create({
    data: {
      userId,
      type: payload.type ?? "system",
      title: payload.title,
      body: payload.body,
      icon: payload.icon,
      url: payload.url,
      data: (payload.data ?? {}) as any,
    },
  });

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = await Promise.allSettled(subs.map((s: any) => dispatch(s, { ...payload, data: { ...(payload.data ?? {}), notifId: notif.id } })));

  let delivered = 0;
  for (let i = 0; i < subs.length; i++) {
    const r = results[i];
    const s = subs[i];
    if (r.status === "fulfilled") {
      delivered++;
      await prisma.pushSubscription.update({
        where: { id: s.id },
        data: { lastDeliveredAt: new Date(), failures: 0 },
      }).catch(() => null);
    } else {
      logger.warn("push send failed", { err: r.reason, endpoint: s.endpoint.slice(0, 48) });
      const updated = await prisma.pushSubscription.update({
        where: { id: s.id },
        data: { failures: { increment: 1 } },
      }).catch(() => null);
      if (updated && updated.failures >= 8) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => null);
        // Session 117: a subscription used to vanish here with no record at
        // all, so push simply stopped and nobody could find out why.
        // Best-effort: a failed bookkeeping write must not fail the send.
        await recordSubscriptionRetired(userId, s.endpoint, updated.failures);
      }
    }
  }
  if (delivered > 0) {
    await prisma.notification.update({ where: { id: notif.id }, data: { pushDelivered: true } }).catch(() => null);
  }
  // Session 117: record the attempt so `GET /mobile/push/health` can report
  // deliveries instead of silence. Best-effort by design.
  await recordDelivery(userId, notif.id, delivered, subs.length);
  return { notifId: notif.id, delivered, total: subs.length };
}

/**
 * Push delivery bookkeeping (Session 117).
 *
 * Imported lazily so this module keeps no load-time dependency on the mobile
 * assurance service, and wrapped so that a bookkeeping failure can never turn a
 * delivered notification into an error.
 */
async function recordDelivery(userId: string, notifId: string, accepted: number, attempted: number) {
  try {
    const { MobileSyncService } = await import("../mobile/mobileSync.service.js");
    await MobileSyncService.recordPushDelivery(userId, {
      notificationId: notifId,
      accepted,
      attempted,
    });
  } catch {
    /* bookkeeping only */
  }
}

async function recordSubscriptionRetired(userId: string, endpoint: string, failures: number) {
  try {
    const { MobileSyncService } = await import("../mobile/mobileSync.service.js");
    const { mobilePushEndpointHost } = await import("@windels/shared/mobile");
    await MobileSyncService.recordPushSubscriptionRetired(userId, {
      endpointHost: mobilePushEndpointHost(endpoint),
      failures,
    });
  } catch {
    /* bookkeeping only */
  }
}

async function dispatch(
  sub: PushSubscription,
  payload: PushPayload & { data: Record<string, unknown> }
) {
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 60, urgency: "high" }
  );
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number; before?: string } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}), ...(opts.before ? { id: { lt: opts.before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markRead(userId: string, id: string) {
  return prisma.notification.updateMany({ where: { userId, id }, data: { readAt: new Date() } });
}
export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export { webpush };
