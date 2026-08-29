/**
 * Unit tests for Real-Time SSE Channel & Event History Service (Session 126).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventsService } from "./events.service.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();

  return {
    redisCmd: {
      async set(k: string, v: string) { store.set(k, v); },
      async get(k: string) { return store.get(k) ?? null; },
      async del(k: string) { store.delete(k); },
      async zadd(k: string, score: string, member: string) {
        const s = Number(score);
        let list = zsets.get(k);
        if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex(i => i.member === member);
        if (idx !== -1) list.splice(idx, 1);
        list.push({ score: s, member });
        list.sort((a, b) => a.score - b.score);
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) {
        const list = zsets.get(k) ?? [];
        const end = stop === -1 ? list.length : stop + 1;
        return list.slice(start, end).map(i => i.member);
      },
      async zrem(k: string, ...members: string[]) {
        const list = zsets.get(k);
        if (!list) return;
        for (const m of members) {
          const idx = list.findIndex(i => i.member === m);
          if (idx !== -1) list.splice(idx, 1);
        }
      },
    },
  };
});

describe("EventsService (Event history ring buffer & stream management)", () => {
  const orgA = "org-events-test-a";
  const orgB = "org-events-test-b";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an org-scoped event and retrieves it via getEventHistory", async () => {
    const payload = {
      id: "evt-test-1",
      event: "task.created",
      data: { taskId: "t-1" },
      timestamp: new Date("2026-08-06T10:00:00Z").toISOString(),
      organizationId: orgA,
    };

    await EventsService.recordEvent(payload);
    const history = await EventsService.getEventHistory(orgA);

    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.some(e => e.id === "evt-test-1" && e.event === "task.created")).toBe(true);
  });

  it("does not mix events between different organizations in getEventHistory", async () => {
    await EventsService.recordEvent({
      id: "evt-test-2a",
      event: "message.created",
      data: { msg: "A" },
      timestamp: new Date("2026-08-06T10:01:00Z").toISOString(),
      organizationId: orgA,
    });

    await EventsService.recordEvent({
      id: "evt-test-2b",
      event: "message.created",
      data: { msg: "B" },
      timestamp: new Date("2026-08-06T10:02:00Z").toISOString(),
      organizationId: orgB,
    });

    const histA = await EventsService.getEventHistory(orgA);
    const histB = await EventsService.getEventHistory(orgB);

    expect(histA.some(e => e.id === "evt-test-2a")).toBe(true);
    expect(histA.some(e => e.id === "evt-test-2b")).toBe(false);
    expect(histB.some(e => e.id === "evt-test-2b")).toBe(true);
    expect(histB.some(e => e.id === "evt-test-2a")).toBe(false);
  });

  it("filters history by since timestamp or event ID", async () => {
    await EventsService.recordEvent({
      id: "evt-test-3a",
      event: "task.created",
      data: { t: 1 },
      timestamp: new Date("2026-08-06T11:00:00Z").toISOString(),
      organizationId: orgA,
    });
    await EventsService.recordEvent({
      id: "evt-test-3b",
      event: "task.completed",
      data: { t: 1 },
      timestamp: new Date("2026-08-06T11:05:00Z").toISOString(),
      organizationId: orgA,
    });

    const sinceTime = await EventsService.getEventHistory(orgA, { since: "2026-08-06T11:01:00Z" });
    expect(sinceTime.some(e => e.id === "evt-test-3a")).toBe(false);
    expect(sinceTime.some(e => e.id === "evt-test-3b")).toBe(true);

    const sinceId = await EventsService.getEventHistory(orgA, { since: "evt-test-3a" });
    expect(sinceId.some(e => e.id === "evt-test-3a")).toBe(false);
    expect(sinceId.some(e => e.id === "evt-test-3b")).toBe(true);
  });

  it("publishes a custom event to the org stream and returns the payload", async () => {
    const res = await EventsService.publishEvent(
      { id: "user-1", organizationId: orgA },
      { event: "custom.test", data: { hello: "world" } }
    );

    expect(res.event).toBe("custom.test");
    expect(res.organizationId).toBe(orgA);
    expect(res.data).toEqual({ hello: "world" });

    const hist = await EventsService.getEventHistory(orgA);
    expect(hist.some(e => e.id === res.id)).toBe(true);
  });

  it("lists and disconnects active SSE clients for an organization", () => {
    const fakeMap = new Map<string, any>();
    let ended = false;
    fakeMap.set("cli-1", {
      id: "cli-1",
      userId: "u-1",
      organizationId: orgA,
      lastEventId: null,
      subscribedAt: Date.now(),
      res: { end: () => { ended = true; } },
    });
    fakeMap.set("cli-2", {
      id: "cli-2",
      userId: "u-2",
      organizationId: orgB,
      lastEventId: null,
      subscribedAt: Date.now(),
      res: { end: () => {} },
    });

    const clientsA = EventsService.listClients(orgA, fakeMap);
    expect(clientsA.length).toBe(1);
    expect(clientsA[0].id).toBe("cli-1");

    // Cannot disconnect client in orgB from orgA
    const removeWrong = EventsService.disconnectClient(orgA, "cli-2", fakeMap);
    expect(removeWrong).toBe(false);

    // Can disconnect client in orgA
    const removeOk = EventsService.disconnectClient(orgA, "cli-1", fakeMap);
    expect(removeOk).toBe(true);
    expect(ended).toBe(true);
    expect(fakeMap.has("cli-1")).toBe(false);
  });

  it("returns health response including orgConnectedClients when requested", () => {
    const fakeMap = new Map<string, any>();
    fakeMap.set("c1", { organizationId: orgA });
    fakeMap.set("c2", { organizationId: orgA });
    fakeMap.set("c3", { organizationId: orgB });

    const health = EventsService.getHealth(3, orgA, fakeMap);
    expect(health.connectedClients).toBe(3);
    expect(health.orgConnectedClients).toBe(2);
    expect(health.subscribedEvents).toContain("message.created");
  });
});
