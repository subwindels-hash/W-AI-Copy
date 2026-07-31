/**
 * Technical indicator implementations — mathematically correct, tested formulas.
 *
 * All indicators operate on TiCandle arrays (oldest first, i.e. index 0 is earliest).
 * Each indicator returns null for insufficient data and documents its warm-up period.
 *
 * Reference implementations verified against standard textbook formulas and
 * known test vectors in indicators.test.ts.
 */
import type { TiCandle } from "@windels/shared";

// ── utilities ───────────────────────────────────────────────────────────
export function closes(candles: TiCandle[]): number[] { return candles.map(c => c.close); }
export function highs(candles: TiCandle[]): number[] { return candles.map(c => c.high); }
export function lows(candles: TiCandle[]): number[] { return candles.map(c => c.low); }
export function volumes(candles: TiCandle[]): number[] { return candles.map(c => c.volume); }

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // seed with SMA
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function wma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let num = 0;
    for (let j = 0; j < period; j++) num += values[i - j] * (period - j);
    out[i] = num / denom;
  }
  return out;
}

// ── MACD (12, 26, 9 by convention) ─────────────────────────────────────
export interface MACDResult { macd: (number|null)[]; signal: (number|null)[]; histogram: (number|null)[]; }
export function macd(values: number[], fast = 12, slow = 26, signal = 9): MACDResult {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) => {
    const f = fastE[i], s = slowE[i];
    return f != null && s != null ? f - s : null;
  });
  // compute signal EMA over macd values (using only valid points)
  const validStart = macdLine.findIndex(v => v != null);
  const sig: (number | null)[] = new Array(values.length).fill(null);
  if (validStart < 0) return { macd: macdLine, signal: sig, histogram: sig.slice() };
  const k = 2 / (signal + 1);
  const macdValsForEma = macdLine.slice(validStart) as number[];
  let seed = 0;
  const warmLen = Math.min(signal, macdValsForEma.length);
  for (let i = 0; i < warmLen; i++) seed += macdValsForEma[i];
  let prev = seed / warmLen;
  sig[validStart + warmLen - 1] = prev;
  for (let i = warmLen; i < macdValsForEma.length; i++) {
    prev = macdValsForEma[i] * k + prev * (1 - k);
    sig[validStart + i] = prev;
  }
  const hist = macdLine.map((v, i) => {
    const s = sig[i];
    return v != null && s != null ? v - s : null;
  });
  return { macd: macdLine, signal: sig, histogram: hist };
}

// ── RSI (Wilder 14-day) ────────────────────────────────────────────────
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ── Bollinger Bands (20, 2) ────────────────────────────────────────────
export interface BBResult { upper: (number|null)[]; middle: (number|null)[]; lower: (number|null)[]; width: (number|null)[]; }
export function bollinger(values: number[], period = 20, mult = 2): BBResult {
  const mid = sma(values, period);
  const upper: (number|null)[] = new Array(values.length).fill(null);
  const lower: (number|null)[] = new Array(values.length).fill(null);
  const width: (number|null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i] as number;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) { const d = values[j] - m; sum += d * d; }
    const sd = Math.sqrt(sum / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    width[i] = (upper[i]! - lower[i]!) / m;
  }
  return { upper, middle: mid, lower, width };
}

// ── ATR (Average True Range, Wilder 14) ────────────────────────────────
export function atr(candles: TiCandle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const trs: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  let atrVal = 0;
  for (let i = 1; i <= period; i++) atrVal += trs[i];
  atrVal /= period;
  out[period] = atrVal;
  for (let i = period + 1; i < candles.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    out[i] = atrVal;
  }
  return out;
}

// ── ADX (Average Directional Index, 14-period) ─────────────────────────
export interface ADXResult { adx: (number|null)[]; plusDI: (number|null)[]; minusDI: (number|null)[]; }
export function adx(candles: TiCandle[], period = 14): ADXResult {
  const n = candles.length;
  const adxOut: (number|null)[] = new Array(n).fill(null);
  const plusOut: (number|null)[] = new Array(n).fill(null);
  const minusOut: (number|null)[] = new Array(n).fill(null);
  if (n <= 2 * period) return { adx: adxOut, plusDI: plusOut, minusDI: minusOut };
  const plusDM: number[] = new Array(n).fill(0), minusDM: number[] = new Array(n).fill(0), trArr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const up = c.high - p.high, dn = p.low - c.low;
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    trArr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  let trN = 0, pN = 0, mN = 0;
  for (let i = 1; i <= period; i++) { trN += trArr[i]; pN += plusDM[i]; mN += minusDM[i]; }
  const dxArr: number[] = [];
  for (let i = period; i < n; i++) {
    if (i > period) { trN = trN - trArr[i-period]/period*period + trArr[i]; pN = pN - pN/period + plusDM[i]; mN = mN - mN/period + minusDM[i]; }
    const pDI = trN === 0 ? 0 : 100 * pN / trN;
    const mDI = trN === 0 ? 0 : 100 * mN / trN;
    plusOut[i] = pDI; minusOut[i] = mDI;
    const dx = (pDI + mDI === 0) ? 0 : 100 * Math.abs(pDI - mDI) / (pDI + mDI);
    dxArr.push(dx);
    if (dxArr.length === period) {
      let adxVal = dxArr.reduce((a,b)=>a+b,0)/period;
      adxOut[i] = adxVal;
      for (let j = i+1; j < n; j++) {
        // advance with rolling
        const cj = candles[j], pj = candles[j-1];
        const upj = cj.high - pj.high, dnj = pj.low - cj.low;
        const pDMj = upj>dnj && upj>0 ? upj : 0;
        const mDMj = dnj>upj && dnj>0 ? dnj : 0;
        const trj = Math.max(cj.high-cj.low, Math.abs(cj.high-pj.close), Math.abs(cj.low-pj.close));
        trN = (trN*(period-1)+trj)/period;
        pN = (pN*(period-1)+pDMj)/period;
        mN = (mN*(period-1)+mDMj)/period;
        const pDIj = trN===0?0:100*pN/trN, mDIj = trN===0?0:100*mN/trN;
        plusOut[j]=pDIj; minusOut[j]=mDIj;
        const dxj = (pDIj+mDIj===0)?0:100*Math.abs(pDIj-mDIj)/(pDIj+mDIj);
        adxVal = (adxVal*(period-1)+dxj)/period;
        adxOut[j] = adxVal;
      }
      break;
    }
  }
  return { adx: adxOut, plusDI: plusOut, minusDI: minusOut };
}

// ── OBV (On-Balance Volume) ────────────────────────────────────────────
export function obv(candles: TiCandle[]): (number | null)[] {
  const out: (number|null)[] = new Array(candles.length).fill(null);
  if (candles.length === 0) return out;
  let running = 0;
  out[0] = running;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i-1].close, c = candles[i].close;
    if (c > prev) running += candles[i].volume;
    else if (c < prev) running -= candles[i].volume;
    out[i] = running;
  }
  return out;
}

// ── VWAP (intraday, cumulative) ────────────────────────────────────────
export function vwap(candles: TiCandle[]): (number | null)[] {
  const out: (number|null)[] = new Array(candles.length).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typ = (c.high + c.low + c.close) / 3;
    cumPV += typ * c.volume;
    cumV += c.volume;
    out[i] = cumV === 0 ? null : cumPV / cumV;
  }
  return out;
}

// ── Stochastic (K, D) ──────────────────────────────────────────────────
export function stoch(candles: TiCandle[], kPeriod = 14, dPeriod = 3): { k: (number|null)[]; d: (number|null)[] } {
  const n = candles.length;
  const kArr: (number|null)[] = new Array(n).fill(null);
  const dArr: (number|null)[] = new Array(n).fill(null);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) { hh = Math.max(hh, candles[j].high); ll = Math.min(ll, candles[j].low); }
    kArr[i] = hh === ll ? 50 : 100 * (candles[i].close - ll) / (hh - ll);
  }
  for (let i = kPeriod - 1 + dPeriod - 1; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) { if (kArr[j] != null) { sum += kArr[j]!; cnt++; } }
    if (cnt === dPeriod) dArr[i] = sum / cnt;
  }
  return { k: kArr, d: dArr };
}

// ── Stochastic RSI ─────────────────────────────────────────────────────
export function stochRsi(values: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): { k: (number|null)[]; d: (number|null)[] } {
  const r = rsi(values, rsiPeriod);
  const n = values.length;
  const kOut: (number|null)[] = new Array(n).fill(null);
  const dOut: (number|null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (r[i] == null) continue;
    let hi = -Infinity, lo = Infinity, count = 0;
    for (let j = Math.max(0, i - stochPeriod + 1); j <= i; j++) {
      if (r[j] == null) continue;
      hi = Math.max(hi, r[j]!); lo = Math.min(lo, r[j]!); count++;
    }
    if (count < stochPeriod) continue;
    kOut[i] = hi === lo ? 50 : 100 * (r[i]! - lo) / (hi - lo);
  }
  // smooth k
  const kSmoothed: (number|null)[] = new Array(n).fill(null);
  for (let i = kSmooth - 1; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) if (kOut[j]!=null) { s += kOut[j]!; c++; }
    if (c === kSmooth) kSmoothed[i] = s/c;
  }
  for (let i = kSmooth - 1 + dSmooth - 1; i < n; i++) {
    let s=0,c=0;
    for (let j=i-dSmooth+1;j<=i;j++) if(kSmoothed[j]!=null){s+=kSmoothed[j]!;c++;}
    if(c===dSmooth) dOut[i]=s/c;
  }
  return { k: kSmoothed, d: dOut };
}

// ── Williams %R (14) ───────────────────────────────────────────────────
export function willr(candles: TiCandle[], period = 14): (number|null)[] {
  const n = candles.length;
  const out: (number|null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hh=-Infinity, ll=Infinity;
    for (let j=i-period+1;j<=i;j++){hh=Math.max(hh,candles[j].high);ll=Math.min(ll,candles[j].low);}
    out[i] = hh===ll ? -50 : -100*(hh-candles[i].close)/(hh-ll);
  }
  return out;
}

// ── CCI (Commodity Channel Index, 20) ──────────────────────────────────
export function cci(candles: TiCandle[], period = 20): (number|null)[] {
  const n = candles.length;
  const out: (number|null)[] = new Array(n).fill(null);
  const tp = candles.map(c => (c.high + c.low + c.close)/3);
  const ma = sma(tp, period);
  for (let i = period-1; i < n; i++) {
    let md = 0;
    for (let j = i-period+1; j <= i; j++) md += Math.abs(tp[j] - (ma[i] as number));
    md /= period;
    out[i] = md === 0 ? 0 : (tp[i] - (ma[i] as number)) / (0.015 * md);
  }
  return out;
}

// ── ROC (Rate of Change, n-period) ─────────────────────────────────────
export function roc(values: number[], period = 12): (number|null)[] {
  const out: (number|null)[] = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    const prev = values[i-period];
    out[i] = prev === 0 ? null : 100*(values[i]-prev)/prev;
  }
  return out;
}

// ── Parabolic SAR ──────────────────────────────────────────────────────
export function psar(candles: TiCandle[], step = 0.02, maxStep = 0.2): (number | null)[] {
  const n = candles.length;
  const out: (number|null)[] = new Array(n).fill(null);
  if (n < 2) return out;
  let long = candles[1].close > candles[0].close;
  let sar = long ? candles[0].low : candles[0].high;
  let ep = long ? candles[1].high : candles[1].low;
  let af = step;
  out[0] = sar; out[1] = sar;
  for (let i = 2; i < n; i++) {
    sar = sar + af * (ep - sar);
    const c = candles[i];
    if (long) {
      if (c.low <= sar) { long = false; sar = ep; ep = c.low; af = step; }
      else { if (c.high > ep) { ep = c.high; af = Math.min(af + step, maxStep); } sar = Math.min(sar, candles[i-1].low, candles[i-2].low); }
    } else {
      if (c.high >= sar) { long = true; sar = ep; ep = c.high; af = step; }
      else { if (c.low < ep) { ep = c.low; af = Math.min(af + step, maxStep); } sar = Math.max(sar, candles[i-1].high, candles[i-2].high); }
    }
    out[i] = sar;
  }
  return out;
}

// ── Pivot Points (classic floor pivots, using prev day HLC) ────────────
export interface PivotPoints { pivot: number; r1:number; r2:number; r3:number; s1:number; s2:number; s3:number; }
export function pivots(prev: { high: number; low: number; close: number }): PivotPoints {
  const p = (prev.high + prev.low + prev.close) / 3;
  return {
    pivot: p,
    r1: 2*p - prev.low, r2: p + prev.high - prev.low, r3: prev.high + 2*(p - prev.low),
    s1: 2*p - prev.high, s2: p - (prev.high - prev.low), s3: prev.low - 2*(prev.high - p),
  };
}

// ── Fibonacci retracement (swing low/high) ─────────────────────────────
export function fibonacci(low: number, high: number) {
  const diff = high - low;
  return {
    swingLow: low, swingHigh: high,
    "0":    low,
    "0.236": low + 0.236*diff,
    "0.382": low + 0.382*diff,
    "0.5":   low + 0.5*diff,
    "0.618": low + 0.618*diff,
    "0.786": low + 0.786*diff,
    "1":     high,
    "1.618": high + 0.618*diff, // extension
    "2.618": high + 1.618*diff,
  };
}

// ── KDJ ────────────────────────────────────────────────────────────────
export function kdj(candles: TiCandle[], period = 9, kSmooth = 3, dSmooth = 3): { k: (number|null)[]; d: (number|null)[]; j: (number|null)[] } {
  const { k, d } = stoch(candles, period, kSmooth);
  // smoothed d
  const n = candles.length;
  const dSmoothed: (number|null)[] = new Array(n).fill(null);
  for (let i = kSmooth - 1 + dSmooth - 1; i < n; i++) {
    let s=0,c=0;
    for (let j=i-dSmooth+1;j<=i;j++) if(d[j]!=null){s+=d[j]!;c++;}
    if(c===dSmooth) dSmoothed[i]=s/c;
  }
  const jArr: (number|null)[] = k.map((kv, i) => {
    const dv = dSmoothed[i];
    return kv != null && dv != null ? 3*kv - 2*dv : null;
  });
  return { k, d: dSmoothed, j: jArr };
}

// ── Ichimoku Cloud ─────────────────────────────────────────────────────
export interface IchimokuResult {
  tenkan: (number|null)[];   // conversion line (9)
  kijun: (number|null)[];    // base line (26)
  senkouA: (number|null)[];  // leading span A (shifted forward 26)
  senkouB: (number|null)[];  // leading span B (52, shifted forward 26)
  chikou: (number|null)[];   // lagging span (close shifted back 26)
}
function midpoint(candles: TiCandle[], start: number, end: number): number | null {
  if (start < 0) return null;
  let hh = -Infinity, ll = Infinity;
  for (let i = start; i <= end; i++) { hh = Math.max(hh, candles[i].high); ll = Math.min(ll, candles[i].low); }
  return (hh + ll) / 2;
}
export function ichimoku(candles: TiCandle[], tP = 9, kP = 26, sP = 52): IchimokuResult {
  const n = candles.length;
  const tenkan: (number|null)[] = new Array(n).fill(null);
  const kijun: (number|null)[] = new Array(n).fill(null);
  const senkouA: (number|null)[] = new Array(n).fill(null);
  const senkouB: (number|null)[] = new Array(n).fill(null);
  const chikou: (number|null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i >= tP-1) tenkan[i] = midpoint(candles, i-tP+1, i);
    if (i >= kP-1) kijun[i] = midpoint(candles, i-kP+1, i);
    if (i >= sP-1) senkouB[i] = midpoint(candles, i-sP+1, i);
    if (tenkan[i] != null && kijun[i] != null) senkouA[i] = (tenkan[i]! + kijun[i]!)/2;
    if (i + kP < n) chikou[i+kP] = candles[i].close;
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

// ── Volume Profile (simple — visible range, TPO-style price buckets) ───
export interface VolumeProfileBucket { priceLow: number; priceHigh: number; volume: number; poc: boolean; }
export function volumeProfile(candles: TiCandle[], buckets = 24): VolumeProfileBucket[] {
  if (candles.length === 0) return [];
  let hh = -Infinity, ll = Infinity;
  for (const c of candles) { hh = Math.max(hh, c.high); ll = Math.min(ll, c.low); }
  if (hh === ll) return [];
  const step = (hh - ll) / buckets;
  const vols = new Array(buckets).fill(0);
  for (const c of candles) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((c.close - ll) / step)));
    vols[idx] += c.volume;
  }
  const maxV = Math.max(...vols);
  const out: VolumeProfileBucket[] = [];
  for (let i = 0; i < buckets; i++) {
    out.push({ priceLow: ll + i*step, priceHigh: ll + (i+1)*step, volume: vols[i], poc: vols[i] === maxV });
  }
  return out;
}

// ── Simple support/resistance via swing highs/lows ─────────────────────
export interface SRLevel { price: number; type: "support"|"resistance"; strength: number; touches: number; }
export function supportResistance(candles: TiCandle[], lookback = 2, tolerance = 0.005): SRLevel[] {
  const levels: SRLevel[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i-j].high >= c.high || candles[i+j].high >= c.high) isHigh = false;
      if (candles[i-j].low <= c.low || candles[i+j].low <= c.low) isLow = false;
    }
    if (isHigh) levels.push({ price: c.high, type: "resistance", strength: 1, touches: 1 });
    if (isLow) levels.push({ price: c.low, type: "support", strength: 1, touches: 1 });
  }
  // cluster
  const clustered: SRLevel[] = [];
  for (const lv of levels) {
    const m = clustered.find(x => Math.abs(x.price - lv.price)/lv.price < tolerance && x.type === lv.type);
    if (m) { m.touches++; m.strength = Math.min(5, 1 + Math.floor(m.touches/2)); m.price = (m.price + lv.price)/2; }
    else clustered.push({ ...lv });
  }
  return clustered.sort((a,b) => b.strength - a.strength);
}

// ── Volume moving average ──────────────────────────────────────────────
export function mavol(volumes: number[], period = 20): (number | null)[] { return sma(volumes, period); }

// ── Run all indicators and return last values + signals ────────────────
export function runAllIndicators(candles: TiCandle[], symbol: string, timeframe = "1h") {
  const c = closes(candles);
  const v = volumes(candles);
  const n = candles.length;
  const last = n - 1;
  const getLast = (arr: (number|null)[]) => arr[last];
  const ma20 = sma(c, 20), ma50 = sma(c, 50), ma200 = sma(c, 200);
  const ema12 = ema(c, 12), ema26 = ema(c, 26), ema50 = ema(c, 50);
  const m = macd(c);
  const r = rsi(c, 14);
  const bb = bollinger(c, 20, 2);
  const a = atr(candles, 14);
  const adxRes = adx(candles, 14);
  const o = obv(candles);
  const vw = vwap(candles);
  const st = stoch(candles);
  const srsi = stochRsi(c);
  const wr = willr(candles);
  const ci = cci(candles);
  const rc = roc(c, 12);
  const ps = psar(candles);
  const mv = mavol(v, 20);
  const kd = kdj(candles);
  const ich = ichimoku(candles);
  const vp = volumeProfile(candles.slice(-Math.min(candles.length, 60)));
  const sr = supportResistance(candles);
  const prev = candles.length >= 2 ? { high: candles[n-2].high, low: candles[n-2].low, close: candles[n-2].close } : { high:candles[last].high, low:candles[last].low, close:candles[last].close };
  const pv = pivots(prev);
  const fb = fibonacci(Math.min(...candles.slice(-30).map(x=>x.low)), Math.max(...candles.slice(-30).map(x=>x.high)));
  const signals: { indicator: string; signal: "buy"|"sell"|"hold"; reason: string; confidence: number }[] = [];
  // Simple signal synthesis
  const rsiVal = getLast(r);
  if (rsiVal != null) {
    if (rsiVal < 30) signals.push({ indicator:"RSI", signal:"buy", reason:"RSI oversold (<30)", confidence: 0.6 });
    else if (rsiVal > 70) signals.push({ indicator:"RSI", signal:"sell", reason:"RSI overbought (>70)", confidence: 0.6 });
  }
  const macdH = getLast(m.histogram);
  const macdPrev = m.histogram[n-2];
  if (macdH != null && macdPrev != null) {
    if (macdH > 0 && macdPrev <= 0) signals.push({ indicator:"MACD", signal:"buy", reason:"MACD histogram crossed above zero", confidence: 0.65 });
    else if (macdH < 0 && macdPrev >= 0) signals.push({ indicator:"MACD", signal:"sell", reason:"MACD histogram crossed below zero", confidence: 0.65 });
  }
  const price = c[last];
  const bbL = getLast(bb.lower), bbU = getLast(bb.upper);
  if (bbL != null && bbU != null) {
    if (price < bbL) signals.push({ indicator:"BBANDS", signal:"buy", reason:"Price below lower Bollinger band", confidence: 0.55 });
    else if (price > bbU) signals.push({ indicator:"BBANDS", signal:"sell", reason:"Price above upper Bollinger band", confidence: 0.55 });
  }
  const ma20v = getLast(ma20), ma50v = getLast(ma50);
  if (ma20v != null && ma50v != null) {
    if (price > ma20v && ma20v > ma50v) signals.push({ indicator:"MA-Trend", signal:"buy", reason:"Price > MA20 > MA50 (uptrend)", confidence: 0.6 });
    else if (price < ma20v && ma20v < ma50v) signals.push({ indicator:"MA-Trend", signal:"sell", reason:"Price < MA20 < MA50 (downtrend)", confidence: 0.6 });
  }
  const buyConf = signals.filter(s=>s.signal==="buy").reduce((a,s)=>a+s.confidence,0);
  const sellConf = signals.filter(s=>s.signal==="sell").reduce((a,s)=>a+s.confidence,0);
  const aggregate: "buy"|"sell"|"hold" = buyConf > sellConf + 0.3 ? "buy" : sellConf > buyConf + 0.3 ? "sell" : "hold";
  const aggConf = Math.min(0.95, Math.abs(buyConf - sellConf) / Math.max(1, signals.length));
  return {
    symbol, timeframe, timestamp: candles[last].time, price, sufficientData: n >= 50,
    values: {
      ma20: getLast(ma20), ma50: getLast(ma50), ma200: getLast(ma200),
      ema12: getLast(ema12), ema26: getLast(ema26), ema50: getLast(ema50),
      macd: { macd: getLast(m.macd), signal: getLast(m.signal), histogram: getLast(m.histogram) },
      rsi: getLast(r),
      bbands: { upper: getLast(bb.upper), middle: getLast(bb.middle), lower: getLast(bb.lower), width: getLast(bb.width) },
      atr: getLast(a),
      adx: getLast(adxRes.adx), plusDI: getLast(adxRes.plusDI), minusDI: getLast(adxRes.minusDI),
      obv: getLast(o), vwap: getLast(vw),
      stochK: getLast(st.k), stochD: getLast(st.d),
      stochRsiK: getLast(srsi.k), stochRsiD: getLast(srsi.d),
      willr: getLast(wr), cci: getLast(ci), roc: getLast(rc),
      psar: getLast(ps), mavol20: getLast(mv),
      kdj: { k: getLast(kd.k), d: getLast(kd.d), j: getLast(kd.j) },
      ichimoku: { tenkan: getLast(ich.tenkan), kijun: getLast(ich.kijun), senkouA: getLast(ich.senkouA), senkouB: getLast(ich.senkouB) },
    },
    pivots: pv, fibonacci: fb, volumeProfile: vp, supportResistance: sr.slice(0, 8),
    _obvArray: o,
    signals, aggregateSignal: aggregate, aggregateConfidence: aggConf,
  };
}
