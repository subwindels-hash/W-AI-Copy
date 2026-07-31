/**
 * Session 81 — Unified Global Financial Markets Intelligence & Trading Platform API client.
 * Extends Session 35 Crypto Intelligence across 13 market classes with 18 AI agents.
 */
import { api } from "./api";
import type { TiDashboard, TiAgent, TiIndicatorPlugin, TiInstrument, TiMarketClass, TiRiskProfile, TiPosition, TiSentimentReading, TiSimulationResult, TiSimScenario, TiEconomicEvent, TiLearningInsight } from "@windels/shared";
export type { TiDashboard, TiAgent, TiIndicatorPlugin, TiInstrument, TiMarketClass, TiRiskProfile, TiPosition, TiSentimentReading, TiSimulationResult, TiSimScenario, TiEconomicEvent, TiLearningInsight } from "@windels/shared";


export const tiApi = {
  dashboard: () => api<TiDashboard>("/trading-intel/dashboard/rollup"),
  agents: () => api<TiAgent[]>("/trading-intel/agents"),
  indicators: () => api<TiIndicatorPlugin[]>("/trading-intel/indicators"),
  instruments: (marketClass?: TiMarketClass) =>
    api<TiInstrument[]>("/trading-intel/instruments", marketClass ? { params: { marketClass } } : {}),
  risk: () => api<TiRiskProfile | null>("/trading-intel/risk"),
  positions: () => api<TiPosition[]>("/trading-intel/positions"),
  sentiment: (limit = 40) => api<TiSentimentReading[]>("/trading-intel/sentiment", { params: { limit } }),
  simulate: (input: { instrumentId: string; scenarios?: TiSimScenario[]; horizon?: string }) =>
    api<TiSimulationResult[]>("/trading-intel/simulate", { method: "POST", json: input }),
  economicCalendar: (days = 7) => api<TiEconomicEvent[]>("/trading-intel/economic-calendar", { params: { days } }),
  insights: (limit = 30) => api<TiLearningInsight[]>("/trading-intel/insights", { params: { limit } }),
  propose: (input: { instrumentId: string; marketClass: TiMarketClass; side: "long" | "short"; size: number; reason?: string }) =>
    api<any>("/trading-intel/propose", { method: "POST", json: input }),
};
