import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import type {
  BlockonomicsAdminDashboard,
  BlockonomicsAdminHealthResult,
  BlockonomicsAdminTransactionPage,
  BlockonomicsAdminTransactionQuery,
  BlockonomicsAsset,
} from "@windels/shared/payments";
import { BlockonomicsClient, BlockonomicsConfigService } from "./blockonomics.service.js";

function countGroups(rows: any[], key: string): Array<{ status: string; count: number }> {
  return rows.map((row) => ({ status: String(row[key] ?? "unknown"), count: Number(row._count?._all ?? 0) }));
}

export const BlockonomicsAdminService = {
  async dashboard(): Promise<BlockonomicsAdminDashboard> {
    const [
      configuration,
      paymentTotal,
      webhookTotal,
      failedWebhookTotal,
      paymentStatusGroups,
      reconciliationGroups,
      assetGroups,
      webhookStatusGroups,
      recentPayments,
      recentWebhookErrors,
      recentReconciliationRuns,
    ] = await Promise.all([
      BlockonomicsConfigService.public(),
      prisma.paymentRecord.count({ where: { provider: "blockonomics" } }),
      prisma.paymentWebhookEvent.count({ where: { provider: "blockonomics" } }),
      prisma.paymentWebhookEvent.count({ where: { provider: "blockonomics", processingStatus: "failed" } }),
      prisma.paymentRecord.groupBy({ by: ["status"], where: { provider: "blockonomics" }, _count: { _all: true }, orderBy: { status: "asc" } }),
      prisma.paymentRecord.groupBy({ by: ["reconciliationStatus"], where: { provider: "blockonomics" }, _count: { _all: true }, orderBy: { reconciliationStatus: "asc" } }),
      prisma.paymentRecord.groupBy({ by: ["cryptoCurrency"], where: { provider: "blockonomics", cryptoCurrency: { not: null } }, _count: { _all: true }, orderBy: { cryptoCurrency: "asc" } }),
      prisma.paymentWebhookEvent.groupBy({ by: ["processingStatus"], where: { provider: "blockonomics" }, _count: { _all: true }, orderBy: { processingStatus: "asc" } }),
      prisma.paymentRecord.findMany({
        where: { provider: "blockonomics" },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true, organizationId: true, internalReference: true, status: true,
          amountCents: true, currency: true, cryptoCurrency: true,
          confirmations: true, requiredConfirmations: true,
          reconciliationStatus: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.paymentWebhookEvent.findMany({
        where: { provider: "blockonomics", processingStatus: "failed" },
        orderBy: { receivedAt: "desc" },
        take: 25,
        select: {
          id: true, paymentId: true, errorCode: true, errorMessage: true,
          attempts: true, receivedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { action: "payment_provider.reconciliation_completed", resourceId: "blockonomics" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, metadata: true, createdAt: true },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      configuration,
      totals: { payments: paymentTotal, webhookEvents: webhookTotal, failedWebhookEvents: failedWebhookTotal },
      paymentsByStatus: countGroups(paymentStatusGroups, "status"),
      reconciliationByStatus: countGroups(reconciliationGroups, "reconciliationStatus"),
      paymentsByAsset: countGroups(assetGroups, "cryptoCurrency").map((row) => ({ asset: row.status, count: row.count })),
      webhooksByStatus: countGroups(webhookStatusGroups, "processingStatus"),
      recentPayments: recentPayments.map((payment) => ({
        id: payment.id,
        organizationId: payment.organizationId,
        reference: payment.internalReference,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
        cryptoCurrency: payment.cryptoCurrency,
        confirmations: payment.confirmations,
        requiredConfirmations: payment.requiredConfirmations,
        reconciliationStatus: payment.reconciliationStatus,
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
      })),
      recentWebhookErrors: recentWebhookErrors.map((event) => ({
        id: event.id,
        paymentId: event.paymentId,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
        attempts: event.attempts,
        receivedAt: event.receivedAt.toISOString(),
      })),
      recentReconciliationRuns: recentReconciliationRuns.map((run) => {
        const metadata = run.metadata && typeof run.metadata === "object" ? run.metadata as Record<string, any> : {};
        return {
          id: run.id,
          trigger: typeof metadata.trigger === "string" ? metadata.trigger : "unknown",
          timeframe: typeof metadata.timeframe === "string" ? metadata.timeframe : "unknown",
          matched: Number(metadata.matched ?? 0),
          settled: Number(metadata.settled ?? 0),
          issueCount: Array.isArray(metadata.issues) ? metadata.issues.length : 0,
          createdAt: run.createdAt.toISOString(),
        };
      }),
    };
  },

  /**
   * Super Admin → Payments → Crypto Transactions. Searchable, filterable,
   * read-only view over the durable Blockonomics payment ledger. Supports search
   * by requesting User ID and by transaction reference / provider transaction id,
   * plus BTC/USDT and status filters. Keyset-paginated on (createdAt desc, id) so
   * it stays cheap regardless of ledger size. No amounts are ever mutated here.
   */
  async searchTransactions(query: BlockonomicsAdminTransactionQuery): Promise<BlockonomicsAdminTransactionPage> {
    const limit = query.limit ?? 50;
    const where: Record<string, unknown> = { provider: "blockonomics" };
    if (query.userId) where.requestedById = query.userId;
    if (query.asset) where.cryptoCurrency = query.asset;
    if (query.status) where.status = query.status;
    if (query.reference) {
      const term = query.reference;
      where.OR = [
        { internalReference: { contains: term, mode: "insensitive" } },
        { providerTransactionId: { contains: term, mode: "insensitive" } },
      ];
    }

    // Keyset cursor is the last row's id; we page by (createdAt desc, id desc).
    const rows = await prisma.paymentRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, organizationId: true, requestedById: true, internalReference: true,
        providerTransactionId: true, cryptoCurrency: true, cryptoNetwork: true, status: true,
        amountCents: true, currency: true, confirmations: true, requiredConfirmations: true,
        reconciliationStatus: true, paymentAddress: true, createdAt: true, confirmedAt: true, completedAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      transactions: page.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        requestedById: row.requestedById ?? null,
        reference: row.internalReference,
        providerTransactionId: row.providerTransactionId ?? null,
        asset: (row.cryptoCurrency as BlockonomicsAsset | null) ?? null,
        network: row.cryptoNetwork ?? null,
        status: row.status,
        amountCents: row.amountCents,
        currency: row.currency,
        confirmations: row.confirmations ?? 0,
        requiredConfirmations: row.requiredConfirmations ?? 2,
        reconciliationStatus: row.reconciliationStatus,
        paymentAddress: row.paymentAddress ?? null,
        createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
        confirmedAt: row.confirmedAt?.toISOString?.() ?? (row.confirmedAt ?? null),
        completedAt: row.completedAt?.toISOString?.() ?? (row.completedAt ?? null),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      query,
    };
  },

  async checkHealth(actorId: string, fetchImpl: typeof fetch = fetch): Promise<BlockonomicsAdminHealthResult> {
    const config = await BlockonomicsConfigService.secret();
    if (!config) throw AppError.serviceUnavailable("Blockonomics credentials are not configured");
    const result = await new BlockonomicsClient(config, fetchImpl).health();
    await BlockonomicsConfigService.recordHealth(result.healthy, result.error);
    const checkedAt = new Date().toISOString();
    await prisma.auditLog.create({
      data: {
        organizationId: null,
        userId: actorId,
        action: "payment_provider.health_checked",
        resourceType: "PaymentProviderConfiguration",
        resourceId: "blockonomics",
        metadata: {
          provider: "blockonomics",
          healthy: result.healthy,
          latencyMs: result.latencyMs,
          error: result.error?.slice(0, 300) ?? null,
        },
      },
    });
    return {
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      checkedAt,
      healthStatus: result.healthy ? "HEALTHY" : "UNHEALTHY",
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
