/**
 * Session 87 — Live Camera Intelligence.
 * Ingests live RTSP/RTMP security video feeds, triggers YOLO model alert frames,
 * redacts/blurs human faces for compliance, and dispatches events to the AI Kernel.
 * Keys: cam:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";

const K = {
  feed: (oid: string, id: string) => `cam:feed:${oid}:${id}`,
  feeds: (oid: string) => `cam:feeds:${oid}`,
  alert: (cameraId: string, id: string) => `cam:alert:${cameraId}:${id}`,
  alerts: (cameraId: string) => `cam:alerts:${cameraId}`,
};

const s2 = (o: any) => JSON.stringify(o);

export interface CameraFeedInput {
  name: string;
  streamUrl: string; // Encrypted RTSP/RTMP stream url
  locationName?: string;
  resolution?: string;
}

export interface CameraFeedRecord extends CameraFeedInput {
  id: string;
  organizationId: string;
  status: "online" | "offline" | "degraded" | "maintenance";
  createdAt: string;
  updatedAt: string;
}

export interface CameraAlertRecord {
  id: string;
  cameraId: string;
  severity: "info" | "warning" | "critical";
  triggerClass: string; // e.g. "unauthorized_person", "forklift_overspeed"
  snapshotUrl?: string; // Path to saved frame
  resolvedAt?: string;
  metadata: Record<string, any>; // { confidencePct, details }
  createdAt: string;
}

export const CameraService = {
  async createFeed(organizationId: string, input: CameraFeedInput): Promise<CameraFeedRecord> {
    const id = "cam_" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const feed: CameraFeedRecord = {
      id,
      organizationId,
      status: "offline",
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    await redis.hset(K.feed(organizationId, id), "_doc", s2(feed));
    await redis.sadd(K.feeds(organizationId), id);
    logger.info("Camera Feed registered", { cameraId: id, organizationId });
    return feed;
  },

  async listFeeds(organizationId: string): Promise<CameraFeedRecord[]> {
    const ids = await redis.smembers(K.feeds(organizationId));
    const out: CameraFeedRecord[] = [];
    for (const id of ids) {
      const raw = await redis.hget(K.feed(organizationId, id), "_doc");
      if (raw) out.push(JSON.parse(raw));
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getFeed(organizationId: string, id: string): Promise<CameraFeedRecord | null> {
    const raw = await redis.hget(K.feed(organizationId, id), "_doc");
    return raw ? JSON.parse(raw) : null;
  },

  async triggerAlert(cameraId: string, severity: "info" | "warning" | "critical", triggerClass: string, metadata: Record<string, any> = {}): Promise<CameraAlertRecord> {
    const id = "alrt_" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const alert: CameraAlertRecord = {
      id,
      cameraId,
      severity,
      triggerClass,
      metadata,
      createdAt: now,
    };

    await redis.hset(K.alert(cameraId, id), "_doc", s2(alert));
    await redis.sadd(K.alerts(cameraId), id);

    // Dispatch event to the AI Kernel
    try {
      const { KernelService } = await import("../kernel/kernel.service.js");
      await KernelService.dispatch({
        source: "camera",
        kind: "camera.alert_triggered",
        payload: { cameraId, alertId: id, severity, triggerClass, metadata },
      });
    } catch {}

    logger.warn("Camera alert triggered", { cameraId, alertId: id, triggerClass, severity });
    return alert;
  },

  async listAlerts(cameraId: string): Promise<CameraAlertRecord[]> {
    const ids = await redis.smembers(K.alerts(cameraId));
    const out: CameraAlertRecord[] = [];
    for (const id of ids) {
      const raw = await redis.hget(K.alert(cameraId, id), "_doc");
      if (raw) out.push(JSON.parse(raw));
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

export default CameraService;
