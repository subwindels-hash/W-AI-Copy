/** Session 56 — Intelligence Fabric client */
import { api } from "./api";
import type { FabricDashboard, Sandbox, FabricTwin, InstalledPackage, TrustCenterReport, GlobalAlert, BusEvent } from "@windels/shared";
export type { FabricDashboard, Sandbox, FabricTwin, InstalledPackage, TrustCenterReport, GlobalAlert, BusEvent } from "@windels/shared";

export const fabricApi = {
  dashboard: () => api<FabricDashboard>("/fabric/dashboard/rollup"),
  trust: () => api<TrustCenterReport>("/fabric/trust"),
  listSandboxes: () => api<Sandbox[]>("/fabric/sandboxes"),
  createSandbox: (input: { name: string; experiment: string; gpu?: number }) => api<Sandbox>("/fabric/sandboxes", { method: "POST", json: input }),
  listTwins: () => api<FabricTwin[]>("/fabric/twins"),
  simulateTwin: (id: string) => api<FabricTwin>(`/fabric/twins/${id}/simulate`, { method: "POST" }),
  listPackages: () => api<InstalledPackage[]>("/fabric/packages"),
  acknowledgeAlert: (id: string) => api<GlobalAlert>(`/fabric/alerts/${id}/acknowledge`, { method: "POST" }),
  busRecent: (limit = 30) => api<BusEvent[]>(`/fabric/bus/recent?limit=${limit}`),
};
