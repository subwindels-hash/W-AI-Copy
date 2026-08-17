/** Durable Blockonomics payment creation (Stage 4). */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { AppError } from "../utils/result.js";
import type { BlockonomicsCallbackInput, BlockonomicsCreatePaymentInput, PaymentTransaction } from "@windels/shared/payments";
import { BlockonomicsConfigService, BlockonomicsClient, configuredBlockonomicsClient } from "./blockonomics.service.js";

function scale(asset: "BTC" | "USDT"): bigint { return asset === "BTC" ? 100_000_000n : 1_000_000n; }
function unitsFor(amount: number, price: number, asset: "BTC" | "USDT"): bigint {
  const units = Math.ceil((amount / price) * Number(scale(asset)) - 1e-9);
  if (!Number.isSafeInteger(units) || units <= 0) throw AppError.upstream("Blockonomics quote cannot be represented safely", { code: "BLOCKONOMICS_QUOTE_PRECISION" });
  return BigInt(units);
}
function cryptoAmount(units: bigint, asset: "BTC" | "USDT"): number {
  return Number(units) / Number(scale(asset));
}
function network(asset: "BTC" | "USDT"): "btc" | "eth_erc20" { return asset === "BTC" ? "btc" : "eth_erc20"; }
function safeSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function callbackEventKey(input: BlockonomicsCallbackInput): string {
  return `blockonomics:${input.crypto}:${input.addr}:${input.txid}:${input.status}:${input.value}`;
}
function callbackHash(input: BlockonomicsCallbackInput): string {
  return createHash("sha256").update(JSON.stringify({ addr: input.addr, crypto: input.crypto, status: input.status, value: input.value.toString(), txid: input.txid, rbf: input.rbf ?? null })).digest("hex");
}
function isUniqueError(error: unknown): boolean { return (error as any)?.code === "P2002"; }

export function serializeBlockonomicsPayment(row: any): PaymentTransaction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: "blockonomics",
    reference: row.internalReference,
    amount: Number(row.amountCents) / 100,
    currency: row.currency,
    cryptoAmount: row.expectedCryptoUnits == null ? undefined : cryptoAmount(BigInt(row.expectedCryptoUnits), row.cryptoCurrency),
    cryptoNetwork: row.cryptoCurrency ? network(row.cryptoCurrency) : undefined,
    cryptoCurrency: row.cryptoCurrency ?? undefined,
    cryptoAddress: row.paymentAddress ?? undefined,
    expectedCryptoUnits: row.expectedCryptoUnits == null ? undefined : String(row.expectedCryptoUnits),
    receivedCryptoUnits: row.receivedCryptoUnits == null ? undefined : String(row.receivedCryptoUnits),
    confirmations: row.confirmations ?? 0,
    requiredConfirmations: row.requiredConfirmations ?? 2,
    providerStatus: row.providerStatus ?? undefined,
    status: row.status,
    invoiceId: row.invoiceId ?? null,
    description: (row.metadata as any)?.description,
    customerEmail: (row.metadata as any)?.customerEmail,
    expiresAt: row.expiresAt?.toISOString?.() ?? row.expiresAt ?? null,
    reconciliationStatus: row.reconciliationStatus,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    completedAt: row.completedAt?.toISOString?.() ?? row.completedAt ?? null,
    metadata: {
      quoteSource: row.quoteSource,
      quotePrice: row.quotePrice?.toString?.() ?? row.quotePrice,
      quoteObservedAt: row.quoteObservedAt?.toISOString?.() ?? row.quoteObservedAt,
      instructions: row.cryptoCurrency === "BTC"
        ? "Send the exact BTC amount to the displayed address. Access is granted only after provider-confirmed finality."
        : "Send USDT on Ethereum ERC-20 only, then submit the transaction hash for monitoring. Other networks will not be credited.",
    },
  };
}

async function confirmedProviderPayment(row: any, client: BlockonomicsClient) {
  const rows = await client.listConfirmedPayments({ crypto: row.cryptoCurrency, currency: row.currency, timeframe: "1Y", limit: 200 });
  return rows.find((item) => item.txid === row.providerTransactionId && item.address === row.paymentAddress && item.crypto === row.cryptoCurrency && BigInt(item.amount) === BigInt(row.receivedCryptoUnits ?? 0)) ?? null;
}

export const BlockonomicsPaymentService = {
  async create(
    organizationId: string,
    requestedById: string,
    input: BlockonomicsCreatePaymentInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<PaymentTransaction> {
    const cfg = await BlockonomicsConfigService.secret();
    if (!cfg || !cfg.enabled) throw new AppError("SERVICE_UNAVAILABLE", "Blockonomics is not configured and enabled", 503, { code: "BLOCKONOMICS_NOT_CONFIGURED" });
    if (!cfg.supportedAssets.includes(input.cryptoCurrency)) throw AppError.badRequest(`${input.cryptoCurrency} is disabled for Blockonomics`);

    let invoice: any = null;
    if (input.invoiceId) {
      invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, organizationId } });
      if (!invoice) throw AppError.notFound("Invoice not found in organization");
      if (!["open", "past_due"].includes(invoice.status)) throw AppError.conflict(`Invoice cannot be paid from status ${invoice.status}`);
      if (invoice.currency.toUpperCase() !== input.currency.toUpperCase()) throw AppError.conflict("Checkout currency does not match invoice currency");
      if (invoice.amountCents !== Math.round(input.amount * 100)) throw AppError.conflict("Checkout amount does not match invoice amount");
    }

    const now = new Date();
    const internalReference = `BLK_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    let row = await prisma.paymentRecord.create({
      data: {
        organizationId, requestedById, invoiceId: invoice?.id ?? null,
        subscriptionId: invoice?.subscriptionId ?? null,
        provider: "blockonomics", internalReference,
        status: "created", amountCents: Math.round(input.amount * 100),
        currency: input.currency.toUpperCase(), cryptoCurrency: input.cryptoCurrency,
        cryptoNetwork: network(input.cryptoCurrency), requiredConfirmations: 2,
        reconciliationStatus: "pending",
        metadata: { description: input.description ?? null, customerEmail: input.customerEmail ?? null } as Prisma.InputJsonValue,
      },
    });

    const client = new BlockonomicsClient(cfg, fetchImpl);
    try {
      // Price is read-only; address allocation is intentionally called once.
      const price = await client.getPrice(input.cryptoCurrency, input.currency);
      const expected = unitsFor(input.amount, price, input.cryptoCurrency);
      const address = await client.createAddress(input.cryptoCurrency);
      const expiresAt = new Date(now.getTime() + cfg.quoteExpiryMinutes * 60_000);
      row = await prisma.paymentRecord.update({
        where: { id: row.id },
        data: {
          providerPaymentId: address.address,
          providerStatus: "address_created",
          status: "pending",
          paymentAddress: address.address,
          expectedCryptoUnits: expected,
          quotePrice: price,
          quoteSource: "blockonomics:/price",
          quoteObservedAt: now,
          expiresAt,
        },
      });
      logger.info("Blockonomics payment created", { paymentId: row.id, organizationId, asset: input.cryptoCurrency, testMode: cfg.testMode });
      return serializeBlockonomicsPayment(row);
    } catch (error) {
      await prisma.paymentRecord.update({
        where: { id: row.id },
        data: { status: "failed", providerStatus: "creation_failed", reconciliationStatus: "required", metadata: { ...(row.metadata as any), creationError: (error as Error).message.slice(0, 300) } },
      }).catch(() => {});
      throw error;
    }
  },

  async monitorUsdtTransaction(organizationId: string, requestedById: string, paymentId: string, txhash: string, fetchImpl: typeof fetch = fetch): Promise<PaymentTransaction> {
    let row = await prisma.paymentRecord.findFirst({ where: { id: paymentId, organizationId, provider: "blockonomics" } });
    if (!row) throw AppError.notFound("Blockonomics payment not found in organization");
    if (row.requestedById && row.requestedById !== requestedById) throw AppError.forbidden("Only the payment requester may submit its transaction hash");
    if (row.cryptoCurrency !== "USDT") throw AppError.badRequest("Transaction monitoring is required only for USDT payments");
    if (["completed", "cancelled", "failed"].includes(row.status)) throw AppError.conflict(`Payment cannot be monitored from status ${row.status}`);
    const duplicate = await prisma.paymentRecord.findFirst({ where: { provider: "blockonomics", providerTransactionId: txhash, id: { not: row.id } } });
    if (duplicate) throw AppError.conflict("Transaction hash is already assigned to another payment");
    const client = await configuredBlockonomicsClient(fetchImpl);
    const providerStatus = await client.monitorUsdtTransaction(txhash);
    const status = providerStatus < 0 ? "failed" : providerStatus === 0 ? "detected" : "confirming";
    row = await prisma.paymentRecord.update({
      where: { id: row.id },
      data: {
        providerTransactionId: txhash,
        providerStatus: String(providerStatus),
        status,
        detectedAt: row.detectedAt ?? new Date(),
        confirmations: Math.max(0, providerStatus),
        reconciliationStatus: providerStatus >= 2 ? "required" : "pending",
      },
    });
    // A browser-submitted tx hash can never complete payment. Even if monitor_tx
    // reports final, the callback/reconciliation path must independently match it.
    return serializeBlockonomicsPayment(row);
  },

  async processCallback(input: BlockonomicsCallbackInput, fetchImpl: typeof fetch = fetch): Promise<{ duplicate: boolean; ignored: boolean; payment: PaymentTransaction | null }> {
    const cfg = await BlockonomicsConfigService.secret();
    if (!cfg || !cfg.enabled) throw new AppError("SERVICE_UNAVAILABLE", "Blockonomics is not configured and enabled", 503);
    if (!safeSecret(input.secret, cfg.callbackSecret)) throw AppError.unauthorized("Invalid Blockonomics callback secret");
    if (!cfg.supportedAssets.includes(input.crypto)) throw AppError.badRequest("Callback asset is not enabled");

    const eventKey = callbackEventKey(input);
    let event = await prisma.paymentWebhookEvent.findUnique({ where: { eventKey } });
    if (event?.processingStatus === "processed" || event?.processingStatus === "ignored") {
      const row = event.paymentId ? await prisma.paymentRecord.findUnique({ where: { id: event.paymentId } }) : null;
      return { duplicate: true, ignored: event.processingStatus === "ignored", payment: row ? serializeBlockonomicsPayment(row) : null };
    }
    if (!event) {
      try {
        event = await prisma.paymentWebhookEvent.create({
          data: {
            provider: "blockonomics", eventKey, payloadHash: callbackHash(input),
            providerTransactionId: input.txid, providerStatus: String(input.status),
            processingStatus: "processing", attempts: 1,
          },
        });
      } catch (error) {
        if (!isUniqueError(error)) throw error;
        event = await prisma.paymentWebhookEvent.findUnique({ where: { eventKey } });
      }
    } else {
      event = await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingStatus: "processing", attempts: { increment: 1 }, errorCode: null, errorMessage: null } });
    }
    if (!event) throw AppError.internal("Could not claim Blockonomics callback event");

    try {
      const candidates = await prisma.paymentRecord.findMany({
        where: { provider: "blockonomics", paymentAddress: input.addr, cryptoCurrency: input.crypto, status: { notIn: ["cancelled", "failed"] } },
        orderBy: { createdAt: "desc" }, take: 20,
      });
      let row = candidates.find((item) => item.providerTransactionId === input.txid) ?? null;
      if (!row && input.crypto === "BTC" && candidates.length === 1) row = candidates[0]!;
      if (!row) {
        await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingStatus: "ignored", processedAt: new Date(), errorCode: "PAYMENT_NOT_RESOLVED", errorMessage: candidates.length > 1 ? "Ambiguous payment address" : "Payment address not found" } });
        return { duplicate: false, ignored: true, payment: null };
      }
      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { organizationId: row.organizationId, paymentId: row.id } });

      const received = input.value;
      const expected = BigInt(row.expectedCryptoUnits ?? 0);
      const amountMatches = received === expected;
      const expired = !!row.expiresAt && row.expiresAt.getTime() < Date.now();
      const txCollision = await prisma.paymentRecord.findFirst({ where: { provider: "blockonomics", providerTransactionId: input.txid, id: { not: row.id } } });
      if (txCollision || !amountMatches) {
        row = await prisma.paymentRecord.update({
          where: { id: row.id },
          data: {
            providerTransactionId: input.txid, providerStatus: String(input.status),
            receivedCryptoUnits: received, status: "under_review",
            reconciliationStatus: txCollision ? "duplicate_transaction" : received < expected ? "underpaid" : "overpaid",
            detectedAt: row.detectedAt ?? new Date(), confirmations: input.status,
            metadata: { ...(row.metadata as any), callbackRbf: input.rbf ?? null },
          },
        });
        await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingStatus: "processed", processedAt: new Date(), errorCode: txCollision ? "DUPLICATE_TRANSACTION" : "AMOUNT_MISMATCH" } });
        return { duplicate: false, ignored: false, payment: serializeBlockonomicsPayment(row) };
      }

      const mappedStatus = input.status === 0 ? "detected" : input.status === 1 ? "confirming" : "confirming";
      row = await prisma.paymentRecord.update({
        where: { id: row.id },
        data: {
          providerTransactionId: input.txid, providerStatus: String(input.status),
          receivedCryptoUnits: received, status: mappedStatus,
          detectedAt: row.detectedAt ?? new Date(), confirmations: input.status,
          reconciliationStatus: input.status >= 2 ? "verifying" : "pending",
          metadata: { ...(row.metadata as any), callbackRbf: input.rbf ?? null },
        },
      });

      if (input.status >= 2) {
        const client = new BlockonomicsClient(cfg, fetchImpl);
        const verified = await confirmedProviderPayment(row, client);
        row = await prisma.paymentRecord.update({
          where: { id: row.id },
          data: verified && !expired
            ? { status: "confirmed", confirmedAt: new Date(), reconciliationStatus: "matched" }
            : { status: "under_review", reconciliationStatus: expired ? "late_payment" : "provider_mismatch" },
        });
      }
      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingStatus: "processed", processedAt: new Date() } });
      Metrics.increment("payments_webhooks_total", 1, { provider: "blockonomics", status: String(input.status), result: row.status });
      return { duplicate: false, ignored: false, payment: serializeBlockonomicsPayment(row) };
    } catch (error) {
      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingStatus: "failed", errorCode: (error as any)?.code ?? "PROCESSING_ERROR", errorMessage: (error as Error).message.slice(0, 500) } }).catch(() => {});
      Metrics.increment("payments_webhooks_total", 1, { provider: "blockonomics", status: String(input.status), result: "failed" });
      throw error;
    }
  },

  async get(organizationId: string, id: string): Promise<PaymentTransaction | null> {
    const row = await prisma.paymentRecord.findFirst({ where: { id, organizationId, provider: "blockonomics" } });
    return row ? serializeBlockonomicsPayment(row) : null;
  },

  async list(organizationId: string, limit = 50): Promise<PaymentTransaction[]> {
    const rows = await prisma.paymentRecord.findMany({ where: { organizationId, provider: "blockonomics" }, orderBy: { createdAt: "desc" }, take: Math.max(1, Math.min(limit, 200)) });
    return rows.map(serializeBlockonomicsPayment);
  },
};
