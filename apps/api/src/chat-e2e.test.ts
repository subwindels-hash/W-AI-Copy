/**
 * End-to-end tests for the chat/SSE conversation flow.
 * Run against a live API on http://localhost:4000.
 */
import { beforeAll, describe, expect, test } from "vitest";

import { isApiLive } from "./testUtils/liveApi.js";

// Integration suite: requires a live API. Skip (not fail) when none is up.
const LIVE = await isApiLive();

const BASE = process.env.TEST_API_URL ?? "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

type ApiResp = { ok: boolean; data?: any; error?: { code: string; message: string } };

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = (await res.json()) as ApiResp;
  if (!j.ok) throw new Error(`login failed: ${JSON.stringify(j)}`);
  return j.data.token as string;
}

describe.skipIf(!LIVE)("Chat / Conversations E2E", () => {
  let token: string;
  beforeAll(async () => { token = await login(); });

  test("login returns a JWT", () => {
    expect(token).toMatch(/^eyJ/);
    expect(token.length).toBeGreaterThan(100);
  });

  test("/auth/me returns the super_admin user", async () => {
    const res = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json()) as ApiResp;
    expect(j.ok).toBe(true);
    expect(j.data.email).toBe(EMAIL);
    expect(j.data.role).toBe("super_admin");
  });

  test("POST /conversations creates a conversation", async () => {
    const res = await fetch(`${BASE}/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "E2E Test Conversation" }),
    });
    const j = (await res.json()) as ApiResp;
    expect(j.ok).toBe(true);
    expect(j.data.id).toBeTruthy();
    expect(j.data.title).toBe("E2E Test Conversation");
  });

  test("GET /conversations lists conversations including the new one", async () => {
    const res = await fetch(`${BASE}/conversations`, { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json()) as ApiResp;
    expect(j.ok).toBe(true);
    expect(Array.isArray(j.data.items)).toBe(true);
    const found = j.data.items.find((c: any) => c.title === "E2E Test Conversation");
    expect(found).toBeTruthy();
  });

  test("POST /conversations/:id/messages with Accept: text/event-stream streams SSE events including message.error when no AI configured", async () => {
    // Create fresh conversation for isolation
    const cRes = await fetch(`${BASE}/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "SSE Test" }),
    });
    const cJson = (await cRes.json()) as ApiResp;
    const convId = cJson.data.id;

    const ac = new AbortController();
    const res = await fetch(`${BASE}/conversations/${convId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ content: "Hello, what can you do?" }),
      signal: ac.signal,
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.body).toBeTruthy();

    // Read up to ~10 seconds of events
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const events: { event: string; data: any }[] = [];
    const timeout = setTimeout(() => ac.abort(), 8000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        while (buf.includes("\n\n")) {
          const idx = buf.indexOf("\n\n");
          const part = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let eventName = "message";
          let dataStr = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (dataStr) {
            try { events.push({ event: eventName, data: JSON.parse(dataStr) }); }
            catch { events.push({ event: eventName, data: dataStr }); }
          }
        }
        // Stop after message.done or message.error
        if (events.some((e) => e.event === "message.done" || e.event === "message.error")) break;
      }
    } catch (e: any) {
      if (e.name !== "AbortError") throw e;
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
    }

    // Verify event contract
    const eventTypes = events.map((e) => e.event);
    expect(eventTypes).toContain("message.created");
    // Must include a user message.created
    const userCreated = events.find((e) => e.event === "message.created" && e.data.role === "user");
    expect(userCreated).toBeTruthy();
    expect(userCreated!.data.content).toBe("Hello, what can you do?");
    // Without AI keys configured, expect an error event with the exact configuration-required message
    const errEvt = events.find((e) => e.event === "message.error");
    expect(errEvt).toBeTruthy();
    expect(errEvt!.data.code).toBe("AI_PROVIDER_CONFIGURATION_REQUIRED");
    expect(errEvt!.data.message).toContain("AI PROVIDER CONFIGURATION REQUIRED");
  });

  test("POST /conversations/:id/messages (non-streaming) returns AI_PROVIDER_CONFIGURATION_REQUIRED AppError", async () => {
    const cRes = await fetch(`${BASE}/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Non-stream Test" }),
    });
    const cJson = (await cRes.json()) as ApiResp;
    const convId = cJson.data.id;

    const res = await fetch(`${BASE}/conversations/${convId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // NO Accept: text/event-stream — hits non-streaming JSON fallback path
      body: JSON.stringify({ content: "Non-streaming hello" }),
    });
    // AI_PROVIDER_CONFIGURATION_REQUIRED maps to 503 Service Unavailable
    expect(res.status).toBe(503);
    const j = (await res.json()) as ApiResp;
    expect(j.ok).toBe(false);
    expect(j.error!.code).toBe("AI_PROVIDER_CONFIGURATION_REQUIRED");
    expect(j.error!.message).toContain("AI PROVIDER CONFIGURATION REQUIRED");
  });

  test("/ai/health reports hasRealProvider=false when no keys set", async () => {
    const res = await fetch(`${BASE}/ai/health`, { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json()) as ApiResp & { data: { hasRealProvider: boolean; providers: unknown[] } };
    expect(j.ok).toBe(true);
    expect(j.data.hasRealProvider).toBe(false);
    expect(Array.isArray(j.data.providers)).toBe(true);
  });
});
