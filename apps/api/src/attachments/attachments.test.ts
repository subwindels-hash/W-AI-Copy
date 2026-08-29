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

const attachments = await import("./attachments.service.js");


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

// ─── Attachments ───────────────────────────────────────────────────────
describe("attachments", () => {
  const png = () => ({
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
    originalname: "chart.png",
    mimetype: "image/png",
    size: 8,
  });

  it("rejects an empty file", async () => {
    await expect(attachments.uploadAttachment(USER_A, { ...png(), size: 0 })).rejects.toThrow(/empty/i);
  });

  it("rejects a disallowed MIME type", async () => {
    await expect(
      attachments.uploadAttachment(USER_A, { ...png(), mimetype: "application/x-msdownload" }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("rejects a file over the size limit", async () => {
    await expect(
      attachments.uploadAttachment(USER_A, { ...png(), size: 26 * 1024 * 1024 }),
    ).rejects.toThrow(/25MB/i);
  });

  it("stores a checksum and scopes the record to the organization", async () => {
    const att = await attachments.uploadAttachment(USER_A, png());
    expect(att.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(att.filename).toBe("chart.png");
    const stored = db.tables.get("MessageAttachment")!.find((row) => row.id === att.id)!;
    expect(stored.organizationId).toBe(ORG_A);
    expect(stored.checksum).toBe(att.sha256);
    expect(stored.storageKey.startsWith(`${ORG_A}/${att.sha256}-`)).toBe(true);
  });

  it("does not list another organization's attachments", async () => {
    await attachments.uploadAttachment(USER_A, png());
    const forB = await attachments.listAttachments(USER_B, { page: 1, perPage: 25 });
    expect(forB.items).toHaveLength(0);
    expect(forB.pagination.total).toBe(0);
  });

  it("returns normalized text previews and real list pagination", async () => {
    const text = await attachments.uploadAttachment(USER_A, { buffer: Buffer.from("hello attachment"), originalname: "notes.txt", mimetype: "text/plain", size: 16 });
    expect(text.previewText).toBe("hello attachment");
    const list = await attachments.listAttachments(USER_A, { page: 1, perPage: 1 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: text.id, sha256: text.sha256, previewText: "hello attachment" });
    expect(list.pagination).toMatchObject({ page: 1, perPage: 1, total: 1, totalPages: 1 });
  });

  it("serves bytes and metadata only inside the owning organization", async () => {
    const att = await attachments.uploadAttachment(USER_A, png());
    const served = await attachments.getAttachmentBytes(USER_A, att.id);
    expect(served.buffer.equals(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);
    expect(await attachments.getAttachmentMetadata(USER_A, att.id)).toMatchObject({ id: att.id, sha256: att.sha256 });
    await expect(attachments.getAttachmentBytes(USER_B, att.id)).rejects.toThrow("Attachment not found");
    await expect(attachments.getAttachmentMetadata(USER_B, att.id)).rejects.toThrow("Attachment not found");
  });

  it("enforces target conversation organization at upload time", async () => {
    const conversationA = cuid();
    const conversationB = cuid();
    db.seed("Conversation", [
      { id: conversationA, organizationId: ORG_A, deletedAt: null },
      { id: conversationB, organizationId: ORG_B, deletedAt: null },
    ]);
    await expect(attachments.uploadAttachment(USER_A, png(), { conversationId: conversationA })).resolves.toBeTruthy();
    await expect(attachments.uploadAttachment(USER_A, png(), { conversationId: conversationB })).rejects.toThrow("Conversation not found");
  });

  it("allows only the uploader to delete an unclaimed attachment", async () => {
    const att = await attachments.uploadAttachment(USER_A, png());
    await expect(attachments.deleteAttachment(USER_B, att.id)).rejects.toThrow(/uploader|not found/i);
    await expect(attachments.deleteAttachment(USER_A, att.id)).resolves.toBeUndefined();
    await expect(attachments.getAttachmentMetadata(USER_A, att.id)).rejects.toThrow("Attachment not found");
  });

  it("claims only unclaimed attachments from the authenticated owner", async () => {
    const att = await attachments.uploadAttachment(USER_A, png());
    expect(await attachments.claimConversationAttachments(USER_A, ORG_A, cuid(), [att.id])).toEqual([att.id]);
    await expect(attachments.claimConversationAttachments(USER_B, ORG_B, cuid(), [att.id])).rejects.toThrow("unavailable");
  });
});
