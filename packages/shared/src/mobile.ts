// Session 117 — Mobile / PWA: offline durability, device trust and push health.
//
// WHAT ALREADY EXISTED (and is untouched here)
// --------------------------------------------
// Session 21 shipped a real mobile surface: `services/mobileAuth.service.ts`
// registers devices, stores a bcrypt PIN in its own column and implements a
// WebAuthn platform-authenticator flow whose assertions are now genuinely
// signature-verified; `services/push.service.ts` sends real Web Push through
// VAPID and records a `Notification` row per send. `apps/web/src/app/mobile/*`
// is a complete PWA shell with an IndexedDB queue, install prompt, haptics and
// safe-area handling. None of that is rewritten.
//
// WHAT WAS MISSING — the gap this contract closes
// ------------------------------------------------
//   - **The offline queue threw the user's work away.** The web client queued
//     writes in IndexedDB while offline, POSTed them to
//     `/api/v1/mobile/offline/sync`, and then deleted every one of them from the
//     device. The server stored none of them: the handler updated
//     `lastSeenAt`, answered `received: <n>` and dropped the array on the floor.
//     Its own comment said "persist queued actions for auditing", which the code
//     never did. A message written in a tunnel was gone the moment the phone
//     found signal, and the client reported success.
//   - **A device id was as good as ownership.** `POST /mobile/devices/register`
//     upserted on the supplied `deviceId` without scoping the update branch to
//     the caller, and `POST /mobile/offline/sync` did the same — so one account
//     could overwrite another account's device name, platform, last-seen IP and
//     user agent. The register response then returned the whole row, including
//     the `pinHash` column whose own schema comment says "Never expose this
//     field in a select".
//   - **The PIN had no throttle.** A 4-digit PIN is 10 000 combinations and
//     `verifyPin` counted nothing, so the only cost of guessing was bcrypt.
//   - **Push failure was invisible.** A subscription is deleted after eight
//     consecutive delivery failures; nothing recorded that it happened, so push
//     simply stopped with no way for the user or an operator to find out why.
//   - **No shared contract, and no typed client** for devices, notifications or
//     the queue — only `lib/mobile/biometrics.ts`.
//
// HONESTY RULES ENCODED HERE
// --------------------------
//   - **Stored is not applied.** This API records a queued write so it survives;
//     it never executes one. Replay happens on the device, through the ordinary
//     authenticated API, so authorization, validation and rate limits all still
//     apply — and `appliedAt` stays null until the device says otherwise
//     (MOBILE_STORAGE_NOTE, MOBILE_REPLAY_NOTE).
//   - **A rejected action is never silently dropped.** Every submitted action
//     gets a receipt naming its outcome, and a rejection sets
//     `retainLocally: true` so the client keeps it instead of deleting it
//     (MOBILE_QUEUE_NOTE).
//   - **Version comparison that cannot be made is reported `unknown`**, never
//     rounded to "current" (MOBILE_UPDATE_NOTE), and this API does not refuse
//     requests from an out-of-date build — enforcement is client-side and a
//     modified client can ignore it.
//   - **A device view never carries a secret.** No PIN hash, no push token hash,
//     no credential material — `pinConfigured` is a boolean (MOBILE_DEVICE_NOTE).
//   - **Push health counts deliveries recorded since this ledger existed.**
//     Nothing before it is reconstructed, and "accepted by the push service" is
//     not "shown to the user" (MOBILE_PUSH_NOTE).
//   - **The configuration report reads this process's environment** and reports
//     "configured", never "working" (MOBILE_CONFIG_NOTE).

import { z } from "zod";

/* ── Platforms and queue parameters ────────────────────────────────────── */

/** Platforms `MobileDevice.platform` is written with by the Session 21 routes. */
export const MOBILE_PLATFORMS = ["ios", "android", "web-pwa"] as const;
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

/** Methods the offline queue accepts. GET is absent by design: a read is re-run, not replayed. */
export const MOBILE_ACTION_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;
export type MobileActionMethod = (typeof MOBILE_ACTION_METHODS)[number];

/** Actions accepted in one submission. Matches the cap Session 21's schema already applied. */
export const MOBILE_ACTION_MAX_BATCH = 200;

/**
 * Largest request body stored per action. A queued write is the user's own
 * data, held in their own queue, but an unbounded body is an unbounded Redis
 * value — so oversized actions are refused with a reason and kept on the device
 * rather than truncated, which would corrupt them silently.
 */
export const MOBILE_ACTION_MAX_BODY_BYTES = 16_384;

/** Longest path stored for an action. */
export const MOBILE_ACTION_MAX_PATH_LENGTH = 512;

/** Pending actions retained per device before the oldest are refused. */
export const MOBILE_QUEUE_MAX_ACTIONS = 500;

/** Default and maximum retention for a stored action. */
export const MOBILE_ACTION_RETENTION_DAYS = 14;
export const MOBILE_ACTION_MAX_RETENTION_DAYS = 90;

/** Page size ceiling for action listings. */
export const MOBILE_MAX_ACTION_PAGE = 200;

/** Entries kept in a principal's device ledger. */
export const MOBILE_EVENT_LIMIT = 500;

/** Push delivery outcomes retained per principal. */
export const MOBILE_PUSH_LOG_LIMIT = 200;

/* ── PIN throttle ──────────────────────────────────────────────────────── */

export const MOBILE_PIN_MIN_LENGTH = 4;
export const MOBILE_PIN_MAX_LENGTH = 8;
/** Failed PIN attempts tolerated inside the window before the device PIN locks. */
export const MOBILE_PIN_MAX_ATTEMPTS = 5;
export const MOBILE_PIN_FAILURE_WINDOW_SECONDS = 900;
export const MOBILE_PIN_LOCKOUT_SECONDS = 900;

/* ── Device staleness and push retirement ──────────────────────────────── */

/** A device unseen for this long is reported stale. It is never auto-revoked. */
export const MOBILE_DEVICE_STALE_DAYS = 30;

/**
 * Consecutive delivery failures after which `push.service.ts` deletes a
 * subscription. Mirrored here so the health report can name the threshold it is
 * describing rather than implying one.
 */
export const MOBILE_PUSH_FAILURE_RETIREMENT = 8;

/* ── Path rules for queued actions ─────────────────────────────────────── */

/** Every queued action must target the versioned API. */
export const MOBILE_ACTION_PATH_PREFIX = "/api/v1/";

/**
 * Prefixes an action may not target.
 *
 * Credential and session endpoints are excluded because a queued body would
 * park a password, a TOTP or a PIN in Redis for the retention window, and a
 * replayed authentication is never the right recovery behaviour. The queue's
 * own endpoints are excluded because an action that submits actions is a loop.
 */
export const MOBILE_ACTION_DENIED_PREFIXES = [
  "/api/v1/auth",
  "/api/v1/mfa",
  "/api/v1/mobile/offline",
  "/api/v1/mobile/pin",
  "/api/v1/mobile/biometric",
] as const;

/* ── Notes that ship inside payloads ───────────────────────────────────── */

export const MOBILE_STORAGE_NOTE =
  "Stored is not applied. This endpoint records a queued write so that it survives the device; it does not execute it. A stored action has taken no effect on any other module until something replays it.";

export const MOBILE_REPLAY_NOTE =
  "Replay happens on the device, against the ordinary authenticated API, so authorization, validation and rate limits apply exactly as they would online. The server does not re-dispatch a queued action internally: doing so would execute a write with none of those checks re-run in their normal context.";

export const MOBILE_QUEUE_NOTE =
  "Every submitted action receives a receipt. An action that was rejected sets retainLocally=true and must be kept on the device — the client must delete only what this response reports as stored or duplicate.";

export const MOBILE_DUPLICATE_NOTE =
  "A duplicate is an action id this queue already holds. It is reported, not stored twice, and the existing record's status is returned unchanged. Target endpoints are not idempotent, so an action already marked applied must not be replayed.";

export const MOBILE_RETENTION_NOTE =
  "A stored action expires after the organization's retention window and is then reported expired, not applied. Expiry means the record was dropped without ever being executed.";

export const MOBILE_DEVICE_NOTE =
  "A device view carries no secret: no PIN hash, no push token hash and no credential material. pinConfigured states only that a PIN exists.";

export const MOBILE_PIN_NOTE =
  "The PIN throttle limits attempts against this deployment's PIN endpoint for one device. It is a local re-entry factor for an already authenticated session, not a login credential, and it is not a claim about an attacker's total budget.";

export const MOBILE_PUSH_NOTE =
  "Delivery counts describe attempts recorded since this ledger existed. Accepted by the push service is not shown to the user: the browser or operating system may still suppress, delay or drop a notification, and this API cannot observe that.";

export const MOBILE_POLICY_NOTE =
  "This policy is read by the mobile client and reported by this API. Except for the offline queue's own limits, which this API enforces, the policy is advisory: a modified or out-of-date client can ignore it.";

export const MOBILE_UPDATE_NOTE =
  "This API does not refuse requests from an out-of-date build. An update standing of outdated_required is a message for the client to act on, and a version that cannot be parsed is reported unknown rather than assumed current.";

export const MOBILE_CONFIG_NOTE =
  "The configuration report reads this process's environment and makes no network call. A passing check means configured, not working — no push was sent and no authenticator was contacted to produce it.";

export const MOBILE_LEDGER_NOTE =
  "The device ledger describes events recorded since it was introduced. Nothing before it is reconstructed or estimated.";

export const MOBILE_GAP_NOTE =
  "These are the things this deployment's mobile surface does not do. They are listed so that an absence is not read as a guarantee.";

export const MOBILE_BODY_NOTE =
  "A queued action's body is stored so the write can actually be recovered. It is returned only on the owning principal's own detail read, is never written to a log, and is refused above the size cap rather than truncated.";

/* ── Offline action records ────────────────────────────────────────────── */

export const MOBILE_ACTION_STATUSES = [
  "stored",
  "applied",
  "failed",
  "discarded",
  "expired",
] as const;
export type MobileActionStatus = (typeof MOBILE_ACTION_STATUSES)[number];

export const MOBILE_RECEIPT_OUTCOMES = ["stored", "duplicate", "rejected"] as const;
export type MobileReceiptOutcome = (typeof MOBILE_RECEIPT_OUTCOMES)[number];

export const MOBILE_REJECTION_REASONS = [
  "queue_disabled",
  "queue_full",
  "body_too_large",
  "path_not_allowed",
  "path_invalid",
  "method_not_allowed",
  "action_id_invalid",
] as const;
export type MobileRejectionReason = (typeof MOBILE_REJECTION_REASONS)[number];

/** A queued write, as the client submits it. */
export interface MobileActionInput {
  /** Client-generated identifier. Used for deduplication, so it must be stable across retries. */
  id: string;
  method: MobileActionMethod;
  path: string;
  body?: unknown;
  /** When the device queued it. Absent when an older client did not send one. */
  queuedAt?: string;
}

/** A stored action without its body — the shape used in listings and plans. */
export interface MobileActionSummary {
  id: string;
  deviceId: string;
  method: MobileActionMethod;
  path: string;
  status: MobileActionStatus;
  /** True when a body was submitted and stored. */
  bodyStored: boolean;
  bodyBytes: number;
  /** Device clock, as supplied. Never used for ordering — see receivedAt. */
  queuedAt: string | null;
  /** Server clock at submission. This is what the queue orders by. */
  receivedAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  /** HTTP status the device reported when it replayed the action. */
  outcomeStatusCode: number | null;
  outcomeError: string | null;
  replayAttempts: number;
}

/** A stored action with its body, returned only to the owning principal. */
export interface MobileActionDetail extends MobileActionSummary {
  body: unknown;
  note: string;
}

export interface MobileActionReceipt {
  actionId: string;
  outcome: MobileReceiptOutcome;
  /** Present when the action is held by the queue (stored or duplicate). */
  status: MobileActionStatus | null;
  reason: MobileRejectionReason | null;
  /** The client must keep this action locally rather than deleting it. */
  retainLocally: boolean;
  detail: string;
}

export interface MobileSyncSubmission {
  deviceId: string;
  received: number;
  stored: number;
  duplicates: number;
  rejected: number;
  receipts: MobileActionReceipt[];
  /** Actions currently in `stored` state for this device, after this submission. */
  queueDepth: number;
  storageNote: string;
  queueNote: string;
  replayNote: string;
}

export interface MobileReplayPlan {
  deviceId: string;
  generatedAt: string;
  /** Ordered oldest-first by server receipt time, which is the order they were accepted in. */
  actions: MobileActionSummary[];
  pending: number;
  truncated: boolean;
  note: string;
  replayNote: string;
}

export interface MobileOfflineSummary {
  byStatus: Record<MobileActionStatus, number>;
  totalRecorded: number;
  pending: number;
  oldestPendingAt: string | null;
  /** Pending count per device id, for a principal who signs in from more than one. */
  pendingByDevice: Array<{ deviceId: string; pending: number }>;
  retentionDays: number;
  queueLimitPerDevice: number;
  storageNote: string;
  retentionNote: string;
}

/* ── Device trust ──────────────────────────────────────────────────────── */

export interface MobilePinLockState {
  deviceId: string;
  locked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  /** ISO timestamp the lock lifts at, or null when not locked. */
  unlocksAt: string | null;
  retryAfterSeconds: number | null;
  maxAttempts: number;
  windowSeconds: number;
  note: string;
}

export interface MobileDeviceView {
  id: string;
  platform: string;
  deviceName: string | null;
  osVersion: string | null;
  appVersion: string | null;
  deviceModel: string | null;
  biometricEnabled: boolean;
  /** Whether a PIN exists. The hash is never returned or derived from. */
  pinConfigured: boolean;
  biometricCredentials: number;
  pushSubscriptions: number;
  lastSeenAt: string | null;
  createdAt: string | null;
  /** Whole days since lastSeenAt, or null when the device has never reported one. */
  daysSinceLastSeen: number | null;
  stale: boolean;
  updateStanding: MobileUpdateStanding;
  pinLock: MobilePinLockState | null;
  note: string;
}

export const MOBILE_UPDATE_STANDINGS = [
  "unknown",
  "current",
  "outdated_advisory",
  "outdated_required",
] as const;
export type MobileUpdateStanding = (typeof MOBILE_UPDATE_STANDINGS)[number];

export interface MobileDeviceInventory {
  devices: MobileDeviceView[];
  total: number;
  stale: number;
  withBiometrics: number;
  withPin: number;
  withPush: number;
  staleAfterDays: number;
  note: string;
}

/* ── Push health ───────────────────────────────────────────────────────── */

export interface MobilePushSubscriptionView {
  id: string;
  deviceId: string;
  /** Origin of the push service endpoint only. The full endpoint is a bearer capability. */
  endpointHost: string;
  failures: number;
  lastDeliveredAt: string | null;
  createdAt: string | null;
  /** True when consecutive failures are one short of the retirement threshold. */
  atRisk: boolean;
}

export interface MobilePushDeliveryRecord {
  at: string;
  notificationId: string | null;
  /** Subscriptions the push service accepted the payload for. */
  accepted: number;
  /** Subscriptions attempted. */
  attempted: number;
  kind: "delivery" | "subscription_retired";
  detail: string | null;
}

export interface MobilePushHealth {
  subscriptions: MobilePushSubscriptionView[];
  activeSubscriptions: number;
  atRiskSubscriptions: number;
  /** Deliveries recorded in this ledger — not a lifetime total. */
  recordedDeliveries: number;
  recordedAccepted: number;
  recordedAttempted: number;
  lastDeliveryAt: string | null;
  retiredSubscriptions: number;
  retirementThreshold: number;
  recent: MobilePushDeliveryRecord[];
  note: string;
  ledgerNote: string;
}

/* ── Organization policy ───────────────────────────────────────────────── */

export const MOBILE_UPDATE_REQUIREMENTS = ["none", "advisory", "required"] as const;
export type MobileUpdateRequirement = (typeof MOBILE_UPDATE_REQUIREMENTS)[number];

export interface MobilePolicy {
  organizationId: string;
  /** Semver-ish minimum build, or null when the organization has not set one. */
  minAppVersion: string | null;
  updateRequirement: MobileUpdateRequirement;
  offlineQueueEnabled: boolean;
  maxQueuedActions: number;
  actionRetentionDays: number;
  pinAllowed: boolean;
  pinMinLength: number;
  biometricRecommended: boolean;
  pushEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** True when nothing has been stored and these are the platform defaults. */
  isDefault: boolean;
  note: string;
  updateNote: string;
}

export interface MobilePolicyUpdateInput {
  minAppVersion?: string | null;
  updateRequirement?: MobileUpdateRequirement;
  offlineQueueEnabled?: boolean;
  maxQueuedActions?: number;
  actionRetentionDays?: number;
  pinAllowed?: boolean;
  pinMinLength?: number;
  biometricRecommended?: boolean;
  pushEnabled?: boolean;
}

/* ── Configuration and gaps ────────────────────────────────────────────── */

export type MobileCheckState = "pass" | "warn" | "fail";

export interface MobileConfigurationCheck {
  key: string;
  label: string;
  state: MobileCheckState;
  detail: string;
}

export interface MobileConfigurationReport {
  checks: MobileConfigurationCheck[];
  /** Derived from the checks: false when any check failed. A warning is never rounded up. */
  ready: boolean;
  pushConfigured: boolean;
  /** Set when the VAPID key pair is the value committed to the repository. */
  usingRepositoryDefaultVapidKeys: boolean;
  publicConfigMinAppVersion: string;
  publicConfigSource: "build_time_constant" | "environment";
  queueLimits: {
    maxBatch: number;
    maxBodyBytes: number;
    maxQueuedActions: number;
    retentionDays: number;
  };
  pinThrottle: {
    maxAttempts: number;
    windowSeconds: number;
    lockoutSeconds: number;
  };
  generatedAt: string;
  note: string;
}

export interface MobileGap {
  area: string;
  gap: string;
  consequence: string;
}

export interface MobileGapReport {
  gaps: MobileGap[];
  note: string;
}

/* ── Self view and ledger ──────────────────────────────────────────────── */

export const MOBILE_EVENT_KINDS = [
  "device_registered",
  "device_ownership_refused",
  "device_revoked",
  "pin_set",
  "pin_cleared",
  "pin_failed",
  "pin_locked",
  "pin_verified",
  "biometric_registered",
  "push_subscribed",
  "push_unsubscribed",
  "push_subscription_retired",
  "actions_submitted",
  "action_rejected",
  "action_resolved",
  "action_discarded",
  "action_expired",
  "policy_updated",
] as const;
export type MobileEventKind = (typeof MOBILE_EVENT_KINDS)[number];

export interface MobileEvent {
  id: string;
  at: string;
  kind: MobileEventKind;
  userId: string;
  deviceId: string | null;
  organizationId: string | null;
  detail: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface MobileEventPage {
  events: MobileEvent[];
  stored: number;
  retentionLimit: number;
  oldestAt: string | null;
  note: string;
}

export interface MobileSelfAssurance {
  userId: string;
  devices: number;
  staleDevices: number;
  devicesWithBiometrics: number;
  devicesWithPin: number;
  pushSubscriptions: number;
  pendingActions: number;
  oldestPendingAt: string | null;
  lockedDevices: number;
  policy: MobilePolicy;
  generatedAt: string;
  note: string;
}

/* ── Zod input schemas ─────────────────────────────────────────────────── */

export const MobileActionInputSchema = z.object({
  id: z.string().min(1).max(128),
  method: z.enum(MOBILE_ACTION_METHODS),
  path: z.string().min(1).max(MOBILE_ACTION_MAX_PATH_LENGTH),
  body: z.unknown().optional(),
  queuedAt: z.union([z.string(), z.date()]).optional(),
});

export const MobileOfflineSubmitSchema = z.object({
  deviceId: z.string().min(1).max(128),
  actions: z.array(MobileActionInputSchema).max(MOBILE_ACTION_MAX_BATCH).default([]),
  lastSyncAt: z.union([z.string(), z.date()]).optional(),
});

export const MobileActionResolveSchema = z.object({
  outcome: z.enum(["applied", "failed"]),
  statusCode: z.number().int().min(100).max(599).optional(),
  error: z.string().max(500).optional(),
});

export const MobileActionQuerySchema = z.object({
  deviceId: z.string().min(1).max(128).optional(),
  status: z.enum(MOBILE_ACTION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(MOBILE_MAX_ACTION_PAGE).optional(),
});

export const MobileReplayPlanQuerySchema = z.object({
  deviceId: z.string().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(MOBILE_MAX_ACTION_PAGE).optional(),
});

export const MobileDeviceIdParamSchema = z.object({
  deviceId: z.string().min(1).max(128),
});

export const MobileActionIdParamSchema = z.object({
  actionId: z.string().min(1).max(128),
});

export const MobileEventQuerySchema = z.object({
  kind: z.enum(MOBILE_EVENT_KINDS).optional(),
  deviceId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(MOBILE_MAX_ACTION_PAGE).optional(),
});

export const MobilePolicyUpdateSchema = z
  .object({
    minAppVersion: z
      .string()
      .trim()
      .max(32)
      .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "minAppVersion must look like 1.2.3")
      .nullable()
      .optional(),
    updateRequirement: z.enum(MOBILE_UPDATE_REQUIREMENTS).optional(),
    offlineQueueEnabled: z.boolean().optional(),
    maxQueuedActions: z.number().int().min(1).max(MOBILE_QUEUE_MAX_ACTIONS).optional(),
    actionRetentionDays: z
      .number()
      .int()
      .min(1)
      .max(MOBILE_ACTION_MAX_RETENTION_DAYS)
      .optional(),
    pinAllowed: z.boolean().optional(),
    pinMinLength: z.number().int().min(MOBILE_PIN_MIN_LENGTH).max(MOBILE_PIN_MAX_LENGTH).optional(),
    biometricRecommended: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No policy fields supplied" });

/* ── Pure helpers, shared by both sides ────────────────────────────────── */

export function defaultMobilePolicy(organizationId: string): MobilePolicy {
  return {
    organizationId,
    minAppVersion: null,
    updateRequirement: "none",
    offlineQueueEnabled: true,
    maxQueuedActions: MOBILE_QUEUE_MAX_ACTIONS,
    actionRetentionDays: MOBILE_ACTION_RETENTION_DAYS,
    pinAllowed: true,
    pinMinLength: MOBILE_PIN_MIN_LENGTH,
    biometricRecommended: true,
    pushEnabled: true,
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
    note: MOBILE_POLICY_NOTE,
    updateNote: MOBILE_UPDATE_NOTE,
  };
}

export function emptyMobileActionCounts(): Record<MobileActionStatus, number> {
  return { stored: 0, applied: 0, failed: 0, discarded: 0, expired: 0 };
}

/**
 * Validate and normalise a queued action's path.
 *
 * Returns the reason rather than a boolean, because the receipt tells the
 * client exactly why an action was kept on the device.
 */
export function normalizeMobileActionPath(
  raw: string,
): { ok: true; path: string } | { ok: false; reason: MobileRejectionReason; detail: string } {
  const value = (raw ?? "").trim();
  if (!value) {
    return { ok: false, reason: "path_invalid", detail: "The action has no path." };
  }
  if (value.length > MOBILE_ACTION_MAX_PATH_LENGTH) {
    return {
      ok: false,
      reason: "path_invalid",
      detail: `The path is longer than ${MOBILE_ACTION_MAX_PATH_LENGTH} characters.`,
    };
  }
  // An absolute URL would let a replayed action be aimed at another host.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith("//")) {
    return {
      ok: false,
      reason: "path_invalid",
      detail: "The path must be relative to this API; an absolute URL is refused.",
    };
  }
  if (value.includes("..")) {
    return { ok: false, reason: "path_invalid", detail: "The path contains a parent segment." };
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, reason: "path_invalid", detail: "The path contains a control character." };
  }
  if (!value.startsWith(MOBILE_ACTION_PATH_PREFIX)) {
    return {
      ok: false,
      reason: "path_invalid",
      detail: `The path must begin with ${MOBILE_ACTION_PATH_PREFIX}.`,
    };
  }
  const withoutQuery = value.split("?")[0] ?? value;
  for (const denied of MOBILE_ACTION_DENIED_PREFIXES) {
    if (withoutQuery === denied || withoutQuery.startsWith(`${denied}/`)) {
      return {
        ok: false,
        reason: "path_not_allowed",
        detail: `${denied} may not be queued: credential, session and queue-control endpoints are never replayed from a stored body.`,
      };
    }
  }
  return { ok: true, path: value };
}

/** Byte length of a stored body, measured the way it will actually be stored. */
export function mobileActionBodyBytes(body: unknown): number {
  if (body === undefined) return 0;
  try {
    const encoded = JSON.stringify(body);
    if (encoded === undefined) return 0;
    // Count UTF-8 bytes, not UTF-16 code units.
    let bytes = 0;
    for (const ch of encoded) {
      const code = ch.codePointAt(0)!;
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return bytes;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Expiry stamp for a stored action, from the server receipt time. */
export function mobileActionExpiry(receivedAtMs: number, retentionDays: number): number {
  return receivedAtMs + retentionDays * 24 * 60 * 60 * 1000;
}

/**
 * Compare two semver-ish versions.
 *
 * Returns a negative number when `a` is older, 0 when equal, a positive number
 * when newer — and **null when either side cannot be parsed**, because a
 * comparison that cannot be made must not be reported as a pass.
 */
export function compareMobileVersions(a: string | null | undefined, b: string | null | undefined): number | null {
  const parse = (v: string | null | undefined): number[] | null => {
    if (typeof v !== "string") return null;
    const core = v.trim().split(/[-+]/)[0] ?? "";
    const parts = core.split(".");
    if (parts.length < 2 || parts.length > 3) return null;
    const nums: number[] = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part)) return null;
      nums.push(Number(part));
    }
    while (nums.length < 3) nums.push(0);
    return nums;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) return left[i]! - right[i]!;
  }
  return 0;
}

/** Where a build stands against the organization's minimum. */
export function mobileUpdateStanding(
  appVersion: string | null | undefined,
  policy: Pick<MobilePolicy, "minAppVersion" | "updateRequirement">,
): MobileUpdateStanding {
  if (!policy.minAppVersion || policy.updateRequirement === "none") return "unknown";
  const cmp = compareMobileVersions(appVersion, policy.minAppVersion);
  if (cmp === null) return "unknown";
  if (cmp >= 0) return "current";
  return policy.updateRequirement === "required" ? "outdated_required" : "outdated_advisory";
}

/** Whole days between two instants, floored, or null when the earlier one is absent. */
export function mobileDaysSince(at: string | Date | null | undefined, nowMs: number): number | null {
  if (!at) return null;
  const ms = at instanceof Date ? at.getTime() : Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((nowMs - ms) / (24 * 60 * 60 * 1000)));
}

/** Seconds left on a PIN lock, or null when it is not locked. */
export function mobilePinLockRemainingSeconds(unlocksAtMs: number | null, nowMs: number): number | null {
  if (unlocksAtMs === null) return null;
  const remaining = Math.ceil((unlocksAtMs - nowMs) / 1000);
  return remaining > 0 ? remaining : null;
}

/**
 * The host of a push endpoint, for reporting.
 *
 * A push endpoint URL is a bearer capability — anyone holding it can send to
 * that subscriber — so only its origin host is ever surfaced.
 */
export function mobilePushEndpointHost(endpoint: string): string {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/.exec(endpoint ?? "");
  return match?.[1] ?? "unparseable";
}

/** The gaps this mobile surface knowingly has, stated rather than implied. */
export function mobileGapReport(): MobileGapReport {
  return {
    note: MOBILE_GAP_NOTE,
    gaps: [
      {
        area: "Offline replay",
        gap: "The server stores a queued action; it never executes one.",
        consequence:
          "A stored action has changed nothing until the device replays it through the ordinary API and reports the outcome. Until then it is a record, not an effect.",
      },
      {
        area: "Replay duplication",
        gap: "Target endpoints are not idempotent and this queue cannot make them so.",
        consequence:
          "Replaying an action already marked applied would apply it twice. The stored status is the only guard, so a client that ignores it can duplicate a write.",
      },
      {
        area: "Push delivery",
        gap: "Acceptance by the push service is the last thing this API can observe.",
        consequence:
          "A notification counted as accepted may still be suppressed, delayed or dropped by the browser or operating system, and no receipt comes back.",
      },
      {
        area: "Version enforcement",
        gap: "The API does not refuse requests from an out-of-date build.",
        consequence:
          "An update requirement is advice to a cooperating client. A modified client, or one that never reads the policy, keeps working.",
      },
      {
        area: "Device attestation",
        gap: "A device id is supplied by the client and is not attested.",
        consequence:
          "Ownership is enforced — a device belonging to another account is refused — but this API cannot prove that the hardware is what it claims to be, nor detect a rooted or emulated device.",
      },
      {
        area: "PIN strength",
        gap: "A 4-digit PIN is 10 000 combinations.",
        consequence:
          "The throttle bounds attempts against this endpoint; it does not make a short PIN strong. The PIN is a re-entry factor for an already authenticated session, nothing more.",
      },
    ],
  };
}
