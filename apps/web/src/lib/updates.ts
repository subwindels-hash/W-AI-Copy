/** Session 54 — Update & Lifecycle Management client */
import { api } from "./api";
import type { UpdatePackage, UpdateDashboard, UpdateChannel, UpdateValidation } from "@windels/shared";
export type { UpdatePackage, UpdateDashboard, UpdateChannel, UpdateValidation } from "@windels/shared";

export const updatesApi = {
  dashboard: () => api<UpdateDashboard>("/updates/dashboard/rollup"),
  list: () => api<UpdatePackage[]>("/updates/packages"),
  check: () => api<UpdatePackage[]>("/updates/check", { method: "POST" }),
  get: (id: string) => api<UpdatePackage>(`/updates/packages/${id}`),
  validate: (id: string) => api<UpdateValidation>(`/updates/packages/${id}/validate`, { method: "POST" }),
  approve: (id: string) => api<UpdatePackage>(`/updates/packages/${id}/approve`, { method: "POST" }),
  deploy: (id: string) => api<UpdatePackage>(`/updates/packages/${id}/deploy`, { method: "POST" }),
  rollback: (id: string) => api<UpdatePackage>(`/updates/packages/${id}/rollback`, { method: "POST" }),
  setChannel: (channel: UpdateChannel) => api<{ channel: UpdateChannel }>("/updates/channel", { method: "POST", json: { channel } }),
};
