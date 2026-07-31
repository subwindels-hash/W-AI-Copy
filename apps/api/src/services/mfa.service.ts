/**
 * Multi-Factor Authentication (TOTP RFC 6238).
 *
 * Self-contained implementation using node:crypto HMAC-SHA1. We deliberately
 * avoid pulling in a heavy OTP library so that the API build stays simple and
 * the secret format stays under our control (encrypted at rest via the
 * platform encryption module).
 */
import { randomUUID, createHmac, randomBytes as cryptoRandomBytes, createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { encrypt, decrypt } from "../security/encryption.js";

const K = {
  secret: (uid: string) => `mfa:secret:${uid}`,
  recovery: (uid: string) => `mfa:recovery:${uid}`,
  enforced: (uid: string) => `mfa:enforced:${uid}`,
};

const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // allow one period before/after for clock drift

export interface MfaStatus {
  enabled: boolean;
  enforced: boolean;
  recoveryCodesRemaining: number;
}

export interface MfaEnrollResult {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let val = 0;
  let out = "";
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const cleaned = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let val = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const v = B32_ALPHABET.indexOf(ch);
    if (v < 0) continue;
    val = (val << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((val >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

function genSecret(): string {
  return base32Encode(cryptoRandomBytes(20));
}

function totpToken(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** TOTP_DIGITS;
  return String(otp).padStart(TOTP_DIGITS, "0");
}

function totpVerify(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const now = Math.floor(Date.now() / 1000);
  const current = Math.floor(now / TOTP_PERIOD);
  for (let w = -TOTP_WINDOW; w <= TOTP_WINDOW; w++) {
    if (totpToken(secret, current + w) === token) return true;
  }
  return false;
}

function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () =>
    randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(),
  );
}

function hashRecovery(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

function otpUrl(secret: string, email: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    email,
  )}?secret=${secret}&issuer=${encodeURIComponent(
    issuer,
  )}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

export const MfaService = {
  async status(userId: string): Promise<MfaStatus> {
    const has = await redis.exists(K.secret(userId));
    const enforced = (await redis.get(K.enforced(userId))) === "1";
    const rec = await redis.smembers(K.recovery(userId));
    return { enabled: !!has, enforced, recoveryCodesRemaining: rec.length };
  },

  async enable(
    userId: string,
    email: string,
    appName = "WINDELS AI OS",
  ): Promise<MfaEnrollResult> {
    const secret = genSecret();
    const url = otpUrl(secret, email, appName);
    const recoveryCodes = generateRecoveryCodes(10);
    await redis.set(K.secret(userId), encrypt(secret));
    const pipe = redis.multi();
    pipe.del(K.recovery(userId));
    for (const code of recoveryCodes)
      pipe.sadd(K.recovery(userId), hashRecovery(code));
    await pipe.exec();
    await redis.set(K.enforced(userId), "1");
    return { secret, otpauthUrl: url, recoveryCodes };
  },

  async confirm(userId: string, token: string): Promise<boolean> {
    const enc = await redis.get(K.secret(userId));
    if (!enc) return false;
    const secret = decrypt(enc);
    if (!secret) return false;
    return totpVerify(secret, token);
  },

  async verify(
    userId: string,
    token: string,
  ): Promise<{ ok: boolean; method?: "totp" | "recovery"; reason?: string }> {
    const enc = await redis.get(K.secret(userId));
    if (!enc) return { ok: false, reason: "mfa_not_enabled" };
    let secret: string;
    try {
      const d = decrypt(enc);
      if (!d) return { ok: false, reason: "mfa_secret_decrypt_failed" };
      secret = d;
    } catch {
      return { ok: false, reason: "mfa_secret_decrypt_failed" };
    }
    if (/^\d{6}$/.test(token)) {
      if (totpVerify(secret, token)) return { ok: true, method: "totp" };
      return { ok: false, reason: "invalid_totp" };
    }
    const hash = hashRecovery(token);
    const isMember = await redis.sismember(K.recovery(userId), hash);
    if (isMember) {
      await redis.srem(K.recovery(userId), hash);
      return { ok: true, method: "recovery" };
    }
    return { ok: false, reason: "invalid_token" };
  },

  async disable(userId: string) {
    await redis.del(K.secret(userId));
    await redis.del(K.recovery(userId));
    await redis.del(K.enforced(userId));
  },

  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes(10);
    const pipe = redis.multi();
    pipe.del(K.recovery(userId));
    for (const code of codes)
      pipe.sadd(K.recovery(userId), hashRecovery(code));
    await pipe.exec();
    return codes;
  },
};
