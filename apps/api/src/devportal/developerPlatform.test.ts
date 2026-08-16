/**
 * Developer / API Platform tests.
 *
 * Covers developer application CRUD, API product listing/subscription, and
 * the granular-scope helper. Runs on FakePrisma with the audit service stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("../audit/audit.service.js", () => ({
  auditService: { log: vi.fn(async () => undefined), logFromRequest: vi.fn(async () => undefined) },
}));

const devApp = await import("./developerApp.service.js");
const { scopeLegacy } = await import("@windels/shared/developerPlatform");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

beforeEach(() => {
  db.reset();
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("User", [
    { id: USER_A, email: "alpha@example.com" },
    { id: USER_B, email: "beta@example.com" },
  ]);
  db.seed("UserProfile", [{ id: cuid(), userId: USER_A, displayName: "Alpha" }]);
});

describe("developer applications", () => {
  it("creates an app owned by the caller in their org", async () => {
    const app = await devApp.createDeveloperApp(USER_A, { name: "Trading Bot", environment: "development" });
    expect(app.name).toBe("Trading Bot");
    expect(app.environment).toBe("development");
    const row = db.tables.get("DeveloperApp")![0];
    expect(row.organizationId).toBe(ORG_A);
  });

  it("hides other orgs' apps", async () => {
    await devApp.createDeveloperApp(USER_A, { name: "Alpha App" });
    const forB = await devApp.listDeveloperApps(USER_B);
    expect(forB).toHaveLength(0);
    const forA = await devApp.listDeveloperApps(USER_A);
    expect(forA).toHaveLength(1);
  });

  it("denies updating another org's app", async () => {
    const app = await devApp.createDeveloperApp(USER_A, { name: "Secret" });
    await expect(devApp.updateDeveloperApp(USER_B, app.id, { name: "Hijack" })).rejects.toThrow();
  });

  it("deletes an app and detaches but preserves its api keys", async () => {
    const app = await devApp.createDeveloperApp(USER_A, { name: "Doomed" });
    const created = await (await import("../publicApi/publicApi.service.js")).createApiKey(USER_A, {
      name: "key", scopes: ["READ"], appId: app.id,
    } as any);
    await devApp.deleteDeveloperApp(USER_A, app.id);
    const rows = db.tables.get("DeveloperApp")!.filter((r) => r.id === app.id);
    expect(rows).toHaveLength(0);
    const key = db.tables.get("ApiKey")!.find((r) => r.id === created.id);
    expect(key).toBeTruthy(); // preserved
  });
});

describe("api products & subscriptions", () => {
  it("lists enabled products and subscribes", async () => {
    db.seed("ApiProduct", [
      { id: "p1", slug: "agents", name: "AI Agents", category: "agents", enabled: true, organizationId: null },
      { id: "p2", slug: "trading", name: "Trading Intel", category: "trading", enabled: true, organizationId: ORG_A },
      { id: "p3", slug: "hidden", name: "Hidden", category: "agents", enabled: false, organizationId: null },
    ]);
    const products = await devApp.listApiProducts(USER_A);
    expect(products.map((p) => p.slug)).toEqual(["agents", "trading"]);

    const app = await devApp.createDeveloperApp(USER_A, { name: "App" });
    const sub = await devApp.subscribeToProduct(USER_A, { appId: app.id, productId: "p1" });
    expect(sub.product.slug).toBe("agents");
    expect(sub.status).toBe("active");
    const subs = await devApp.listSubscriptions(USER_A);
    expect(subs).toHaveLength(1);
  });

  it("does not allow subscribing to a disabled product", async () => {
    db.seed("ApiProduct", [{ id: "p9", slug: "off", name: "Off", category: "agents", enabled: false, organizationId: null }]);
    await expect(devApp.subscribeToProduct(USER_A, { productId: "p9" })).rejects.toThrow();
  });
});

describe("scope helpers", () => {
  it("maps granular scopes to legacy", () => {
    expect(scopeLegacy("agents:read")).toBe("READ");
    expect(scopeLegacy("agents:execute")).toBe("WRITE");
    expect(scopeLegacy("media:generate")).toBe("WRITE");
    expect(scopeLegacy("analytics:read")).toBe("READ");
    expect(scopeLegacy("nfc:admin")).toBe("ADMIN");
  });
});

describe("requireScope granular enforcement", () => {
  function fakeRes() {
    const out: any = { statusCode: 0, body: null };
    out.status = (code: number) => { out.statusCode = code; return out; };
    out.json = (body: unknown) => { out.body = body; return out; };
    return out;
  }

  it("grants only the exact granular scope; a read scope never grants another product's read endpoint", async () => {
    const { requireScope } = await import("../http/middleware/apiKeyAuth.js");
    const run = (scopes: string[], required: string[]) => {
      let passed = false;
      const res = fakeRes();
      const mw = requireScope(...required);
      mw({ apiKeyScopes: ["READ"], apiKeyGranularScopes: scopes } as any, res, () => { passed = true; });
      return { passed, status: res.statusCode };
    };
    // agents:read grants agents list but not workflows (different product).
    expect(run(["agents:read"], ["agents:read"]).passed).toBe(true);
    expect(run(["agents:read"], ["workflows:read"]).passed).toBe(false);
    expect(run(["agents:read"], ["workflows:read"]).status).toBe(403);
    // agents:execute satisfies the execute route.
    expect(run(["agents:execute"], ["agents:execute"]).passed).toBe(true);
    // A key with no granular scopes falls back to legacy READ.
    expect(run([], ["agents:read"]).passed).toBe(true);
    expect(run([], ["agents:execute"]).passed).toBe(false);
  });
});
