/**
 * Session 101 — Admin Console service tests.
 *
 * Exercises the Prisma-backed admin surface against FakePrisma: organization
 * scoping, super-admin scope, pagination/filter contracts, audited suspension
 * and role actions, self-protection, and shared Zod validation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const admin = await import("./admin.service.js");
const { AdmRoleChangeSchema, AdmSuspensionSchema, AdmUserListQuerySchema } = await import("@windels/shared/admin");

const ORG_A = "org-admin-a";
const ORG_B = "org-admin-b";
const ADMIN_A = "user-admin-a";
const USER_A = "user-member-a";
const USER_B = "user-member-b";
const SUPER = "user-super";

function seed() {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  db.seed("Organization", [
    { id: ORG_A, name: "Alpha", slug: "alpha" },
    { id: ORG_B, name: "Beta", slug: "beta" },
  ]);
  db.seed("User", [
    { id: ADMIN_A, email: "admin@alpha.test", role: "ADMIN", isActive: true, isSuspended: false, createdAt },
    { id: USER_A, email: "ada@alpha.test", role: "USER", isActive: true, isSuspended: false, createdAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: USER_B, email: "ben@beta.test", role: "USER", isActive: true, isSuspended: false, createdAt: new Date("2026-01-03T00:00:00.000Z") },
    { id: SUPER, email: "root@windels.test", role: "SUPER_ADMIN", isActive: true, isSuspended: false, createdAt: new Date("2026-01-04T00:00:00.000Z") },
  ]);
  db.seed("UserProfile", [
    { id: cuid(), userId: ADMIN_A, displayName: "Alpha Admin" },
    { id: cuid(), userId: USER_A, displayName: "Ada Alpha" },
    { id: cuid(), userId: USER_B, displayName: "Ben Beta" },
    { id: cuid(), userId: SUPER, displayName: "Platform Root" },
  ]);
  db.seed("Membership", [
    { id: cuid(), userId: ADMIN_A, organizationId: ORG_A },
    { id: cuid(), userId: USER_A, organizationId: ORG_A },
    { id: cuid(), userId: USER_B, organizationId: ORG_B },
  ]);
}

const orgAdmin = { actorId: ADMIN_A, organizationId: ORG_A };
const superAdmin = { actorId: SUPER, organizationId: null };

beforeEach(() => { db.reset(); seed(); });

describe("Admin Console — stats and directory", () => {
  it("returns organization-scoped stats for an admin", async () => {
    await expect(admin.getAdminStats(orgAdmin)).resolves.toEqual({ totalUsers: 2, activeUsers: 2, suspendedUsers: 0, organizations: 1 });
  });

  it("gives a super admin platform-wide stats", async () => {
    await expect(admin.getAdminStats(superAdmin)).resolves.toEqual({ totalUsers: 4, activeUsers: 4, suspendedUsers: 0, organizations: 2 });
  });

  it("lists real users with stable pagination and role/status filters", async () => {
    const result = await admin.listUsers(orgAdmin, { page: 1, perPage: 1, status: "active" });
    expect(result.users).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 1, perPage: 1, total: 2, totalPages: 2 });
    expect(result.users[0]).toMatchObject({ email: "ada@alpha.test", role: "user", profile: { displayName: "Ada Alpha" } });
    expect(result.users[0]!.createdAt).toBe("2026-01-02T00:00:00.000Z");

    const searched = await admin.listUsers(orgAdmin, { page: 1, perPage: 25, status: "all", q: "ada" });
    expect(searched.users.map((user) => user.id)).toEqual([USER_A]);
  });

  it("does not expose another organization's user through list or detail reads", async () => {
    expect((await admin.listUsers(orgAdmin, { page: 1, perPage: 25, status: "all" })).users.map((user) => user.id)).not.toContain(USER_B);
    await expect(admin.getAdminUser(orgAdmin, USER_B)).rejects.toThrow("User not found");
    await expect(admin.getAdminUser(orgAdmin, USER_A)).resolves.toMatchObject({ id: USER_A, email: "ada@alpha.test" });
  });
});

describe("Admin Console — guarded mutations and audit trail", () => {
  it("suspends and reactivates an in-scope user and writes audit rows", async () => {
    await expect(admin.setUserSuspended(orgAdmin, USER_A, true)).resolves.toMatchObject({ id: USER_A, isActive: false, isSuspended: true });
    expect(db.tables.get("User")!.find((user) => user.id === USER_A)).toMatchObject({ isActive: false, isSuspended: true });
    await expect(admin.setUserSuspended(orgAdmin, USER_A, false)).resolves.toMatchObject({ id: USER_A, isActive: true, isSuspended: false });
    expect(db.tables.get("AuditLog")!.map((row) => row.action)).toEqual(["admin.user.suspend", "admin.user.unsuspend"]);
  });

  it("prevents self-suspension, super-admin suspension, and cross-tenant mutation", async () => {
    await expect(admin.setUserSuspended(orgAdmin, ADMIN_A, true)).rejects.toThrow("cannot suspend your own account");
    await expect(admin.setUserSuspended(orgAdmin, USER_B, true)).rejects.toThrow("User not found");
    await expect(admin.setUserSuspended(superAdmin, SUPER, true)).rejects.toThrow("cannot suspend your own account");
    await expect(admin.setUserSuspended(orgAdmin, SUPER, true)).rejects.toThrow("User not found");
  });

  it("allows only a super admin to change roles and records the new role", async () => {
    await expect(admin.promoteUser(orgAdmin, USER_A, "admin")).rejects.toThrow("Only super admins");
    await expect(admin.promoteUser(superAdmin, USER_A, "admin")).resolves.toEqual({ id: USER_A, role: "admin" });
    expect(db.tables.get("User")!.find((user) => user.id === USER_A)!.role).toBe("ADMIN");
    expect(db.tables.get("AuditLog")![0]).toMatchObject({ action: "admin.user.role_changed", resourceId: USER_A, metadata: { newRole: "admin" } });
    await expect(admin.promoteUser(superAdmin, SUPER, "user")).rejects.toThrow("cannot change your own role");
  });
});

describe("Admin Console — shared contracts", () => {
  it("validates list filters and guarded mutations", () => {
    expect(AdmUserListQuerySchema.safeParse({ page: "1", perPage: "25", status: "suspended", role: "admin" }).success).toBe(true);
    expect(AdmUserListQuerySchema.safeParse({ status: "unknown" }).success).toBe(false);
    expect(AdmSuspensionSchema.safeParse({ suspended: true }).success).toBe(true);
    expect(AdmSuspensionSchema.safeParse({ suspended: "true" }).success).toBe(false);
    expect(AdmRoleChangeSchema.safeParse({ role: "super_admin" }).success).toBe(true);
    expect(AdmRoleChangeSchema.safeParse({ role: "owner" }).success).toBe(false);
  });
});
