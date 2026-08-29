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
  createdAt: string;
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
 * Booleans mean "this header is being sent", not "this header is correct" —
 * the values are read back from the helmet configuration.
 */
export interface SecurityHeaderStatus {
  hsts: boolean;
  csp: boolean;
  noSniff: boolean;
  xFrame: string;
  referrerPolicy: string;
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
