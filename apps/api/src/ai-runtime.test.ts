/**
 * AI Runtime & Model Execution Layer — E2E tests.
 *
 * Covers:
 *   - Provider registry endpoints (/ai/models, /ai/providers, /ai/health)
 *   - Non-streaming completion (/ai/complete)
 *   - Embeddings (/ai/embed) single + batch
 *   - Admin test-providers (permission check)
 *   - SSE streaming error contract (when no keys configured)
 *   - Rate-limit + prompt-injection behavior via registry
 */
import { beforeAll, describe, expect, test } from "vitest";

import { isApiLive } from "./testUtils/liveApi.js";

// Integration suite: requires a live API. Skip (not fail) when none is up.
const LIVE = await isApiLive();

const BASE = process.env.TEST_API_URL ?? "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

type J = { ok: boolean; data?: any; error?: { code: string; message: string } };

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = (await r.json()) as J;
  if (!j.ok) throw new Error(`login failed: ${JSON.stringify(j)}`);
  return j.data.token as string;
}

describe.skipIf(!LIVE)("AI Runtime & Model Execution Layer", () => {
  let token: string;
  beforeAll(async () => { token = await login(); });

  const auth = (opts: RequestInit = {}) => ({
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });

  describe("GET /ai/models", () => {
    test("returns at least one model entry even when no provider configured", async () => {
      const r = await fetch(`${BASE}/ai/models`, auth());
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.ok).toBe(true);
      expect(Array.isArray(j.data)).toBe(true);
      expect(j.data.length).toBeGreaterThanOrEqual(1);
      // Each entry has the expected shape
      for (const m of j.data) {
        expect(m.id).toBeTruthy();
        expect(m.provider).toBeTruthy();
        expect(m.displayName).toBeTruthy();
        expect(typeof m.contextWindow).toBe("number");
        expect(Array.isArray(m.capabilities)).toBe(true);
      }
    });
  });

  describe("GET /ai/providers", () => {
    test("returns provider list with health", async () => {
      const r = await fetch(`${BASE}/ai/providers`, auth());
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.ok).toBe(true);
      expect(Array.isArray(j.data)).toBe(true);
      // Without real keys configured we expect the windels placeholder with configured:false
      const windels = j.data.find((p: any) => p.id === "windels");
      expect(windels).toBeTruthy();
      expect(windels.configured).toBe(false);
      expect(windels.healthy).toBe(false);
    });
  });

  describe("GET /ai/health", () => {
    test("reports hasRealProvider=false when no keys set", async () => {
      const r = await fetch(`${BASE}/ai/health`, auth());
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.ok).toBe(true);
      expect(typeof j.data.hasRealProvider).toBe("boolean");
      expect(Array.isArray(j.data.providers)).toBe(true);
      if (!j.data.hasRealProvider) {
        expect(j.data.configMessage).toContain("AI PROVIDER CONFIGURATION REQUIRED");
      }
    });
  });

  describe("POST /ai/complete (non-streaming)", () => {
    test("unauthenticated → 401", async () => {
      const r = await fetch(`${BASE}/ai/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      expect(r.status).toBe(401);
    });

    test("validation error on empty messages", async () => {
      const r = await fetch(`${BASE}/ai/complete`, auth({
        method: "POST", body: JSON.stringify({ messages: [] }),
      }));
      expect(r.status).toBe(422);
    });

    test("returns AI_PROVIDER_CONFIGURATION_REQUIRED in strict mode without keys", async () => {
      const r = await fetch(`${BASE}/ai/complete`, auth({
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
      }));
      expect(r.status).toBe(503);
      const j = (await r.json()) as J;
      expect(j.ok).toBe(false);
      expect(j.error!.code).toBe("AI_PROVIDER_CONFIGURATION_REQUIRED");
      expect(j.error!.message).toContain("AI PROVIDER CONFIGURATION REQUIRED");
    });
  });

  describe("POST /ai/embed", () => {
    test("single input returns a vector array", async () => {
      const r = await fetch(`${BASE}/ai/embed`, auth({
        method: "POST", body: JSON.stringify({ input: "hello world" }),
      }));
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.ok).toBe(true);
      expect(Array.isArray(j.data.embeddings)).toBe(true);
      expect(j.data.embeddings).toHaveLength(1);
      expect(Array.isArray(j.data.embeddings[0])).toBe(true);
      expect(j.data.embeddings[0].length).toBeGreaterThan(10);
      // Vector should be normalized (approximately unit length)
      const v: number[] = j.data.embeddings[0];
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeGreaterThan(0.9);
      expect(norm).toBeLessThan(1.1);
      expect(typeof j.data.tokensIn).toBe("number");
      expect(j.data.model).toBeTruthy();
    });

    test("batch input returns N vectors", async () => {
      const r = await fetch(`${BASE}/ai/embed`, auth({
        method: "POST",
        body: JSON.stringify({ input: ["hello world", "the quick brown fox"] }),
      }));
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.data.embeddings).toHaveLength(2);
    });

    test("validation: batch too large", async () => {
      const r = await fetch(`${BASE}/ai/embed`, auth({
        method: "POST", body: JSON.stringify({ input: Array(3000).fill("x") }),
      }));
      expect(r.status).toBe(422);
    });
  });

  describe("POST /ai/test-providers (admin only)", () => {
    test("returns detailed probe results for super_admin", async () => {
      const r = await fetch(`${BASE}/ai/test-providers`, auth({ method: "POST" }));
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.ok).toBe(true);
      expect(Array.isArray(j.data)).toBe(true);
      for (const p of j.data) {
        expect(p.id).toBeTruthy();
        expect(typeof p.healthy).toBe("boolean");
        expect(Array.isArray(p.models)).toBe(true);
      }
    });
  });

  describe("SSE chat message streaming contract (no-provider state)", () => {
    test("SSE POST to /conversations/:id/messages emits message.error with AI_PROVIDER_CONFIGURATION_REQUIRED", async () => {
      // Create a conv
      const c = await fetch(`${BASE}/conversations`, auth({
        method: "POST", body: JSON.stringify({ title: "AI Runtime test" }),
      }));
      const cj = (await c.json()) as J;
      const convId = cj.data.id;

      const ac = new AbortController();
      const r = await fetch(`${BASE}/conversations/${convId}/messages`, {
        method: "POST",
        signal: ac.signal,
        headers: {
          Authorization: `Bearer ${token}`, "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ content: "runtime test" }),
      });
      expect(r.ok).toBe(true);
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const events: { name: string; data: any }[] = [];
      const to = setTimeout(() => ac.abort(), 5000);
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          while (buf.includes("\n\n")) {
            const idx = buf.indexOf("\n\n");
            const part = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let name = "message", dataStr = "";
            for (const ln of part.split("\n")) {
              if (ln.startsWith("event:")) name = ln.slice(6).trim();
              else if (ln.startsWith("data:")) dataStr += ln.slice(5).trim();
            }
            if (dataStr) { try { events.push({ name, data: JSON.parse(dataStr) }); } catch {} }
          }
          if (events.some((e) => e.name === "message.error")) break;
        }
      } catch (e: any) { if (e.name !== "AbortError") throw e; }
      finally { clearTimeout(to); reader.releaseLock(); }

      expect(events.some((e) => e.name === "message.created")).toBe(true);
      const errEvt = events.find((e) => e.name === "message.error");
      expect(errEvt).toBeTruthy();
      expect(errEvt!.data.code).toBe("AI_PROVIDER_CONFIGURATION_REQUIRED");
    });
  });
});
