// Session 101 — Admin Console contracts.
//
// The admin surface is backed by the core Prisma User/Membership/AuditLog
// models. These shared contracts keep its API, client and UI aligned while
// preserving the existing RBAC behavior.

import { z } from "zod";

export const ADM_ROLES = ["user", "admin", "super_admin"] as const;
export type AdmRole = (typeof ADM_ROLES)[number];

export const ADM_USER_STATUSES = ["all", "active", "suspended", "inactive"] as const;
export type AdmUserStatus = (typeof ADM_USER_STATUSES)[number];

export interface AdmStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  organizations: number;
}

export interface AdmUserProfile {
  displayName: string | null;
}

export interface AdmUserRow {
  id: string;
  email: string;
  publicUserId: string | null;
  username: string | null;
  role: AdmRole;
  isActive: boolean;
  isSuspended: boolean;
  pinSet: boolean;
  pinExpired: boolean;
  createdAt: string;
  profile: AdmUserProfile | null;
}

export interface AdmUserPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface AdmUserList {
  users: AdmUserRow[];
  pagination: AdmUserPagination;
}

export interface AdmUserMutationResult {
  id: string;
  role?: AdmRole;
  isActive?: boolean;
  isSuspended?: boolean;
}

export const AdmUserListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(ADM_ROLES).optional(),
  status: z.enum(ADM_USER_STATUSES).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdmUserListQuery = z.infer<typeof AdmUserListQuerySchema>;

export const AdmUserIdSchema = z.object({ id: z.string().cuid() });
export const AdmSuspensionSchema = z.object({ suspended: z.boolean() });
export const AdmRoleChangeSchema = z.object({ role: z.enum(ADM_ROLES) });
