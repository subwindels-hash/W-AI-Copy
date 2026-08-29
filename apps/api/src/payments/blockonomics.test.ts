import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: null as any }));
vi.mock("../db/client.js", () => ({
  prisma: {
    paymentProviderConfiguration: {
      findUnique: vi.fn(async () => state.row),
      upsert: vi.fn(async ({ create, update }: any) => {
        if (!state.row) {
          state.row = { id: "cfg-1", ...create, version: 1, createdAt: new Date(), updatedAt: new Date(), lastHealthAt: null, lastError: null };
        } else {
          state.row = {
            ...state.row, ...update,
            version: update.version?.increment ? state.row.version + update.version.increment : state.row.version,
            updatedAt: new Date(),
          };
        }
        return state.row;
      }),
      updateMany: vi.fn(async ({ data }: any) => { if (state.row) state.row = { ...state.row, ...data }; return { count: state.row ? 1 : 0 }; }),
      update: vi.fn(async ({ data }: any) => { state.row = { ...state.row, ...data, updatedAt: new Date() }; return state.row; }),
      create: vi.fn(async ({ data }: any) => {
        state.row = { id: "cfg-1", ...data, version: 1, createdAt: new Date(), updatedAt: new Date() };
        return state.row;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => ({ id: "audit-1", ...data })) },
  },
}));

process.env.WINDELS_ENCRYPTION_KEY = "3".repeat(64);
process.env.WINDELS_ENCRYPTION_KEY_ID = "blockonomics-test";
const { BlockonomicsClient, BlockonomicsConfigService, configuredBlockonomicsClient } = await import("./blockonomics.service.js");

const settings = {
  enabled: true,
  testMode: true,
  matchCallback: "payments.example.test",
  supportedAssets: ["BTC", "USDT"] as ("BTC" | "USDT")[],
  quoteExpiryMinutes: 15,
  requiredConfirmations: 2 as const,
};
const response = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  state.row = null;
  delete process.env.BLOCKONOMICS_API_KEY;
  delete process.env.BLOCKONOMICS_CALLBACK_SECRET;
  delete process.env.BLOCKONOMICS_ENABLED;
});

describe("Blockonomics encrypted provider configuration", () => {
  it("reports not configured without secrets", async () => {
    await expect(BlockonomicsConfigService.public()).resolves.toMatchObject({ provider: "blockonomics", configured: false, source: "none" });
    await expect(configuredBlockonomicsClient()).rejects.toMatchObject({ status: 503 });
  });

  it("rejects weak environment callback secrets as unconfigured", async () => {
    process.env.BLOCKONOMICS_API_KEY = "environment-api-key";
    process.env.BLOCKONOMICS_CALLBACK_SECRET = "too-short";
    process.env.BLOCKONOMICS_ENABLED = "true";
    await expect(BlockonomicsConfigService.public()).resolves.toMatchObject({ configured: false, callbackSecretConfigured: false });
    await expect(BlockonomicsConfigService.secret()).resolves.toBeNull();
  });

  it("stores API key and callback secret only as encrypted envelopes", async () => {
    const out = await BlockonomicsConfigService.upsert({ apiKey: "block-api-key-secret", callbackSecret: "callback-secret-value-at-least-32-chars", settings }, "super-admin");
    expect(out).toMatchObject({ configured: true, enabled: true, testMode: true, source: "database", version: 1 });
    expect(JSON.stringify(state.row)).not.toContain("block-api-key-secret");
    expect(JSON.stringify(state.row)).not.toContain("callback-secret-value-at-least-32-chars");
    expect(state.row.apiKeyEnc).toMatchObject({ v: "enc.v1", kid: "blockonomics-test" });
    await expect(BlockonomicsConfigService.secret()).resolves.toMatchObject({ apiKey: "block-api-key-secret", callbackSecret: "callback-secret-value-at-least-32-chars", source: "database" });
  });

  it("allows Super Admin disable without deleting encrypted credentials", async () => {
    await BlockonomicsConfigService.upsert({ apiKey: "block-api-key-secret", callbackSecret: "callback-secret-value-at-least-32-chars", settings }, "admin");
    const disabled = await BlockonomicsConfigService.upsert({ settings: { ...settings, enabled: false } }, "admin");
    expect(disabled).toMatchObject({ enabled: false, configured: true, version: 2 });
    await expect(configuredBlockonomicsClient()).rejects.toMatchObject({ status: 503 });
  });

  it("adopts environment bootstrap credentials into encrypted DB storage on first control-plane mutation", async () => {
    process.env.BLOCKONOMICS_API_KEY = "environment-api-key-secret";
    process.env.BLOCKONOMICS_CALLBACK_SECRET = "environment-callback-secret-value-at-least-32-chars";
    process.env.BLOCKONOMICS_ENABLED = "true";
    const disabled = await BlockonomicsConfigService.setEnabled(false, "super-admin");
    expect(disabled).toMatchObject({ source: "database", configured: true, enabled: false });
    expect(JSON.stringify(state.row)).not.toContain("environment-api-key-secret");
    expect(JSON.stringify(state.row)).not.toContain("environment-callback-secret-value-at-least-32-chars");
    expect(state.row.settings).not.toHaveProperty("apiKey");
    expect(state.row.settings).not.toHaveProperty("callbackSecret");
  });

  it("toggles BTC and USDT independently and allows a both-off state", async () => {
    process.env.BLOCKONOMICS_API_KEY = "environment-api-key-secret";
    process.env.BLOCKONOMICS_CALLBACK_SECRET = "environment-callback-secret-value-at-least-32-chars";
    process.env.BLOCKONOMICS_ENABLED = "true";
    // Adopt env credentials into DB storage with both assets on.
    const both = await BlockonomicsConfigService.upsert({ settings }, "super-admin");
    expect(both.supportedAssets).toEqual(["BTC", "USDT"]);

    // Turn USDT off -> only BTC remains; provider stays enabled.
    const btcOnly = await BlockonomicsConfigService.setAssetEnabled("USDT", false, "super-admin");
    expect(btcOnly.supportedAssets).toEqual(["BTC"]);
    expect(btcOnly.enabled).toBe(true);

    // Turn BTC off too -> both off is a valid, still-configured state.
    const noneOn = await BlockonomicsConfigService.setAssetEnabled("BTC", false, "super-admin");
    expect(noneOn.supportedAssets).toEqual([]);
    expect(noneOn.enabled).toBe(true);
    expect(noneOn.configured).toBe(true);

    // Re-enable USDT alone -> only USDT.
    const usdtOnly = await BlockonomicsConfigService.setAssetEnabled("USDT", true, "super-admin");
    expect(usdtOnly.supportedAssets).toEqual(["USDT"]);
  });

  it("keeps supportedAssets in canonical BTC-before-USDT order when re-enabling BTC", async () => {
    process.env.BLOCKONOMICS_API_KEY = "environment-api-key-secret";
    process.env.BLOCKONOMICS_CALLBACK_SECRET = "environment-callback-secret-value-at-least-32-chars";
    process.env.BLOCKONOMICS_ENABLED = "true";
    await BlockonomicsConfigService.upsert({ settings: { ...settings, supportedAssets: ["USDT"] } }, "super-admin");
    const both = await BlockonomicsConfigService.setAssetEnabled("BTC", true, "super-admin");
    expect(both.supportedAssets).toEqual(["BTC", "USDT"]);
  });
});

describe("official Blockonomics HTTP client", () => {
  const cfg = { apiKey: "provider-key", matchCallback: "payments.example.test", testMode: true };

  it("creates a new BTC address with reset=0 and bearer authentication", async () => {
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.origin).toBe("https://www.blockonomics.co");
      expect(url.pathname).toBe("/api/new_address");
      expect(url.searchParams.get("crypto")).toBe("BTC");
      expect(url.searchParams.get("reset")).toBe("0");
      expect(url.searchParams.get("match_callback")).toBe(cfg.matchCallback);
      expect((init.headers as any).authorization).toBe("Bearer provider-key");
      return response(200, { address: "bc1q" + "x".repeat(38), crypto: "BTC", reset: 0, account: "wallet" });
    });
    await expect(new BlockonomicsClient(cfg, fetchMock as any).createAddress("BTC")).resolves.toMatchObject({ crypto: "BTC", reset: 0 });
  });

  it("gets a live provider quote and never accepts an invalid price", async () => {
    const ok = new BlockonomicsClient(cfg, vi.fn(async () => response(200, { price: 100000 })) as any);
    await expect(ok.getPrice("BTC", "NGN")).resolves.toBe(100000);
    const bad = new BlockonomicsClient(cfg, vi.fn(async () => response(200, { price: 0 })) as any);
    await expect(bad.getPrice("BTC", "USD")).rejects.toMatchObject({ status: 502 });
  });

  it("submits USDT tx hashes to official monitor_tx with provider testnet truth", async () => {
    const txhash = "0x" + "a".repeat(64);
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.pathname).toBe("/api/monitor_tx");
      expect(JSON.parse(String(init.body))).toEqual({ txhash, crypto: "USDT", match_callback: cfg.matchCallback, testnet: 1 });
      return response(200, { status: 0 });
    });
    await expect(new BlockonomicsClient(cfg, fetchMock as any).monitorUsdtTransaction(txhash)).resolves.toBe(0);
  });

  it("lists confirmed provider payments for reconciliation", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/v2/payments");
      expect(url.searchParams.get("crypto")).toBe("BTC");
      return response(200, { data: [{ id: 42, timestamp: 1700000000, crypto: "BTC", amount: 500000, address: "bc1q" + "y".repeat(38), txid: "f".repeat(64), store_name: "WINDELS" }] });
    });
    const rows = await new BlockonomicsClient(cfg, fetchMock as any).listConfirmedPayments({ crypto: "BTC", currency: "USD" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 42, amount: 500000, crypto: "BTC" });
  });

  it("maps provider/network failures to upstream errors without fake data", async () => {
    const httpError = new BlockonomicsClient(cfg, vi.fn(async () => response(401, { message: "invalid key" })) as any);
    await expect(httpError.createAddress("BTC")).rejects.toMatchObject({ status: 502 });
    const networkError = new BlockonomicsClient(cfg, vi.fn(async () => { throw new Error("offline"); }) as any);
    await expect(networkError.listConfirmedPayments()).rejects.toMatchObject({ status: 502 });
  });
});
