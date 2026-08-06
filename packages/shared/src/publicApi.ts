/**
 * Session 120 — Public API Gateway contracts.
 *
 * The public surface lives at `/api/rest/v1` and is authenticated with
 * organization API keys (`Authorization: Bearer wnd_…`). Session 120 gives
 * the module its first dedicated shared contract (it previously borrowed
 * `apiKeys.ts`), adds per-key usage accounting on an org-scoped best-effort
 * Redis ledger, and pins the honesty rules of the usage report:
 *
 *   - every count comes from the ledger; a day with no recorded call is
 *     absent from `daily`, never a zero;
 *   - `ledgerStart` is the NX marker's timestamp — days before the ledger
 *     began are never reported as zero-call days;
 *   - a key deleted after its calls were recorded keeps its counts with
 *     `name: null` / `keyPrefix: null` — the identifiers are not invented;
 *   - `avgCallsPerDay` is floored (never rounded) and `null` when the ledger
 *     covers no day of the window;
 *   - a failed ledger read sets `ledgerAvailable: false` and empties the
 *     ledger-derived fields instead of fabricating zeros.
 */

import { z } from "zod";

/* ── Constants ──────────────────────────────────────────────────────────── */

/** The public gateway's mount path (stable REST surface, api-key auth). */
export const PUBLIC_API_BASE_PATH = "/api/rest/v1";

export const PUBLIC_API_MAX_LIST_LIMIT = 200;
export const PUBLIC_API_MAX_TALK_CONTENT = 20000;
export const PUBLIC_API_USAGE_MAX_WINDOW_DAYS = 90;
export const PUBLIC_API_USAGE_DEFAULT_WINDOW_DAYS = 7;
/** The recent-calls ledger keeps at most this many events per organization. */
export const PUBLIC_API_EVENT_CAP = 200;
/** Day buckets expire this many days after their last recorded call (the
 *  largest statistics window is 90 days, so a live bucket always covers it). */
export const PUBLIC_API_DAY_BUCKET_TTL_DAYS = 92;
/** The usage report returns at most this many recent events. */
export const PUBLIC_API_RECENT_CALLS_LIMIT = 50;

/* ── Public surface types ──────────────────────────────────────────────── */

export interface PubGatewayIdentity {
  service: string;
  version: string;
  organization: string;
}

export interface PubWorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  runsCount: number;
  updatedAt: string;
}

export interface PubWorkflowDetail extends PubWorkflowSummary {
  createdAt: string;
  /** Declared trigger types (e.g. "manual", "schedule", "event", "webhook"). */
  triggers: string[];
  /** Node/edge graph of the workflow (org-owned data). */
  nodes: unknown[];
  edges: unknown[];
}

export interface PubAgentSummary {
  id: string;
  name: string;
  role: string;
  emoji: string | null;
  color: string;
  status: string;
  isBuiltIn: boolean;
}

export interface PubTalkChannelSummary {
  id: string;
  name: string;
  type: string;
  lastMessageAt: string | null;
}

export interface PubTalkMessageSent {
  id: string;
  channelId: string;
  content: string;
  type: string;
  userId: string | null;
  createdAt: string;
}

/* ── Usage report ───────────────────────────────────────────────────────── */

/** One recent call event from the ledger. */
export interface PubRecentCall {
  keyId: string;
  method: string;
  path: string;
  at: string;
}

/** Per-key usage row. Counts come from the ledger; identifiers from the
 *  database. A key deleted after its calls were recorded keeps its counts
 *  with `null` identifiers. */
export interface PubKeyUsageRow {
  keyId: string;
  name: string | null;
  keyPrefix: string | null;
  revoked: boolean;
  /** Lifetime calls recorded in the ledger. */
  calls: number;
  /** Calls recorded inside the window. */
  callsInWindow: number;
  /** Calls recorded in the current UTC day. */
  callsToday: number;
  lastUsedAt: string | null;
}

export interface PubUsageReport {
  windowDays: number;
  generatedAt: string;
  /** False when the ledger could not be read; every ledger-derived field is
   *  then empty/`null`, never a fabricated zero. */
  ledgerAvailable: boolean;
  /** ISO timestamp of the first recorded call, or null when none. Days before
   *  this are not reported as zero-call days. */
  ledgerStart: string | null;
  totalCalls: number;
  callsInWindow: number;
  callsToday: number;
  distinctUseDays: number;
  /** Calendar days the ledger covers inside the window:
   *  max(ledgerStart day, window start) … today, inclusive. */
  ledgerCoveredDays: number;
  /** Calls per covered calendar day, floored to 2 decimals; `null` when the
   *  ledger covers no day of the window. */
  avgCallsPerDay: number | null;
  perKey: PubKeyUsageRow[];
  recentCalls: PubRecentCall[];
  /** States what the numbers are, so the payload cannot be misread later. */
  note: string;
}

export const PUBLIC_API_USAGE_NOTE =
  "Counts come from the org-scoped call ledger (pub:* keys), which began recording when " +
  "the usage surface shipped; days before ledgerStart are not reported as zero-call days. " +
  "The ledger is best-effort: a Redis outage empties it and sets ledgerAvailable=false; it " +
  "never blocks an API call.";

/* ── Zod schemas (API + web share one definition) ───────────────────────── */

export const PubListQuerySchema = z.object({
  /** Optional cap on list length (1–200). Absent = unchanged behaviour. */
  limit: z.coerce.number().int().min(1).max(PUBLIC_API_MAX_LIST_LIMIT).optional(),
});

export const PubWorkflowIdSchema = z.object({ id: z.string().cuid() });
export const PubTalkChannelIdSchema = z.object({ id: z.string().cuid() });

export const PubRunWorkflowBodySchema = z.object({
  input: z.record(z.unknown()).default({}),
});

export const PubTalkMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(PUBLIC_API_MAX_TALK_CONTENT),
});

export const PubUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(PUBLIC_API_USAGE_MAX_WINDOW_DAYS)
    .default(PUBLIC_API_USAGE_DEFAULT_WINDOW_DAYS),
});

export type PubListQuery = z.infer<typeof PubListQuerySchema>;
export type PubRunWorkflowBody = z.infer<typeof PubRunWorkflowBodySchema>;
export type PubTalkMessageBody = z.infer<typeof PubTalkMessageBodySchema>;
export type PubUsageQuery = z.infer<typeof PubUsageQuerySchema>;
