import { z } from "zod";

export const GEO_TAX_TYPES = ["VAT", "GST", "Sales Tax", "DST", "None"] as const;
export type GeoTaxType = (typeof GEO_TAX_TYPES)[number];

export const GEO_PAYMENT_METHODS = [
  "wmpc-gift-card",
  "paystack",
  "flutterwave",
  "stripe",
  "paypal",
  "crypto",
  "blockonomics",
  "bank-transfer",
  "sepa",
] as const;

export type GeoPaymentMethod = (typeof GEO_PAYMENT_METHODS)[number];

export const CountryPaymentProfileSchema = z.object({
  countryCode: z.string().min(2).max(3),
  countryName: z.string(),
  currency: z.string().length(3),
  currencySymbol: z.string(),
  supportedPaymentMethods: z.array(z.string()),
  defaultPaymentMethod: z.string(),
  taxRule: z.object({
    type: z.enum(GEO_TAX_TYPES),
    rate: z.number().nonnegative(),
    included: z.boolean().default(true),
    exemptible: z.boolean().default(true),
  }),
  numberFormat: z.string(),
  dateFormat: z.string(),
  billingLanguage: z.string().default("en"),
});

export type CountryPaymentProfile = z.infer<typeof CountryPaymentProfileSchema>;

export const GeoBillingContextSchema = z.object({
  countryCode: z.string(),
  countryName: z.string(),
  currency: z.string(),
  currencySymbol: z.string(),
  supportedPaymentMethods: z.array(z.string()),
  defaultPaymentMethod: z.string(),
  taxRule: CountryPaymentProfileSchema.shape.taxRule,
  numberFormat: z.string(),
  dateFormat: z.string(),
  exchangeRateFromUSD: z.number().positive(),
  wmpcGiftCardPriority: z.boolean().default(true),
  detectedBy: z.string(),
});

export type GeoBillingContext = z.infer<typeof GeoBillingContextSchema>;

export const PaymentRoutingRequestSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  country: z.string().optional(),
  preferredProvider: z.string().optional(),
  useGiftCardBalance: z.boolean().default(true),
  giftCardId: z.string().optional(),
});

export type PaymentRoutingRequestInput = z.input<typeof PaymentRoutingRequestSchema>;

export const PaymentRoutingPlanSchema = z.object({
  selectedProvider: z.string(),
  fallbackProviders: z.array(z.string()),
  amount: z.number().positive(),
  currency: z.string(),
  localAmount: z.number().positive(),
  localCurrency: z.string(),
  localFormatted: z.string(),
  taxAmount: z.number().nonnegative(),
  totalWithTax: z.number().positive(),
  wmpcGiftCardApplied: z.boolean(),
  giftCardRedeemedAmount: z.number().nonnegative(),
  remainingAmountForGateway: z.number().nonnegative(),
});

export type PaymentRoutingPlan = z.infer<typeof PaymentRoutingPlanSchema>;

export const TaxCalculationRequestSchema = z.object({
  amount: z.number().positive(),
  country: z.string().default("NG"),
  isExempt: z.boolean().default(false),
});

export type TaxCalculationRequestInput = z.input<typeof TaxCalculationRequestSchema>;

export const TaxCalculationResultSchema = z.object({
  country: z.string(),
  grossAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  taxType: z.enum(GEO_TAX_TYPES),
  taxRate: z.number().nonnegative(),
  exemptApplied: z.boolean(),
});

export type TaxCalculationResult = z.infer<typeof TaxCalculationResultSchema>;

export const GeoCheckoutRequestSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  country: z.string().optional(),
  preferredProvider: z.string().optional(),
  useGiftCardBalance: z.boolean().default(true),
  giftCardId: z.string().optional(),
  giftCardPin: z.string().optional(),
  invoiceId: z.string().optional(),
  description: z.string().max(500).optional(),
  customerEmail: z.string().email().optional(),
  cryptoNetwork: z.string().optional(),
});

export type GeoCheckoutRequestInput = z.input<typeof GeoCheckoutRequestSchema>;

export const UnifiedPaymentEventSchema = z.object({
  eventId: z.string(),
  provider: z.string(),
  eventType: z.enum([
    "payment.initiated",
    "payment.completed",
    "payment.failed",
    "refund.issued",
    "chargeback.received",
    "subscription.renewed",
    "subscription.cancelled",
    "gift_card.redeemed",
  ]),
  transactionRef: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string(),
  organizationId: z.string(),
  timestamp: z.string(),
  verified: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

export type UnifiedPaymentEvent = z.infer<typeof UnifiedPaymentEventSchema>;

export const AIBillingRecommendationSchema = z.object({
  country: z.string(),
  currency: z.string(),
  recommendedProvider: z.string(),
  reason: z.string(),
  estimatedProcessingFeePct: z.number().nonnegative(),
  taxSummary: z.string(),
  fraudRiskLevel: z.enum(["low", "medium", "high"]),
  advice: z.string(),
});

export type AIBillingRecommendation = z.infer<typeof AIBillingRecommendationSchema>;
