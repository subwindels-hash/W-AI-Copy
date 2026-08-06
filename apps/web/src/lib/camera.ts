/** Session 108 — typed Camera Feed and alert client. */
import { api } from "./api";
import type { CamAlert, CamAlertCreateInput, CamFeed, CamFeedCreateInput, CamFeedUpdateInput, CamStatus, CamStreamSession } from "@windels/shared/camera";

export type { CamAlert, CamAlertCreateInput, CamFeed, CamFeedCreateInput, CamFeedUpdateInput, CamStatus, CamStreamSession } from "@windels/shared/camera";
// Compatibility aliases retained for PlatformPage.
export type CameraFeedRecord = CamFeed;
export type CameraAlertRecord = CamAlert;

export const cameraApi = {
  listFeeds: () => api<CamFeed[]>("/camera/feeds"),
  createFeed: (input: CamFeedCreateInput) => api<CamFeed>("/camera/feeds", { method: "POST", json: input }),
  updateFeed: (id: string, patch: CamFeedUpdateInput) => api<CamFeed>(`/camera/feeds/${id}`, { method: "PATCH", json: patch }),
  deleteFeed: (id: string) => api<{ deleted: boolean; id: string }>(`/camera/feeds/${id}`, { method: "DELETE" }),
  getStream: (id: string) => api<CamStreamSession>(`/camera/feeds/${id}/stream`),
  listAlerts: (id: string) => api<CamAlert[]>(`/camera/feeds/${id}/alerts`),
  triggerAlert: (id: string, input: CamAlertCreateInput) => api<CamAlert>(`/camera/feeds/${id}/alerts`, { method: "POST", json: input }),
};
