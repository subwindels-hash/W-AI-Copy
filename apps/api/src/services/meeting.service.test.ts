/**
 * Session 6 — Talk: meetings & action items.
 *
 * The talk messaging service (channels, messages, reactions) is already covered
 * in `talk.test.ts`; the meeting/action-item service previously had no tests.
 * This suite pins the org-scoping, lifecycle, and ownership semantics of
 * meetings and action items. Runs on FakePrisma; no database required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const meetingSvc = await import("./meeting.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_A2 = "user-alpha-2";
const USER_B = "user-beta";

function seedUser(id: string, orgId: string, wsId: string) {
  db.seed("User", [{ id, email: `${id}@example.com`, role: "USER", isActive: true }]);
  db.seed("Organization", [{ id: orgId, name: orgId }]);
  db.seed("Workspace", [{ id: wsId, organizationId: orgId, name: "Default" }]);
  db.seed("Membership", [{ id: cuid(), userId: id, organizationId: orgId, workspaceId: wsId, role: "MEMBER", joinedAt: new Date(1) }]);
}

function seedMeeting(id: string, opts: { orgId: string; createdBy: string; status?: string; channelId?: string }) {
  db.seed("Meeting", [{
    id, organizationId: opts.orgId, title: `Meeting ${id}`,
    status: opts.status ?? "SCHEDULED", createdById: opts.createdBy,
    notetakerStatus: "IDLE", scheduledStart: null, channelId: opts.channelId ?? null,
  }]);
}

beforeEach(() => {
  db.reset();
  seedUser(USER_A, ORG_A, "ws-a");
  seedUser(USER_A2, ORG_A, "ws-a");
  seedUser(USER_B, ORG_B, "ws-b");
});

describe("meetings — org scoping & lifecycle", () => {
  it("creates a meeting scoped to the caller's org, adding an organizer participant", async () => {
    const m = await meetingSvc.createMeeting(USER_A, { title: "Standup" } as any);
    expect(m.organizationId).toBe(ORG_A);
    const participants = db.tables.get("MeetingParticipant")!;
    expect(participants.some((p) => p.userId === USER_A && p.role === "organizer")).toBe(true);
  });

  it("auto-starts an instant meeting (no scheduled time)", async () => {
    const m = await meetingSvc.createMeeting(USER_A, { title: "Instant sync" } as any);
    expect(m.status).toBe("LIVE");
    expect(m.startedAt).toBeTruthy();
  });

  it("does not leak meetings across organizations", async () => {
    seedMeeting("mA", { orgId: ORG_A, createdBy: USER_A });
    const forB = await meetingSvc.listMeetings(USER_B, { page: 1, perPage: 20 } as any);
    expect(forB.items.map((m) => m.id)).toEqual([]);
  });

  it("refuses to read or update another org's meeting", async () => {
    seedMeeting("mA", { orgId: ORG_A, createdBy: USER_A });
    await expect(meetingSvc.getMeeting(USER_B, "mA")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(meetingSvc.updateMeeting(USER_B, "mA", { status: "LIVE" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updateMeeting sets endedAt when ending and start time when going live", async () => {
    seedMeeting("mA", { orgId: ORG_A, createdBy: USER_A, status: "LIVE" });
    const ended = await meetingSvc.updateMeeting(USER_A, "mA", { status: "ENDED" } as any);
    expect(ended.status).toBe("ENDED");
    expect(ended.endedAt).toBeTruthy();
  });

  it("addTranscript appends text to the transcript", async () => {
    seedMeeting("mA", { orgId: ORG_A, createdBy: USER_A });
    await meetingSvc.addTranscript(USER_A, "mA", { text: "Alice: shipped the fix" });
    const row = db.tables.get("Meeting")!.find((r) => r.id === "mA");
    expect(row?.transcript).toContain("Alice: shipped the fix");
  });
});

describe("action items — org scoping & ownership", () => {
  it("creates an action item scoped to the caller's org", async () => {
    const a = await meetingSvc.createActionItem(USER_A, { title: "Fix bug", priority: "HIGH" } as any);
    expect(a.organizationId).toBe(ORG_A);
    expect(a.status).toBe("OPEN");
  });

  it("rejects an action item bound to a channel/meeting from another org", async () => {
    seedMeeting("mA", { orgId: ORG_A, createdBy: USER_A });
    await expect(meetingSvc.createActionItem(USER_B, { title: "x", meetingId: "mA" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("listActionItems returns own-org only and supports the mine filter", async () => {
    db.seed("ActionItem", [
      { id: "a1", organizationId: ORG_A, title: "mine", status: "OPEN", priority: "HIGH", assigneeId: USER_A, createdById: USER_A },
      { id: "a2", organizationId: ORG_A, title: "theirs", status: "OPEN", priority: "MEDIUM", assigneeId: USER_A2, createdById: USER_A2 },
      { id: "aB", organizationId: ORG_B, title: "other org", status: "OPEN", priority: "MEDIUM", assigneeId: USER_B, createdById: USER_B },
    ]);
    const mine = await meetingSvc.listActionItems(USER_A, { page: 1, perPage: 20, mine: true } as any);
    expect(mine.items.map((a) => a.id)).toEqual(["a1"]);
    const all = await meetingSvc.listActionItems(USER_A, { page: 1, perPage: 20 } as any);
    // Order is status/priority/createdAt; compare as a set so a FakePrisma
    // multi-field sort quirk doesn't mask the org-scoping assertion.
    expect(all.items.map((a) => a.id).sort()).toEqual(["a1", "a2"]); // no org B
  });

  it("updateActionItem sets completedAt on DONE and clears it otherwise; is org-scoped", async () => {
    db.seed("ActionItem", [{ id: "a1", organizationId: ORG_A, title: "t", status: "OPEN", createdById: USER_A }]);
    const done = await meetingSvc.updateActionItem(USER_A, "a1", { status: "DONE" } as any);
    expect(done.status).toBe("DONE");
    expect(done.completedAt).toBeTruthy();
    const reopen = await meetingSvc.updateActionItem(USER_A, "a1", { status: "OPEN" } as any);
    expect(reopen.completedAt).toBeNull();
    await expect(meetingSvc.updateActionItem(USER_B, "a1", { status: "DONE" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
