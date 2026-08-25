/**
 * Session 200 — Meetings Intelligence tests (first dedicated suite).
 *
 * collaboration's MeetingsService (324 SLOC) shipped untested (only
 * CanvasCollabService had a suite). It owns the live-meeting lifecycle,
 * transcripts, translation channels, action items / decisions / risks, honest
 * summary generation and write-through queueing. This suite exercises the real
 * service against the shared in-memory Redis fake.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { MeetingsService: MS } = await import("./meetings.service.js");

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

async function meeting(over: Record<string, any> = {}) {
  const c = await MS.registerConnector({ name: "Zoom", platform: "zoom", owner: "u1" });
  return MS.scheduleMeeting({ title: "Roadmap sync", platform: "zoom", connectorId: c.id, organizer: "u1", ...over });
}

describe("connectors", () => {
  it("registers a connector with default capabilities and lists it", async () => {
    const c = await MS.registerConnector({ name: "Teams", platform: "teams", owner: "u1" });
    expect(c.status).toBe("connected");
    expect(c.capabilities).toContain("transcription");
    expect((await MS.listConnectors()).map((x) => x.id)).toContain(c.id);
  });
});

describe("meeting lifecycle", () => {
  it("schedules a meeting with an auto-generated agenda and join URL", async () => {
    const m = await meeting();
    expect(m.status).toBe("scheduled");
    expect(m.joinUrl).toContain(m.id);
    expect(m.aiParticipantJoined).toBe(false);
    const agenda = await MS.listAgenda(m.id);
    expect(agenda.length).toBe(3); // kick-off, topic, action items
  });

  it("joins the AI participant and flips a scheduled meeting to live", async () => {
    const m = await meeting();
    const joined = await MS.joinAiParticipant(m.id);
    expect(joined?.aiParticipantJoined).toBe(true);
    expect(joined?.status).toBe("live");
    expect(await MS.joinAiParticipant("nope")).toBeNull();
  });

  it("ends a meeting: generates a summary, queues write-through, marks completed", async () => {
    const m = await meeting();
    await MS.addSegment(m.id, { speaker: "Ada", text: "we will ship the beta next week", startMs: 0, endMs: 3000 } as any);
    const ended = await MS.endMeeting(m.id);
    expect(ended?.status).toBe("completed");
    expect(ended?.summaryReady).toBe(true);
    expect(ended?.durationMin).toBeGreaterThanOrEqual(15);
    expect(await MS.getSummary(m.id)).toBeTruthy();
    expect((await MS.listFollowUps(m.id)).length).toBeGreaterThan(0);
    expect(await MS.endMeeting("nope")).toBeNull();
  });
});

describe("summary — honest word count", () => {
  it("counts words actually present in transcript segments (no padding)", async () => {
    const m = await meeting();
    await MS.addSegment(m.id, { speaker: "A", text: "one two three", startMs: 0, endMs: 1000 } as any);
    await MS.addSegment(m.id, { speaker: "B", text: "four five", startMs: 1000, endMs: 2000 } as any);
    const sum = await MS.generateSummary(m.id);
    expect(sum?.wordCount).toBe(5); // exactly the transcript word count
    expect(sum?.keyPoints.length).toBeGreaterThan(0);
  });

  it("reports zero words for a meeting with no transcript", async () => {
    const m = await meeting();
    const sum = await MS.generateSummary(m.id);
    expect(sum?.wordCount).toBe(0);
  });
});

describe("write-through — never fabricates a synced record", () => {
  it("keeps all queued and mirrors the real backlog into writeThroughPending", async () => {
    const m = await meeting();
    const tasks = await MS.enqueueWriteThrough(m.id);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.status === "queued")).toBe(true);
    expect(tasks.every((t) => !(t as any).targetRecordId)).toBe(true);
    const refreshed = await MS.getMeeting(m.id);
    expect(refreshed?.writeThroughPending).toBe(tasks.length);
  });
});

describe("action items, decisions, risks", () => {
  it("adds and transitions an action item", async () => {
    const m = await meeting();
    const a = await MS.addActionItem(m.id, { title: "Draft spec", owner: "Ada", dueDate: "2026-02-01" } as any);
    expect(a.status).toBe("open");
    const done = await MS.updateActionItemStatus(m.id, a.id, "done");
    expect(done?.status).toBe("done");
    expect(await MS.updateActionItemStatus(m.id, "nope", "done")).toBeNull();
  });

  it("records decisions and acknowledges risks", async () => {
    const m = await meeting();
    await MS.addDecision(m.id, { statement: "Adopt weekly releases", madeBy: "team" } as any);
    expect((await MS.listDecisions(m.id)).length).toBe(1);
    const r = await MS.addRisk(m.id, { description: "Vendor SLA gap", severity: "medium" } as any);
    expect(r.acknowledged).toBe(false);
    const acked = await MS.ackRisk(m.id, r.id);
    expect(acked?.acknowledged).toBe(true);
    expect(await MS.ackRisk(m.id, "nope")).toBeNull();
  });
});

describe("translation channels", () => {
  it("enables a per-language translation channel", async () => {
    const m = await meeting();
    const ch = await MS.enableTranslationChannel(m.id, "es");
    expect(ch.language).toBe("es");
    expect((await MS.listTranslationChannels(m.id)).some((c) => c.language === "es")).toBe(true);
  });
});

describe("dashboard summary", () => {
  it("aggregates connectors, meetings, action items and write-through backlog", async () => {
    const m = await meeting();
    await MS.addActionItem(m.id, { title: "t", owner: "a", dueDate: "2026-02-01" } as any);
    await MS.addSegment(m.id, { speaker: "A", text: "hello world", startMs: 0, endMs: 1000 } as any);
    await MS.endMeeting(m.id);
    const dash = await MS.summary();
    expect(dash.connectors).toBeGreaterThanOrEqual(1);
    expect(dash.summariesGenerated24h).toBeGreaterThanOrEqual(1);
    expect(dash.writeThroughPending).toBeGreaterThan(0);
    expect(dash.writeThroughSynced24h).toBe(0); // nothing is synced without a real connector
  });
});
