/**
 * SSE event-stream tenant scoping.
 *
 * `events` is the last STUB in the inventory — correctly so, it is a 2-route
 * module by design (a stream and a health probe). But it is also the fan-out
 * point for every real-time event in the platform, and its scoping check was
 * fail-open in a way that leaked across tenants:
 *
 *     if (eventOrgId && client.organizationId && eventOrgId !== client.organizationId) continue;
 *
 * `organizationId` is `string | null` on the auth payload, so a client
 * authenticated without an organization failed the middle condition and was
 * therefore never skipped — it received every organization's message.created,
 * conversation.updated, task.* and agent.* events over a long-lived stream.
 *
 * These tests drive `registerSSERoutes` with a fake Express router and fake
 * responses, then push events through the exported `pushEvent`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/eventBus.js", () => ({
  EventBus: { on: () => {}, off: () => {}, emit: () => {} },
}));
vi.mock("../../config/logger.js", () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { registerSSERoutes, pushEvent, getSSEConnectionCount } =
  await import("./events.js");

/** Captures everything written to a fake SSE response. */
function fakeRes() {
  const chunks: string[] = [];
  return {
    chunks,
    writeHead() { return this; },
    write(s: string) { chunks.push(s); return true; },
    end() {},
    on() { return this; },
    flushHeaders() {},
    /** Parsed `data:` frames, ignoring the initial connection handshake. */
    events() {
      return chunks
        .filter((c) => c.startsWith("data: "))
        .map((c) => { try { return JSON.parse(c.slice(6).trim()); } catch { return null; } })
        .filter((e): e is Record<string, unknown> => !!e && "event" in e);
    },
  };
}

/** Register the routes against a fake router and return the stream handler. */
type StreamHandler = (req: unknown, res: unknown) => unknown;

function streamHandler(): StreamHandler {
  const found: StreamHandler[] = [];
  const router = {
    get(path: string, ...rest: unknown[]) {
      if (path === "/stream") found.push(rest[rest.length - 1] as StreamHandler);
      return router;
    },
    post() { return router; },
    delete() { return router; },
    patch() { return router; },
    put() { return router; },
  };
  registerSSERoutes(router as never);
  if (found.length === 0) throw new Error("stream route not registered");
  return found[0];
}

/** Connect a client for the given org (null = no org scope). */
function connect(handler: ReturnType<typeof streamHandler>, orgId: string | null) {
  const res = fakeRes();
  handler({ user: { id: "u-" + (orgId ?? "none"), organizationId: orgId }, headers: {}, on: () => {} }, res);
  return res;
}

let handler: ReturnType<typeof streamHandler>;
beforeEach(() => {
  handler = streamHandler();
});

describe("SSE events are scoped to the subscriber's organization", () => {
  it("delivers an org-scoped event to that org only", () => {
    const a = connect(handler, "org-a");
    const b = connect(handler, "org-b");

    pushEvent("message.created", { organizationId: "org-a", text: "secret" });

    expect(a.events().some((e) => e.event === "message.created")).toBe(true);
    expect(b.events().some((e) => e.event === "message.created")).toBe(false);
  });

  it("does not leak another org's events to a client with no org scope", () => {
    const none = connect(handler, null);
    pushEvent("message.created", { organizationId: "org-a", text: "secret" });
    // The bug: a null-org client matched the fail-open guard and received
    // every tenant's traffic.
    expect(none.events().some((e) => e.event === "message.created")).toBe(false);
  });

  it("honours the orgId alias as well as organizationId", () => {
    const a = connect(handler, "org-a");
    const b = connect(handler, "org-b");
    pushEvent("task.updated", { orgId: "org-a" });
    expect(a.events().some((e) => e.event === "task.updated")).toBe(true);
    expect(b.events().some((e) => e.event === "task.updated")).toBe(false);
  });

  it("still broadcasts genuinely global events to everyone", () => {
    const a = connect(handler, "org-a");
    const none = connect(handler, null);
    // No org on the payload at all — a system notice.
    pushEvent("system.maintenance", { message: "restarting" });
    expect(a.events().some((e) => e.event === "system.maintenance")).toBe(true);
    expect(none.events().some((e) => e.event === "system.maintenance")).toBe(true);
  });

  it("delivers to every client of the matching org", () => {
    const a1 = connect(handler, "org-a");
    const a2 = connect(handler, "org-a");
    const b = connect(handler, "org-b");
    pushEvent("agent.status_changed", { organizationId: "org-a" });
    expect(a1.events().length).toBeGreaterThan(0);
    expect(a2.events().length).toBeGreaterThan(0);
    expect(b.events().length).toBe(0);
  });
});

describe("connection bookkeeping", () => {
  it("counts connected clients", () => {
    const before = getSSEConnectionCount();
    connect(handler, "org-a");
    connect(handler, "org-b");
    expect(getSSEConnectionCount()).toBe(before + 2);
  });

  it("sends a handshake frame naming the client's own org only", () => {
    const a = connect(handler, "org-a");
    const handshake = a.chunks.find((c) => c.startsWith("data: ") && c.includes("clientId"));
    expect(handshake).toBeTruthy();
    expect(handshake).toContain("org-a");
  });
});
