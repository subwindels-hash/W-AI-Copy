// Session 87 / 108 — Live Camera Feed contracts.
//
// These contracts describe feed configuration and operator/model alerts. A
// WebRTC session response explicitly reports whether an external media gateway
// is available; a token alone is not presented as a working live stream.

import { z } from "zod";

export const CAM_STATUSES = ["online", "offline", "degraded", "maintenance"] as const;
export type CamStatus = (typeof CAM_STATUSES)[number];
export const CAM_ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type CamAlertSeverity = (typeof CAM_ALERT_SEVERITIES)[number];

export interface CamFeed {
  id: string;
  name: string;
  streamUrl: string;
  locationName: string | null;
  resolution: string | null;
  status: CamStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CamAlert {
  id: string;
  cameraId: string;
  severity: CamAlertSeverity;
  triggerClass: string;
  snapshotUrl: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CamStreamSession {
  webrtcSessionToken: string;
  iceServers: Array<{ urls: string; username?: string; credential?: string }>;
  turnConfigured: boolean;
  streamAvailable: boolean;
  expiresAt: string;
  expiresInSeconds: number;
  note: string;
}

export const CamFeedCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  streamUrl: z.string().url().refine((value) => /^(rtsp|rtmp|https?):\/\//i.test(value), "stream URL must use RTSP, RTMP or HTTP(S)"),
  locationName: z.string().trim().max(200).optional(),
  resolution: z.string().trim().max(50).optional(),
});
export type CamFeedCreateInput = z.infer<typeof CamFeedCreateSchema>;

export const CamFeedUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  streamUrl: z.string().url().optional(),
  locationName: z.string().trim().max(200).nullable().optional(),
  resolution: z.string().trim().max(50).nullable().optional(),
  status: z.enum(CAM_STATUSES).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one feed field is required");
export type CamFeedUpdateInput = z.infer<typeof CamFeedUpdateSchema>;

export const CamAlertCreateSchema = z.object({
  severity: z.enum(CAM_ALERT_SEVERITIES),
  triggerClass: z.string().trim().min(1).max(120),
  metadata: z.record(z.unknown()).default({}),
});
export type CamAlertCreateInput = z.input<typeof CamAlertCreateSchema>;
export const CamFeedIdSchema = z.object({ id: z.string().min(1).max(96) });
