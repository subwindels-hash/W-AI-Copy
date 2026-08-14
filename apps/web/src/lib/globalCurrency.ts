/**
 * Session 80 — Global Multi-Currency & Localization API client.
 */
import { api } from "./api";
import type {
  GcExchangeRate, GcUserCurrencyPrefs, GcLocalizedPrice, GcuDashboard,
  GcDetection, GcRegionalPrice, GcManipulationCheck, GcRateSource, GcRateStaleness,
} from "@windels/shared";
export type {
  GcExchangeRate, GcUserCurrencyPrefs, GcLocalizedPrice, GcuDashboard,
  GcDetection, GcRegionalPrice, GcManipulationCheck, GcRateSource, GcRateStaleness,
} from "@windels/shared";

/** S167 — `Detection` and `RegionalPrice` moved into @windels/shared so the
 *  client cannot drift from the contract. Aliases kept for existing callers. */
export type Detection = GcDetection;
export type RegionalPrice = GcRegionalPrice;

export interface MultiCurrencyReport {
  total: number; target: string;
  breakdown: Array<{ original: number; currency: string; converted: number; rate: number; source: GcRateSource; staleness: GcRateStaleness; derived: boolean; usableForBilling: boolean }>;
  usableForBilling: boolean;
  rowsWithUnusableRate: number;
  worstStaleness: GcRateStaleness | null;
}

export const gcuApi = {
  dashboard: () => api<GcuDashboard>("/global-currency/dashboard/rollup"),
  currencies: () => api<string[]>("/global-currency/currencies"),
  languages: () => api<string[]>("/global-currency/languages"),
  countries: () => api<string[]>("/global-currency/countries"),
  detect: (input: { country?: string; acceptLanguage?: string; ip?: string }) =>
    api<GcDetection>("/global-currency/detect", { method: "POST", json: input }),
  rate: (from: string, to: string) => api<GcExchangeRate>(`/global-currency/rates/${from}/${to}`),
  setOverride: (from: string, to: string, rate: number) =>
    api<GcExchangeRate>(`/global-currency/rates/${from}/${to}/override`, { method: "POST", json: { rate } }),
  localizePrice: (amount: number, from: string, to: string, country?: string) =>
    api<GcLocalizedPrice>("/global-currency/localize-price", { method: "POST", json: { amount, from, to, country } }),
  regionalPrice: (amountUSD: number, country: string) =>
    api<GcRegionalPrice>("/global-currency/regional-price", { method: "POST", json: { amountUSD, country } }),
  // S167 — the override used to be write-only.
  getOverride: (from: string, to: string) => api<GcExchangeRate & { setBy?: string }>(`/global-currency/rates/${from}/${to}/override`),
  clearOverride: (from: string, to: string) =>
    api<{ cleared: boolean }>(`/global-currency/rates/${from}/${to}/override`, { method: "DELETE" }),
  report: (rows: Array<{ amount: number; currency: string }>, target: string) =>
    api<MultiCurrencyReport>("/global-currency/report", { method: "POST", json: { rows, target } }),
  preferences: () => api<GcUserCurrencyPrefs | null>("/global-currency/preferences"),
  setPreferences: (prefs: Omit<GcUserCurrencyPrefs, "userId">) =>
    api<GcUserCurrencyPrefs>("/global-currency/preferences", { method: "PUT", json: prefs }),
  fraudCheck: (from: string, to: string, observedRate: number) =>
    api<GcManipulationCheck>("/global-currency/fraud/check", { method: "POST", json: { from, to, observedRate } }),
  agents: () => api<Array<{ id: string; name: string; domain: string; role: string; disclaimer: string }>>("/global-currency/agents"),
};
