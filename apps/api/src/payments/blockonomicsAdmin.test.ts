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

// Ledger fixture + captured query args for the Crypto Transactions search tests.
const txState = vi.hoisted(() => ({
  rows: [] as any[],
  lastArgs: null as any,
}));
function d(iso: string) { return new Date(iso); }

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
      findMany: vi.fn(async (args: any) => {
        // The dashboard() call omits orderBy-by-array; the search uses an array
        // orderBy. Route each to its own fixture so both suites stay isolated.
        if (Array.isArray(args?.orderBy)) {
          txState.lastArgs = args;
          return txState.rows.slice(0, args.take);
        }
        return [{
          id: "pay-1", organizationId: "org-1", internalReference: "BLK_1", status: "completed",
          amountCents: 1000, currency: "USD", cryptoCurrency: "BTC", confirmations: 2,
          requiredConfirmations: 2, reconciliationStatus: "matched",
          createdAt: new Date("2026-08-17T11:00:00.000Z"), updatedAt: new Date("2026-08-17T12:00:00.000Z"),
        }];
      }),
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
  txState.rows = [
    { id: "pay-2", organizationId: "org-1", requestedById: "user-9", internalReference: "BLK_2", providerTransactionId: "0xabc", cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", status: "completed", amountCents: 5000, currency: "USD", confirmations: 2, requiredConfirmations: 2, reconciliationStatus: "matched", paymentAddress: "0x" + "a".repeat(40), createdAt: d("2026-08-18T10:00:00.000Z"), confirmedAt: d("2026-08-18T10:20:00.000Z"), completedAt: d("2026-08-18T10:25:00.000Z") },
    { id: "pay-1", organizationId: "org-1", requestedById: "user-9", internalReference: "BLK_1", providerTransactionId: null, cryptoCurrency: "BTC", cryptoNetwork: "btc", status: "pending", amountCents: 1000, currency: "USD", confirmations: 0, requiredConfirmations: 2, reconciliationStatus: "pending", paymentAddress: "bc1q" + "z".repeat(38), createdAt: d("2026-08-17T11:00:00.000Z"), confirmedAt: null, completedAt: null },
  ];
  txState.lastArgs = null;
});

describe("Blockonomics Super Admin control plane", () => {
  it("requires the existing Super Admin guard on every control-plane route", async () => {
    expect(routeSource).toContain("admin.use(authenticate, requireSuperAdmin, rateLimit");
    expect(serverSource).toContain("registerBlockonomicsAdminRoutes(v1)");
    const invoke = (role: "admin" | "super_admin") => new Promise<any>((resolveNext) => {
      requireSuperAdmin({ user: { id: "actor", email: "actor@example.test", role, organizationId: null } } as any, {} as any, (error?: any) => resolveNext(error));
    });
    await expect(invoke("admin")).resolves.toMatchObject({ status: 403 });
    await expect(invoke("super_admin")).resolves.toBeUndefined();
  });

  it("exposes an audited per-asset ON/OFF toggle route behind the same guard", () => {
    // The BTC/USDT switches post to PATCH /assets, validated by the asset schema
    // and served by the config service's per-asset setter. The router mounts it
    // under the shared admin.use(authenticate, requireSuperAdmin, ...) guard.
    expect(routeSource).toContain('admin.patch("/assets"');
    expect(routeSource).toContain("BlockonomicsAdminAssetToggleSchema");
    expect(routeSource).toContain("BlockonomicsConfigService.setAssetEnabled");
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

  it("exposes a read-only searchable Crypto Transactions route behind the guard (no mark-as-paid)", () => {
    expect(routeSource).toContain('admin.get("/transactions"');
    expect(routeSource).toContain("BlockonomicsAdminTransactionQuerySchema");
    expect(routeSource).toContain("BlockonomicsAdminService.searchTransactions");
    // The read-only surface must never offer a balance-mutating settlement input.
    expect(routeSource).not.toMatch(/mark[_-]?as[_-]?paid/i);
  });

  it("maps ledger rows to a safe, admin-facing transaction shape", async () => {
    const page = await BlockonomicsAdminService.searchTransactions({});
    expect(page.transactions).toHaveLength(2);
    expect(page.transactions[0]).toMatchObject({
      id: "pay-2", reference: "BLK_2", requestedById: "user-9",
      asset: "USDT", network: "eth_erc20", status: "completed",
      amountCents: 5000, currency: "USD", confirmations: 2,
      providerTransactionId: "0xabc",
    });
    // Dates are serialized to ISO strings for transport.
    expect(page.transactions[0]!.createdAt).toBe("2026-08-18T10:00:00.000Z");
    expect(page.transactions[0]!.completedAt).toBe("2026-08-18T10:25:00.000Z");
    expect(page.transactions[1]!.completedAt).toBeNull();
  });

  it("filters by requesting user id, asset, and status", async () => {
    await BlockonomicsAdminService.searchTransactions({ userId: "user-9", asset: "USDT", status: "completed" });
    expect(txState.lastArgs.where).toMatchObject({
      provider: "blockonomics",
      requestedById: "user-9",
      cryptoCurrency: "USDT",
      status: "completed",
    });
  });

  it("searches transaction reference across internal reference and provider tx id", async () => {
    await BlockonomicsAdminService.searchTransactions({ reference: "BLK_2" });
    expect(txState.lastArgs.where.OR).toEqual([
      { internalReference: { contains: "BLK_2", mode: "insensitive" } },
      { providerTransactionId: { contains: "BLK_2", mode: "insensitive" } },
    ]);
  });

  it("keyset-paginates: returns a nextCursor only when more rows exist", async () => {
    // limit 1 over a 2-row fixture -> hasMore, cursor = first row id.
    const first = await BlockonomicsAdminService.searchTransactions({ limit: 1 });
    expect(first.transactions).toHaveLength(1);
    expect(first.nextCursor).toBe("pay-2");
    expect(txState.lastArgs.take).toBe(2); // limit + 1 lookahead

    // A cursor request skips the anchor row.
    await BlockonomicsAdminService.searchTransactions({ limit: 1, cursor: "pay-2" });
    expect(txState.lastArgs.cursor).toEqual({ id: "pay-2" });
    expect(txState.lastArgs.skip).toBe(1);
  });

  it("never returns a nextCursor when the page is not full", async () => {
    const page = await BlockonomicsAdminService.searchTransactions({ limit: 50 });
    expect(page.transactions).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});
