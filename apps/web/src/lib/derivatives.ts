/**
 * Session 113 — Derivatives & Fixed-Income Desk client.
 *
 * Session 81's four stateless calculators keep their home in `tradingIntel.ts`
 * and are re-exported here so the desk page can reach both halves through one
 * import. Everything below `deskApi` is the stored book: option positions, bond
 * holdings, portfolio exposure, scenario grids and the ladder.
 *
 * Every type comes from `@windels/shared/derivatives`, which the API route also
 * compiles against, so a renamed field is a build error rather than a blank
 * figure on a risk screen.
 */
import { api } from "./api";
import type {
  DerivBondCreateInput,
  DerivBondHolding,
  DerivBondLadder,
  DerivBondUpdateInput,
  DerivDeskSummary,
  DerivHedgeSuggestion,
  DerivParityCheck,
  DerivParityCheckInput,
  DerivPayoffCurve,
  DerivPayoffCurveInput,
  DerivPortfolioGreeks,
  DerivPosition,
  DerivPositionCreateInput,
  DerivPositionQuery,
  DerivPositionUpdateInput,
  DerivScenarioGrid,
  DerivScenarioInput,
} from "@windels/shared/derivatives";

export type {
  DerivBondHolding,
  DerivBondLadder,
  DerivBondValuation,
  DerivCashflowYear,
  DerivDeskSummary,
  DerivHedgeSuggestion,
  DerivMarkFreshness,
  DerivMaturityBucket,
  DerivParityCheck,
  DerivPayoffCurve,
  DerivPayoffPoint,
  DerivPortfolioGreeks,
  DerivPosition,
  DerivPositionCreateInput,
  DerivPositionValuation,
  DerivScenarioGrid,
  DerivShiftedYield,
  DerivUnderlyingExposure,
  DerivUnpriceable,
} from "@windels/shared/derivatives";

export {
  DERIV_AGGREGATION_NOTE,
  DERIV_BOND_LADDER_NOTE,
  DERIV_DEFAULT_CONTRACT_MULTIPLIER,
  DERIV_DEFAULT_RATE,
  DERIV_MARK_STALE_AFTER_HOURS,
  DERIV_VALUATION_DISCLAIMER,
} from "@windels/shared/derivatives";

/** The Session 81 stateless calculators, unchanged. */
export { derivativesApi, isOptionAnalysisUnavailable } from "./tradingIntel";
export type {
  BondAnalytics,
  BondAnalyticsInput,
  ImpliedVolResult,
  OptionAnalysisResult,
  OptionGreeks,
  OptionGreeksInput,
  StrategyLeg,
  StrategyPayoffInput,
  StrategyPayoffResult,
} from "./tradingIntel";

export const deskApi = {
  summary: () => api<DerivDeskSummary>("/derivatives/desk"),

  positions: (query?: Partial<DerivPositionQuery>) =>
    api<DerivPosition[]>("/derivatives/positions", { params: query }),
  getPosition: (id: string) => api<DerivPosition>(`/derivatives/positions/${id}`),
  createPosition: (input: DerivPositionCreateInput) =>
    api<DerivPosition>("/derivatives/positions", { method: "POST", json: input }),
  updatePosition: (id: string, input: DerivPositionUpdateInput) =>
    api<DerivPosition>(`/derivatives/positions/${id}`, { method: "PATCH", json: input }),
  deletePosition: (id: string) =>
    api<{ deleted: boolean; id: string }>(`/derivatives/positions/${id}`, { method: "DELETE" }),

  portfolio: (underlying?: string) =>
    api<DerivPortfolioGreeks>("/derivatives/portfolio", underlying ? { params: { underlying } } : {}),
  scenarios: (input: DerivScenarioInput) =>
    api<DerivScenarioGrid>("/derivatives/portfolio/scenarios", { method: "POST", json: input }),
  hedge: (underlying: string) =>
    api<DerivHedgeSuggestion>("/derivatives/portfolio/hedge", { method: "POST", json: { underlying } }),

  payoffCurve: (input: DerivPayoffCurveInput) =>
    api<DerivPayoffCurve>("/derivatives/payoff-curve", { method: "POST", json: input }),
  parityCheck: (input: DerivParityCheckInput) =>
    api<DerivParityCheck>("/derivatives/parity-check", { method: "POST", json: input }),

  bonds: (limit = 200) => api<DerivBondHolding[]>("/derivatives/bonds", { params: { limit } }),
  getBond: (id: string) => api<DerivBondHolding>(`/derivatives/bonds/${id}`),
  createBond: (input: DerivBondCreateInput) =>
    api<DerivBondHolding>("/derivatives/bonds", { method: "POST", json: input }),
  updateBond: (id: string, input: DerivBondUpdateInput) =>
    api<DerivBondHolding>(`/derivatives/bonds/${id}`, { method: "PATCH", json: input }),
  deleteBond: (id: string) =>
    api<{ deleted: boolean; id: string }>(`/derivatives/bonds/${id}`, { method: "DELETE" }),
  ladder: (shiftsBps = "-100,-50,50,100") =>
    api<DerivBondLadder>("/derivatives/bonds/ladder", { params: { shiftsBps } }),
};
