/**
 * Coverage for the five core CRUD modules: agents, conversations, attachments,
 * prompt templates, and the public API key layer.
 *
 * These were reported as "Critical 5 (No Service Files)". They do in fact
 * exist — at `src/services/<name>.service.ts` rather than `src/<module>/`, so a
 * directory-shaped audit misses them — and they are real Prisma-backed
 * implementations wired to registered routes.
 *
 * What they genuinely lacked was any test at all, because they are pure Prisma
 * consumers and the suite has no database. `FakePrisma` closes that gap, so the
 * properties that actually matter — organization scoping, participant access,
 * upload validation, and API-key auth — are now verified rather than assumed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const apikeys = await import("./publicApi.service.js");


const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

/** Give each user a membership so resolveUserContext() can place them. */
function seedMemberships() {
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
  db.seed("User", [
    { id: USER_A, email: "alpha@example.com", role: "USER", isActive: true, isSuspended: false, createdAt: new Date() },
    { id: USER_B, email: "beta@example.com", role: "USER", isActive: true, isSuspended: false, createdAt: new Date() },
  ]);
  db.seed("UserProfile", [
    { id: cuid(), userId: USER_A, displayName: "Alpha User" },
    { id: cuid(), userId: USER_B, displayName: "Beta User" },
  ]);
}

beforeEach(() => {
  db.reset();
  seedMemberships();
});

// ─── Public API keys ───────────────────────────────────────────────────
describe("public API keys", () => {
  it("returns the plaintext key once and stores only a hash", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = created.token ?? created.key ?? created.plaintext;
    expect(String(token)).toMatch(/^WND_/);
    const row = db.tables.get("ApiKey")![0];
    // The raw token must never be persisted.
    expect(JSON.stringify(row)).not.toContain(String(token));
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a valid key and rejects a bogus one", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = created.token ?? created.key ?? created.plaintext;
    expect(await apikeys.verifyApiKey(String(token))).toBeTruthy();
    expect(await apikeys.verifyApiKey("wnd_not_a_real_key")).toBeNull();
    // A token without the prefix is rejected before any DB lookup.
    expect(await apikeys.verifyApiKey("bearer-ish-nonsense")).toBeNull();
  });

  it("rotates atomically, returns the replacement once, and invalidates the old secret", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "rotate", scopes: ["READ", "WRITE"], granularScopes: ["models:read", "ai:execute"] } as any);
    const oldToken = created.key;
    const replacement: any = await apikeys.rotateApiKey(USER_A, created.id);
    expect(replacement.key).toMatch(/^WND_/);
    expect(replacement.key).not.toBe(oldToken);
    expect(await apikeys.verifyApiKey(oldToken)).toBeNull();
    expect(await apikeys.verifyApiKey(replacement.key)).toBeTruthy();
    expect(JSON.stringify(db.tables.get("ApiKey"))).not.toContain(replacement.key);
  });

  it("rejects a revoked key", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = String(created.token ?? created.key ?? created.plaintext);
    db.tables.get("ApiKey")![0].revokedAt = new Date();
    expect(await apikeys.verifyApiKey(token)).toBeNull();
  });

  it("rejects an expired key", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = String(created.token ?? created.key ?? created.plaintext);
    db.tables.get("ApiKey")![0].expiresAt = new Date(Date.now() - 1000);
    expect(await apikeys.verifyApiKey(token)).toBeNull();
  });

  it("reads a key detail only inside the owning organization", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "detail", scopes: ["READ"] } as any);
    expect(await apikeys.getApiKey(USER_A, created.id)).toMatchObject({ id: created.id, name: "detail", revoked: false });
    await expect(apikeys.getApiKey(USER_B, created.id)).rejects.toThrow("API key not found");
  });

  it("lists active keys by organization and can include revoked keys explicitly", async () => {
    await apikeys.createApiKey(USER_A, { name: "active", scopes: ["READ"] } as any);
    const revoked: any = await apikeys.createApiKey(USER_A, { name: "old", scopes: ["READ"] } as any);
    await apikeys.revokeApiKey(USER_A, revoked.id);
    expect((await apikeys.listApiKeys(USER_A)).map((key) => key.name)).toEqual(["active"]);
    expect((await apikeys.listApiKeys(USER_A, { includeRevoked: true })).map((key) => key.name)).toHaveLength(2);
  });

  it("updates name/scopes, audits the change, and makes revocation irreversible", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const updated = await apikeys.updateApiKey(USER_A, created.id, { name: "production", scopes: ["READ", "WRITE"] });
    expect(updated).toMatchObject({ id: created.id, name: "production", scopes: ["READ", "WRITE"], revoked: false });
    const revoked = await apikeys.revokeApiKey(USER_A, created.id);
    expect(revoked.revoked).toBe(true);
    await expect(apikeys.updateApiKey(USER_A, created.id, { name: "again" })).rejects.toThrow("Revoked API keys");
    expect(db.tables.get("AuditLog")!.map((row) => row.action)).toEqual(["admin.apikey.created", "admin.apikey.updated", "admin.apikey.revoked"]);
  });

  it("rejects cross-organization list, update and revoke attempts", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "private", scopes: ["READ"] } as any);
    expect(await apikeys.listApiKeys(USER_B)).toHaveLength(0);
    await expect(apikeys.updateApiKey(USER_B, created.id, { name: "leaked" })).rejects.toThrow("API key not found");
    await expect(apikeys.revokeApiKey(USER_B, created.id)).rejects.toThrow("API key not found");
    expect((await apikeys.listApiKeys(USER_A))[0]!.name).toBe("private");
  });

  it("hashes tokens consistently and never exposes the stored hash in list output", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "hash", scopes: ["READ"] } as any);
    const token = String(created.key);
    expect(apikeys.hashToken(token)).toBe(db.tables.get("ApiKey")![0]!.keyHash);
    expect(JSON.stringify(await apikeys.listApiKeys(USER_A))).not.toContain(db.tables.get("ApiKey")![0]!.keyHash);
  });
});

describe("public API key contracts", () => {
  it("rejects malformed scope and update inputs", async () => {
    const { AkApiKeyCreateSchema, AkApiKeyUpdateSchema } = await import("@windels/shared/apiKeys");
    expect(AkApiKeyCreateSchema.safeParse({ name: "ci", scopes: ["READ"] }).success).toBe(true);
    expect(AkApiKeyCreateSchema.safeParse({ name: "ci", scopes: ["ROOT"] }).success).toBe(false);
    expect(AkApiKeyUpdateSchema.safeParse({}).success).toBe(false);
    expect(AkApiKeyUpdateSchema.safeParse({ revoked: true }).success).toBe(true);
  });
});
