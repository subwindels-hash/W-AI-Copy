/**
 * Alerting dispatch tests.
 *
 * Pins that EMAIL/WEBHOOK alert channels perform real delivery (rather than the
 * previous MVP `console.log` stub): the webhook dispatch posts a signed payload
 * to the configured endpoint, and the HMAC signature verifies against the
 * shared secret. No SMTP/Redis/network required.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("./eventBus.js", () => ({ EventBus: { on: vi.fn(() => () => {}) } }));
vi.mock("./workspace.service.js", () => ({
  resolveUserContext: vi.fn(async (userId: string) => ({ organizationId: "org-a", workspaceId: "ws-a", organization: { id: "org-a" }, workspace: { id: "ws-a" } })),
}));

const alerting = await import("./alerting.service.js");

describe("alert rule CRUD", () => {
  beforeEach(() => { db.reset(); });

  it("creates and lists an org-scoped alert rule", async () => {
    const rule = await alerting.createAlertRule("u1", {
      name: "Workflow failed", event: "workflow.run.failed", severity: "CRITICAL", channels: ["IN_APP"],
    });
    expect(rule.name).toBe("Workflow failed");
    const rules = await alerting.listAlertRules("u1");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.organizationId).toBe("org-a");
  });

  it("seeds default rules only once", async () => {
    await alerting.ensureDefaultAlerts("org-a", "u1");
    await alerting.ensureDefaultAlerts("org-a", "u1");
    const rules = await alerting.listAlertRules("u1");
    expect(rules).toHaveLength(3);
  });
});

describe("alert webhook dispatch", () => {
  const originalEnv = { ...process.env };
  let captured: { url: string; init: any } | null = null;

  beforeEach(() => {
    captured = null;
    process.env.WINDELS_ALERT_WEBHOOK_URL = "https://pager.example/webhook";
    process.env.WINDELS_ALERT_WEBHOOK_SECRET = "test-secret";
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      captured = { url, init };
      return { ok: true, status: 200 };
    });
  });

  afterAll(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("posts a signed payload to the on-call webhook", async () => {
    await (alerting as any).__test__dispatchWebhook({
      id: "alert-1", title: "High CPU", severity: "CRITICAL", event: "metric.high", message: "cpu 95%", metadata: { v: 1 }, createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(captured).toBeTruthy();
    expect(captured!.url).toBe("https://pager.example/webhook");
    const headers = captured!.init.headers as Record<string, string>;
    const body = JSON.parse(captured!.init.body as string);
    expect(body.title).toBe("High CPU");
    expect(body.severity).toBe("CRITICAL");
    expect(headers["X-Windels-Alert"]).toBe("v1");
    // Verify the HMAC signature.
    const sig = headers["X-Windels-Signature"];
    const ts = headers["X-Windels-Timestamp"];
    expect(sig).toBeTruthy();
    expect(sig!.startsWith("v1=")).toBe(true);
    const expected = createHmac("sha256", "test-secret").update(`${ts}.${captured!.init.body}`).digest("hex");
    expect(sig).toBe(`v1=${expected}`);
  });

  it("skips silently when no webhook endpoint is configured", async () => {
    delete process.env.WINDELS_ALERT_WEBHOOK_URL;
    await (alerting as any).__test__dispatchWebhook({
      id: "a2", title: "t", severity: "WARNING", event: "e", message: "m", metadata: {}, createdAt: new Date(),
    });
    expect(captured).toBeNull();
  });
});
