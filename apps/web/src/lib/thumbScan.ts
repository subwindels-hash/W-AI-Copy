/**
 * Session 203 — Camera thumb-scan PPG signal processing (pure functions).
 *
 * The math behind the Heart Center camera scan: a thumb pressed over the
 * phone camera (with the light on) modulates the red channel with each
 * heartbeat. These helpers turn a stream of { time, red-mean } frame samples
 * into beat peaks, RR intervals and heart rate — deterministically, in the
 * browser, before anything is recorded server-side.
 *
 * Pure and DOM-free on purpose: the same functions run in unit tests against
 * synthetic PPG waveforms (see thumbScan.test.ts). No value is ever invented —
 * if the signal is too weak to detect beats, the caller reports a failed scan.
 */

/** One sampled video frame: ms since scan start + mean channel intensities. */
export interface PpgSample {
  t: number;
  r: number;
  g: number;
}

/** Simple mean; null for an empty list (callers render "—" rather than 0). */
export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population standard deviation. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/**
 * Remove slow drift (breathing, pressure changes, auto-exposure) by subtracting
 * a centred moving average, then z-score the result. Returns the normalized
 * detrended signal.
 */
export function detrendZ(signal: number[], windowSamples: number): number[] {
  if (!signal.length) return [];
  const w = Math.max(3, Math.round(windowSamples));
  const out: number[] = [];
  const m = mean(signal)!;
  const sd = stdev(signal) ?? 1;
  for (let i = 0; i < signal.length; i++) {
    const v = signal[i] ?? 0;
    const lo = Math.max(0, i - Math.floor(w / 2));
    const hi = Math.min(signal.length, i + Math.ceil(w / 2));
    const local = mean(signal.slice(lo, hi)) ?? m;
    out.push(sd < 1e-9 ? 0 : (v - local) / sd);
  }
  return out;
}

export interface PeakOptions {
  /** Minimum spacing between beats, ms. 273 ms ≈ 220 bpm ceiling. */
  minDistanceMs?: number;
  /** z-score height a local maximum must clear to count as a beat. */
  thresholdZ?: number;
}

/**
 * Detect beat peaks in a detrended PPG signal. Greedy: take the highest
 * qualifying local maximum first, suppress neighbours within minDistanceMs,
 * repeat; return peak indices in chronological order.
 */
export function detectPeaks(ts: number[], z: number[], opts: PeakOptions = {}): number[] {
  const minDist = opts.minDistanceMs ?? 273;
  const threshold = opts.thresholdZ ?? 0.25;
  const candidates: Array<{ i: number; z: number }> = [];
  for (let i = 1; i < z.length - 1; i++) {
    const zi = z[i]!;
    if (zi > threshold && zi > (z[i - 1] ?? 0) && zi >= (z[i + 1] ?? 0)) {
      candidates.push({ i, z: zi });
    }
  }
  candidates.sort((a, b) => b.z - a.z); // strongest beats first
  const chosen: number[] = [];
  for (const c of candidates) {
    const ok = chosen.every((j) => Math.abs((ts[c.i] ?? 0) - (ts[j] ?? 0)) >= minDist);
    if (ok) chosen.push(c.i);
  }
  chosen.sort((a, b) => a - b); // chronological
  return chosen;
}

/** Physiologically plausible RR interval band (30–200 bpm). */
export function plausibleRr(rr: number): boolean {
  return rr >= 300 && rr <= 2000;
}

/** RR intervals (ms) between consecutive peaks, dropping implausible ones. */
export function rrIntervalsFrom(ts: number[], peakIdx: number[]): number[] {
  const out: number[] = [];
  for (let k = 1; k < peakIdx.length; k++) {
    const rr = (ts[peakIdx[k]!] ?? 0) - (ts[peakIdx[k - 1]!] ?? 0);
    if (plausibleRr(rr)) out.push(Math.round(rr));
  }
  return out;
}

export interface HrvFigures {
  meanRrMs: number;
  sdnnMs: number | null;
  rmssdMs: number | null;
  pnn50Pct: number | null;
  sampleCount: number;
}

/**
 * Time-domain HRV over an RR series — mirrors the backend's computeHrvSeries
 * so the post-scan preview matches what /heart/measure records. Null stats on
 * degenerate samples (never fabricated zeros that read as measurements).
 */
export function hrvFromRr(rr: number[]): HrvFigures | null {
  if (!rr.length) return null;
  const m = mean(rr)!;
  const sd = stdev(rr);
  const diffs: number[] = [];
  for (let i = 1; i < rr.length; i++) diffs.push((rr[i] ?? 0) - (rr[i - 1] ?? 0));
  const rmssd = diffs.length
    ? Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length)
    : null;
  const pnn50 = diffs.length
    ? (diffs.filter((d) => Math.abs(d) > 50).length / diffs.length) * 100
    : null;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    meanRrMs: r1(m),
    sdnnMs: sd === null ? null : r1(sd),
    rmssdMs: rmssd === null ? null : r1(rmssd),
    pnn50Pct: pnn50 === null ? null : r1(pnn50),
    sampleCount: rr.length,
  };
}

/**
 * Heart rate (bpm) implied by an RR series. Uses the median RR so a single
 * misdetected beat cannot drag the reading.
 */
export function bpmFromRr(rr: number[]): number | null {
  if (!rr.length) return null;
  const sorted = [...rr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return Math.round(60000 / median);
}

/**
 * Finger-coverage heuristic: a thumb over the lens with the light on reads as
 * a bright, red-dominant frame. Used only for the live "position your thumb"
 * hint and the post-scan quality note — never to gate a result by itself.
 */
export function sampleCovered(s: PpgSample): boolean {
  return s.r > 40 && s.r > s.g * 1.05;
}

/** Fraction of recent samples that look covered, 0–1. */
export function coverageRatio(samples: PpgSample[], lastN: number): number {
  const recent = samples.slice(-Math.max(1, lastN));
  if (!recent.length) return 0;
  return recent.filter(sampleCovered).length / recent.length;
}

/** Live signal-strength label for scan guidance (not a measurement). */
export function signalQuality(samples: PpgSample[]): "no_signal" | "weak" | "good" {
  const recent = samples.slice(-90); // ~3 s at 30 fps
  if (recent.length < 10) return "no_signal";
  const detrended = detrendZ(recent.map((s) => s.r), Math.round(recent.length / 2));
  const sd = stdev(detrended);
  if (sd === null || sd < 0.2) return "no_signal";
  return sd < 0.5 ? "weak" : "good";
}

/**
 * Full offline analysis of a completed scan. Returns null when the recording
 * is too short or too few beats were detected — the UI then asks for a retry
 * instead of showing an invented number.
 */
export interface ScanAnalysis {
  peakCount: number;
  rr: number[];
  bpm: number;
  hrv: HrvFigures | null;
  coveredPct: number;
}

export function analyzeScan(samples: PpgSample[], durationMs: number): ScanAnalysis | null {
  if (samples.length < 60 || durationMs < 5000) return null; // need ≥ ~2 s of frames
  const ts = samples.map((s) => s.t);
  const reds = samples.map((s) => s.r);
  // Detrend window ≈ 2 s (assumes ~30 fps sampling; window derived from actual
  // timestamps so slow cameras still work).
  const span = (ts[ts.length - 1] ?? 0) - (ts[0] ?? 0);
  const est = span / Math.max(1, ts.length - 1); // ms per sample
  const window = Math.max(5, Math.round(2000 / Math.max(1, est)));
  const z = detrendZ(reds, window);
  const peaks = detectPeaks(ts, z);
  const rr = rrIntervalsFrom(ts, peaks);
  // A usable scan needs a handful of beat-to-beat intervals.
  if (rr.length < 5) return null;
  const bpm = bpmFromRr(rr);
  if (bpm === null || bpm < 30 || bpm > 220) return null;
  return {
    peakCount: peaks.length,
    rr,
    bpm,
    hrv: hrvFromRr(rr),
    coveredPct: Math.round(coverageRatio(samples, samples.length) * 100),
  };
}
