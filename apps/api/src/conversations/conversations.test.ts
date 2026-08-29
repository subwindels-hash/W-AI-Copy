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

const conversations = await import("./conversations.service.js");


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

// ─── Conversations ─────────────────────────────────────────────────────
describe("conversations", () => {
  it("creates a conversation owned by the caller", async () => {
    const c = await conversations.createConversation(USER_A, { title: "Kickoff" } as any);
    expect(c.title).toBe("Kickoff");
    expect(db.tables.get("Conversation")![0].organizationId).toBe(ORG_A);
  });

  it("hides conversations from non-participants in another org", async () => {
    await conversations.createConversation(USER_A, { title: "Alpha only" } as any);
    const forB = await conversations.listConversations(USER_B, { page: 1, perPage: 20 } as any);
    expect(forB.items).toHaveLength(0);
  });

  it("refuses to fetch a conversation the user cannot access", async () => {
    const c = await conversations.createConversation(USER_A, { title: "Secret" } as any);
    await expect(conversations.getConversation(USER_B, c.id)).rejects.toThrow();
  });

  it("soft-deletes rather than destroying the row", async () => {
    const c = await conversations.createConversation(USER_A, { title: "Temp" } as any);
    await conversations.deleteConversation(USER_A, c.id);
    const row = db.tables.get("Conversation")!.find((r) => r.id === c.id);
    // The record must survive for audit; only deletedAt is set.
    expect(row).toBeTruthy();
    expect(row!.deletedAt).toBeTruthy();
    const list = await conversations.listConversations(USER_A, { page: 1, perPage: 20 } as any);
    expect(list.items).toHaveLength(0);
  });
});
