/**
 * Shared types — Session 80: Global Multi-Currency & Localization.
 *
 * Currency/locale detection, multi-provider exchange rates with caching and
 * offline fallback, user currency preferences, payment-method localization
 * (including WMPC gift cards from Session 79), multi-currency reporting,
 * and AI agents for trend/optimization/monitoring. LocalizationContext is
 * the single source of truth; no other surface computes locale itself.
 */

export interface GcExchangeRate {
  from: string;
  to: string;
  rate: number;
  source: "live" | "cache" | "enterprise-override" | "offline-fallback";
  updatedAt: string;
}

export interface GcUserCurrencyPrefs {
  userId: string;
  autoDetect: boolean;
  preferredCurrency: string;
  preferredLanguage: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  taxRegion?: string;
}

export interface GcLocalizedPrice {
  amount: number;
  currency: string;
  formatted: string;
  exchangeRate: number;
  sourceRate: string;
}

export interface GcuDashboard {
  currenciesSupported: number;
  languagesSupported: number;
  rateProviders: number;
  offlineFallbackHealthy: boolean;
  multiCurrencyReporting: boolean;
  paymentMethodsLocalized: number;
  fraudGuardsActive: number;
  agents: number;
  countriesSupported: number;
}
