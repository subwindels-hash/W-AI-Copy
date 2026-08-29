// Session 116 — Multi-factor authentication: assurance, policy and audit.
//
// WHAT ALREADY EXISTED (and is untouched here)
// --------------------------------------------
// `apps/api/src/services/mfa.service.ts` is a hand-rolled RFC 6238 TOTP
// implementation whose generator is pinned against the RFC's own published test
// vectors, stores the shared secret encrypted with AES-256-GCM, and keeps
// recovery codes only as SHA-256 digests. Six routes drive it (status, enable,
// confirm, verify, disable, recovery-codes) and `services/auth.service.ts`
// issues a five-minute challenge at login. That part works and is not rewritten.
//
// WHAT WAS MISSING — the gap this contract closes
// ------------------------------------------------
//   - **No throttle.** Nothing counted failed second-factor attempts. A 6-digit
//     TOTP accepted across a ±1 period window is 3 codes in 1 000 000 per try;
//     unlimited tries turns that into an arithmetic problem rather than a
//     security control. `POST /auth/mfa/complete` carried a per-IP login limit
//     only, which a distributed client walks straight past.
//   - **No replay defence.** RFC 6238 §5.2 requires a verifier to reject the
//     second presentation of an OTP. Nothing did: a code observed over the
//     shoulder or captured from a proxy stayed usable for the rest of its ~90s
//     validity.
//   - **Enrolment was never confirmed.** `POST /mfa/enable` wrote the secret and
//     the `enforced` flag immediately, so the next login demanded a code the
//     user might never have successfully scanned. `POST /mfa/confirm` verified a
//     token and then recorded nothing — confirming was a no-op.
//   - **No policy.** An organization could not require a second factor, and the
//     `mfa:enforced:<user>` key that sounded like enforcement was written on
//     enable, read by nothing, and only ever mirrored "enabled".
//   - **No coverage.** No answer to "who in this organization has MFA?", which
//     is the first question every security questionnaire asks.
//   - **No audit trail.** A second factor with no record of enrolments,
//     failures, lockouts, recovery-code use or administrative changes.
//
// HONESTY RULES ENCODED HERE
// --------------------------
//   - Coverage counts users this deployment can actually see: members of the
//     organization in Postgres, capped, with the cap reported. A user whose
//     secret predates this ledger is reported `unrecorded`, never "confirmed" —
//     we do not know whether they ever completed a verification, so we do not
//     say (MFA_ENROLLMENT_NOTE).
//   - A policy in `report_only` mode blocks nothing, and the payload says so in
//     those words. Only `block_after_grace` refuses a login, only after the
//     grace deadline, and never for an exempt account (MFA_ENFORCEMENT_NOTE).
//   - The lockout is a throttle on this deployment's own verification paths. It
//     is not a claim about the attacker's total budget: a determined caller
//     still gets MFA_MAX_FAILED_ATTEMPTS tries per window (MFA_LOCKOUT_NOTE).
//   - The replay guard covers the window a code is valid for and no longer; it
//     is a per-user marker in Redis, so it is exactly as durable as Redis is
//     (MFA_REPLAY_NOTE).
//   - The configuration report reads this process's environment. It reports
//     "configured", never "verified" (MFA_CONFIG_NOTE).
//   - The ledger describes events recorded since it was introduced. Nothing
//     before it is reconstructed or estimated (MFA_LEDGER_NOTE).

import { z } from "zod";

/* ── TOTP parameters ───────────────────────────────────────────────────── */

/**
 * The parameters `services/mfa.service.ts` actually implements. They are
 * restated here so the console and the configuration report can show them
 * without importing server code; `mfaAssurance.test.ts` asserts the service's
 * own otpauth URL carries these values, so a drift is a test failure rather
 * than a stale document.
 */
export const MFA_TOTP_PERIOD_SECONDS = 30;
export const MFA_TOTP_DIGITS = 6;
export const MFA_TOTP_ALGORITHM = "SHA1";
/** ±1 period of clock drift is tolerated, so three codes are live at any time. */
export const MFA_TOTP_DRIFT_WINDOWS = 1;
/** How long a single TOTP stays acceptable: the drift window either side. */
export const MFA_TOTP_LIVE_SECONDS =
  MFA_TOTP_PERIOD_SECONDS * (2 * MFA_TOTP_DRIFT_WINDOWS + 1);

/* ── Limits ────────────────────────────────────────────────────────────── */

/** `MfaService.enable()` issues exactly this many recovery codes. */
export const MFA_RECOVERY_CODE_COUNT = 10;
/** Below this, the console warns; the policy floor is configurable separately. */
export const MFA_RECOVERY_LOW_WATERMARK = 3;
/** Failed verifications tolerated inside one window before the lock engages. */
export const MFA_MAX_FAILED_ATTEMPTS = 5;
/** How long a lock lasts once engaged. */
export const MFA_LOCKOUT_SECONDS = 900;
/** Failures older than this no longer count towards the lock. */
export const MFA_FAILURE_WINDOW_SECONDS = 900;
/** A used TOTP stays refused for as long as it would otherwise be live. */
export const MFA_REPLAY_GUARD_SECONDS = MFA_TOTP_LIVE_SECONDS;
/** Ledger depth per organization and per user. */
export const MFA_EVENT_LIMIT = 500;
export const MFA_MAX_EVENT_PAGE = 200;
/** Default grace an organization gives a member to enrol once MFA is required. */
export const MFA_DEFAULT_GRACE_DAYS = 7;
export const MFA_MAX_GRACE_DAYS = 90;
/** A pending enrolment older than this is reported as abandoned-looking. */
export const MFA_PENDING_STALE_HOURS = 24;
/** Coverage walks memberships; beyond this the report says it was truncated. */
export const MFA_MAX_COVERAGE_MEMBERS = 500;
export const MFA_EXEMPTION_MAX_DAYS = 180;
export const MFA_EXEMPTION_REASON_MAX = 500;
/** Recovery codes are 10 uppercase hex-ish characters (`randomUUID` slice). */
export const MFA_RECOVERY_CODE_LENGTH = 10;

/* ── Vocabularies ──────────────────────────────────────────────────────── */

/**
 * Who an organization requires a second factor from.
 *   optional        — nobody is required to enrol (the historical behaviour).
 *   required_admins — organization owners and admins only.
 *   required_all    — every member.
 */
export const MFA_POLICY_MODES = ["optional", "required_admins", "required_all"] as const;
export type MfaPolicyMode = (typeof MFA_POLICY_MODES)[number];
export const MFA_DEFAULT_POLICY_MODE: MfaPolicyMode = "optional";

/**
 * What happens to a member who is required to enrol and has not.
 *   report_only      — nothing. They are listed as non-compliant and can sign in.
 *   block_after_grace — login is refused once the grace deadline has passed.
 */
export const MFA_ENFORCEMENT_MODES = ["report_only", "block_after_grace"] as const;
export type MfaEnforcementMode = (typeof MFA_ENFORCEMENT_MODES)[number];
export const MFA_DEFAULT_ENFORCEMENT: MfaEnforcementMode = "report_only";

/**
 * Enrolment as this ledger knows it.
 *   none       — no secret stored.
 *   pending    — a secret was issued and no verification has succeeded yet.
 *   confirmed  — a verification succeeded after the secret was issued.
 *   unrecorded — a secret exists but predates this ledger, so whether the user
 *                ever completed a verification is genuinely unknown.
 */
export const MFA_ENROLLMENT_STATES = ["none", "pending", "confirmed", "unrecorded"] as const;
export type MfaEnrollmentState = (typeof MFA_ENROLLMENT_STATES)[number];

/**
 * A member's standing against the policy.
 *   not_required       — the policy does not ask this member to enrol.
 *   covered            — enrolled with a confirmed (or pre-ledger) secret.
 *   enrollment_pending — a secret exists but no verification has succeeded.
 *   in_grace           — required, not enrolled, deadline not reached.
 *   not_enrolled       — required, not enrolled, deadline passed.
 *   exempt             — an administrator recorded a documented exemption.
 */
export const MFA_COMPLIANCE_STATES = [
  "covered",
  "not_required",
  "enrollment_pending",
  "in_grace",
  "not_enrolled",
  "exempt",
] as const;
export type MfaComplianceState = (typeof MFA_COMPLIANCE_STATES)[number];

export const MFA_VERIFY_METHODS = ["totp", "recovery"] as const;
export type MfaVerifyMethod = (typeof MFA_VERIFY_METHODS)[number];

/** What a submitted string looks like, before anything is checked against it. */
export const MFA_TOKEN_KINDS = ["totp", "recovery", "unrecognised"] as const;
export type MfaTokenKind = (typeof MFA_TOKEN_KINDS)[number];

/** Why a gate refused, in the words the code itself uses. */
export const MFA_GATE_REASONS = [
  "ok",
  "locked",
  "replayed",
  "recovery_codes_disabled",
] as const;
export type MfaGateReason = (typeof MFA_GATE_REASONS)[number];

export const MFA_EVENT_KINDS = [
  "enrollment_started",
  "enrollment_confirmed",
  "enrollment_abandoned",
  "verification_succeeded",
  "verification_failed",
  "verification_blocked",
  "recovery_code_used",
  "recovery_codes_regenerated",
  "account_locked",
  "lock_cleared",
  "mfa_disabled",
  "policy_updated",
  "exemption_granted",
  "exemption_revoked",
  "login_blocked",
] as const;
export type MfaEventKind = (typeof MFA_EVENT_KINDS)[number];

/* ── Notes shipped in the payloads ─────────────────────────────────────── */

export const MFA_POLICY_NOTE =
  "A policy records what this organization asks of its members. It is applied by the platform's own login and verification paths only — it cannot reach an external identity provider, a VPN, or a device the platform never sees. Setting a mode changes who is counted as required; it does not retroactively enrol anyone.";

export const MFA_ENFORCEMENT_NOTE =
  "report_only blocks nothing: non-compliant members are listed and can still sign in. block_after_grace refuses a password login once the member's grace deadline has passed, and never refuses a member with an active exemption. Enforcement is evaluated on this deployment's login path; a session already issued is not revoked by switching the mode.";

export const MFA_COVERAGE_NOTE =
  "Coverage is computed over the organization's memberships stored in this deployment's database, capped at the reported limit. A member with a stored TOTP secret is counted as enrolled; whether their authenticator app still holds that secret is not something the server can observe. Nothing here is sampled or extrapolated.";

export const MFA_ENROLLMENT_NOTE =
  "Enrolment state is what this ledger recorded. A secret created before the ledger existed is reported 'unrecorded' rather than 'confirmed': the platform genuinely does not know whether that user ever completed a successful verification, and guessing would be the kind of claim this module refuses to make.";

export const MFA_LOCKOUT_NOTE =
  "The lock is a throttle on this deployment's verification endpoints. After the configured number of failures inside the failure window, further attempts are refused until the lock expires. It is not a claim about an attacker's total budget, and it does not lock the underlying account — a password login still reaches the second-factor challenge, which then refuses.";

export const MFA_REPLAY_NOTE =
  "A TOTP that verified successfully is marked used for as long as it would otherwise stay live, so the same code cannot be presented twice. The marker lives in Redis: if Redis loses the key the guard silently stops covering that code, which is why the guard is reported as a control rather than a guarantee.";

export const MFA_RECOVERY_NOTE =
  "Recovery codes are stored only as SHA-256 digests and are consumed on use. The remaining count is the number of unused digests, not proof the user still has the printed list. Regenerating replaces the whole set — every previously issued code stops working immediately.";

export const MFA_LEDGER_NOTE =
  "Events recorded since this ledger was introduced. Earlier enrolments, verifications and failures were never written and are not reconstructed. The ledger keeps the most recent entries per organization and per member; older ones are trimmed, so a count here is a floor, not a total.";

export const MFA_CONFIG_NOTE =
  "Read from this process's environment and code constants. It reports what is configured, never what is working: only a real enrolment against a real authenticator proves the TOTP parameters interoperate, and only a real Redis proves the throttle and replay markers persist.";

export const MFA_EXEMPTION_NOTE =
  "An exemption is an administrator's documented decision to accept the risk for one account, with a reason and an expiry. It is never granted automatically, it is always visible in coverage as 'exempt' rather than folded into 'covered', and it expires on its own.";

export const MFA_SELF_LOCKOUT_NOTE =
  "Blocking enforcement cannot be switched on from an account that would itself be blocked. Without that check, an administrator with no second factor could lock every administrator — including themselves — out of the organization with one request, leaving nobody able to switch it back.";

export const MFA_GAP_NOTE =
  "Gaps are the concrete, individually addressable problems this deployment can see right now: members the policy requires who are not covered, enrolments left pending, recovery-code sets at or below the floor, and locks currently in force. It is not a risk score.";

/* ── Records ───────────────────────────────────────────────────────────── */

/**
 * Named `MfaOrgPolicy`, not `MfaPolicy`: `wakeIntel.ts` already exports an
 * `MfaPolicy` describing wake-word factors (voice print, face, clap biometric),
 * which is a different thing entirely. Renaming that one would break a shipped
 * module, so the new type takes the longer name.
 */
export interface MfaOrgPolicy {
  organizationId: string;
  mode: MfaPolicyMode;
  enforcement: MfaEnforcementMode;
  /** Days a required member has to enrol before enforcement can apply. */
  graceDays: number;
  /** Coverage flags a member at or below this many unused recovery codes. */
  recoveryCodeFloor: number;
  /** When false, a recovery code is refused at verification time. */
  allowRecoveryCodes: boolean;
  /** Null until an administrator has saved a policy at least once. */
  updatedAt: string | null;
  updatedBy: string | null;
  /** "default" until saved; the defaults reproduce the historical behaviour. */
  source: "default" | "stored";
  note: string;
  enforcementNote: string;
}

export interface MfaPolicyUpdateInput {
  mode?: MfaPolicyMode;
  enforcement?: MfaEnforcementMode;
  graceDays?: number;
  recoveryCodeFloor?: number;
  allowRecoveryCodes?: boolean;
}

export interface MfaEnrollmentRecord {
  userId: string;
  state: MfaEnrollmentState;
  /** When `POST /mfa/enable` last issued a secret, as recorded by this ledger. */
  startedAt: string | null;
  /** When a verification first succeeded against that secret. */
  confirmedAt: string | null;
  lastVerifiedAt: string | null;
  lastMethod: MfaVerifyMethod | null;
  /** True when the enrolment is pending and older than MFA_PENDING_STALE_HOURS. */
  stale: boolean;
  organizationId: string | null;
  note: string;
}

export interface MfaRecoveryHealth {
  remaining: number;
  issued: number;
  /** The organization's configured floor, or the module watermark by default. */
  floor: number;
  low: boolean;
  exhausted: boolean;
  note: string;
}

export interface MfaLockState {
  userId: string;
  locked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  firstFailureAt: string | null;
  lastFailureAt: string | null;
  lockedAt: string | null;
  lockedUntil: string | null;
  retryAfterSeconds: number;
  maxAttempts: number;
  windowSeconds: number;
  note: string;
}

export interface MfaAttemptGate {
  allowed: boolean;
  reason: MfaGateReason;
  message: string | null;
  tokenKind: MfaTokenKind;
  lock: MfaLockState;
}

export interface MfaExemption {
  organizationId: string;
  userId: string;
  reason: string;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string;
  active: boolean;
  note: string;
}

export interface MfaMemberCoverage {
  userId: string;
  email: string | null;
  membershipRole: string;
  required: boolean;
  enrolled: boolean;
  enrollmentState: MfaEnrollmentState;
  confirmedAt: string | null;
  lastVerifiedAt: string | null;
  recoveryCodesRemaining: number;
  recoveryLow: boolean;
  locked: boolean;
  exemptUntil: string | null;
  graceEndsAt: string | null;
  graceExpired: boolean;
  compliance: MfaComplianceState;
}

export type MfaComplianceCounts = Record<MfaComplianceState, number>;

export interface MfaCoverageReport {
  organizationId: string;
  policy: MfaOrgPolicy;
  membersConsidered: number;
  membersTotal: number;
  truncated: boolean;
  counts: MfaComplianceCounts;
  /** Enrolled ÷ required, or null when the policy requires nobody. */
  requiredCoverageRatio: number | null;
  members: MfaMemberCoverage[];
  generatedAt: string;
  note: string;
  enrollmentNote: string;
}

export interface MfaEvent {
  id: string;
  kind: MfaEventKind;
  userId: string | null;
  organizationId: string | null;
  actorId: string | null;
  method: MfaVerifyMethod | null;
  /** The reason string the code itself used — never a rewritten summary. */
  reason: string | null;
  detail: Record<string, unknown> | null;
  at: string;
}

export interface MfaEventPage {
  events: MfaEvent[];
  returned: number;
  limit: number;
  scope: "organization" | "member";
  note: string;
}

export interface MfaLoginDecision {
  userId: string;
  organizationId: string | null;
  required: boolean;
  compliance: MfaComplianceState;
  enforcement: MfaEnforcementMode;
  graceEndsAt: string | null;
  decision: "allow" | "block";
  reason: string;
  note: string;
}

export interface MfaGap {
  kind:
    | "member_not_enrolled"
    | "member_in_grace"
    | "enrollment_pending"
    | "recovery_codes_low"
    | "recovery_codes_exhausted"
    | "account_locked"
    | "exemption_expiring";
  userId: string;
  email: string | null;
  detail: string;
  severity: "high" | "medium" | "low";
}

export interface MfaGapReport {
  organizationId: string;
  gaps: MfaGap[];
  counts: { high: number; medium: number; low: number };
  membersConsidered: number;
  truncated: boolean;
  generatedAt: string;
  note: string;
}

export interface MfaConfigurationReport {
  totp: {
    algorithm: string;
    digits: number;
    periodSeconds: number;
    driftWindows: number;
    liveSeconds: number;
    /** The service pins its generator against RFC 6238 Appendix B in tests. */
    vectorsPinned: boolean;
  };
  recoveryCodes: { issuedPerEnrollment: number; storage: "sha256_digest"; lowWatermark: number };
  secretStorage: { at: "redis"; encryption: "aes-256-gcm"; keyConfigured: boolean; keySource: "environment" | "development_fallback" };
  throttle: { maxFailedAttempts: number; windowSeconds: number; lockoutSeconds: number; wiredInto: string[] };
  replayGuard: { enabled: boolean; seconds: number; wiredInto: string[] };
  ledger: { perOrganizationLimit: number; perMemberLimit: number };
  note: string;
  configNote: string;
}

export interface MfaAssuranceSummary {
  organizationId: string;
  policy: MfaOrgPolicy;
  counts: MfaComplianceCounts;
  membersConsidered: number;
  membersTotal: number;
  truncated: boolean;
  requiredCoverageRatio: number | null;
  activeLocks: number;
  activeExemptions: number;
  pendingEnrollments: number;
  staleEnrollments: number;
  recoveryLowMembers: number;
  recentEvents: number;
  generatedAt: string;
  note: string;
  coverageNote: string;
  ledgerNote: string;
}

export interface MfaSelfView {
  userId: string;
  organizationId: string | null;
  enabled: boolean;
  enrollment: MfaEnrollmentRecord;
  recovery: MfaRecoveryHealth;
  lock: MfaLockState;
  policy: MfaOrgPolicy;
  required: boolean;
  compliance: MfaComplianceState;
  graceEndsAt: string | null;
  exemptUntil: string | null;
}

/* ── Schemas ───────────────────────────────────────────────────────────── */

export const MfaPolicyUpdateSchema = z
  .object({
    mode: z.enum(MFA_POLICY_MODES).optional(),
    enforcement: z.enum(MFA_ENFORCEMENT_MODES).optional(),
    graceDays: z.coerce.number().int().min(0).max(MFA_MAX_GRACE_DAYS).optional(),
    recoveryCodeFloor: z.coerce.number().int().min(0).max(MFA_RECOVERY_CODE_COUNT).optional(),
    allowRecoveryCodes: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one policy field to update.",
  });

export const MfaEventQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MFA_MAX_EVENT_PAGE).default(50),
  kind: z.enum(MFA_EVENT_KINDS).optional(),
});

export const MfaCoverageQuerySchema = z.object({
  compliance: z.enum(MFA_COMPLIANCE_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(MFA_MAX_COVERAGE_MEMBERS).default(MFA_MAX_COVERAGE_MEMBERS),
});

export const MfaUserIdParamSchema = z.object({
  userId: z.string().trim().min(1).max(120),
});

export const MfaExemptionCreateSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(10).max(MFA_EXEMPTION_REASON_MAX),
  days: z.coerce.number().int().min(1).max(MFA_EXEMPTION_MAX_DAYS).default(30),
});

/** The shape both `/mfa/*` routes and the login completion already accept. */
export const MfaTokenSchema = z.object({
  token: z.string().trim().min(6).max(32),
});

/* ── Pure helpers (shared by service, routes, console and tests) ───────── */

/**
 * What a submitted string looks like. The service treats any 6-digit string as
 * a TOTP and everything else as a candidate recovery code; this mirrors that
 * rule exactly rather than inventing a stricter one, so the gate and the
 * verifier can never disagree about which branch a token is on.
 */
export function mfaTokenKind(token: string): MfaTokenKind {
  const t = token.trim();
  if (/^\d{6}$/.test(t)) return "totp";
  if (/^[A-Za-z0-9]{8,32}$/.test(t)) return "recovery";
  return "unrecognised";
}

/** Recovery codes are compared case-insensitively; normalise the same way. */
export function normalizeMfaRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}

export function mfaRecoveryHealth(remaining: number, floor: number): MfaRecoveryHealth {
  const safeFloor = Math.max(0, Math.min(floor, MFA_RECOVERY_CODE_COUNT));
  return {
    remaining,
    issued: MFA_RECOVERY_CODE_COUNT,
    floor: safeFloor,
    low: remaining > 0 && remaining <= safeFloor,
    exhausted: remaining === 0,
    note: MFA_RECOVERY_NOTE,
  };
}

/** Whether the policy asks this membership role for a second factor. */
export function mfaPolicyRequiresRole(mode: MfaPolicyMode, membershipRole: string): boolean {
  if (mode === "required_all") return true;
  if (mode === "optional") return false;
  const role = membershipRole.toUpperCase();
  return role === "OWNER" || role === "ADMIN";
}

/**
 * When a member's grace runs out.
 *
 * The clock starts at the later of "the organization switched the requirement
 * on" and "this person joined" — a member who joins after the policy exists
 * still gets the full grace, and an existing member's clock does not start
 * before the requirement applied to them. Returns null when nothing is required
 * or the policy has never been saved (there is no moment the clock could start
 * from, and inventing one would fabricate a deadline).
 */
export function mfaGraceDeadline(
  policyUpdatedAt: string | null,
  joinedAt: string | null,
  graceDays: number,
): string | null {
  if (!policyUpdatedAt) return null;
  const policyMs = Date.parse(policyUpdatedAt);
  if (Number.isNaN(policyMs)) return null;
  const joinedMs = joinedAt ? Date.parse(joinedAt) : NaN;
  const startMs = Number.isNaN(joinedMs) ? policyMs : Math.max(policyMs, joinedMs);
  return new Date(startMs + graceDays * 86_400_000).toISOString();
}

export function isMfaGraceExpired(deadline: string | null, now: number = Date.now()): boolean {
  if (!deadline) return false;
  const ms = Date.parse(deadline);
  if (Number.isNaN(ms)) return false;
  return ms <= now;
}

/**
 * A member's standing. Kept pure and shared so the coverage report, the login
 * decision and the console all derive it from one rule instead of three.
 */
export function mfaComplianceState(input: {
  required: boolean;
  enrolled: boolean;
  enrollmentState: MfaEnrollmentState;
  exempt: boolean;
  graceExpired: boolean;
}): MfaComplianceState {
  const covered = input.enrolled && (input.enrollmentState === "confirmed" || input.enrollmentState === "unrecorded");
  if (covered) return "covered";
  if (!input.required) return "not_required";
  // An exemption only matters once something is actually being asked of the
  // member; an exempt account that enrolled anyway is reported as covered.
  if (input.exempt) return "exempt";
  if (input.enrolled && input.enrollmentState === "pending") return "enrollment_pending";
  return input.graceExpired ? "not_enrolled" : "in_grace";
}

export function emptyMfaComplianceCounts(): MfaComplianceCounts {
  return {
    covered: 0,
    not_required: 0,
    enrollment_pending: 0,
    in_grace: 0,
    not_enrolled: 0,
    exempt: 0,
  };
}

/** Seconds left on a lock, floored at zero and rounded up to a whole second. */
export function mfaLockRemainingSeconds(lockedUntil: string | null, now: number = Date.now()): number {
  if (!lockedUntil) return 0;
  const ms = Date.parse(lockedUntil);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.ceil((ms - now) / 1000));
}

/** An unlocked, no-failures lock state — the shape returned for a clean user. */
export function emptyMfaLockState(userId: string): MfaLockState {
  return {
    userId,
    locked: false,
    failedAttempts: 0,
    remainingAttempts: MFA_MAX_FAILED_ATTEMPTS,
    firstFailureAt: null,
    lastFailureAt: null,
    lockedAt: null,
    lockedUntil: null,
    retryAfterSeconds: 0,
    maxAttempts: MFA_MAX_FAILED_ATTEMPTS,
    windowSeconds: MFA_FAILURE_WINDOW_SECONDS,
    note: MFA_LOCKOUT_NOTE,
  };
}

/**
 * The default policy: exactly the behaviour the platform had before Session 116
 * — nobody required, nothing blocked, recovery codes accepted.
 */
export function defaultMfaPolicy(organizationId: string): MfaOrgPolicy {
  return {
    organizationId,
    mode: MFA_DEFAULT_POLICY_MODE,
    enforcement: MFA_DEFAULT_ENFORCEMENT,
    graceDays: MFA_DEFAULT_GRACE_DAYS,
    recoveryCodeFloor: MFA_RECOVERY_LOW_WATERMARK,
    allowRecoveryCodes: true,
    updatedAt: null,
    updatedBy: null,
    source: "default",
    note: MFA_POLICY_NOTE,
    enforcementNote: MFA_ENFORCEMENT_NOTE,
  };
}
