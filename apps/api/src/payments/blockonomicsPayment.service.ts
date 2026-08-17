/** Durable Blockonomics payment creation (Stage 4). */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import type { BlockonomicsCreatePaymentInput, PaymentTransaction } from "@windels/shared/payments";
import { BlockonomicsConfigService, BlockonomicsClient } from "./blockonomics.service.js";

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

  async get(organizationId: string, id: string): Promise<PaymentTransaction | null> {
    const row = await prisma.paymentRecord.findFirst({ where: { id, organizationId, provider: "blockonomics" } });
    return row ? serializeBlockonomicsPayment(row) : null;
  },

  async list(organizationId: string, limit = 50): Promise<PaymentTransaction[]> {
    const rows = await prisma.paymentRecord.findMany({ where: { organizationId, provider: "blockonomics" }, orderBy: { createdAt: "desc" }, take: Math.max(1, Math.min(limit, 200)) });
    return rows.map(serializeBlockonomicsPayment);
  },
};
