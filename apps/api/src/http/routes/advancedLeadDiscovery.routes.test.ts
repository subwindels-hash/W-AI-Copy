/** Route contract tests: advanced endpoints remain organization-scoped and
 * protected independently of the legacy /lead-discovery router. Service logic
 * is isolated here; see advancedLeadDiscovery.test.ts for provider behavior. */
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  createSearch: vi.fn(), job: vi.fn(), jobHistory: vi.fn(), resultLeads: vi.fn(), list: vi.fn(), get: vi.fn(), setTags: vi.fn(),
  verifyEmail: vi.fn(), remove: vi.fn(), prepareOutreach: vi.fn(), interpret: vi.fn(), recommendations: vi.fn(), policy: vi.fn(),
  recordExport: vi.fn(), adminStatus: vi.fn(), updatePolicy: vi.fn(),
}));

function roleGate(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN" } });
    next();
  };
}
vi.mock("../middleware/auth.js", () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const role = req.header("x-test-role");
    if (!role) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
    req.user = { id: "api-user", email: "api-user@example.test", role: role as any, organizationId: req.header("x-test-org") ?? "api-org" };
    next();
  },
  requireAdmin: roleGate(["admin", "super_admin"]),
  requireSuperAdmin: roleGate(["super_admin"]),
}));
vi.mock("../../leadDiscovery/advancedLeadDiscovery.service.js", () => ({ AdvancedLeadDiscoveryService: service }));
vi.mock("../middleware/rateLimit.js", () => ({ rateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next() }));

const { registerAdvancedLeadDiscoveryRoutes } = await import("./advancedLeadDiscovery.js");

let server: ReturnType<express.Express["listen"]>;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerAdvancedLeadDiscoveryRoutes(router);
  app.use("/lead-discovery", router);
  // Preserve the API's observable error status for validation/policy tests.
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error?.status ?? 500).json({ ok: false, error: { code: error?.code ?? "INTERNAL", message: error?.message } });
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test API did not bind a TCP port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => {
  Object.values(service).forEach((mock) => mock.mockReset());
  service.createSearch.mockResolvedValue({ id: "leadjob-api", status: "queued" });
  service.policy.mockResolvedValue({ enabled: true, verificationEnabled: true, exportEnabled: true, allowPersonalEmailDomainFiltering: false, maxResultsPerSearch: 50, retentionDays: 365 });
  service.remove.mockResolvedValue({ id: "lead-api", deleted: true });
  service.updatePolicy.mockResolvedValue({ enabled: false, verificationEnabled: true, exportEnabled: true, allowPersonalEmailDomainFiltering: false, maxResultsPerSearch: 50, retentionDays: 365 });
  service.get.mockResolvedValue({ id: "lead-api", name: "Provider record" });
});

async function request(path: string, init: RequestInit = {}, role?: string) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(role ? { "x-test-role": role, "x-test-org": "org-route-a" } : {}), ...(init.headers ?? {}) },
  });
}

describe("advanced lead discovery API and RBAC", () => {
  it("requires authentication before a provider search is queued", async () => {
    const res = await request("/lead-discovery/advanced/search", { method: "POST", body: JSON.stringify({ mode: "business", keywords: ["logistics"] }) });
    expect(res.status).toBe(401);
    expect(service.createSearch).not.toHaveBeenCalled();
  });

  it("accepts a valid search as 202 and passes the request's organization and actor", async () => {
    const res = await request("/lead-discovery/advanced/search", { method: "POST", body: JSON.stringify({ mode: "business", keywords: ["logistics"], limit: 5 }) }, "member");
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, data: { job: { id: "leadjob-api" }, pollAfterMs: 750 } });
    expect(service.createSearch).toHaveBeenCalledWith("org-route-a", "api-user", expect.objectContaining({ mode: "business", keywords: ["logistics"] }));
  });

  it("exposes the authenticated local evidence-review API without an outbound action", async () => {
    service.recommendations.mockResolvedValue({ recommendations: [], note: "Local only" });
    const res = await request("/lead-discovery/advanced/agent/recommendations", { method: "POST", body: JSON.stringify({ leadIds: ["lead-api"] }) }, "member");
    expect(res.status).toBe(200);
    expect(service.recommendations).toHaveBeenCalledWith("org-route-a", ["lead-api"], "api-user");
  });

  it("reserves destructive lead removal for organization administrators", async () => {
    const member = await request("/lead-discovery/advanced/leads/lead-api", { method: "DELETE" }, "member");
    expect(member.status).toBe(403);
    expect(service.remove).not.toHaveBeenCalled();

    const admin = await request("/lead-discovery/advanced/leads/lead-api", { method: "DELETE" }, "admin");
    expect(admin.status).toBe(200);
    expect(service.remove).toHaveBeenCalledWith("org-route-a", "lead-api", "api-user");
  });

  it("keeps policy management Super Admin-only", async () => {
    const member = await request("/lead-discovery/advanced/admin/policy", { method: "PATCH", body: JSON.stringify({ enabled: false }) }, "admin");
    expect(member.status).toBe(403);
    expect(service.updatePolicy).not.toHaveBeenCalled();

    const superAdmin = await request("/lead-discovery/advanced/admin/policy", { method: "PATCH", body: JSON.stringify({ enabled: false }) }, "super_admin");
    expect(superAdmin.status).toBe(200);
    expect(service.updatePolicy).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }), "api-user");
  });

  it("blocks structured export when Super Admin compliance policy disables it", async () => {
    service.policy.mockResolvedValueOnce({ enabled: true, verificationEnabled: true, exportEnabled: false, allowPersonalEmailDomainFiltering: false, maxResultsPerSearch: 50, retentionDays: 365 });
    const res = await request("/lead-discovery/advanced/export", { method: "POST", body: JSON.stringify({ leadIds: ["lead-api"] }) }, "member");
    expect(res.status).toBe(403);
    expect(service.get).not.toHaveBeenCalled();
    expect(service.recordExport).not.toHaveBeenCalled();
  });
});
