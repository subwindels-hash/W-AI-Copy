/**
 * Session 80 — Global Multi-Currency & Localization API client.
 */
import { api } from "./api";
import type { GcExchangeRate, GcUserCurrencyPrefs, GcLocalizedPrice, GcuDashboard } from "@windels/shared";
export type { GcExchangeRate, GcUserCurrencyPrefs, GcLocalizedPrice, GcuDashboard } from "@windels/shared";

export interface Detection {
  country: string; currency: string; language: string; timezone: string;
  dateFormat: string; numberFormat: string; taxRegion?: string;
  paymentMethods: string[]; detectedBy: string;
}
export interface RegionalPrice { country: string; localAmount: number; currency: string; formatted: string; tax: { rate: number; included: boolean }; }
export interface MultiCurrencyReport { total: number; target: string; breakdown: Array<{ original: number; currency: string; converted: number; rate: number }>; }

export const gcuApi = {
  dashboard: () => api<GcuDashboard>("/global-currency/dashboard/rollup"),
  currencies: () => api<string[]>("/global-currency/currencies"),
  languages: () => api<string[]>("/global-currency/languages"),
  countries: () => api<string[]>("/global-currency/countries"),
  detect: (input: { country?: string; acceptLanguage?: string; ip?: string }) =>
    api<Detection>("/global-currency/detect", { method: "POST", json: input }),
  rate: (from: string, to: string) => api<GcExchangeRate>(`/global-currency/rates/${from}/${to}`),
  setOverride: (from: string, to: string, rate: number) =>
    api<GcExchangeRate>(`/global-currency/rates/${from}/${to}/override`, { method: "POST", json: { rate } }),
  localizePrice: (amount: number, from: string, to: string, country?: string) =>
    api<GcLocalizedPrice>("/global-currency/localize-price", { method: "POST", json: { amount, from, to, country } }),
  regionalPrice: (amountUSD: number, country: string) =>
    api<RegionalPrice>("/global-currency/regional-price", { method: "POST", json: { amountUSD, country } }),
  report: (rows: Array<{ amount: number; currency: string }>, target: string) =>
    api<MultiCurrencyReport>("/global-currency/report", { method: "POST", json: { rows, target } }),
  preferences: () => api<GcUserCurrencyPrefs | null>("/global-currency/preferences"),
  setPreferences: (prefs: Omit<GcUserCurrencyPrefs, "userId">) =>
    api<GcUserCurrencyPrefs>("/global-currency/preferences", { method: "PUT", json: prefs }),
  fraudCheck: (from: string, to: string, observedRate: number) =>
    api<{ safe: boolean; deviation: number; flagId?: string }>("/global-currency/fraud/check", { method: "POST", json: { from, to, observedRate } }),
  agents: () => api<Array<{ id: string; name: string; domain: string; role: string; disclaimer: string }>>("/global-currency/agents"),
};
