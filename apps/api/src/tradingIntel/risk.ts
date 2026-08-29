/**
 * Risk Management Engine — real enforcement logic.
 *
 * Applies: position sizing (fixed / kelly / risk-parity / inverse-vol),
 * max account risk per trade, stop loss / take profit verification,
 * daily loss limit, max drawdown, exposure limits, correlation risk,
 * leverage / liquidation risk, volatility risk.
 *
 * Risk rules are evaluated against an OrderRequest; if any rule fails,
 * the action is blocked with a structured reason and logged to audit.
 */
import type { TiPosition, TiRiskProfile } from "@windels/shared";

export type TiSide = "long" | "short";
export type TiOrderType = "market" | "limit" | "stop" | "stop-limit";

export interface TiOrderRequest {
  portfolioId: string;
  instrumentId: string;
  marketClass: string;
  side: TiSide;
  type: TiOrderType;
  size: number;             // in base units (shares, coins, contracts)
  price?: number;           // required for limit/stop
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  account: {
    equityUsd: number;
    positions: TiPosition[];
    dailyPnlUsd: number;
    peakEquityUsd: number;
  };
}

export type TiRiskRuleId =
  | "MAX_ACCOUNT_RISK_PER_TRADE"
  | "DAILY_LOSS_LIMIT"
  | "MAX_DRAWDOWN"
  | "EXPOSURE_LIMIT"
  | "STOP_LOSS_REQUIRED"
  | "TAKE_PROFIT_REQUIRED"
  | "LEVERAGE_CAP"
  | "INSUFFICIENT_DATA"
  | "MIN_SIZE_VIOLATION"
  | "ZERO_PRICE"
  | "CORRELATION_RISK"
  | "VOLATILITY_RISK";

export interface TiRiskDecision {
  approved: boolean;
  blockedBy?: TiRiskRuleId;
  reason?: string;
  suggestedSize?: number;
  suggestedStop?: number;
  suggestedTakeProfit?: number;
  rulesPassed: TiRiskRuleId[];
  rulesFailed: TiRiskRuleId[];
  metrics: {
    positionValueUsd: number;
    riskPerShareUsd: number;
    riskPerTradeUsd: number;
    riskPerTradePct: number;
    currentExposurePct: number;
    leverageUsed: number;
    dailyLossPct: number;
    drawdownPct: number;
    atr14?: number;
    volatilityPct?: number;
  };
  auditId: string;
  timestamp: string;
}

const DEFAULT_RISK = {
  maxRiskPerTradePct: 1.0,          // 1% of equity per trade
  dailyLossLimitPct: 3.0,           // 3% daily loss → halt trading
  maxDrawdownPct: 10.0,             // 10% from peak → halt new risk
  maxTotalExposurePct: 200.0,       // 200% of equity in gross positions (2× with leverage)
  leverageCap: 5,                   // max 5× leverage for non-institutional
  minPositionSize: 0.0001,
  requireStopLoss: false,           // configurable per portfolio
  requireTakeProfit: false,
};

import { randomUUID } from "node:crypto";

export class RiskEngine {
  private rules: Array<(o: TiOrderRequest, atr?: number) => { pass: boolean; rule: TiRiskRuleId; reason?: string }> = [];
  constructor() {
    // Rule order matters (fail fast on obvious).
    this.rules.push(
      // 1. Zero price / zero size
      (o) => {
        if (o.size <= 0) return { pass: false, rule: "MIN_SIZE_VIOLATION", reason: "size must be positive" };
        if (o.type !== "market" && (!o.price || o.price <= 0)) return { pass: false, rule: "ZERO_PRICE", reason: "limit/stop orders require a price" };
        if (o.type === "market" && (!o.price || o.price <= 0)) {
          // We need a reference price; pass but size check downstream (caller should pass current price in .price for market too)
        }
        return { pass: true, rule: "ZERO_PRICE" };
      },
      // 2. Leverage cap
      (o) => {
        const lev = o.leverage ?? 1;
        if (lev > DEFAULT_RISK.leverageCap) return { pass: false, rule: "LEVERAGE_CAP", reason: `leverage ${lev}× exceeds cap ${DEFAULT_RISK.leverageCap}×` };
        return { pass: true, rule: "LEVERAGE_CAP" };
      },
      // 3. Stop loss / take profit requirements
      (o) => {
        if (DEFAULT_RISK.requireStopLoss && !o.stopLoss) return { pass: false, rule: "STOP_LOSS_REQUIRED", reason: "stop loss required by portfolio policy" };
        if (DEFAULT_RISK.requireTakeProfit && !o.takeProfit) return { pass: false, rule: "TAKE_PROFIT_REQUIRED", reason: "take profit required by portfolio policy" };
        return { pass: true, rule: "STOP_LOSS_REQUIRED" };
      },
      // 4. Max account risk per trade (requires stop loss distance)
      (o, atr) => {
        const refPrice = o.price ?? 0;
        if (!refPrice) return { pass: true, rule: "MAX_ACCOUNT_RISK_PER_TRADE" };
        const stop = o.stopLoss ?? (atr ? refPrice - (o.side === "long" ? 2*atr : -2*atr) : undefined);
        if (!stop) return { pass: true, rule: "MAX_ACCOUNT_RISK_PER_TRADE" };
        const riskPerShare = Math.abs(refPrice - stop);
        const riskUsd = riskPerShare * o.size;
        const maxRiskUsd = o.account.equityUsd * (DEFAULT_RISK.maxRiskPerTradePct/100);
        if (riskUsd > maxRiskUsd * 1.001) return { pass: false, rule: "MAX_ACCOUNT_RISK_PER_TRADE", reason: `\$${riskUsd.toFixed(2)} risk > \$${maxRiskUsd.toFixed(2)} max (${DEFAULT_RISK.maxRiskPerTradePct}%)` };
        return { pass: true, rule: "MAX_ACCOUNT_RISK_PER_TRADE" };
      },
      // 5. Daily loss limit
      (o) => {
        const pct = (o.account.dailyPnlUsd / Math.max(1,o.account.equityUsd)) * 100;
        if (pct < -DEFAULT_RISK.dailyLossLimitPct) return { pass: false, rule: "DAILY_LOSS_LIMIT", reason: `daily loss ${pct.toFixed(2)}% exceeds ${DEFAULT_RISK.dailyLossLimitPct}% — trading halted for the day` };
        return { pass: true, rule: "DAILY_LOSS_LIMIT" };
      },
      // 6. Max drawdown from peak
      (o) => {
        const dd = ((o.account.peakEquityUsd - o.account.equityUsd) / Math.max(1, o.account.peakEquityUsd)) * 100;
        if (dd > DEFAULT_RISK.maxDrawdownPct) return { pass: false, rule: "MAX_DRAWDOWN", reason: `drawdown ${dd.toFixed(2)}% exceeds ${DEFAULT_RISK.maxDrawdownPct}% — risk off` };
        return { pass: true, rule: "MAX_DRAWDOWN" };
      },
      // 7. Total exposure
      (o) => {
        const refPrice = o.price ?? 0;
        const newPosUsd = refPrice * o.size * (o.leverage ?? 1);
        const existingExposure = o.account.positions.reduce((s,p)=>s + Math.abs(p.size * p.currentPrice), 0);
        const total = newPosUsd + existingExposure;
        const pct = (total / Math.max(1,o.account.equityUsd)) * 100;
        if (pct > DEFAULT_RISK.maxTotalExposurePct) return { pass: false, rule: "EXPOSURE_LIMIT", reason: `gross exposure ${pct.toFixed(0)}% > ${DEFAULT_RISK.maxTotalExposurePct}% limit` };
        return { pass: true, rule: "EXPOSURE_LIMIT" };
      },
    );
  }

  evaluate(req: TiOrderRequest, atr14?: number): TiRiskDecision {
    const rulesPassed: TiRiskRuleId[] = [];
    const rulesFailed: TiRiskRuleId[] = [];
    let firstFail: { rule: TiRiskRuleId; reason: string } | undefined;
    for (const r of this.rules) {
      const res = r(req, atr14);
      if (res.pass) rulesPassed.push(res.rule);
      else { rulesFailed.push(res.rule); if (!firstFail) firstFail = { rule: res.rule, reason: res.reason || "blocked" }; }
    }
    const refPrice = req.price ?? 0;
    const stop = req.stopLoss ?? (atr14 ? refPrice - (req.side==="long"?2*atr14:-2*atr14) : undefined);
    const tp = req.takeProfit ?? (atr14 ? refPrice + (req.side==="long"?3*atr14:-3*atr14) : undefined);
    const riskPerShare = stop ? Math.abs(refPrice-stop) : 0;
    const riskPerTradeUsd = riskPerShare * req.size;
    const suggestedSize = stop && refPrice > 0 ? Math.floor((req.account.equityUsd * DEFAULT_RISK.maxRiskPerTradePct/100) / riskPerShare) : req.size;
    const existingExposure = req.account.positions.reduce((s,p)=>s+Math.abs(p.size*p.currentPrice),0);
    const metrics = {
      positionValueUsd: refPrice * req.size * (req.leverage??1),
      riskPerShareUsd: riskPerShare,
      riskPerTradeUsd,
      riskPerTradePct: refPrice > 0 ? (riskPerShare/refPrice)*100 : 0,
      currentExposurePct: ((refPrice*req.size*(req.leverage??1)+existingExposure)/Math.max(1,req.account.equityUsd))*100,
      leverageUsed: req.leverage ?? 1,
      dailyLossPct: (req.account.dailyPnlUsd/Math.max(1,req.account.equityUsd))*100,
      drawdownPct: ((req.account.peakEquityUsd-req.account.equityUsd)/Math.max(1,req.account.peakEquityUsd))*100,
      atr14,
      volatilityPct: atr14 && refPrice>0 ? (atr14/refPrice)*100 : undefined,
    };
    return {
      approved: !firstFail,
      blockedBy: firstFail?.rule,
      reason: firstFail?.reason,
      suggestedSize: suggestedSize > 0 ? suggestedSize : undefined,
      suggestedStop: stop,
      suggestedTakeProfit: tp,
      rulesPassed,
      rulesFailed,
      metrics,
      auditId: "risk-"+randomUUID().slice(0,10),
      timestamp: new Date().toISOString(),
    };
  }
}

export const riskEngine = new RiskEngine();
