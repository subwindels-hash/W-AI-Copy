/** Session 109 — typed Canvas Collaboration client. */
import { api } from "./api";
import type { CcCursor, CcPresence } from "@windels/shared/canvasCollab";
export type { CcCursor, CcPresence } from "@windels/shared/canvasCollab";

export const canvasCollabApi = {
  heartbeat: (canvasId: string, displayName: string, avatarColor?: string) => api<CcPresence>(`/canvas/${canvasId}/presence`, { method: "POST", json: { displayName, avatarColor } }),
  presence: (canvasId: string) => api<CcPresence[]>(`/canvas/${canvasId}/presence`),
  moveCursor: (canvasId: string, displayName: string, x: number, y: number) => api<CcCursor>(`/canvas/${canvasId}/cursor`, { method: "PUT", json: { displayName, x, y } }),
  cursors: (canvasId: string) => api<CcCursor[]>(`/canvas/${canvasId}/cursors`),
  leave: (canvasId: string) => api<{}>(`/canvas/${canvasId}/presence`, { method: "DELETE" }),
};
