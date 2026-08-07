import { describe, it, expect } from "vitest";
import { hmacSha256Hex, hmacSha256Base64, hmacSha512Base64, sha256Hex, sortedQueryString, formEncode, correctedNow } from "./signing.js";

describe("signing helpers", () => {
  it("hmacSha256Hex produces a deterministic 64-char hex string", () => {
    const h = hmacSha256Hex("key", "The quick brown fox");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    // Deterministic: same inputs → same output.
    expect(hmacSha256Hex("key", "The quick brown fox")).toBe(h);
    // Different key → different output.
    expect(hmacSha256Hex("other", "The quick brown fox")).not.toBe(h);
  });

  it("hmacSha256Base64 produces valid base64", () => {
    const h = hmacSha256Base64("secret", "hello");
    expect(Buffer.from(h, "base64").length).toBe(32);
  });

  it("hmacSha512Base64 signs with base64-decoded secret (Kraken-style)", () => {
    // Use known key.
    const b64Secret = Buffer.from("mysecret").toString("base64");
    const h = hmacSha512Base64(b64Secret, "/0/private/Balance" + sha256Hex("12345nonce=1"));
    expect(Buffer.from(h, "base64").length).toBe(64);
  });

  it("sortedQueryString sorts keys alphabetically", () => {
    const q = sortedQueryString({ b: 2, a: 1, c: 3 });
    expect(q).toBe("a=1&b=2&c=3");
  });

  it("formEncode skips undefined/null", () => {
    expect(formEncode({ a: 1, b: null, c: undefined, d: "hi" })).toBe("a=1&d=hi");
  });

  it("correctedNow returns server-time adjusted when drift set", () => {
    const before = Date.now();
    const n1 = correctedNow({});
    expect(n1).toBeGreaterThanOrEqual(before);
    const drift = correctedNow({ serverTimeMs: 1_000_000, localSampleMs: 0 });
    // serverTime is 1e6 at localTime 0 → adds Date.now() offset
    expect(drift).toBeGreaterThan(1_000_000);
  });
});
