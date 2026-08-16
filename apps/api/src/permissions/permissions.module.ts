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
import { Permission } from "@prisma/client";

// ─── Permission List ─────────────────────────────────────────────────────────

export { Permission };

export const ALL_PERMISSIONS = Object.values(Permission);

// ─── Permission Categories ───────────────────────────────────────────────────

export const PERMISSION_CATEGORIES = {
  organization: [Permission.ORG_READ, Permission.ORG_WRITE, Permission.ORG_ADMIN],
  workflow: [Permission.WORKFLOW_READ, Permission.WORKFLOW_WRITE, Permission.WORKFLOW_RUN],
  agents: [Permission.AGENT_READ, Permission.AGENT_WRITE],
  talk: [Permission.TALK_READ, Permission.TALK_WRITE],
  canvas: [Permission.CANVAS_READ, Permission.CANVAS_WRITE],
  billing: [Permission.BILLING_READ, Permission.BILLING_WRITE],
  developer: [Permission.DEVELOPER_READ, Permission.DEVELOPER_WRITE],
  audit: [Permission.AUDIT_READ],
  nfc: [Permission.NFC_READ, Permission.NFC_WRITE, Permission.NFC_DESTRUCTIVE, Permission.NFC_ADMIN],
  cloudAndroid: [Permission.CLOUD_ANDROID_READ, Permission.CLOUD_ANDROID_CONTROL, Permission.CLOUD_ANDROID_MANAGE, Permission.CLOUD_ANDROID_APP, Permission.CLOUD_ANDROID_FILE, Permission.CLOUD_ANDROID_SENSITIVE, Permission.CLOUD_ANDROID_ADMIN],
  admin: [Permission.ADMIN_STAR],
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
    const res = await coreListPermissions(userId);
    return {
      role: res.role,
      permissions: res.permissions as Permission[],
      grants: res.grants as any,
    };
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
      organization: [...PERMISSION_CATEGORIES.organization],
      workflow: [...PERMISSION_CATEGORIES.workflow],
      agents: [...PERMISSION_CATEGORIES.agents],
      talk: [...PERMISSION_CATEGORIES.talk],
      canvas: [...PERMISSION_CATEGORIES.canvas],
      billing: [...PERMISSION_CATEGORIES.billing],
      developer: [...PERMISSION_CATEGORIES.developer],
      audit: [...PERMISSION_CATEGORIES.audit],
      nfc: [...PERMISSION_CATEGORIES.nfc],
      cloudAndroid: [...PERMISSION_CATEGORIES.cloudAndroid],
      admin: [...PERMISSION_CATEGORIES.admin],
      all: [...ALL_PERMISSIONS],
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
