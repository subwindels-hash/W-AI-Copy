/**
 * Admin API Control Center tests.
 *
 * Covers Super Admin controls: toggling product enabled state, adjusting a
 * product, approving/suspending developer applications, and the platform-wide
 * usage summary. Runs on FakePrisma with the audit service stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("../audit/audit.service.js", () => ({
  auditService: { log: vi.fn(async () => undefined), logFromRequest: vi.fn(async () => undefined) },
}));

const admin = await import("./adminApiControl.service.js");

const ORG_A = "org-alpha";
const ADMIN = "admin-1";

beforeEach(() => {
  db.reset();
  db.seed("Organization", [
    { id: ORG_A, name: "Alpha", slug: "alpha" },
  ]);
  db.seed("User", [{ id: ADMIN, email: "admin@windels.ai" }]);
});

describe("admin product controls", () => {
  it("lists products and toggles enabled state", async () => {
    db.seed("ApiProduct", [{ id: "p1", slug: "agents", name: "AI Agents", category: "agents", enabled: true, organizationId: null }]);
    const list = await admin.adminListProducts(ADMIN);
    expect(list).toHaveLength(1);
    expect(list[0]!.enabled).toBe(true);
    const updated = await admin.adminSetProductEnabled(ADMIN, "p1", false);
    expect(updated.enabled).toBe(false);
    const row = db.tables.get("ApiProduct")!.find((r) => r.id === "p1")!;
    expect(row.enabled).toBe(false);
  });

  it("updates product rate limit and price", async () => {
    db.seed("ApiProduct", [{ id: "p2", slug: "trading", name: "Trading", category: "trading", enabled: true, rateLimitPerMin: 30, basePriceUsd: 2, organizationId: null }]);
    const updated = await admin.adminUpdateProduct(ADMIN, "p2", { rateLimitPerMin: 100, basePriceUsd: 4 });
    expect(updated.rateLimitPerMin).toBe(100);
    expect(updated.basePriceUsd).toBe(4);
  });
});

describe("admin application controls", () => {
  it("approves and suspends an application across orgs", async () => {
    db.seed("DeveloperApp", [
      { id: "app1", organizationId: ORG_A, ownerId: ADMIN, name: "My App", environment: "production", active: true, productionApproved: false },
    ]);
    const approved = await admin.adminSetAppApproved(ADMIN, "app1", true);
    expect(approved.productionApproved).toBe(true);
    expect(approved.organizationName).toBe("Alpha");
    const suspended = await admin.adminSetAppActive(ADMIN, "app1", false);
    expect(suspended.active).toBe(false);
    const row = db.tables.get("DeveloperApp")!.find((r) => r.id === "app1")!;
    expect(row.active).toBe(false);
    expect(row.productionApproved).toBe(true);
  });

  it("rejects unknown apps", async () => {
    await expect(admin.adminSetAppApproved(ADMIN, "missing", true)).rejects.toThrow();
  });
});

describe("admin usage summary", () => {
  it("summarizes platform-wide usage", async () => {
    db.seed("ApiUsageRecord", [
      { id: "u1", organizationId: ORG_A, endpoint: "agents.execute", channel: "agents", status: 200, durationMs: 10, tokensIn: 100, tokensOut: 50, aiCostMicros: 5, createdAt: new Date() },
      { id: "u2", organizationId: ORG_A, endpoint: "trading.analysis", channel: "trading", status: 500, durationMs: 20, tokensIn: 0, tokensOut: 0, aiCostMicros: 0, createdAt: new Date() },
    ]);
    const s = await admin.adminUsageSummary(ADMIN, 7);
    expect(s.totalRequests).toBe(2);
    expect(s.successfulRequests).toBe(1);
    expect(s.failedRequests).toBe(1);
    expect(s.byChannel.find((c) => c.channel === "agents")?.count).toBe(1);
    expect(s.byEndpoint[0]!.endpoint).toBe("agents.execute");
    expect(s.byOrg[0]!.organizationName).toBe("Alpha");
  });
});
