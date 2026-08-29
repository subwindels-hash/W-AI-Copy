/**
 * Update signature verification tests.
 *
 * Pins the Ed25519 sign/verify behaviour: a tampered digest fails, a valid
 * signature passes, and an unsigned package reports honestly.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signUpdateDigest, verifyUpdateSignature } from "./updateSigning.service.js";

describe("update signing", () => {
  let privB64: string;
  let pubB64: string;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    // Extract DER seeds/SPKI for our base64 env format.
    privB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  });

  beforeEach(() => {
    delete process.env.UPDATE_SIGNING_PRIVATE_KEY;
    delete process.env.UPDATE_SIGNING_PUBLIC_KEY;
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it("returns unverifiable/skip when no key is configured", () => {
    const verdict = verifyUpdateSignature("a".repeat(64), "c2ln");
    expect(verdict.unverifiable).toBe(true);
    expect(verdict.verified).toBe(false);
  });

  it("reports an unsigned package honestly", () => {
    process.env.UPDATE_SIGNING_PUBLIC_KEY = pubB64;
    const verdict = verifyUpdateSignature("a".repeat(64), undefined);
    expect(verdict.unsigned).toBe(true);
    expect(verdict.verified).toBe(false);
  });

  it("signs and verifies a valid digest", () => {
    process.env.UPDATE_SIGNING_PRIVATE_KEY = privB64;
    process.env.UPDATE_SIGNING_PUBLIC_KEY = pubB64;
    const digest = "cafe".repeat(16);
    const sig = signUpdateDigest(digest);
    expect(sig).toBeTruthy();
    const verdict = verifyUpdateSignature(digest, sig);
    expect(verdict.verified).toBe(true);
  });

  it("rejects a tampered digest", () => {
    process.env.UPDATE_SIGNING_PRIVATE_KEY = privB64;
    process.env.UPDATE_SIGNING_PUBLIC_KEY = pubB64;
    const digest = "cafe".repeat(16);
    const sig = signUpdateDigest(digest)!;
    const tampered = verifyUpdateSignature("beef".repeat(16), sig);
    expect(tampered.verified).toBe(false);
    expect(tampered.detail).toMatch(/failed/i);
  });

  it("derives the public key from the private key when only the signer is configured", () => {
    process.env.UPDATE_SIGNING_PRIVATE_KEY = privB64;
    delete process.env.UPDATE_SIGNING_PUBLIC_KEY;
    const digest = "1234".repeat(16);
    const sig = signUpdateDigest(digest)!;
    const verdict = verifyUpdateSignature(digest, sig);
    expect(verdict.verified).toBe(true);
  });
});
