/**
 * Session 203 — camera thumb-scan PPG math.
 *
 * Locks the deterministic behaviour of thumbScan.ts against synthetic PPG
 * waveforms: a clean 72 bpm sine must yield ~833 ms RR intervals, degenerate
 * inputs must yield null (never invented numbers), and the peak detector must
 * respect the minimum beat spacing.
 */
import { describe, it, expect } from "vitest";
import {
  mean, stdev, detrendZ, detectPeaks, rrIntervalsFrom, hrvFromRr, bpmFromRr,
  sampleCovered, coverageRatio, signalQuality, analyzeScan,
  type PpgSample,
} from "./thumbScan";

/** Synthetic PPG: sine pulse wave sampled at ~30 fps. */
function synthPpg(bpm: number, seconds: number, fps = 30, noise = 0): PpgSample[] {
  const out: PpgSample[] = [];
  const period = 60000 / bpm;
  for (let i = 0; i * (1000 / fps) < seconds * 1000; i++) {
    const t = (i * 1000) / fps;
    const phase = (2 * Math.PI * t) / period;
    const pulse = Math.sin(phase);
    const r = 150 + 8 * pulse + (noise ? (Math.random() - 0.5) * noise : 0);
    out.push({ t, r, g: r * 0.6 });
  }
  return out;
}

describe("thumbScan — mean/stdev", () => {
  it("mean returns null on empty input rather than 0", () => {
    expect(mean([])).toBeNull();
  });
  it("stdev of a constant series is 0, of empty is null", () => {
    expect(stdev([])).toBeNull();
    expect(stdev([5, 5, 5])).toBe(0);
  });
});

describe("thumbScan — detrend + peak detection on a synthetic 72 bpm wave", () => {
  const samples = synthPpg(72, 20);
  const ts = samples.map((s) => s.t);
  const z = detrendZ(samples.map((s) => s.r), 60);

  it("finds approximately one peak per heartbeat", () => {
    const peaks = detectPeaks(ts, z);
    // 20 s at 72 bpm = 24 beats; allow detector slack but require the bulk.
    expect(peaks.length).toBeGreaterThanOrEqual(20);
    expect(peaks.length).toBeLessThanOrEqual(27);
  });

  it("recovers RR intervals near 833 ms (72 bpm)", () => {
    const rr = rrIntervalsFrom(ts, detectPeaks(ts, z));
    expect(rr.length).toBeGreaterThanOrEqual(19);
    const avg = mean(rr)!;
    expect(Math.abs(avg - 833)).toBeLessThan(35);
  });

  it("enforces minimum spacing between beats", () => {
    const peaks = detectPeaks(ts, z, { minDistanceMs: 273 });
    for (let k = 1; k < peaks.length; k++) {
      expect((ts[peaks[k]!] ?? 0) - (ts[peaks[k - 1]!] ?? 0)).toBeGreaterThanOrEqual(273);
    }
  });

  it("flat signal yields no peaks (no invented beats)", () => {
    const flat = Array.from({ length: 300 }, (_, i) => ({ t: i * 33.3, r: 150, g: 90 }));
    const zf = detrendZ(flat.map((s) => s.r), 60);
    expect(detectPeaks(flat.map((s) => s.t), zf)).toHaveLength(0);
  });
});

describe("thumbScan — HRV figures mirror the backend math", () => {
  it("flat RR series has zero variability", () => {
    const h = hrvFromRr([800, 800, 800, 800])!;
    expect(h.sdnnMs).toBe(0);
    expect(h.rmssdMs).toBe(0);
    expect(h.pnn50Pct).toBe(0);
    expect(h.meanRrMs).toBe(800);
  });
  it("alternating RR series gives RMSSD 100 and pNN50 100%", () => {
    const h = hrvFromRr([800, 900, 800, 900, 800])!;
    expect(h.rmssdMs).toBe(100);
    expect(h.pnn50Pct).toBe(100);
  });
  it("returns null on empty and on a single interval", () => {
    expect(hrvFromRr([])).toBeNull();
    expect(hrvFromRr([800])!.rmssdMs).toBeNull();
  });
});

describe("thumbScan — bpm derivation", () => {
  it("uses the median RR so one outlier cannot drag the reading", () => {
    // 60 bpm (1000 ms) with one 2000 ms outlier
    expect(bpmFromRr([1000, 1000, 1000, 2000, 1000])).toBe(60);
  });
  it("returns null on empty", () => {
    expect(bpmFromRr([])).toBeNull();
  });
});

describe("thumbScan — coverage & quality heuristics", () => {
  it("a bright red-dominant frame reads as covered; a dark/gray frame does not", () => {
    expect(sampleCovered({ t: 0, r: 160, g: 90 })).toBe(true);
    expect(sampleCovered({ t: 0, r: 90, g: 90 })).toBe(false);  // not red-dominant
    expect(sampleCovered({ t: 0, r: 20, g: 10 })).toBe(false);  // too dark
  });
  it("coverageRatio is 0–1 and handles short lists", () => {
    const samples: PpgSample[] = [
      { t: 0, r: 160, g: 90 }, { t: 30, r: 20, g: 10 }, { t: 60, r: 160, g: 90 },
    ];
    expect(coverageRatio(samples, 3)).toBeCloseTo(2 / 3);
    expect(coverageRatio([], 3)).toBe(0);
  });
  it("signalQuality distinguishes flatline from pulsing input", () => {
    const flat = synthPpg(72, 4).map((s) => ({ ...s, r: 150, g: 90 }));
    expect(signalQuality(flat)).toBe("no_signal");
    expect(signalQuality(synthPpg(72, 4))).toBe("good");
  });
});

describe("thumbScan — analyzeScan end-to-end on synthetic input", () => {
  it("analyzes a clean 60 bpm recording", () => {
    const samples = synthPpg(60, 25);
    const a = analyzeScan(samples, 25000)!;
    expect(a).not.toBeNull();
    expect(a.bpm).toBe(60);
    expect(a.rr.length).toBeGreaterThanOrEqual(20);
    expect(a.hrv!.sampleCount).toBe(a.rr.length);
  });
  it("returns null for a too-short recording", () => {
    expect(analyzeScan(synthPpg(60, 2), 2000)).toBeNull();
  });
  it("returns null when the signal has no detectable beats (retry, never invent)", () => {
    const flat = Array.from({ length: 400 }, (_, i) => ({ t: i * 33.3, r: 150, g: 90 }));
    expect(analyzeScan(flat, 13000)).toBeNull();
  });
  it("tolerates moderate sensor noise", () => {
    const samples = synthPpg(75, 20, 30, 2.5);
    const a = analyzeScan(samples, 20000)!;
    expect(Math.abs(a.bpm - 75)).toBeLessThanOrEqual(4);
  });
});
