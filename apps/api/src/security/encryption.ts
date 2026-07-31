/**
 * Security — Data encryption (Slice 112).
 *
 * AES-256-GCM envelope encryption for sensitive fields (API keys, OAuth secrets,
 * Integration credentials, etc.). Uses a 32-byte master key from the env var
 * WINDELS_ENCRYPTION_KEY (hex) with a per-value random 12-byte nonce. Envelope
 * format: `v1.<keyId>.<base64(nonce||ciphertext||tag)>`.
 *
 * KMS-style key rotation is supported by including a key id in the envelope;
 * multiple keys can be active — decryption tries the matching one, new writes
 * always use the primary key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

interface KeyDef { id: string; key: Buffer; createdAt: Date }
const keys: KeyDef[] = [];
let primaryKeyId: string | null = null;

function loadKeys() {
  if (keys.length) return;
  // Primary from env.
  const hex = env.WINDELS_ENCRYPTION_KEY || fallbackDevKey();
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    logger.warn("WINDELS_ENCRYPTION_KEY must be 64 hex chars (32 bytes AES-256); using dev fallback", {});
  }
  keys.push({ id: "k1", key: buf.length === 32 ? buf : Buffer.alloc(32, "dev-fallback-key"), createdAt: new Date() });
  primaryKeyId = "k1";
}

function fallbackDevKey(): string {
  // Deterministic dev fallback so it works in local without the env set.
  // NOT FOR PRODUCTION — generated once per env via env var / KMS.
  return "77696e64656c732d6465762d6b65792d33326279746573212121212121212121"; // "windels-dev-key-32bytes!!!!!!!!"
}

export interface EncryptedBlob {
  v: "enc.v1";
  kid: string;
  data: string; // base64 nonce||ct||tag
}

export function encryptString(plaintext: string): EncryptedBlob {
  loadKeys();
  const k = keys.find((x) => x.id === primaryKeyId)!;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k.key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: "enc.v1", kid: k.id, data: Buffer.concat([nonce, ct, tag]).toString("base64") };
}

export function decryptString(blob: EncryptedBlob | null | undefined): string | null {
  if (!blob) return null;
  loadKeys();
  const k = keys.find((x) => x.id === blob.kid) ?? keys[0];
  const buf = Buffer.from(blob.data, "base64");
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const dec = createDecipheriv("aes-256-gcm", k.key, nonce);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
}

/** Convenience: encrypt JSON-serializable values. */
export function encryptJson(value: unknown): EncryptedBlob {
  return encryptString(JSON.stringify(value));
}
export function decryptJson<T = unknown>(blob: EncryptedBlob | null | undefined): T | null {
  const s = decryptString(blob);
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

/** Is a value an EncryptedBlob envelope? */
export function isEncryptedBlob(v: any): v is EncryptedBlob {
  return v && typeof v === "object" && v.v === "enc.v1" && typeof v.kid === "string" && typeof v.data === "string";
}

/** Masks a secret for display (first 3 chars + *** + last 2). */
export function maskSecret(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}***${s.slice(-2)}`;
}

/** Rotation stub: register a new key; new writes use it, old keys still decrypt. */
export function registerKey(id: string, keyHex: string) {
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) throw new Error("Key must be 32 bytes (64 hex)");
  keys.push({ id, key: buf, createdAt: new Date() });
}
export function setPrimaryKey(id: string) {
  if (!keys.find((k) => k.id === id)) throw new Error(`Unknown key ${id}`);
  primaryKeyId = id;
}
export function listKeyInfo() {
  loadKeys();
  return keys.map((k) => ({ id: k.id, createdAt: k.createdAt.toISOString(), primary: k.id === primaryKeyId }));
}

/**
 * Convenience string encrypt/decrypt returning a single portable string
 * format `v1.<kid>.<base64>` (URLs stored in Redis set/get as strings).
 */
export function encrypt(plaintext: string): string {
  const b = encryptString(plaintext);
  return `enc.v1.${b.kid}.${b.data}`;
}
export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const m = blob.match(/^enc\.v1\.([^.]+)\.(.+)$/);
  if (!m) return null;
  return decryptString({ v: "enc.v1", kid: m[1], data: m[2] });
}
