/**
 * Baseline three-role RBAC shipped in Session 1 (Slice 1.1) + Permissions Module
 *
 * The shared package uses lowercase role strings ("user"|"admin"|"super_admin")
 * because those cross the API boundary (JWT + JSON). The Prisma schema uses
 * UPPER_SNAKE enums (USER/ADMIN/SUPER_ADMIN); the API layer converts between them.
 * Session 11 extends this into full RBAC+ABAC+policy engine.
 */
import { z } from "zod";

export const Role = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const RoleHierarchy: Record<Role, number> = {
  [Role.USER]: 0,
  [Role.ADMIN]: 50,
  [Role.SUPER_ADMIN]: 100,
};

export function hasRole(userRole: Role, required: Role): boolean {
  return RoleHierarchy[userRole] >= RoleHierarchy[required];
}

// ─── Permissions (RBAC) ──────────────────────────────────────────────────────

export const ALL_PERMISSIONS = [
  "ORG_READ","ORG_WRITE","ORG_ADMIN",
  "WORKFLOW_READ","WORKFLOW_WRITE","WORKFLOW_RUN",
  "AGENT_READ","AGENT_WRITE",
  "TALK_READ","TALK_WRITE",
  "CANVAS_READ","CANVAS_WRITE",
  "BILLING_READ","BILLING_WRITE",
  "DEVELOPER_READ","DEVELOPER_WRITE",
  "AUDIT_READ",
  "NFC_READ","NFC_WRITE","NFC_DESTRUCTIVE","NFC_ADMIN",
  "CLOUD_ANDROID_READ","CLOUD_ANDROID_CONTROL","CLOUD_ANDROID_MANAGE","CLOUD_ANDROID_APP","CLOUD_ANDROID_FILE","CLOUD_ANDROID_SENSITIVE","CLOUD_ANDROID_ADMIN",
  "ADMIN_STAR",
] as const;
export type Permission = typeof ALL_PERMISSIONS[number];

export const PERMISSION_CATEGORIES: Record<string, Permission[]> = {
  organization: ["ORG_READ","ORG_WRITE","ORG_ADMIN"],
  workflow: ["WORKFLOW_READ","WORKFLOW_WRITE","WORKFLOW_RUN"],
  agents: ["AGENT_READ","AGENT_WRITE"],
  talk: ["TALK_READ","TALK_WRITE"],
  canvas: ["CANVAS_READ","CANVAS_WRITE"],
  billing: ["BILLING_READ","BILLING_WRITE"],
  developer: ["DEVELOPER_READ","DEVELOPER_WRITE"],
  audit: ["AUDIT_READ"],
  nfc: ["NFC_READ","NFC_WRITE","NFC_DESTRUCTIVE","NFC_ADMIN"],
  cloudAndroid: ["CLOUD_ANDROID_READ","CLOUD_ANDROID_CONTROL","CLOUD_ANDROID_MANAGE","CLOUD_ANDROID_APP","CLOUD_ANDROID_FILE","CLOUD_ANDROID_SENSITIVE","CLOUD_ANDROID_ADMIN"],
  admin: ["ADMIN_STAR"],
};

export const permissionsRoutesSchema = {
  userId: z.object({ userId: z.string().min(1) }),
  grantId: z.object({ grantId: z.string().min(1) }),
  grant: z.object({ targetUserId: z.string().min(1), permission: z.enum(ALL_PERMISSIONS), resourceId: z.string().optional() }),
  check: z.object({ permission: z.enum(ALL_PERMISSIONS) }),
};
