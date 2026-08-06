import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import type { PublicRole } from "./auth.service.js";
import type { Role as PrismaRole } from "@prisma/client";
import type {
  AdmRole,
  AdmStats,
  AdmUserList,
  AdmUserListQuery,
  AdmUserMutationResult,
  AdmUserRow,
} from "@windels/shared/admin";

const publicToPrisma: Record<PublicRole, PrismaRole> = { user: "USER", admin: "ADMIN", super_admin: "SUPER_ADMIN" };
const prismaToPublic: Record<PrismaRole, PublicRole> = { USER: "user", ADMIN: "admin", SUPER_ADMIN: "super_admin" };

type AdminScope = { actorId: string; organizationId: string | null };
export type { AdminScope };

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toUserRow(user: any): AdmUserRow {
  return {
    id: user.id,
    email: user.email,
    role: prismaToPublic[user.role],
    isActive: user.isActive,
    isSuspended: user.isSuspended,
    createdAt: iso(user.createdAt),
    profile: user.profile ? { displayName: user.profile.displayName ?? null } : null,
  };
}

async function scopeFor({ actorId, organizationId }: AdminScope) {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) throw AppError.unauthorized();
  if (actor.role === "SUPER_ADMIN") return { actor, organizationId: null as string | null };
  if (actor.role !== "ADMIN") throw AppError.forbidden();
  if (!organizationId) throw AppError.forbidden("An organization context is required");
  const membership = await prisma.membership.findFirst({ where: { userId: actorId, organizationId } });
  if (!membership) throw AppError.forbidden("You are not a member of this organization");
  return { actor, organizationId };
}

export async function getAdminStats(scope: AdminScope): Promise<AdmStats> {
  const access = await scopeFor(scope);
  const memberWhere = access.organizationId ? { memberships: { some: { organizationId: access.organizationId } } } : {};
  const [totalUsers, activeUsers, suspendedUsers, organizations] = await Promise.all([
    prisma.user.count({ where: memberWhere }),
    prisma.user.count({ where: { ...memberWhere, isActive: true, isSuspended: false } }),
    prisma.user.count({ where: { ...memberWhere, isSuspended: true } }),
    prisma.organization.count({ where: access.organizationId ? { id: access.organizationId } : {} }),
  ]);
  return { totalUsers, activeUsers, suspendedUsers, organizations };
}

export async function listUsers(scope: AdminScope, input: AdmUserListQuery): Promise<AdmUserList> {
  const access = await scopeFor(scope);
  const statusWhere = input.status === "active"
    ? { isActive: true, isSuspended: false }
    : input.status === "suspended"
      ? { isSuspended: true }
      : input.status === "inactive"
        ? { isActive: false }
        : {};
  const where = {
    ...(access.organizationId ? { memberships: { some: { organizationId: access.organizationId } } } : {}),
    ...(input.role ? { role: publicToPrisma[input.role] } : {}),
    ...statusWhere,
    ...(input.q ? {
      OR: [
        { email: { contains: input.q, mode: "insensitive" as const } },
        { profile: { is: { displayName: { contains: input.q, mode: "insensitive" as const } } } },
      ],
    } : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, include: { profile: true }, orderBy: { createdAt: "desc" }, skip: (input.page - 1) * input.perPage, take: input.perPage }),
    prisma.user.count({ where }),
  ]);
  return {
    users: users.map(toUserRow),
    pagination: {
      page: input.page,
      perPage: input.perPage,
      total,
      totalPages: Math.ceil(total / input.perPage),
    },
  };
}

async function assertTargetInScope(access: Awaited<ReturnType<typeof scopeFor>>, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw AppError.notFound("User not found");
  if (access.organizationId) {
    const member = await prisma.membership.findFirst({ where: { userId, organizationId: access.organizationId } });
    if (!member) throw AppError.notFound("User not found");
  }
  return target;
}

export async function getAdminUser(scope: AdminScope, userId: string): Promise<AdmUserRow> {
  const access = await scopeFor(scope);
  const target = await assertTargetInScope(access, userId);
  const withProfile = await prisma.user.findUnique({ where: { id: target.id }, include: { profile: true } });
  if (!withProfile) throw AppError.notFound("User not found");
  return toUserRow(withProfile);
}

export async function setUserSuspended(scope: AdminScope, userId: string, suspended: boolean): Promise<AdmUserMutationResult> {
  const access = await scopeFor(scope);
  const target = await assertTargetInScope(access, userId);
  if (target.id === access.actor.id) throw AppError.badRequest("You cannot suspend your own account");
  if (target.role === "SUPER_ADMIN") throw AppError.forbidden("Cannot suspend a super admin");
  const updated = await prisma.user.update({ where: { id: userId }, data: { isSuspended: suspended, isActive: !suspended } });
  await prisma.auditLog.create({ data: { organizationId: access.organizationId ?? undefined, userId: access.actor.id, action: suspended ? "admin.user.suspend" : "admin.user.unsuspend", resourceType: "User", resourceId: userId } });
  return { id: updated.id, isActive: updated.isActive, isSuspended: updated.isSuspended };
}

export async function promoteUser(scope: AdminScope, userId: string, role: AdmRole): Promise<AdmUserMutationResult> {
  const access = await scopeFor(scope);
  if (access.actor.role !== "SUPER_ADMIN") throw AppError.forbidden("Only super admins can change roles");
  const target = await assertTargetInScope(access, userId);
  if (target.id === access.actor.id) throw AppError.badRequest("You cannot change your own role");
  const updated = await prisma.user.update({ where: { id: userId }, data: { role: publicToPrisma[role] } });
  await prisma.auditLog.create({ data: { userId: access.actor.id, action: "admin.user.role_changed", resourceType: "User", resourceId: userId, metadata: { newRole: role } } });
  return { id: updated.id, role: prismaToPublic[updated.role] };
}
