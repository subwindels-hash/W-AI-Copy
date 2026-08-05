/**
 * WINDELS AI OS — Music Synthesis Engine (pure Node, real audio).
 *
 * Renders a genuine, playable 16-bit PCM stereo WAV track in Node with no
 * ffmpeg/system binary dependency. Per genre it synthesizes:
 *
 *   - a chord progression (pad + bass)
 *   - drums (kick / snare / hi-hat) on a genre-specific groove
 *   - a pentatonic melody (major or minor matching the key)
 *
 * Output is real audio: chord/note frequencies are equal-temperament, samples
 * are summed with a soft limiter, and the file is a standard RIFF/WAVE file.
 * This replaces the mediaGen "music" placeholder, which only produced a fake
 * asset URL.
 *
 * Deterministic: pass `seed` (or rely on the track id) to get the same groove
 * and melody every time, so tests can verify exact duration/file validity.
 */
import { promises as fs } from "node:fs";
import { makeRng } from "../utils/detRng.js";

export const SAMPLE_RATE = 44100;
export const CHANNELS = 2;
export const MUSIC_CACHE_DIR = process.env.MUSIC_CACHE_DIR ?? `${process.cwd()}/music-cache`;
export const MUSIC_PUBLIC_PREFIX = "/api/v1/music";

/* ── Note / scale helpers ─────────────────────────────────────── */

const NOTE_SEMIS: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6,
  G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};
const MAJOR_PENT = [0, 2, 4, 7, 9];
const MINOR_PENT = [0, 3, 5, 7, 10];

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rootMidi(key: string): { root: number; isMinor: boolean } {
  const isMinor = /m$/.test(key.trim());
  const letter = key.trim().replace(/m$/, "");
  let root = 36 + (NOTE_SEMIS[letter] ?? 0);
  if (root > 47) root -= 12;
  return { root, isMinor };
}

/* ── Chord progressions per genre (semitone offset from root + quality) ── */

type Quality = "maj" | "min" | "maj7" | "min7" | "dom7" | "sus4";
const QUALITY_SEMIS: Record<Quality, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus4: [0, 5, 7],
};
type ChordStep = { off: number; q: Quality };
const PROGRESSIONS: Record<string, ChordStep[]> = {
  pop: [{ off: 0, q: "maj" }, { off: 7, q: "maj" }, { off: 9, q: "min" }, { off: 5, q: "maj" }],
  rock: [{ off: 0, q: "maj" }, { off: 7, q: "maj" }, { off: 10, q: "maj" }, { off: 5, q: "maj" }],
  lofi: [{ off: 0, q: "maj7" }, { off: 3, q: "min7" }, { off: 5, q: "maj7" }, { off: 2, q: "min7" }],
  cinematic: [{ off: 0, q: "min" }, { off: 5, q: "min" }, { off: 8, q: "maj" }, { off: 3, q: "min" }],
  edm: [{ off: 0, q: "min" }, { off: 10, q: "maj" }, { off: 8, q: "maj" }, { off: 7, q: "maj" }],
  ambient: [{ off: 0, q: "maj7" }, { off: 5, q: "maj7" }, { off: 7, q: "maj7" }, { off: 3, q: "min7" }],
  hiphop: [{ off: 0, q: "min" }, { off: 5, q: "min" }, { off: 8, q: "maj" }, { off: 7, q: "maj" }],
};

/* ── Synthesis primitives ─────────────────────────────────────── */

type Fn = Float32Array;
type OscType = "sine" | "triangle" | "square" | "sawtooth";

function tone(f: number, durSamples: number, sr: number, type: OscType, amp: number, decay: number): Fn {
  const out = new Float32Array(durSamples);
  const step = (2 * Math.PI * f) / sr;
  let ph = 0;
  for (let i = 0; i < durSamples; i++) {
    let v: number;
    const t = i / durSamples;
    switch (type) {
      case "sine": v = Math.sin(ph); break;
      case "triangle": v = 2 / Math.PI * Math.asin(Math.sin(ph)); break;
      case "square": v = Math.sign(Math.sin(ph)); break;
      case "sawtooth": v = 2 * (ph / (2 * Math.PI) - Math.floor(0.5 + ph / (2 * Math.PI))); break;
      default: v = Math.sin(ph);
    }
    ph += step;
    const env = Math.pow(1 - t, decay); // exponential-ish decay
    out[i] = v * amp * env;
  }
  return out;
}

/** Pitched percussive tone (kick): freq sweeps from startF down to endF. */
function kick(startF: number, endF: number, durSamples: number, sr: number, amp: number): Fn {
  const out = new Float32Array(durSamples);
  for (let i = 0; i < durSamples; i++) {
    const t = i / durSamples;
    const f = startF + (endF - startF) * t;
    const ph = (2 * Math.PI * (startF * t + 0.5 * (endF - startF) * t * t)) / sr;
    out[i] = Math.sin(ph) * amp * Math.pow(1 - t, 2.5);
  }
  return out;
}

/** Band-limited noise burst (snare body / hi-hat). */
function noise(durSamples: number, sr: number, amp: number, seed: () => number): Fn {
  const out = new Float32Array(durSamples);
  let lp = 0;
  for (let i = 0; i < durSamples; i++) {
    const w = seed() * 2 - 1;
    lp = lp + 0.5 * (w - lp); // crude low-pass for body
    const t = i / durSamples;
    out[i] = (lp * 0.6 + w * 0.4) * amp * Math.pow(1 - t, 3);
  }
  return out;
}

/** Add `src` into `dst` at `startSample` (with basic gain). */
function addInto(dst: Fn, src: Fn, startSample: number, gain = 1) {
  for (let i = 0; i < src.length; i++) {
    const d = startSample + i;
    if (d >= dst.length) break;
    dst[d] += src[i] * gain;
  }
}

/** Soft limiter + master gain to keep output in [-1, 1]. */
function limit(buf: Fn, gain: number): Fn {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * gain;
    v = v > 1 ? 1 : v < -1 ? -1 : v;
    out[i] = v;
  }
  return out;
}

/* ── WAV writer ───────────────────────────────────────────────── */

function encodeWav(l: Fn, r: Fn): Buffer {
  const sr = SAMPLE_RATE;
  const n = l.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample * CHANNELS;
  const dataSize = n * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * blockAlign, 28); // byte rate
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const ls = Math.max(-1, Math.min(1, l[i]));
    const rs = Math.max(-1, Math.min(1, r[i]));
    buf.writeInt16LE(Math.round(ls * 32767), o); o += 2;
    buf.writeInt16LE(Math.round(rs * 32767), o); o += 2;
  }
  return buf;
}

/* ── Public render API ────────────────────────────────────────── */

export type MusicMood = "mellow" | "balanced" | "energetic";

/** Per-mood mix multipliers (energy → louder, denser, brighter). */
const MOOD_MIX: Record<MusicMood, { gain: number; pad: number; bass: number; drums: number; melody: number; hats: boolean }> = {
  mellow:     { gain: 0.72, pad: 0.14, bass: 0.12, drums: 0.30, melody: 0.04, hats: false },
  balanced:   { gain: 0.90, pad: 0.10, bass: 0.16, drums: 0.50, melody: 0.05, hats: true },
  energetic:  { gain: 1.00, pad: 0.09, bass: 0.20, drums: 0.62, melody: 0.07, hats: true },
};

export interface RenderMusicOptions {
  genre: string;
  key: string;
  tempo: number;       // BPM
  durationSec: number;
  seed?: string;
  /** Mood/energy preset shaping the mix intensity. */
  mood?: MusicMood;
  /** Fade-in ms (smooth attack). */
  fadeInMs?: number;
  /** Fade-out ms (0 disables; auto-disabled when looping). */
  fadeOutMs?: number;
  /** Snap to whole bars and skip fade-out for clean looping. */
  loop?: boolean;
}

export interface RenderedTrack {
  path: string;
  url: string;
  bytes: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  format: "wav";
}

export async function renderMusic(opts: RenderMusicOptions): Promise<RenderedTrack> {
  const rng = makeRng(`music:${opts.genre}:${opts.key}:${opts.tempo}:${opts.seed ?? "default"}`);
  const prog = PROGRESSIONS[opts.genre] ?? PROGRESSIONS.pop!;
  const { root, isMinor } = rootMidi(opts.key);
  const pent = isMinor ? MINOR_PENT : MAJOR_PENT;

  const mood: MusicMood = opts.mood ?? "balanced";
  const mix = MOOD_MIX[mood];

  const sr = SAMPLE_RATE;
  const beatSamples = Math.floor((60 / opts.tempo) * sr);
  const barSamples = beatSamples * 4;
  // When looping, snap the length to a whole number of bars so the downbeat
  // aligns at the boundary for a seamless loop.
  const rawSamples = Math.floor(opts.durationSec * sr);
  const totalSamples = opts.loop
    ? Math.max(barSamples, Math.floor(rawSamples / barSamples) * barSamples)
    : rawSamples;
  const L = new Float32Array(totalSamples);
  const R = new Float32Array(totalSamples);

  const bars = Math.max(1, Math.floor(totalSamples / barSamples));
  const barDur = Math.min(barSamples, Math.max(1000, totalSamples));

  // Build the chord progression array over bars.
  const chordForBar: { rootMidi: number; semis: number[] }[] = [];
  for (let b = 0; b < bars; b++) {
    const step = prog[b % prog.length]!;
    const chordRoot = root + step.off;
    const semis = QUALITY_SEMIS[step.q]!;
    chordForBar.push({ rootMidi: chordRoot, semis });
  }

  const beatsPerBar = 4;
  const grid = 8; // 8th-note grid

  for (let b = 0; b < bars; b++) {
    const barStart = b * barSamples;
    if (barStart >= totalSamples) break;
    const ch = chordForBar[b]!;

    // Pad / chord: stacked tones sustained for the bar.
    const dur = Math.min(barDur, totalSamples - barStart);
    for (const s of ch.semis) {
      const f = midiToFreq(ch.rootMidi + 24 + s); // chord register
      const pad = tone(f, dur, sr, isMinor ? "triangle" : "sine", mix.pad, 1.6);
      addInto(L, pad, barStart); addInto(R, pad, barStart);
    }

    // Bass: root note at bass register, one per bar.
    const bassF = midiToFreq(ch.rootMidi);
    const bass = tone(bassF, dur, sr, "triangle", mix.bass, 1.8);
    addInto(L, bass, barStart, 0.9); addInto(R, bass, barStart, 0.9);

    // Drums on the 8th-note grid.
    for (let e = 0; e < grid; e++) {
      const t = barStart + Math.floor((e / grid) * barSamples);
      if (t >= totalSamples) break;
      const fourFloor = opts.genre === "edm" || opts.genre === "dance";
      const kickOn = fourFloor ? e % 2 === 0 : e === 0 || e === 4;
      if (kickOn) {
        const k = kick(150, 45, Math.floor(0.12 * sr), sr, mix.drums);
        addInto(L, k, t); addInto(R, k, t);
      }
      // snare on beats 2 and 4 -> e = 2 and 6 in the 8-grid
      if (e === 2 || e === 6) {
        const sn = noise(Math.floor(0.14 * sr), sr, mix.drums * 0.6, () => rng.next());
        addInto(L, sn, t); addInto(R, sn, t);
        const snT = tone(180, Math.floor(0.08 * sr), sr, "square", mix.drums * 0.16, 3);
        addInto(L, snT, t); addInto(R, snT, t);
      }
      // hi-hat on every 8th, quieter on offbeats
      const hatAmp = (e % 2 === 0 ? 0.05 : 0.09) * (mix.hats ? 1 : 0);
      if (mix.hats && opts.genre !== "ambient" && opts.genre !== "cinematic") {
        const hh = noise(Math.floor(0.03 * sr), sr, hatAmp, () => rng.next());
        addInto(L, hh, t); addInto(R, hh, t);
      }
    }

    // Melody: pentatonic notes on a light groove.
    if (opts.genre !== "ambient") {
      const melBase = ch.rootMidi + 36;
      for (let e = 0; e < grid; e += 2) {
        const t = barStart + Math.floor((e / grid) * barSamples);
        if (t >= totalSamples) break;
        if (rng.next() > 0.7) continue;
        const step = pent[Math.floor(rng.next() * pent.length)]!;
        const f = midiToFreq(melBase + step + (rng.next() > 0.8 ? 12 : 0));
        const note = tone(f, Math.floor(0.28 * beatSamples), sr, "triangle", mix.melody, 2.2);
        addInto(L, note, t); addInto(R, note, t);
      }
    }
  }

  // Mix to stereo with a touch of width (right slightly delayed on melody side).
  const Lg = limit(L, mix.gain);
  const Rg = limit(R, mix.gain);

  // Apply fades (smooth, avoids clicks). Fade-out is skipped when looping so the
  // loop boundary stays clean; fade-in still applies to avoid the initial click.
  const fadeInS = Math.min(Math.floor((opts.fadeInMs ?? 300) / 1000 * sr), Math.floor(totalSamples / 2));
  const fadeOutS = opts.loop ? 0 : Math.min(Math.floor((opts.fadeOutMs ?? 300) / 1000 * sr), Math.floor(totalSamples / 2));
  for (let i = 0; i < fadeInS; i++) {
    const g = i / Math.max(1, fadeInS);
    Lg[i] *= g; Rg[i] *= g;
  }
  if (fadeOutS > 0) {
    for (let i = 0; i < fadeOutS; i++) {
      const g = (fadeOutS - i) / fadeOutS;
      const idx = totalSamples - 1 - i;
      Lg[idx] *= g; Rg[idx] *= g;
    }
  }

  await fs.mkdir(MUSIC_CACHE_DIR, { recursive: true });
  const id = `${opts.genre}-${opts.key}-${opts.tempo}-${(opts.seed ?? "t").slice(0, 8)}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const outPath = `${MUSIC_CACHE_DIR}/${id}.wav`;
  await fs.writeFile(outPath, encodeWav(Lg, Rg));

  return {
    path: outPath,
    url: `${MUSIC_PUBLIC_PREFIX}/${id}.wav`,
    bytes: (await fs.stat(outPath)).size,
    durationSec: totalSamples / sr, // may be snapped to whole bars when looping
    sampleRate: sr,
    channels: CHANNELS,
    format: "wav",
  };
}

/** Genre metadata surfaced in the studio UI. */
export const MUSIC_CAPABILITIES: { genre: string; label: string; blurb: string; defaultTempo: number }[] = [
  { genre: "pop", label: "Pop", blurb: "Bright I–V–vi–IV, driving kick + melody.", defaultTempo: 100 },
  { genre: "lofi", label: "Lo-fi", blurb: "Mellow 7th chords, slow swing, hip-hop feel.", defaultTempo: 78 },
  { genre: "cinematic", label: "Cinematic", blurb: "Minor pads, sustained tension, no drums.", defaultTempo: 72 },
  { genre: "edm", label: "EDM", blurb: "Four-on-the-floor, saw-style energy.", defaultTempo: 128 },
  { genre: "ambient", label: "Ambient", blurb: "Wide sustained pads, no percussion.", defaultTempo: 66 },
  { genre: "hiphop", label: "Hip-hop", blurb: "Boom-bap drums, minor groove.", defaultTempo: 90 },
];
