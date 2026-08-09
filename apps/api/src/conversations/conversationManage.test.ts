/**
 * Session — conversation-management (sidebar) operations.
 *
 * Covers the state transitions the sidebar exposes — rename, pin, unpin,
 * archive, unarchive — plus share-link creation, access-control tiers,
 * password protection, expiry and revocation. Everything runs on FakePrisma
 * with the audit service stubbed, so no database and no Redis are required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("../audit/audit.service.js", () => ({
  auditService: { log: vi.fn(async () => undefined), logFromRequest: vi.fn(async () => undefined) },
}));

const manage = await import("./conversationManage.service.js");
const conversations = await import("./conversations.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";
const USER_C = "user-carol";

function seedTenants() {
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_C, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("User", [
    { id: USER_A, email: "alpha@example.com" },
    { id: USER_C, email: "carol@example.com" },
    { id: USER_B, email: "beta@example.com" },
  ]);
  db.seed("UserProfile", [{ id: cuid(), userId: USER_A, displayName: "Alpha Owner" }]);
}

async function makeConv(by: string, title: string) {
  return conversations.createConversation(by, { title } as any);
}

function addMessage(conversationId: string, content: string, role = "USER") {
  db.seed("Message", [
    { id: cuid(), conversationId, role, content, status: "COMPLETED", userId: USER_A, createdAt: new Date(1_000) },
  ]);
}

beforeEach(() => {
  db.reset();
  seedTenants();
});

// ─── Rename ─────────────────────────────────────────────────────────────
describe("rename", () => {
  it("renames and preserves the conversation id", async () => {
    const c = await makeConv(USER_A, "New Chat");
    const renamed = await manage.renameConversation(USER_A, c.id, "  WINDELS Trading Strategy Discussion  ");
    expect(renamed.id).toBe(c.id);
    expect(renamed.title).toBe("WINDELS Trading Strategy Discussion");
    const row = db.tables.get("Conversation")!.find((r) => r.id === c.id)!;
    expect(row.title).toBe("WINDELS Trading Strategy Discussion");
  });

  it("rejects empty and over-long titles", async () => {
    const c = await makeConv(USER_A, "New Chat");
    await expect(manage.renameConversation(USER_A, c.id, "   ")).rejects.toThrow();
    await expect(manage.renameConversation(USER_A, c.id, "x".repeat(201))).rejects.toThrow();
  });

  it("denies rename to a non-participant", async () => {
    const c = await makeConv(USER_A, "Secret");
    await expect(manage.renameConversation(USER_B, c.id, "Hijack")).rejects.toThrow();
  });
});

// ─── Pin / Unpin ────────────────────────────────────────────────────────
describe("pin", () => {
  it("pins and unpins without destroying the conversation", async () => {
    const c = await makeConv(USER_A, "Business Strategy");
    await manage.pinConversation(USER_A, c.id);
    let row = db.tables.get("Conversation")!.find((r) => r.id === c.id)!;
    expect(row.pinned).toBe(true);
    expect(row.pinnedAt).toBeTruthy();

    await manage.unpinConversation(USER_A, c.id);
    row = db.tables.get("Conversation")!.find((r) => r.id === c.id)!;
    expect(row.pinned).toBe(false);
    expect(row.pinnedAt).toBeNull();
    expect(row.deletedAt).toBeFalsy(); // unpin must not delete
  });
});

// ─── Archive / Unarchive ────────────────────────────────────────────────
describe("archive", () => {
  it("archives (moves out of the active list) and unarchives", async () => {
    const c = await makeConv(USER_A, "Old project");
    addMessage(c.id, "important context");
    await manage.archiveConversation(USER_A, c.id);

    const active = await conversations.listConversations(USER_A, { page: 1, perPage: 20 } as any);
    expect(active.items).toHaveLength(0); // gone from active list

    const archived = await conversations.listConversations(USER_A, { page: 1, perPage: 20, archived: "true" } as any);
    expect(archived.items).toHaveLength(1);
    expect(archived.items[0]!.isArchived).toBe(true);
    expect(archived.items[0]!.archivedAt).toBeTruthy();

    // Messages preserved.
    const messages = db.tables.get("Message")!.filter((m) => m.conversationId === c.id);
    expect(messages).toHaveLength(1);

    await manage.unarchiveConversation(USER_A, c.id);
    const activeAfter = await conversations.listConversations(USER_A, { page: 1, perPage: 20 } as any);
    expect(activeAfter.items).toHaveLength(1);
    expect(activeAfter.items[0]!.isArchived).toBe(false);
  });
});

// ─── Sharing ────────────────────────────────────────────────────────────
describe("share", () => {
  it("creates a share with an unguessable token and url", async () => {
    const c = await makeConv(USER_A, "Shared plan");
    const share = await manage.createShare(USER_A, c.id, { access: "anyone_with_link", permissions: "view" } as any);
    expect(share.token).toBeTruthy();
    expect(share.token.length).toBeGreaterThanOrEqual(20);
    expect(share.url).toContain(share.token);
    expect(share.hasPassword).toBe(false);
  });

  it("restricts organization shares to org members", async () => {
    const c = await makeConv(USER_A, "Org only");
    addMessage(c.id, "hello world");
    const share = await manage.createShare(USER_A, c.id, { access: "organization" } as any);
    const viewForC = await manage.resolveShare(share.token, {}, { id: USER_C, email: "carol@example.com", organizationId: ORG_A } as any);
    expect(viewForC.title).toBe("Org only");
    expect(viewForC.messages.length).toBeGreaterThan(0);
    await expect(
      manage.resolveShare(share.token, {}, { id: USER_B, email: "beta@example.com", organizationId: ORG_B } as any)
    ).rejects.toThrow();
  });

  it("resolves anyone_with_link anonymously", async () => {
    const c = await makeConv(USER_A, "Public");
    const share = await manage.createShare(USER_A, c.id, { access: "anyone_with_link" } as any);
    const view = await manage.resolveShare(share.token, {}, undefined);
    expect(view.title).toBe("Public");
    expect(view.ownerName).toBe("Alpha Owner");
  });

  it("enforces a password when set", async () => {
    const c = await makeConv(USER_A, "Secret");
    const share = await manage.createShare(USER_A, c.id, { access: "anyone_with_link", password: "hunter2" } as any);
    await expect(manage.resolveShare(share.token, {})).rejects.toThrow();
    const ok = await manage.resolveShare(share.token, { password: "hunter2" }, undefined);
    expect(ok.title).toBe("Secret");
  });

  it("blocks revoked and expired links", async () => {
    const c = await makeConv(USER_A, "Temporary");
    const share = await manage.createShare(USER_A, c.id, { access: "anyone_with_link" } as any);
    await manage.revokeShare(USER_A, c.id, share.id);
    await expect(manage.resolveShare(share.token, {})).rejects.toThrow();

    const c2 = await makeConv(USER_A, "Expiring");
    const share2 = await manage.createShare(USER_A, c2.id, { access: "anyone_with_link", expiresAt: new Date(Date.now() - 1000).toISOString() } as any);
    await expect(manage.resolveShare(share2.token, {})).rejects.toThrow();
  });

  it("supports specific-user access and denies others", async () => {
    const c = await makeConv(USER_A, "Named");
    const share = await manage.createShare(USER_A, c.id, {
      access: "specific",
      allowed: ["carol@example.com"],
    } as any);
    const ok = await manage.resolveShare(share.token, {}, { id: USER_C, email: "carol@example.com", organizationId: ORG_A } as any);
    expect(ok.title).toBe("Named");
    await expect(
      manage.resolveShare(share.token, {}, { id: "someone-else", email: "x@y.z", organizationId: ORG_A } as any)
    ).rejects.toThrow();
  });

  it("records access and increments the counter", async () => {
    const c = await makeConv(USER_A, "Tracked");
    const share = await manage.createShare(USER_A, c.id, { access: "anyone_with_link" } as any);
    await manage.resolveShare(share.token, {}, undefined);
    await manage.resolveShare(share.token, {}, undefined);
    const row = db.tables.get("ConversationShare")!.find((r) => r.id === share.id)!;
    expect(row.accessCount).toBe(2);
    const log = db.tables.get("ConversationShareAccess")!.filter((r) => r.shareId === share.id);
    expect(log.length).toBe(2);
    expect(log.every((l) => l.granted)).toBe(true);
  });

  it("permanently deletes a share", async () => {
    const c = await makeConv(USER_A, "Gone");
    const share = await manage.createShare(USER_A, c.id, { access: "anyone_with_link" } as any);
    await manage.deleteShare(USER_A, c.id, share.id);
    const remaining = db.tables.get("ConversationShare")!.filter((r) => r.id === share.id);
    expect(remaining).toHaveLength(0);
    await expect(manage.resolveShare(share.token, {})).rejects.toThrow();
  });
});

// ─── Permanent delete ───────────────────────────────────────────────────
describe("purge", () => {
  it("only the creator can permanently delete", async () => {
    const c = await makeConv(USER_A, "Doomed");
    await expect(manage.purgeConversation(USER_B, c.id)).rejects.toThrow();
    const result = await manage.purgeConversation(USER_A, c.id);
    expect(result.permanent).toBe(true);
    expect(db.tables.get("Conversation")!.find((r) => r.id === c.id)).toBeUndefined();
    // Messages are removed by the database-level cascade; FakePrisma does not
    // model FK cascades, so no row-level message assertion is made here.
  });

  it("purges a conversation that was already soft-deleted", async () => {
    const c = await makeConv(USER_A, "Soft then purged");
    await conversations.deleteConversation(USER_A, c.id); // soft delete
    const result = await manage.purgeConversation(USER_A, c.id);
    expect(result.permanent).toBe(true);
    expect(db.tables.get("Conversation")!.find((r) => r.id === c.id)).toBeUndefined();
  });
});
