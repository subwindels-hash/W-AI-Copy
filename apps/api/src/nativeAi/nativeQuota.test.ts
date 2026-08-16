import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
const { nativeAiQuota } = await import("../http/middleware/nativeAiQuota.js");
function res() { const out: any = { statusCode: 200, body: null }; out.status = (code: number) => { out.statusCode = code; return out; }; out.json = (body: any) => { out.body = body; return out; }; return out; }
const req: any = { apiOrganization: { id: "org-a" }, requestId: "req-test" };
beforeEach(() => db.reset());

describe("native AI billing/quota gate", () => {
  it("blocks an inactive existing billing subscription", async () => {
    db.seed("BillingSubscription", [{ id: "bill-a", organizationId: "org-a", status: "past_due", plan: "pro" }]);
    const response = res(); let next = false;
    await nativeAiQuota(req, response, () => { next = true; });
    expect(next).toBe(false); expect(response.statusCode).toBe(402); expect(response.body.error.code).toBe("billing_inactive");
  });
  it("enforces the existing native-ai API product quota", async () => {
    db.seed("ApiProduct", [{ id: "product-a", organizationId: null, slug: "native-ai", enabled: true }]);
    db.seed("ApiSubscription", [{ id: "sub-a", organizationId: "org-a", productId: "product-a", status: "active", quota: 10, usedThisMonth: 10 }]);
    const response = res(); let next = false;
    await nativeAiQuota(req, response, () => { next = true; });
    expect(next).toBe(false); expect(response.statusCode).toBe(429); expect(response.body.error.code).toBe("quota_exceeded");
  });
  it("allows an organization with no blocking billing or quota record", async () => {
    const response = res(); let next = false;
    await nativeAiQuota(req, response, () => { next = true; });
    expect(next).toBe(true);
  });
});
