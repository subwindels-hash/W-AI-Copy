/**
 * Session 116 — MFA client.
 *
 * Two halves, deliberately separated:
 *
 *   - `mfaApi` is the original six-endpoint surface (status, enable, confirm,
 *     verify, disable, regenerate). It existed on the server since the TOTP
 *     service shipped but had no typed client at all; the login page hand-rolled
 *     the one call it needed.
 *   - `mfaAssuranceApi` is the Session 116 surface: the organization policy,
 *     coverage, the throttle, exemptions, the ledger and the configuration
 *     report.
 *
 * Every type comes from `@windels/shared/mfa`, which the API routes also compile
 * against, so a renamed field is a build error rather than a blank cell on a
 * security screen.
 */
import { api } from "./api";
import type {
  MfaAssuranceSummary,
  MfaComplianceState,
  MfaConfigurationReport,
  MfaCoverageReport,
  MfaEnrollmentRecord,
  MfaEventKind,
  MfaEventPage,
  MfaExemption,
  MfaGapReport,
  MfaLockState,
  MfaOrgPolicy,
  MfaPolicyUpdateInput,
  MfaRecoveryHealth,
  MfaSelfView,
  MfaVerifyMethod,
} from "@windels/shared/mfa";

export type {
  MfaAssuranceSummary,
  MfaComplianceState,
  MfaConfigurationReport,
  MfaCoverageReport,
  MfaEnrollmentRecord,
  MfaEnrollmentState,
  MfaEnforcementMode,
  MfaEvent,
  MfaEventKind,
  MfaEventPage,
  MfaExemption,
  MfaGap,
  MfaGapReport,
  MfaLockState,
  MfaMemberCoverage,
  MfaOrgPolicy,
  MfaPolicyMode,
  MfaPolicyUpdateInput,
  MfaRecoveryHealth,
  MfaSelfView,
} from "@windels/shared/mfa";

export {
  MFA_COMPLIANCE_STATES,
  MFA_ENFORCEMENT_MODES,
  MFA_EVENT_KINDS,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_POLICY_MODES,
  MFA_RECOVERY_CODE_COUNT,
  MFA_TOTP_DIGITS,
  MFA_TOTP_PERIOD_SECONDS,
  mfaRecoveryHealth,
} from "@windels/shared/mfa";

/** Human labels for the vocabularies the console renders. */
export const MFA_POLICY_MODE_LABELS: Record<string, string> = {
  optional: "Optional — nobody is required",
  required_admins: "Required for owners and admins",
  required_all: "Required for every member",
};

export const MFA_ENFORCEMENT_LABELS: Record<string, string> = {
  report_only: "Report only — nothing is blocked",
  block_after_grace: "Block sign-in after the grace deadline",
};

export const MFA_COMPLIANCE_LABELS: Record<MfaComplianceState, string> = {
  covered: "Covered",
  not_required: "Not required",
  enrollment_pending: "Enrolment pending",
  in_grace: "In grace",
  not_enrolled: "Not enrolled",
  exempt: "Exempt",
};

/** The pre-Session-116 endpoints, unchanged, now with types. */
export const mfaApi = {
  status: () => api<{ enabled: boolean; enforced: boolean; recoveryCodesRemaining: number }>("/mfa/status"),
  enable: () =>
    api<{ secret: string; otpauthUrl: string; recoveryCodes: string[] }>("/mfa/enable", { method: "POST" }),
  confirm: (token: string) =>
    api<{ verified: true; method?: MfaVerifyMethod }>("/mfa/confirm", { method: "POST", json: { token } }),
  verify: (token: string) =>
    api<{ ok: boolean; method?: MfaVerifyMethod; reason?: string }>("/mfa/verify", { method: "POST", json: { token } }),
  disable: (token: string) => api<unknown>("/mfa/disable", { method: "POST", json: { token } }),
  regenerateRecoveryCodes: (token: string) =>
    api<{ recoveryCodes: string[] }>("/mfa/recovery-codes", { method: "POST", json: { token } }),
};

export const mfaAssuranceApi = {
  summary: () => api<MfaAssuranceSummary>("/mfa/assurance/summary"),
  gaps: () => api<MfaGapReport>("/mfa/assurance/gaps"),
  configuration: () => api<MfaConfigurationReport>("/mfa/assurance/configuration"),

  policy: () => api<MfaOrgPolicy>("/mfa/policy"),
  savePolicy: (input: MfaPolicyUpdateInput) => api<MfaOrgPolicy>("/mfa/policy", { method: "PUT", json: input }),

  coverage: (query?: { compliance?: MfaComplianceState; limit?: number }) =>
    api<MfaCoverageReport>("/mfa/coverage", { params: query }),
  me: () => api<MfaSelfView>("/mfa/coverage/me"),

  enrollment: () => api<MfaEnrollmentRecord>("/mfa/enrollment"),
  /** Only clears a *pending* enrolment; a confirmed one still needs a code. */
  abandonEnrollment: () =>
    api<{ cleared: boolean; enrollment: MfaEnrollmentRecord; reason: string }>("/mfa/enrollment/abandon", {
      method: "POST",
    }),

  recoveryHealth: () => api<MfaRecoveryHealth>("/mfa/recovery/health"),
  myLock: () => api<MfaLockState>("/mfa/lock"),
  locks: () =>
    api<{
      organizationId: string;
      locks: Array<MfaLockState & { email: string | null }>;
      membersConsidered: number;
      truncated: boolean;
      note: string;
    }>("/mfa/locks"),
  clearLock: (userId: string) => api<MfaLockState>(`/mfa/locks/${userId}/clear`, { method: "POST" }),

  exemptions: () => api<{ exemptions: MfaExemption[]; note: string }>("/mfa/exemptions"),
  grantExemption: (input: { userId: string; reason: string; days: number }) =>
    api<MfaExemption>("/mfa/exemptions", { method: "POST", json: input }),
  revokeExemption: (userId: string) =>
    api<{ revoked: boolean }>(`/mfa/exemptions/${userId}`, { method: "DELETE" }),

  events: (query?: { limit?: number; kind?: MfaEventKind }) =>
    api<MfaEventPage>("/mfa/events", { params: query }),
  myEvents: (query?: { limit?: number; kind?: MfaEventKind }) =>
    api<MfaEventPage>("/mfa/events/me", { params: query }),
};
