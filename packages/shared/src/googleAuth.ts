// Session 114 — Google Identity: sign-in governance, linked identities, ledger.
//
// The OAuth flow itself shipped earlier and is untouched by this contract:
// `apps/api/src/services/googleAuth.service.ts` performs a real OpenID Connect
// authorization-code exchange, verifies the ID token against Google's published
// JWKS (signature, iss, aud, exp, nonce, email_verified) and mints the platform
// session JWT. What never existed around it was *governance*:
//
//   - an organization could not say which Google accounts may sign in;
//   - nothing recorded that a Google sign-in had happened, so an administrator
//     could not answer "who signs in with Google, and when did they last?";
//   - a compromised or departed Google account could not be cut off short of
//     deleting the platform user;
//   - the configuration was invisible — the only signal was a boolean
//     `enabled` from `/auth/google/status`.
//
// This file is the shared contract for that layer. Both the API routes and the
// web client compile against it, so a renamed field is a build error rather
// than a blank field on a security screen.
//
// HONESTY RULES ENCODED HERE
// --------------------------
//   - Counts in the summary describe *recorded* events only. Sign-ins that
//     happened before this ledger existed were never written and are not
//     inferred; GOOGLE_LEDGER_NOTE says so and travels with the payload.
//   - The configuration report reads environment variables and nothing else.
//     It performs no network call, so it reports "configured", never "working".
//   - Google subject identifiers are stored as a truncated SHA-256 fingerprint,
//     never in the clear (GOOGLE_IDENTITY_PRIVACY_NOTE).
//   - An organization policy can only be applied to a sign-in that resolves to
//     an existing member of that organization. A brand-new Google account
//     provisions its own workspace and belongs to no organization at the moment
//     the decision is made, so no org policy can gate it
//     (GOOGLE_PROVISIONING_NOTE).

import { z } from "zod";

/* ── Endpoints and scopes (Google's, fixed, quoted for the UI) ─────────── */

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
/** Exactly the scopes the authorization URL requests. */
export const GOOGLE_AUTH_SCOPES = ["openid", "email", "profile"] as const;
/** Environment variables the OAuth flow requires, in the order it reads them. */
export const GOOGLE_REQUIRED_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const;

/* ── Limits ────────────────────────────────────────────────────────────── */

export const GOOGLE_MAX_ALLOWED_DOMAINS = 50;
/** Ledger entries kept per organization. The oldest are trimmed, the total is not forgotten. */
export const GOOGLE_EVENT_LIMIT = 500;
export const GOOGLE_MAX_IDENTITIES = 2000;
/** Characters of the SHA-256 subject digest that are stored. */
export const GOOGLE_SUBJECT_FINGERPRINT_CHARS = 32;

/* ── Notes that ship with the payloads ─────────────────────────────────── */

export const GOOGLE_POLICY_NOTE =
  "This policy is evaluated at Google sign-in for accounts that already resolve to a member of this organization. It does not affect email/password sign-in, API keys, enterprise SSO, or sessions that are already active — an existing session runs until its token expires.";

export const GOOGLE_PROVISIONING_NOTE =
  "A Google account with no existing platform user provisions its own workspace and therefore belongs to no organization at the moment the decision is made. No organization policy can gate that first sign-in; the resulting identity is recorded in the new workspace's ledger and can be revoked there.";

export const GOOGLE_LEDGER_NOTE =
  "Counts describe events this deployment recorded from the moment the ledger was introduced. Sign-ins that happened before it existed were never written and are not estimated. The ledger keeps the most recent entries per organization; older entries are trimmed.";

export const GOOGLE_IDENTITY_PRIVACY_NOTE =
  "Google subject identifiers are stored as a truncated SHA-256 fingerprint, not in the clear. The fingerprint is stable for the same Google account, so a re-used address can be told apart from the same person signing in again, but it cannot be replayed against Google.";

export const GOOGLE_CONFIG_NOTE =
  "Read from this process's environment only. No request is made to Google, so a passing check means the value is present and well-formed — not that Google accepts it. Secrets are reported as present or absent and are never returned.";

export const GOOGLE_REVOKE_NOTE =
  "Revoking a linked identity blocks future Google sign-ins for that account in this organization. It does not delete the platform user, does not revoke Google's own session, and does not invalidate an access token that has already been issued.";

/* ── Policy ────────────────────────────────────────────────────────────── */

export const GOOGLE_SIGNIN_MODES = ["open", "domain_allowlist", "linked_only", "disabled"] as const;
export type GoogleSignInMode = (typeof GOOGLE_SIGNIN_MODES)[number];

/** Human-readable description of each mode, rendered in the UI verbatim. */
export const GOOGLE_SIGNIN_MODE_LABELS: Record<GoogleSignInMode, string> = {
  open: "Any member of this organization may sign in with Google.",
  domain_allowlist: "Only members whose Google email domain is on the allowlist may sign in.",
  linked_only: "Only members who already have an active linked Google identity may sign in; a first Google sign-in is refused until an administrator links it.",
  disabled: "Google sign-in is refused for members of this organization.",
};

export interface GoogleAuthPolicy {
  organizationId: string;
  mode: GoogleSignInMode;
  /** Lower-cased bare domains, e.g. "windels.ai". Only meaningful in domain_allowlist mode. */
  allowedDomains: string[];
  /** When true, a revoked identity is refused regardless of mode. */
  blockRevokedIdentities: boolean;
  /** Operator note explaining why the policy is set this way. */
  note: string | null;
  /** True when no record is stored and the platform default is being reported. */
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Constant guidance; part of the payload so a UI cannot silently drop it. */
  policyNote: string;
  provisioningNote: string;
}

export const GOOGLE_DEFAULT_POLICY_MODE: GoogleSignInMode = "open";

/* ── Decisions ─────────────────────────────────────────────────────────── */

export const GOOGLE_SIGNIN_OUTCOMES = [
  "allowed",
  "blocked_disabled",
  "blocked_domain",
  "blocked_not_linked",
  "blocked_revoked",
  "blocked_unverified_email",
] as const;
export type GoogleSignInOutcome = (typeof GOOGLE_SIGNIN_OUTCOMES)[number];

export interface GooglePolicyDecision {
  allowed: boolean;
  outcome: GoogleSignInOutcome;
  /** Deterministic explanation naming the rule that decided. */
  reason: string;
  mode: GoogleSignInMode;
  policyIsDefault: boolean;
  email: string;
  emailDomain: string | null;
  /** The allowlist entry that matched, when one did. */
  matchedDomain: string | null;
  /** Whether an identity record for this address exists in the organization. */
  identityFound: boolean;
  identityStatus: GoogleIdentityStatus | null;
  evaluatedAt: string;
}

/**
 * A dry-run evaluation. `applied: false` states plainly that no sign-in was
 * performed and nothing was written to the ledger.
 */
export interface GooglePolicyDryRun extends GooglePolicyDecision {
  applied: false;
  note: string;
}

/* ── Linked identities ─────────────────────────────────────────────────── */

export const GOOGLE_IDENTITY_STATUSES = ["active", "revoked"] as const;
export type GoogleIdentityStatus = (typeof GOOGLE_IDENTITY_STATUSES)[number];

export interface GoogleLinkedIdentity {
  id: string;
  userId: string;
  /** Lower-cased address as Google asserted it. */
  email: string;
  emailDomain: string;
  /** Truncated SHA-256 of Google's `sub`. Never the raw subject. */
  subjectFingerprint: string;
  displayName: string | null;
  status: GoogleIdentityStatus;
  linkedAt: string;
  /** Null until a sign-in is recorded against this identity. */
  lastSignInAt: string | null;
  /** Sign-ins recorded since the ledger existed — not a lifetime total. */
  recordedSignIns: number;
  /** True when the platform account itself was created by a Google sign-in. */
  provisionedByGoogle: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

export interface GoogleIdentityList {
  identities: GoogleLinkedIdentity[];
  total: number;
  returned: number;
  activeCount: number;
  revokedCount: number;
  privacyNote: string;
}

/* ── Ledger ────────────────────────────────────────────────────────────── */

export const GOOGLE_EVENT_KINDS = [
  "sign_in",
  "provision",
  "blocked",
  "revoke",
  "restore",
  "unlink",
  "policy_update",
  "policy_reset",
] as const;
export type GoogleEventKind = (typeof GOOGLE_EVENT_KINDS)[number];

export interface GoogleSignInEvent {
  id: string;
  at: string;
  kind: GoogleEventKind;
  /** Present for sign-in and blocked events; null for administrative actions. */
  outcome: GoogleSignInOutcome | null;
  email: string | null;
  emailDomain: string | null;
  userId: string | null;
  identityId: string | null;
  /** Deterministic sentence describing what happened. */
  reason: string;
  /** The administrator who performed an administrative action. */
  actorId: string | null;
}

export interface GoogleEventList {
  events: GoogleSignInEvent[];
  returned: number;
  /** Entries currently held for this organization (after trimming). */
  stored: number;
  retentionLimit: number;
  oldestAt: string | null;
  ledgerNote: string;
}

/* ── Configuration report ──────────────────────────────────────────────── */

export const GOOGLE_CHECK_STATUSES = ["pass", "warn", "fail"] as const;
export type GoogleCheckStatus = (typeof GOOGLE_CHECK_STATUSES)[number];

export interface GoogleConfigCheck {
  id: string;
  label: string;
  status: GoogleCheckStatus;
  /** What was actually observed, in words. */
  detail: string;
}

export interface GoogleAuthConfigStatus {
  /** Mirrors GoogleAuthService.enabled(): all three variables present. */
  enabled: boolean;
  clientIdPresent: boolean;
  /** Masked: first six and last four characters. Never the full value in logs. */
  clientIdMasked: string | null;
  clientSecretPresent: boolean;
  redirectUri: string | null;
  redirectUriIsHttps: boolean | null;
  redirectUriHost: string | null;
  /** True when the path matches the route this API actually serves. */
  redirectUriPathMatches: boolean | null;
  expectedCallbackPath: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  checks: GoogleConfigCheck[];
  /** True only when every check passes. A warn is not a pass. */
  ready: boolean;
  checkedAt: string;
  note: string;
}

/* ── Summary ───────────────────────────────────────────────────────────── */

export interface GoogleDomainStat {
  domain: string;
  identities: number;
  activeIdentities: number;
  /** Null when no identity for this domain has a recorded sign-in. */
  lastSignInAt: string | null;
}

export interface GoogleIdentityCounts {
  total: number;
  active: number;
  revoked: number;
  provisionedByGoogle: number;
  neverSignedIn: number;
}

export interface GoogleSignInCounts {
  /** Sign-in events recorded (all time, within retention). */
  recorded: number;
  last7d: number;
  last30d: number;
  blocked30d: number;
  lastAt: string | null;
}

export interface GoogleAuthSummary {
  policy: GoogleAuthPolicy;
  config: GoogleAuthConfigStatus;
  identities: GoogleIdentityCounts;
  signIns: GoogleSignInCounts;
  domains: GoogleDomainStat[];
  ledger: {
    stored: number;
    retentionLimit: number;
    oldestAt: string | null;
  };
  generatedAt: string;
  ledgerNote: string;
  privacyNote: string;
}

/* ── Self-service view ─────────────────────────────────────────────────── */

export interface GoogleIdentitySelf {
  linked: boolean;
  identity: GoogleLinkedIdentity | null;
  /** Whether this deployment has Google OAuth configured at all. */
  signInConfigured: boolean;
  policyMode: GoogleSignInMode;
  policyIsDefault: boolean;
  /** The evaluation for this user's own address, or null when unlinked. */
  decision: GooglePolicyDecision | null;
  /** Path the browser navigates to in order to start the flow. */
  startPath: string;
  revokeNote: string;
}

/* ── Validation ────────────────────────────────────────────────────────── */

/**
 * A bare DNS domain: labels of letters/digits/hyphens separated by dots, with a
 * final alphabetic label. Leading "@" and surrounding whitespace are stripped,
 * and the value is lower-cased, so "@Windels.AI " and "windels.ai" are one
 * entry. Wildcards are rejected: an allowlist that silently matched
 * "*.example.com" would be a wider grant than it looks.
 */
export const googleDomainSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((v) => v.replace(/^@/, "").trim().toLowerCase())
  .refine((v) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(v), {
    message: "Enter a bare domain such as windels.ai (no scheme, path or wildcard).",
  });

export const GoogleIdentityIdParamSchema = z.object({
  id: z.string().min(8).max(80).regex(/^gid_[A-Za-z0-9_-]+$/, "Not a Google identity id."),
});
export type GoogleIdentityIdParam = z.infer<typeof GoogleIdentityIdParamSchema>;

export const GoogleAuthPolicyUpdateSchema = z
  .object({
    mode: z.enum(GOOGLE_SIGNIN_MODES),
    allowedDomains: z.array(googleDomainSchema).max(GOOGLE_MAX_ALLOWED_DOMAINS).default([]),
    blockRevokedIdentities: z.boolean().default(true),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.mode !== "domain_allowlist" || v.allowedDomains.length > 0, {
    message: "domain_allowlist mode needs at least one domain, otherwise it would refuse everyone.",
    path: ["allowedDomains"],
  });
export type GoogleAuthPolicyUpdateInput = z.infer<typeof GoogleAuthPolicyUpdateSchema>;

export const GooglePolicyEvaluateSchema = z.object({
  email: z.string().trim().email().max(320),
  /** What Google would assert. Defaults to true; set false to test the refusal. */
  emailVerified: z.boolean().default(true),
});
export type GooglePolicyEvaluateInput = z.infer<typeof GooglePolicyEvaluateSchema>;

export const GoogleIdentityQuerySchema = z.object({
  status: z.enum(GOOGLE_IDENTITY_STATUSES).optional(),
  domain: googleDomainSchema.optional(),
  userId: z.string().trim().min(1).max(120).optional(),
  /** Case-insensitive substring match on email and display name. */
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(GOOGLE_MAX_IDENTITIES).default(200),
});
export type GoogleIdentityQuery = z.infer<typeof GoogleIdentityQuerySchema>;

export const GoogleEventQuerySchema = z.object({
  kind: z.enum(GOOGLE_EVENT_KINDS).optional(),
  outcome: z.enum(GOOGLE_SIGNIN_OUTCOMES).optional(),
  userId: z.string().trim().min(1).max(120).optional(),
  /** ISO timestamp; entries at or after it are returned. */
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(GOOGLE_EVENT_LIMIT).default(100),
});
export type GoogleEventQuery = z.infer<typeof GoogleEventQuerySchema>;

export const GoogleIdentityRevokeSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
});
export type GoogleIdentityRevokeInput = z.infer<typeof GoogleIdentityRevokeSchema>;

/* ── Helpers shared by both sides ──────────────────────────────────────── */

/** The domain part of an address, lower-cased; null when the address has none. */
export function googleEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

/** Mask a client id for display: first six and last four characters. */
export function maskGoogleClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 12) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
