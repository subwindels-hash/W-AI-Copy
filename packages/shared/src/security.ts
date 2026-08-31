// Security dashboard contract (Session 13 + hardening passes).
//
// These shapes were declared twice: once implicitly by the route handlers in
// apps/api/src/http/routes/security.ts (as inline object literals), and once by
// hand in apps/web/src/lib/security.ts as seven `export interface` blocks. The
// web copy was never checked against the server, so a field renamed on the API
// side would compile cleanly on both and simply render `undefined` in the
// dashboard.
//
// Declaring them here makes the route's response types checkable and gives the
// web client something to import instead of re-describing.

import { z } from "zod";

/** One boot-time security self-test result. */
export interface SecuritySelfTest {
  id: string;
  name: string;
  passed: boolean;
  detail?: string;
}

/** Envelope-encryption key metadata. Never carries key material. */
export interface EncryptionKeyInfo {
  id: string;
  /**
   * Null when the runtime keeps no key metadata. Node ships key files with
   * creation dates; the PHP build derives one key from VP_ENCRYPTION_KEY and
   * records nothing about it, so it reports null rather than inventing a date
   * that would make key age look measurable. The dashboard renders "not
   * recorded" for null.
   */
  createdAt: string | null;
  primary: boolean;
}

export interface EncryptionStatus {
  keys: EncryptionKeyInfo[];
  algorithm: string;
  envelopeVersion: string;
}

/**
 * Response-hardening flags reported to the dashboard.
 *
 * Booleans mean "this header is being sent", not "this header is correct".
 * `xFrame` and `referrerPolicy` are null when the header is not emitted, which
 * is the normal case for a deployment that does not configure a framing policy
 * — null, not "DENY", because claiming a policy that is not on the wire is
 * worse than admitting there is none.
 */
export interface SecurityHeaderStatus {
  hsts: boolean;
  csp: boolean;
  noSniff: boolean;
  xFrame: string | null;
  referrerPolicy: string | null;
}

export interface SecurityScorecard {
  selfTests: { passed: number; total: number };
  promptInjectionsBlocked: number;
  rateLimitedRequests: number;
  openBreakers: number;
  encryptionKeys: EncryptionKeyInfo[];
  headers: SecurityHeaderStatus;
  totalSecurityEvents: number;
  /** Derived from real self-test results and open breakers — not a target. */
  score: number;
}

/** Prompt-injection guard verdict. */
export interface PromptGuardResult {
  safe: boolean;
  score: number;
  reasons: string[];
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  issues: string[];
  meetsPolicy: boolean;
}

export const CIRCUIT_BREAKER_STATES = ["closed", "open", "half-open"] as const;
export type CircuitBreakerState = (typeof CIRCUIT_BREAKER_STATES)[number];

export interface CircuitBreakerStatus {
  name: string;
  state: string;
  failures: number;
  successes: number;
  openedAt: string | null;
  nextProbe: string | null;
}

export interface RateLimitTier {
  name: string;
  burst: number;
  sustainedPerMin: number;
  blockSeconds: number;
}

export const SECURITY_INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type SecurityIncidentSeverity = (typeof SECURITY_INCIDENT_SEVERITIES)[number];

export const SECURITY_INCIDENT_AREAS = ["auth", "data", "ai", "billing", "infra", "abuse", "other"] as const;
export type SecurityIncidentArea = (typeof SECURITY_INCIDENT_AREAS)[number];

/* ── Request schemas (mounted by http/routes/security.ts) ─────────────── */

export const PromptGuardScanSchema = z.object({
  text: z.string().min(1).max(20_000),
});

export const PasswordStrengthSchema = z.object({
  password: z.string().min(1).max(400),
});

export const SecurityEventsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).optional(),
});

export const CreateSecurityIncidentSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(5000),
  severity: z.enum(SECURITY_INCIDENT_SEVERITIES),
  area: z.enum(SECURITY_INCIDENT_AREAS),
});
export type CreateSecurityIncidentInput = z.infer<typeof CreateSecurityIncidentSchema>;

/* ── Incident response, access reviews and runbooks ────────────────────
 *
 * These eight endpoints existed only as untyped JSON in the route file and in
 * the governance service, so the dashboard had no way to consume them without
 * re-declaring the shapes. They are declared here for the same reason as the
 * block above: one description, imported by both sides.
 */

export const SECURITY_INCIDENT_STATUSES = [
  "reported", "investigating", "contained", "resolved", "postmortem",
] as const;
export type SecurityIncidentStatus = (typeof SECURITY_INCIDENT_STATUSES)[number];

export interface SecurityIncident {
  id: string;
  title: string;
  description: string;
  severity: SecurityIncidentSeverity;
  status: SecurityIncidentStatus;
  reportedBy: string;
  area: SecurityIncidentArea;
  createdAt: string;
  updatedAt: string;
  timeline: Array<{ at: string; actor: string; note: string }>;
  runbookExecutions: Array<{ runbookId: string; status: string; output: Record<string, unknown> }>;
}

export const UpdateSecurityIncidentSchema = z.object({
  status: z.enum(SECURITY_INCIDENT_STATUSES).optional(),
  note: z.string().max(2000).optional(),
});

export const ListSecurityIncidentsQuerySchema = z.object({
  status: z.enum(SECURITY_INCIDENT_STATUSES).optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
});

/** Actions an incident runbook can perform. Validated server-side. */
export const RUNBOOK_ACTIONS = ["NOTIFY_ADMIN", "REVOKE_TOKENS", "QUARANTINE_REPORTER"] as const;
export type RunbookAction = (typeof RUNBOOK_ACTIONS)[number];

export const CreateRunbookSchema = z.object({
  name: z.string().min(2).max(100),
  triggerSeverity: z.enum(SECURITY_INCIDENT_SEVERITIES),
  triggerArea: z.enum(SECURITY_INCIDENT_AREAS),
  actions: z.array(z.enum(RUNBOOK_ACTIONS)).min(1),
});

export interface RunbookExecution {
  id: number;
  incidentId: string;
  status: string;
  output: Record<string, unknown>;
  createdAt: string;
}

export interface IncidentRunbook {
  id: string;
  organizationId: string | null;
  name: string;
  triggerSeverity: SecurityIncidentSeverity;
  triggerArea: SecurityIncidentArea;
  actions: RunbookAction[];
  enabled: boolean;
  createdAt: string;
  executions: RunbookExecution[];
}

export const ACCESS_REVIEW_ITEM_STATUSES = ["PENDING", "APPROVED", "REVOKED", "QUARANTINED"] as const;
export type AccessReviewItemStatus = (typeof ACCESS_REVIEW_ITEM_STATUSES)[number];

export interface AccessReviewItem {
  id: string;
  campaignId: string;
  userId: string;
  status: AccessReviewItemStatus;
  reviewedById: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessReviewCampaign {
  id: string;
  organizationId: string;
  dormantDays: number;
  status: string;
  createdAt: string;
  items: AccessReviewItem[];
}

export interface DormantUser {
  userId: string;
  email: string;
  role: string;
  /** Null when the account has never been seen active. */
  lastLoginAt: string | null;
  daysInactive: number;
}

export interface AccessReview {
  campaignId: string;
  generatedAt: string;
  dormantUsers: DormantUser[];
  adminCount: number;
  superAdminCount: number;
  recommendations: string[];
}

export interface AccessReviewRunResult {
  campaign: AccessReviewCampaign;
  review: AccessReview;
}

export const RunAccessReviewSchema = z.object({
  dormantDays: z.coerce.number().int().min(7).max(365).optional(),
});

export const ACCESS_REVIEW_ATTEST_STATUSES = ["APPROVED", "REVOKED", "QUARANTINED"] as const;
export type AccessReviewAttestStatus = (typeof ACCESS_REVIEW_ATTEST_STATUSES)[number];

export const AttestAccessReviewSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(ACCESS_REVIEW_ATTEST_STATUSES),
  notes: z.string().max(500).optional(),
});
