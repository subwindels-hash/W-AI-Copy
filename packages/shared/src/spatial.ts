/**
 * Session 58 — Enterprise Spatial Computing Platform (V8).
 * AR/VR/MR/XR, digital twin visualization, holographic dashboards, smart glasses.
 */

export const SPATIAL_MODES = ["ar", "vr", "mr", "xr"] as const;
export type SpatialMode = typeof SPATIAL_MODES[number];

export const SPATIAL_STATUS = ["idle", "streaming", "recording", "error"] as const;
export type SpatialStatus = typeof SPATIAL_STATUS[number];

export interface SpatialSession {
  id: string;
  organizationId: string;
  title: string;
  mode: SpatialMode;
  host: string;
  participants: string[];
  status: SpatialStatus;
  deviceTarget: "vision_pro" | "hololens" | "quest" | "desktop" | "mobile" | "smart_glasses";
  twinId?: string;
  sceneUrl?: string;
  anchorCount: number;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface HolographicDashboard {
  id: string;
  name: string;
  layout: "spiral" | "command_wall" | "globular" | "battlefield";
  metricCount: number;
  createdAt: string;
  lastOpenedAt?: string;
}

export interface SpatialWaypoint {
  id: string;
  floor?: string;
  building: string;
  x: number; y: number; z: number;
  label: string;
  kind: "destination" | "poi" | "hazard" | "asset" | "waypoint";
}

export interface IndoorMap {
  id: string;
  building: string;
  floors: number;
  areaSqm: number;
  waypoints: number;
  updatedAt: string;
}

export interface RemoteExpertSession {
  id: string;
  expertUserId: string;
  fieldUserId: string;
  mode: SpatialMode;
  startedAt: string;
  endedAt?: string;
  annotationsCount: number;
  resolution?: string;
}

export interface SpatialDashboard {
  activeSessions: number;
  totalSessions: number;
  /** Fingerprints that heartbeated inside the online window. */
  devicesOnline: number;
  holoDashboards: number;
  indoorMaps: number;
  waypoints: number;
  remoteSessionsToday: number;
  twinsVisualized: number;
  byMode: Array<{ mode: SpatialMode; count: number }>;
  recent: SpatialSession[];
  waypointsRecent: SpatialWaypoint[];
  /** Fingerprints ever recorded. Optional — added Session 156. */
  devicesSeen?: number;
  provenance?: {
    devicesOnline: string;
    devicesSeen: string;
    twinsVisualized: string;
  };
}
