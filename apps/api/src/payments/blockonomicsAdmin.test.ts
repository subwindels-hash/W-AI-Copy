import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockonomicsAdminConfigUpdateSchema } from "@windels/shared/payments";
import { requireSuperAdmin } from "../http/middleware/auth.js";

const state = vi.hoisted(() => ({ health: { healthy: true, latencyMs: 42 } as { healthy: boolean; latencyMs: number; error?: string } }));
const publicConfig = {
  provider: "blockonomics" as const,
  configured: true,
  apiKeyConfigured: true,
  callbackSecretConfigured: true,
  source: "database" as const,
  version: 3,
  enabled: true,
  testMode: true,
  matchCallback: "payments.example.test",
  supportedAssets: ["BTC", "USDT"] as ("BTC" | "USDT")[],
  quoteExpiryMinutes: 15,
  requiredConfirmations: 2 as const,
  healthStatus: "HEALTHY",
  lastHealthAt: "2026-08-17T12:00:00.000Z",
  lastError: null,
};
const recordHealth = vi.fn();
const auditCreate = vi.fn();

vi.mock("./blockonomics.service.js", () => ({
  BlockonomicsConfigService: {
    public: vi.fn(async () => publicConfig),
    secret: vi.fn(async () => ({ ...publicConfig, apiKey: "never-return-this", callbackSecret: "never-return-this-either" })),
    recordHealth,
  },
  BlockonomicsClient: class {
    async health() { return state.health; }
  },
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    paymentRecord: {
      count: vi.fn(async () => 4),
      groupBy: vi.fn(async ({ by }: any) => {
        if (by[0] === "status") return [{ status: "completed", _count: { _all: 3 } }, { status: "pending", _count: { _all: 1 } }];
        if (by[0] === "reconciliationStatus") return [{ reconciliationStatus: "matched", _count: { _all: 3 } }, { reconciliationStatus: "pending", _count: { _all: 1 } }];
        return [{ cryptoCurrency: "BTC", _count: { _all: 2 } }, { cryptoCurrency: "USDT", _count: { _all: 2 } }];
      }),
      findMany: vi.fn(async () => [{
        id: "pay-1", organizationId: "org-1", internalReference: "BLK_1", status: "completed",
        amountCents: 1000, currency: "USD", cryptoCurrency: "BTC", confirmations: 2,
        requiredConfirmations: 2, reconciliationStatus: "matched",
        createdAt: new Date("2026-08-17T11:00:00.000Z"), updatedAt: new Date("2026-08-17T12:00:00.000Z"),
      }]),
    },
    paymentWebhookEvent: {
      count: vi.fn(async ({ where }: any) => where.processingStatus === "failed" ? 1 : 5),
      groupBy: vi.fn(async () => [{ processingStatus: "processed", _count: { _all: 4 } }, { processingStatus: "failed", _count: { _all: 1 } }]),
      findMany: vi.fn(async () => [{
        id: "evt-1", paymentId: "pay-1", errorCode: "UPSTREAM", errorMessage: "provider unavailable",
        attempts: 2, receivedAt: new Date("2026-08-17T12:00:00.000Z"),
      }]),
    },
    auditLog: {
      create: auditCreate,
      findMany: vi.fn(async () => [{
        id: "run-1",
        metadata: { trigger: "manual", timeframe: "1M", matched: 2, settled: 1, issues: [{ kind: "provider_payment_missing" }] },
        createdAt: new Date("2026-08-17T12:00:00.000Z"),
      }]),
    },
  },
}));

const { BlockonomicsAdminService } = await import("./blockonomicsAdmin.service.js");
const routeSource = readFileSync(resolve(import.meta.dirname, "../http/routes/blockonomicsAdmin.ts"), "utf8");
const serverSource = readFileSync(resolve(import.meta.dirname, "../http/server.ts"), "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  state.health = { healthy: true, latencyMs: 42 };
});

describe("Blockonomics Super Admin control plane", () => {
  it("requires the existing Super Admin guard on every control-plane route", async () => {
    expect(routeSource).toContain("admin.use(authenticate, requireSuperAdmin)");
    expect(serverSource).toContain("registerBlockonomicsAdminRoutes(v1)");
    const invoke = (role: "admin" | "super_admin") => new Promise<any>((resolveNext) => {
      requireSuperAdmin({ user: { id: "actor", email: "actor@example.test", role, organizationId: null } } as any, {} as any, (error?: any) => resolveNext(error));
    });
    await expect(invoke("admin")).resolves.toMatchObject({ status: 403 });
    await expect(invoke("super_admin")).resolves.toBeUndefined();
  });

  it("validates secret rotation input without ever accepting a short callback secret", () => {
    const settings = { enabled: true, testMode: true, matchCallback: "payments.example.test", supportedAssets: ["BTC"], quoteExpiryMinutes: 15, requiredConfirmations: 2 };
    expect(BlockonomicsAdminConfigUpdateSchema.safeParse({ apiKey: "provider-api-key", callbackSecret: "short", settings }).success).toBe(false);
    expect(BlockonomicsAdminConfigUpdateSchema.safeParse({ apiKey: "provider-api-key", callbackSecret: "x".repeat(48), settings }).success).toBe(true);
  });

  it("returns truthful payment, webhook, error, asset, and reconciliation dashboard data without secrets", async () => {
    const dashboard = await BlockonomicsAdminService.dashboard();
    expect(dashboard.totals).toEqual({ payments: 4, webhookEvents: 5, failedWebhookEvents: 1 });
    expect(dashboard.paymentsByStatus).toContainEqual({ status: "completed", count: 3 });
    expect(dashboard.reconciliationByStatus).toContainEqual({ status: "matched", count: 3 });
    expect(dashboard.paymentsByAsset).toContainEqual({ asset: "USDT", count: 2 });
    expect(dashboard.recentWebhookErrors[0]).toMatchObject({ errorCode: "UPSTREAM", attempts: 2 });
    expect(dashboard.recentReconciliationRuns[0]).toMatchObject({ trigger: "manual", matched: 2, settled: 1, issueCount: 1 });
    expect(JSON.stringify(dashboard)).not.toContain("never-return-this");
  });

  it("runs a read-only provider health probe, persists posture, and audits the actor", async () => {
    const result = await BlockonomicsAdminService.checkHealth("super-admin");
    expect(result).toMatchObject({ healthy: true, latencyMs: 42, healthStatus: "HEALTHY" });
    expect(recordHealth).toHaveBeenCalledWith(true, undefined);
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "super-admin",
      action: "payment_provider.health_checked",
      metadata: expect.objectContaining({ healthy: true, latencyMs: 42 }),
    }) });
  });
});
