/**
 * Baseline three-role RBAC shipped in Session 1 (Slice 1.1).
 *
 * The shared package uses lowercase role strings ("user"|"admin"|"super_admin")
 * because those cross the API boundary (JWT + JSON). The Prisma schema uses
 * UPPER_SNAKE enums (USER/ADMIN/SUPER_ADMIN); the API layer converts between them.
 * Session 11 extends this into full RBAC+ABAC+policy engine.
 */
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
