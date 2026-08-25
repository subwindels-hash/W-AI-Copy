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
  impersonate: (id: string) => api<{ token: string; refreshToken: string; user: any; expiresIn?: number }>(`/admin/users/${id}/impersonate`, { method: "POST", json: {} }),
  resetPin: (id: string) => api<{ ok: true; pinCleared: boolean }>(`/admin/users/${id}/pin-reset`, { method: "POST", json: {} }),
  resetPassword: (id: string) => api<{ ok: true; temporaryPassword: string }>(`/admin/users/${id}/password-reset`, { method: "POST", json: {} }),
  activity: (page = 1) => api<{ events: Array<{ id: string; action: string; actorUserId: string | null; resourceId: string | null; createdAt: string; ipAddress: string | null; metadata: Record<string, unknown> }>; pagination: { page: number; total: number } }>("/admin/activity", { params: { page, perPage: 30 } }),
};
