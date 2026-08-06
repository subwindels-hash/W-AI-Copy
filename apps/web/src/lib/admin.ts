/** Admin utilities client (admin.service.ts → /api/v1/admin). */
import { api } from "./api";

export interface AdminStats {
  users: number;
  organizations: number;
  conversations: number;
  messages: number;
  [key: string]: unknown;
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuspended: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  perPage: number;
}

export const adminApi = {
  stats: () => api<AdminStats>("/admin/stats"),
  listUsers: (params?: { q?: string; page?: number; perPage?: number }) =>
    api<AdminUserList>("/admin/users", { params }),
  setSuspended: (id: string, suspended: boolean) =>
    api<AdminUserRow>(`/admin/users/${id}/suspension`, { method: "POST", json: { suspended } }),
  setRole: (id: string, role: "user" | "admin" | "super_admin") =>
    api<AdminUserRow>(`/admin/users/${id}/role`, { method: "PATCH", json: { role } }),
};
