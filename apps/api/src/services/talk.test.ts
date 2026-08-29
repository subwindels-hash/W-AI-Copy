/**
 * Windels Talk (Sessions 5–6) — access control and messaging semantics.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `talk.service.ts` is ~1000 lines of channel/DM/message/reaction logic and the
 * module inventory reported `tests=0` — the largest untested service in the
 * repo. It is also an authorization surface: every function decides who may
 * read a conversation, who may edit or delete a message, and which
 * organization's data is visible.
 *
 * The properties pinned here are the ones whose failure would be a security
 * incident rather than a bug report:
 *
 *   - cross-organization isolation (a channel in org B is invisible to org A)
 *   - private channels require explicit membership
 *   - public channels are readable org-wide, as designed
 *   - only the author may edit or delete a message
 *   - deletion is a redacting soft-delete, not a hard delete
 *   - thread replies must belong to the same channel
 *
 * The service is a pure Prisma consumer, so it runs against `FakePrisma` with
 * no database, following the pattern established by the agents/conversations
 * suites.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
// Attachment claiming reaches its own service + storage; Talk's contract is
// simply "pass through whatever was claimed".
vi.mock("../attachments/attachments.service.js", () => ({
  claimTalkAttachments: async (_u: string, _o: string, ids: string[] = []) => ids,
}));

const talk = await import("./talk.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const ALICE = "user-alice";   // org A
const BOB = "user-bob";       // org A
const CAROL = "user-carol";   // org B

function seedTenants() {
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [
    { id: "ws-a", organizationId: ORG_A },
    { id: "ws-b", organizationId: ORG_B },
  ]);
  db.seed("Membership", [
    { id: cuid(), userId: ALICE, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: BOB, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: CAROL, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("User", [
    { id: ALICE, email: "alice@a.test" },
    { id: BOB, email: "bob@a.test" },
    { id: CAROL, email: "carol@b.test" },
  ]);
}

/** Create a channel row directly, with the given members. */
function seedChannel(opts: {
  id: string;
  organizationId: string;
  access: "PUBLIC" | "PRIVATE";
  memberUserIds?: string[];
  type?: "CHANNEL" | "DM";
}) {
  db.seed("TalkChannel", [{
    id: opts.id,
    organizationId: opts.organizationId,
    workspaceId: opts.organizationId === ORG_A ? "ws-a" : "ws-b",
    type: opts.type ?? "CHANNEL",
    access: opts.access,
    name: opts.id,
    createdById: opts.memberUserIds?.[0] ?? ALICE,
    createdAt: new Date(1),
  }]);
  for (const uid of opts.memberUserIds ?? []) {
    db.seed("TalkMember", [{
      id: cuid(), channelId: opts.id, userId: uid, agentId: null, joinedAt: new Date(1),
    }]);
  }
}

beforeEach(() => {
  db.reset();
  seedTenants();
});

describe("assertChannelAccess — tenancy", () => {
  it("hides a channel that belongs to another organization", async () => {
    seedChannel({ id: "ch-b", organizationId: ORG_B, access: "PUBLIC", memberUserIds: [CAROL] });
    // Alice is in org A; the channel is org B's. It must not merely be
    // forbidden, it must be invisible.
    await expect(talk.assertChannelAccess(ALICE, "ch-b")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("allows any member of the organization into a public channel", async () => {
    seedChannel({ id: "ch-pub", organizationId: ORG_A, access: "PUBLIC", memberUserIds: [ALICE] });
    // Bob is not an explicit member, but the channel is public within org A.
    const { channel } = await talk.assertChannelAccess(BOB, "ch-pub");
    expect(channel.id).toBe("ch-pub");
  });

  it("refuses a private channel to a non-member of the same organization", async () => {
    seedChannel({ id: "ch-priv", organizationId: ORG_A, access: "PRIVATE", memberUserIds: [ALICE] });
    await expect(talk.assertChannelAccess(BOB, "ch-priv")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("admits an explicit member of a private channel", async () => {
    seedChannel({ id: "ch-priv", organizationId: ORG_A, access: "PRIVATE", memberUserIds: [ALICE, BOB] });
    const { channel, member } = await talk.assertChannelAccess(BOB, "ch-priv");
    expect(channel.id).toBe("ch-priv");
    expect(member).not.toBeNull();
  });

  it("404s an unknown channel", async () => {
    await expect(talk.assertChannelAccess(ALICE, "nope")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a user with no organization membership", async () => {
    seedChannel({ id: "ch-pub", organizationId: ORG_A, access: "PUBLIC" });
    await expect(talk.assertChannelAccess("ghost-user", "ch-pub")).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("sendMessage", () => {
  beforeEach(() => {
    seedChannel({ id: "ch", organizationId: ORG_A, access: "PUBLIC", memberUserIds: [ALICE, BOB] });
  });

  it("stores a message attributed to the sender", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "hello team" } as any);
    expect(m.content).toBe("hello team");
    expect(m.userId ?? m.user?.id).toBe(ALICE);
  });

  it("refuses to post into another organization's channel", async () => {
    seedChannel({ id: "ch-b", organizationId: ORG_B, access: "PUBLIC", memberUserIds: [CAROL] });
    await expect(
      talk.sendMessage(ALICE, "ch-b", { content: "leak" } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to post into a private channel the user is not in", async () => {
    seedChannel({ id: "ch-priv", organizationId: ORG_A, access: "PRIVATE", memberUserIds: [ALICE] });
    await expect(
      talk.sendMessage(BOB, "ch-priv", { content: "intruding" } as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a thread parent from a different channel", async () => {
    seedChannel({ id: "ch2", organizationId: ORG_A, access: "PUBLIC", memberUserIds: [ALICE] });
    const parent = await talk.sendMessage(ALICE, "ch2", { content: "root" } as any);
    // Replying in "ch" to a parent that lives in "ch2" must not be allowed —
    // otherwise a thread could straddle two channels with different membership.
    await expect(
      talk.sendMessage(ALICE, "ch", { content: "reply", threadParentId: parent.id } as any),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("marks an agent-authored message as coming from the agent, not the user", async () => {
    db.seed("Agent", [{ id: "agent-1", organizationId: ORG_A, name: "Helper" }]);
    const m = await talk.sendMessage(ALICE, "ch", { content: "from bot" } as any, { agentId: "agent-1" });
    expect(m.agentId ?? m.agent?.id).toBe("agent-1");
    expect(m.userId ?? null).toBeNull();
  });
});

describe("editMessage / deleteMessage — ownership", () => {
  beforeEach(() => {
    seedChannel({ id: "ch", organizationId: ORG_A, access: "PUBLIC", memberUserIds: [ALICE, BOB] });
  });

  it("lets the author edit their own message", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "typo" } as any);
    const edited = await talk.editMessage(ALICE, m.id, { content: "fixed" } as any);
    expect(edited.content).toBe("fixed");
    expect(edited.editedAt).toBeTruthy();
  });

  it("stops a different user editing someone else's message", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "mine" } as any);
    await expect(
      talk.editMessage(BOB, m.id, { content: "hijacked" } as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("stops a different user deleting someone else's message", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "mine" } as any);
    await expect(talk.deleteMessage(BOB, m.id)).rejects.toMatchObject({ status: 403 });
  });

  it("soft-deletes and redacts content rather than dropping the row", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "sensitive" } as any);
    await talk.deleteMessage(ALICE, m.id);

    const row = (db.tables.get("TalkMessage") ?? []).find((r: any) => r.id === m.id);
    expect(row).toBeTruthy();            // row retained for audit
    expect(row!.deletedAt).toBeTruthy(); // marked deleted
    expect(row!.content).toBe("");       // content redacted
  });

  it("404s editing a message that does not exist", async () => {
    await expect(
      talk.editMessage(ALICE, "no-such-message", { content: "x" } as any),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("toggleReaction", () => {
  beforeEach(() => {
    seedChannel({ id: "ch", organizationId: ORG_A, access: "PUBLIC", memberUserIds: [ALICE, BOB] });
  });

  it("adds then removes the same reaction (toggle), keying by actor", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "react to me" } as any);

    const added = await talk.toggleReaction(BOB, m.id, "👍");
    expect(added["👍"]).toContain(`user:${BOB}`);

    const removed = await talk.toggleReaction(BOB, m.id, "👍");
    // Emoji key is dropped entirely once the last reactor leaves.
    expect(removed["👍"]).toBeUndefined();
  });

  it("keeps reactions from different users independent", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "hi" } as any);
    await talk.toggleReaction(ALICE, m.id, "🎉");
    const after = await talk.toggleReaction(BOB, m.id, "🎉");
    expect(after["🎉"]).toHaveLength(2);
  });

  it("refuses a reaction from outside the organization", async () => {
    const m = await talk.sendMessage(ALICE, "ch", { content: "hi" } as any);
    await expect(talk.toggleReaction(CAROL, m.id, "👍")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("input schemas", () => {
  it("requires message content to be non-empty", () => {
    const r = talk.CreateMessageSchema.safeParse({ content: "" });
    expect(r.success).toBe(false);
  });

  it("accepts a message with attachments and a thread parent", () => {
    const r = talk.CreateMessageSchema.safeParse({
      content: "see attached",
      attachmentIds: [cuid()],
      threadParentId: cuid(),
    });
    expect(r.success).toBe(true);
  });

  it("constrains channel type to the supported values", () => {
    expect(talk.CreateChannelSchema.safeParse({ name: "x", type: "SMOKE_SIGNAL" }).success).toBe(false);
    expect(talk.CreateChannelSchema.safeParse({ name: "x", type: "CHANNEL" }).success).toBe(true);
  });
});
