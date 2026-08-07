/**
 * WINDELS AI OS — Shared signing helpers for exchange REST auth.
 *
 * Most CEXs use HMAC-SHA256 (a few use SHA512, one uses ED25519 wallet keys).
 * The functions here return HMAC digests encoded as hex/base64 as required,
 * plus a nonce/timestamp generator that honors server-time drift correction.
 */
import { createHmac, createHash } from "node:crypto";

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}
export function hmacSha256Base64(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64");
}
export function hmacSha512Base64(secretB64: string, data: string): string {
  // Kraken uses base64-decoded secret keyed with SHA512(path+sha256(nonce+post), secret).
  const key = Buffer.from(secretB64, "base64");
  return createHmac("sha512", key).update(data).digest("base64");
}
export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}
export function sha512Hex(data: string): string {
  return createHash("sha512").update(data).digest("hex");
}
export function hmacSha512Hex(secret: string, data: string): string {
  return createHmac("sha512", secret).update(data).digest("hex");
}

export interface ClockState {
  /** Last known server time (ms). */
  serverTimeMs?: number;
  /** Local time when server time was measured. */
  localSampleMs?: number;
}

/** Returns the timestamp (ms) to use for signed requests: serverTime + (now - localSample) if drift-corrected. */
export function correctedNow(clock: ClockState): number {
  if (clock.serverTimeMs !== undefined && clock.localSampleMs !== undefined) {
    return clock.serverTimeMs + (Date.now() - clock.localSampleMs);
  }
  return Date.now();
}

/** Encodes an object as `k1=v1&k2=v2` sorted by key (used by Binance-style signing when no body). */
export function sortedQueryString(obj: Record<string, string | number | boolean | undefined | null>): string {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined && obj[k] !== null).sort();
  return keys.map((k) => `${k}=${encodeURIComponent(String(obj[k]))}`).join("&");
}

/** Encodes any object as form-encoded `k=v&...` (KuCoin style; preserves key order). */
export function formEncode(obj: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  }
  return parts.join("&");
}
