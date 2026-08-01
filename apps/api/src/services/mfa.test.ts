/**
 * Multi-Factor Authentication (TOTP RFC 6238) — behavioural coverage.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `mfa.service.ts` is a **hand-rolled** TOTP implementation (the header says so
 * explicitly: "we deliberately avoid pulling in a heavy OTP library"). It
 * guards second-factor account access, and the module inventory reported
 * `tests=0` for it — a bespoke crypto primitive on the auth path with no
 * verification of any kind.
 *
 * A self-consistency test would be close to worthless here: asserting that
 * `totpVerify(secret, totpToken(secret, t))` is true only proves the code
 * agrees with itself. A base32 decoder that drops a bit, or an HMAC truncation
 * that grabs the wrong offset, is perfectly self-consistent and still rejects
 * every code a real authenticator app produces.
 *
 * So the token generator is pinned against the **published RFC 6238 test
 * vectors** (Appendix B) instead. Those values were produced by the reference
 * implementation, so matching them proves interoperability with Google
 * Authenticator, 1Password, Authy, etc. — which is the property that actually
 * matters when a user is locked out.
 *
 * The service reads/writes Redis and encrypts the secret at rest, so the suite
 * substitutes the repo's `FakeKv` for `db/redis.js` and exercises the real
 * `security/encryption.ts` (which has a deterministic dev-key fallback).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
}));

const { MfaService } = await import("./mfa.service.js");

const USER = "user_mfa_1";
const EMAIL = "person@windels.ai";

beforeEach(() => {
  // FakeKv exposes its backing maps directly and has no reset(); clear each one
  // so state cannot leak between cases (an earlier enrolment would otherwise
  // make "not yet enrolled" assertions pass or fail depending on test order).
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

/* ------------------------------------------------------------------ *
 * RFC 6238 Appendix B — reference vectors.
 *
 * The RFC's SHA-1 vectors use the ASCII seed "12345678901234567890"
 * (20 bytes). The service stores secrets base32-encoded, so the seed is
 * encoded here the same way an enrolment would.
 * ------------------------------------------------------------------ */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

const RFC_SEED_B32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));

/** The six-digit SHA-1 values published in RFC 6238 Appendix B. */
const RFC_VECTORS: Array<{ time: number; otp: string }> = [
  { time: 59,          otp: "287082" },
  { time: 1111111109,  otp: "081804" },
  { time: 1111111111,  otp: "050471" },
  { time: 1234567890,  otp: "005924" },
  { time: 2000000000,  otp: "279037" },
  { time: 20000000000, otp: "353130" },
];

describe("TOTP generator vs RFC 6238 published vectors", () => {
  /**
   * `totpToken` is module-private, so it is reached the way a real
   * authenticator would: freeze the clock at the vector's timestamp and ask the
   * service to verify the published OTP. A generator that disagrees with the
   * RFC by even one digit fails here.
   */
  it.each(RFC_VECTORS)(
    "accepts the reference OTP $otp at t=$time",
    async ({ time, otp }) => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(time * 1000);
        // Enrol, then overwrite the generated secret with the RFC seed so the
        // stored (encrypted) value corresponds to the published vector.
        await MfaService.enable(USER, EMAIL);
        const { encrypt } = await import("../security/encryption.js");
        await kv.set(`mfa:secret:${USER}`, encrypt(RFC_SEED_B32));

        await expect(MfaService.confirm(USER, otp)).resolves.toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("rejects a valid-format code that is not the current one", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(59_000);
      await MfaService.enable(USER, EMAIL);
      const { encrypt } = await import("../security/encryption.js");
      await kv.set(`mfa:secret:${USER}`, encrypt(RFC_SEED_B32));
      // "000000" is well-formed but wrong for this seed/time.
      await expect(MfaService.confirm(USER, "000000")).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TOTP drift window", () => {
  /**
   * TOTP_WINDOW = 1, i.e. one 30s period either side, to tolerate clock skew.
   * Both the tolerated and the rejected case are pinned: a window that silently
   * widened would extend how long an intercepted code stays replayable.
   */
  async function seedAt(t: number) {
    vi.setSystemTime(t * 1000);
    await MfaService.enable(USER, EMAIL);
    const { encrypt } = await import("../security/encryption.js");
    await kv.set(`mfa:secret:${USER}`, encrypt(RFC_SEED_B32));
  }

  it("accepts a code from the previous and next period", async () => {
    vi.useFakeTimers();
    try {
      await seedAt(1111111109); // otp 081804 belongs to this period
      // +30s: the 081804 code is now one period old and must still pass.
      vi.setSystemTime((1111111109 + 30) * 1000);
      await expect(MfaService.confirm(USER, "081804")).resolves.toBe(true);
      // -30s: the same code is one period in the future and must still pass.
      vi.setSystemTime((1111111109 - 30) * 1000);
      await expect(MfaService.confirm(USER, "081804")).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a code two periods away", async () => {
    vi.useFakeTimers();
    try {
      await seedAt(1111111109);
      vi.setSystemTime((1111111109 + 90) * 1000);
      await expect(MfaService.confirm(USER, "081804")).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("enrolment", () => {
  it("issues a base32 secret, a scannable otpauth URL, and 10 recovery codes", async () => {
    const res = await MfaService.enable(USER, EMAIL);

    expect(res.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.recoveryCodes).toHaveLength(10);
    expect(new Set(res.recoveryCodes).size).toBe(10); // no duplicates

    // The URL must carry the parameters an authenticator app reads.
    expect(res.otpauthUrl).toContain("otpauth://totp/");
    expect(res.otpauthUrl).toContain(`secret=${res.secret}`);
    expect(res.otpauthUrl).toContain("algorithm=SHA1");
    expect(res.otpauthUrl).toContain("digits=6");
    expect(res.otpauthUrl).toContain("period=30");
    expect(res.otpauthUrl).toContain(encodeURIComponent(EMAIL));
  });

  it("never stores the TOTP secret in plaintext", async () => {
    const res = await MfaService.enable(USER, EMAIL);
    const stored = await kv.get(`mfa:secret:${USER}`);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(res.secret);
  });

  it("never stores recovery codes in plaintext", async () => {
    const res = await MfaService.enable(USER, EMAIL);
    const stored = await kv.smembers(`mfa:recovery:${USER}`);
    expect(stored).toHaveLength(10);
    for (const code of res.recoveryCodes) {
      expect(stored).not.toContain(code);
    }
    // Stored values are SHA-256 hex digests.
    for (const h of stored) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports status only after enrolment", async () => {
    await expect(MfaService.status(USER)).resolves.toMatchObject({
      enabled: false,
      recoveryCodesRemaining: 0,
    });
    await MfaService.enable(USER, EMAIL);
    await expect(MfaService.status(USER)).resolves.toMatchObject({
      enabled: true,
      enforced: true,
      recoveryCodesRemaining: 10,
    });
  });
});

describe("verify() — recovery codes", () => {
  /**
   * This is the branch that `FakeKv` could not previously reach: the service
   * calls `redis.sismember`, which the fake did not implement, so the whole
   * recovery-code path was unexercised.
   */
  it("accepts a recovery code and consumes it (single use)", async () => {
    const { recoveryCodes } = await MfaService.enable(USER, EMAIL);
    const code = recoveryCodes[0]!;

    const first = await MfaService.verify(USER, code);
    expect(first).toEqual({ ok: true, method: "recovery" });

    // Replay of the same code must fail — this is the property that stops a
    // leaked backup code being reused.
    const replay = await MfaService.verify(USER, code);
    expect(replay.ok).toBe(false);

    await expect(MfaService.status(USER)).resolves.toMatchObject({
      recoveryCodesRemaining: 9,
    });
  });

  it("matches recovery codes case-insensitively", async () => {
    const { recoveryCodes } = await MfaService.enable(USER, EMAIL);
    const res = await MfaService.verify(USER, recoveryCodes[1]!.toLowerCase());
    expect(res.ok).toBe(true);
  });

  it("rejects an unknown recovery code", async () => {
    await MfaService.enable(USER, EMAIL);
    const res = await MfaService.verify(USER, "NOTAREALCODE");
    expect(res).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("reports mfa_not_enabled when the user has no secret", async () => {
    const res = await MfaService.verify("nobody", "123456");
    expect(res).toEqual({ ok: false, reason: "mfa_not_enabled" });
  });

  it("distinguishes a wrong 6-digit code from a wrong recovery code", async () => {
    await MfaService.enable(USER, EMAIL);
    // 6-digit input is treated as TOTP, so the reason must say so rather than
    // falling through to the recovery-code branch.
    const res = await MfaService.verify(USER, "000000");
    expect(res.reason).toBe("invalid_totp");
  });
});

describe("lifecycle", () => {
  it("regenerateRecoveryCodes replaces the old set", async () => {
    const { recoveryCodes: original } = await MfaService.enable(USER, EMAIL);
    const fresh = await MfaService.regenerateRecoveryCodes(USER);

    expect(fresh).toHaveLength(10);
    expect(new Set(fresh)).not.toEqual(new Set(original));

    // An old code must no longer authenticate.
    const res = await MfaService.verify(USER, original[0]!);
    expect(res.ok).toBe(false);
    // A new one must.
    await expect(MfaService.verify(USER, fresh[0]!)).resolves.toMatchObject({ ok: true });
  });

  it("disable() clears secret, recovery codes, and enforcement", async () => {
    await MfaService.enable(USER, EMAIL);
    await MfaService.disable(USER);

    await expect(MfaService.status(USER)).resolves.toEqual({
      enabled: false,
      enforced: false,
      recoveryCodesRemaining: 0,
    });
    await expect(MfaService.verify(USER, "123456")).resolves.toMatchObject({
      reason: "mfa_not_enabled",
    });
  });
});

describe("input validation", () => {
  it.each(["", "12345", "1234567", "abcdef", "12 34 56", "١٢٣٤٥٦"])(
    "does not treat %j as a valid TOTP code",
    async (bad) => {
      await MfaService.enable(USER, EMAIL);
      const res = await MfaService.verify(USER, bad);
      expect(res.ok).toBe(false);
    },
  );
});

/**
 * Guards the assumption the vectors rest on: that Node's HMAC-SHA1 output for
 * the RFC seed is what the RFC says. If this ever fails, the environment — not
 * the service — has changed.
 */
describe("environment sanity", () => {
  it("Node HMAC-SHA1 matches the RFC 6238 seed expectation", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(Math.floor(59 / 30)), 0);
    const hmac = createHmac("sha1", key).update(counter).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const bin =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);
    expect(String(bin % 10 ** 6).padStart(6, "0")).toBe("287082");
  });
});
