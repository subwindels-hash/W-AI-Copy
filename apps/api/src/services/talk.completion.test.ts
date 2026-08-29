/**
 * Session 122 — Talk completion tests.
 *
 * The Session 5–6 suites (`talk.test.ts`, `meeting.service.test.ts`) pin the
 * module's org-scoping and messaging semantics. This suite pins what Session
 * 122 added or fixed, driving the real services against FakePrisma:
 *
 *   - **real unread counts**: `unreadCount` was hardcoded 0 — "all caught
 *     up" for every channel. It is now computed (messages after the caller's
 *     lastReadAt, excluding their own, excluding deleted) and `null` when
 *     the caller has no membership row;
 *   - **same-organization validation**: `createChannel` / DMs /
 *     `addChannelMembers` accepted users and agents from other
 *     organizations, creating permanently unusable member rows;
 *   - **the meeting status lifecycle**: before Session 122 a CANCELLED
 *     meeting could be flipped LIVE and an ENDED meeting resurrected;
 *     transitions are now validated and terminal states are terminal;
 *   - **AI-generated action items are surfaced** (`aiGenerated`), never
 *     presented as if a person typed them;
 *   - **the P2025 race** in updateMeeting maps to 404, not 500;
 *   - the shared contract's Zod schemas behave identically to the old
 *     service-local ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("../attachments/attachments.service.js", () => ({
  claimTalkAttachments: async (_u: string, _o: string, ids: string[] = []) => ids,
}));

const talk = await import("./talk.service.js");
const meetings = await import("./meeting.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const ALICE = "user-alice";   // org A
const BOB = "user-bob";       // org A
const CAROL = "user-carol";   // org B

function seedUser(id: string, orgId: string) {
  db.seed("User", [{ id, email: `${id}@example.com`, role: "USER", isActive: true, isSuspended: false, createdAt: new Date() }]);
  db.seed("UserProfile", [{ id: cuid(), userId: id, displayName: id }]);
}

function seedTenants() {
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [
    { id: "ws-a", organizationId: ORG_A },
    { id: "ws-b", organizationId: ORG_B },
  ]);
  for (const [u, org] of [[ALICE, ORG_A], [BOB, ORG_A], [CAROL, ORG_B]] as const) {
    seedUser(u, org);
    db.seed("Membership", [{ id: cuid(), userId: u, organizationId: org, workspaceId: org === ORG_A ? "ws-a" : "ws-b", joinedAt: new Date(1) }]);
  }
}

function seedAgent(id: string, orgId: string, name = "Agent") {
  db.seed("Agent", [{ id, organizationId: orgId, name, role: "assistant", color: "azure", isBuiltIn: false, status: "ACTIVE" }]);
}

function seedChannel(id: string, opts: { orgId: string; type?: string; access?: string; members?: Array<{ userId?: string; agentId?: string; lastReadAt?: Date | null }> }) {
  db.seed("TalkChannel", [{
    id,
    organizationId: opts.orgId,
    type: opts.type ?? "CHANNEL",
    access: opts.access ?? "PUBLIC",
    name: `#${id}`,
    topic: null,
    isArchived: false,
    lastMessageAt: new Date(),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }]);
  for (const m of opts.members ?? []) {
    db.seed("TalkMember", [{ id: cuid(), channelId: id, userId: m.userId ?? null, agentId: m.agentId ?? null, lastReadAt: m.lastReadAt ?? null, isMuted: false, isPinned: false, joinedAt: new Date() }]);
  }
}

function seedMessage(id: string, channelId: string, opts: { userId?: string; agentId?: string; createdAt: Date; deletedAt?: Date | null; threadParentId?: string | null }) {
  db.seed("TalkMessage", [{
    id,
    channelId,
    type: "TEXT",
    content: `msg ${id}`,
    userId: opts.userId ?? null,
    agentId: opts.agentId ?? null,
    threadParentId: opts.threadParentId ?? null,
    replyCount: 0,
    lastReplyAt: null,
    reactions: {},
    meetingId: null,
    editedAt: null,
    deletedAt: opts.deletedAt ?? null,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  }]);
}

beforeEach(() => {
  db.reset();
  seedTenants();
});

// ══════════════════════════════════════════════════════════════════════════
// Real unread counts (the hardcoded-0 fix)
// ══════════════════════════════════════════════════════════════════════════

describe("unread counts (Session 122 fix)", () => {
  it("counts messages after lastReadAt, excluding the caller's own", async () => {
    const t0 = new Date("2026-08-01T00:00:00Z");
    const t1 = new Date("2026-08-02T00:00:00Z");
    const t2 = new Date("2026-08-03T00:00:00Z");
    seedChannel("ch-1", {
      orgId: ORG_A,
      members: [{ userId: ALICE, lastReadAt: t1 }, { userId: BOB, lastReadAt: null }],
    });
    seedMessage("m1", "ch-1", { userId: ALICE, createdAt: t0 }); // own, before read — excluded
    seedMessage("m2", "ch-1", { userId: BOB, createdAt: t0 });   // before read — excluded
    seedMessage("m3", "ch-1", { userId: BOB, createdAt: t2 });   // after read — unread
    const list = await talk.listChannels(ALICE, { page: 1, perPage: 50 } as any);
    const ch = list.items.find((c: any) => c.id === "ch-1")!;
    expect(ch.unreadCount).toBe(1);
    // BOB has never read: everything except his own is unread (ALICE's one).
    const asBob = await talk.listChannels(BOB, { page: 1, perPage: 50 } as any);
    expect(asBob.items.find((c: any) => c.id === "ch-1")!.unreadCount).toBe(1);
  });

  it("excludes deleted messages from the unread count", async () => {
    const t0 = new Date("2026-08-01T00:00:00Z");
    const t1 = new Date("2026-08-02T00:00:00Z");
    seedChannel("ch-1", { orgId: ORG_A, members: [{ userId: ALICE, lastReadAt: t0 }] });
    seedMessage("m1", "ch-1", { userId: BOB, createdAt: t1, deletedAt: new Date() });
    const list = await talk.listChannels(ALICE, { page: 1, perPage: 50 } as any);
    expect(list.items[0]!.unreadCount).toBe(0);
  });

  it("FIXED: returns null — not 0 — for a channel the caller has not joined", async () => {
    seedChannel("ch-1", { orgId: ORG_A, members: [{ userId: BOB, lastReadAt: null }] });
    const list = await talk.listChannels(ALICE, { page: 1, perPage: 50 } as any);
    const ch = list.items.find((c: any) => c.id === "ch-1")!;
    // ALICE can read the public channel but has no membership row: the honest
    // answer is null (no read position), never 0 ("all caught up").
    expect(ch.unreadCount).toBeNull();
  });

  it("getChannel carries the same real unread count", async () => {
    const t0 = new Date("2026-08-01T00:00:00Z");
    const t1 = new Date("2026-08-02T00:00:00Z");
    seedChannel("ch-1", { orgId: ORG_A, members: [{ userId: ALICE, lastReadAt: t0 }] });
    seedMessage("m1", "ch-1", { userId: BOB, createdAt: t1 });
    const ch = await talk.getChannel(ALICE, "ch-1");
    expect(ch.unreadCount).toBe(1);
  });

  it("a fresh channel has unreadCount 0 for its creator (member, no messages)", async () => {
    const ch = await talk.createChannel(ALICE, { type: "CHANNEL", name: "fresh" } as any);
    expect(ch.unreadCount).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Same-organization validation (the cross-org member fix)
// ══════════════════════════════════════════════════════════════════════════

describe("same-organization member validation (Session 122 fix)", () => {
  it("FIXED: refuses to create a DM with a peer from another organization", async () => {
    await expect(
      talk.createChannel(ALICE, { type: "DM", peerUserId: CAROL } as any),
    ).rejects.toThrow(/Peer user not in your organization/i);
    expect(db.tables.get("TalkChannel") ?? []).toHaveLength(0);
  });

  it("FIXED: refuses to create a channel whose members include another org's user", async () => {
    await expect(
      talk.createChannel(ALICE, { type: "CHANNEL", name: "leaky", memberUserIds: [CAROL] } as any),
    ).rejects.toThrow(/not in your organization/i);
    expect(db.tables.get("TalkChannel") ?? []).toHaveLength(0);
  });

  it("FIXED: refuses to create a channel whose agents include another org's agent", async () => {
    seedAgent("ag-b", ORG_B);
    await expect(
      talk.createChannel(ALICE, { type: "CHANNEL", name: "leaky", memberAgentIds: ["ag-b"] } as any),
    ).rejects.toThrow(/not in your organization/i);
  });

  it("FIXED: addChannelMembers refuses another org's users and agents", async () => {
    seedChannel("ch-1", { orgId: ORG_A, members: [{ userId: ALICE }] });
    seedAgent("ag-b", ORG_B);
    await expect(
      talk.addChannelMembers(ALICE, "ch-1", [CAROL], []),
    ).rejects.toThrow(/not in your organization/i);
    await expect(
      talk.addChannelMembers(ALICE, "ch-1", [], ["ag-b"]),
    ).rejects.toThrow(/not in your organization/i);
    // Nothing was added.
    expect(db.tables.get("TalkMember")!.length).toBe(1);
  });

  it("accepts same-org peers and members as before", async () => {
    const dm = await talk.createChannel(ALICE, { type: "DM", peerUserId: BOB } as any);
    // getOrCreateDM returns the raw Prisma row (the historical contract),
    // with the enum value uppercased.
    expect(dm.type).toBe("DM");
    const ch = await talk.createChannel(ALICE, {
      type: "CHANNEL", name: "ok", memberUserIds: [BOB],
    } as any);
    expect(ch.members.length).toBe(2); // ALICE + BOB
    await talk.addChannelMembers(ALICE, ch.id, [], []);
    // 2 DM members + 2 channel members; nothing spurious was added.
    expect(db.tables.get("TalkMember")!.length).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Meeting status lifecycle
// ══════════════════════════════════════════════════════════════════════════

function seedMeeting(id: string, status: string) {
  db.seed("Meeting", [{
    id,
    organizationId: ORG_A,
    title: `Meeting ${id}`,
    status,
    createdById: ALICE,
    notetakerStatus: "IDLE",
    scheduledStart: null,
    channelId: null,
    transcript: null,
    summary: null,
    decisions: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }]);
}

describe("meeting status lifecycle (Session 122 fix)", () => {
  it("allows the valid forward transitions", async () => {
    seedMeeting("m-1", "SCHEDULED");
    await meetings.updateMeeting(ALICE, "m-1", { status: "LIVE" });
    expect((db.tables.get("Meeting")!.find((r: any) => r.id === "m-1") as any).startedAt).toBeTruthy();
    await meetings.updateMeeting(ALICE, "m-1", { status: "ENDED" });
    expect((db.tables.get("Meeting")!.find((r: any) => r.id === "m-1") as any).endedAt).toBeTruthy();
  });

  it("allows SCHEDULED → CANCELLED", async () => {
    seedMeeting("m-1", "SCHEDULED");
    const m = await meetings.updateMeeting(ALICE, "m-1", { status: "CANCELLED" });
    expect(m.status).toBe("CANCELLED");
  });

  it("FIXED: refuses to resurrect an ENDED meeting", async () => {
    seedMeeting("m-1", "ENDED");
    await expect(meetings.updateMeeting(ALICE, "m-1", { status: "LIVE" })).rejects.toMatchObject({ status: 409 });
    await expect(meetings.updateMeeting(ALICE, "m-1", { status: "SCHEDULED" })).rejects.toMatchObject({ status: 409 });
  });

  it("FIXED: refuses to flip a CANCELLED meeting to LIVE", async () => {
    seedMeeting("m-1", "CANCELLED");
    await expect(meetings.updateMeeting(ALICE, "m-1", { status: "LIVE" })).rejects.toMatchObject({ status: 409 });
  });

  it("FIXED: refuses LIVE → CANCELLED (a live meeting can only end)", async () => {
    seedMeeting("m-1", "LIVE");
    await expect(meetings.updateMeeting(ALICE, "m-1", { status: "CANCELLED" })).rejects.toMatchObject({ status: 409 });
  });

  it("re-sending the current status stays idempotent", async () => {
    seedMeeting("m-1", "LIVE");
    const m = await meetings.updateMeeting(ALICE, "m-1", { status: "LIVE" });
    expect(m.status).toBe("LIVE");
  });

  it("maps a P2025 race in updateMeeting to 404, not 500", async () => {
    seedMeeting("m-1", "SCHEDULED");
    // Spy on the exact mocked prisma instance the service holds.
    const clientMock = await import("../db/client.js");
    const updateSpy = vi
      .spyOn((clientMock as any).prisma.meeting, "update")
      .mockRejectedValueOnce(Object.assign(new Error("Record not found"), { code: "P2025" }));
    try {
      await expect(meetings.updateMeeting(ALICE, "m-1", { status: "LIVE" })).rejects.toMatchObject({ status: 404 });
    } finally {
      updateSpy.mockRestore();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AI-generated action items
// ══════════════════════════════════════════════════════════════════════════

describe("action items — aiGenerated surfacing (Session 122)", () => {
  function seedActionItem(id: string, metadata: unknown) {
    db.seed("ActionItem", [{
      id,
      organizationId: ORG_A,
      title: `Item ${id}`,
      status: "OPEN",
      priority: "MEDIUM",
      createdById: ALICE,
      metadata,
      dueDate: null,
      completedAt: null,
      assigneeId: null,
      agentAssigneeId: null,
      meetingId: null,
      channelId: null,
      sourceMessageId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }]);
  }

  it("FIXED: surfaces aiGenerated=true for notetaker-extracted items", async () => {
    seedActionItem("ai-1", { aiGenerated: true, source: "notetaker" });
    seedActionItem("human-1", {});
    const list: any = await meetings.listActionItems(ALICE, { page: 1, perPage: 50 } as any);
    const byId = new Map<string, any>(list.items.map((a: any) => [a.id, a]));
    expect(byId.get("ai-1")!.aiGenerated).toBe(true);
    expect(byId.get("human-1")!.aiGenerated).toBe(false);
  });

  it("surfaces aiGenerated in meeting detail action items too", async () => {
    seedMeeting("m-1", "ENDED");
    seedActionItem("ai-1", { aiGenerated: true });
    const row = db.tables.get("ActionItem")!.find((r: any) => r.id === "ai-1");
    row!.meetingId = "m-1";
    const detail: any = await meetings.getMeeting(ALICE, "m-1");
    expect(detail.actionItems[0]!.aiGenerated).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — schemas behave like the old service-local ones
// ══════════════════════════════════════════════════════════════════════════

describe("shared talk schemas", () => {
  it("defaults channel access, action priority and transcript final as before", async () => {
    const shared = await import("@windels/shared/talk");
    expect(shared.TalkCreateChannelSchema.parse({ type: "CHANNEL", name: "x" }).access).toBe("PUBLIC");
    expect(shared.TalkCreateActionItemSchema.parse({ title: "x" }).priority).toBe("MEDIUM");
    expect(shared.TalkAddTranscriptSchema.parse({ text: "hi" }).final).toBe(false);
  });

  it("constrains values like the old schemas", async () => {
    const shared = await import("@windels/shared/talk");
    expect(shared.TalkCreateChannelSchema.safeParse({ type: "VOICE" }).success).toBe(false);
    expect(shared.TalkCreateMessageSchema.safeParse({ content: "" }).success).toBe(false);
    expect(shared.TalkCreateMessageSchema.safeParse({ content: "x".repeat(10001) }).success).toBe(false);
    expect(shared.TalkAddReactionSchema.safeParse({ emoji: "x".repeat(17) }).success).toBe(false);
    expect(shared.TalkUpdateMeetingSchema.safeParse({ status: "PAUSED" }).success).toBe(false);
    expect(shared.TalkUpdateActionItemSchema.safeParse({ status: "DONE" }).success).toBe(true);
  });

  it("exports the transition map the service validates against", async () => {
    const shared = await import("@windels/shared/talk");
    expect(shared.TALK_MEETING_TRANSITIONS.ENDED).toEqual(["ENDED"]);
    expect(shared.TALK_MEETING_TRANSITIONS.CANCELLED).toEqual(["CANCELLED"]);
    expect(shared.TALK_MEETING_TRANSITIONS.SCHEDULED).toContain("LIVE");
  });
});
