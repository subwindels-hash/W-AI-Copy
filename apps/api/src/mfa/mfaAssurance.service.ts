/**
 * Session 116 — Multi-factor authentication assurance.
 *
 * `services/mfa.service.ts` (the RFC 6238 TOTP implementation) is untouched by
 * this file. Its generator is still pinned to the RFC's published vectors, its
 * secret is still AES-256-GCM encrypted at rest, its recovery codes are still
 * SHA-256 digests consumed on use. This service is everything that was missing
 * *around* it:
 *
 *   - **A throttle.** Failed second-factor attempts are counted per user inside
 *     a window and the account's verification paths are refused once the
 *     threshold is crossed. Nothing counted them before; a 6-digit code with a
 *     ±1 drift window is three live codes in a million, and unlimited attempts
 *     turn that into arithmetic.
 *   - **A replay guard.** RFC 6238 §5.2 requires the verifier to refuse the
 *     second presentation of an OTP. A successfully used TOTP is marked for as
 *     long as it would otherwise stay live.
 *   - **Confirmed enrolment.** `POST /mfa/enable` wrote a secret and the next
 *     login demanded a code the user may never have scanned; `POST /mfa/confirm`
 *     verified a token and recorded nothing. Enrolment now has a recorded
 *     lifecycle — started, confirmed, abandoned — and a user can walk out of a
 *     pending enrolment instead of being locked out by it.
 *   - **An organization policy.** Who is required to enrol, how long they have,
 *     whether a non-compliant login is merely reported or actually refused, and
 *     whether recovery codes are accepted at all.
 *   - **Coverage.** Who in the organization has a second factor, who is inside
 *     their grace period, who is exempt and why.
 *   - **A ledger.** Enrolments, failures, locks, recovery-code use, policy
 *     changes and exemptions, per organization and per member.
 *
 * WHAT THIS SERVICE REFUSES TO CLAIM
 * ----------------------------------
 *   - A secret that predates this ledger is reported `unrecorded`, never
 *     `confirmed`. Whether that user ever completed a verification is unknown,
 *     and unknown is what the payload says.
 *   - `report_only` enforcement blocks nothing and says so. Only
 *     `block_after_grace` refuses a login, only after the deadline, never for an
 *     exempt account, and never for a member the policy does not cover.
 *   - Coverage counts memberships this database holds, capped, with the cap
 *     reported. It cannot see a device, an authenticator app, or an external IdP.
 *   - The configuration report reads this process's environment and reports
 *     "configured", never "working".
 *   - Every failure reason in the ledger is the string the code itself used.
 *
 * Keys:
 *   organization-scoped (Session 89 namespace sweep):
 *     mfa:policy:<org>:current      mfa:exempt:<org>:<userId>
 *     mfa:exemptidx:<org>           mfa:event:<org>
 *   principal-scoped — one key per user id, matching the pre-existing
 *   `mfa:secret:<user>` layout. A person's second factor belongs to the person,
 *   and the login path that reads these has not resolved an organization yet:
 *     mfa:enroll:<user>  mfa:fail:<user>  mfa:lock:<user>
 *     mfa:used:<user>:<digest>  mfa:uevent:<user>
 */
import { createHash, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/result.js";
import { MfaService } from "../services/mfa.service.js";
import {
  MFA_CONFIG_NOTE,
  MFA_COVERAGE_NOTE,
  MFA_DEFAULT_GRACE_DAYS,
  MFA_ENFORCEMENT_NOTE,
  MFA_ENROLLMENT_NOTE,
  MFA_EVENT_LIMIT,
  MFA_EXEMPTION_NOTE,
  MFA_FAILURE_WINDOW_SECONDS,
  MFA_GAP_NOTE,
  MFA_LEDGER_NOTE,
  MFA_LOCKOUT_NOTE,
  MFA_LOCKOUT_SECONDS,
  MFA_MAX_COVERAGE_MEMBERS,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_PENDING_STALE_HOURS,
  MFA_POLICY_NOTE,
  MFA_RECOVERY_CODE_COUNT,
  MFA_RECOVERY_LOW_WATERMARK,
  MFA_RECOVERY_NOTE,
  MFA_REPLAY_GUARD_SECONDS,
  MFA_REPLAY_NOTE,
  MFA_SELF_LOCKOUT_NOTE,
  MFA_TOTP_ALGORITHM,
  MFA_TOTP_DIGITS,
  MFA_TOTP_DRIFT_WINDOWS,
  MFA_TOTP_LIVE_SECONDS,
  MFA_TOTP_PERIOD_SECONDS,
  defaultMfaPolicy,
  emptyMfaComplianceCounts,
  emptyMfaLockState,
  isMfaGraceExpired,
  mfaComplianceState,
  mfaGraceDeadline,
  mfaLockRemainingSeconds,
  mfaPolicyRequiresRole,
  mfaRecoveryHealth,
  mfaTokenKind,
  normalizeMfaRecoveryCode,
  type MfaAssuranceSummary,
  type MfaAttemptGate,
  type MfaComplianceCounts,
  type MfaComplianceState,
  type MfaConfigurationReport,
  type MfaCoverageReport,
  type MfaEnrollmentRecord,
  type MfaEnrollmentState,
  type MfaEvent,
  type MfaEventKind,
  type MfaEventPage,
  type MfaExemption,
  type MfaGap,
  type MfaGapReport,
  type MfaLockState,
  type MfaLoginDecision,
  type MfaMemberCoverage,
  type MfaOrgPolicy,
  type MfaPolicyUpdateInput,
  type MfaRecoveryHealth,
  type MfaSelfView,
  type MfaVerifyMethod,
} from "@windels/shared/mfa";

/* ── Keys ─────────────────────────────────────────────────────────────── */

const K = {
  policy: (org: string) => `mfa:policy:${org}:current`,
  exemption: (org: string, userId: string) => `mfa:exempt:${org}:${userId}`,
  exemptionIdx: (org: string) => `mfa:exemptidx:${org}`,
  orgEvents: (org: string) => `mfa:event:${org}`,
  memberEvents: (userId: string) => `mfa:uevent:${userId}`,
  enrollment: (userId: string) => `mfa:enroll:${userId}`,
  failures: (userId: string) => `mfa:fail:${userId}`,
  lock: (userId: string) => `mfa:lock:${userId}`,
  usedToken: (userId: string, digest: string) => `mfa:used:${userId}:${digest}`,
};

/**
 * The pre-existing key `services/mfa.service.ts` writes the secret to. It is
 * read (never written) here so coverage can tell enrolled from not enrolled
 * without asking the service for three round trips per member.
 */
const K_EXISTING = {
  secret: (userId: string) => `mfa:secret:${userId}`,
  recovery: (userId: string) => `mfa:recovery:${userId}`,
};

/* ── Small helpers ────────────────────────────────────────────────────── */

function nowIso(): string {
  return new Date().toISOString();
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A record that will not parse is treated as absent rather than crashing a
    // report. Nothing here writes over a value it could not read.
    return null;
  }
}

/** Tokens are never stored. A truncated digest is enough to spot a replay. */
function tokenDigest(token: string): string {
  return createHash("sha256").update(normalizeMfaRecoveryCode(token)).digest("hex").slice(0, 32);
}

type StoredEnrollment = {
  userId: string;
  organizationId: string | null;
  startedAt: string | null;
  confirmedAt: string | null;
  lastVerifiedAt: string | null;
  lastMethod: MfaVerifyMethod | null;
};

type StoredFailures = { count: number; firstAt: string; lastAt: string };
type StoredLock = { lockedAt: string; lockedUntil: string; failedAttempts: number };
type StoredExemption = {
  organizationId: string;
  userId: string;
  reason: string;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string;
};

/* ── Ledger ───────────────────────────────────────────────────────────── */

/**
 * Append to the organization ledger (when an organization is known) and always
 * to the member's own. Login-time failures are recorded before the account has
 * been resolved to an organization on older challenges; those land in the
 * member ledger only, and the organization payload says so rather than
 * pretending the event did not happen.
 */
async function appendEvent(input: {
  kind: MfaEventKind;
  userId?: string | null;
  organizationId?: string | null;
  actorId?: string | null;
  method?: MfaVerifyMethod | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<MfaEvent> {
  const event: MfaEvent = {
    id: `mfa_evt_${randomUUID()}`,
    kind: input.kind,
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
    actorId: input.actorId ?? null,
    method: input.method ?? null,
    reason: input.reason ?? null,
    detail: input.detail ?? null,
    at: nowIso(),
  };
  const payload = JSON.stringify(event);
  if (event.organizationId) {
    await redis.lpush(K.orgEvents(event.organizationId), payload);
    await redis.ltrim(K.orgEvents(event.organizationId), 0, MFA_EVENT_LIMIT - 1);
  }
  if (event.userId) {
    await redis.lpush(K.memberEvents(event.userId), payload);
    await redis.ltrim(K.memberEvents(event.userId), 0, MFA_EVENT_LIMIT - 1);
  }
  return event;
}

async function readEvents(key: string, limit: number, kind?: MfaEventKind): Promise<MfaEvent[]> {
  // Filtering by kind still reads the ledger window: the list is capped at
  // MFA_EVENT_LIMIT, so this is a bounded read, and paging past a filter would
  // otherwise silently return fewer rows than asked for.
  const raw = await redis.lrange(key, 0, MFA_EVENT_LIMIT - 1);
  const out: MfaEvent[] = [];
  for (const r of raw) {
    const e = parse<MfaEvent>(r);
    if (!e) continue;
    if (kind && e.kind !== kind) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/* ── Policy ───────────────────────────────────────────────────────────── */

async function loadPolicy(org: string): Promise<MfaOrgPolicy> {
  const stored = parse<Partial<MfaOrgPolicy>>(await redis.get(K.policy(org)));
  const base = defaultMfaPolicy(org);
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    organizationId: org,
    source: "stored",
    note: MFA_POLICY_NOTE,
    enforcementNote: MFA_ENFORCEMENT_NOTE,
  };
}

/* ── Enrolment ────────────────────────────────────────────────────────── */

function enrollmentFrom(
  userId: string,
  stored: StoredEnrollment | null,
  secretExists: boolean,
  now: number,
): MfaEnrollmentRecord {
  let state: MfaEnrollmentState;
  if (!secretExists) state = "none";
  else if (!stored || !stored.startedAt) state = "unrecorded";
  else if (stored.confirmedAt) state = "confirmed";
  else state = "pending";

  const startedMs = stored?.startedAt ? Date.parse(stored.startedAt) : NaN;
  const stale =
    state === "pending" &&
    !Number.isNaN(startedMs) &&
    now - startedMs > MFA_PENDING_STALE_HOURS * 3_600_000;

  return {
    userId,
    state,
    startedAt: stored?.startedAt ?? null,
    confirmedAt: stored?.confirmedAt ?? null,
    lastVerifiedAt: stored?.lastVerifiedAt ?? null,
    lastMethod: stored?.lastMethod ?? null,
    stale,
    organizationId: stored?.organizationId ?? null,
    note: MFA_ENROLLMENT_NOTE,
  };
}

async function readEnrollment(userId: string): Promise<MfaEnrollmentRecord> {
  const [stored, exists] = await Promise.all([
    redis.get(K.enrollment(userId)).then((r) => parse<StoredEnrollment>(r)),
    redis.exists(K_EXISTING.secret(userId)),
  ]);
  return enrollmentFrom(userId, stored, !!exists, Date.now());
}

async function writeEnrollment(userId: string, patch: Partial<StoredEnrollment>): Promise<StoredEnrollment> {
  const current = parse<StoredEnrollment>(await redis.get(K.enrollment(userId))) ?? {
    userId,
    organizationId: null,
    startedAt: null,
    confirmedAt: null,
    lastVerifiedAt: null,
    lastMethod: null,
  };
  const next: StoredEnrollment = { ...current, ...patch, userId };
  await redis.set(K.enrollment(userId), JSON.stringify(next));
  return next;
}

/* ── Failure counter and lock ─────────────────────────────────────────── */

async function readLock(userId: string): Promise<MfaLockState> {
  const now = Date.now();
  const [failRaw, lockRaw] = await Promise.all([
    redis.get(K.failures(userId)),
    redis.get(K.lock(userId)),
  ]);
  const lock = parse<StoredLock>(lockRaw);
  const fail = parse<StoredFailures>(failRaw);

  // A lock whose deadline has passed is simply not a lock; it is reported as
  // expired rather than deleted here, because a read path that mutates state
  // makes the ledger depend on who looked at it.
  const lockedUntilMs = lock ? Date.parse(lock.lockedUntil) : NaN;
  const locked = !!lock && !Number.isNaN(lockedUntilMs) && lockedUntilMs > now;

  // Failures age out of the window; an old burst does not follow a user around.
  const firstMs = fail ? Date.parse(fail.firstAt) : NaN;
  const windowLive = !!fail && !Number.isNaN(firstMs) && now - firstMs < MFA_FAILURE_WINDOW_SECONDS * 1000;
  const failedAttempts = windowLive ? fail!.count : 0;

  return {
    userId,
    locked,
    failedAttempts,
    remainingAttempts: Math.max(0, MFA_MAX_FAILED_ATTEMPTS - failedAttempts),
    firstFailureAt: windowLive ? fail!.firstAt : null,
    lastFailureAt: windowLive ? fail!.lastAt : null,
    lockedAt: locked ? lock!.lockedAt : null,
    lockedUntil: locked ? lock!.lockedUntil : null,
    retryAfterSeconds: locked ? mfaLockRemainingSeconds(lock!.lockedUntil, now) : 0,
    maxAttempts: MFA_MAX_FAILED_ATTEMPTS,
    windowSeconds: MFA_FAILURE_WINDOW_SECONDS,
    note: MFA_LOCKOUT_NOTE,
  };
}

async function clearFailures(userId: string): Promise<void> {
  await redis.del(K.failures(userId));
  await redis.del(K.lock(userId));
}

/* ── Exemptions ───────────────────────────────────────────────────────── */

function exemptionFrom(stored: StoredExemption, now: number): MfaExemption {
  const expiresMs = Date.parse(stored.expiresAt);
  return {
    organizationId: stored.organizationId,
    userId: stored.userId,
    reason: stored.reason,
    grantedBy: stored.grantedBy,
    grantedAt: stored.grantedAt,
    expiresAt: stored.expiresAt,
    active: !Number.isNaN(expiresMs) && expiresMs > now,
    note: MFA_EXEMPTION_NOTE,
  };
}

async function readExemption(org: string, userId: string): Promise<MfaExemption | null> {
  const stored = parse<StoredExemption>(await redis.get(K.exemption(org, userId)));
  if (!stored) return null;
  return exemptionFrom(stored, Date.now());
}

/* ── Coverage plumbing ────────────────────────────────────────────────── */

type MemberRow = { userId: string; email: string | null; role: string; joinedAt: string | null };

/**
 * The organization's members, from Postgres. Capped: a report that quietly
 * walks an unbounded membership list is a latency incident waiting for the
 * first large tenant, and a report that silently truncates is worse. The cap is
 * applied here and stated in the payload.
 */
async function listMembers(org: string, cap: number): Promise<{ rows: MemberRow[]; total: number }> {
  const [total, memberships] = await Promise.all([
    prisma.membership.count({ where: { organizationId: org } }),
    prisma.membership.findMany({
      where: { organizationId: org },
      orderBy: { joinedAt: "asc" },
      take: cap,
      include: { user: true },
    }),
  ]);
  const rows: MemberRow[] = [];
  const seen = new Set<string>();
  for (const m of memberships as any[]) {
    if (!m?.userId || seen.has(m.userId)) continue; // a user may hold several workspace memberships
    seen.add(m.userId);
    rows.push({
      userId: m.userId,
      email: m.user?.email ?? null,
      role: String(m.role ?? "MEMBER"),
      joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
    });
  }
  return { rows, total: typeof total === "number" ? total : rows.length };
}

async function memberCoverage(
  org: string,
  member: MemberRow,
  policy: MfaOrgPolicy,
  now: number,
): Promise<MfaMemberCoverage> {
  const [status, enrollment, lock, exemption] = await Promise.all([
    MfaService.status(member.userId),
    readEnrollment(member.userId),
    readLock(member.userId),
    readExemption(org, member.userId),
  ]);
  const required = mfaPolicyRequiresRole(policy.mode, member.role);
  const graceEndsAt = required ? mfaGraceDeadline(policy.updatedAt, member.joinedAt, policy.graceDays) : null;
  const graceExpired = isMfaGraceExpired(graceEndsAt, now);
  const exempt = !!exemption?.active;
  const compliance = mfaComplianceState({
    required,
    enrolled: status.enabled,
    enrollmentState: enrollment.state,
    exempt,
    graceExpired,
  });
  const health = mfaRecoveryHealth(status.recoveryCodesRemaining, policy.recoveryCodeFloor);
  return {
    userId: member.userId,
    email: member.email,
    membershipRole: member.role,
    required,
    enrolled: status.enabled,
    enrollmentState: enrollment.state,
    confirmedAt: enrollment.confirmedAt,
    lastVerifiedAt: enrollment.lastVerifiedAt,
    recoveryCodesRemaining: status.recoveryCodesRemaining,
    recoveryLow: status.enabled && (health.low || health.exhausted),
    locked: lock.locked,
    exemptUntil: exempt ? exemption!.expiresAt : null,
    graceEndsAt,
    graceExpired,
    compliance,
  };
}

function countCompliance(members: MfaMemberCoverage[]): MfaComplianceCounts {
  const counts = emptyMfaComplianceCounts();
  for (const m of members) counts[m.compliance] += 1;
  return counts;
}

function coverageRatio(members: MfaMemberCoverage[]): number | null {
  const required = members.filter((m) => m.required);
  if (!required.length) return null;
  const covered = required.filter((m) => m.compliance === "covered").length;
  return Math.round((covered / required.length) * 1000) / 1000;
}

async function buildCoverage(org: string, cap: number): Promise<MfaCoverageReport> {
  const now = Date.now();
  const policy = await loadPolicy(org);
  const { rows, total } = await listMembers(org, cap);
  const members: MfaMemberCoverage[] = [];
  for (const row of rows) members.push(await memberCoverage(org, row, policy, now));
  return {
    organizationId: org,
    policy,
    membersConsidered: members.length,
    membersTotal: total,
    truncated: total > members.length,
    counts: countCompliance(members),
    requiredCoverageRatio: coverageRatio(members),
    members,
    generatedAt: new Date(now).toISOString(),
    note: MFA_COVERAGE_NOTE,
    enrollmentNote: MFA_ENROLLMENT_NOTE,
  };
}

/* ── Service ──────────────────────────────────────────────────────────── */

export const MfaAssuranceService = {
  /* ── Policy ─────────────────────────────────────────────────────────── */

  async getPolicy(org: string): Promise<MfaOrgPolicy> {
    return loadPolicy(org);
  },

  /**
   * Save the policy.
   *
   * Turning on `block_after_grace` is refused when the administrator making the
   * change would themselves be blocked by it. Without that check one request
   * from an unenrolled owner locks every administrator out of the organization
   * with nobody left able to switch it back (MFA_SELF_LOCKOUT_NOTE).
   */
  async setPolicy(
    org: string,
    input: MfaPolicyUpdateInput,
    actor: { id: string; membershipRole?: string | null },
  ): Promise<MfaOrgPolicy> {
    const current = await loadPolicy(org);
    const next: MfaOrgPolicy = {
      ...current,
      ...input,
      organizationId: org,
      updatedAt: nowIso(),
      updatedBy: actor.id,
      source: "stored",
      note: MFA_POLICY_NOTE,
      enforcementNote: MFA_ENFORCEMENT_NOTE,
    };

    const turningOnBlocking =
      next.enforcement === "block_after_grace" && current.enforcement !== "block_after_grace";
    if (turningOnBlocking) {
      const role = actor.membershipRole ?? (await resolveMembershipRole(actor.id, org));
      const wouldCover = mfaPolicyRequiresRole(next.mode, role ?? "MEMBER");
      if (wouldCover) {
        const [status, enrollment, exemption] = await Promise.all([
          MfaService.status(actor.id),
          readEnrollment(actor.id),
          readExemption(org, actor.id),
        ]);
        const covered =
          status.enabled && (enrollment.state === "confirmed" || enrollment.state === "unrecorded");
        if (!covered && !exemption?.active) {
          throw AppError.badRequest(
            "Blocking enforcement cannot be switched on from an account that would itself be blocked. Enrol this account in MFA first, or record an exemption for it. " +
              MFA_SELF_LOCKOUT_NOTE,
          );
        }
      }
    }

    await redis.set(K.policy(org), JSON.stringify(next));
    await appendEvent({
      kind: "policy_updated",
      organizationId: org,
      actorId: actor.id,
      reason: `mode=${next.mode} enforcement=${next.enforcement}`,
      detail: {
        mode: next.mode,
        enforcement: next.enforcement,
        graceDays: next.graceDays,
        recoveryCodeFloor: next.recoveryCodeFloor,
        allowRecoveryCodes: next.allowRecoveryCodes,
        previousMode: current.mode,
        previousEnforcement: current.enforcement,
      },
    });
    return next;
  },

  /* ── Enrolment lifecycle ────────────────────────────────────────────── */

  /** Called by `POST /mfa/enable` after the secret has actually been issued. */
  async recordEnrollmentStarted(userId: string, org: string | null): Promise<MfaEnrollmentRecord> {
    await writeEnrollment(userId, {
      organizationId: org,
      startedAt: nowIso(),
      confirmedAt: null,
      lastVerifiedAt: null,
      lastMethod: null,
    });
    await appendEvent({ kind: "enrollment_started", userId, organizationId: org });
    return readEnrollment(userId);
  },

  /** Called after any verification succeeds, so a pending enrolment closes. */
  async recordEnrollmentConfirmed(
    userId: string,
    org: string | null,
    method: MfaVerifyMethod,
  ): Promise<MfaEnrollmentRecord> {
    const current = parse<StoredEnrollment>(await redis.get(K.enrollment(userId)));
    const firstConfirmation = !current?.confirmedAt;
    await writeEnrollment(userId, {
      organizationId: org ?? current?.organizationId ?? null,
      confirmedAt: current?.confirmedAt ?? nowIso(),
      lastVerifiedAt: nowIso(),
      lastMethod: method,
    });
    if (firstConfirmation) {
      await appendEvent({ kind: "enrollment_confirmed", userId, organizationId: org, method });
    }
    return readEnrollment(userId);
  },

  async getEnrollment(userId: string): Promise<MfaEnrollmentRecord> {
    return readEnrollment(userId);
  },

  /**
   * Walk out of an enrolment that was started and never confirmed.
   *
   * This is the escape hatch the module never had: `POST /mfa/enable` wrote the
   * secret immediately, so a user who closed the tab before scanning was locked
   * behind a code they could not produce. Only a *pending* enrolment can be
   * abandoned — a confirmed one still requires a valid token through
   * `POST /mfa/disable`, which is unchanged.
   */
  async abandonEnrollment(
    userId: string,
    org: string | null,
  ): Promise<{ cleared: boolean; enrollment: MfaEnrollmentRecord; reason: string }> {
    const enrollment = await readEnrollment(userId);
    if (enrollment.state !== "pending") {
      return {
        cleared: false,
        enrollment,
        reason:
          enrollment.state === "confirmed" || enrollment.state === "unrecorded"
            ? "Enrolment is already confirmed; disable it with a valid code instead."
            : "There is no pending enrolment to abandon.",
      };
    }
    await MfaService.disable(userId);
    await redis.del(K.enrollment(userId));
    await clearFailures(userId);
    await appendEvent({
      kind: "enrollment_abandoned",
      userId,
      organizationId: org,
      reason: "pending_enrollment_abandoned_by_user",
    });
    return {
      cleared: true,
      enrollment: await readEnrollment(userId),
      reason: "Pending enrolment cleared. The secret and its recovery codes were discarded.",
    };
  },

  /** Called by `POST /mfa/disable` after the service has cleared the secret. */
  async recordDisabled(userId: string, org: string | null, actorId: string | null): Promise<void> {
    await redis.del(K.enrollment(userId));
    await clearFailures(userId);
    await appendEvent({ kind: "mfa_disabled", userId, organizationId: org, actorId });
  },

  async recordRecoveryRegenerated(userId: string, org: string | null): Promise<void> {
    await appendEvent({
      kind: "recovery_codes_regenerated",
      userId,
      organizationId: org,
      detail: { issued: MFA_RECOVERY_CODE_COUNT },
    });
  },

  /* ── Gate and attempt recording ─────────────────────────────────────── */

  /**
   * Decide whether a verification may even be attempted, before the token is
   * checked against the secret. Three refusals live here: an engaged lock, a
   * TOTP already used inside its live window, and a recovery code offered to an
   * organization whose policy does not accept them.
   */
  async gate(input: {
    userId: string;
    organizationId?: string | null;
    token: string;
  }): Promise<MfaAttemptGate> {
    const kind = mfaTokenKind(input.token);
    const lock = await readLock(input.userId);

    if (lock.locked) {
      return {
        allowed: false,
        reason: "locked",
        message: `Too many failed verification attempts. Try again in ${lock.retryAfterSeconds}s.`,
        tokenKind: kind,
        lock,
      };
    }

    if (kind === "recovery" && input.organizationId) {
      const policy = await loadPolicy(input.organizationId);
      if (!policy.allowRecoveryCodes) {
        return {
          allowed: false,
          reason: "recovery_codes_disabled",
          message: "This organization's policy does not accept recovery codes; use your authenticator app.",
          tokenKind: kind,
          lock,
        };
      }
    }

    if (kind === "totp") {
      const key = K.usedToken(input.userId, tokenDigest(input.token));
      const seen = await redis.get(key);
      if (seen) {
        return {
          allowed: false,
          reason: "replayed",
          message: "That code has already been used. Wait for your authenticator to show the next one.",
          tokenKind: kind,
          lock,
        };
      }
    }

    return { allowed: true, reason: "ok", message: null, tokenKind: kind, lock };
  },

  /**
   * Record the outcome of a verification the service actually performed.
   *
   * On success the failure counter is cleared, a used TOTP is marked for as long
   * as it stays live, and a pending enrolment closes. On failure the counter
   * advances inside its window and the lock engages at the threshold.
   */
  async recordVerification(input: {
    userId: string;
    organizationId?: string | null;
    token: string;
    ok: boolean;
    method?: MfaVerifyMethod | null;
    reason?: string | null;
  }): Promise<MfaLockState> {
    const org = input.organizationId ?? null;
    const kind = mfaTokenKind(input.token);

    if (input.ok) {
      if (kind === "totp") {
        // Mark the code used. NX is honoured by real Redis and by the repo's
        // FakeKv; the read in gate() covers stores that ignore it.
        await redis.set(
          K.usedToken(input.userId, tokenDigest(input.token)),
          nowIso(),
          "EX",
          MFA_REPLAY_GUARD_SECONDS,
          "NX",
        );
      }
      await clearFailures(input.userId);
      const method: MfaVerifyMethod = input.method ?? (kind === "recovery" ? "recovery" : "totp");
      await this.recordEnrollmentConfirmed(input.userId, org, method);
      await appendEvent({
        kind: "verification_succeeded",
        userId: input.userId,
        organizationId: org,
        method,
      });
      if (method === "recovery") {
        const remaining = await redis.scard(K_EXISTING.recovery(input.userId));
        await appendEvent({
          kind: "recovery_code_used",
          userId: input.userId,
          organizationId: org,
          method: "recovery",
          detail: { remaining },
        });
      }
      return readLock(input.userId);
    }

    const now = Date.now();
    const existing = parse<StoredFailures>(await redis.get(K.failures(input.userId)));
    const firstMs = existing ? Date.parse(existing.firstAt) : NaN;
    const windowLive = !!existing && !Number.isNaN(firstMs) && now - firstMs < MFA_FAILURE_WINDOW_SECONDS * 1000;
    const next: StoredFailures = {
      count: (windowLive ? existing!.count : 0) + 1,
      firstAt: windowLive ? existing!.firstAt : new Date(now).toISOString(),
      lastAt: new Date(now).toISOString(),
    };
    await redis.set(K.failures(input.userId), JSON.stringify(next), "EX", MFA_FAILURE_WINDOW_SECONDS);
    await appendEvent({
      kind: "verification_failed",
      userId: input.userId,
      organizationId: org,
      reason: input.reason ?? "verification_failed",
      detail: { failedAttempts: next.count, tokenKind: kind },
    });

    if (next.count >= MFA_MAX_FAILED_ATTEMPTS) {
      const lock: StoredLock = {
        lockedAt: new Date(now).toISOString(),
        lockedUntil: new Date(now + MFA_LOCKOUT_SECONDS * 1000).toISOString(),
        failedAttempts: next.count,
      };
      await redis.set(K.lock(input.userId), JSON.stringify(lock), "EX", MFA_LOCKOUT_SECONDS);
      await appendEvent({
        kind: "account_locked",
        userId: input.userId,
        organizationId: org,
        reason: `failed_attempts_${next.count}`,
        detail: { lockedUntil: lock.lockedUntil, lockoutSeconds: MFA_LOCKOUT_SECONDS },
      });
    }
    return readLock(input.userId);
  },

  /** Record a verification refused by the gate before the secret was consulted. */
  async recordBlocked(input: {
    userId: string;
    organizationId?: string | null;
    reason: string;
  }): Promise<void> {
    await appendEvent({
      kind: "verification_blocked",
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      reason: input.reason,
    });
  },

  async lockState(userId: string): Promise<MfaLockState> {
    return readLock(userId);
  },

  /** Administrator lifts a lock early. The lift itself is recorded. */
  async clearLock(org: string, userId: string, actorId: string | null): Promise<MfaLockState> {
    const before = await readLock(userId);
    await clearFailures(userId);
    await appendEvent({
      kind: "lock_cleared",
      userId,
      organizationId: org,
      actorId,
      detail: { wasLocked: before.locked, failedAttempts: before.failedAttempts },
    });
    return readLock(userId);
  },

  /** Members of this organization whose verification is currently throttled. */
  async listLocks(org: string): Promise<{
    organizationId: string;
    locks: Array<MfaLockState & { email: string | null }>;
    membersConsidered: number;
    truncated: boolean;
    note: string;
  }> {
    const { rows, total } = await listMembers(org, MFA_MAX_COVERAGE_MEMBERS);
    const locks: Array<MfaLockState & { email: string | null }> = [];
    for (const row of rows) {
      const lock = await readLock(row.userId);
      if (lock.locked || lock.failedAttempts > 0) locks.push({ ...lock, email: row.email });
    }
    return {
      organizationId: org,
      locks,
      membersConsidered: rows.length,
      truncated: total > rows.length,
      note: MFA_LOCKOUT_NOTE,
    };
  },

  /* ── Exemptions ─────────────────────────────────────────────────────── */

  async grantExemption(
    org: string,
    input: { userId: string; reason: string; days: number },
    actorId: string | null,
  ): Promise<MfaExemption> {
    const member = await prisma.membership.findFirst({
      where: { organizationId: org, userId: input.userId },
    });
    if (!member) {
      throw AppError.notFound("That user is not a member of this organization.");
    }
    const stored: StoredExemption = {
      organizationId: org,
      userId: input.userId,
      reason: input.reason,
      grantedBy: actorId,
      grantedAt: nowIso(),
      expiresAt: new Date(Date.now() + input.days * 86_400_000).toISOString(),
    };
    await redis.set(K.exemption(org, input.userId), JSON.stringify(stored));
    await redis.sadd(K.exemptionIdx(org), input.userId);
    await appendEvent({
      kind: "exemption_granted",
      userId: input.userId,
      organizationId: org,
      actorId,
      reason: input.reason,
      detail: { expiresAt: stored.expiresAt, days: input.days },
    });
    return exemptionFrom(stored, Date.now());
  },

  async revokeExemption(org: string, userId: string, actorId: string | null): Promise<{ revoked: boolean }> {
    const existing = await redis.get(K.exemption(org, userId));
    await redis.del(K.exemption(org, userId));
    await redis.srem(K.exemptionIdx(org), userId);
    if (existing) {
      await appendEvent({ kind: "exemption_revoked", userId, organizationId: org, actorId });
    }
    return { revoked: !!existing };
  },

  async listExemptions(org: string): Promise<{ exemptions: MfaExemption[]; note: string }> {
    const ids = await redis.smembers(K.exemptionIdx(org));
    const now = Date.now();
    const out: MfaExemption[] = [];
    for (const id of ids) {
      const stored = parse<StoredExemption>(await redis.get(K.exemption(org, id)));
      if (!stored) continue;
      out.push(exemptionFrom(stored, now));
    }
    out.sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
    return { exemptions: out, note: MFA_EXEMPTION_NOTE };
  },

  /* ── Coverage, summary, gaps ────────────────────────────────────────── */

  async coverage(
    org: string,
    query: { compliance?: MfaComplianceState; limit?: number } = {},
  ): Promise<MfaCoverageReport> {
    const report = await buildCoverage(org, Math.min(query.limit ?? MFA_MAX_COVERAGE_MEMBERS, MFA_MAX_COVERAGE_MEMBERS));
    if (!query.compliance) return report;
    // The counts describe every member considered; only the listing is filtered,
    // so a filtered view cannot be mistaken for a smaller organization.
    return { ...report, members: report.members.filter((m) => m.compliance === query.compliance) };
  },

  async summary(org: string): Promise<MfaAssuranceSummary> {
    const report = await buildCoverage(org, MFA_MAX_COVERAGE_MEMBERS);
    const now = Date.now();
    let staleEnrollments = 0;
    for (const m of report.members) {
      if (m.compliance !== "enrollment_pending") continue;
      const enrollment = await readEnrollment(m.userId);
      if (enrollment.stale) staleEnrollments += 1;
    }
    const exemptions = await this.listExemptions(org);
    const events = await readEvents(K.orgEvents(org), MFA_EVENT_LIMIT);
    return {
      organizationId: org,
      policy: report.policy,
      counts: report.counts,
      membersConsidered: report.membersConsidered,
      membersTotal: report.membersTotal,
      truncated: report.truncated,
      requiredCoverageRatio: report.requiredCoverageRatio,
      activeLocks: report.members.filter((m) => m.locked).length,
      activeExemptions: exemptions.exemptions.filter((e) => e.active).length,
      pendingEnrollments: report.members.filter((m) => m.enrollmentState === "pending").length,
      staleEnrollments,
      recoveryLowMembers: report.members.filter((m) => m.recoveryLow).length,
      recentEvents: events.length,
      generatedAt: new Date(now).toISOString(),
      note: MFA_POLICY_NOTE,
      coverageNote: MFA_COVERAGE_NOTE,
      ledgerNote: MFA_LEDGER_NOTE,
    };
  },

  /** The concrete, individually addressable problems visible right now. */
  async gaps(org: string): Promise<MfaGapReport> {
    const report = await buildCoverage(org, MFA_MAX_COVERAGE_MEMBERS);
    const gaps: MfaGap[] = [];
    for (const m of report.members) {
      if (m.compliance === "not_enrolled") {
        gaps.push({
          kind: "member_not_enrolled",
          userId: m.userId,
          email: m.email,
          detail: `Required by policy, not enrolled, grace ended ${m.graceEndsAt ?? "n/a"}.`,
          severity: "high",
        });
      } else if (m.compliance === "in_grace") {
        gaps.push({
          kind: "member_in_grace",
          userId: m.userId,
          email: m.email,
          detail: `Required by policy, not enrolled; grace ends ${m.graceEndsAt ?? "n/a"}.`,
          severity: "medium",
        });
      } else if (m.compliance === "enrollment_pending") {
        gaps.push({
          kind: "enrollment_pending",
          userId: m.userId,
          email: m.email,
          detail: "A secret was issued but no verification has ever succeeded against it.",
          severity: "medium",
        });
      }
      if (m.enrolled && m.recoveryCodesRemaining === 0) {
        gaps.push({
          kind: "recovery_codes_exhausted",
          userId: m.userId,
          email: m.email,
          detail: "No unused recovery codes remain; a lost authenticator means an administrator reset.",
          severity: "high",
        });
      } else if (m.recoveryLow) {
        gaps.push({
          kind: "recovery_codes_low",
          userId: m.userId,
          email: m.email,
          detail: `${m.recoveryCodesRemaining} unused recovery code(s) remain, at or below the configured floor of ${report.policy.recoveryCodeFloor}.`,
          severity: "low",
        });
      }
      if (m.locked) {
        gaps.push({
          kind: "account_locked",
          userId: m.userId,
          email: m.email,
          detail: "Verification is currently throttled after repeated failures.",
          severity: "medium",
        });
      }
      if (m.exemptUntil) {
        const days = (Date.parse(m.exemptUntil) - Date.now()) / 86_400_000;
        if (days <= 7) {
          gaps.push({
            kind: "exemption_expiring",
            userId: m.userId,
            email: m.email,
            detail: `Exemption expires ${m.exemptUntil}; the member becomes non-compliant on that date.`,
            severity: "low",
          });
        }
      }
    }
    const counts = { high: 0, medium: 0, low: 0 };
    for (const g of gaps) counts[g.severity] += 1;
    return {
      organizationId: org,
      gaps,
      counts,
      membersConsidered: report.membersConsidered,
      truncated: report.truncated,
      generatedAt: nowIso(),
      note: MFA_GAP_NOTE,
    };
  },

  /** What the signed-in member sees about their own second factor. */
  async selfView(userId: string, org: string | null, membershipRole?: string | null): Promise<MfaSelfView> {
    const policy = org ? await loadPolicy(org) : defaultMfaPolicy("");
    const [status, enrollment, lock] = await Promise.all([
      MfaService.status(userId),
      readEnrollment(userId),
      readLock(userId),
    ]);
    const role = membershipRole ?? (org ? await resolveMembershipRole(userId, org) : null);
    const required = org ? mfaPolicyRequiresRole(policy.mode, role ?? "MEMBER") : false;
    const joinedAt = org ? await resolveJoinedAt(userId, org) : null;
    const graceEndsAt = required ? mfaGraceDeadline(policy.updatedAt, joinedAt, policy.graceDays) : null;
    const exemption = org ? await readExemption(org, userId) : null;
    return {
      userId,
      organizationId: org,
      enabled: status.enabled,
      enrollment,
      recovery: mfaRecoveryHealth(status.recoveryCodesRemaining, policy.recoveryCodeFloor),
      lock,
      policy,
      required,
      compliance: mfaComplianceState({
        required,
        enrolled: status.enabled,
        enrollmentState: enrollment.state,
        exempt: !!exemption?.active,
        graceExpired: isMfaGraceExpired(graceEndsAt),
      }),
      graceEndsAt,
      exemptUntil: exemption?.active ? exemption.expiresAt : null,
    };
  },

  async recoveryHealth(userId: string, org: string | null): Promise<MfaRecoveryHealth> {
    const policy = org ? await loadPolicy(org) : defaultMfaPolicy("");
    const status = await MfaService.status(userId);
    return mfaRecoveryHealth(status.recoveryCodesRemaining, policy.recoveryCodeFloor);
  },

  /* ── Login enforcement ──────────────────────────────────────────────── */

  /**
   * The decision the login path asks for. `report_only` — the default and the
   * platform's historical behaviour — always allows and says why in `reason`.
   */
  async evaluateLogin(input: {
    userId: string;
    organizationId: string | null;
    membershipRole?: string | null;
    joinedAt?: string | null;
  }): Promise<MfaLoginDecision> {
    if (!input.organizationId) {
      return {
        userId: input.userId,
        organizationId: null,
        required: false,
        compliance: "not_required",
        enforcement: "report_only",
        graceEndsAt: null,
        decision: "allow",
        reason: "no_organization_context",
        note: MFA_ENFORCEMENT_NOTE,
      };
    }
    const org = input.organizationId;
    const policy = await loadPolicy(org);
    const role = input.membershipRole ?? (await resolveMembershipRole(input.userId, org));
    const required = mfaPolicyRequiresRole(policy.mode, role ?? "MEMBER");
    const [status, enrollment, exemption] = await Promise.all([
      MfaService.status(input.userId),
      readEnrollment(input.userId),
      readExemption(org, input.userId),
    ]);
    const joinedAt = input.joinedAt ?? (await resolveJoinedAt(input.userId, org));
    const graceEndsAt = required ? mfaGraceDeadline(policy.updatedAt, joinedAt, policy.graceDays) : null;
    const compliance = mfaComplianceState({
      required,
      enrolled: status.enabled,
      enrollmentState: enrollment.state,
      exempt: !!exemption?.active,
      graceExpired: isMfaGraceExpired(graceEndsAt),
    });
    const block = policy.enforcement === "block_after_grace" && compliance === "not_enrolled";
    return {
      userId: input.userId,
      organizationId: org,
      required,
      compliance,
      enforcement: policy.enforcement,
      graceEndsAt,
      decision: block ? "block" : "allow",
      reason: block
        ? "mfa_required_grace_expired"
        : policy.enforcement === "report_only" && required && compliance !== "covered"
          ? "non_compliant_but_enforcement_is_report_only"
          : "compliant_or_not_required",
      note: MFA_ENFORCEMENT_NOTE,
    };
  },

  async recordLoginBlocked(userId: string, org: string | null, reason: string): Promise<void> {
    await appendEvent({ kind: "login_blocked", userId, organizationId: org, reason });
  },

  /* ── Ledger reads ───────────────────────────────────────────────────── */

  async events(org: string, query: { limit?: number; kind?: MfaEventKind } = {}): Promise<MfaEventPage> {
    const limit = query.limit ?? 50;
    const events = await readEvents(K.orgEvents(org), limit, query.kind);
    return { events, returned: events.length, limit, scope: "organization", note: MFA_LEDGER_NOTE };
  },

  async memberEvents(userId: string, query: { limit?: number; kind?: MfaEventKind } = {}): Promise<MfaEventPage> {
    const limit = query.limit ?? 50;
    const events = await readEvents(K.memberEvents(userId), limit, query.kind);
    return { events, returned: events.length, limit, scope: "member", note: MFA_LEDGER_NOTE };
  },

  /* ── Configuration ──────────────────────────────────────────────────── */

  /**
   * What this deployment is configured to do. No network call, no probe: the
   * TOTP parameters are the constants the service compiles against, and the key
   * source is whether the environment variable is present — never its value.
   */
  configuration(): MfaConfigurationReport {
    const keyConfigured = !!env.WINDELS_ENCRYPTION_KEY;
    return {
      totp: {
        algorithm: MFA_TOTP_ALGORITHM,
        digits: MFA_TOTP_DIGITS,
        periodSeconds: MFA_TOTP_PERIOD_SECONDS,
        driftWindows: MFA_TOTP_DRIFT_WINDOWS,
        liveSeconds: MFA_TOTP_LIVE_SECONDS,
        vectorsPinned: true,
      },
      recoveryCodes: {
        issuedPerEnrollment: MFA_RECOVERY_CODE_COUNT,
        storage: "sha256_digest",
        lowWatermark: MFA_RECOVERY_LOW_WATERMARK,
      },
      secretStorage: {
        at: "redis",
        encryption: "aes-256-gcm",
        keyConfigured,
        keySource: keyConfigured ? "environment" : "development_fallback",
      },
      throttle: {
        maxFailedAttempts: MFA_MAX_FAILED_ATTEMPTS,
        windowSeconds: MFA_FAILURE_WINDOW_SECONDS,
        lockoutSeconds: MFA_LOCKOUT_SECONDS,
        wiredInto: [
          "POST /api/v1/mfa/verify",
          "POST /api/v1/mfa/confirm",
          "POST /api/v1/mfa/disable",
          "POST /api/v1/mfa/recovery-codes",
          "POST /api/v1/auth/mfa/complete",
        ],
      },
      replayGuard: {
        enabled: true,
        seconds: MFA_REPLAY_GUARD_SECONDS,
        wiredInto: ["POST /api/v1/mfa/verify", "POST /api/v1/mfa/confirm", "POST /api/v1/auth/mfa/complete"],
      },
      ledger: { perOrganizationLimit: MFA_EVENT_LIMIT, perMemberLimit: MFA_EVENT_LIMIT },
      note: MFA_REPLAY_NOTE,
      configNote: MFA_CONFIG_NOTE,
    };
  },
};

/* ── Membership lookups ───────────────────────────────────────────────── */

async function resolveMembershipRole(userId: string, org: string): Promise<string | null> {
  try {
    const m = await prisma.membership.findFirst({ where: { userId, organizationId: org } });
    return m ? String((m as any).role ?? "MEMBER") : null;
  } catch {
    // A database hiccup must not turn into a policy decision. The caller treats
    // a null role as MEMBER, which is the least privileged reading.
    return null;
  }
}

async function resolveJoinedAt(userId: string, org: string): Promise<string | null> {
  try {
    const m = await prisma.membership.findFirst({ where: { userId, organizationId: org } });
    const joined = (m as any)?.joinedAt;
    return joined ? new Date(joined).toISOString() : null;
  } catch {
    return null;
  }
}

/** Exported for the runtime-validation checklist and the namespace sweep. */
export const MFA_ASSURANCE_KEYS = K;
export const MFA_DEFAULT_GRACE = MFA_DEFAULT_GRACE_DAYS;
