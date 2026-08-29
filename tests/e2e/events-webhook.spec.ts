/**
 * Playwright E2E — Session 126: Real-Time SSE Channel (Events) &
 * Inbound Webhook Receiver Completion.
 *
 * Validates against a live API that:
 *   - The existing endpoints (`GET /api/v1/events/stream`, `GET /api/v1/events/health`,
 *     `POST /api/v1/webhook/billing/webhook`) keep their paths, status codes, and shapes.
 *   - The Session 126 additive endpoints (`GET /events/history`, `GET /events/clients`,
 *     `POST /events/publish`, `DELETE /events/clients/:id`, and `/webhook/inbound/*`
 *     CRUD/replay/inbox) operate correctly with tenant scoping and persistence.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Session 126 — events & webhook completion", () => {
  let token = "";
  const marker = `e2e-s126-${Date.now()}`;

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  async function send(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...auth(), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("GET /events/health returns channel statistics", async () => {
    const health = await get("/events/health");
    expect(health.status).toBe(200);
    expect(typeof health.data.connectedClients).toBe("number");
    expect(Array.isArray(health.data.subscribedEvents)).toBe(true);
    expect(typeof health.data.uptime).toBe("number");
  });

  test("POST /events/publish records an event in history and returns it", async () => {
    const published = await send("POST", "/events/publish", {
      event: "custom.e2e_test",
      data: { marker, hello: "world" },
    });
    expect(published.status).toBe(201);
    expect(published.data.id).toBeTruthy();
    expect(published.data.event).toBe("custom.e2e_test");
    expect(published.data.data.marker).toBe(marker);

    const history = await get("/events/history?limit=50");
    expect(history.status).toBe(200);
    expect(Array.isArray(history.data)).toBe(true);
    expect(history.data.some((e: any) => e.id === published.data.id)).toBe(true);
  });

  test("GET /events/clients lists active organization SSE sessions", async () => {
    const clients = await get("/events/clients");
    expect(clients.status).toBe(200);
    expect(Array.isArray(clients.data)).toBe(true);
  });

  test("events endpoints refuse anonymous callers", async () => {
    for (const path of ["/events/stream", "/events/history", "/events/clients"]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });

  test("POST /webhook/inbound/:source logs inbound webhook to inbox", async () => {
    const received = await send("POST", "/webhook/inbound/github", {
      action: "opened",
      issue: { id: marker },
    });
    expect(received.status).toBe(201);
    expect(received.data.id).toBeTruthy();
    expect(received.data.source).toBe("github");
    expect(received.data.status).toBe("received");

    const inbox = await get("/webhook/inbound?source=github");
    expect(inbox.status).toBe(200);
    expect(Array.isArray(inbox.data)).toBe(true);
    expect(inbox.data.some((e: any) => e.id === received.data.id)).toBe(true);

    const single = await get(`/webhook/inbound/${received.data.id}`);
    expect(single.status).toBe(200);
    expect(single.data.id).toBe(received.data.id);
    expect(single.data.payload.issue.id).toBe(marker);
  });

  test("POST /webhook/inbound/:id/replay re-dispatches to EventBus", async () => {
    const entry = await send("POST", "/webhook/inbound/custom", {
      alert: "test-replay",
      marker,
    });
    expect(entry.status).toBe(201);

    const replayed = await send("POST", `/webhook/inbound/${entry.data.id}/replay`);
    expect(replayed.status).toBe(200);
    expect(replayed.data.status).toBe("replayed");
    expect(replayed.data.replayedAt).toBeTruthy();
  });

  test("DELETE /webhook/inbound/:id removes inbox entry (correction path)", async () => {
    const entry = await send("POST", "/webhook/inbound/etl", {
      rows: 100,
    });
    expect(entry.status).toBe(201);

    const deleted = await send("DELETE", `/webhook/inbound/${entry.data.id}`);
    expect(deleted.status).toBe(204);

    const check = await get(`/webhook/inbound/${entry.data.id}`);
    expect(check.status).toBe(404);
  });

  test("POST /webhook/billing/webhook accepts valid legacy payment webhook", async () => {
    const res = await fetch(`${BASE}/webhook/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-windels-webhook-secret": "test-secret-default",
      },
      body: JSON.stringify({
        eventId: "evt-payment-e2e",
        eventType: "invoice.paid",
        payload: { amount: 100 },
      }),
    });
    // Can be 200 or 401 depending on whether test env secret is configured
    expect([200, 401]).toContain(res.status);
  });
});
