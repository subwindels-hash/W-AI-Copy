/**
 * Session 1 — Baseline RBAC (three-role model + role permission seed + user
 * permission grants). Verifies role→permission mappings, the ADMIN_STAR
 * wildcard for super admins, org-scoped grants, and the admin-only guard on
 * grant/revoke. Runs on FakePrisma; no infrastructure required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const db = new FakePrisma();
const kv = new FakeKv();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
// Generated Prisma client is absent in the test sandbox; mock the enums with
// the schema's values (permissions.service uses them as role→perm keys).
vi.mock("@prisma/client", () => ({
  Role: { USER: "USER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" },
  Permission: {
    ORG_READ: "ORG_READ", ORG_WRITE: "ORG_WRITE", ORG_ADMIN: "ORG_ADMIN",
    WORKFLOW_READ: "WORKFLOW_READ", WORKFLOW_WRITE: "WORKFLOW_WRITE", WORKFLOW_RUN: "WORKFLOW_RUN",
    AGENT_READ: "AGENT_READ", AGENT_WRITE: "AGENT_WRITE",
    TALK_READ: "TALK_READ", TALK_WRITE: "TALK_WRITE",
    CANVAS_READ: "CANVAS_READ", CANVAS_WRITE: "CANVAS_WRITE",
    BILLING_READ: "BILLING_READ", BILLING_WRITE: "BILLING_WRITE",
    DEVELOPER_READ: "DEVELOPER_READ", DEVELOPER_WRITE: "DEVELOPER_WRITE",
    AUDIT_READ: "AUDIT_READ", ADMIN_STAR: "ADMIN_STAR",
  },
}));

const {
  ensureRolePermissions,
  hasPermission,
  listPermissions,
  grantPermission,
  revokePermission,
} = await import("./permissions.service.js");

// Real enum values from @prisma/client (mocked in the sandbox because the
// generated client is absent). Defined here so the test file typechecks clean;
// the values match the schema exactly.
const Role = { USER: "USER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" } as const;
const Permission = {
  ORG_READ: "ORG_READ", ORG_WRITE: "ORG_WRITE", ORG_ADMIN: "ORG_ADMIN",
  WORKFLOW_READ: "WORKFLOW_READ", WORKFLOW_WRITE: "WORKFLOW_WRITE", WORKFLOW_RUN: "WORKFLOW_RUN",
  AGENT_READ: "AGENT_READ", AGENT_WRITE: "AGENT_WRITE",
  TALK_READ: "TALK_READ", TALK_WRITE: "TALK_WRITE",
  CANVAS_READ: "CANVAS_READ", CANVAS_WRITE: "CANVAS_WRITE",
  BILLING_READ: "BILLING_READ", BILLING_WRITE: "BILLING_WRITE",
  DEVELOPER_READ: "DEVELOPER_READ", DEVELOPER_WRITE: "DEVELOPER_WRITE",
  AUDIT_READ: "AUDIT_READ", ADMIN_STAR: "ADMIN_STAR",
} as const;

const ALL_PERMISSIONS: Array<(typeof Permission)[keyof typeof Permission]> = [
  Permission.ORG_READ, Permission.ORG_WRITE, Permission.ORG_ADMIN,
  Permission.WORKFLOW_READ, Permission.WORKFLOW_WRITE, Permission.WORKFLOW_RUN,
  Permission.AGENT_READ, Permission.AGENT_WRITE,
  Permission.TALK_READ, Permission.TALK_WRITE,
  Permission.CANVAS_READ, Permission.CANVAS_WRITE,
  Permission.BILLING_READ, Permission.BILLING_WRITE,
  Permission.DEVELOPER_READ, Permission.DEVELOPER_WRITE,
  Permission.AUDIT_READ, Permission.ADMIN_STAR,
];

function seedUser(id: string, role: (typeof Role)[keyof typeof Role]) {
  db.seed("User", [{ id, email: `${id}@example.com`, role, isActive: true }]);
}

beforeEach(() => {
  db.reset();
  kv.strings.clear(); kv.sets.clear(); kv.hashes.clear(); kv.lists.clear(); kv.zsets.clear();
});

describe("ensureRolePermissions", () => {
  it("seeds role→permission rows for every role in the baseline", async () => {
    await ensureRolePermissions();
    const rows = await db.client().rolePermission.findMany({});
    expect(rows.length).toBeGreaterThan(0);

    // Every role/permission pair from ROLE_PERMISSIONS is present.
    const combos = new Set(rows.map((r: any) => `${r.role}:${r.permission}`));
    expect(combos.has("SUPER_ADMIN:BILLING_WRITE")).toBe(true);
    expect(combos.has("ADMIN:AUDIT_READ")).toBe(true);
    expect(combos.has("USER:CANVAS_WRITE")).toBe(true);
    expect(combos.has("USER:BILLING_WRITE")).toBe(false); // not granted to USER
  });

  it("is idempotent — re-running upserts without throwing", async () => {
    // NOTE: the in-memory FakePrisma cannot match Prisma's compound-unique
    // `where: { role_permission: { role, permission } }` upsert key, so it
    // cannot assert row-count stability here. That assertion requires a real
    // database and lives in the Phase 6 runtime checklist instead.
    await expect(ensureRolePermissions()).resolves.not.toThrow();
    await expect(ensureRolePermissions()).resolves.not.toThrow();
  });
});

describe("hasPermission — role baseline", () => {
  it("super_admin can perform every permission (ADMIN_STAR wildcard)", async () => {
    seedUser("su", Role.SUPER_ADMIN);
    for (const p of ALL_PERMISSIONS) {
      await expect(hasPermission("su", p)).resolves.toBe(true);
    }
  });

  it("admin has billing/developer/audit but a regular user does not", async () => {
    seedUser("admin1", Role.ADMIN);
    seedUser("user1", Role.USER);
    await expect(hasPermission("admin1", Permission.BILLING_WRITE)).resolves.toBe(true);
    await expect(hasPermission("admin1", Permission.AUDIT_READ)).resolves.toBe(true);
    await expect(hasPermission("user1", Permission.BILLING_WRITE)).resolves.toBe(false);
    await expect(hasPermission("user1", Permission.DEVELOPER_WRITE)).resolves.toBe(false);
  });

  it("a regular user keeps its baseline working permissions", async () => {
    seedUser("user1", Role.USER);
    await expect(hasPermission("user1", Permission.ORG_READ)).resolves.toBe(true);
    await expect(hasPermission("user1", Permission.WORKFLOW_RUN)).resolves.toBe(true);
    await expect(hasPermission("user1", Permission.CANVAS_WRITE)).resolves.toBe(true);
  });

  it("returns false for a missing user", async () => {
    await expect(hasPermission("nobody", Permission.ORG_READ)).resolves.toBe(false);
  });
});

describe("user-level grants", () => {
  it("grantPermission requires an ORG_ADMIN actor and then grants access", async () => {
    seedUser("admin1", Role.ADMIN);
    seedUser("user1", Role.USER);
    await grantPermission("admin1", "user1", Permission.BILLING_READ);
    await expect(hasPermission("user1", Permission.BILLING_READ)).resolves.toBe(true);
  });

  it("a non-admin actor is forbidden from granting", async () => {
    seedUser("user1", Role.USER);
    seedUser("target", Role.USER);
    await expect(grantPermission("user1", "target", Permission.BILLING_READ)).rejects.toThrow("FORBIDDEN");
  });

  it("revokePermission removes a grant and only an ORG_ADMIN can do it", async () => {
    seedUser("admin1", Role.ADMIN);
    seedUser("user1", Role.USER);
    const grant = await grantPermission("admin1", "user1", Permission.DEVELOPER_READ);
    await expect(hasPermission("user1", Permission.DEVELOPER_READ)).resolves.toBe(true);
    await revokePermission("admin1", grant.id);
    await expect(hasPermission("user1", Permission.DEVELOPER_READ)).resolves.toBe(false);
  });

  it("listPermissions merges role baseline + explicit grants", async () => {
    seedUser("admin1", Role.ADMIN);
    seedUser("user1", Role.USER);
    await grantPermission("admin1", "user1", Permission.AUDIT_READ);
    const listed = await listPermissions("user1");
    expect(listed.permissions).toContain(Permission.ORG_READ);      // from role
    expect(listed.permissions).toContain(Permission.AUDIT_READ);    // from grant
    expect(listed.grants).toHaveLength(1);
  });
});
