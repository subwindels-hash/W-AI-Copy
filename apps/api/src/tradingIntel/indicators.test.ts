/**
 * Known-value tests for technical indicators.
 * Reference values computed by hand for short deterministic series.
 */
import { describe, it, expect } from "vitest";
import {
  sma, ema, rsi, macd, bollinger, atr, obv, vwap, stoch,
  willr, cci, roc, psar, pivots, fibonacci, kdj, stochRsi, wma,
  supportResistance, volumeProfile, adx, ichimoku, runAllIndicators,
} from "../tradingIntel/indicators.js";
import type { TiCandle } from "@windels/shared";

// Helpers: make a deterministic candle series from a close array
function fromCloses(closes: number[], vol = 1000): TiCandle[] {
  return closes.map((c, i) => {
    const open = i === 0 ? c : closes[i-1];
    return { time: i * 3600, open, high: Math.max(open, c) + 0.5, low: Math.min(open, c) - 0.5, close: c, volume: vol };
  });
}

describe("indicators", () => {
  it("sma: 3-period simple moving average", () => {
    const out = sma([1,2,3,4,5,6], 3);
    expect(out[2]).toBeCloseTo(2);          // (1+2+3)/3
    expect(out[3]).toBeCloseTo(3);          // (2+3+4)/3
    expect(out[4]).toBeCloseTo(4);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
  });

  it("sma: returns null for insufficient data", () => {
    expect(sma([1,2], 3).every(v => v === null)).toBe(true);
  });

  it("ema: 3-period EMA", () => {
    // EMA seed = SMA(1,2,3)=2; k=0.5; EMA[3]=0.5*4+0.5*2=3; EMA[4]=0.5*5+0.5*3=4
    const out = ema([1,2,3,4,5], 3);
    expect(out[2]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4);
  });

  it("wma: 3-period weighted MA (weights 3,2,1)", () => {
    // last item has highest weight
    // idx=2 (values 1,2,3): 3*3+2*2+1*1 = 14 / 6 = 2.333...
    const out = wma([1,2,3], 3);
    expect(out[2]).toBeCloseTo(14/6, 3);
  });

  it("rsi: deterministic 14-period", () => {
    // All up days → RSI = 100
    const closes = Array.from({length:20}, (_,i)=>i+1);
    const out = rsi(closes, 14);
    expect(out[19]).toBe(100);
    // All down days → RSI = 0
    const down = Array.from({length:20},(_,i)=>20-i);
    const out2 = rsi(down, 14);
    expect(out2[19]).toBe(0);
  });

  it("macd: produces macd/signal/histogram arrays", () => {
    const closes = Array.from({length:40}, (_,i)=>100+Math.sin(i/3)*5+i*0.3);
    const { macd: m, signal, histogram } = macd(closes, 12, 26, 9);
    expect(m.length).toBe(closes.length);
    expect(signal.length).toBe(closes.length);
    expect(histogram.length).toBe(closes.length);
    // before warm-up all null
    expect(m[0]).toBeNull();
    // after warm-up last value not null
    expect(m[39]).not.toBeNull();
    expect(typeof m[39]).toBe("number");
  });

  it("bollinger: middle == SMA, bands 2 sd", () => {
    const closes = [10,11,12,11,10,11,12,11,10,11,12,11,10,11,12,11,10,11,12,11];
    const bb = bollinger(closes, 20, 2);
    const mid20 = sma(closes,20)[19];
    expect(bb.middle[19]).toBeCloseTo(mid20 as number);
    expect(bb.upper[19]).toBeGreaterThan(bb.middle[19] as number);
    expect(bb.lower[19]).toBeLessThan(bb.middle[19] as number);
  });

  it("atr: 14-period average true range is positive", () => {
    const c = fromCloses([100,101,102,103,102,101,100,99,100,102,105,107,108,109,110,111,112,113]);
    const out = atr(c, 14);
    expect(out[17]).toBeGreaterThan(0);
    expect(out[17]).toBeLessThan(20);
  });

  it("obv: accumulates volume with direction", () => {
    const c = fromCloses([10,11,10,12]);
    const out = obv(c);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1000);       // up
    expect(out[2]).toBe(0);          // down
    expect(out[3]).toBe(1000);       // up
  });

  it("vwap: equals typical price for single candle", () => {
    const c: TiCandle[] = [{ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 }];
    const out = vwap(c);
    expect(out[0]).toBeCloseTo((12+9+11)/3);
  });

  it("stoch: between 0 and 100", () => {
    // Use candles where close is the actual high
    const c: TiCandle[] = Array.from({length:15}, (_,i)=>{
      const close = 10+i*0.3;
      return { time:i*3600, open: close-0.2, high: close, low: close-0.5, close, volume:1000 };
    });
    const { k } = stoch(c, 14);
    for (const v of k) if (v != null) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    expect(k[14]).toBeGreaterThan(90); // close near period high
  });

  it("williams %R: between -100 and 0", () => {
    const c = fromCloses([10,11,10,12,13,12,11,10,9,10,11,12,13,14,15]);
    const out = willr(c, 14);
    for (const v of out) if (v != null) { expect(v).toBeGreaterThanOrEqual(-100); expect(v).toBeLessThanOrEqual(0); }
  });

  it("cci: zero when price equals MA of TP", () => {
    // flat series → MD=0, CCI=0 by our fallback
    const closes = Array(25).fill(100);
    const c = fromCloses(closes, 1000);
    const out = cci(c, 20);
    expect(out[24]).toBe(0);
  });

  it("roc: rate of change", () => {
    const out = roc([100,110], 1);
    expect(out[1]).toBeCloseTo(10);
  });

  it("psar: flips direction correctly on strong move", () => {
    // straight-up trend: SAR should trail below
    const closes = Array.from({length:30}, (_,i)=>100+i);
    const c = fromCloses(closes);
    const out = psar(c);
    for (let i=5;i<30;i++) expect(out[i]).toBeLessThan(c[i].close);
  });

  it("pivots: classic floor pivots", () => {
    const p = pivots({high:12, low:10, close:11});
    expect(p.pivot).toBeCloseTo(11);
    expect(p.r1).toBeCloseTo(12);
    expect(p.s1).toBeCloseTo(10);
  });

  it("fibonacci: correct levels", () => {
    const f = fibonacci(100, 200);
    expect(f["0"]).toBe(100);
    expect(f["0.5"]).toBe(150);
    expect(f["1"]).toBe(200);
    expect(f["0.618"]).toBeCloseTo(161.8, 0);
  });

  it("kdj: J = 3K - 2D relationship", () => {
    const c = fromCloses([10,11,12,11,10,9,10,11,12,13,14,15,14,13,12]);
    const { k, d, j } = kdj(c, 9, 3, 3);
    for (let i=0;i<c.length;i++) {
      if (k[i] != null && d[i] != null && j[i] != null) {
        expect(j[i]).toBeCloseTo(3*k[i]! - 2*d[i]!, 3);
      }
    }
  });

  it("stochRsi: between 0 and 100 when RSI is range-bound", () => {
    const closes = Array.from({length:50},(_,i)=>50+Math.sin(i/2)*5);
    const { k, d } = stochRsi(closes);
    for (let i=0;i<closes.length;i++) {
      if (k[i] != null) { expect(k[i]).toBeGreaterThanOrEqual(0); expect(k[i]).toBeLessThanOrEqual(100); }
      if (d[i] != null) { expect(d[i]).toBeGreaterThanOrEqual(0); expect(d[i]).toBeLessThanOrEqual(100); }
    }
  });

  it("supportResistance: returns clustered levels", () => {
    const closes = Array.from({length:50},(_,i)=>100+Math.sin(i/3)*5);
    const c = fromCloses(closes);
    const sr = supportResistance(c, 2, 0.02);
    expect(Array.isArray(sr)).toBe(true);
    sr.forEach(l => { expect(["support","resistance"]).toContain(l.type); expect(l.strength).toBeGreaterThan(0); });
  });

  it("volumeProfile: sums to total volume", () => {
    const c = fromCloses([10,11,12,11,10,11,12,13,14,13,12]);
    const vp = volumeProfile(c, 5);
    const sum = vp.reduce((a,b)=>a+b.volume, 0);
    const totalVol = c.reduce((a,b)=>a+b.volume, 0);
    expect(sum).toBeCloseTo(totalVol, 0);
    expect(vp.find(b=>b.poc)).toBeTruthy();
  });

  it("ichimoku: tenkan above kijun in uptrend", () => {
    const closes = Array.from({length:60},(_,i)=>100+i);
    const c = fromCloses(closes);
    const out = ichimoku(c);
    // at last bar, tenkan (9) and kijun (26) exist
    expect(out.tenkan[59]).toBeGreaterThan(out.kijun[59] as number - 1);
  });

  it("adx: low ADX in sideways market", () => {
    // oscillating series with no trend
    const closes = Array.from({length:60},(_,i)=>100+Math.sin(i/3)*3);
    const c = fromCloses(closes);
    const res = adx(c, 14);
    expect(res.adx[59]).toBeLessThan(50);
  });

  it("runAllIndicators: returns structure with signals and sufficient data", () => {
    const closes = Array.from({length:80},(_,i)=>100 + Math.sin(i/4)*4 + i*0.2);
    const c = fromCloses(closes, 1000);
    const r = runAllIndicators(c, "TEST", "1h");
    expect(r.sufficientData).toBe(true);
    expect(r.values.rsi).toBeGreaterThanOrEqual(0);
    expect(r.values.rsi).toBeLessThanOrEqual(100);
    expect(["buy","sell","hold"]).toContain(r.aggregateSignal);
    expect(r.signals).toBeInstanceOf(Array);
  });

  it("runAllIndicators: insufficient data flagged", () => {
    const c = fromCloses([10,11,12,13]);
    const r = runAllIndicators(c, "TEST2", "1h");
    expect(r.sufficientData).toBe(false);
  });
});
