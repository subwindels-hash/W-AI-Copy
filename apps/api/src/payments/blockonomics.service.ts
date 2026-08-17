/**
 * Blockonomics provider control plane and official HTTP API client (Stage 3).
 *
 * No billing/invoice mutation belongs here. The adapter returns validated
 * provider facts; later stages persist and settle them centrally.
 */
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { decryptString, encryptString, isEncryptedBlob, type EncryptedBlob } from "../security/encryption.js";
import { AppError } from "../utils/result.js";
import { BlockonomicsProviderSettingsSchema, type BlockonomicsAsset, type BlockonomicsProviderSettings } from "@windels/shared/payments";
import type { Prisma } from "@prisma/client";

const PROVIDER = "blockonomics";
const BASE_URL = "https://www.blockonomics.co/api";
const DEFAULT_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

export interface BlockonomicsSecretConfig extends BlockonomicsProviderSettings {
  apiKey: string;
  callbackSecret: string;
  source: "database" | "environment";
  version: number;
}

export interface BlockonomicsPublicConfig extends BlockonomicsProviderSettings {
  provider: "blockonomics";
  configured: boolean;
  apiKeyConfigured: boolean;
  callbackSecretConfigured: boolean;
  source: "database" | "environment" | "none";
  version: number;
  healthStatus: string;
  lastHealthAt: string | null;
  lastError: string | null;
}

function decryptSecret(value: unknown): string | null {
  return isEncryptedBlob(value) ? decryptString(value as EncryptedBlob) : null;
}
function envBool(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === undefined || value === "" ? fallback : value === "true";
}
function environmentSettings(): BlockonomicsProviderSettings {
  const supportedAssets = (process.env.BLOCKONOMICS_SUPPORTED_ASSETS || "BTC")
    .split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  return BlockonomicsProviderSettingsSchema.parse({
    enabled: envBool("BLOCKONOMICS_ENABLED", false),
    testMode: envBool("BLOCKONOMICS_TEST_MODE", false),
    matchCallback: process.env.BLOCKONOMICS_MATCH_CALLBACK || new URL(env.WINDELS_PUBLIC_API_ORIGIN).host,
    supportedAssets,
    quoteExpiryMinutes: Number(process.env.BLOCKONOMICS_QUOTE_EXPIRY_MINUTES || 15),
    requiredConfirmations: 2,
  });
}

async function storedRow() {
  return prisma.paymentProviderConfiguration.findUnique({ where: { provider: PROVIDER } });
}

export const BlockonomicsConfigService = {
  async secret(): Promise<BlockonomicsSecretConfig | null> {
    const row = await storedRow();
    if (row) {
      const apiKey = decryptSecret(row.apiKeyEnc);
      const callbackSecret = decryptSecret(row.callbackSecretEnc);
      const settings = BlockonomicsProviderSettingsSchema.parse({ ...(row.settings as any), enabled: row.enabled, testMode: row.testMode });
      if (!apiKey || !callbackSecret) return null;
      return { ...settings, apiKey, callbackSecret, source: "database", version: row.version };
    }
    const apiKey = process.env.BLOCKONOMICS_API_KEY?.trim();
    const callbackSecret = process.env.BLOCKONOMICS_CALLBACK_SECRET?.trim();
    if (!apiKey || !callbackSecret) return null;
    return { ...environmentSettings(), apiKey, callbackSecret, source: "environment", version: 1 };
  },

  async public(): Promise<BlockonomicsPublicConfig> {
    const row = await storedRow();
    if (row) {
      const settings = BlockonomicsProviderSettingsSchema.parse({ ...(row.settings as any), enabled: row.enabled, testMode: row.testMode });
      return {
        provider: PROVIDER, ...settings,
        configured: !!decryptSecret(row.apiKeyEnc) && !!decryptSecret(row.callbackSecretEnc),
        apiKeyConfigured: !!decryptSecret(row.apiKeyEnc),
        callbackSecretConfigured: !!decryptSecret(row.callbackSecretEnc),
        source: "database", version: row.version,
        healthStatus: row.healthStatus,
        lastHealthAt: row.lastHealthAt?.toISOString() ?? null,
        lastError: row.lastError,
      };
    }
    const settings = environmentSettings();
    const api = !!process.env.BLOCKONOMICS_API_KEY?.trim();
    const callback = !!process.env.BLOCKONOMICS_CALLBACK_SECRET?.trim();
    return {
      provider: PROVIDER, ...settings,
      configured: api && callback,
      apiKeyConfigured: api,
      callbackSecretConfigured: callback,
      source: api || callback ? "environment" : "none", version: 1,
      healthStatus: api && callback ? "CONFIGURED_NOT_VERIFIED" : "NOT_CONFIGURED",
      lastHealthAt: null, lastError: null,
    };
  },

  async upsert(input: {
    apiKey?: string;
    callbackSecret?: string;
    settings: BlockonomicsProviderSettings;
  }, actorId: string): Promise<BlockonomicsPublicConfig> {
    const current = await storedRow();
    // The first Super Admin write adopts environment bootstrap credentials into
    // encrypted PostgreSQL storage. Once a database row exists, it is the only
    // source of truth and missing DB secrets never fall back to environment.
    const previousApi = current ? decryptSecret(current.apiKeyEnc) : process.env.BLOCKONOMICS_API_KEY?.trim() || null;
    const previousCallback = current ? decryptSecret(current.callbackSecretEnc) : process.env.BLOCKONOMICS_CALLBACK_SECRET?.trim() || null;
    const apiKey = input.apiKey?.trim() || previousApi;
    const callbackSecret = input.callbackSecret?.trim() || previousCallback;
    if (input.settings.enabled && (!apiKey || !callbackSecret)) {
      throw AppError.badRequest("Blockonomics cannot be enabled without API key and callback secret");
    }
    const settings = BlockonomicsProviderSettingsSchema.parse(input.settings);
    await prisma.paymentProviderConfiguration.upsert({
      where: { provider: PROVIDER },
      create: {
        provider: PROVIDER, enabled: settings.enabled, testMode: settings.testMode,
        apiKeyEnc: apiKey ? encryptString(apiKey) as unknown as Prisma.InputJsonValue : undefined,
        callbackSecretEnc: callbackSecret ? encryptString(callbackSecret) as unknown as Prisma.InputJsonValue : undefined,
        settings: settings as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
        healthStatus: "CONFIGURED_NOT_VERIFIED",
      },
      update: {
        enabled: settings.enabled, testMode: settings.testMode,
        ...(input.apiKey ? { apiKeyEnc: encryptString(input.apiKey.trim()) as unknown as Prisma.InputJsonValue } : {}),
        ...(input.callbackSecret ? { callbackSecretEnc: encryptString(input.callbackSecret.trim()) as unknown as Prisma.InputJsonValue } : {}),
        settings: settings as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
        version: { increment: 1 },
        healthStatus: "CONFIGURED_NOT_VERIFIED",
        lastError: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: null,
        userId: actorId,
        action: "payment_provider.configuration_updated",
        resourceType: "PaymentProviderConfiguration",
        resourceId: PROVIDER,
        metadata: {
          provider: PROVIDER,
          enabled: settings.enabled,
          testMode: settings.testMode,
          supportedAssets: settings.supportedAssets,
          quoteExpiryMinutes: settings.quoteExpiryMinutes,
          apiKeyRotated: !!input.apiKey,
          callbackSecretRotated: !!input.callbackSecret,
        },
      },
    });
    logger.info("Blockonomics provider configuration updated", { provider: PROVIDER, actorId, enabled: settings.enabled, testMode: settings.testMode });
    return this.public();
  },

  async setEnabled(enabled: boolean, actorId: string): Promise<BlockonomicsPublicConfig> {
    const current = await this.public();
    const settings = BlockonomicsProviderSettingsSchema.parse({
      enabled,
      testMode: current.testMode,
      matchCallback: current.matchCallback,
      supportedAssets: current.supportedAssets,
      quoteExpiryMinutes: current.quoteExpiryMinutes,
      requiredConfirmations: 2,
    });
    return this.upsert({ settings }, actorId);
  },

  async recordHealth(healthy: boolean, error?: string): Promise<void> {
    const data = { healthStatus: healthy ? "HEALTHY" : "UNHEALTHY", lastHealthAt: new Date(), lastError: error?.slice(0, 500) ?? null };
    const current = await storedRow();
    if (current) {
      await prisma.paymentProviderConfiguration.update({ where: { provider: PROVIDER }, data });
      return;
    }
    const bootstrap = await this.secret();
    if (!bootstrap) return;
    const safeSettings = BlockonomicsProviderSettingsSchema.parse(bootstrap);
    await prisma.paymentProviderConfiguration.create({
      data: {
        provider: PROVIDER,
        enabled: bootstrap.enabled,
        testMode: bootstrap.testMode,
        apiKeyEnc: encryptString(bootstrap.apiKey) as unknown as Prisma.InputJsonValue,
        callbackSecretEnc: encryptString(bootstrap.callbackSecret) as unknown as Prisma.InputJsonValue,
        settings: safeSettings as unknown as Prisma.InputJsonValue,
        healthStatus: data.healthStatus,
        lastHealthAt: data.lastHealthAt,
        lastError: data.lastError,
      },
    });
  },
};

export interface BlockonomicsPaymentAddress {
  address: string;
  crypto: BlockonomicsAsset;
  reset: number;
  account?: string;
}
export interface BlockonomicsConfirmedPayment {
  id: number;
  timestamp: number;
  crypto: "BTC" | "USDT" | "BCH";
  amount: number;
  address: string;
  txid: string;
  store_name?: string;
  store_url?: string;
  fiat_value?: number;
}

export class BlockonomicsClient {
  constructor(
    private readonly config: Pick<BlockonomicsSecretConfig, "apiKey" | "matchCallback" | "testMode">,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  private async request<T>(operation: string, path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const url = new URL(path, `${BASE_URL}/`);
    if (url.origin !== "https://www.blockonomics.co") throw AppError.internal("Blockonomics API origin violation");
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          accept: "application/json",
          ...(authenticated ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      Metrics.increment("payments_provider_requests_total", 1, { provider: PROVIDER, operation, status: "network_error" });
      throw AppError.upstream(`Blockonomics ${operation} request failed`, { code: "BLOCKONOMICS_NETWORK_ERROR", operation, detail: (error as Error).message });
    } finally {
      Metrics.timing("payments_provider_latency_ms", Date.now() - started, { provider: PROVIDER, operation });
    }
    const text = await response.text();
    let body: any = {};
    if (text) { try { body = JSON.parse(text); } catch { body = { message: "invalid JSON response" }; } }
    Metrics.increment("payments_provider_requests_total", 1, { provider: PROVIDER, operation, status: String(response.status) });
    if (!response.ok) {
      throw AppError.upstream(`Blockonomics ${operation} failed (HTTP ${response.status})`, {
        code: "BLOCKONOMICS_API_ERROR", operation, upstreamStatus: response.status,
        message: String(body?.error?.message ?? body?.message ?? "provider rejected request").slice(0, 300),
      });
    }
    return body as T;
  }

  async createAddress(crypto: BlockonomicsAsset): Promise<BlockonomicsPaymentAddress> {
    const query = new URLSearchParams({ match_callback: this.config.matchCallback, crypto, reset: "0" });
    const body = await this.request<any>("create_address", `new_address?${query}`, { method: "POST" });
    if (typeof body.address !== "string" || body.address.length < 20 || (body.crypto && body.crypto !== crypto)) {
      throw AppError.upstream("Blockonomics create_address returned an invalid payment address", { code: "BLOCKONOMICS_INVALID_RESPONSE" });
    }
    return { address: body.address, crypto, reset: Number(body.reset ?? 0), account: typeof body.account === "string" ? body.account : undefined };
  }

  async getPrice(crypto: BlockonomicsAsset, currency: string): Promise<number> {
    const query = new URLSearchParams({ crypto, currency: currency.toUpperCase() });
    const body = await this.request<any>("get_price", `price?${query}`, { method: "GET" }, false);
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) throw AppError.upstream("Blockonomics get_price returned an invalid price", { code: "BLOCKONOMICS_INVALID_RESPONSE" });
    return price;
  }

  async monitorUsdtTransaction(txhash: string): Promise<number> {
    const body = await this.request<any>("monitor_usdt", "monitor_tx", {
      method: "POST",
      body: JSON.stringify({ txhash, crypto: "USDT", match_callback: this.config.matchCallback, testnet: this.config.testMode ? 1 : 0 }),
    });
    const status = Number(body.status);
    if (!Number.isInteger(status) || status < -1 || status > 2) throw AppError.upstream("Blockonomics monitor_tx returned an invalid status", { code: "BLOCKONOMICS_INVALID_RESPONSE" });
    return status;
  }

  async listConfirmedPayments(input: { crypto?: "BTC" | "USDT"; currency?: string; timeframe?: "1W" | "2W" | "1M" | "3M" | "6M" | "1Y"; limit?: number } = {}): Promise<BlockonomicsConfirmedPayment[]> {
    const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(input.limit ?? 200, 200))), timeframe: input.timeframe ?? "1M" });
    if (input.crypto) query.set("crypto", input.crypto);
    if (input.currency) query.set("currency", input.currency.toUpperCase());
    const body = await this.request<any>("list_payments", `v2/payments?${query}`, { method: "GET" });
    if (!Array.isArray(body.data)) throw AppError.upstream("Blockonomics list_payments returned an invalid response", { code: "BLOCKONOMICS_INVALID_RESPONSE" });
    return body.data.flatMap((item: any) => {
      if (!Number.isInteger(Number(item.id)) || !Number.isInteger(Number(item.amount)) || Number(item.amount) <= 0 || typeof item.address !== "string" || typeof item.txid !== "string") return [];
      return [{
        id: Number(item.id), timestamp: Number(item.timestamp), crypto: String(item.crypto) as "BTC" | "USDT" | "BCH",
        amount: Number(item.amount), address: item.address, txid: item.txid,
        store_name: item.store_name, store_url: item.store_url,
        fiat_value: item.fiat_value === undefined ? undefined : Number(item.fiat_value),
      }];
    });
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const started = Date.now();
    try {
      await this.listConfirmedPayments({ limit: 1, timeframe: "1W" });
      return { healthy: true, latencyMs: Date.now() - started };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - started, error: (error as Error).message };
    }
  }
}

export async function configuredBlockonomicsClient(fetchImpl: FetchLike = fetch): Promise<BlockonomicsClient> {
  const config = await BlockonomicsConfigService.secret();
  if (!config || !config.enabled) throw new AppError("SERVICE_UNAVAILABLE", "Blockonomics is not configured and enabled", 503, { code: "BLOCKONOMICS_NOT_CONFIGURED" });
  return new BlockonomicsClient(config, fetchImpl);
}
