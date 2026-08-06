/**
 * Universal Payment Gateways Service — Session 128
 *
 * Orchestrates multi-provider checkouts across:
 *   1. Flutterwave (NGN, GHS, KES, ZAR, USD)
 *   2. Paystack (NGN, GHS, ZAR, KES)
 *   3. PayPal (Global USD/international)
 *   4. Blockonomics / Multi-Chain Crypto (BTC, Tron TRC-20, ETH ERC-20, BNB Chain)
 *
 * Manages organization-scoped transaction persistence (`pay:tx`),
 * universal checkout routing, EventBus dispatch, and automatic invoice
 * settlement via `billing.markInvoicePaid(orgId, invoiceId)`.
 *
 * Keys:
 *   pay:tx:idx:<org>   (Redis Sorted Set of transaction IDs ordered by timestamp)
 *   pay:tx:i:<org>:<id>  (Redis string storing JSON serialized PaymentTransaction)
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
};

const MAX_TRANSACTION_LIMIT = 500;
const memoryLedger = new Map<string, PaymentTransaction[]>();

function getMemoryLedger(orgId: string): PaymentTransaction[] {
  let list = memoryLedger.get(orgId);
  if (!list) {
    list = [];
    memoryLedger.set(orgId, list);
  }
  return list;
}

export const PaymentGatewaysService = {
  /**
   * List configured payment providers and their active status.
   */
  async listProviders(): Promise<PaymentProviderConfig[]> {
    return [
      {
        provider: "flutterwave",
        active: true,
        testMode: process.env.NODE_ENV !== "production" || !process.env.FLUTTERWAVE_SECRET_KEY,
        supportedCurrencies: ["NGN", "GHS", "KES", "ZAR", "USD"],
        displayName: "Flutterwave (African & Global Card/Mobile Money)",
      },
      {
        provider: "paystack",
        active: true,
        testMode: process.env.NODE_ENV !== "production" || !process.env.PAYSTACK_SECRET_KEY,
        supportedCurrencies: ["NGN", "GHS", "ZAR", "KES"],
        displayName: "Paystack (African Card & Bank Transfer)",
      },
      {
        provider: "stripe",
        active: true,
        testMode: process.env.NODE_ENV !== "production" || !process.env.STRIPE_SECRET_KEY,
        supportedCurrencies: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "NGN", "ZAR"],
        displayName: "Stripe (Global Card, Apple Pay, Google Pay, SEPA)",
      },
      {
        provider: "paypal",
        active: true,
        testMode: process.env.NODE_ENV !== "production" || !process.env.PAYPAL_CLIENT_ID,
        supportedCurrencies: ["USD", "EUR", "GBP", "CAD", "AUD"],
        displayName: "PayPal (Global Checkout Orders)",
      },
      {
        provider: "crypto",
        active: true,
        testMode: process.env.NODE_ENV !== "production" || !process.env.BLOCKONOMICS_API_KEY,
        supportedCurrencies: ["USD", "EUR"],
        supportedNetworks: ["btc", "tron_trc20", "eth_erc20", "bnb_chain"],
        displayName: "Blockonomics & Multi-Chain Crypto (BTC, TRC-20, ERC-20, BNB)",
      },
    ];
  },

  /**
   * Record a payment transaction in the organization ledger (`pay:tx`).
   */
  async recordTransaction(tx: PaymentTransaction): Promise<void> {
    const orgId = tx.organizationId;
    const nowTs = new Date(tx.createdAt).getTime();

    // Memory buffer
    const mem = getMemoryLedger(orgId);
    const idx = mem.findIndex((i) => i.id === tx.id || i.reference === tx.reference);
    if (idx !== -1) {
      mem[idx] = tx;
    } else {
      mem.unshift(tx);
      if (mem.length > MAX_TRANSACTION_LIMIT) mem.splice(MAX_TRANSACTION_LIMIT);
    }

    // Redis sorted set + hash
    try {
      const idxKey = K.idx(orgId);
      const itemKey = K.item(orgId, tx.id);
      await redis.set(itemKey, JSON.stringify(tx));
      await redis.zadd(idxKey, String(nowTs), tx.id);

      const count = await redis.zcard(idxKey);
      if (count > MAX_TRANSACTION_LIMIT) {
        const excess = count - MAX_TRANSACTION_LIMIT;
        const oldIds = await redis.zrange(idxKey, 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(idxKey, ...oldIds);
          for (const oldId of oldIds) {
            await redis.del(K.item(orgId, oldId));
          }
        }
      }
    } catch (e: any) {
      logger.debug("PaymentGatewaysService.recordTransaction: Redis unreachable, relying on memory ledger", { error: e?.message });
    }
  },

  /**
   * Universal checkout initiator: routes to Flutterwave, Paystack, PayPal, or Crypto.
   */
  async initiateCheckout(
    organizationId: string,
    input: PaymentCheckoutRequestInput
  ): Promise<PaymentTransaction> {
    const provider = input.provider;
    const amount = input.amount;
    const currency = input.currency || "USD";
    const nowIso = new Date().toISOString();
    const id = `tx_${Date.now()}_${randomUUID().slice(0, 8)}`;

    let reference = id;
    let checkoutUrl = "";
    let cryptoAmount: number | undefined;
    let cryptoAddress: string | undefined;
    let confirmations: number | undefined;
    let requiredConfirmations: number | undefined;

    if (provider === "flutterwave") {
      const flw = await FlutterwaveService.initializePayment({
        amount,
        currency,
        customerEmail: input.customerEmail,
        description: input.description,
        invoiceId: input.invoiceId,
      });
      reference = flw.reference;
      checkoutUrl = flw.checkoutUrl;
    } else if (provider === "paystack") {
      const pys = await PaystackService.initializePayment({
        amount,
        currency,
        customerEmail: input.customerEmail,
        description: input.description,
        invoiceId: input.invoiceId,
      });
      reference = pys.reference;
      checkoutUrl = pys.checkoutUrl;
    } else if (provider === "stripe") {
      const str = await StripeService.createCheckoutSession({
        amount,
        currency,
        customerEmail: input.customerEmail,
        description: input.description,
        invoiceId: input.invoiceId,
      });
      reference = str.reference;
      checkoutUrl = str.checkoutUrl;
    } else if (provider === "paypal") {
      const ppl = await PayPalService.createOrder({
        amount,
        currency,
        description: input.description,
        invoiceId: input.invoiceId,
      });
      reference = ppl.orderId;
      checkoutUrl = ppl.approvalUrl;
    } else {
      // crypto
      const cry = await CryptoPaymentsService.createCharge({
        network: input.cryptoNetwork || "tron_trc20",
        amount,
        currency,
        invoiceId: input.invoiceId,
        description: input.description,
      });
      reference = cry.chargeId;
      checkoutUrl = cry.checkoutUrl;
      cryptoAmount = cry.cryptoAmount;
      cryptoAddress = cry.cryptoAddress;
      confirmations = 0;
      requiredConfirmations = cry.requiredConfirmations;
    }

    const tx: PaymentTransaction = {
      id,
      organizationId,
      provider,
      reference,
      amount,
      currency,
      cryptoAmount,
      cryptoNetwork: input.cryptoNetwork,
      cryptoAddress,
      confirmations,
      requiredConfirmations,
      status: "pending",
      invoiceId: input.invoiceId || null,
      description: input.description,
      customerEmail: input.customerEmail,
      checkoutUrl,
      createdAt: nowIso,
      completedAt: null,
      metadata: { initiatedBy: "PaymentGatewaysService" },
    };

    await this.recordTransaction(tx);

    try {
      await EventBus.emit("payment.pending", {
        transactionId: id,
        organizationId,
        provider,
        reference,
        amount,
        currency,
      });
    } catch {}

    return tx;
  },

  /**
   * Settle a transaction: update status, emit EventBus, and settle Billing Invoice.
   */
  async settleTransaction(
    organizationId: string,
    referenceOrId: string,
    status: PaymentTransactionStatus,
    metadata?: Record<string, unknown>
  ): Promise<PaymentTransaction | null> {
    let tx = await this.getTransactionByRef(organizationId, referenceOrId);
    if (!tx) {
      // Try finding by id
      tx = await this.getTransaction(organizationId, referenceOrId);
    }
    if (!tx) return null;

    tx.status = status;
    if (status === "completed") {
      tx.completedAt = new Date().toISOString();
    }
    if (metadata) {
      tx.metadata = { ...tx.metadata, ...metadata };
    }

    await this.recordTransaction(tx);

    // EventBus emission
    try {
      await EventBus.emit(status === "completed" ? "payment.succeeded" : `payment.${status}`, {
        transactionId: tx.id,
        organizationId,
        provider: tx.provider,
        reference: tx.reference,
        amount: tx.amount,
        currency: tx.currency,
      });
    } catch {}

    // Invoice settlement integration with billing module
    if (status === "completed" && tx.invoiceId) {
      try {
        await billing.markInvoicePaid(organizationId, tx.invoiceId);
        logger.info("PaymentGatewaysService: automatically marked billing invoice paid", {
          invoiceId: tx.invoiceId,
          transactionId: tx.id,
          organizationId,
        });
      } catch (err: any) {
        logger.warn("PaymentGatewaysService: invoice settlement failed or invoice already paid", {
          invoiceId: tx.invoiceId,
          error: err?.message,
        });
      }
    }

    return tx;
  },

  /**
   * Get paginated transactions for an organization.
   */
  async listTransactions(
    organizationId: string,
    query?: { provider?: string; status?: string; limit?: number }
  ): Promise<PaymentTransaction[]> {
    const limit = query?.limit ?? 50;
    const providerFilter = query?.provider;
    const statusFilter = query?.status;

    let items: PaymentTransaction[] = [];
    try {
      const idxKey = K.idx(organizationId);
      const allIds = (await redis.zrange(idxKey, 0, -1)).reverse();
      for (const id of allIds) {
        const raw = await redis.get(K.item(organizationId, id));
        if (raw) {
          try {
            items.push(JSON.parse(raw));
          } catch {}
        }
      }
    } catch {
      items = [...getMemoryLedger(organizationId)];
    }

    if (providerFilter) {
      items = items.filter((x) => x.provider === providerFilter);
    }
    if (statusFilter) {
      items = items.filter((x) => x.status === statusFilter);
    }

    return items.slice(0, limit);
  },

  /**
   * Get single transaction by ID, asserting organization scope.
   */
  async getTransaction(organizationId: string, id: string): Promise<PaymentTransaction | null> {
    try {
      const raw = await redis.get(K.item(organizationId, id));
      if (raw) {
        const parsed = JSON.parse(raw) as PaymentTransaction;
        if (parsed.organizationId === organizationId) return parsed;
      }
    } catch {
      const mem = getMemoryLedger(organizationId);
      const found = mem.find((i) => i.id === id);
      if (found && found.organizationId === organizationId) return found;
    }
    return null;
  },

  /**
   * Get single transaction by provider reference.
   */
  async getTransactionByRef(organizationId: string, reference: string): Promise<PaymentTransaction | null> {
    const all = await this.listTransactions(organizationId, { limit: 500 });
    return all.find((x) => x.reference === reference) || null;
  },
};
