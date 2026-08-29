import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import { settleConfirmedBlockonomicsPayment } from "../services/billing.service.js";
import type {
  BlockonomicsReconciliationIssue,
  BlockonomicsReconciliationIssueKind,
  BlockonomicsReconciliationResult,
  BlockonomicsReconciliationTimeframe,
} from "@windels/shared/payments";
import { BlockonomicsClient, BlockonomicsConfigService, type BlockonomicsConfirmedPayment } from "./blockonomics.service.js";

const LOCK_KEY = "payments:blockonomics:reconciliation:lock";
const TIMEFRAME_MS: Record<BlockonomicsReconciliationTimeframe, number> = {
  "1W": 7 * 86_400_000,
  "2W": 14 * 86_400_000,
  "1M": 30 * 86_400_000,
  "3M": 90 * 86_400_000,
  "6M": 180 * 86_400_000,
  "1Y": 365 * 86_400_000,
};

type LocalPayment = Prisma.PaymentRecordGetPayload<{}>;

function providerKey(row: BlockonomicsConfirmedPayment): string {
  return `${row.crypto}:${row.txid}`;
}
function localMatchKey(row: LocalPayment): string {
  return `${row.cryptoCurrency}:${row.paymentAddress}:${String(row.expectedCryptoUnits ?? "")}`;
}
function reviewStatus(row: LocalPayment): string {
  return row.status === "completed" ? "completed" : "under_review";
}

async function updateIssue(
  payment: LocalPayment,
  issue: BlockonomicsReconciliationIssue,
  data: Prisma.PaymentRecordUpdateInput,
  actorId?: string,
): Promise<LocalPayment> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.paymentRecord.update({ where: { id: payment.id }, data });
    await tx.auditLog.create({
      data: {
        organizationId: payment.organizationId,
        userId: actorId ?? null,
        action: "payment_provider.reconciliation_issue",
        resourceType: "PaymentRecord",
        resourceId: payment.id,
        metadata: JSON.parse(JSON.stringify({ provider: "blockonomics", ...issue })) as Prisma.InputJsonValue,
      },
    });
    return updated;
  });
}

export const BlockonomicsReconciliationService = {
  async reconcile(input: {
    trigger: "manual" | "scheduled";
    timeframe?: BlockonomicsReconciliationTimeframe;
    actorId?: string;
    fetchImpl?: typeof fetch;
  }): Promise<BlockonomicsReconciliationResult> {
    const timeframe = input.timeframe ?? "1M";
    const runId = `blkrec_${randomUUID()}`;
    const startedAt = new Date();
    const lockId = randomUUID();
    const acquired = await (redis as any).set(LOCK_KEY, lockId, "NX", "EX", 300);
    if (acquired === null) throw AppError.conflict("Blockonomics reconciliation is already running");

    try {
      const config = await BlockonomicsConfigService.secret();
      if (!config) throw AppError.serviceUnavailable("Blockonomics credentials are not configured");
      const client = new BlockonomicsClient(config, input.fetchImpl ?? fetch);
      const providerRows = (await Promise.all(config.supportedAssets.map((asset) =>
        client.listConfirmedPayments({ crypto: asset, timeframe, limit: 200 })
      ))).flat().filter((row) => row.crypto === "BTC" || row.crypto === "USDT");

      const since = new Date(startedAt.getTime() - TIMEFRAME_MS[timeframe]);
      const localRows = (await Promise.all(config.supportedAssets.map((asset) =>
        prisma.paymentRecord.findMany({
          where: { provider: "blockonomics", cryptoCurrency: asset, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      ))).flat();

      const providerByTx = new Map<string, BlockonomicsConfirmedPayment[]>();
      for (const row of providerRows) {
        const list = providerByTx.get(row.txid) ?? [];
        list.push(row);
        providerByTx.set(row.txid, list);
      }
      const assignedLocalTxids = new Set(localRows.map((row) => row.providerTransactionId).filter((value): value is string => !!value));
      const noTxLocalMatchCounts = new Map<string, number>();
      for (const row of localRows) {
        if (!row.providerTransactionId) noTxLocalMatchCounts.set(localMatchKey(row), (noTxLocalMatchCounts.get(localMatchKey(row)) ?? 0) + 1);
      }

      const claimedProviderRows = new Set<string>();
      const issues: BlockonomicsReconciliationIssue[] = [];
      let matched = 0;
      let settled = 0;
      let unchanged = 0;

      const addIssue = async (
        payment: LocalPayment,
        kind: BlockonomicsReconciliationIssueKind,
        detail: string,
        data: Prisma.PaymentRecordUpdateInput,
        providerTransactionId?: string,
      ) => {
        const issue: BlockonomicsReconciliationIssue = { kind, paymentId: payment.id, providerTransactionId, detail };
        issues.push(issue);
        await updateIssue(payment, issue, { ...data, lastReconciledAt: new Date() }, input.actorId);
      };

      for (const payment of localRows) {
        if (!payment.cryptoCurrency || !payment.paymentAddress || payment.expectedCryptoUnits == null) {
          await prisma.paymentRecord.update({ where: { id: payment.id }, data: { lastReconciledAt: new Date() } });
          unchanged++;
          continue;
        }

        let candidate: BlockonomicsConfirmedPayment | null = null;
        if (payment.providerTransactionId) {
          const txRows = providerByTx.get(payment.providerTransactionId) ?? [];
          if (txRows.length === 0) {
            const expectedFinalEvidence = payment.status === "confirmed" || payment.status === "completed" || payment.confirmations >= 2 || payment.reconciliationStatus === "required" || payment.reconciliationStatus === "matched";
            if (expectedFinalEvidence) {
              await addIssue(payment, "provider_payment_missing", "Recorded final provider transaction is absent from confirmed provider history", {
                status: reviewStatus(payment), reconciliationStatus: "provider_payment_missing",
              }, payment.providerTransactionId);
            } else {
              // `/v2/payments` is confirmed history. A submitted/detected USDT
              // hash with fewer than two confirmations is not a discrepancy.
              await prisma.paymentRecord.update({ where: { id: payment.id }, data: { lastReconciledAt: new Date() } });
              unchanged++;
            }
            continue;
          }
          if (txRows.length > 1) {
            txRows.forEach((row) => claimedProviderRows.add(providerKey(row)));
            await addIssue(payment, "duplicate_provider_transaction", "Provider history returned the transaction more than once", {
              status: reviewStatus(payment), reconciliationStatus: "duplicate_provider_transaction",
            }, payment.providerTransactionId);
            continue;
          }
          candidate = txRows[0]!;
        } else {
          const addressRows = providerRows.filter((row) => row.crypto === payment.cryptoCurrency && row.address === payment.paymentAddress);
          const exactRows = addressRows.filter((row) => BigInt(row.amount) === BigInt(payment.expectedCryptoUnits!));
          const localAmbiguous = (noTxLocalMatchCounts.get(localMatchKey(payment)) ?? 0) > 1;
          if (exactRows.length > 1 || localAmbiguous || (exactRows.length === 1 && (claimedProviderRows.has(providerKey(exactRows[0]!)) || assignedLocalTxids.has(exactRows[0]!.txid)))) {
            exactRows.forEach((row) => claimedProviderRows.add(providerKey(row)));
            await addIssue(payment, "ambiguous_provider_match", "Provider payment cannot be assigned uniquely to this local payment", {
              status: reviewStatus(payment), reconciliationStatus: "ambiguous_provider_match",
            });
            continue;
          }
          if (exactRows.length === 1) {
            candidate = exactRows[0]!;
          } else if (addressRows.length === 1) {
            candidate = addressRows[0]!;
          } else if (addressRows.length > 1) {
            addressRows.forEach((row) => claimedProviderRows.add(providerKey(row)));
            await addIssue(payment, "ambiguous_provider_match", "Multiple provider payments share the local payment address", {
              status: reviewStatus(payment), reconciliationStatus: "ambiguous_provider_match",
            });
            continue;
          }
        }

        if (!candidate) {
          const quoteElapsed = !!payment.expiresAt && payment.expiresAt.getTime() < startedAt.getTime();
          if (quoteElapsed && ["created", "pending", "detected", "confirming"].includes(payment.status)) {
            await addIssue(payment, "provider_payment_missing", "No provider payment was found before the quote timer elapsed", {
              status: "expired", reconciliationStatus: "provider_payment_missing",
            });
          } else {
            await prisma.paymentRecord.update({ where: { id: payment.id }, data: { lastReconciledAt: new Date() } });
            unchanged++;
          }
          continue;
        }

        claimedProviderRows.add(providerKey(candidate));
        if (candidate.crypto !== payment.cryptoCurrency) {
          await addIssue(payment, "asset_mismatch", "Provider transaction asset differs from the local payment asset", {
            status: reviewStatus(payment), reconciliationStatus: "asset_mismatch",
          }, candidate.txid);
          continue;
        }
        if (candidate.address !== payment.paymentAddress) {
          await addIssue(payment, "address_mismatch", "Provider transaction address differs from the local payment address", {
            status: reviewStatus(payment), reconciliationStatus: "address_mismatch",
          }, candidate.txid);
          continue;
        }
        const received = BigInt(candidate.amount);
        const expected = BigInt(payment.expectedCryptoUnits);
        if (received !== expected) {
          await addIssue(payment, "amount_mismatch", received < expected ? "Provider transaction underpaid the local payment" : "Provider transaction overpaid the local payment", {
            providerTransactionId: candidate.txid,
            receivedCryptoUnits: received,
            confirmations: 2,
            status: reviewStatus(payment),
            reconciliationStatus: received < expected ? "underpaid" : "overpaid",
          }, candidate.txid);
          continue;
        }
        const providerPaidAt = candidate.timestamp > 0 ? new Date(candidate.timestamp * 1000) : startedAt;
        if (payment.expiresAt && providerPaidAt.getTime() > payment.expiresAt.getTime()) {
          await addIssue(payment, "late_payment", "Provider transaction was observed after the quote timer", {
            providerTransactionId: candidate.txid,
            receivedCryptoUnits: received,
            confirmations: 2,
            status: reviewStatus(payment),
            reconciliationStatus: "late_payment",
          }, candidate.txid);
          continue;
        }

        matched++;
        if (payment.status === "completed") {
          await prisma.paymentRecord.update({ where: { id: payment.id }, data: { reconciliationStatus: "matched", lastReconciledAt: new Date() } });
          unchanged++;
          continue;
        }
        if (!["created", "pending", "detected", "confirming", "confirmed", "expired"].includes(payment.status)) {
          await prisma.paymentRecord.update({ where: { id: payment.id }, data: { lastReconciledAt: new Date() } });
          unchanged++;
          continue;
        }

        await prisma.paymentRecord.update({
          where: { id: payment.id },
          data: {
            providerTransactionId: candidate.txid,
            providerStatus: "2",
            receivedCryptoUnits: received,
            confirmations: 2,
            confirmedAt: payment.confirmedAt ?? providerPaidAt,
            status: "confirmed",
            reconciliationStatus: "matched",
            lastReconciledAt: new Date(),
          },
        });
        try {
          const settlement = await settleConfirmedBlockonomicsPayment(payment.id);
          if (settlement.payment.status === "completed") settled++;
          else {
            issues.push({ kind: "settlement_failed", paymentId: payment.id, providerTransactionId: candidate.txid, detail: `Settlement stopped in ${settlement.payment.status}/${settlement.payment.reconciliationStatus}` });
          }
        } catch (error) {
          await addIssue(payment, "settlement_failed", `Confirmed provider payment could not settle: ${(error as Error).message.slice(0, 200)}`, {
            status: "confirmed", reconciliationStatus: "settlement_failed",
          }, candidate.txid);
        }
      }

      for (const providerPayment of providerRows) {
        if (claimedProviderRows.has(providerKey(providerPayment))) continue;
        issues.push({
          kind: "orphan_provider_payment",
          providerTransactionId: providerPayment.txid,
          detail: `${providerPayment.crypto} provider payment has no matching local record`,
        });
      }

      const completedAt = new Date();
      const result: BlockonomicsReconciliationResult = {
        runId,
        trigger: input.trigger,
        timeframe,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        localPaymentsScanned: localRows.length,
        providerPaymentsScanned: providerRows.length,
        matched,
        settled,
        unchanged,
        issues,
      };
      await prisma.auditLog.create({
        data: {
          organizationId: null,
          userId: input.actorId ?? null,
          action: "payment_provider.reconciliation_completed",
          resourceType: "PaymentProviderConfiguration",
          resourceId: "blockonomics",
          metadata: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        },
      });
      logger.info("Blockonomics reconciliation completed", {
        runId, trigger: input.trigger, timeframe, localPayments: localRows.length,
        providerPayments: providerRows.length, matched, settled, issues: issues.length,
      });
      return result;
    } catch (error) {
      await prisma.auditLog.create({
        data: {
          organizationId: null,
          userId: input.actorId ?? null,
          action: "payment_provider.reconciliation_failed",
          resourceType: "PaymentProviderConfiguration",
          resourceId: "blockonomics",
          metadata: { runId, trigger: input.trigger, timeframe, error: (error as Error).message.slice(0, 300) },
        },
      }).catch(() => {});
      throw error;
    } finally {
      const release = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`;
      await (redis as any).eval(release, 1, LOCK_KEY, lockId).catch(() => {});
    }
  },
};
