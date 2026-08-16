import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../config/logger.js", () => ({ logger: { warn: vi.fn() } }));
const { apiDashboardMetrics, recordUsage } = await import("../publicApi/apiUsage.service.js");

beforeEach(() => {
  db.reset();
  db.seed("ApiProduct", [{ id: "native-product", organizationId: null, slug: "native-ai", enabled: true }]);
  db.seed("ApiSubscription", [{ id: "native-sub", organizationId: "org-a", productId: "native-product", status: "active", quota: 100, usedThisMonth: 0 }]);
});

describe("native API usage and existing billing integration", () => {
  it("persists the complete AI/resource ledger and increments the existing product subscription", async () => {
    await recordUsage({ organizationId: "org-a", apiKeyId: "key-a", appId: null, userId: "user-a", method: "POST", path: "/v1/chat/completions", endpoint: "native.chat.completions", status: 200, durationMs: 40, channel: "ai", productSlug: "native-ai", tokensIn: 100, tokensOut: 50, aiCostMicros: 700, actualCostMicros: null, requestId: "req-1", model: "windels-native", provider: "provider-a", toolCalls: 1, agentRuns: 1, workflowExecutions: 0, images: 0, audioSeconds: 0, storageBytes: 25, environment: "test", permission: "ai:execute" });
    expect(db.tables.get("ApiUsageRecord")![0]).toMatchObject({ organizationId: "org-a", requestId: "req-1", model: "windels-native", provider: "provider-a", tokensIn: 100, tokensOut: 50, toolCalls: 1, agentRuns: 1, actualCostMicros: null });
    expect(db.tables.get("ApiSubscription")![0].usedThisMonth).toBe(1);
  });

  it("computes real resource totals without turning unavailable actual cost into an estimate", async () => {
    await recordUsage({ organizationId: "org-a", apiKeyId: null, appId: null, userId: null, method: "POST", path: "/v1/images", endpoint: "native.images.generate", status: 200, channel: "media", productSlug: "native-ai", images: 2, storageBytes: 2048, aiCostMicros: 100, actualCostMicros: null, model: "windels-image-1" });
    const metrics = await apiDashboardMetrics("org-a", { days: 7, page: 1, perPage: 20 });
    expect(metrics).toMatchObject({ totalRequests: 1, images: 2, storageBytes: 2048, estimatedCostUsd: 0.000001 });
    // Real PostgreSQL SUM over an all-null column is null. FakePrisma uses zero;
    // the row itself remains null and is never relabelled as actual cost.
    expect(db.tables.get("ApiUsageRecord")![0].actualCostMicros).toBeNull();
  });
});
