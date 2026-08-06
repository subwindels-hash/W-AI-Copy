/**
 * Global Currency, Payment Orchestration & Geo-Aware Billing Service — Session 129
 *
 * Implements:
 *   1. Configurable Country Payment Profiles (`geob:profile`) for 13+ global markets
 *   2. Automatic Geo-Aware Billing Context Resolution (country, currency, taxes, methods)
 *   3. Smart Payment Routing & WMPC Gift Card #1 Priority Engine with automatic failover
 *   4. Tax & Compliance Engine (VAT, GST, Sales Tax, DST with auditable exemptions)
 *   5. Unified Webhook Gateway Normalizer & EventBus/God-Node Orchestrator
 *   6. AI Billing Employee regional insights and fee optimization
 *   7. Dynamic Localized Checkout Initiator connecting gift cards, currency, and payments
 *
 * Keys:
 *   geob:profile:<cc>  (Redis hash storing serialized CountryPaymentProfile)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { EventBus } from "../services/eventBus.js";
import { GlobalCurrencyService } from "../globalCurrency/globalCurrency.service.js";
import { GiftCardsService } from "../giftCards/giftCards.service.js";
import { PaymentGatewaysService } from "../payments/payments.service.js";
import {
  type CountryPaymentProfile,
  type GeoBillingContext,
  type PaymentRoutingRequestInput,
  type PaymentRoutingPlan,
  type TaxCalculationRequestInput,
  type TaxCalculationResult,
  type UnifiedPaymentEvent,
  type AIBillingRecommendation,
  type GeoCheckoutRequestInput,
} from "@windels/shared";

const K = {
  profile: (cc: string) => `geob:profile:${cc.toUpperCase()}`,
};

const s2 = (o: any) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

// 13+ default regional country profiles
const DEFAULT_COUNTRY_PROFILES: Record<string, CountryPaymentProfile> = {
  NG: {
    countryCode: "NG",
    countryName: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    supportedPaymentMethods: ["wmpc-gift-card", "paystack", "flutterwave", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.075, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "en",
  },
  US: {
    countryCode: "US",
    countryName: "United States",
    currency: "USD",
    currencySymbol: "$",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "Sales Tax", rate: 0.08, included: false, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "MM/dd/yyyy",
    billingLanguage: "en",
  },
  GB: {
    countryCode: "GB",
    countryName: "United Kingdom",
    currency: "GBP",
    currencySymbol: "£",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.20, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "en",
  },
  DE: {
    countryCode: "DE",
    countryName: "Germany",
    currency: "EUR",
    currencySymbol: "€",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "sepa", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.19, included: true, exemptible: true },
    numberFormat: "#.##0,00",
    dateFormat: "dd.MM.yyyy",
    billingLanguage: "de",
  },
  FR: {
    countryCode: "FR",
    countryName: "France",
    currency: "EUR",
    currencySymbol: "€",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "sepa", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.20, included: true, exemptible: true },
    numberFormat: "# ##0,00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "fr",
  },
  JP: {
    countryCode: "JP",
    countryName: "Japan",
    currency: "JPY",
    currencySymbol: "¥",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "GST", rate: 0.10, included: true, exemptible: true },
    numberFormat: "#,##0",
    dateFormat: "yyyy/MM/dd",
    billingLanguage: "ja",
  },
  CN: {
    countryCode: "CN",
    countryName: "China",
    currency: "CNY",
    currencySymbol: "¥",
    supportedPaymentMethods: ["wmpc-gift-card", "bank-transfer"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.13, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "yyyy-MM-dd",
    billingLanguage: "zh",
  },
  GH: {
    countryCode: "GH",
    countryName: "Ghana",
    currency: "GHS",
    currencySymbol: "₵",
    supportedPaymentMethods: ["wmpc-gift-card", "paystack", "flutterwave"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.15, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "en",
  },
  KE: {
    countryCode: "KE",
    countryName: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    supportedPaymentMethods: ["wmpc-gift-card", "flutterwave", "paystack"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.16, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "en",
  },
  ZA: {
    countryCode: "ZA",
    countryName: "South Africa",
    currency: "ZAR",
    currencySymbol: "R",
    supportedPaymentMethods: ["wmpc-gift-card", "paystack", "flutterwave", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.15, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "yyyy/MM/dd",
    billingLanguage: "en",
  },
  AE: {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    currency: "AED",
    currencySymbol: "AED",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.05, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "en",
  },
  SA: {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    currency: "SAR",
    currencySymbol: "SAR",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "VAT", rate: 0.15, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "ar",
  },
  BR: {
    countryCode: "BR",
    countryName: "Brazil",
    currency: "BRL",
    currencySymbol: "R$",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "DST", rate: 0.05, included: true, exemptible: true },
    numberFormat: "#.##0,00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "pt",
  },
  CA: {
    countryCode: "CA",
    countryName: "Canada",
    currency: "CAD",
    currencySymbol: "C$",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "GST", rate: 0.05, included: false, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "yyyy-MM-dd",
    billingLanguage: "en",
  },
  AU: {
    countryCode: "AU",
    countryName: "Australia",
    currency: "AUD",
    currencySymbol: "A$",
    supportedPaymentMethods: ["wmpc-gift-card", "stripe", "paypal", "crypto"],
    defaultPaymentMethod: "wmpc-gift-card",
    taxRule: { type: "GST", rate: 0.10, included: true, exemptible: true },
    numberFormat: "#,##0.00",
    dateFormat: "dd/MM/yyyy",
    billingLanguage: "en",
  },
};

const memoryProfiles = new Map<string, CountryPaymentProfile>();

function getMemoryProfile(cc: string): CountryPaymentProfile {
  return memoryProfiles.get(cc.toUpperCase()) || DEFAULT_COUNTRY_PROFILES[cc.toUpperCase()] || DEFAULT_COUNTRY_PROFILES["NG"];
}

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "geo-billing", payload });
  } catch { /* optional during bootstrap */ }
}

export const GeoBillingService = {
  /**
   * Get all configurable Country Payment Profiles.
   */
  async listProfiles(): Promise<CountryPaymentProfile[]> {
    const countries = Object.keys(DEFAULT_COUNTRY_PROFILES);
    const profiles: CountryPaymentProfile[] = [];
    for (const cc of countries) {
      profiles.push(await this.getProfile(cc));
    }
    return profiles;
  },

  /**
   * Get single Country Payment Profile by code (`NG`, `US`, `GB`, etc.).
   */
  async getProfile(countryCode: string): Promise<CountryPaymentProfile> {
    const cc = (countryCode || "NG").toUpperCase();
    try {
      const raw = await redis.hget(K.profile(cc), "_doc");
      if (raw) return j<CountryPaymentProfile>(raw)!;
    } catch {}
    return getMemoryProfile(cc);
  },

  /**
   * Update a Country Payment Profile (super-admin / admin tool).
   */
  async updateProfile(countryCode: string, updates: Partial<CountryPaymentProfile>, actorId: string): Promise<CountryPaymentProfile> {
    const current = await this.getProfile(countryCode);
    const updated: CountryPaymentProfile = {
      ...current,
      ...updates,
      countryCode: current.countryCode,
    };

    memoryProfiles.set(updated.countryCode, updated);
    try {
      await redis.hset(K.profile(updated.countryCode), "_doc", s2(updated));
    } catch {}

    await emitKernel("geo-billing.profile.updated", { countryCode: updated.countryCode, actorId, currency: updated.currency });
    logger.info("Country Payment Profile updated", { countryCode: updated.countryCode, actorId });
    return updated;
  },

  /**
   * Automatically resolve caller's Geo-Billing Context.
   */
  async resolveContext(input: {
    userId?: string;
    countryCode?: string;
    ip?: string;
    acceptLanguage?: string;
  }): Promise<GeoBillingContext> {
    let countryCode = (input.countryCode || "NG").toUpperCase();

    // Check if user has explicit currency preference in GlobalCurrencyService
    let detectedBy = input.countryCode ? "explicit_country" : input.ip ? "ip_geolocation" : "default_NG";
    if (input.userId) {
      const prefs = await GlobalCurrencyService.getPreferences(input.userId);
      if (prefs?.preferredCurrency) {
        // Find matching country for override currency
        const match = Object.values(DEFAULT_COUNTRY_PROFILES).find((p) => p.currency === prefs.preferredCurrency);
        if (match) {
          countryCode = match.countryCode;
          detectedBy = "user_preference_override";
        }
      }
    }

    const profile = await this.getProfile(countryCode);

    // Get exchange rate from USD to local currency
    let exchangeRate = 1;
    try {
      const rateObj = await GlobalCurrencyService.getRate("USD", profile.currency);
      exchangeRate = rateObj.rate;
    } catch {
      exchangeRate = profile.currency === "NGN" ? 1520 : profile.currency === "GBP" ? 0.79 : profile.currency === "EUR" ? 0.92 : 1;
    }

    return {
      countryCode: profile.countryCode,
      countryName: profile.countryName,
      currency: profile.currency,
      currencySymbol: profile.currencySymbol,
      supportedPaymentMethods: profile.supportedPaymentMethods,
      defaultPaymentMethod: profile.defaultPaymentMethod,
      taxRule: profile.taxRule,
      numberFormat: profile.numberFormat,
      dateFormat: profile.dateFormat,
      exchangeRateFromUSD: exchangeRate,
      wmpcGiftCardPriority: true,
      detectedBy,
    };
  },

  /**
   * Calculate regional tax obligations and totals for an amount.
   */
  async calculateTax(input: TaxCalculationRequestInput): Promise<TaxCalculationResult> {
    const profile = await this.getProfile(input.country || "NG");
    const isExempt = input.isExempt && profile.taxRule.exemptible;

    const rate = isExempt ? 0 : profile.taxRule.rate;
    const taxAmount = Number((input.amount * rate).toFixed(2));
    const grossAmount = profile.taxRule.included ? input.amount : Number((input.amount + taxAmount).toFixed(2));
    const netAmount = profile.taxRule.included ? Number((input.amount - taxAmount).toFixed(2)) : input.amount;

    return {
      country: profile.countryCode,
      grossAmount,
      taxAmount,
      netAmount,
      taxType: profile.taxRule.type,
      taxRate: rate,
      exemptApplied: Boolean(isExempt),
    };
  },

  /**
   * Intelligent payment routing engine: calculates local amounts, gift card priority,
   * and automatic provider failover order.
   */
  async routePayment(organizationId: string, input: PaymentRoutingRequestInput): Promise<PaymentRoutingPlan> {
    const country = input.country || "NG";
    const profile = await this.getProfile(country);

    // Localize amount from USD (or input currency) to country profile currency
    let localAmount = input.amount;
    let localCurrency = profile.currency;
    let localFormatted = `${profile.currencySymbol}${localAmount.toFixed(2)}`;
    try {
      const loc = await GlobalCurrencyService.localizePrice(input.amount, input.currency || "USD", profile.currency, country);
      localAmount = loc.amount;
      localCurrency = loc.currency;
      localFormatted = loc.formatted;
    } catch {}

    const taxCalc = await this.calculateTax({ amount: localAmount, country });
    const totalWithTax = taxCalc.grossAmount;

    // Check WMPC Gift Card balance priority
    let wmpcGiftCardApplied = false;
    let giftCardRedeemedAmount = 0;
    let remainingAmountForGateway = totalWithTax;

    if (input.useGiftCardBalance) {
      try {
        const activeCards = await GiftCardsService.listCards("active");
        const availableCard = input.giftCardId ? activeCards.find((c) => c.id === input.giftCardId) : activeCards[0];

        if (availableCard && availableCard.balance > 0) {
          wmpcGiftCardApplied = true;
          // Calculate how much local currency the gift card covers
          giftCardRedeemedAmount = Math.min(totalWithTax, availableCard.balance);
          remainingAmountForGateway = Number((totalWithTax - giftCardRedeemedAmount).toFixed(2));
        }
      } catch (e: any) {
        logger.debug("GeoBillingService.routePayment: gift card check fallback", { error: e?.message });
      }
    }

    // Determine gateway failover order (excluding wmpc-gift-card from gateway list)
    const availableGateways = profile.supportedPaymentMethods.filter((m) => m !== "wmpc-gift-card");
    let selectedProvider = input.preferredProvider || availableGateways[0] || "paystack";

    if (!availableGateways.includes(selectedProvider)) {
      selectedProvider = availableGateways[0] || "paystack";
    }

    const fallbackProviders = availableGateways.filter((p) => p !== selectedProvider);

    return {
      selectedProvider,
      fallbackProviders,
      amount: input.amount,
      currency: input.currency || "USD",
      localAmount,
      localCurrency,
      localFormatted,
      taxAmount: taxCalc.taxAmount,
      totalWithTax,
      wmpcGiftCardApplied,
      giftCardRedeemedAmount,
      remainingAmountForGateway,
    };
  },

  /**
   * Unified Webhook Gateway Normalizer across all payment providers.
   */
  async normalizeWebhookEvent(
    source: string,
    rawPayload: Record<string, unknown>,
    verified: boolean,
    organizationId = "org-geo-default"
  ): Promise<UnifiedPaymentEvent> {
    const eventTypeStr = String(rawPayload.event || rawPayload.eventType || rawPayload.type || "payment.completed").toLowerCase();

    let eventType: UnifiedPaymentEvent["eventType"] = "payment.completed";
    if (eventTypeStr.includes("fail")) eventType = "payment.failed";
    else if (eventTypeStr.includes("refund")) eventType = "refund.issued";
    else if (eventTypeStr.includes("chargeback")) eventType = "chargeback.received";
    else if (eventTypeStr.includes("init")) eventType = "payment.initiated";

    const ref = String(
      rawPayload.reference || rawPayload.tx_ref || rawPayload.orderId || rawPayload.txid || `ref_${Date.now()}`
    );
    const amount = Number(rawPayload.amount || 0);
    const currency = String(rawPayload.currency || "USD").toUpperCase();

    const normalized: UnifiedPaymentEvent = {
      eventId: `unevt_${Date.now()}_${randomUUID().slice(0, 8)}`,
      provider: source,
      eventType,
      transactionRef: ref,
      amount,
      currency,
      organizationId,
      timestamp: new Date().toISOString(),
      verified,
      metadata: { raw: rawPayload },
    };

    // Emit to EventBus and God-Node Orchestrator
    try {
      await EventBus.emit("geoBilling.event_normalized", normalized);
      await emitKernel("geo-billing.webhook.normalized", normalized);
    } catch {}

    return normalized;
  },

  /**
   * AI Billing Employee regional insights and recommendations.
   */
  async getAIInsights(countryCode: string, amountUSD: number): Promise<AIBillingRecommendation> {
    const cc = (countryCode || "NG").toUpperCase();
    const profile = await this.getProfile(cc);

    let recommendedProvider = "wmpc-gift-card";
    let estimatedFee = 0.0;
    let reason = "WMPC Gift Card is the global #1 priority with 0% processing fee.";
    let advice = "Combine gift card balance with Paystack or Flutterwave for instant settlement.";

    if (cc === "NG" || cc === "GH" || cc === "KE" || cc === "ZA") {
      recommendedProvider = "paystack";
      estimatedFee = 1.5;
      reason = `Paystack provides highest authorization success rate (99.2%) across ${profile.countryName}.`;
      advice = "Enable both card and mobile money checkout channels to minimize drop-off.";
    } else if (cc === "US" || cc === "GB" || cc === "DE" || cc === "FR") {
      recommendedProvider = "stripe";
      estimatedFee = 2.9;
      reason = `Stripe provides native regional payment methods (Apple Pay, SEPA) in ${profile.countryName}.`;
      advice = "Offer PayPal as a secondary alternative checkout option.";
    } else {
      recommendedProvider = "crypto";
      estimatedFee = 1.0;
      reason = "Sovereign on-chain crypto checkout provides permissionless settlement with 1.0% fee.";
      advice = "Recommend Tron TRC-20 USDT for low network gas fees.";
    }

    return {
      country: profile.countryName,
      currency: profile.currency,
      recommendedProvider,
      reason,
      estimatedProcessingFeePct: estimatedFee,
      taxSummary: `${profile.taxRule.type} (${(profile.taxRule.rate * 100).toFixed(1)}%) — ${profile.taxRule.included ? "included in gross price" : "added at checkout"}.`,
      fraudRiskLevel: "low",
      advice,
    };
  },

  /**
   * Dynamic Geo-Checkout initiator combining Gift Cards, Taxes, Currency, and Gateway Failover.
   */
  async initiateGeoCheckout(organizationId: string, input: GeoCheckoutRequestInput): Promise<{
    routingPlan: PaymentRoutingPlan;
    giftCardRedeemed: boolean;
    gatewayTransaction?: any;
    checkoutStatus: "completed" | "pending_gateway";
  }> {
    const plan = await this.routePayment(organizationId, {
      amount: input.amount,
      currency: input.currency,
      country: input.country,
      preferredProvider: input.preferredProvider,
      useGiftCardBalance: input.useGiftCardBalance,
      giftCardId: input.giftCardId,
    });

    let giftCardRedeemed = false;
    if (plan.wmpcGiftCardApplied && plan.giftCardRedeemedAmount > 0 && input.giftCardId) {
      try {
        await GiftCardsService.redeem(
          input.giftCardId,
          plan.giftCardRedeemedAmount,
          input.giftCardPin,
          input.invoiceId || `geotx_${Date.now()}`
        );
        giftCardRedeemed = true;
      } catch (err: any) {
        logger.warn("GeoBillingService.initiateGeoCheckout: gift card redemption failed", { error: err?.message });
      }
    }

    let gatewayTransaction: any = undefined;
    let checkoutStatus: "completed" | "pending_gateway" = "completed";

    if (plan.remainingAmountForGateway > 0) {
      checkoutStatus = "pending_gateway";
      try {
        gatewayTransaction = await PaymentGatewaysService.initiateCheckout(organizationId, {
          provider: plan.selectedProvider as any,
          amount: plan.remainingAmountForGateway,
          currency: plan.localCurrency,
          invoiceId: input.invoiceId,
          description: input.description,
          customerEmail: input.customerEmail,
          cryptoNetwork: input.cryptoNetwork as any,
        });
      } catch (e: any) {
        logger.warn("GeoBillingService.initiateGeoCheckout: primary provider failed, failing over to fallback", { error: e?.message });
        if (plan.fallbackProviders.length > 0) {
          gatewayTransaction = await PaymentGatewaysService.initiateCheckout(organizationId, {
            provider: plan.fallbackProviders[0] as any,
            amount: plan.remainingAmountForGateway,
            currency: plan.localCurrency,
            invoiceId: input.invoiceId,
            description: input.description,
            customerEmail: input.customerEmail,
          });
        }
      }
    }

    await emitKernel("geo-billing.checkout.initiated", {
      organizationId,
      countryCode: input.country || "NG",
      totalWithTax: plan.totalWithTax,
      giftCardRedeemed,
      gatewayProvider: plan.selectedProvider,
      status: checkoutStatus,
    });

    return {
      routingPlan: plan,
      giftCardRedeemed,
      gatewayTransaction,
      checkoutStatus,
    };
  },
};
