/**
 * WINDELS AI OS — Financial Policy Enforcement Service
 *
 * Single authoritative validation layer used by:
 * - payments
 * - billing
 * - invoices
 * - wallet
 * - trading
 * - risk
 * - valuation
 * - P&L
 * - subscriptions
 * - financial dashboards
 * - AI financial tools
 */

import {
  FinancialClassification,
  FinancialProvenance,
  isFinancialDataDecisionSafe,
  createUnavailableFinancialResponse,
  FinancialResult,
  FinancialValue,
} from "@windels/shared/financialPolicy";
import { env } from "../config/env.js";
import { demoDataEnabled } from "../config/demoData.js";
import { AppError } from "../utils/result.js";

export class FinancialPolicyError extends AppError {
  constructor(
    message: string,
    public readonly classification: FinancialClassification,
    public readonly provenance?: FinancialProvenance,
  ) {
    super("BAD_REQUEST", message, 400, {
      code: `FINANCIAL_POLICY_${classification}`,
      provenance,
    });
  }
}

export const FinancialPolicyService = {
  /**
   * Verify if a financial record provenance is safe for execution or decisions.
   */
  assertDecisionSafe(
    provenance: FinancialProvenance,
    options: { allowSandbox?: boolean; maxAgeMs?: number } = {},
  ): void {
    // Production mode strictly rejects SIMULATED data unless explicitly in test/sandbox
    if (env.WINDELS_RUNTIME_MODE === "production" || env.NODE_ENV === "production") {
      if (provenance.status === "SIMULATED" && !options.allowSandbox) {
        throw new FinancialPolicyError(
          "Production mode rejects simulated financial records for live financial decisions.",
          "SIMULATED",
          provenance,
        );
      }
    }

    const check = isFinancialDataDecisionSafe(provenance, options);
    if (!check.safe) {
      throw new FinancialPolicyError(
        check.reason ?? "Financial record is not safe for decision/execution.",
        provenance.status,
        provenance,
      );
    }
  },

  /**
   * Create provenance metadata for a verified real financial record.
   */
  createRealProvenance(
    source: string,
    provider: string,
    providerTransactionId: string | null,
    organizationId: string,
    currency = "USD",
  ): FinancialProvenance {
    const now = new Date().toISOString();
    return {
      source,
      provider,
      providerTransactionId,
      organizationId,
      observedAt: now,
      verifiedAt: now,
      currency,
      status: "REAL",
    };
  },

  /**
   * Create provenance metadata for a demo/simulated financial record.
   * Can ONLY be used when demoDataEnabled() is true AND not in production mode.
   */
  createSimulatedProvenance(
    source: string,
    organizationId: string,
    reason = "DEMO_FIXTURE",
    currency = "USD",
  ): FinancialProvenance {
    if (env.WINDELS_RUNTIME_MODE === "production" || env.NODE_ENV === "production") {
      if (!demoDataEnabled()) {
        throw new FinancialPolicyError(
          "Cannot construct simulated financial provenance in production mode.",
          "SIMULATED",
        );
      }
    }

    return {
      source,
      provider: "simulated_fixture",
      providerTransactionId: null,
      organizationId,
      observedAt: new Date().toISOString(),
      verifiedAt: null,
      currency,
      status: "SIMULATED",
      reason,
    };
  },

  /**
   * Create provenance metadata when real provider is unavailable.
   */
  createUnavailableProvenance(
    source: string,
    provider: string,
    organizationId: string,
    reason: string,
    currency = "USD",
  ): FinancialProvenance {
    return {
      source,
      provider,
      providerTransactionId: null,
      organizationId,
      observedAt: new Date().toISOString(),
      verifiedAt: null,
      currency,
      status: "UNAVAILABLE",
      reason,
    };
  },

  /**
   * Fail-closed helper: returns unavailable error when provider is missing or unhealthy.
   */
  returnUnavailable(
    provider: string,
    organizationId: string,
    reason: string,
  ): FinancialResult {
    return createUnavailableFinancialResponse(provider, organizationId, reason);
  },
};
