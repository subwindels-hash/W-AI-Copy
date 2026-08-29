/**
 * Session 2/3 — Message service access control and validation.
 *
 * The full AI streaming happy path depends on a live AI provider (covered by the
 * Phase 6 runtime/integration checklist). These unit tests pin the deterministic
 * security and validation behaviour that must hold before any AI call:
 *   - listMessages / sendMessage reject a user who cannot access the conversation
 *   - a thread parent must belong to the same conversation
 *   - listMessages returns messages in ascending order with pagination
 * Runs on FakePrisma + the shared @prisma/client enum mock; no DB/AI required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const { sendMessage, listMessages } = await import("./message.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

function seedUser(id: string, orgId: string) {
  db.seed("User", [{ id, email: `${id}@example.com`, role: "USER", isActive: true }]);
  db.seed("Organization", [{ id: orgId, name: orgId }]);
  db.seed("Workspace", [{ id: `ws-${orgId}`, organizationId: orgId, name: "Default" }]);
  db.seed("Membership", [{ id: cuid(), userId: id, organizationId: orgId, workspaceId: `ws-${orgId}`, role: "MEMBER", joinedAt: new Date(1) }]);
}

function seedConversation(id: string, orgId: string, createdBy: string) {
  db.seed("Conversation", [{ id, organizationId: orgId, workspaceId: `ws-${orgId}`, title: "Conv", createdById: createdBy, status: "PENDING" }]);
  db.seed("ConversationParticipant", [{ id: cuid(), conversationId: id, userId: createdBy }]);
}

const noopWrite = () => {};

beforeEach(() => {
  db.reset();
  seedUser(USER_A, ORG_A);
  seedUser(USER_B, ORG_B);
});

describe("listMessages", () => {
  it("refuses a user from another org (or a non-participant)", async () => {
    seedConversation("c1", ORG_A, USER_A);
    await expect(listMessages(USER_B, "c1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns messages in ascending order with pagination for an accessible conversation", async () => {
    seedConversation("c1", ORG_A, USER_A);
    db.seed("Message", [
      { id: "m1", conversationId: "c1", role: "USER", content: "hi", status: "COMPLETED", userId: USER_A, createdAt: new Date(1) },
      { id: "m2", conversationId: "c1", role: "ASSISTANT", content: "hello", status: "COMPLETED", createdAt: new Date(2) },
    ]);
    const res = await listMessages(USER_A, "c1", { page: 1, perPage: 100 });
    expect(res.messages.map((m) => m.content)).toEqual(["hi", "hello"]);
    expect(res.pagination.total).toBe(2);
  });
});

describe("sendMessage — access control & validation (before AI)", () => {
  it("rejects a user with no access to the conversation", async () => {
    seedConversation("c1", ORG_A, USER_A);
    await expect(
      sendMessage(USER_B, "c1", { content: "hi" }, new AbortController().signal, noopWrite),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a thread parent that belongs to a different conversation", async () => {
    seedConversation("c1", ORG_A, USER_A);
    seedConversation("c2", ORG_A, USER_A);
    db.seed("Message", [{ id: "parent", conversationId: "c2", role: "USER", content: "orig", status: "COMPLETED", userId: USER_A, createdAt: new Date(1) }]);
    await expect(
      sendMessage(USER_A, "c1", { content: "reply", parentId: "parent" }, new AbortController().signal, noopWrite),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts a valid thread parent within the same conversation", async () => {
    seedConversation("c1", ORG_A, USER_A);
    db.seed("Message", [{ id: "parent", conversationId: "c1", role: "USER", content: "orig", status: "COMPLETED", userId: USER_A, createdAt: new Date(1) }]);
    // No error up to the point before the AI stream resolves a provider — this
    // proves the parent-validation path passed. (The Echo provider then streams;
    // we only assert it did not throw a validation error synchronously.)
    await expect(
      sendMessage(USER_A, "c1", { content: "reply", parentId: "parent" }, new AbortController().signal, noopWrite),
    ).resolves.toBeUndefined();
  });
});
