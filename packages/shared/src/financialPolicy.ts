import { z } from "zod";

/**
 * WINDELS AI OS — Authoritative Financial Data Policy
 *
 * Enforces classification, provenance tracking, and safety gates for all
 * financial values across payments, billing, invoices, wallet, trading,
 * risk, valuation, P&L, subscriptions, financial dashboards, and AI tools.
 */

export const FinancialClassificationSchema = z.enum([
  "REAL",
  "SIMULATED",
  "UNAVAILABLE",
  "UNVERIFIED",
  "STALE",
]);

export type FinancialClassification = z.infer<typeof FinancialClassificationSchema>;

export const FinancialProvenanceSchema = z.object({
  source: z.string().min(1),
  provider: z.string().min(1),
  providerTransactionId: z.string().nullable().optional(),
  organizationId: z.string().min(1),
  observedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  verifiedAt: z.string().datetime().nullable().optional(),
  currency: z.string().length(3).or(z.string().min(1)),
  status: FinancialClassificationSchema,
  reason: z.string().optional(),
});

export type FinancialProvenance = z.infer<typeof FinancialProvenanceSchema>;

export interface FinancialValue<T = number> {
  value: T;
  provenance: FinancialProvenance;
}

export interface FinancialResult<T = number> {
  status: FinancialClassification;
  data?: FinancialValue<T>;
  reason?: string;
  errorCode?: string;
}

/**
 * Gate that prevents AI agents or automated decision engines from making
 * financial decisions on non-REAL data unless explicitly running in a sandbox.
 */
export function isFinancialDataDecisionSafe(
  provenance: FinancialProvenance,
  options: { allowSandbox?: boolean; maxAgeMs?: number } = {},
): { safe: boolean; reason?: string } {
  if (options.allowSandbox && provenance.status === "SIMULATED") {
    return { safe: true };
  }

  if (provenance.status === "SIMULATED") {
    return {
      safe: false,
      reason: "FINANCIAL_DATA_SIMULATED: Cannot execute real financial operation using demo/simulated data.",
    };
  }

  if (provenance.status === "UNAVAILABLE") {
    return {
      safe: false,
      reason: "FINANCIAL_DATA_UNAVAILABLE: Real provider is not connected or reachable.",
    };
  }

  if (provenance.status === "UNVERIFIED") {
    return {
      safe: false,
      reason: "FINANCIAL_DATA_UNVERIFIED: Financial record has not been verified against authoritative ledger or provider.",
    };
  }

  if (provenance.status === "STALE") {
    return {
      safe: false,
      reason: "FINANCIAL_DATA_STALE: Financial record/quote exceeds maximum freshness threshold.",
    };
  }

  if (options.maxAgeMs && provenance.observedAt) {
    const age = Date.now() - new Date(provenance.observedAt).getTime();
    if (age > options.maxAgeMs) {
      return {
        safe: false,
        reason: `FINANCIAL_DATA_EXPIRED: Financial record age (${Math.round(age / 1000)}s) exceeds max allowed age (${Math.round(options.maxAgeMs / 1000)}s).`,
      };
    }
  }

  if (provenance.status === "REAL") {
    return { safe: true };
  }

  return { safe: false, reason: `FINANCIAL_DATA_UNSAFE: Unknown status "${provenance.status}".` };
}

/**
 * Helper to construct an UNAVAILABLE financial response.
 */
export function createUnavailableFinancialResponse(
  provider: string,
  organizationId: string,
  reason: string,
  currency = "USD",
): FinancialResult {
  return {
    status: "UNAVAILABLE",
    reason,
    errorCode: "REAL_PROVIDER_NOT_CONFIGURED",
    data: {
      value: 0,
      provenance: {
        source: "provider_check",
        provider,
        providerTransactionId: null,
        organizationId,
        observedAt: new Date().toISOString(),
        verifiedAt: null,
        currency,
        status: "UNAVAILABLE",
        reason,
      },
    },
  };
}
