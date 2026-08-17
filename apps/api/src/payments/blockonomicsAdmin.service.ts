import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import type { BlockonomicsAdminDashboard, BlockonomicsAdminHealthResult } from "@windels/shared/payments";
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
