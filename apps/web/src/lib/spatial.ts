/** Session 58 — Spatial Computing client */
import { api } from "./api";
import type {
  SpatialSession, SpatialDashboard, SpatialMode,
  IndoorMap, SpatialWaypoint, HolographicDashboard, RemoteExpertSession,
} from "@windels/shared";
export type { SpatialSession, SpatialDashboard, SpatialMode } from "@windels/shared";

export const spatialApi = {
  dashboard: () => api<SpatialDashboard>("/spatial/dashboard/rollup"),
  listSessions: () => api<SpatialSession[]>("/spatial/sessions"),
  createSession: (input: { title: string; mode: SpatialMode; deviceTarget: SpatialSession["deviceTarget"]; twinId?: string }) =>
    api<SpatialSession>("/spatial/sessions", { method: "POST", json: input }),
  endSession: (id: string) => api<SpatialSession>(`/spatial/sessions/${id}/end`, { method: "POST" }),

  // Sub-features listing queries
  listMaps: () => api<IndoorMap[]>("/spatial/maps"),
  listWaypoints: () => api<SpatialWaypoint[]>("/spatial/waypoints"),
  listHoloDashboards: () => api<HolographicDashboard[]>("/spatial/holo-dashboards"),
  listRemoteExpertSessions: () => api<RemoteExpertSession[]>("/spatial/remote-expert-sessions"),
  heartbeat: (input: { fingerprint: string; deviceTarget?: SpatialSession["deviceTarget"] }) =>
    api<{ fingerprint: string; lastSeenAt: string; organizationId: string; deviceTarget?: SpatialSession["deviceTarget"] }>(
      "/spatial/devices/heartbeat", { method: "POST", json: input },
    ),
};
