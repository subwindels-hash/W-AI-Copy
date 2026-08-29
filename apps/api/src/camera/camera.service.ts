/**
 * Session 87 / 108 — Live Camera Feed registry and operator alerts.
 *
 * Feed metadata and alerts are org-scoped Redis records. The module does not
 * pretend to decode RTSP or run YOLO in-process: the stream endpoint returns a
 * short-lived handoff token plus an explicit external-gateway availability
 * flag.
 *
 * Keys: cam:feed:i:<org>:<id>, cam:feed:idx:<org>,
 * cam:alert:i:<org>:<cameraId>:<id>, cam:alert:idx:<org>:<cameraId>
 */
import { randomBytes, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import type { CamAlert, CamAlertCreateInput, CamFeed, CamFeedCreateInput, CamFeedUpdateInput, CamStatus } from "@windels/shared/camera";

// Backwards-compatible names retained for existing PlatformPage/client imports.
export type CameraFeedInput = CamFeedCreateInput;
export type CameraFeedRecord = CamFeed;
export type CameraAlertRecord = CamAlert;
type FeedRecord = CamFeed & { organizationId: string };

const K = {
  feed: (org: string, id: string) => `cam:feed:i:${org}:${id}`,
  feeds: (org: string) => `cam:feed:idx:${org}`,
  alert: (org: string, cameraId: string, id: string) => `cam:alert:i:${org}:${cameraId}:${id}`,
  alerts: (org: string, cameraId: string) => `cam:alert:idx:${org}:${cameraId}`,
  legacyFeed: (org: string, id: string) => `cam:feed:${org}:${id}`,
  legacyFeeds: (org: string) => `cam:feeds:${org}`,
  legacyAlert: (cameraId: string, id: string) => `cam:alert:${cameraId}:${id}`,
  legacyAlerts: (cameraId: string) => `cam:alerts:${cameraId}`,
};

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};
const feedId = () => `cam_${randomUUID()}`;
const alertId = () => `alrt_${randomUUID()}`;

async function writeFeed(feed: FeedRecord): Promise<void> {
  await redis.hset(K.feed(feed.organizationId, feed.id), "_doc", JSON.stringify(feed));
  await redis.zadd(K.feeds(feed.organizationId), Date.parse(feed.createdAt) || Date.now(), feed.id);
}
async function writeAlert(org: string, alert: CamAlert): Promise<void> {
  await redis.hset(K.alert(org, alert.cameraId, alert.id), "_doc", JSON.stringify({ ...alert, organizationId: org }));
  await redis.zadd(K.alerts(org, alert.cameraId), Date.parse(alert.createdAt) || Date.now(), alert.id);
}
async function readFeed(org: string, id: string): Promise<CamFeed | null> {
  const current = parse<FeedRecord>(await redis.hget(K.feed(org, id), "_doc"));
  if (current && current.organizationId !== org) return null;
  if (current) { const { organizationId: _organizationId, ...publicFeed } = current; return publicFeed; }
  // Upgrade a legacy key after resolving the requested organization slot.
  const legacy = parse<FeedRecord>(await redis.hget(K.legacyFeed(org, id), "_doc"));
  if (legacy && legacy.organizationId === org) { await writeFeed(legacy); const { organizationId: _organizationId, ...publicFeed } = legacy; return publicFeed; }
  return null;
}
async function migrateLegacyFeeds(org: string): Promise<void> {
  if ((await redis.zrange(K.feeds(org), 0, -1)).length > 0) return;
  for (const id of await redis.smembers(K.legacyFeeds(org))) {
    const legacy = parse<FeedRecord>(await redis.hget(K.legacyFeed(org, id), "_doc"));
    if (legacy && legacy.organizationId === org) await writeFeed(legacy);
  }
}

export const CameraService = {
  async createFeed(organizationId: string, input: CameraFeedInput): Promise<CameraFeedRecord> {
    const now = new Date().toISOString();
    const feed: FeedRecord = { id: feedId(), organizationId, status: "offline", createdAt: now, updatedAt: now, locationName: input.locationName ?? null, resolution: input.resolution ?? null, name: input.name, streamUrl: input.streamUrl };
    await writeFeed(feed);
    logger.info("Camera feed registered", { cameraId: feed.id, organizationId });
    const { organizationId: _organizationId, ...publicFeed } = feed;
    return publicFeed;
  },

  async listFeeds(organizationId: string): Promise<CameraFeedRecord[]> {
    await migrateLegacyFeeds(organizationId);
    const out: CamFeed[] = [];
    for (const id of await redis.zrange(K.feeds(organizationId), 0, -1)) {
      const feed = await readFeed(organizationId, id);
      if (feed) out.push(feed);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  },

  async getFeed(organizationId: string, id: string): Promise<CameraFeedRecord | null> {
    return readFeed(organizationId, id);
  },

  async updateFeed(organizationId: string, id: string, patch: CamFeedUpdateInput): Promise<CameraFeedRecord | null> {
    const current = await readFeed(organizationId, id);
    if (!current) return null;
    const next: FeedRecord = { ...current, ...patch, organizationId, locationName: patch.locationName === undefined ? current.locationName : patch.locationName, resolution: patch.resolution === undefined ? current.resolution : patch.resolution, updatedAt: new Date().toISOString() };
    await writeFeed(next);
    const { organizationId: _organizationId, ...publicFeed } = next;
    return publicFeed;
  },

  async deleteFeed(organizationId: string, id: string): Promise<boolean> {
    const feed = await readFeed(organizationId, id);
    if (!feed) return false;
    for (const alert of await this.listAlerts(organizationId, id)) {
      await redis.del(K.alert(organizationId, id, alert.id));
    }
    await redis.del(K.feed(organizationId, id));
    await redis.zrem(K.feeds(organizationId), id);
    await redis.srem(K.legacyFeeds(organizationId), id);
    return true;
  },

  async triggerAlert(organizationId: string, cameraId: string, input: CamAlertCreateInput): Promise<CameraAlertRecord> {
    const feed = await readFeed(organizationId, cameraId);
    if (!feed) throw AppError.notFound("Feed not found");
    const alert: CamAlert = { id: alertId(), cameraId, severity: input.severity, triggerClass: input.triggerClass, snapshotUrl: null, resolvedAt: null, metadata: input.metadata ?? {}, createdAt: new Date().toISOString() };
    await writeAlert(organizationId, alert);
    try {
      const { KernelService } = await import("../kernel/kernel.service.js");
      await KernelService.dispatch({ source: "camera", kind: "camera.alert_triggered", payload: { organizationId, cameraId, alertId: alert.id, severity: alert.severity, triggerClass: alert.triggerClass, metadata: alert.metadata } });
    } catch { /* best effort */ }
    logger.warn("Camera alert triggered", { cameraId, alertId: alert.id, organizationId, triggerClass: alert.triggerClass, severity: alert.severity });
    return alert;
  },

  async listAlerts(organizationId: string, cameraId: string): Promise<CameraAlertRecord[]> {
    const feed = await readFeed(organizationId, cameraId);
    if (!feed) throw AppError.notFound("Feed not found");
    const out: CamAlert[] = [];
    for (const id of await redis.zrange(K.alerts(organizationId, cameraId), 0, -1)) {
      const alert = parse<CamAlert & { organizationId?: string }>(await redis.hget(K.alert(organizationId, cameraId, id), "_doc"));
      if (alert && (!alert.organizationId || alert.organizationId === organizationId)) { const { organizationId: _ignored, ...publicAlert } = alert; out.push(publicAlert); }
    }
    // Read legacy alerts only when no new alerts exist; they are tied to a feed
    // whose organization was already verified above.
    if (!out.length) {
      for (const id of await redis.smembers(K.legacyAlerts(cameraId))) {
        const legacy = parse<CamAlert>(await redis.hget(K.legacyAlert(cameraId, id), "_doc"));
        if (legacy) out.push(legacy);
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  },

  async streamSession(organizationId: string, id: string) {
    const feed = await readFeed(organizationId, id);
    if (!feed) throw AppError.notFound("Feed not found");
    const expiresInSeconds = 60;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const turnConfigured = Boolean(process.env.WEBRTC_TURN_URL && process.env.WEBRTC_TURN_USERNAME && process.env.WEBRTC_TURN_CREDENTIAL);
    return {
      webrtcSessionToken: `session_${randomBytes(24).toString("base64url")}`,
      iceServers: iceServers(), turnConfigured, streamAvailable: feed.status === "online",
      expiresAt, expiresInSeconds,
      note: feed.status === "online" ? "Token handoff requires the configured external WebRTC media gateway." : "Feed is not online; no live media is available until an external gateway reports it online.",
    };
  },
};

function iceServers() {
  const servers: Array<{ urls: string; username?: string; credential?: string }> = [{ urls: process.env.WEBRTC_STUN_URL || "stun:stun.l.google.com:19302" }];
  if (process.env.WEBRTC_TURN_URL && process.env.WEBRTC_TURN_USERNAME && process.env.WEBRTC_TURN_CREDENTIAL) servers.push({ urls: process.env.WEBRTC_TURN_URL, username: process.env.WEBRTC_TURN_USERNAME, credential: process.env.WEBRTC_TURN_CREDENTIAL });
  return servers;
}

export default CameraService;
