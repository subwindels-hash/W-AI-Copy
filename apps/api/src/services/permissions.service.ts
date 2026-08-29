import { prisma } from "../db/client.js";
import { Permission, Role } from "@prisma/client";

// Role → default permission mappings (baseline RBAC, Slice 91)
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    Permission.ORG_READ, Permission.ORG_WRITE, Permission.ORG_ADMIN,
    Permission.WORKFLOW_READ, Permission.WORKFLOW_WRITE, Permission.WORKFLOW_RUN,
    Permission.AGENT_READ, Permission.AGENT_WRITE,
    Permission.TALK_READ, Permission.TALK_WRITE,
    Permission.CANVAS_READ, Permission.CANVAS_WRITE,
    Permission.BILLING_READ, Permission.BILLING_WRITE,
    Permission.DEVELOPER_READ, Permission.DEVELOPER_WRITE,
    Permission.AUDIT_READ,
    Permission.NFC_READ, Permission.NFC_WRITE, Permission.NFC_DESTRUCTIVE, Permission.NFC_ADMIN,
    Permission.CLOUD_ANDROID_READ, Permission.CLOUD_ANDROID_CONTROL, Permission.CLOUD_ANDROID_MANAGE, Permission.CLOUD_ANDROID_APP, Permission.CLOUD_ANDROID_FILE, Permission.CLOUD_ANDROID_SENSITIVE, Permission.CLOUD_ANDROID_ADMIN,
    Permission.ADMIN_STAR,
  ],
  ADMIN: [
    Permission.ORG_READ, Permission.ORG_WRITE, Permission.ORG_ADMIN,
    Permission.WORKFLOW_READ, Permission.WORKFLOW_WRITE, Permission.WORKFLOW_RUN,
    Permission.AGENT_READ, Permission.AGENT_WRITE,
    Permission.TALK_READ, Permission.TALK_WRITE,
    Permission.CANVAS_READ, Permission.CANVAS_WRITE,
    Permission.BILLING_READ, Permission.BILLING_WRITE,
    Permission.DEVELOPER_READ, Permission.DEVELOPER_WRITE,
    Permission.AUDIT_READ,
    Permission.NFC_READ, Permission.NFC_WRITE, Permission.NFC_DESTRUCTIVE, Permission.NFC_ADMIN,
    Permission.CLOUD_ANDROID_READ, Permission.CLOUD_ANDROID_CONTROL, Permission.CLOUD_ANDROID_MANAGE, Permission.CLOUD_ANDROID_APP, Permission.CLOUD_ANDROID_FILE, Permission.CLOUD_ANDROID_SENSITIVE, Permission.CLOUD_ANDROID_ADMIN,
  ],
  USER: [
    Permission.ORG_READ,
    Permission.WORKFLOW_READ, Permission.WORKFLOW_WRITE, Permission.WORKFLOW_RUN,
    Permission.AGENT_READ, Permission.AGENT_WRITE,
    Permission.TALK_READ, Permission.TALK_WRITE,
    Permission.CANVAS_READ, Permission.CANVAS_WRITE,
    Permission.NFC_READ, Permission.NFC_WRITE,
    Permission.CLOUD_ANDROID_READ, Permission.CLOUD_ANDROID_CONTROL, Permission.CLOUD_ANDROID_APP, Permission.CLOUD_ANDROID_FILE,
  ],
};

export async function ensureRolePermissions() {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role: role as Role, permission: p } },
        update: {},
        create: { role: role as Role, permission: p },
      });
    }
  }
}

/** Check if a user has a given permission (or ADMIN_STAR wildcard). */
export async function hasPermission(userId: string, permission: Permission, orgId?: string): Promise<boolean> {
  const [user, userPerms] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.userPermission.findMany({ where: { userId, permission }, select: { resourceId: true } }),
  ]);
  if (!user) return false;
  // SUPER_ADMIN has everything via rolePermissions
  const rolePerm = ROLE_PERMISSIONS[user.role];
  if (rolePerm.includes(permission) || rolePerm.includes(Permission.ADMIN_STAR)) {
    // If resource-scoped permission check, role grants access org-wide when no orgId specified;
    // we treat role-level as org-wide grant.
    return true;
  }
  // Check user-level grants; if orgId provided, also check resourceId match
  if (orgId) {
    return userPerms.some((p: any) => p.resourceId === null || p.resourceId === orgId);
  }
  return userPerms.length > 0;
}

/** Require-permission middleware factory for Express routes. */
export function requirePerm(permission: Permission) {
  return async (req: any, _res: any, next: any) => {
    const userId = req.user?.id;
    if (!userId) return _res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Auth required" } });
    const ok = await hasPermission(userId, permission, req.user?.organizationId ?? undefined);
    if (!ok) return _res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: `Missing permission: ${permission}` } });
    next();
  };
}

export async function listPermissions(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { role: null, permissions: [], grants: [] };
  const rolePerms = ROLE_PERMISSIONS[user.role] ?? [];
  const grants = await prisma.userPermission.findMany({ where: { userId } });
  const set = new Set<string>(rolePerms);
  for (const g of grants) set.add(g.permission);
  return {
    role: user.role,
    permissions: Array.from(set),
    grants: grants.map((g: any) => ({ id: g.id, permission: g.permission, resourceId: g.resourceId })),
  };
}

export async function grantPermission(actorId: string, targetUserId: string, permission: Permission, resourceId?: string) {
  if (!(await hasPermission(actorId, Permission.ORG_ADMIN))) {
    throw new Error("FORBIDDEN");
  }
  return prisma.userPermission.create({ data: { userId: targetUserId, permission, resourceId } });
}

export async function revokePermission(actorId: string, grantId: string) {
  if (!(await hasPermission(actorId, Permission.ORG_ADMIN))) {
    throw new Error("FORBIDDEN");
  }
  await prisma.userPermission.delete({ where: { id: grantId } });
}
