/** Session 87 — Live Camera Intelligence Client */
import { api } from "./api";

export interface CameraFeedRecord {
  id: string;
  name: string;
  streamUrl: string;
  locationName?: string;
  resolution?: string;
  status: "online" | "offline" | "degraded" | "maintenance";
}

export interface CameraAlertRecord {
  id: string;
  cameraId: string;
  severity: "info" | "warning" | "critical";
  triggerClass: string;
  snapshotUrl?: string;
  createdAt: string;
}

export const cameraApi = {
  listFeeds: () => api<CameraFeedRecord[]>("/camera/feeds"),
  createFeed: (input: Omit<CameraFeedRecord, "id" | "status">) => api<CameraFeedRecord>("/camera/feeds", { method: "POST", json: input }),
  getStream: (id: string) => api<{ webrtcSessionToken: string; iceServers: any[] }>(`/camera/feeds/${id}/stream`),
  listAlerts: (id: string) => api<CameraAlertRecord[]>(`/camera/feeds/${id}/alerts`),
};
