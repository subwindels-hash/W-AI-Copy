/**
 * Update package signature verification.
 *
 * Update packages are signed with Ed25519. The signer's private key signs the
 * package's artifact digest (`sha256`); verifiers check that signature against
 * the public key. This replaces the previous "verification is not implemented"
 * stub.
 *
 *   - UPDATE_SIGNING_PRIVATE_KEY: base64 PKCS8 Ed25519 private key (signer only)
 *   - UPDATE_SIGNING_PUBLIC_KEY:  base64 SPKI Ed25519 public key (verifier)
 *
 * A signature is verified only when a key is configured; otherwise the check is
 * reported as unverifiable/skipped (not as a pass or a fail), matching the
 * module's honesty rules.
 */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export interface SignatureVerdict {
  /** True when a public key was configured and the signature verified. */
  verified: boolean;
  /** True when a signature was present but a key was not — cannot verify. */
  unverifiable: boolean;
  /** True when the package simply carries no signature. */
  unsigned: boolean;
  detail: string;
}

/** Load the PKCS8 DER private key object from its base64 env form. */
function privateKeyObject(privB64: string) {
  return createPrivateKey({ key: Buffer.from(privB64, "base64"), type: "pkcs8", format: "der" });
}

function publicKeyFromPrivate(privateKeyB64: string): Buffer {
  // createPublicKey(privateKey) derives the matching public key; a private key
  // cannot be exported as SPKI directly.
  return createPublicKey(privateKeyObject(privateKeyB64)).export({ type: "spki", format: "der" }) as Buffer;
}

function publicKeyObject(pubB64: string): ReturnType<typeof createPublicKey> {
  return createPublicKey({ key: Buffer.from(pubB64, "base64"), type: "spki", format: "der" });
}

/**
 * Sign a package's artifact digest. Returns the base64 Ed25519 signature, or
 * null when no private key is configured.
 */
export function signUpdateDigest(sha256: string): string | null {
  const privB64 = process.env.UPDATE_SIGNING_PRIVATE_KEY;
  if (!privB64) return null;
  const sig = sign(null, Buffer.from(sha256, "hex"), privateKeyObject(privB64));
  return sig.toString("base64");
}

/**
 * Verify an update package's signature against its artifact digest.
 */
export function verifyUpdateSignature(
  sha256: string,
  signature: string | undefined | null,
): SignatureVerdict {
  if (!signature) {
    return { verified: false, unverifiable: false, unsigned: true, detail: "Package is not signed" };
  }
  const pubB64 = process.env.UPDATE_SIGNING_PUBLIC_KEY;
  // A private key can stand in for the public key when only the signer side is
  // configured on this host.
  const effectivePubB64 = pubB64 ?? (process.env.UPDATE_SIGNING_PRIVATE_KEY ? undefined : null);
  if (!effectivePubB64 && !process.env.UPDATE_SIGNING_PRIVATE_KEY) {
    return { verified: false, unverifiable: true, unsigned: false, detail: "No signing key configured — signature cannot be verified" };
  }
  try {
    const pubObj = effectivePubB64
      ? publicKeyObject(effectivePubB64)
      : publicKeyObject(publicKeyFromPrivate(process.env.UPDATE_SIGNING_PRIVATE_KEY!).toString("base64"));
    const ok = verify(null, Buffer.from(sha256, "hex"), pubObj, Buffer.from(signature, "base64"));
    return ok
      ? { verified: true, unverifiable: false, unsigned: false, detail: "Ed25519 signature verified" }
      : { verified: false, unverifiable: false, unsigned: false, detail: "Signature verification failed" };
  } catch (e: any) {
    return { verified: false, unverifiable: false, unsigned: false, detail: `Signature verification error: ${e?.message ?? "unknown"}` };
  }
}
