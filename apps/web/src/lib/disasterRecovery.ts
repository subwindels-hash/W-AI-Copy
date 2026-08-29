import { api } from "./api";
import type { DrDashboard, DrDrill, DrFailoverEvent, DrStatus } from "@windels/shared";
export type { DrDashboard, DrDrill, DrFailoverEvent, DrStatus, DrComponent } from "@windels/shared";

export const drApi = {
  dashboard: () => api<DrDashboard>("/disaster-recovery/dashboard/rollup"),
  status: () => api<DrStatus[]>("/disaster-recovery/status"),
  events: () => api<DrFailoverEvent[]>("/disaster-recovery/events"),
  drills: () => api<DrDrill[]>("/disaster-recovery/drills"),
  failover: (input: { component: DrStatus["component"]; toRegion: string; reason: string }) =>
    api<DrFailoverEvent>("/disaster-recovery/failover", { method: "POST", json: input }),
  scheduleDrill: (input: { component: DrStatus["component"]; scheduledAt: string }) =>
    api<DrDrill>("/disaster-recovery/drills", { method: "POST", json: input }),
  runDrill: (id: string) => api<DrDrill>(`/disaster-recovery/drills/${encodeURIComponent(id)}/run`, { method: "POST" }),
  setEmergency: (enabled: boolean) => api<{ enabled: boolean }>("/disaster-recovery/emergency", { method: "POST", json: { enabled } }),
};
