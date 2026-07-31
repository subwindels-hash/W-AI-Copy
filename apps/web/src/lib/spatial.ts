/** Session 58 — Spatial Computing client */
import { api } from "./api";
import type { SpatialSession, SpatialDashboard, SpatialMode } from "@windels/shared";
export type { SpatialSession, SpatialDashboard, SpatialMode } from "@windels/shared";

export const spatialApi = {
  dashboard: () => api<SpatialDashboard>("/spatial/dashboard/rollup"),
  listSessions: () => api<SpatialSession[]>("/spatial/sessions"),
  createSession: (input: { title: string; mode: SpatialMode; deviceTarget: SpatialSession["deviceTarget"]; twinId?: string }) =>
    api<SpatialSession>("/spatial/sessions", { method: "POST", json: input }),
  endSession: (id: string) => api<SpatialSession>(`/spatial/sessions/${id}/end`, { method: "POST" }),
};
