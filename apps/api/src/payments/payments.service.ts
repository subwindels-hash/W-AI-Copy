/**
 * Fail-closed multi-provider payment orchestration.
 *
 * A transaction can become completed only from a typed, provider-verified
 * result whose provider, reference, amount, and currency match the recorded
 * checkout. Webhook events are indexed globally by opaque provider reference,
 * while every transaction remains organization-scoped.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { EventBus } from "../services/eventBus.js";
import * as billing from "../services/billing.service.js";
import { FlutterwaveService } from "./flutterwave.service.js";
import { PaystackService } from "./paystack.service.js";
import { PayPalService } from "./paypal.service.js";
import { StripeService } from "./stripe.service.js";
import { CryptoPaymentsService } from "./crypto.service.js";
import { BlockonomicsConfigService } from "./blockonomics.service.js";
import { BlockonomicsPaymentService } from "./blockonomicsPayment.service.js";
import { AppError } from "../utils/result.js";
import { sameMoney } from "./paymentConfig.js";
import type {
  PaymentProviderConfig,
  PaymentTransaction,
  PaymentCheckoutRequestInput,
  PaymentTransactionStatus,
  PaymentProvider,
} from "@windels/shared";

const K = {
  idx: (oid: string) => `pay:tx:idx:${oid}`,
  item: (oid: string, id: string) => `pay:tx:i:${oid}:${id}`,
  reference: (provider: string, reference: string) => `pay:ref:${provider}:${reference}`,
  webhook: (provider: string, eventId: string) => `pay:webhook:${provider}:${eventId}`,
  probe: (id: string) => `pay:probe:${id}`,
};

const MAX_TRANSACTION_LIMIT = 500;
const memoryLedger = new Map<string, PaymentTransaction[]>();

type VerificationSource = "provider_api" | "verified_webhook";
export interface VerifiedPaymentEvidence {
  verified: true;
  provider: Exclude<PaymentProvider, "crypto">;
  reference: string;
  status: PaymentTransactionStatus;
  amount: number;
  currency: string;
  providerTransactionId: string;
  verificationSource?: VerificationSource;
  eventId?: string;
  verifiedAt?: string;
  details?: Record<string, unknown>;
}

function getMemoryLedger(orgId: string): PaymentTransaction[] {
  let list = memoryLedger.get(orgId);
  if (!list) { list = []; memoryLedger.set(orgId, list); }
  return list;
}

function providerConfig(provider: PaymentProvider) {
  if (provider === "flutterwave") return FlutterwaveService.configuration();
  if (provider === "paystack") return PaystackService.configuration();
  if (provider === "stripe") return StripeService.configuration();
  if (provider === "paypal") return PayPalService.configuration();
  return CryptoPaymentsService.configuration();
}

const PROVIDERS: Array<Omit<PaymentProviderConfig, "active" | "configured" | "status" | "configurationIssue" | "testMode">> = [
  { provider: "flutterwave", supportedCurrencies: ["NGN", "GHS", "KES", "ZAR", "USD"], displayName: "Flutterwave (African & Global Card/Mobile Money)" },
  { provider: "paystack", supportedCurrencies: ["NGN", "GHS", "ZAR", "KES"], displayName: "Paystack (African Card & Bank Transfer)" },
  { provider: "stripe", supportedCurrencies: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "NGN", "ZAR"], displayName: "Stripe (Global Card, Wallets & Bank Methods)" },
  { provider: "paypal", supportedCurrencies: ["USD", "EUR", "GBP", "CAD", "AUD"], displayName: "PayPal (Global Checkout Orders)" },
  { provider: "crypto", supportedCurrencies: [], supportedNetworks: [], displayName: "Crypto payments (disabled pending chain verification)" },
  { provider: "blockonomics", supportedCurrencies: ["USD", "EUR", "GBP", "NGN", "GHS", "KES", "ZAR", "CAD", "AUD", "JPY"], supportedNetworks: ["btc", "eth_erc20"], displayName: "Blockonomics (BTC & USDT ERC-20)" },
];

export const PaymentGatewaysService = {
  async listProviders(): Promise<PaymentProviderConfig[]> {
    return Promise.all(PROVIDERS.map(async (base) => {
      if (base.provider === "blockonomics") {
        const cfg = await BlockonomicsConfigService.public();
        return {
          ...base,
          active: false, // Stage 4 payment creation gate is not open yet.
          configured: cfg.configured,
          status: !cfg.configured ? "not_configured" as const : !cfg.enabled ? "disabled" as const : "blocked" as const,
          configurationIssue: cfg.configured
            ? cfg.enabled ? "Configured; payment creation remains blocked until Stage 4 is complete" : "Disabled by Super Admin"
            : "API key and callback secret are required",
          testMode: cfg.testMode,
        };
      }
      const cfg = providerConfig(base.provider);
      const blocked = base.provider === "crypto";
      return {
        ...base,
        active: cfg.configured && !blocked,
        configured: cfg.configured,
        status: blocked ? "blocked" as const : cfg.configured ? "ready" as const : "not_configured" as const,
        configurationIssue: cfg.issue,
        testMode: cfg.testMode,
      };
    }));
  },

  async assertLedgerAvailable(): Promise<void> {
    const key = K.probe(randomUUID());
    try {
      await redis.set(key, "1", "EX", 10);
      await redis.del(key);
    } catch (error) {
      throw AppError.serviceUnavailable(`Payment ledger is unavailable: ${(error as Error).message}`);
    }
  },

  async recordTransaction(tx: PaymentTransaction): Promise<void> {
    const orgId = tx.organizationId;
    const nowTs = new Date(tx.createdAt).getTime();
    try {
      const idxKey = K.idx(orgId);
      const itemKey = K.item(orgId, tx.id);
      const multi = typeof (redis as any).multi === "function" ? (redis as any).multi() : null;
      if (multi) {
        multi.set(itemKey, JSON.stringify(tx));
        multi.zadd(idxKey, String(nowTs), tx.id);
        multi.set(K.reference(tx.provider, tx.reference), JSON.stringify({ organizationId: orgId, transactionId: tx.id }), "EX", 366 * 86400);
        await multi.exec();
      } else {
        await redis.set(itemKey, JSON.stringify(tx));
        await redis.zadd(idxKey, String(nowTs), tx.id);
        await redis.set(K.reference(tx.provider, tx.reference), JSON.stringify({ organizationId: orgId, transactionId: tx.id }), "EX", 366 * 86400);
      }
      const count = await redis.zcard(idxKey);
      if (count > MAX_TRANSACTION_LIMIT) {
        const oldIds = await redis.zrange(idxKey, 0, count - MAX_TRANSACTION_LIMIT - 1);
        if (oldIds.length) {
          await redis.zrem(idxKey, ...oldIds);
          for (const oldId of oldIds) await redis.del(K.item(orgId, oldId));
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw AppError.serviceUnavailable(`Payment ledger write failed: ${(error as Error).message}`);
      }
      logger.warn("payment ledger write failed; using test/development memory ledger", { error: (error as Error).message });
    }

    const mem = getMemoryLedger(orgId);
    const idx = mem.findIndex((item) => item.id === tx.id || (item.provider === tx.provider && item.reference === tx.reference));
    if (idx >= 0) mem[idx] = structuredClone(tx);
    else { mem.unshift(structuredClone(tx)); if (mem.length > MAX_TRANSACTION_LIMIT) mem.length = MAX_TRANSACTION_LIMIT; }
  },

  async initiateCheckout(organizationId: string, input: PaymentCheckoutRequestInput, requestedById?: string): Promise<PaymentTransaction> {
    if (!organizationId) throw AppError.badRequest("Organization is required for payment checkout");
    await this.assertLedgerAvailable();
    const provider = input.provider;
    if (provider === "blockonomics") {
      if (!requestedById) throw AppError.forbidden("An authenticated requester is required for Blockonomics checkout");
      return BlockonomicsPaymentService.create(organizationId, requestedById, {
        amount: Number(input.amount), currency: String(input.currency || "USD"),
        cryptoCurrency: input.cryptoCurrency ?? "BTC", invoiceId: input.invoiceId,
        description: input.description, customerEmail: input.customerEmail,
      });
    }
    const cfg = providerConfig(provider);
    if (!cfg.configured || provider === "crypto") {
      throw new AppError("SERVICE_UNAVAILABLE", `${provider} payment provider is unavailable`, 503, {
        provider,
        code: provider === "crypto" ? "PAYMENT_PROVIDER_BLOCKED" : "PAYMENT_PROVIDER_NOT_CONFIGURED",
        issue: cfg.issue,
      });
    }

    const amount = Number(input.amount);
    const currency = String(input.currency || "USD").toUpperCase();
    const nowIso = new Date().toISOString();
    const id = `tx_${Date.now()}_${randomUUID().slice(0, 8)}`;
    let reference: string;
    let checkoutUrl: string;
    let adapterMetadata: Record<string, unknown> = {};

    if (provider === "flutterwave") {
      const result = await FlutterwaveService.initializePayment({ amount, currency, customerEmail: input.customerEmail, description: input.description, invoiceId: input.invoiceId });
      reference = result.reference; checkoutUrl = result.checkoutUrl;
    } else if (provider === "paystack") {
      const result = await PaystackService.initializePayment({ amount, currency, customerEmail: input.customerEmail, description: input.description, invoiceId: input.invoiceId });
      reference = result.reference; checkoutUrl = result.checkoutUrl; adapterMetadata = { accessCode: result.accessCode };
    } else if (provider === "stripe") {
      const result = await StripeService.createCheckoutSession({ amount, currency, customerEmail: input.customerEmail, description: input.description, invoiceId: input.invoiceId });
      reference = result.reference; checkoutUrl = result.checkoutUrl; adapterMetadata = { sessionId: result.sessionId };
    } else if (provider === "paypal") {
      const result = await PayPalService.createOrder({ amount, currency, description: input.description, invoiceId: input.invoiceId });
      reference = result.orderId; checkoutUrl = result.approvalUrl; adapterMetadata = { clientReference: result.clientReference };
    } else {
      throw new AppError("SERVICE_UNAVAILABLE", "Crypto payments are disabled", 503);
    }

    const tx: PaymentTransaction = {
      id, organizationId, provider, reference, amount, currency,
      status: "pending", invoiceId: input.invoiceId || null,
      description: input.description, customerEmail: input.customerEmail,
      checkoutUrl, createdAt: nowIso, completedAt: null,
      metadata: { initiatedBy: "PaymentGatewaysService", ...adapterMetadata },
    };
    await this.recordTransaction(tx);
    await EventBus.emit("payment.pending", { transactionId: id, organizationId, provider, reference, amount, currency }).catch(() => {});
    return tx;
  },

  async applyVerifiedResult(organizationId: string, referenceOrId: string, evidence: VerifiedPaymentEvidence): Promise<PaymentTransaction> {
    if (evidence?.verified !== true) throw AppError.forbidden("Unverified payment evidence cannot settle a transaction");
    let tx = await this.getTransactionByRef(organizationId, referenceOrId);
    if (!tx) tx = await this.getTransaction(organizationId, referenceOrId);
    if (!tx) throw AppError.notFound("Payment transaction not found in organization");
    if (tx.provider !== evidence.provider) throw AppError.conflict("Payment provider does not match the recorded transaction");
    if (tx.reference !== evidence.reference) throw AppError.conflict("Payment reference does not match the recorded transaction");
    if (!sameMoney(Number(evidence.amount), tx.amount)) {
      throw AppError.conflict(`Verified payment amount ${evidence.amount} does not match expected amount ${tx.amount}`);
    }
    if (String(evidence.currency).toUpperCase() !== tx.currency.toUpperCase()) {
      throw AppError.conflict(`Verified payment currency ${evidence.currency} does not match expected currency ${tx.currency}`);
    }
    if (!evidence.providerTransactionId) throw AppError.conflict("Provider transaction identifier is required");

    const previousProof = (tx.metadata as any)?.verification;
    if (tx.status === "completed") {
      if (evidence.status === "completed" && previousProof?.providerTransactionId === evidence.providerTransactionId) return tx;
      if (evidence.status !== "refunded") throw AppError.conflict("Completed payment cannot transition to another state or provider transaction");
    } else if (evidence.status === "refunded") {
      throw AppError.conflict("Only a completed payment can be refunded");
    }

    tx.status = evidence.status;
    tx.completedAt = evidence.status === "completed" ? new Date().toISOString() : tx.completedAt ?? null;
    tx.metadata = {
      ...(tx.metadata ?? {}),
      verification: {
        providerTransactionId: evidence.providerTransactionId,
        source: evidence.verificationSource ?? "provider_api",
        eventId: evidence.eventId,
        verifiedAt: evidence.verifiedAt ?? new Date().toISOString(),
        details: evidence.details ?? {},
      },
    };
    await this.recordTransaction(tx);

    await EventBus.emit(evidence.status === "completed" ? "payment.succeeded" : `payment.${evidence.status}`, {
      transactionId: tx.id, organizationId, provider: tx.provider,
      reference: tx.reference, amount: tx.amount, currency: tx.currency,
      providerTransactionId: evidence.providerTransactionId,
    }).catch(() => {});

    if (evidence.status === "completed" && tx.invoiceId) {
      try {
        await billing.markInvoicePaidForOrganization(organizationId, tx.invoiceId, {
          source: tx.provider,
          paymentId: tx.id,
          providerTransactionId: evidence.providerTransactionId,
        });
        tx.metadata = { ...(tx.metadata ?? {}), invoiceSettlement: { status: "completed", at: new Date().toISOString() } };
      } catch (error) {
        tx.metadata = { ...(tx.metadata ?? {}), invoiceSettlement: { status: "failed", at: new Date().toISOString(), error: (error as Error).message } };
        logger.error("payment verified but invoice settlement failed; reconciliation required", { transactionId: tx.id, invoiceId: tx.invoiceId, organizationId, err: error });
      }
      await this.recordTransaction(tx);
    }
    return tx;
  },

  async resolveProviderTransaction(provider: PaymentProvider, reference: string): Promise<PaymentTransaction | null> {
    try {
      const raw = await redis.get(K.reference(provider, reference));
      if (raw) {
        const index = JSON.parse(raw) as { organizationId: string; transactionId: string };
        const tx = await this.getTransaction(index.organizationId, index.transactionId);
        if (tx?.provider === provider && tx.reference === reference) return tx;
      }
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw AppError.serviceUnavailable(`Payment reference index unavailable: ${(error as Error).message}`);
    }
    if (process.env.NODE_ENV !== "production") {
      for (const items of memoryLedger.values()) {
        const tx = items.find((item) => item.provider === provider && item.reference === reference);
        if (tx) return structuredClone(tx);
      }
    }
    return null;
  },

  async claimWebhookEvent(provider: PaymentProvider, eventId: string): Promise<boolean> {
    if (!eventId) throw AppError.badRequest("Payment webhook event ID is required");
    try {
      const result = await (redis as any).set(K.webhook(provider, eventId), "processing", "NX", "EX", 31 * 86400);
      return result !== null;
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw AppError.serviceUnavailable(`Payment webhook idempotency store unavailable: ${(error as Error).message}`);
      return true;
    }
  },

  async releaseWebhookEvent(provider: PaymentProvider, eventId: string): Promise<void> {
    await redis.del(K.webhook(provider, eventId)).catch(() => {});
  },

  async listTransactions(organizationId: string, query?: { provider?: string; status?: string; limit?: number }): Promise<PaymentTransaction[]> {
    const limit = Math.max(1, Math.min(Number(query?.limit ?? 50), 500));
    let items: PaymentTransaction[] = [];
    try {
      const allIds = (await redis.zrange(K.idx(organizationId), 0, -1)).reverse();
      for (const id of allIds) {
        const raw = await redis.get(K.item(organizationId, id));
        if (raw) { try { items.push(JSON.parse(raw)); } catch {} }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw AppError.serviceUnavailable(`Payment ledger read failed: ${(error as Error).message}`);
      items = [...getMemoryLedger(organizationId)];
    }
    if (query?.provider) items = items.filter((item) => item.provider === query.provider);
    if (query?.status) items = items.filter((item) => item.status === query.status);
    return items.slice(0, limit);
  },

  async getTransaction(organizationId: string, id: string): Promise<PaymentTransaction | null> {
    try {
      const raw = await redis.get(K.item(organizationId, id));
      if (raw) {
        const parsed = JSON.parse(raw) as PaymentTransaction;
        if (parsed.organizationId === organizationId) return parsed;
      }
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw AppError.serviceUnavailable(`Payment ledger read failed: ${(error as Error).message}`);
    }
    if (process.env.NODE_ENV === "production") return null;
    const found = getMemoryLedger(organizationId).find((item) => item.id === id);
    return found?.organizationId === organizationId ? structuredClone(found) : null;
  },

  async getTransactionByRef(organizationId: string, reference: string): Promise<PaymentTransaction | null> {
    const all = await this.listTransactions(organizationId, { limit: 500 });
    return all.find((item) => item.reference === reference) ?? null;
  },
};
