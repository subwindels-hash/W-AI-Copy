/**
 * WINDELS AI OS — Financial Policy module contract.
 *
 * The backend module (`apps/api/src/financial`) is the authoritative
 * provenance/decision-safety layer shared by payments, billing, invoices,
 * wallet, trading, risk, valuation, P&L and subscriptions. This contract is
 * what the `/api/v1/financial` console exposes so operators and AI tools can
 * inspect and exercise those gates explicitly.
 *
 * The low-level provenance primitives live in `./financialPolicy` (kept
 * separate so every financial module can import them without pulling in the
 * console's dashboard types). Re-export them here for one-stop imports.
 */
export * from "./financialPolicy.js";
import { z } from "zod";
import {
  FinancialClassificationSchema,
  FinancialProvenanceSchema,
} from "./financialPolicy.js";

/**
 * A decision-safety check request: pass a provenance record plus optional
 * sandbox / freshness options and ask whether the value may drive a real
 * financial operation.
 */
export const FinancialDecisionRequestSchema = z.object({
  provenance: FinancialProvenanceSchema,
  allowSandbox: z.boolean().optional(),
  maxAgeMs: z.number().int().positive().optional(),
});
export type FinancialDecisionRequest = z.infer<typeof FinancialDecisionRequestSchema>;

/** The non-throwing verdict of a decision-safety check. */
export const FinancialDecisionResponseSchema = z.object({
  safe: z.boolean(),
  reason: z.string().nullable(),
});
export type FinancialDecisionResponse = z.infer<typeof FinancialDecisionResponseSchema>;

/** One audited decision/provenance record stored in the tenant ledger. */
export const FinancialLedgerEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdAt: z.string(),
  source: z.string(),
  provider: z.string().nullable(),
  status: FinancialClassificationSchema,
  safe: z.boolean(),
  reason: z.string().nullable(),
});
export type FinancialLedgerEntry = z.infer<typeof FinancialLedgerEntrySchema>;

/** Rollup view for the financial policy console. */
export const FinancialDashboardSchema = z.object({
  runtimeMode: z.string(),
  demoData: z.boolean(),
  ledgerCount: z.number().int().min(0),
  countsByStatus: z.record(FinancialClassificationSchema, z.number().int().min(0)),
  safeDecisions: z.number().int().min(0),
  blockedDecisions: z.number().int().min(0),
  recentLedger: z.array(FinancialLedgerEntrySchema),
  providersSeen: z.array(z.string()),
});
export type FinancialDashboard = z.infer<typeof FinancialDashboardSchema>;

/** Input accepted by the provenance-factory endpoints. */
export const FinancialProvenanceInputSchema = z.object({
  source: z.string().min(1).max(200),
  provider: z.string().min(1).max(200).optional(),
  providerTransactionId: z.string().max(200).nullable().optional(),
  currency: z.string().min(1).max(8).default("USD"),
  reason: z.string().max(500).optional(),
});
/** Input accepted by the provenance-factory endpoints (before zod fills defaults). */
export type FinancialProvenanceInput = z.input<typeof FinancialProvenanceInputSchema>;
/** The fully-parsed provenance-factory input (defaults applied). */
export type FinancialProvenanceInputParsed = z.output<typeof FinancialProvenanceInputSchema>;
