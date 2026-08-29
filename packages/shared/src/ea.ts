/**
 * WINDELS AI OS — EA (Expert Advisor) Protocol shared types.
 *
 * The WINDELS MQL5 Expert Advisor runs inside a MetaTrader 5 terminal. It polls
 * this API over HTTPS (bearer-token), pulls down only APPROVED signals that
 * have cleared every server-side governance gate, executes them with its own
 * local risk double-check, manages positions (SL/TP/trailing stop), and posts
 * fill confirmations back. The EA NEVER executes anything that has not been
 * approved by the server's supervisor; the EA is a dumb-but-safe executor.
 *
 * Why a polling EA instead of pushing orders from the server?
 *   - MT5 terminals may be behind NAT/firewalls that block inbound connections.
 *   - Traders demand a local kill switch inside the terminal itself.
 *   - The EA can enforce final hard stops if connectivity to WINDELS drops.
 */

import { z } from "zod";
import type { TradingMode } from "./brokerIntegration.js";

/* ── Type / side numeric codes (used on the wire for canonical signing) ── */

export const EA_SIGNAL_TYPES = ["MARKET", "LIMIT", "STOP", "CLOSE", "MODIFY_SLTP", "CANCEL"] as const;
export type EaSignalType = (typeof EA_SIGNAL_TYPES)[number];
export const EA_SIGNAL_TYPE_CODE: Record<EaSignalType, number> = {
  MARKET: 0, LIMIT: 1, STOP: 2, CLOSE: 3, MODIFY_SLTP: 4, CANCEL: 5,
};

export const EA_SIGNAL_SIDES = ["BUY", "SELL"] as const;
export type EaSignalSide = (typeof EA_SIGNAL_SIDES)[number];
export const EA_SIGNAL_SIDE_CODE: Record<EaSignalSide, number> = { BUY: 0, SELL: 1 };

/* ── EA Registration / pairing ────────────────────────────────── */

export interface EaRegistration {
  brokerAccountId: string;
  eaPublicKey: string;
  mt5Login: string;
  mt5Server: string;
  mt5AccountName?: string;
  terminalVersion: string;
  chartSymbol?: string;
  chartTimeframe?: string;
  terminalName: string;
  eaVersion: string;
}

export const EaRegistrationSchema = z.object({
  brokerAccountId: z.string().min(1).max(64),
  eaPublicKey: z.string().min(8).max(512),
  mt5Login: z.string().min(1).max(80),
  mt5Server: z.string().min(1).max(120),
  mt5AccountName: z.string().max(120).optional(),
  terminalVersion: z.string().max(32).default("0"),
  chartSymbol: z.string().max(40).optional(),
  chartTimeframe: z.string().max(16).optional(),
  terminalName: z.string().min(1).max(120),
  eaVersion: z.string().max(32).default("1.0.0"),
});

export interface EaSession {
  token: string;
  expiresAt: string;
  eaId: string;
  mode: TradingMode;
  hardLimits: {
    maxLotPerTrade: number;
    maxOpenPositions: number;
    maxDailyLossPct: number;
    maxSlippagePts: number;
    allowedSymbols: string[];
    closeOnly: boolean;
    trailingStop?: { enabled: boolean; distancePts: number; stepPts: number; breakEvenPts?: number };
  };
  magic: number;
  pollIntervalMs: number;
  callbackPath: string;
}

/* ── Signal pull (poll) ───────────────────────────────────────── */

export interface EaSignal {
  id: string;
  /** Strictly monotonic sequence number per EA. */
  seq: number;
  brokerAccountId: string;
  type: EaSignalType;
  side?: EaSignalSide;
  symbol: string;
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  slippagePts?: number;
  comment?: string;
  targetTicket?: string;
  trailingStop?: { distancePts: number; stepPts: number; breakEvenPts?: number };
  /** ISO timestamp after which the signal must be discarded. */
  expiresAt: string;
  /** HMAC hex signature over the canonical string. */
  sig: string;
}

export interface EaSignalBundle {
  watermark: number;
  serverTime: string;
  eaId: string;
  hardLimits: EaSession["hardLimits"];
  mode: TradingMode;
  magic: number;
  signals: EaSignal[];
  expectedPositions: Array<{ ticket: string; symbol: string; side: "BUY" | "SELL"; volume: number; openPrice: number; sl?: number; tp?: number }>;
  killSwitch: boolean;
  config?: { commentPrefix: string; maxSpreadPts?: number; newsBlockMinutes?: number; oneChartOnly?: boolean };
}

/* ── Fill / state ack ─────────────────────────────────────────── */

export const EA_FILL_STATUSES = ["FILLED", "PARTIAL", "REJECTED", "SLIPPAGE", "ERROR", "EXPIRED", "RECONCILE"] as const;
export type EaFillStatus = (typeof EA_FILL_STATUSES)[number];

export interface EaFillAck {
  signalId?: string;
  eaId: string;
  brokerAccountId: string;
  status: EaFillStatus;
  ticket?: string;
  dealId?: string;
  fillPrice?: number;
  filledVolume?: number;
  retcode?: number;
  error?: string;
  localTimestamp: string;
  latencyMs?: number;
}

export interface EaHeartbeat {
  eaId: string;
  brokerAccountId: string;
  state: {
    balance: number;
    equity: number;
    freeMargin: number;
    marginLevel?: number;
    positions: Array<{ ticket: string; symbol: string; side: "BUY" | "SELL"; volume: number; openPrice: number; currentPrice: number; sl?: number; tp?: number; profit: number; swap?: number; openTime: string; trailingActive?: boolean }>;
    lastTicks?: Record<string, string>;
  };
  watermark: number;
  diagnostics?: Array<{ level: "info" | "warn" | "error"; message: string; at: string; code?: number }>;
}

/* ── Canonical signable string (used by Node + MQL5) ──────────── */

/**
 * Builds the canonical pipe-delimited string that is HMAC-signed.
 *
 * Field order (MANDATORY — any reordering breaks HMAC verification):
 *   id|seq|brokerAccountId|typeCode|sideCode|symbol|volume:8|price:8|sl:8|tp:8|
 *   slippagePts|comment|targetTicket|trailDist|trailStep|breakEven|expiresAt(YYYY.MM.DD HH:MM:SS)
 *
 * The EA MUST construct the same byte-for-byte string when verifying.
 */
export function buildEaSignableString(sig: Omit<EaSignal, "sig">, brokerAccountId: string): string {
  const typeCode = EA_SIGNAL_TYPE_CODE[sig.type];
  const sideCode = sig.side ? EA_SIGNAL_SIDE_CODE[sig.side] : -1;
  const f8 = (n: number | undefined) => (n && n > 0 ? n.toFixed(8) : "0.00000000");
  const i = (n: number | undefined) => String(n ?? 0);
  const ts = sig.expiresAt.replace("T", " ").replace("Z", "").slice(0, 19).replace(/-/g, ".");
  return [
    sig.id,
    String(sig.seq),
    brokerAccountId,
    String(typeCode),
    String(sideCode),
    sig.symbol,
    f8(sig.volume),
    f8(sig.price),
    f8(sig.sl),
    f8(sig.tp),
    i(sig.slippagePts),
    sig.comment ?? "",
    sig.targetTicket ?? "",
    String(sig.trailingStop?.distancePts ?? 0),
    String(sig.trailingStop?.stepPts ?? 0),
    String(sig.trailingStop?.breakEvenPts ?? 0),
    ts,
  ].join("|");
}

/* ── Zod schemas ──────────────────────────────────────────────── */

export const EaSignalSchema = z.object({
  id: z.string().min(1).max(64),
  seq: z.number().int().nonnegative(),
  brokerAccountId: z.string().min(1).max(64),
  type: z.enum(EA_SIGNAL_TYPES),
  side: z.enum(EA_SIGNAL_SIDES).optional(),
  symbol: z.string().min(1).max(40),
  volume: z.number().positive(),
  price: z.number().positive().optional(),
  sl: z.number().positive().optional(),
  tp: z.number().positive().optional(),
  slippagePts: z.number().int().min(0).max(1000).optional(),
  comment: z.string().max(60).optional(),
  targetTicket: z.string().max(32).optional(),
  trailingStop: z.object({
    distancePts: z.number().positive(),
    stepPts: z.number().positive(),
    breakEvenPts: z.number().positive().optional(),
  }).optional(),
  expiresAt: z.string(),
  sig: z.string().min(8),
});

export const EaFillAckSchema = z.object({
  signalId: z.string().max(64).optional(),
  eaId: z.string().min(1).max(64),
  brokerAccountId: z.string().min(1).max(64),
  status: z.enum(EA_FILL_STATUSES),
  ticket: z.string().max(32).optional(),
  dealId: z.string().max(32).optional(),
  fillPrice: z.number().positive().optional(),
  filledVolume: z.number().positive().optional(),
  retcode: z.number().int().optional(),
  error: z.string().max(200).optional(),
  localTimestamp: z.string(),
  latencyMs: z.number().nonnegative().optional(),
});

export const EaHeartbeatSchema = z.object({
  eaId: z.string().min(1).max(64),
  brokerAccountId: z.string().min(1).max(64),
  state: z.object({
    balance: z.number(),
    equity: z.number(),
    freeMargin: z.number(),
    marginLevel: z.number().optional(),
    positions: z.array(z.object({
      ticket: z.string(),
      symbol: z.string(),
      side: z.enum(["BUY", "SELL"]),
      volume: z.number(),
      openPrice: z.number(),
      currentPrice: z.number(),
      sl: z.number().optional(),
      tp: z.number().optional(),
      profit: z.number(),
      swap: z.number().optional(),
      openTime: z.string(),
      trailingActive: z.boolean().optional(),
    })),
    lastTicks: z.record(z.string()).optional(),
  }),
  watermark: z.number().int().nonnegative(),
  diagnostics: z.array(z.object({
    level: z.enum(["info", "warn", "error"]),
    message: z.string(),
    at: z.string(),
    code: z.number().int().optional(),
  })).optional(),
});
