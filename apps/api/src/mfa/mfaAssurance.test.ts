/**
 * Session 116 — MFA assurance tests.
 *
 * Runs fully in-memory: FakeKv stands in for Redis and FakePrisma for the
 * membership tables, and every enrolment is seeded through the *real*
 * `services/mfa.service.ts` rather than by writing its keys directly — if the
 * assurance layer ever drifts from the key layout the TOTP service actually
 * uses, these tests break instead of quietly reporting an empty organization.
 *
 * The properties pinned here are the ones the module's honesty rules depend on:
 *
 *   - a lockout that engages at the threshold, ages out of its window, and is
 *     cleared by a success — not merely a counter that goes up;
 *   - a TOTP that cannot be presented twice inside its live window, checked
 *     against a code computed the way an authenticator computes it;
 *   - `unrecorded` for a secret that predates the ledger, never `confirmed`;
 *   - `report_only` blocking nothing at all, and `block_after_grace` blocking
 *     only the member who is required, unenrolled and out of grace;
 *   - an administrator being unable to switch on blocking from an account that
 *     would itself be blocked;
 *   - organization isolation for every stored artefact;
 *   - no token, code or secret ever written to storage in the clear.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { MfaAssuranceService: Assurance } = await import("./mfaAssurance.service.js");
const { MfaService } = await import("../services/mfa.service.js");
const {
  MFA_FAILURE_WINDOW_SECONDS,
  MFA_LOCKOUT_SECONDS,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_RECOVERY_CODE_COUNT,
  MFA_REPLAY_GUARD_SECONDS,
  MFA_TOTP_DIGITS,
  MFA_TOTP_PERIOD_SECONDS,
  mfaTokenKind,
} = await import("@windels/shared/mfa");

const ORG_A = "org-mfa-a";
const ORG_B = "org-mfa-b";

/* ── Test-side TOTP, computed the way an authenticator app computes it ──── */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s: string): Buffer {
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >>> bits) & 0xff); }
  }
  return Buffer.from(out);
}
/** Independent implementation, so a shared bug cannot make a test pass. */
function totpFor(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / MFA_TOTP_PERIOD_SECONDS);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[off]! & 0x7f) << 24) | ((hmac[off + 1]! & 0xff) << 16) |
    ((hmac[off + 2]! & 0xff) << 8) | (hmac[off + 3]! & 0xff);
  return String(bin % 10 ** MFA_TOTP_DIGITS).padStart(MFA_TOTP_DIGITS, "0");
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

let seq = 0;
function member(org: string, role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST", joinedAt = new Date(0)) {
  const id = `user-${role.toLowerCase()}-${++seq}`;
  const p = db.client();
  p.user.create({ data: { id, email: `${id}@windels.ai`, passwordHash: "x", role: "USER" } });
  p.membership.create({ data: { id: `mem-${id}`, userId: id, organizationId: org, role, joinedAt } });
  return id;
}

/** Enrol through the real service and return the secret + recovery codes. */
async function enrol(userId: string, org: string | null, confirm = true) {
  const res = await MfaService.enable(userId, `${userId}@windels.ai`);
  await Assurance.recordEnrollmentStarted(userId, org);
  if (confirm) {
    const token = totpFor(res.secret);
    await Assurance.recordVerification({ userId, organizationId: org, token, ok: true, method: "totp" });
  }
  return res;
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  db.reset();
  seq = 0;
});

/* ── Policy ─────────────────────────────────────────────────────────────── */

describe("organization policy", () => {
  it("defaults to the platform's historical behaviour and says it is a default", async () => {
    const policy = await Assurance.getPolicy(ORG_A);
    expect(policy).toMatchObject({
      organizationId: ORG_A,
      mode: "optional",
      enforcement: "report_only",
      allowRecoveryCodes: true,
      updatedAt: null,
      updatedBy: null,
      source: "default",
    });
    // The payload has to carry the caveat, not just the code.
    expect(policy.enforcementNote).toContain("report_only blocks nothing");
  });

  it("stores a saved policy, stamps the author, and marks it stored", async () => {
    const saved = await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 14 }, { id: "admin-1" });
    expect(saved).toMatchObject({ mode: "required_all", graceDays: 14, updatedBy: "admin-1", source: "stored" });
    expect(saved.updatedAt).toBeTruthy();
    await expect(Assurance.getPolicy(ORG_A)).resolves.toMatchObject({ mode: "required_all", source: "stored" });
  });

  it("keeps one organization's policy out of another's", async () => {
    await Assurance.setPolicy(ORG_A, { mode: "required_all" }, { id: "admin-1" });
    await expect(Assurance.getPolicy(ORG_B)).resolves.toMatchObject({ mode: "optional", source: "default" });
  });

  it("records the change in the ledger with the values it replaced", async () => {
    await Assurance.setPolicy(ORG_A, { mode: "required_admins" }, { id: "admin-1" });
    const page = await Assurance.events(ORG_A, { kind: "policy_updated" });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]!.detail).toMatchObject({ mode: "required_admins", previousMode: "optional" });
    expect(page.events[0]!.actorId).toBe("admin-1");
  });

  it("refuses to switch on blocking from an account that would itself be blocked", async () => {
    const owner = member(ORG_A, "OWNER");
    await expect(
      Assurance.setPolicy(ORG_A, { mode: "required_all", enforcement: "block_after_grace" }, { id: owner }),
    ).rejects.toThrow(/cannot be switched on from an account that would itself be blocked/i);
    // And nothing was written — a refused change must not half-apply.
    await expect(Assurance.getPolicy(ORG_A)).resolves.toMatchObject({ source: "default" });
  });

  it("allows blocking once the acting administrator is covered", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const saved = await Assurance.setPolicy(
      ORG_A, { mode: "required_all", enforcement: "block_after_grace" }, { id: owner },
    );
    expect(saved.enforcement).toBe("block_after_grace");
  });

  it("allows blocking when the acting administrator holds an active exemption", async () => {
    const owner = member(ORG_A, "OWNER");
    await Assurance.grantExemption(ORG_A, { userId: owner, reason: "Hardware token on order — tracked in SEC-114.", days: 30 }, "admin-1");
    const saved = await Assurance.setPolicy(
      ORG_A, { mode: "required_all", enforcement: "block_after_grace" }, { id: owner },
    );
    expect(saved.enforcement).toBe("block_after_grace");
  });

  it("does not apply the self-lockout guard to a policy that stays report_only", async () => {
    const owner = member(ORG_A, "OWNER");
    await expect(
      Assurance.setPolicy(ORG_A, { mode: "required_all" }, { id: owner }),
    ).resolves.toMatchObject({ mode: "required_all", enforcement: "report_only" });
  });
});

/* ── Enrolment lifecycle ────────────────────────────────────────────────── */

describe("enrolment lifecycle", () => {
  it("reports 'none' before anything is enrolled", async () => {
    await expect(Assurance.getEnrollment("nobody")).resolves.toMatchObject({
      state: "none", startedAt: null, confirmedAt: null, stale: false,
    });
  });

  it("reports 'pending' after enable and before any successful verification", async () => {
    const uid = member(ORG_A, "MEMBER");
    await enrol(uid, ORG_A, false);
    const rec = await Assurance.getEnrollment(uid);
    expect(rec.state).toBe("pending");
    expect(rec.startedAt).toBeTruthy();
    expect(rec.confirmedAt).toBeNull();
  });

  it("closes to 'confirmed' on the first successful verification and keeps the first timestamp", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
      const uid = member(ORG_A, "MEMBER");
      const { secret } = await enrol(uid, ORG_A);
      const first = await Assurance.getEnrollment(uid);
      expect(first.state).toBe("confirmed");
      const confirmedAt = first.confirmedAt;

      // A later verification must not restamp the confirmation: "when did this
      // person first prove they hold the secret" is the question coverage asks,
      // and it has exactly one answer.
      vi.setSystemTime(Date.now() + 60_000);
      await Assurance.recordVerification({
        userId: uid, organizationId: ORG_A, token: totpFor(secret), ok: true, method: "totp",
      });
      const second = await Assurance.getEnrollment(uid);
      expect(second.confirmedAt).toBe(confirmedAt);
      expect(second.lastVerifiedAt).not.toBe(confirmedAt);
      expect(Date.parse(second.lastVerifiedAt!)).toBeGreaterThan(Date.parse(confirmedAt!));
    } finally { vi.useRealTimers(); }
  });

  it("reports a secret that predates the ledger as 'unrecorded', never 'confirmed'", async () => {
    const uid = member(ORG_A, "MEMBER");
    await MfaService.enable(uid, "legacy@windels.ai"); // no assurance record written
    const rec = await Assurance.getEnrollment(uid);
    expect(rec.state).toBe("unrecorded");
    expect(rec.confirmedAt).toBeNull();
    expect(rec.note).toContain("genuinely does not know");
  });

  it("flags a pending enrolment older than the stale threshold", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const uid = member(ORG_A, "MEMBER");
      await enrol(uid, ORG_A, false);
      await expect(Assurance.getEnrollment(uid)).resolves.toMatchObject({ stale: false });
      vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
      await expect(Assurance.getEnrollment(uid)).resolves.toMatchObject({ state: "pending", stale: true });
    } finally { vi.useRealTimers(); }
  });

  it("lets a user walk out of a pending enrolment, discarding the secret", async () => {
    const uid = member(ORG_A, "MEMBER");
    await enrol(uid, ORG_A, false);
    const res = await Assurance.abandonEnrollment(uid, ORG_A);
    expect(res.cleared).toBe(true);
    expect(res.enrollment.state).toBe("none");
    await expect(MfaService.status(uid)).resolves.toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });
    const page = await Assurance.events(ORG_A, { kind: "enrollment_abandoned" });
    expect(page.events).toHaveLength(1);
  });

  it("refuses to abandon a confirmed enrolment and explains what to do instead", async () => {
    const uid = member(ORG_A, "MEMBER");
    await enrol(uid, ORG_A);
    const res = await Assurance.abandonEnrollment(uid, ORG_A);
    expect(res.cleared).toBe(false);
    expect(res.reason).toMatch(/disable it with a valid code/i);
    await expect(MfaService.status(uid)).resolves.toMatchObject({ enabled: true });
  });

  it("says there is nothing to abandon when nothing was started", async () => {
    const res = await Assurance.abandonEnrollment("nobody", ORG_A);
    expect(res).toMatchObject({ cleared: false, reason: "There is no pending enrolment to abandon." });
  });

  it("clears the enrolment record and the failure state when MFA is disabled", async () => {
    const uid = member(ORG_A, "MEMBER");
    await enrol(uid, ORG_A);
    await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
    await MfaService.disable(uid);
    await Assurance.recordDisabled(uid, ORG_A, uid);
    await expect(Assurance.getEnrollment(uid)).resolves.toMatchObject({ state: "none" });
    await expect(Assurance.lockState(uid)).resolves.toMatchObject({ failedAttempts: 0, locked: false });
  });
});

/* ── Throttle ───────────────────────────────────────────────────────────── */

describe("verification throttle", () => {
  it("allows a clean account and reports the full attempt budget", async () => {
    const gate = await Assurance.gate({ userId: "clean", organizationId: ORG_A, token: "123456" });
    expect(gate).toMatchObject({ allowed: true, reason: "ok", tokenKind: "totp" });
    expect(gate.lock.remainingAttempts).toBe(MFA_MAX_FAILED_ATTEMPTS);
  });

  it("counts failures down and engages the lock exactly at the threshold", async () => {
    const uid = member(ORG_A, "MEMBER");
    for (let i = 1; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      const state = await Assurance.recordVerification({
        userId: uid, organizationId: ORG_A, token: "000000", ok: false, reason: "invalid_totp",
      });
      expect(state.locked).toBe(false);
      expect(state.failedAttempts).toBe(i);
      expect(state.remainingAttempts).toBe(MFA_MAX_FAILED_ATTEMPTS - i);
    }
    const locked = await Assurance.recordVerification({
      userId: uid, organizationId: ORG_A, token: "000000", ok: false, reason: "invalid_totp",
    });
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.retryAfterSeconds).toBeLessThanOrEqual(MFA_LOCKOUT_SECONDS);
  });

  it("refuses the next attempt while the lock is engaged", async () => {
    const uid = member(ORG_A, "MEMBER");
    for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
    }
    const gate = await Assurance.gate({ userId: uid, organizationId: ORG_A, token: "111111" });
    expect(gate).toMatchObject({ allowed: false, reason: "locked" });
    expect(gate.message).toMatch(/try again in \d+s/i);
  });

  it("records account_locked once, with the reason the code used", async () => {
    const uid = member(ORG_A, "MEMBER");
    for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
    }
    const page = await Assurance.events(ORG_A, { kind: "account_locked" });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]!.reason).toBe(`failed_attempts_${MFA_MAX_FAILED_ATTEMPTS}`);
  });

  it("clears the counter on a success", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { secret } = await enrol(uid, ORG_A, false);
    await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
    await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000001", ok: false });
    await expect(Assurance.lockState(uid)).resolves.toMatchObject({ failedAttempts: 2 });
    await Assurance.recordVerification({
      userId: uid, organizationId: ORG_A, token: totpFor(secret), ok: true, method: "totp",
    });
    await expect(Assurance.lockState(uid)).resolves.toMatchObject({ failedAttempts: 0, locked: false });
  });

  it("ages failures out of the window rather than following a user around", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
      const uid = member(ORG_A, "MEMBER");
      for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS - 1; i++) {
        await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
      }
      vi.setSystemTime(Date.now() + (MFA_FAILURE_WINDOW_SECONDS + 60) * 1000);
      await expect(Assurance.lockState(uid)).resolves.toMatchObject({ failedAttempts: 0 });
      // A fresh failure starts a new window instead of tipping the old one over.
      const state = await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
      expect(state).toMatchObject({ failedAttempts: 1, locked: false });
    } finally { vi.useRealTimers(); }
  });

  it("lets the lock expire on its own", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
      const uid = member(ORG_A, "MEMBER");
      for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
        await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
      }
      await expect(Assurance.lockState(uid)).resolves.toMatchObject({ locked: true });
      vi.setSystemTime(Date.now() + (MFA_LOCKOUT_SECONDS + 1) * 1000);
      await expect(Assurance.lockState(uid)).resolves.toMatchObject({ locked: false, retryAfterSeconds: 0 });
    } finally { vi.useRealTimers(); }
  });

  it("lets an administrator lift a lock, and records who lifted it", async () => {
    const uid = member(ORG_A, "MEMBER");
    for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false });
    }
    const after = await Assurance.clearLock(ORG_A, uid, "admin-1");
    expect(after).toMatchObject({ locked: false, failedAttempts: 0 });
    const page = await Assurance.events(ORG_A, { kind: "lock_cleared" });
    expect(page.events[0]).toMatchObject({ actorId: "admin-1", userId: uid });
    expect(page.events[0]!.detail).toMatchObject({ wasLocked: true });
  });

  it("lists only the members of this organization who are throttled", async () => {
    const throttled = member(ORG_A, "MEMBER");
    member(ORG_A, "MEMBER");
    const other = member(ORG_B, "MEMBER");
    for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      await Assurance.recordVerification({ userId: throttled, organizationId: ORG_A, token: "000000", ok: false });
      await Assurance.recordVerification({ userId: other, organizationId: ORG_B, token: "000000", ok: false });
    }
    const locks = await Assurance.listLocks(ORG_A);
    expect(locks.locks.map((l) => l.userId)).toEqual([throttled]);
    expect(locks.locks[0]!.email).toBe(`${throttled}@windels.ai`);
  });
});

/* ── Replay ─────────────────────────────────────────────────────────────── */

describe("TOTP replay guard", () => {
  it("refuses a code that already verified inside its live window", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { secret } = await enrol(uid, ORG_A, false);
    const token = totpFor(secret);

    await expect(Assurance.gate({ userId: uid, organizationId: ORG_A, token })).resolves.toMatchObject({ allowed: true });
    await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token, ok: true, method: "totp" });

    const replay = await Assurance.gate({ userId: uid, organizationId: ORG_A, token });
    expect(replay).toMatchObject({ allowed: false, reason: "replayed" });
    expect(replay.message).toMatch(/already been used/i);
  });

  it("marks the code for one user only", async () => {
    const a = member(ORG_A, "MEMBER");
    const b = member(ORG_A, "MEMBER");
    const { secret } = await enrol(a, ORG_A, false);
    const token = totpFor(secret);
    await Assurance.recordVerification({ userId: a, organizationId: ORG_A, token, ok: true, method: "totp" });
    await expect(Assurance.gate({ userId: b, organizationId: ORG_A, token })).resolves.toMatchObject({ allowed: true });
  });

  it("stops guarding once the code could no longer be valid anyway", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
      const uid = member(ORG_A, "MEMBER");
      const { secret } = await enrol(uid, ORG_A, false);
      const token = totpFor(secret);
      await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token, ok: true, method: "totp" });
      await expect(Assurance.gate({ userId: uid, organizationId: ORG_A, token })).resolves.toMatchObject({ allowed: false });
      vi.setSystemTime(Date.now() + (MFA_REPLAY_GUARD_SECONDS + 1) * 1000);
      await expect(Assurance.gate({ userId: uid, organizationId: ORG_A, token })).resolves.toMatchObject({ allowed: true });
    } finally { vi.useRealTimers(); }
  });

  it("never writes a submitted token or a recovery code to storage in the clear", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { secret, recoveryCodes } = await enrol(uid, ORG_A, false);
    const token = totpFor(secret);
    await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token, ok: true, method: "totp" });
    await Assurance.recordVerification({
      userId: uid, organizationId: ORG_A, token: recoveryCodes[0]!, ok: true, method: "recovery",
    });

    const haystack = [
      ...[...kv.strings.entries()].map(([k, v]) => `${k}=${v.value}`),
      ...[...kv.lists.entries()].map(([k, v]) => `${k}=${v.join("|")}`),
      ...[...kv.sets.entries()].map(([k, v]) => `${k}=${[...v].join("|")}`),
    ].join("\n");
    expect(haystack).not.toContain(token);
    expect(haystack).not.toContain(recoveryCodes[0]);
    expect(haystack).not.toContain(secret);
  });
});

/* ── Recovery codes ─────────────────────────────────────────────────────── */

describe("recovery codes", () => {
  it("refuses a recovery code when the organization's policy does not accept them", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { recoveryCodes } = await enrol(uid, ORG_A);
    await Assurance.setPolicy(ORG_A, { allowRecoveryCodes: false }, { id: "admin-1" });
    const gate = await Assurance.gate({ userId: uid, organizationId: ORG_A, token: recoveryCodes[1]! });
    expect(gate).toMatchObject({ allowed: false, reason: "recovery_codes_disabled", tokenKind: "recovery" });
  });

  it("still accepts a TOTP when recovery codes are switched off", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { secret } = await enrol(uid, ORG_A, false);
    await Assurance.setPolicy(ORG_A, { allowRecoveryCodes: false }, { id: "admin-1" });
    await expect(
      Assurance.gate({ userId: uid, organizationId: ORG_A, token: totpFor(secret) }),
    ).resolves.toMatchObject({ allowed: true, tokenKind: "totp" });
  });

  it("reports health against the organization's floor and records consumption", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { recoveryCodes } = await enrol(uid, ORG_A);
    await expect(Assurance.recoveryHealth(uid, ORG_A)).resolves.toMatchObject({
      remaining: MFA_RECOVERY_CODE_COUNT, issued: MFA_RECOVERY_CODE_COUNT, low: false, exhausted: false,
    });

    // Consume through the real service so the digest set is the one that shrinks.
    for (let i = 0; i < MFA_RECOVERY_CODE_COUNT - 2; i++) {
      await MfaService.verify(uid, recoveryCodes[i]!);
    }
    await Assurance.setPolicy(ORG_A, { recoveryCodeFloor: 3 }, { id: "admin-1" });
    await expect(Assurance.recoveryHealth(uid, ORG_A)).resolves.toMatchObject({ remaining: 2, low: true, exhausted: false });
  });

  it("logs a recovery_code_used event carrying the remaining count", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { recoveryCodes } = await enrol(uid, ORG_A);
    await MfaService.verify(uid, recoveryCodes[0]!);
    await Assurance.recordVerification({
      userId: uid, organizationId: ORG_A, token: recoveryCodes[0]!, ok: true, method: "recovery",
    });
    const page = await Assurance.events(ORG_A, { kind: "recovery_code_used" });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]!.detail).toMatchObject({ remaining: MFA_RECOVERY_CODE_COUNT - 1 });
  });
});

/* ── Coverage ───────────────────────────────────────────────────────────── */

describe("coverage", () => {
  it("counts nobody as required while the policy is optional", async () => {
    const a = member(ORG_A, "OWNER");
    member(ORG_A, "MEMBER");
    await enrol(a, ORG_A);
    const report = await Assurance.coverage(ORG_A);
    expect(report.membersConsidered).toBe(2);
    expect(report.counts.covered).toBe(1);
    expect(report.counts.not_required).toBe(1);
    expect(report.requiredCoverageRatio).toBeNull();
  });

  it("asks only owners and admins under required_admins", async () => {
    const owner = member(ORG_A, "OWNER");
    const admin = member(ORG_A, "ADMIN");
    member(ORG_A, "MEMBER");
    await enrol(owner, ORG_A);
    await Assurance.setPolicy(ORG_A, { mode: "required_admins", graceDays: 0 }, { id: owner });

    const report = await Assurance.coverage(ORG_A);
    const byId = new Map(report.members.map((m) => [m.userId, m]));
    expect(byId.get(owner)).toMatchObject({ required: true, compliance: "covered" });
    expect(byId.get(admin)).toMatchObject({ required: true, compliance: "not_enrolled" });
    expect(report.members.find((m) => m.membershipRole === "MEMBER")).toMatchObject({
      required: false, compliance: "not_required",
    });
    expect(report.requiredCoverageRatio).toBe(0.5);
  });

  it("distinguishes a member inside their grace period from one past it", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const late = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 7 }, { id: owner });

    const during = await Assurance.coverage(ORG_A);
    expect(during.members.find((m) => m.userId === late)).toMatchObject({ compliance: "in_grace", graceExpired: false });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 8 * 86_400_000);
      const after = await Assurance.coverage(ORG_A);
      expect(after.members.find((m) => m.userId === late)).toMatchObject({ compliance: "not_enrolled", graceExpired: true });
    } finally { vi.useRealTimers(); }
  });

  it("reports a pending enrolment as pending rather than as coverage", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const pending = member(ORG_A, "MEMBER");
    await enrol(pending, ORG_A, false);
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0 }, { id: owner });

    const report = await Assurance.coverage(ORG_A);
    expect(report.members.find((m) => m.userId === pending)).toMatchObject({
      enrolled: true, enrollmentState: "pending", compliance: "enrollment_pending",
    });
    expect(report.counts.covered).toBe(1);
  });

  it("shows an exempt member as exempt, never folded into covered", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const exempt = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0 }, { id: owner });
    await Assurance.grantExemption(ORG_A, { userId: exempt, reason: "Shared floor terminal, no personal device.", days: 30 }, owner);

    const report = await Assurance.coverage(ORG_A);
    expect(report.members.find((m) => m.userId === exempt)).toMatchObject({ compliance: "exempt" });
    expect(report.counts.covered).toBe(1);
    expect(report.counts.exempt).toBe(1);
  });

  it("counts a pre-ledger secret as coverage but keeps its state honest", async () => {
    const owner = member(ORG_A, "OWNER");
    await MfaService.enable(owner, "legacy@windels.ai"); // no assurance record
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0 }, { id: "admin-1" });
    const report = await Assurance.coverage(ORG_A);
    expect(report.members[0]).toMatchObject({ compliance: "covered", enrollmentState: "unrecorded" });
  });

  it("reports truncation instead of silently shortening the list", async () => {
    member(ORG_A, "OWNER");
    member(ORG_A, "MEMBER");
    member(ORG_A, "MEMBER");
    const report = await Assurance.coverage(ORG_A, { limit: 2 });
    expect(report.membersConsidered).toBe(2);
    expect(report.membersTotal).toBe(3);
    expect(report.truncated).toBe(true);
  });

  it("filters the listing without shrinking the counts", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    member(ORG_A, "MEMBER");
    const report = await Assurance.coverage(ORG_A, { compliance: "covered" });
    expect(report.members).toHaveLength(1);
    expect(report.counts.not_required).toBe(1); // still describes everyone
  });

  it("never leaks another organization's members", async () => {
    member(ORG_A, "OWNER");
    member(ORG_B, "OWNER");
    const report = await Assurance.coverage(ORG_A);
    expect(report.membersConsidered).toBe(1);
    expect(report.members[0]!.email).toContain("owner-1");
  });
});

/* ── Login decision ─────────────────────────────────────────────────────── */

describe("login decision", () => {
  it("allows and names the reason when enforcement is report_only", async () => {
    const uid = member(ORG_A, "OWNER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0 }, { id: "admin-1" });
    const d = await Assurance.evaluateLogin({ userId: uid, organizationId: ORG_A, membershipRole: "OWNER" });
    expect(d).toMatchObject({
      decision: "allow", required: true, compliance: "not_enrolled",
      reason: "non_compliant_but_enforcement_is_report_only",
    });
  });

  it("blocks a required, unenrolled member once the grace deadline has passed", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const late = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0, enforcement: "block_after_grace" }, { id: owner });
    const d = await Assurance.evaluateLogin({ userId: late, organizationId: ORG_A, membershipRole: "MEMBER" });
    expect(d).toMatchObject({ decision: "block", reason: "mfa_required_grace_expired" });
  });

  it("does not block during the grace period", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const late = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 7, enforcement: "block_after_grace" }, { id: owner });
    const d = await Assurance.evaluateLogin({ userId: late, organizationId: ORG_A, membershipRole: "MEMBER" });
    expect(d).toMatchObject({ decision: "allow", compliance: "in_grace" });
  });

  it("never blocks an exempt member", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const exempt = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0, enforcement: "block_after_grace" }, { id: owner });
    await Assurance.grantExemption(ORG_A, { userId: exempt, reason: "Field device pending replacement (SEC-220).", days: 10 }, owner);
    const d = await Assurance.evaluateLogin({ userId: exempt, organizationId: ORG_A, membershipRole: "MEMBER" });
    expect(d).toMatchObject({ decision: "allow", compliance: "exempt" });
  });

  it("allows and says why when the session has no organization", async () => {
    const d = await Assurance.evaluateLogin({ userId: "solo", organizationId: null });
    expect(d).toMatchObject({ decision: "allow", reason: "no_organization_context", required: false });
  });

  it("stops blocking as soon as the member enrols", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const late = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0, enforcement: "block_after_grace" }, { id: owner });
    await expect(
      Assurance.evaluateLogin({ userId: late, organizationId: ORG_A, membershipRole: "MEMBER" }),
    ).resolves.toMatchObject({ decision: "block" });
    await enrol(late, ORG_A);
    await expect(
      Assurance.evaluateLogin({ userId: late, organizationId: ORG_A, membershipRole: "MEMBER" }),
    ).resolves.toMatchObject({ decision: "allow", compliance: "covered" });
  });
});

/* ── Ledger ─────────────────────────────────────────────────────────────── */

describe("ledger", () => {
  it("writes an event to both the organization and the member stream", async () => {
    const uid = member(ORG_A, "MEMBER");
    await enrol(uid, ORG_A, false);
    const org = await Assurance.events(ORG_A, { kind: "enrollment_started" });
    const mine = await Assurance.memberEvents(uid, { kind: "enrollment_started" });
    expect(org.events).toHaveLength(1);
    expect(mine.events).toHaveLength(1);
    expect(mine.events[0]!.id).toBe(org.events[0]!.id);
    expect(mine.scope).toBe("member");
  });

  it("keeps an event with no organization context in the member stream only", async () => {
    await Assurance.recordVerification({ userId: "orphan", organizationId: null, token: "000000", ok: false });
    await expect(Assurance.events(ORG_A)).resolves.toMatchObject({ returned: 0 });
    const mine = await Assurance.memberEvents("orphan");
    expect(mine.events.map((e) => e.kind)).toContain("verification_failed");
  });

  it("honours the requested limit and returns newest first", async () => {
    const uid = member(ORG_A, "MEMBER");
    for (let i = 0; i < 5; i++) {
      await Assurance.recordVerification({ userId: uid, organizationId: ORG_A, token: "000000", ok: false, reason: `try_${i}` });
    }
    const page = await Assurance.events(ORG_A, { limit: 2, kind: "verification_failed" });
    expect(page.events).toHaveLength(2);
    expect(page.events[0]!.reason).toBe("try_4");
    expect(page.limit).toBe(2);
    expect(page.note).toContain("recorded since this ledger was introduced");
  });

  it("does not spill one organization's ledger into another", async () => {
    await Assurance.setPolicy(ORG_A, { mode: "required_all" }, { id: "admin-1" });
    await expect(Assurance.events(ORG_B)).resolves.toMatchObject({ returned: 0 });
  });
});

/* ── Exemptions ─────────────────────────────────────────────────────────── */

describe("exemptions", () => {
  it("refuses an exemption for someone who is not a member", async () => {
    await expect(
      Assurance.grantExemption(ORG_A, { userId: "stranger", reason: "Not one of ours at all.", days: 30 }, "admin-1"),
    ).rejects.toThrow(/not a member of this organization/i);
  });

  it("records the reason, the author and an expiry, and lists it as active", async () => {
    const uid = member(ORG_A, "MEMBER");
    const ex = await Assurance.grantExemption(
      ORG_A, { userId: uid, reason: "Contractor without a company device; reviewed 2026-08-01.", days: 30 }, "admin-1",
    );
    expect(ex).toMatchObject({ userId: uid, grantedBy: "admin-1", active: true });
    const list = await Assurance.listExemptions(ORG_A);
    expect(list.exemptions).toHaveLength(1);
    expect(list.exemptions[0]!.reason).toContain("Contractor");
  });

  it("expires on its own without anyone revoking it", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
      const uid = member(ORG_A, "MEMBER");
      await Assurance.grantExemption(ORG_A, { userId: uid, reason: "Two weeks while the token ships.", days: 14 }, "admin-1");
      await expect(Assurance.listExemptions(ORG_A)).resolves.toMatchObject({
        exemptions: [expect.objectContaining({ active: true })],
      });
      vi.setSystemTime(Date.now() + 15 * 86_400_000);
      const later = await Assurance.listExemptions(ORG_A);
      expect(later.exemptions[0]!.active).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it("revokes an exemption and reports whether there was one to revoke", async () => {
    const uid = member(ORG_A, "MEMBER");
    await Assurance.grantExemption(ORG_A, { userId: uid, reason: "Temporary, pending device rollout.", days: 5 }, "admin-1");
    await expect(Assurance.revokeExemption(ORG_A, uid, "admin-1")).resolves.toEqual({ revoked: true });
    await expect(Assurance.revokeExemption(ORG_A, uid, "admin-1")).resolves.toEqual({ revoked: false });
    await expect(Assurance.listExemptions(ORG_A)).resolves.toMatchObject({ exemptions: [] });
  });
});

/* ── Gaps, summary, configuration ───────────────────────────────────────── */

describe("gaps and summary", () => {
  it("names each concrete problem with a severity", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const late = member(ORG_A, "MEMBER");
    await Assurance.setPolicy(ORG_A, { mode: "required_all", graceDays: 0 }, { id: owner });

    const report = await Assurance.gaps(ORG_A);
    const kinds = report.gaps.map((g) => g.kind);
    expect(kinds).toContain("member_not_enrolled");
    expect(report.counts.high).toBeGreaterThan(0);
    expect(report.gaps.find((g) => g.userId === late)!.detail).toMatch(/grace ended/i);
    expect(report.note).toContain("not a risk score");
  });

  it("flags an exhausted recovery-code set as high severity", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { recoveryCodes } = await enrol(uid, ORG_A);
    for (const code of recoveryCodes) await MfaService.verify(uid, code);
    const report = await Assurance.gaps(ORG_A);
    expect(report.gaps.find((g) => g.kind === "recovery_codes_exhausted")).toMatchObject({ userId: uid, severity: "high" });
  });

  it("summarises locks, pending enrolments and exemptions together", async () => {
    const owner = member(ORG_A, "OWNER");
    await enrol(owner, ORG_A);
    const pending = member(ORG_A, "MEMBER");
    await enrol(pending, ORG_A, false);
    const locked = member(ORG_A, "MEMBER");
    for (let i = 0; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      await Assurance.recordVerification({ userId: locked, organizationId: ORG_A, token: "000000", ok: false });
    }
    await Assurance.grantExemption(ORG_A, { userId: locked, reason: "Locked out; exemption while support helps.", days: 3 }, owner);

    const summary = await Assurance.summary(ORG_A);
    expect(summary).toMatchObject({
      organizationId: ORG_A, membersConsidered: 3, activeLocks: 1, activeExemptions: 1, pendingEnrollments: 1,
    });
    expect(summary.recentEvents).toBeGreaterThan(0);
    expect(summary.coverageNote).toContain("Nothing here is sampled or extrapolated");
  });
});

describe("configuration report", () => {
  it("reports the parameters the TOTP service actually issues", async () => {
    const uid = member(ORG_A, "MEMBER");
    const { otpauthUrl } = await MfaService.enable(uid, "person@windels.ai");
    const config = Assurance.configuration();
    // The report is only worth anything if it matches the URL a real
    // authenticator is asked to scan.
    expect(otpauthUrl).toContain(`algorithm=${config.totp.algorithm}`);
    expect(otpauthUrl).toContain(`digits=${config.totp.digits}`);
    expect(otpauthUrl).toContain(`period=${config.totp.periodSeconds}`);
  });

  it("says whether an encryption key is configured without ever echoing one", () => {
    const config = Assurance.configuration();
    expect(config.secretStorage).toMatchObject({ at: "redis", encryption: "aes-256-gcm" });
    expect(["environment", "development_fallback"]).toContain(config.secretStorage.keySource);
    expect(JSON.stringify(config)).not.toMatch(/[0-9a-f]{64}/);
    expect(config.configNote).toContain("never what is working");
  });

  it("names the paths the throttle and replay guard are wired into", () => {
    const config = Assurance.configuration();
    expect(config.throttle.wiredInto).toContain("POST /api/v1/auth/mfa/complete");
    expect(config.replayGuard).toMatchObject({ enabled: true, seconds: MFA_REPLAY_GUARD_SECONDS });
  });
});

describe("token classification", () => {
  it("splits tokens the same way the verifier does", () => {
    expect(mfaTokenKind("123456")).toBe("totp");
    expect(mfaTokenKind("ABCD1234EF")).toBe("recovery");
    expect(mfaTokenKind("12 34 56")).toBe("unrecognised");
    expect(mfaTokenKind("")).toBe("unrecognised");
  });
});
