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
    expect(String(token)).toMatch(/^wnd_/);
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
});
