import { api } from "./api";

/**
 * Types come from @windels/shared/security, which the API route also compiles
 * against. They were previously re-declared here by hand, so nothing connected
 * the two: a field renamed on the server compiled cleanly on both sides and
 * simply rendered `undefined` in the dashboard.
 *
 * Local aliases keep the existing import names used across the UI.
 */
import type {
  SecurityScorecard,
  SecuritySelfTest,
  PromptGuardResult,
  PasswordStrength,
  CircuitBreakerStatus,
  RateLimitTier,
  EncryptionStatus,
  SecurityIncident,
  SecurityIncidentStatus,
  SecurityIncidentSeverity,
  SecurityIncidentArea,
  IncidentRunbook,
  RunbookAction,
  AccessReview,
  AccessReviewRunResult,
  AccessReviewItem,
  AccessReviewAttestStatus,
} from "@windels/shared/security";

export type {
  SecurityScorecard,
  PasswordStrength,
  RateLimitTier,
  EncryptionStatus,
  SecurityIncident,
  SecurityIncidentStatus,
  SecurityIncidentSeverity,
  SecurityIncidentArea,
  IncidentRunbook,
  RunbookAction,
  AccessReview,
  AccessReviewRunResult,
  AccessReviewItem,
  AccessReviewAttestStatus,
};
export type SelfTest = SecuritySelfTest;
export type GuardResult = PromptGuardResult;
export type Breaker = CircuitBreakerStatus;

export const securityApi = {
  scorecard: () => api<SecurityScorecard>("/security/scorecard"),
  selfTest: () => api<SelfTest[]>("/security/self-test"),
  scanPrompt: (text: string) => api<GuardResult>("/security/prompt-guard/scan", { method: "POST", json: { text } }),
  passwordStrength: (password: string) => api<PasswordStrength>("/security/password-strength", { method: "POST", json: { password } }),
  breakers: () => api<Breaker[]>("/security/breakers"),
  resetBreaker: (name: string) => api<Breaker[]>(`/security/breakers/${name}/reset`, { method: "POST" }),
  rateLimits: () => api<RateLimitTier[]>("/security/rate-limits"),
  events: (limit = 200) => api<SecurityEvent[]>("/security/events", { params: { limit } }),
  encryption: () => api<EncryptionStatus>("/security/encryption"),

  // ── Incident response ──────────────────────────────────────────────────
  incidents: (opts?: { status?: SecurityIncidentStatus; limit?: number }) =>
    api<SecurityIncident[]>("/security/incidents", { params: { ...opts } }),
  reportIncident: (input: {
    title: string;
    description: string;
    severity: SecurityIncidentSeverity;
    area: SecurityIncidentArea;
  }) => api<SecurityIncident>("/security/incidents", { method: "POST", json: input }),
  updateIncident: (id: string, patch: { status?: SecurityIncidentStatus; note?: string }) =>
    api<SecurityIncident>(`/security/incidents/${id}`, { method: "PATCH", json: patch }),

  // ── Access reviews ─────────────────────────────────────────────────────
  runAccessReview: (dormantDays?: number) =>
    api<AccessReviewRunResult>("/security/access-reviews/run", { method: "POST", json: { dormantDays } }),
  latestAccessReview: () => api<AccessReview | null>("/security/access-reviews/latest"),
  attestAccessItem: (itemId: string, status: AccessReviewAttestStatus, notes?: string) =>
    api<AccessReviewItem>("/security/access-reviews/attest", { method: "POST", json: { itemId, status, notes } }),

  // ── Incident runbooks ──────────────────────────────────────────────────
  runbooks: () => api<IncidentRunbook[]>("/security/runbooks"),
  createRunbook: (input: {
    name: string;
    triggerSeverity: SecurityIncidentSeverity;
    triggerArea: SecurityIncidentArea;
    actions: RunbookAction[];
  }) => api<IncidentRunbook>("/security/runbooks", { method: "POST", json: input }),
};

/**
 * One security event, normalised.
 *
 * `GET /security/events` returns two different shapes depending on which
 * runtime answers:
 *
 *   * Node reads an in-memory log ring, so an entry looks like
 *     `{ level, time, msg, ... }`.
 *   * PHP has no process-lifetime memory to read from, so it serves rows from
 *     the durable `audit_events` table: `{ type, at, actorId, payload, ... }`.
 *
 * The dashboard is one bundle that talks to either, so it normalises instead of
 * picking a side. A field neither backend supplies is reported as null rather
 * than guessed.
 */
export interface SecurityEvent {
  id: string;
  at: string;
  type: string;
  actor: string | null;
  detail: string;
  severity: "error" | "warn" | "info";
}

export function normalizeEvent(raw: any): SecurityEvent {
  const type = String(raw?.type ?? raw?.event_type ?? "");
  const at = String(raw?.at ?? raw?.time ?? raw?.createdAt ?? "");
  const actor = raw?.actorId ?? raw?.actor ?? raw?.user_id ?? null;
  let detail = typeof raw?.msg === "string" ? raw.msg : "";
  if (!detail && raw?.payload) {
    try {
      detail = typeof raw.payload === "string" ? raw.payload : JSON.stringify(raw.payload);
    } catch {
      detail = "";
    }
  }
  // Severity is read from the type AND the payload, because the PHP audit rows
  // keep the outcome in `payload.status` where Node put it in the log message.
  const status = raw?.payload && typeof raw.payload === "object" ? String((raw.payload as any).status ?? "") : "";
  const hay = `${type} ${status} ${detail}`.toLowerCase().replace(/[._\-"':{}[\]]/g, " ");
  let severity: SecurityEvent["severity"] = "info";
  const level = String(raw?.level ?? "");
  if (level === "error" || level === "fatal" || /\b(failed|revoked|quarantined|suspended|breach)\b/.test(hay)) severity = "error";
  else if (level === "warn" || /\b(reported|blocked|reset|denied|expired)\b/.test(hay)) severity = "warn";
  return {
    id: String(raw?.id ?? `${at}:${type}`),
    at,
    type: type || "event",
    actor: actor ? String(actor) : null,
    detail,
    severity,
  };
}
