/**
 * WINDELS AI OS — Music engine tests.
 *
 * Pins that the generator produces REAL, valid audio (not a placeholder):
 *   - output is a well-formed RIFF/WAVE file with the expected sample rate /
 *     channels / bit depth and a byte size that matches the header;
 *   - a requested duration yields that duration of PCM samples;
 *   - output is deterministic for a given (genre/key/tempo/seed);
 *   - the WAV actually contains non-silent audio (real synthesis, not zeros).
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";

const { renderMusic, SAMPLE_RATE } = await import("./musicEngine.js");

function readWavHeader(buf: Buffer) {
  return {
    riff: buf.toString("ascii", 0, 4),
    wave: buf.toString("ascii", 8, 12),
    sampleRate: buf.readUInt32LE(24),
    channels: buf.readUInt16LE(22),
    bits: buf.readUInt16LE(34),
    dataSize: buf.readUInt32LE(40),
  };
}

describe("musicEngine", () => {
  it("renders a valid, non-silent WAV with the requested duration", async () => {
    const r = await renderMusic({ genre: "pop", key: "C", tempo: 100, durationSec: 3, seed: "t1" });
    const buf = await fs.readFile(r.path);
    const h = readWavHeader(buf);
    expect(h.riff).toBe("RIFF");
    expect(h.wave).toBe("WAVE");
    expect(h.sampleRate).toBe(SAMPLE_RATE);
    expect(h.channels).toBe(2);
    expect(h.bits).toBe(16);
    expect(buf.length).toBe(44 + h.dataSize);
    // ~3s of stereo 16-bit: 3 * 44100 * 2 * 2 bytes.
    expect(h.dataSize).toBeCloseTo(3 * SAMPLE_RATE * 2 * 2, -2);
    // Non-silent: at least one sample is non-zero.
    let nonZero = false;
    for (let i = 44; i < buf.length; i += 2) {
      if (buf.readInt16LE(i) !== 0) { nonZero = true; break; }
    }
    expect(nonZero).toBe(true);
  });

  it("is deterministic for the same seed and params", async () => {
    const a = await renderMusic({ genre: "lofi", key: "Am", tempo: 80, durationSec: 2, seed: "same" });
    const b = await renderMusic({ genre: "lofi", key: "Am", tempo: 80, durationSec: 2, seed: "same" });
    const [ba, bb] = await Promise.all([fs.readFile(a.path), fs.readFile(b.path)]);
    expect(ba.equals(bb)).toBe(true);
  });

  it("differs across seeds (groove/melody varies)", async () => {
    const a = await renderMusic({ genre: "edm", key: "A", tempo: 128, durationSec: 2, seed: "x" });
    const b = await renderMusic({ genre: "edm", key: "A", tempo: 128, durationSec: 2, seed: "y" });
    const [ba, bb] = await Promise.all([fs.readFile(a.path), fs.readFile(b.path)]);
    expect(ba.equals(bb)).toBe(false);
  });
});
