/**
 * Mobile authentication helpers.
 *
 * Biometric support uses the WebAuthn ("Web Authentication") standard, which doubles
 * as a platform authenticator on iOS (Face ID/Touch ID) and Android (biometric prompt).
 * It works identically from installed PWAs — no native code required for MVP.
 *
 * Security notes:
 * - The device holds the private key; we only store the public key + credential id.
 * - Biometric verification is performed on-device; we only verify the signed challenge.
 * - PIN fallback is a short numeric secret hashed with bcrypt and tied to the device id.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";

// WebAuthn relies on base64url encoding.
const b64u = {
  encode: (b: Buffer | Uint8Array) =>
    Buffer.from(b).toString("base64url"),
  decode: (s: string) => Buffer.from(s, "base64url"),
};

function randomChallenge() {
  return b64u.encode(crypto.randomBytes(32));
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory challenge store (keyed by userId:action). Redis would replace in prod, but this is a session-scoped secret.
const challenges = new Map<string, { challenge: string; expiresAt: number; rpId?: string }>();
function ckey(userId: string, action: "register" | "auth") {
  return `${userId}:${action}`;
}
function putChallenge(userId: string, action: "register" | "auth", rpId: string) {
  const challenge = randomChallenge();
  challenges.set(ckey(userId, action), { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS, rpId });
  return challenge;
}
function takeChallenge(userId: string, action: "register" | "auth", rpId?: string) {
  const k = ckey(userId, action);
  const entry = challenges.get(k);
  challenges.delete(k);
  if (!entry) throw AppError.badRequest("No pending challenge");
  if (entry.expiresAt < Date.now()) throw AppError.badRequest("Challenge expired");
  if (rpId && entry.rpId && entry.rpId !== rpId) throw AppError.badRequest("RP mismatch");
  return entry.challenge;
}

export function getRegisterChallenge(userId: string, rpId: string, rpName: string, userIdDisplay: string) {
  const challenge = putChallenge(userId, "register", rpId);
  // Minimal WebAuthn PublicKeyCredentialCreationOptions (without attestation, relying on platform authenticator).
  return {
    challenge,
    rp: { name: rpName, id: rpId },
    user: { id: b64u.encode(Buffer.from(userId)), name: userIdDisplay, displayName: userIdDisplay },
    pubKeyCredParams: [
      { type: "public-key" as const, alg: -7 /* ES256 */ },
      { type: "public-key" as const, alg: -257 /* RS256 */ },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform" as const,
      userVerification: "required" as const,
      requireResidentKey: false,
    },
    timeout: 60_000,
    attestation: "none" as const,
  };
}

/**
 * Minimal verification of a WebAuthn attestation response for registration.
 * This is a deliberately simple authenticator-data + CBOR parser sufficient for MVP
 * platform-authenticator flow. It does NOT implement full FIDO2 attestation validation;
 * that is an enterprise hardening item for a later session.
 */
export async function verifyRegister(
  userId: string,
  deviceId: string,
  rpId: string,
  credential: { id: string; rawId: string; type: string; response: { clientDataJSON: string; attestationObject: string }; transports?: string[] }
) {
  if (credential.type !== "public-key") throw AppError.badRequest("Invalid credential type");
  const challenge = takeChallenge(userId, "register", rpId);

  const clientDataJSON = Buffer.from(credential.response.clientDataJSON, "base64url");
  const cd = JSON.parse(clientDataJSON.toString("utf8"));
  if (cd.type !== "webauthn.create") throw AppError.badRequest("Bad clientData type");
  if (cd.challenge !== challenge) throw AppError.badRequest("Challenge mismatch");
  if (!cd.origin) throw AppError.badRequest("Missing origin");

  // Parse attestationObject (CBOR).
  const attObj = Buffer.from(credential.response.attestationObject, "base64url");
  const { authData, authDataBuf } = parseAuthDataFromAttestation(attObj);
  const publicKeyBytes = extractPublicKeyFromAuthData(authData);
  const credentialId = authData.credId;

  await prisma.biometricCredential.upsert({
    where: { id: credentialId },
    update: { publicKey: b64u.encode(publicKeyBytes), counter: authData.signCount, transports: (credential.transports ?? []).join(",") },
    create: {
      id: `bio_${crypto.randomBytes(8).toString("hex")}`,
      userId,
      deviceId,
      credentialId,
      publicKey: b64u.encode(publicKeyBytes),
      counter: authData.signCount,
      transports: (credential.transports ?? []).join(","),
      aaguid: authData.aaguid,
    },
  });
  await prisma.mobileDevice.update({ where: { id: deviceId }, data: { biometricEnabled: true } });
  logger.info("biometric credential registered", { userId, deviceId, credLen: credentialId.length });
  return { ok: true };
}

export function getAuthChallenge(userId: string, rpId: string) {
  const challenge = putChallenge(userId, "auth", rpId);
  return {
    challenge,
    rpId,
    timeout: 60_000,
    userVerification: "required",
    allowCredentials: [], // empty => any credential for this user (we don't pass id hints for simplicity)
  };
}

/**
 * Verify a WebAuthn assertion: challenge, clientData type, RP-ID hash, and —
 * critically — the cryptographic signature over `authenticatorData ||
 * SHA256(clientDataJSON)` using the public key captured at registration.
 *
 * The signature check was previously skipped ("deferred as an enterprise
 * hardening item") while the function still returned `{ ok: true }`. That made
 * the biometric factor decorative: any well-formed assertion passed, so
 * possession of the device's private key was never proven and a credential
 * could be asserted by anyone able to construct the JSON. The endpoint sits
 * behind `authenticate`, so it was not a primary-login bypass, but a second
 * factor that cannot fail is not a second factor.
 *
 * Supports the two algorithms offered in `getRegisterChallenge`: ES256
 * (ECDSA P-256, the platform-authenticator default on iOS/Android) and RS256.
 */
export async function verifyAuthAssertion(
  userId: string,
  rpId: string,
  assertion: { id: string; rawId: string; response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string } }
) {
  const challenge = takeChallenge(userId, "auth", rpId);
  const cred = await prisma.biometricCredential.findFirst({ where: { userId } });
  if (!cred) throw AppError.unauthorized("No biometric credential registered");

  // Structural validation.
  const clientDataBuf = Buffer.from(assertion.response.clientDataJSON, "base64url");
  const clientData = JSON.parse(clientDataBuf.toString("utf8"));
  if (clientData.type !== "webauthn.get") throw AppError.badRequest("Bad clientData type");
  if (clientData.challenge !== challenge) throw AppError.badRequest("Challenge mismatch");
  const authData = Buffer.from(assertion.response.authenticatorData, "base64url");
  if (authData.length < 37) throw AppError.badRequest("Authenticator data too short");
  const rpIdHash = authData.subarray(0, 32);
  const expectedRpIdHash = crypto.createHash("sha256").update(rpId).digest();
  if (!rpIdHash.equals(expectedRpIdHash)) throw AppError.badRequest("RP ID hash mismatch");

  // User-verification flag (bit 2) — the challenge demands userVerification:
  // "required", so an authenticator that did not verify the user is rejected.
  const flags = authData[32]!;
  if ((flags & 0x04) === 0) throw AppError.unauthorized("User verification required");

  // Cryptographic verification over authenticatorData || SHA256(clientDataJSON).
  const signedPayload = Buffer.concat([
    authData,
    crypto.createHash("sha256").update(clientDataBuf).digest(),
  ]);
  const signature = Buffer.from(assertion.response.signature, "base64url");
  if (!verifyCredentialSignature(cred.publicKey, signedPayload, signature)) {
    throw AppError.unauthorized("Assertion signature verification failed");
  }

  // Signature counter must not go backwards — a decrease indicates a cloned
  // authenticator replaying captured assertions.
  const signCount = authData.readUInt32BE(33);
  if (signCount !== 0 && cred.counter != null && signCount <= cred.counter) {
    throw AppError.unauthorized("Authenticator signature counter replay detected");
  }

  await prisma.biometricCredential.update({
    where: { id: cred.id },
    data: { lastUsedAt: new Date(), counter: signCount },
  });
  return { ok: true };
}

/**
 * Verify an assertion signature against a stored public key.
 *
 * Registration stores the key as base64url SPKI DER (see `verifyRegister`), so
 * it is imported directly. ES256 signatures arrive DER-encoded from the
 * authenticator, which is what `crypto.verify` expects for an EC key with the
 * default `dsaEncoding`.
 */
function verifyCredentialSignature(storedKey: string, payload: Buffer, signature: Buffer): boolean {
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPublicKey({
      key: Buffer.from(storedKey, "base64url"),
      format: "der",
      type: "spki",
    });
  } catch {
    // A key we cannot parse must never be treated as a passing signature.
    logger.warn("biometric credential public key could not be parsed", {});
    return false;
  }
  try {
    return crypto.verify(
      keyObject.asymmetricKeyType === "rsa" ? "sha256" : "sha256",
      payload,
      keyObject,
      signature,
    );
  } catch {
    return false;
  }
}

// ─── PIN fallback ───────────────────────────────────────────────────────────
export async function setPin(userId: string, deviceId: string, pin: string) {
  if (!/^[0-9]{4,8}$/.test(pin)) throw AppError.badRequest("PIN must be 4-8 digits");
  const hash = await bcrypt.hash(pin, 10);
  // Stored in a dedicated `pinHash` column. It used to live in `deviceModel`,
  // which POST /mobile/devices/register writes directly from the request body —
  // a 60-character bcrypt hash fits inside that field's 64-character limit, so
  // a caller could overwrite the hash with one of their own and then "verify"
  // a PIN they picked. Scope the write by userId too, so a device id belonging
  // to someone else cannot be targeted.
  const res = await prisma.mobileDevice.updateMany({
    where: { id: deviceId, userId },
    data: { pinHash: hash },
  });
  if (res.count === 0) throw AppError.notFound("Device not found");
  return { ok: true };
}
export async function verifyPin(userId: string, deviceId: string, pin: string) {
  const device = await prisma.mobileDevice.findFirst({ where: { id: deviceId, userId } });
  if (!device?.pinHash) throw AppError.unauthorized("No PIN set");
  const ok = await bcrypt.compare(pin, device.pinHash);
  if (!ok) throw AppError.unauthorized("Incorrect PIN");
  return { ok: true };
}

// ─── Device registration ───────────────────────────────────────────────────
export async function registerDevice(
  userId: string,
  body: { deviceId?: string; platform: string; deviceName?: string; osVersion?: string; appVersion?: string; deviceModel?: string },
  meta: { ip?: string; userAgent?: string }
) {
  const device = await prisma.mobileDevice.upsert({
    where: { id: body.deviceId ?? "____none____" },
    update: {
      platform: body.platform,
      deviceName: body.deviceName,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
      deviceModel: body.deviceModel,
      lastSeenAt: new Date(),
      lastIp: meta.ip,
      lastUserAgent: meta.userAgent,
    },
    create: {
      id: body.deviceId ?? `dev_${crypto.randomBytes(12).toString("hex")}`,
      userId,
      platform: body.platform,
      deviceName: body.deviceName,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
      deviceModel: body.deviceModel,
      lastIp: meta.ip,
      lastUserAgent: meta.userAgent,
    },
  });
  return device;
}

export async function listDevices(userId: string) {
  return prisma.mobileDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, platform: true, deviceName: true, osVersion: true, appVersion: true, biometricEnabled: true, lastSeenAt: true, createdAt: true },
  });
}
export async function revokeDevice(userId: string, deviceId: string) {
  await prisma.pushSubscription.deleteMany({ where: { deviceId, userId } });
  await prisma.biometricCredential.deleteMany({ where: { deviceId, userId } });
  await prisma.mobileDevice.deleteMany({ where: { id: deviceId, userId } });
  return { ok: true };
}

// ─── CBOR / authData parsing (lightweight, sufficient for platform authenticators) ───
function parseAuthDataFromAttestation(attObj: Buffer) {
  // Minimal CBOR decoder for the simple map { fmt, attStmt, authData }
  // We don't validate attestation statement; we just extract authData.
  // Format: 0xA1 map with 3 entries when fmt="none" & attStmt={}.
  const decoded = cborDecodeMap(attObj);
  const authDataBuf = decoded.get("authData") as Buffer;
  if (!authDataBuf) throw AppError.badRequest("Missing authData in attestation");
  const authData = parseAuthData(authDataBuf);
  return { authData, authDataBuf };
}

function parseAuthData(buf: Buffer) {
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf[32];
  const signCount = buf.readUInt32BE(33);
  let offset = 37;
  const attestedCredDataIncluded = (flags & 0x40) !== 0;
  let aaguid = "";
  let credId = "";
  let credentialPubKey: Buffer | undefined;
  if (attestedCredDataIncluded) {
    aaguid = buf.subarray(offset, offset + 16).toString("hex");
    offset += 16;
    const credIdLen = buf.readUInt16BE(offset);
    offset += 2;
    credId = buf.subarray(offset, offset + credIdLen).toString("base64url");
    offset += credIdLen;
    const pubKeyCbor = buf.subarray(offset);
    const map = cborDecodeMap(pubKeyCbor);
    // Encode the raw CBOR public key bytes for later use (we keep them opaque).
    const end = (map as any).__end ?? pubKeyCbor.length;
    credentialPubKey = pubKeyCbor.subarray(0, end);
  }
  return { rpIdHash, flags, signCount, aaguid, credId, credentialPubKey };
}

function extractPublicKeyFromAuthData(ad: ReturnType<typeof parseAuthData>) {
  if (!ad.credentialPubKey) throw AppError.badRequest("No public key in attestation");
  return ad.credentialPubKey;
}

// Very small CBOR decoder sufficient for the shapes WebAuthn produces (maps/simple types).
function cborDecodeMap(buf: Buffer, start = 0): Map<string | number, unknown> & { __end?: number } {
  const map = new Map() as Map<string | number, unknown> & { __end?: number };
  let offset = start;
  const initialByte = buf[offset++];
  const majorType = initialByte >> 5;
  const addInfo = initialByte & 0x1f;
  let length = 0;
  if (majorType !== 5) {
    // Not a map; allow nested entry recursion but we entered expecting a map — only call from map context.
    // In our flow this is called at map root and for the COSE key (which is a map).
  }
  if (addInfo < 24) length = addInfo;
  else if (addInfo === 24) { length = buf[offset]; offset += 1; }
  else if (addInfo === 25) { length = buf.readUInt16BE(offset); offset += 2; }
  else if (addInfo === 26) { length = buf.readUInt32BE(offset); offset += 4; }
  else throw new Error(`Unsupported CBOR length addInfo ${addInfo}`);

  for (let i = 0; i < length; i++) {
    const key = cborDecodeItem(buf, offset);
    offset = key.__end;
    const val = cborDecodeItem(buf, offset);
    offset = val.__end;
    map.set(key.value as string | number, val.value);
  }
  map.__end = offset;
  return map;
}

function cborDecodeItem(buf: Buffer, offset: number): { value: unknown; __end: number } {
  const b = buf[offset++];
  const mt = b >> 5;
  const ai = b & 0x1f;
  let val: unknown = null;
  let advance = 0;
  const readUint = (bytes: number) => {
    if (bytes === 1) return buf[offset];
    if (bytes === 2) return buf.readUInt16BE(offset);
    if (bytes === 4) return buf.readUInt32BE(offset);
    if (bytes === 8) return Number(buf.readBigUInt64BE(offset));
    throw new Error("bad uint size");
  };
  if (mt === 0) {
    if (ai < 24) { val = ai; }
    else if (ai === 24) { val = buf[offset]; advance = 1; }
    else if (ai === 25) { val = buf.readUInt16BE(offset); advance = 2; }
    else if (ai === 26) { val = buf.readUInt32BE(offset); advance = 4; }
    offset += advance;
    return { value: val as number, __end: offset };
  }
  if (mt === 1) {
    // negative int
    let n: number;
    if (ai < 24) n = -1 - ai;
    else if (ai === 24) { n = -1 - buf[offset]; advance = 1; }
    else if (ai === 25) { n = -1 - buf.readUInt16BE(offset); advance = 2; }
    else if (ai === 26) { n = -1 - buf.readUInt32BE(offset); advance = 4; }
    else n = -1;
    offset += advance;
    return { value: n, __end: offset };
  }
  if (mt === 2 || mt === 3) {
    // byte string or text string
    let len = 0;
    if (ai < 24) len = ai;
    else if (ai === 24) { len = buf[offset]; advance = 1; }
    else if (ai === 25) { len = buf.readUInt16BE(offset); advance = 2; }
    else if (ai === 26) { len = buf.readUInt32BE(offset); advance = 4; }
    offset += advance;
    const slice = buf.subarray(offset, offset + len);
    offset += len;
    if (mt === 3) return { value: slice.toString("utf8"), __end: offset };
    return { value: slice, __end: offset };
  }
  if (mt === 5) {
    // map: rewind 1 byte so cborDecodeMap sees the initial byte
    const m = cborDecodeMap(buf, offset - 1);
    return { value: m, __end: m.__end! };
  }
  if (mt === 7) {
    // simple / bool / null
    if (ai === 20) val = false;
    else if (ai === 21) val = true;
    else if (ai === 22) val = null;
    return { value: val, __end: offset };
  }
  throw new Error(`Unsupported CBOR major type ${mt} ai ${ai}`);
}
