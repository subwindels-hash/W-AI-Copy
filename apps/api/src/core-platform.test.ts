/**
 * Core Platform MVP Integration Test Suite.
 * Validates every MVP-critical endpoint end-to-end against a live API.
 */
import { beforeAll, describe, expect, test } from "vitest";

const BASE = process.env.TEST_API_URL ?? "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

type J = { ok: boolean; data?: any; error?: { code: string; message: string } };

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = (await r.json()) as J;
  if (!j.ok) throw new Error(`login failed: ${JSON.stringify(j)}`);
  return j.data.token as string;
}

async function get(token: string, path: string): Promise<{ status: number; body: J }> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: (await r.json()) as J };
}

describe("Core Platform MVP", () => {
  let token: string;
  beforeAll(async () => { token = await login(); });

  describe("Auth", () => {
    test("login returns JWT", () => {
      expect(token).toMatch(/^eyJ/);
      expect(token.length).toBeGreaterThan(100);
    });
    test("GET /auth/me returns super_admin", async () => {
      const { status, body } = await get(token, "/auth/me");
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.email).toBe(EMAIL);
      expect(["super_admin", "admin"]).toContain(body.data.role);
    });
    test("unauthenticated → 401", async () => {
      const r = await fetch(`${BASE}/conversations`);
      expect(r.status).toBe(401);
    });
  });

  describe("Workspace bootstrap", () => {
    test("GET /workspace/dashboard", async () => {
      const { status, body } = await get(token, "/workspace/dashboard");
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.organization).toBeTruthy();
      expect(body.data.workspace).toBeTruthy();
      expect(body.data.stats).toBeTruthy();
      expect(Array.isArray(body.data.agents)).toBe(true);
      expect(Array.isArray(body.data.activities)).toBe(true);
    });
  });

  describe("AI execution layer", () => {
    test("GET /ai/health reports providers", async () => {
      const { status, body } = await get(token, "/ai/health");
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(typeof body.data.hasRealProvider).toBe("boolean");
      expect(Array.isArray(body.data.providers)).toBe(true);
    });
    test("GET /ai/models", async () => {
      const { status, body } = await get(token, "/ai/models");
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
    });
    test("GET /ai/providers", async () => {
      const { status } = await get(token, "/ai/providers");
      expect([200, 404]).toContain(status);
    });
  });

  describe("Chat / Conversations (full SSE lifecycle)", () => {
    test("create → SSE send → delete (expect AI_PROVIDER_CONFIGURATION_REQUIRED in strict mode)", async () => {
      // create
      const cr = await fetch(`${BASE}/conversations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "MVP Integration Test" }),
      });
      expect(cr.status).toBe(201);
      const cj = (await cr.json()) as J;
      expect(cj.ok).toBe(true);
      const convId = cj.data.id as string;

      // list
      const lr = await get(token, "/conversations?perPage=50");
      expect(lr.status).toBe(200);
      expect(Array.isArray(lr.body.data.items)).toBe(true);

      // SSE send
      const ac = new AbortController();
      const mr = await fetch(`${BASE}/conversations/${convId}/messages`, {
        method: "POST",
        signal: ac.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "Hello MVP" }),
      });
      expect(mr.ok).toBe(true);
      const reader = mr.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const events: { name: string; data: any }[] = [];
      const to = setTimeout(() => ac.abort(), 6000);
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
          if (events.some((e) => e.name === "message.error" || e.name === "message.done")) break;
        }
      } catch (e: any) { if (e.name !== "AbortError") throw e; }
      finally { clearTimeout(to); reader.releaseLock(); }

      expect(events.some((e) => e.name === "message.created")).toBe(true);
      const errEvt = events.find((e) => e.name === "message.error");
      expect(errEvt).toBeTruthy();
      expect(errEvt!.data.code).toBe("AI_PROVIDER_CONFIGURATION_REQUIRED");

      // delete
      const dr = await fetch(`${BASE}/conversations/${convId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      expect(dr.status).toBe(200);
    });
  });

  describe("Prompt templates", () => {
    test("GET /prompt-templates", async () => {
      const { status, body } = await get(token, "/prompt-templates");
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("Canvas", () => {
    test("GET /canvases", async () => {
      const { status, body } = await get(token, "/canvases?perPage=5");
      expect(status).toBe(200);
      expect(Array.isArray(body.data.items)).toBe(true);
    });
  });

  describe("Talk", () => {
    test("GET /talk/channels", async () => {
      const { status, body } = await get(token, "/talk/channels");
      expect(status).toBe(200);
      expect(Array.isArray(body.data.items)).toBe(true);
    });
  });

  describe("Workflows", () => {
    test("GET /workflows", async () => {
      const { status, body } = await get(token, "/workflows?perPage=5");
      expect(status).toBe(200);
      expect(Array.isArray(body.data.items)).toBe(true);
    });
  });

  describe("Agents (AI Workforce)", () => {
    test("GET /agents", async () => {
      const { status, body } = await get(token, "/agents?perPage=10");
      expect(status).toBe(200);
      expect(Array.isArray(body.data.items)).toBe(true);
    });
  });

  describe("Billing", () => {
    test("GET /billing returns subscription + plans", async () => {
      const { status, body } = await get(token, "/billing");
      expect(status).toBe(200);
      expect(body.data.subscription).toBeTruthy();
      expect(Array.isArray(body.data.plans)).toBe(true);
      expect(body.data.plans.length).toBeGreaterThan(0);
    });
  });

  describe("Governance", () => {
    test("GET /governance/permissions", async () => {
      const { status, body } = await get(token, "/governance/permissions");
      expect(status).toBe(200);
      expect(body.data).toBeTruthy();
      expect(body.data.role).toBeTruthy();
      expect(Array.isArray(body.data.permissions)).toBe(true);
    });
    test("GET /governance/audit", async () => {
      const { status } = await get(token, "/governance/audit?perPage=5");
      expect(status).toBe(200);
    });
    test("GET /governance/alerts", async () => {
      const { status, body } = await get(token, "/governance/alerts");
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });
    test("GET /governance/health", async () => {
      const { status } = await get(token, "/governance/health");
      expect(status).toBe(200);
    });
  });

  describe("Platform", () => {
    test("GET /platform/overview", async () => {
      const { status } = await get(token, "/platform/overview");
      expect(status).toBe(200);
    });
    test("GET /platform/metrics", async () => {
      const { status, body } = await get(token, "/platform/metrics");
      expect(status).toBe(200);
      expect(body.data).toBeTruthy();
      expect(body.data.counters).toBeTruthy();
    });
  });

  describe("Security", () => {
    test("GET /security/scorecard", async () => {
      const { status } = await get(token, "/security/scorecard");
      expect(status).toBe(200);
    });
    test("GET /security/events", async () => {
      const { status } = await get(token, "/security/events");
      expect(status).toBe(200);
    });
  });

  describe("AI Constitution", () => {
    test("GET /constitution/active", async () => {
      const { status } = await get(token, "/constitution/active");
      expect(status).toBe(200);
    });
    test("GET /constitution/dashboard/rollup", async () => {
      const { status } = await get(token, "/constitution/dashboard/rollup");
      expect(status).toBe(200);
    });
  });

  describe("Trading Intelligence", () => {
    test("GET /trading-intel/dashboard/rollup", async () => {
      const { status } = await get(token, "/trading-intel/dashboard/rollup");
      expect(status).toBe(200);
    });
    test("GET /trading-intel/instruments", async () => {
      const { status } = await get(token, "/trading-intel/instruments");
      expect(status).toBe(200);
    });
  });

  describe("Voice Studio", () => {
    test("GET /voice-studio/dashboard/rollup", async () => {
      const { status } = await get(token, "/voice-studio/dashboard/rollup");
      expect(status).toBe(200);
    });
    test("GET /voice-studio/voices/builtin", async () => {
      const { status } = await get(token, "/voice-studio/voices/builtin");
      expect(status).toBe(200);
    });
  });

  describe("Media Factory", () => {
    test("GET /media-factory/jobs", async () => {
      const { status } = await get(token, "/media-factory/jobs");
      expect(status).toBe(200);
    });
  });

  describe("Education", () => {
    test("GET /education/lecturer", async () => {
      const { status } = await get(token, "/education/lecturer");
      expect(status).toBe(200);
    });
  });

  describe("Profile / Me", () => {
    test("GET /me", async () => {
      const { status, body } = await get(token, "/me");
      expect(status).toBe(200);
      expect(body.data).toBeTruthy();
    });
    test("GET /profile", async () => {
      const { status } = await get(token, "/profile");
      expect(status).toBe(200);
    });
  });

  describe("Developers", () => {
    test("GET /developers/api-keys", async () => {
      const { status, body } = await get(token, "/developers/api-keys");
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});
