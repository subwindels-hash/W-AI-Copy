/**
 * Session 117 — Mobile offline durability, device trust and push health.
 *
 * `services/mobileAuth.service.ts` and `services/push.service.ts` are not
 * rewritten by this file. Device registration, the bcrypt PIN, the WebAuthn
 * flow and Web Push delivery all stay exactly where they were. This service is
 * what was missing around them.
 *
 * THE DEFECT THIS FILE EXISTS FOR
 * -------------------------------
 * The PWA queued writes in IndexedDB while offline and POSTed them to
 * `/api/v1/mobile/offline/sync` when the network returned. The handler updated
 * `lastSeenAt`, answered `received: <n>` and dropped the array. Its own comment
 * claimed the actions were persisted "for auditing"; they were not persisted
 * anywhere. The client then deleted every action it had just sent. Work done
 * offline was destroyed, and the user was told the sync succeeded.
 *
 * The fix is a durable queue with a receipt per action. What it deliberately
 * does NOT do is execute anything: replay happens on the device, through the
 * ordinary authenticated API, so authorization, validation and rate limiting
 * are applied by the same middleware that would have applied them online. A
 * server-side re-dispatch would run a write with its request context
 * reconstructed by us rather than by Express, which is precisely the kind of
 * shortcut this repository refuses to take. `stored` therefore never means
 * `applied`, and the payload says so.
 *
 * WHAT THIS SERVICE REFUSES TO CLAIM
 * ----------------------------------
 *   - A stored action has had no effect. `appliedAt` is set only when the
 *     device reports that it replayed the action, and the status it reports is
 *     recorded verbatim, including a failure.
 *   - A rejected action is never counted as handled: the receipt sets
 *     `retainLocally` so the client keeps it.
 *   - A version comparison that cannot be made is `unknown`, not `current`.
 *   - Push counts describe deliveries recorded here since this ledger existed,
 *     and acceptance by a push service is not display on a device.
 *   - The configuration report reads the environment and reports "configured".
 *
 * Keys:
 *   organization-scoped (Session 89 namespace sweep):
 *     mob:policy:<org>:current
 *   principal-scoped — one key per user id, because a device, its queue and its
 *   PIN belong to the person, and several of these paths are read before an
 *   organization has been resolved:
 *     mob:action:<user>:<actionId>   mob:actidx:<user>:<deviceId>
 *     mob:pinfail:<user>:<deviceId>  mob:pinlock:<user>:<deviceId>
 *     mob:event:<user>               mob:pushlog:<user>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/result.js";
import {
  MOBILE_ACTION_MAX_BATCH,
  MOBILE_ACTION_MAX_BODY_BYTES,
  MOBILE_ACTION_RETENTION_DAYS,
  MOBILE_BODY_NOTE,
  MOBILE_CONFIG_NOTE,
  MOBILE_DEVICE_NOTE,
  MOBILE_DEVICE_STALE_DAYS,
  MOBILE_DUPLICATE_NOTE,
  MOBILE_EVENT_LIMIT,
  MOBILE_LEDGER_NOTE,
  MOBILE_MAX_ACTION_PAGE,
  MOBILE_PIN_FAILURE_WINDOW_SECONDS,
  MOBILE_PIN_LOCKOUT_SECONDS,
  MOBILE_PIN_MAX_ATTEMPTS,
  MOBILE_PIN_NOTE,
  MOBILE_PUSH_FAILURE_RETIREMENT,
  MOBILE_PUSH_LOG_LIMIT,
  MOBILE_PUSH_NOTE,
  MOBILE_QUEUE_MAX_ACTIONS,
  MOBILE_QUEUE_NOTE,
  MOBILE_REPLAY_NOTE,
  MOBILE_RETENTION_NOTE,
  MOBILE_STORAGE_NOTE,
  defaultMobilePolicy,
  emptyMobileActionCounts,
  mobileActionBodyBytes,
  mobileActionExpiry,
  mobileDaysSince,
  mobileGapReport,
  mobilePinLockRemainingSeconds,
  mobilePushEndpointHost,
  mobileUpdateStanding,
  normalizeMobileActionPath,
} from "@windels/shared/mobile";
import type {
  MobileActionDetail,
  MobileActionInput,
  MobileActionReceipt,
  MobileActionStatus,
  MobileActionSummary,
  MobileConfigurationCheck,
  MobileConfigurationReport,
  MobileDeviceInventory,
  MobileDeviceView,
  MobileEvent,
  MobileEventKind,
  MobileEventPage,
  MobileOfflineSummary,
  MobilePinLockState,
  MobilePolicy,
  MobilePolicyUpdateInput,
  MobilePushDeliveryRecord,
  MobilePushHealth,
  MobilePushSubscriptionView,
  MobileReplayPlan,
  MobileSelfAssurance,
  MobileSyncSubmission,
} from "@windels/shared/mobile";

/* ── Keys ──────────────────────────────────────────────────────────────── */

const kPolicy = (org: string) => `mob:policy:${org}:current`;
const kAction = (user: string, actionId: string) => `mob:action:${user}:${actionId}`;
const kActionIdx = (user: string, deviceId: string) => `mob:actidx:${user}:${deviceId}`;
const kDeviceIdx = (user: string) => `mob:actdev:${user}`;
const kPinFail = (user: string, deviceId: string) => `mob:pinfail:${user}:${deviceId}`;
const kPinLock = (user: string, deviceId: string) => `mob:pinlock:${user}:${deviceId}`;
const kEvents = (user: string) => `mob:event:${user}`;
const kPushLog = (user: string) => `mob:pushlog:${user}`;

/** The VAPID pair committed to `config/env.ts` as a development default. */
const REPOSITORY_DEFAULT_VAPID_PUBLIC_KEY =
  "BKwIHmBhWdeXUpnNQ_IGQOnQb0jry-q1Fw0jXO_vi9N4BChQmayUVu1ii4UeVaO4jjrV6CV7EyeFSbJWmxe46e4";

/** The constant `GET /mobile/config` has always served. */
const PUBLIC_CONFIG_MIN_APP_VERSION = "0.15.0";

/* ── Stored shapes ─────────────────────────────────────────────────────── */

interface StoredAction {
  id: string;
  userId: string;
  deviceId: string;
  organizationId: string | null;
  method: MobileActionSummary["method"];
  path: string;
  bodyStored: boolean;
  bodyBytes: number;
  body?: unknown;
  queuedAt: string | null;
  receivedAt: string;
  expiresAt: string;
  status: MobileActionStatus;
  resolvedAt: string | null;
  outcomeStatusCode: number | null;
  outcomeError: string | null;
  replayAttempts: number;
}

interface StoredPolicy {
  minAppVersion: string | null;
  updateRequirement: MobilePolicy["updateRequirement"];
  offlineQueueEnabled: boolean;
  maxQueuedActions: number;
  actionRetentionDays: number;
  pinAllowed: boolean;
  pinMinLength: number;
  biometricRecommended: boolean;
  pushEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

/* ── Small helpers ─────────────────────────────────────────────────────── */

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function summarize(action: StoredAction): MobileActionSummary {
  return {
    id: action.id,
    deviceId: action.deviceId,
    method: action.method,
    path: action.path,
    status: action.status,
    bodyStored: action.bodyStored,
    bodyBytes: action.bodyBytes,
    queuedAt: action.queuedAt,
    receivedAt: action.receivedAt,
    expiresAt: action.expiresAt,
    resolvedAt: action.resolvedAt,
    outcomeStatusCode: action.outcomeStatusCode,
    outcomeError: action.outcomeError,
    replayAttempts: action.replayAttempts,
  };
}

/**
 * Expire a stored action whose retention window has passed.
 *
 * Expiry is evaluated on read rather than by a sweeper, so a record can never
 * be reported `stored` after its own expiry stamp. An expired action is kept
 * with `status: "expired"` — the user is entitled to know that a write they
 * queued was dropped without being applied.
 */
function applyExpiry(action: StoredAction, nowMs: number): { action: StoredAction; changed: boolean } {
  if (action.status !== "stored") return { action, changed: false };
  const expiresMs = Date.parse(action.expiresAt);
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    return { action: { ...action, status: "expired" }, changed: true };
  }
  return { action, changed: false };
}

export const MobileSyncService = {
  /* ── Organization policy ──────────────────────────────────────────── */

  async getPolicy(organizationId: string): Promise<MobilePolicy> {
    const stored = await readJson<StoredPolicy>(kPolicy(organizationId));
    const base = defaultMobilePolicy(organizationId);
    if (!stored) return base;
    return {
      ...base,
      minAppVersion: stored.minAppVersion ?? null,
      updateRequirement: stored.updateRequirement ?? base.updateRequirement,
      offlineQueueEnabled: stored.offlineQueueEnabled ?? base.offlineQueueEnabled,
      maxQueuedActions: stored.maxQueuedActions ?? base.maxQueuedActions,
      actionRetentionDays: stored.actionRetentionDays ?? base.actionRetentionDays,
      pinAllowed: stored.pinAllowed ?? base.pinAllowed,
      pinMinLength: stored.pinMinLength ?? base.pinMinLength,
      biometricRecommended: stored.biometricRecommended ?? base.biometricRecommended,
      pushEnabled: stored.pushEnabled ?? base.pushEnabled,
      updatedAt: stored.updatedAt ?? null,
      updatedBy: stored.updatedBy ?? null,
      isDefault: false,
    };
  },

  async updatePolicy(
    organizationId: string,
    actorId: string,
    input: MobilePolicyUpdateInput,
  ): Promise<MobilePolicy> {
    const current = await this.getPolicy(organizationId);
    const next: StoredPolicy = {
      minAppVersion:
        input.minAppVersion === undefined ? current.minAppVersion : input.minAppVersion,
      updateRequirement: input.updateRequirement ?? current.updateRequirement,
      offlineQueueEnabled: input.offlineQueueEnabled ?? current.offlineQueueEnabled,
      maxQueuedActions: input.maxQueuedActions ?? current.maxQueuedActions,
      actionRetentionDays: input.actionRetentionDays ?? current.actionRetentionDays,
      pinAllowed: input.pinAllowed ?? current.pinAllowed,
      pinMinLength: input.pinMinLength ?? current.pinMinLength,
      biometricRecommended: input.biometricRecommended ?? current.biometricRecommended,
      pushEnabled: input.pushEnabled ?? current.pushEnabled,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };

    // An update requirement with no minimum version cannot be evaluated, so it
    // would report `unknown` for every device while looking like a control.
    if (next.updateRequirement !== "none" && !next.minAppVersion) {
      throw AppError.badRequest(
        "An update requirement needs a minAppVersion. Without one every device reports an unknown standing, which would look like a policy while checking nothing.",
      );
    }

    await redis.set(kPolicy(organizationId), JSON.stringify(next));
    await this.recordEvent(actorId, {
      kind: "policy_updated",
      organizationId,
      deviceId: null,
      detail: "Mobile policy updated.",
      metadata: {
        updateRequirement: next.updateRequirement,
        minAppVersion: next.minAppVersion,
        offlineQueueEnabled: next.offlineQueueEnabled,
        actionRetentionDays: next.actionRetentionDays,
      },
    });
    return this.getPolicy(organizationId);
  },

  /* ── Device ownership ─────────────────────────────────────────────── */

  /**
   * Refuse a device id that belongs to somebody else.
   *
   * `POST /mobile/devices/register` upserted on the supplied id with an update
   * branch that was not scoped by user, so any authenticated caller could
   * overwrite another account's device row — and the response returned that
   * row, `pinHash` included. Callers pass through here first.
   *
   * Returns the device when it exists and belongs to the caller, and `null`
   * when no such device exists yet (a first registration).
   */
  async assertDeviceOwnership(userId: string, deviceId: string): Promise<any | null> {
    if (!deviceId) return null;
    const device = await prisma.mobileDevice.findFirst({ where: { id: deviceId } });
    if (!device) return null;
    if (device.userId !== userId) {
      await this.recordEvent(userId, {
        kind: "device_ownership_refused",
        deviceId,
        organizationId: null,
        detail: "A device id registered to another account was refused.",
        metadata: { deviceId },
      });
      throw AppError.forbidden(
        "That device id is registered to another account. Device ids are not transferable; register without one to be issued a new device.",
      );
    }
    return device;
  },

  /** A device row reduced to what may leave the server. Never carries a secret. */
  async deviceView(device: any, opts: { policy?: MobilePolicy; nowMs?: number } = {}): Promise<MobileDeviceView> {
    const nowMs = opts.nowMs ?? Date.now();
    const [pushSubscriptions, biometricCredentials] = await Promise.all([
      prisma.pushSubscription.count({ where: { deviceId: device.id } }).catch(() => 0),
      prisma.biometricCredential.count({ where: { deviceId: device.id } }).catch(() => 0),
    ]);
    const daysSinceLastSeen = mobileDaysSince(device.lastSeenAt ?? null, nowMs);
    const pinLock = await this.pinLockState(device.userId, device.id, nowMs);
    return {
      id: device.id,
      platform: device.platform,
      deviceName: device.deviceName ?? null,
      osVersion: device.osVersion ?? null,
      appVersion: device.appVersion ?? null,
      deviceModel: device.deviceModel ?? null,
      biometricEnabled: Boolean(device.biometricEnabled),
      pinConfigured: Boolean(device.pinHash),
      biometricCredentials,
      pushSubscriptions,
      lastSeenAt: iso(device.lastSeenAt),
      createdAt: iso(device.createdAt),
      daysSinceLastSeen,
      stale: daysSinceLastSeen !== null && daysSinceLastSeen >= MOBILE_DEVICE_STALE_DAYS,
      updateStanding: opts.policy
        ? mobileUpdateStanding(device.appVersion ?? null, opts.policy)
        : "unknown",
      pinLock: pinLock.failedAttempts > 0 || pinLock.locked ? pinLock : null,
      note: MOBILE_DEVICE_NOTE,
    };
  },

  async deviceInventory(userId: string, organizationId: string | null): Promise<MobileDeviceInventory> {
    const nowMs = Date.now();
    const policy = organizationId ? await this.getPolicy(organizationId) : undefined;
    const rows = await prisma.mobileDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
    const devices: MobileDeviceView[] = [];
    for (const row of rows) devices.push(await this.deviceView(row, { policy, nowMs }));
    return {
      devices,
      total: devices.length,
      stale: devices.filter((d) => d.stale).length,
      withBiometrics: devices.filter((d) => d.biometricEnabled || d.biometricCredentials > 0).length,
      withPin: devices.filter((d) => d.pinConfigured).length,
      withPush: devices.filter((d) => d.pushSubscriptions > 0).length,
      staleAfterDays: MOBILE_DEVICE_STALE_DAYS,
      note: MOBILE_DEVICE_NOTE,
    };
  },

  async deviceTrust(userId: string, deviceId: string, organizationId: string | null): Promise<MobileDeviceView> {
    const device = await prisma.mobileDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw AppError.notFound("Device not found");
    const policy = organizationId ? await this.getPolicy(organizationId) : undefined;
    return this.deviceView(device, { policy });
  },

  /**
   * Remove a device PIN.
   *
   * There was no way to do this: `setPin` could overwrite a PIN but nothing
   * could take one away, so a user who forgot theirs had a device permanently
   * carrying a secret they could not use. Scoped by user id, and the hash is
   * cleared rather than blanked to an empty string, which `verifyPin` would
   * treat as "no PIN set" anyway but which would leave a column looking set.
   */
  async clearPin(userId: string, deviceId: string): Promise<{ deviceId: string; pinConfigured: false; note: string }> {
    const result = await prisma.mobileDevice.updateMany({
      where: { id: deviceId, userId },
      data: { pinHash: null },
    });
    if (result.count === 0) throw AppError.notFound("Device not found");
    await redis.del(kPinFail(userId, deviceId));
    await redis.del(kPinLock(userId, deviceId));
    await this.recordEvent(userId, {
      kind: "pin_cleared",
      deviceId,
      organizationId: null,
      detail: "Device PIN removed and its failed-attempt counter cleared.",
      metadata: { deviceId },
    });
    return {
      deviceId,
      pinConfigured: false,
      note: "The PIN was removed. Biometric credentials and push subscriptions on this device are untouched.",
    };
  },

  /* ── PIN throttle ─────────────────────────────────────────────────── */

  async pinLockState(userId: string, deviceId: string, nowMs = Date.now()): Promise<MobilePinLockState> {
    const [lockRaw, failRaw] = await Promise.all([
      redis.get(kPinLock(userId, deviceId)),
      redis.get(kPinFail(userId, deviceId)),
    ]);
    const unlocksAtMs = lockRaw ? Number(lockRaw) : null;
    const remaining = mobilePinLockRemainingSeconds(
      unlocksAtMs !== null && Number.isFinite(unlocksAtMs) ? unlocksAtMs : null,
      nowMs,
    );
    const failures = failRaw ? JSON.parse(failRaw) : [];
    const windowStart = nowMs - MOBILE_PIN_FAILURE_WINDOW_SECONDS * 1000;
    const recent: number[] = Array.isArray(failures)
      ? failures.filter((t: unknown) => typeof t === "number" && t >= windowStart)
      : [];
    const locked = remaining !== null;
    return {
      deviceId,
      locked,
      failedAttempts: recent.length,
      remainingAttempts: Math.max(0, MOBILE_PIN_MAX_ATTEMPTS - recent.length),
      unlocksAt: locked ? new Date(unlocksAtMs!).toISOString() : null,
      retryAfterSeconds: remaining,
      maxAttempts: MOBILE_PIN_MAX_ATTEMPTS,
      windowSeconds: MOBILE_PIN_FAILURE_WINDOW_SECONDS,
      note: MOBILE_PIN_NOTE,
    };
  },

  /** Refuse a PIN attempt while the device's PIN is locked. */
  async assertPinAttemptAllowed(userId: string, deviceId: string): Promise<void> {
    const state = await this.pinLockState(userId, deviceId);
    if (state.locked) {
      throw AppError.tooManyRequests(
        `Too many incorrect PIN attempts for this device. Try again in ${state.retryAfterSeconds} seconds, or sign in again to reset it.`,
      );
    }
  },

  async recordPinFailure(userId: string, deviceId: string): Promise<MobilePinLockState> {
    const nowMs = Date.now();
    const windowStart = nowMs - MOBILE_PIN_FAILURE_WINDOW_SECONDS * 1000;
    const raw = await redis.get(kPinFail(userId, deviceId));
    const parsed = raw ? JSON.parse(raw) : [];
    const recent: number[] = (Array.isArray(parsed) ? parsed : [])
      .filter((t: unknown) => typeof t === "number" && t >= windowStart)
      .concat(nowMs);
    await redis.set(
      kPinFail(userId, deviceId),
      JSON.stringify(recent),
      "EX",
      MOBILE_PIN_FAILURE_WINDOW_SECONDS,
    );
    await this.recordEvent(userId, {
      kind: "pin_failed",
      deviceId,
      organizationId: null,
      detail: "Incorrect device PIN.",
      metadata: { failedAttempts: recent.length, maxAttempts: MOBILE_PIN_MAX_ATTEMPTS },
    });

    if (recent.length >= MOBILE_PIN_MAX_ATTEMPTS) {
      const unlocksAt = nowMs + MOBILE_PIN_LOCKOUT_SECONDS * 1000;
      await redis.set(
        kPinLock(userId, deviceId),
        String(unlocksAt),
        "EX",
        MOBILE_PIN_LOCKOUT_SECONDS,
      );
      await this.recordEvent(userId, {
        kind: "pin_locked",
        deviceId,
        organizationId: null,
        detail: `Device PIN locked for ${MOBILE_PIN_LOCKOUT_SECONDS} seconds after ${recent.length} incorrect attempts.`,
        metadata: { lockoutSeconds: MOBILE_PIN_LOCKOUT_SECONDS },
      });
    }
    return this.pinLockState(userId, deviceId, nowMs);
  },

  async clearPinFailures(userId: string, deviceId: string): Promise<void> {
    await redis.del(kPinFail(userId, deviceId));
    await redis.del(kPinLock(userId, deviceId));
  },

  /* ── The offline queue ────────────────────────────────────────────── */

  /**
   * Store a batch of queued actions and return a receipt for every one.
   *
   * The caller's device ownership is checked by the route before this runs.
   * Nothing here executes an action — see the file header.
   */
  async submitActions(
    userId: string,
    organizationId: string | null,
    deviceId: string,
    actions: MobileActionInput[],
  ): Promise<MobileSyncSubmission> {
    const policy = organizationId
      ? await this.getPolicy(organizationId)
      : defaultMobilePolicy("unscoped");
    const nowMs = Date.now();
    const receipts: MobileActionReceipt[] = [];
    let stored = 0;
    let duplicates = 0;
    let rejected = 0;

    let depth = await this.queueDepth(userId, deviceId);
    const limit = Math.min(policy.maxQueuedActions, MOBILE_QUEUE_MAX_ACTIONS);

    for (const action of actions.slice(0, MOBILE_ACTION_MAX_BATCH)) {
      const reject = (reason: MobileActionReceipt["reason"], detail: string) => {
        rejected += 1;
        receipts.push({
          actionId: action?.id ?? "",
          outcome: "rejected",
          status: null,
          reason,
          retainLocally: true,
          detail,
        });
      };

      if (!action?.id || typeof action.id !== "string") {
        reject("action_id_invalid", "The action has no id, so it cannot be deduplicated.");
        continue;
      }
      if (!policy.offlineQueueEnabled) {
        reject(
          "queue_disabled",
          "This organization has turned the offline queue off. The action was not stored; it is still on the device.",
        );
        continue;
      }

      const existingRaw = await redis.get(kAction(userId, action.id));
      if (existingRaw) {
        const existing = JSON.parse(existingRaw) as StoredAction;
        duplicates += 1;
        receipts.push({
          actionId: action.id,
          outcome: "duplicate",
          status: existing.status,
          reason: null,
          retainLocally: false,
          detail: `${MOBILE_DUPLICATE_NOTE} This id is already held with status "${existing.status}".`,
        });
        continue;
      }

      const normalized = normalizeMobileActionPath(action.path);
      if (normalized.ok === false) {
        reject(normalized.reason, normalized.detail);
        continue;
      }

      const bytes = mobileActionBodyBytes(action.body);
      if (bytes > MOBILE_ACTION_MAX_BODY_BYTES) {
        reject(
          "body_too_large",
          `The body is ${Number.isFinite(bytes) ? `${bytes} bytes` : "not serialisable"}, over the ${MOBILE_ACTION_MAX_BODY_BYTES}-byte cap. It was not truncated: a partial body would replay as a corrupted write.`,
        );
        continue;
      }

      if (depth >= limit) {
        reject(
          "queue_full",
          `This device already holds ${depth} pending actions, at the limit of ${limit}. Replay or discard some before submitting more; nothing was dropped to make room.`,
        );
        continue;
      }

      const record: StoredAction = {
        id: action.id,
        userId,
        deviceId,
        organizationId,
        method: action.method,
        path: normalized.path,
        bodyStored: action.body !== undefined,
        bodyBytes: bytes,
        body: action.body,
        queuedAt: iso(action.queuedAt as any),
        receivedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(mobileActionExpiry(nowMs, policy.actionRetentionDays)).toISOString(),
        status: "stored",
        resolvedAt: null,
        outcomeStatusCode: null,
        outcomeError: null,
        replayAttempts: 0,
      };
      await redis.set(kAction(userId, action.id), JSON.stringify(record));
      await redis.zadd(kActionIdx(userId, deviceId), nowMs, action.id);
      await redis.sadd(kDeviceIdx(userId), deviceId);
      depth += 1;
      stored += 1;
      receipts.push({
        actionId: action.id,
        outcome: "stored",
        status: "stored",
        reason: null,
        retainLocally: false,
        detail: MOBILE_STORAGE_NOTE,
      });
    }

    if (stored > 0 || rejected > 0) {
      await this.recordEvent(userId, {
        kind: stored > 0 ? "actions_submitted" : "action_rejected",
        deviceId,
        organizationId,
        detail: `${stored} stored, ${duplicates} duplicate, ${rejected} rejected.`,
        metadata: { stored, duplicates, rejected, received: actions.length },
      });
    }

    return {
      deviceId,
      received: actions.length,
      stored,
      duplicates,
      rejected,
      receipts,
      queueDepth: await this.queueDepth(userId, deviceId),
      storageNote: MOBILE_STORAGE_NOTE,
      queueNote: MOBILE_QUEUE_NOTE,
      replayNote: MOBILE_REPLAY_NOTE,
    };
  },

  /** Actions currently in `stored` state for one device. */
  async queueDepth(userId: string, deviceId: string): Promise<number> {
    const actions = await this.loadDeviceActions(userId, deviceId);
    return actions.filter((a) => a.status === "stored").length;
  },

  async loadDeviceActions(userId: string, deviceId: string): Promise<StoredAction[]> {
    const ids = await redis.zrange(kActionIdx(userId, deviceId), 0, -1);
    const nowMs = Date.now();
    const out: StoredAction[] = [];
    for (const id of ids) {
      const raw = await redis.get(kAction(userId, id));
      if (!raw) continue;
      let parsed: StoredAction;
      try {
        parsed = JSON.parse(raw) as StoredAction;
      } catch {
        continue;
      }
      // Fail closed: an index entry is not proof of ownership.
      if (parsed.userId !== userId || parsed.deviceId !== deviceId) continue;
      const { action, changed } = applyExpiry(parsed, nowMs);
      if (changed) {
        await redis.set(kAction(userId, action.id), JSON.stringify(action));
        await this.recordEvent(userId, {
          kind: "action_expired",
          deviceId,
          organizationId: action.organizationId,
          detail: `A queued ${action.method} to ${action.path} expired without being applied.`,
          metadata: { actionId: action.id, expiresAt: action.expiresAt },
        });
      }
      out.push(action);
    }
    return out;
  },

  async listDeviceIds(userId: string): Promise<string[]> {
    const fromIndex = await redis.smembers(kDeviceIdx(userId));
    if (fromIndex.length > 0) return fromIndex;
    const rows = await prisma.mobileDevice.findMany({ where: { userId }, select: { id: true } });
    return rows.map((r: any) => r.id);
  },

  async listActions(
    userId: string,
    filters: { deviceId?: string; status?: MobileActionStatus; limit?: number } = {},
  ): Promise<{ actions: MobileActionSummary[]; total: number; truncated: boolean; note: string }> {
    const deviceIds = filters.deviceId ? [filters.deviceId] : await this.listDeviceIds(userId);
    let all: StoredAction[] = [];
    for (const deviceId of deviceIds) {
      all = all.concat(await this.loadDeviceActions(userId, deviceId));
    }
    all.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    const matching = filters.status ? all.filter((a) => a.status === filters.status) : all;
    const limit = Math.min(filters.limit ?? 50, MOBILE_MAX_ACTION_PAGE);
    return {
      actions: matching.slice(0, limit).map(summarize),
      total: matching.length,
      truncated: matching.length > limit,
      note: MOBILE_STORAGE_NOTE,
    };
  },

  async getAction(userId: string, actionId: string): Promise<MobileActionDetail> {
    const raw = await redis.get(kAction(userId, actionId));
    if (!raw) throw AppError.notFound("Queued action not found");
    let parsed: StoredAction;
    try {
      parsed = JSON.parse(raw) as StoredAction;
    } catch {
      throw AppError.notFound("Queued action not found");
    }
    if (parsed.userId !== userId) throw AppError.notFound("Queued action not found");
    const { action, changed } = applyExpiry(parsed, Date.now());
    if (changed) await redis.set(kAction(userId, action.id), JSON.stringify(action));
    return { ...summarize(action), body: action.body ?? null, note: MOBILE_BODY_NOTE };
  },

  /**
   * The ordered set of actions a device still has to replay.
   *
   * Oldest first by *server* receipt time, never by the device clock: a phone
   * that was offline may have a wrong clock, and two devices' clocks certainly
   * do not agree.
   */
  async replayPlan(userId: string, deviceId: string, limit = 50): Promise<MobileReplayPlan> {
    const actions = (await this.loadDeviceActions(userId, deviceId))
      .filter((a) => a.status === "stored")
      .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
    const capped = Math.min(limit, MOBILE_MAX_ACTION_PAGE);
    return {
      deviceId,
      generatedAt: new Date().toISOString(),
      actions: actions.slice(0, capped).map(summarize),
      pending: actions.length,
      truncated: actions.length > capped,
      note: "Replay these in the order given. Each one must be re-issued by the device through the ordinary API and then resolved here with the status the API returned.",
      replayNote: MOBILE_REPLAY_NOTE,
    };
  },

  /**
   * Record what happened when the device replayed an action.
   *
   * The reported status code is stored verbatim, including a failure. An action
   * already resolved is refused rather than overwritten: a second outcome for
   * one action means the client replayed it twice, and quietly accepting that
   * would hide a duplicated write.
   */
  async resolveAction(
    userId: string,
    actionId: string,
    outcome: "applied" | "failed",
    detail: { statusCode?: number; error?: string } = {},
  ): Promise<MobileActionSummary> {
    const raw = await redis.get(kAction(userId, actionId));
    if (!raw) throw AppError.notFound("Queued action not found");
    const parsed = JSON.parse(raw) as StoredAction;
    if (parsed.userId !== userId) throw AppError.notFound("Queued action not found");
    if (parsed.status === "applied") {
      throw AppError.badRequest(
        "That action is already recorded as applied. Reporting a second outcome would mean it was replayed twice, and the target endpoints are not idempotent.",
      );
    }
    if (parsed.status === "discarded" || parsed.status === "expired") {
      throw AppError.badRequest(
        `That action is ${parsed.status} and cannot be resolved. Submit it again if it still needs to be applied.`,
      );
    }
    const next: StoredAction = {
      ...parsed,
      status: outcome,
      resolvedAt: new Date().toISOString(),
      outcomeStatusCode: detail.statusCode ?? null,
      outcomeError: detail.error ?? null,
      replayAttempts: parsed.replayAttempts + 1,
    };
    await redis.set(kAction(userId, actionId), JSON.stringify(next));
    await this.recordEvent(userId, {
      kind: "action_resolved",
      deviceId: next.deviceId,
      organizationId: next.organizationId,
      detail: `Device reported ${outcome} for ${next.method} ${next.path}.`,
      metadata: {
        actionId,
        outcome,
        statusCode: detail.statusCode ?? null,
        attempts: next.replayAttempts,
      },
    });
    return summarize(next);
  },

  /** The user drops a queued action deliberately. Recorded, never silent. */
  async discardAction(userId: string, actionId: string, reason?: string): Promise<MobileActionSummary> {
    const raw = await redis.get(kAction(userId, actionId));
    if (!raw) throw AppError.notFound("Queued action not found");
    const parsed = JSON.parse(raw) as StoredAction;
    if (parsed.userId !== userId) throw AppError.notFound("Queued action not found");
    if (parsed.status === "applied") {
      throw AppError.badRequest(
        "That action is already applied. Discarding the record would not undo the write it made.",
      );
    }
    const next: StoredAction = {
      ...parsed,
      status: "discarded",
      resolvedAt: new Date().toISOString(),
      outcomeError: reason ?? null,
    };
    await redis.set(kAction(userId, actionId), JSON.stringify(next));
    await this.recordEvent(userId, {
      kind: "action_discarded",
      deviceId: next.deviceId,
      organizationId: next.organizationId,
      detail: `Queued ${next.method} to ${next.path} discarded without being applied.`,
      metadata: { actionId, reason: reason ?? null },
    });
    return summarize(next);
  },

  async offlineSummary(userId: string, organizationId: string | null): Promise<MobileOfflineSummary> {
    const policy = organizationId
      ? await this.getPolicy(organizationId)
      : defaultMobilePolicy("unscoped");
    const deviceIds = await this.listDeviceIds(userId);
    const byStatus = emptyMobileActionCounts();
    const pendingByDevice: Array<{ deviceId: string; pending: number }> = [];
    let oldestPendingMs: number | null = null;
    let total = 0;

    for (const deviceId of deviceIds) {
      const actions = await this.loadDeviceActions(userId, deviceId);
      let pending = 0;
      for (const action of actions) {
        total += 1;
        byStatus[action.status] += 1;
        if (action.status === "stored") {
          pending += 1;
          const ms = Date.parse(action.receivedAt);
          if (Number.isFinite(ms) && (oldestPendingMs === null || ms < oldestPendingMs)) {
            oldestPendingMs = ms;
          }
        }
      }
      if (actions.length > 0) pendingByDevice.push({ deviceId, pending });
    }

    return {
      byStatus,
      totalRecorded: total,
      pending: byStatus.stored,
      oldestPendingAt: oldestPendingMs === null ? null : new Date(oldestPendingMs).toISOString(),
      pendingByDevice,
      retentionDays: policy.actionRetentionDays,
      queueLimitPerDevice: Math.min(policy.maxQueuedActions, MOBILE_QUEUE_MAX_ACTIONS),
      storageNote: MOBILE_STORAGE_NOTE,
      retentionNote: MOBILE_RETENTION_NOTE,
    };
  },

  /* ── Push health ──────────────────────────────────────────────────── */

  /**
   * Record a push send. Called best-effort from `push.service.ts`; a failed
   * bookkeeping write must never turn a delivered notification into an error.
   */
  async recordPushDelivery(
    userId: string,
    record: { notificationId?: string | null; accepted: number; attempted: number; detail?: string },
  ): Promise<void> {
    const entry: MobilePushDeliveryRecord = {
      at: new Date().toISOString(),
      notificationId: record.notificationId ?? null,
      accepted: record.accepted,
      attempted: record.attempted,
      kind: "delivery",
      detail: record.detail ?? null,
    };
    await redis.lpush(kPushLog(userId), JSON.stringify(entry));
    await redis.ltrim(kPushLog(userId), 0, MOBILE_PUSH_LOG_LIMIT - 1);
  },

  /** Record that a subscription was retired after repeated delivery failures. */
  async recordPushSubscriptionRetired(
    userId: string,
    detail: { endpointHost: string; failures: number },
  ): Promise<void> {
    const entry: MobilePushDeliveryRecord = {
      at: new Date().toISOString(),
      notificationId: null,
      accepted: 0,
      attempted: 0,
      kind: "subscription_retired",
      detail: `Subscription on ${detail.endpointHost} removed after ${detail.failures} consecutive delivery failures.`,
    };
    await redis.lpush(kPushLog(userId), JSON.stringify(entry));
    await redis.ltrim(kPushLog(userId), 0, MOBILE_PUSH_LOG_LIMIT - 1);
    await this.recordEvent(userId, {
      kind: "push_subscription_retired",
      deviceId: null,
      organizationId: null,
      detail: entry.detail!,
      metadata: { endpointHost: detail.endpointHost, failures: detail.failures },
    });
  },

  async pushHealth(userId: string): Promise<MobilePushHealth> {
    const rows = await prisma.pushSubscription.findMany({ where: { userId } });
    const subscriptions: MobilePushSubscriptionView[] = rows.map((row: any) => ({
      id: row.id,
      deviceId: row.deviceId,
      endpointHost: mobilePushEndpointHost(row.endpoint ?? ""),
      failures: row.failures ?? 0,
      lastDeliveredAt: iso(row.lastDeliveredAt),
      createdAt: iso(row.createdAt),
      atRisk: (row.failures ?? 0) >= MOBILE_PUSH_FAILURE_RETIREMENT - 1,
    }));

    const raw = await redis.lrange(kPushLog(userId), 0, MOBILE_PUSH_LOG_LIMIT - 1);
    const records: MobilePushDeliveryRecord[] = [];
    for (const item of raw) {
      try {
        records.push(JSON.parse(item) as MobilePushDeliveryRecord);
      } catch {
        /* a record we cannot parse is skipped, never counted as a delivery */
      }
    }
    const deliveries = records.filter((r) => r.kind === "delivery");

    return {
      subscriptions,
      activeSubscriptions: subscriptions.length,
      atRiskSubscriptions: subscriptions.filter((s) => s.atRisk).length,
      recordedDeliveries: deliveries.length,
      recordedAccepted: deliveries.reduce((a, r) => a + r.accepted, 0),
      recordedAttempted: deliveries.reduce((a, r) => a + r.attempted, 0),
      lastDeliveryAt: deliveries[0]?.at ?? null,
      retiredSubscriptions: records.filter((r) => r.kind === "subscription_retired").length,
      retirementThreshold: MOBILE_PUSH_FAILURE_RETIREMENT,
      recent: records.slice(0, 50),
      note: MOBILE_PUSH_NOTE,
      ledgerNote: MOBILE_LEDGER_NOTE,
    };
  },

  /* ── Ledger ───────────────────────────────────────────────────────── */

  async recordEvent(
    userId: string,
    event: {
      kind: MobileEventKind;
      deviceId: string | null;
      organizationId: string | null;
      detail: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ): Promise<void> {
    const record: MobileEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      kind: event.kind,
      userId,
      deviceId: event.deviceId,
      organizationId: event.organizationId,
      detail: event.detail,
      metadata: event.metadata ?? {},
    };
    await redis.lpush(kEvents(userId), JSON.stringify(record));
    await redis.ltrim(kEvents(userId), 0, MOBILE_EVENT_LIMIT - 1);
  },

  async listEvents(
    userId: string,
    filters: { kind?: MobileEventKind; deviceId?: string; limit?: number } = {},
  ): Promise<MobileEventPage> {
    const raw = await redis.lrange(kEvents(userId), 0, MOBILE_EVENT_LIMIT - 1);
    const events: MobileEvent[] = [];
    for (const item of raw) {
      try {
        events.push(JSON.parse(item) as MobileEvent);
      } catch {
        /* skip */
      }
    }
    const filtered = events.filter(
      (e) =>
        (!filters.kind || e.kind === filters.kind) &&
        (!filters.deviceId || e.deviceId === filters.deviceId),
    );
    const limit = Math.min(filters.limit ?? 50, MOBILE_MAX_ACTION_PAGE);
    return {
      events: filtered.slice(0, limit),
      stored: events.length,
      retentionLimit: MOBILE_EVENT_LIMIT,
      oldestAt: events[events.length - 1]?.at ?? null,
      note: MOBILE_LEDGER_NOTE,
    };
  },

  /* ── Rollups, configuration and gaps ──────────────────────────────── */

  async selfAssurance(userId: string, organizationId: string | null): Promise<MobileSelfAssurance> {
    const policy = organizationId
      ? await this.getPolicy(organizationId)
      : defaultMobilePolicy("unscoped");
    const inventory = await this.deviceInventory(userId, organizationId);
    const summary = await this.offlineSummary(userId, organizationId);
    const pushRows = await prisma.pushSubscription.count({ where: { userId } }).catch(() => 0);
    return {
      userId,
      devices: inventory.total,
      staleDevices: inventory.stale,
      devicesWithBiometrics: inventory.withBiometrics,
      devicesWithPin: inventory.withPin,
      pushSubscriptions: pushRows,
      pendingActions: summary.pending,
      oldestPendingAt: summary.oldestPendingAt,
      lockedDevices: inventory.devices.filter((d) => d.pinLock?.locked).length,
      policy,
      generatedAt: new Date().toISOString(),
      note: "These are the devices, subscriptions and queued actions this deployment holds for you. It cannot see a device that never registered.",
    };
  },

  /**
   * What this deployment is configured to do.
   *
   * Reads the environment and nothing else — no push is sent to produce it, so
   * a passing check means configured, not working. No key value is ever echoed;
   * the VAPID public key is reported only as "matches the repository default"
   * or not.
   */
  configuration(): MobileConfigurationReport {
    const checks: MobileConfigurationCheck[] = [];
    const publicKey = env.VAPID_PUBLIC_KEY ?? "";
    const privateKeySet = Boolean(env.VAPID_PRIVATE_KEY);
    const usingDefault = publicKey === REPOSITORY_DEFAULT_VAPID_PUBLIC_KEY;

    checks.push({
      key: "vapid_public_key",
      label: "VAPID public key present",
      state: publicKey ? "pass" : "fail",
      detail: publicKey
        ? "A VAPID public key is configured. Its value is served by the public GET /mobile/config, which is correct — a VAPID public key is meant to be public."
        : "No VAPID public key is configured; the browser cannot subscribe to push.",
    });
    checks.push({
      key: "vapid_private_key",
      label: "VAPID private key present",
      state: privateKeySet ? "pass" : "fail",
      detail: privateKeySet
        ? "A VAPID private key is configured. Its value is never returned by this API."
        : "No VAPID private key is configured; no push can be signed.",
    });
    checks.push({
      key: "vapid_keys_deployment_specific",
      label: "VAPID key pair is deployment-specific",
      state: usingDefault ? "warn" : "pass",
      detail: usingDefault
        ? "This deployment is using the development VAPID key pair committed to config/env.ts. It is the same key pair in every checkout of this repository, so the private half is not private. Generate a pair and set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY before serving real users."
        : "The configured VAPID public key is not the repository default.",
    });
    checks.push({
      key: "vapid_subject",
      label: "VAPID subject set",
      state: env.VAPID_SUBJECT ? "pass" : "warn",
      detail: env.VAPID_SUBJECT
        ? "A VAPID subject is configured; push services use it to contact the operator."
        : "No VAPID subject is set. Some push services reject unsigned-for contact details.",
    });
    checks.push({
      key: "public_config_min_version",
      label: "Public config minimum version",
      state: "warn",
      detail: `GET /mobile/config serves minAppVersion "${PUBLIC_CONFIG_MIN_APP_VERSION}" and forceUpdate false as build-time constants. That endpoint is unauthenticated, so it has no organization to read a policy from. The configurable minimum lives in the authenticated GET /mobile/policy.`,
    });
    checks.push({
      key: "offline_queue_durability",
      label: "Offline queue is durable",
      state: "pass",
      detail: `Submitted actions are stored in Redis with a receipt each and a ${MOBILE_ACTION_RETENTION_DAYS}-day default retention. They are stored, never executed by the server.`,
    });
    checks.push({
      key: "pin_throttle",
      label: "Device PIN throttle armed",
      state: "pass",
      detail: `${MOBILE_PIN_MAX_ATTEMPTS} failed attempts inside ${MOBILE_PIN_FAILURE_WINDOW_SECONDS}s lock a device PIN for ${MOBILE_PIN_LOCKOUT_SECONDS}s.`,
    });

    return {
      checks,
      ready: checks.every((c) => c.state !== "fail"),
      pushConfigured: Boolean(publicKey) && privateKeySet,
      usingRepositoryDefaultVapidKeys: usingDefault,
      publicConfigMinAppVersion: PUBLIC_CONFIG_MIN_APP_VERSION,
      publicConfigSource: "build_time_constant",
      queueLimits: {
        maxBatch: MOBILE_ACTION_MAX_BATCH,
        maxBodyBytes: MOBILE_ACTION_MAX_BODY_BYTES,
        maxQueuedActions: MOBILE_QUEUE_MAX_ACTIONS,
        retentionDays: MOBILE_ACTION_RETENTION_DAYS,
      },
      pinThrottle: {
        maxAttempts: MOBILE_PIN_MAX_ATTEMPTS,
        windowSeconds: MOBILE_PIN_FAILURE_WINDOW_SECONDS,
        lockoutSeconds: MOBILE_PIN_LOCKOUT_SECONDS,
      },
      generatedAt: new Date().toISOString(),
      note: MOBILE_CONFIG_NOTE,
    };
  },

  gaps() {
    return mobileGapReport();
  },
};

export type MobileSyncServiceType = typeof MobileSyncService;
