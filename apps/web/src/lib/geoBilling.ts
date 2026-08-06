/**
 * Global Currency, Payment Orchestration & Geo-Aware Billing web client (routes/geoBilling.ts → /api/v1/geo-billing).
 *
 * Provides typed functions for:
 *   - Automatic country/currency/tax localization context (`getGeoBillingContext`)
 *   - Configurable Country Payment Profiles (`listCountryPaymentProfiles`, `updateCountryPaymentProfile`)
 *   - Smart Payment Routing & WMPC Gift Card #1 Priority (`routePaymentRequest`)
 *   - Regional Tax Calculation (`calculateRegionalTax`)
 *   - AI Billing Employee Insights (`getAIBillingInsights`)
 *   - Dynamic Localized Checkout Initiator (`initiateDynamicGeoCheckout`)
 */
import { api } from "./api";
import type {
  CountryPaymentProfile,
  GeoBillingContext,
  PaymentRoutingRequestInput,
  PaymentRoutingPlan,
  TaxCalculationRequestInput,
  TaxCalculationResult,
  AIBillingRecommendation,
  GeoCheckoutRequestInput,
} from "@windels/shared";

export type {
  CountryPaymentProfile,
  GeoBillingContext,
  PaymentRoutingRequestInput,
  PaymentRoutingPlan,
  TaxCalculationRequestInput,
  TaxCalculationResult,
  AIBillingRecommendation,
  GeoCheckoutRequestInput,
};

/**
 * Resolve the caller's automatic Geo-Billing localization context.
 */
export function getGeoBillingContext(params?: { country?: string }): Promise<GeoBillingContext> {
  const qs = params?.country ? `?country=${encodeURIComponent(params.country)}` : "";
  return api<GeoBillingContext>(`/geo-billing/context${qs}`);
}

/**
 * List all configurable Country Payment Profiles.
 */
export function listCountryPaymentProfiles(): Promise<CountryPaymentProfile[]> {
  return api<CountryPaymentProfile[]>("/geo-billing/profiles");
}

/**
 * Get a single Country Payment Profile by code.
 */
export function getCountryPaymentProfile(countryCode: string): Promise<CountryPaymentProfile> {
  return api<CountryPaymentProfile>(`/geo-billing/profiles/${encodeURIComponent(countryCode)}`);
}

/**
 * Update a Country Payment Profile (super admin / admin tool).
 */
export function updateCountryPaymentProfile(
  countryCode: string,
  updates: Partial<CountryPaymentProfile>
): Promise<CountryPaymentProfile> {
  return api<CountryPaymentProfile>(`/geo-billing/profiles/${encodeURIComponent(countryCode)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

/**
 * Evaluate intelligent payment routing and failover order.
 */
export function routePaymentRequest(input: PaymentRoutingRequestInput): Promise<PaymentRoutingPlan> {
  return api<PaymentRoutingPlan>("/geo-billing/route-payment", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Calculate regional tax obligations and net/gross totals.
 */
export function calculateRegionalTax(input: TaxCalculationRequestInput): Promise<TaxCalculationResult> {
  return api<TaxCalculationResult>("/geo-billing/tax-calculate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Retrieve AI Billing Employee recommendations and regional fee insights.
 */
export function getAIBillingInsights(params?: { country?: string; amount?: number }): Promise<AIBillingRecommendation> {
  const q = new URLSearchParams();
  if (params?.country) q.set("country", params.country);
  if (params?.amount) q.set("amount", String(params.amount));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return api<AIBillingRecommendation>(`/geo-billing/ai-insights${qs}`);
}

/**
 * Initiate dynamic localized checkout connecting gift cards, currency, and gateway failover.
 */
export function initiateDynamicGeoCheckout(input: GeoCheckoutRequestInput): Promise<{
  routingPlan: PaymentRoutingPlan;
  giftCardRedeemed: boolean;
  gatewayTransaction?: any;
  checkoutStatus: "completed" | "pending_gateway";
}> {
  return api("/geo-billing/checkout/initiate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
