/**
 * Permissions Module (S???) — Centralized RBAC Service
 *
 * Provides role-based access control (RBAC) for WINDELS AI OS.
 * Wraps the existing permissions.service.ts and adds module-specific features.
 *
 * Permissions are assigned via:
 *   - Roles (SUPER_ADMIN, ADMIN, USER) with default permissions
 *   - Individual grants (user-specific permission assignments)
 *   - Resource scoping (permissions can be scoped to specific resources)
 *
 * Permission Categories:
 *   - ORG_* : Organization management
 *   - WORKFLOW_* : Workflow automation
 *   - AGENT_* : AI agent management
 *   - TALK_* : Voice channels & meetings
 *   - CANVAS_* : Collaborative canvas
 *   - BILLING_* : Billing & subscriptions
 *   - DEVELOPER_* : Developer tools & API
 *   - AUDIT_* : Audit logs & compliance
 *   - ADMIN_* : Administrative actions
 */

import { prisma } from "../db/client.js";
import {
  hasPermission as coreHasPermission,
  requirePerm as coreRequirePerm,
  listPermissions as coreListPermissions,
  grantPermission as coreGrantPermission,
  revokePermission as coreRevokePermission,
  ensureRolePermissions,
} from "../services/permissions.service.js";
import type { Permission } from "@prisma/client";
import type { Prisma } from "@prisma/client";

// ─── Permission List ─────────────────────────────────────────────────────────

export const ALL_PERMISSIONS = [
  // Organization
  "ORG_READ",
  "ORG_WRITE",
  "ORG_ADMIN",
  // Workflow
  "WORKFLOW_READ",
  "WORKFLOW_WRITE",
  "WORKFLOW_RUN",
  // Agents
  "AGENT_READ",
  "AGENT_WRITE",
  // Talk
  "TALK_READ",
  "TALK_WRITE",
  // Canvas
  "CANVAS_READ",
  "CANVAS_WRITE",
  // Billing
  "BILLING_READ",
  "BILLING_WRITE",
  // Developer
  "DEVELOPER_READ",
  "DEVELOPER_WRITE",
  // Audit
  "AUDIT_READ",
  // Admin
  "ADMIN_STAR",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// ─── Permission Categories ───────────────────────────────────────────────────

export const PERMISSION_CATEGORIES = {
  organization: ["ORG_READ", "ORG_WRITE", "ORG_ADMIN"] as Permission[],
  workflow: ["WORKFLOW_READ", "WORKFLOW_WRITE", "WORKFLOW_RUN"] as Permission[],
  agents: ["AGENT_READ", "AGENT_WRITE"] as Permission[],
  talk: ["TALK_READ", "TALK_WRITE"] as Permission[],
  canvas: ["CANVAS_READ", "CANVAS_WRITE"] as Permission[],
  billing: ["BILLING_READ", "BILLING_WRITE"] as Permission[],
  developer: ["DEVELOPER_READ", "DEVELOPER_WRITE"] as Permission[],
  audit: ["AUDIT_READ"] as Permission[],
  admin: ["ADMIN_STAR"] as Permission[],
} as const;

// ─── Permissions Module API ──────────────────────────────────────────────────

export const permissionsModule = {
  /**
   * Check if a user has a permission
   */
  async hasPermission(userId: string, permission: Permission, orgId?: string): Promise<boolean> {
    return coreHasPermission(userId, permission, orgId);
  },

  /**
   * Get user's permissions
   */
  async listPermissions(userId: string): Promise<{
    role: string | null;
    permissions: Permission[];
    grants: Array<{
      id: string;
      permission: Permission;
      resourceId: string | null;
    }>;
  }> {
    return coreListPermissions(userId);
  },

  /**
   * Grant a permission to a user
   */
  async grantPermission(
    actorId: string,
    targetUserId: string,
    permission: Permission,
    resourceId?: string,
  ): Promise<void> {
    await coreGrantPermission(actorId, targetUserId, permission, resourceId);
  },

  /**
   * Revoke a permission grant
   */
  async revokePermission(actorId: string, grantId: string): Promise<void> {
    await coreRevokePermission(actorId, grantId);
  },

  /**
   * Initialize role permissions (call on startup)
   */
  async initialize(): Promise<void> {
    await ensureRolePermissions();
  },

  /**
   * Get all available permissions grouped by category
   */
  getPermissionCatalog(): Record<string, Permission[]> {
    return {
      ...PERMISSION_CATEGORIES,
      all: [...ALL_PERMISSIONS] as Permission[],
    };
  },

  /**
   * Middleware factory for requiring permissions
   */
  requirePermission(permission: Permission) {
    return coreRequirePerm(permission);
  },

  /**
   * Check if permission exists
   */
  isValidPermission(permission: string): permission is Permission {
    return (ALL_PERMISSIONS as readonly string[]).includes(permission as Permission);
  },
};

export default permissionsModule;
