/**
 * Deterministic pseudo-random helpers used by demo modules whose backing
 * data is not yet persisted.
 *
 * Same input → same output. Every dashboard() implementation that uses
 * `rand()`/`randInt()` on demo values should call `_rng.reseed(key)` at
 * the top so successive reads with the same key produce identical values.
 *
 * Override the base seed with WINDELS_DET_SEED for CI reproducibility.
 */

const BASE_SEED = process.env.WINDELS_DET_SEED ?? "windels-ai-os-v0.1";

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface DetRng {
  rand(min: number, max: number): number;
  randInt(min: number, max: number): number;
  randChoice<T>(arr: readonly T[]): T;
  randBool(p?: number): boolean;
  next(): number;
  /** Reset the stream from a new context key. Call at the top of read methods. */
  reseed(contextKey: string): void;
}

export function makeRng(contextKey = ""): DetRng {
  let state = hashString(`${BASE_SEED}::${contextKey}`) || 1;
  const step = (): number => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17; state >>>= 0;
    state ^= state << 5;  state >>>= 0;
    return (state % 100_000) / 100_000;
  };
  const api: DetRng = {
    rand(min, max) { return step() * (max - min) + min; },
    randInt(min, max) { return Math.floor(step() * (max - min + 1)) + min; },
    randChoice<T>(arr: readonly T[]) { return arr[Math.floor(step() * arr.length)]; },
    randBool(p = 0.5) { return step() < p; },
    next() { return step(); },
    reseed(key) { state = hashString(`${BASE_SEED}::${contextKey}::${key}`) || 1; },
  };
  return api;
}

const _default = makeRng("default");
export const rand = (min: number, max: number) => _default.rand(min, max);
export const randInt = (min: number, max: number) => _default.randInt(min, max);
export const randChoice = <T>(arr: readonly T[]) => _default.randChoice(arr);
export const randBool = (p = 0.5) => _default.randBool(p);
