/** Session 101 — typed Admin Console client. */
import { api } from "./api";
import type { AdmRole, AdmStats, AdmUserList, AdmUserMutationResult, AdmUserRow, AdmUserStatus } from "@windels/shared/admin";

export type { AdmRole, AdmStats, AdmUserList, AdmUserMutationResult, AdmUserRow, AdmUserStatus } from "@windels/shared/admin";

export const adminApi = {
  stats: () => api<AdmStats>("/admin/stats"),
  listUsers: (params?: { q?: string; role?: AdmRole; status?: AdmUserStatus; page?: number; perPage?: number }) =>
    api<AdmUserList>("/admin/users", { params }),
  getUser: (id: string) => api<AdmUserRow>(`/admin/users/${id}`),
  setSuspended: (id: string, suspended: boolean) =>
    api<AdmUserMutationResult>(`/admin/users/${id}/suspension`, { method: "POST", json: { suspended } }),
  setRole: (id: string, role: AdmRole) =>
    api<AdmUserMutationResult>(`/admin/users/${id}/role`, { method: "PATCH", json: { role } }),
};
