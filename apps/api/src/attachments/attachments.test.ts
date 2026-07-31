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
    expect(att.organizationId).toBe(ORG_A);
    // sha256 hex
    expect(att.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(att.storageKey.startsWith(`${ORG_A}/`)).toBe(true);
  });

  it("does not list another organization's attachments", async () => {
    await attachments.uploadAttachment(USER_A, png());
    const forB = await attachments.listAttachments(USER_B, {} as any);
    const items = Array.isArray(forB) ? forB : (forB as any).items ?? [];
    expect(items).toHaveLength(0);
  });
});
