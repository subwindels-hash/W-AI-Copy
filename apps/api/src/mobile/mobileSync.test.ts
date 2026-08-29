/**
 * Session 117 — Mobile offline durability, device trust and push health.
 *
 * Runs fully in-memory: FakeKv stands in for Redis, FakePrisma for the device,
 * subscription and credential tables.
 *
 * The properties pinned here are the ones the module's honesty rules depend on:
 *
 *   - a queued action is **actually stored**, and the receipt for one that was
 *     not tells the client to keep it (the defect this session exists for was a
 *     handler that answered `received: n` and stored nothing, after which the
 *     client deleted the lot);
 *   - `stored` never becomes `applied` on its own — only a device reporting an
 *     outcome moves it, a second outcome is refused, and an expired action is
 *     reported expired rather than quietly dropped;
 *   - replay order follows the *server's* receipt time, because a phone that
 *     has been offline may have any clock at all;
 *   - a device id belonging to another account is refused, and no device view
 *     or push report ever carries a PIN hash, a push token hash or a full push
 *     endpoint;
 *   - a version comparison that cannot be made is `unknown`, not `current`;
 *   - the configuration report names the committed development VAPID key pair
 *     instead of passing itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { MobileSyncService: Mobile } = await import("./mobileSync.service.js");
const {
  MOBILE_ACTION_MAX_BODY_BYTES,
  MOBILE_DEVICE_STALE_DAYS,
  MOBILE_PIN_FAILURE_WINDOW_SECONDS,
  MOBILE_PIN_MAX_ATTEMPTS,
  MOBILE_PUSH_FAILURE_RETIREMENT,
  compareMobileVersions,
  mobileUpdateStanding,
  normalizeMobileActionPath,
} = await import("@windels/shared/mobile");

const USER = "user-mob-1";
const OTHER = "user-mob-2";
const ORG_A = "org-mob-a";
const ORG_B = "org-mob-b";
const DEVICE = "dev-1";

function seedDevice(id: string, userId = USER, extra: Record<string, unknown> = {}) {
  db.seed("MobileDevice", [
    {
      id,
      userId,
      platform: "ios",
      deviceName: "iPhone",
      appVersion: "1.4.0",
      biometricEnabled: false,
      pinHash: null,
      pushTokenHash: null,
      lastSeenAt: new Date(),
      createdAt: new Date(),
      ...extra,
    },
  ]);
}

function action(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    method: "POST" as const,
    path: "/api/v1/conversations/c1/messages",
    body: { content: `message ${id}` },
    queuedAt: new Date().toISOString(),
    ...over,
  };
}

/** Everything FakeKv currently holds, as one string — for "is it in there" greps. */
function keyspaceDump(): string {
  const parts: string[] = [];
  for (const [k, v] of kv.strings) parts.push(k, v.value);
  for (const [k, v] of kv.lists) parts.push(k, ...v);
  for (const [k, v] of kv.sets) parts.push(k, ...v);
  for (const [k, v] of kv.zsets) parts.push(k, ...v.keys());
  for (const [k, v] of kv.hashes) parts.push(k, JSON.stringify(v));
  return parts.join("\u0000");
}

beforeEach(() => {
  db.reset();
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  vi.useRealTimers();
});

/* ── The defect this session exists for ─────────────────────────────────── */

describe("the offline queue actually stores what it is given", () => {
  it("stores every accepted action and reports a receipt for each", async () => {
    seedDevice(DEVICE);
    const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1"), action("a2")]);

    expect(result.received).toBe(2);
    expect(result.stored).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts.every((r) => r.outcome === "stored")).toBe(true);
    expect(result.queueDepth).toBe(2);

    // The point of the session: the records survive the call.
    const listed = await Mobile.listActions(USER, { deviceId: DEVICE });
    expect(listed.actions.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("keeps the submitted body so the write can actually be recovered", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [
      action("a1", { body: { content: "written in a tunnel" } }),
    ]);
    const detail = await Mobile.getAction(USER, "a1");
    expect(detail.body).toEqual({ content: "written in a tunnel" });
    expect(detail.bodyStored).toBe(true);
    expect(detail.bodyBytes).toBeGreaterThan(0);
  });

  it("reports stored, never applied — a stored action has taken no effect", async () => {
    seedDevice(DEVICE);
    const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    expect(result.receipts[0]!.status).toBe("stored");
    expect(result.storageNote).toMatch(/does not execute/i);
    const detail = await Mobile.getAction(USER, "a1");
    expect(detail.status).toBe("stored");
    expect(detail.resolvedAt).toBeNull();
    expect(detail.replayAttempts).toBe(0);
  });

  it("a duplicate id is reported, not stored twice, and returns the held status", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    const again = await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);

    expect(again.duplicates).toBe(1);
    expect(again.stored).toBe(0);
    expect(again.receipts[0]!.outcome).toBe("duplicate");
    expect(again.receipts[0]!.status).toBe("stored");
    expect(again.receipts[0]!.retainLocally).toBe(false);
    expect((await Mobile.listActions(USER, { deviceId: DEVICE })).total).toBe(1);
  });

  it("a rejected action sets retainLocally so the client keeps it", async () => {
    seedDevice(DEVICE);
    const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [
      action("bad", { path: "https://evil.example/api/v1/x" }),
    ]);
    expect(result.rejected).toBe(1);
    expect(result.stored).toBe(0);
    expect(result.receipts[0]!.outcome).toBe("rejected");
    expect(result.receipts[0]!.retainLocally).toBe(true);
    expect(result.receipts[0]!.reason).toBe("path_invalid");
  });
});

describe("path rules", () => {
  it("refuses an absolute URL, a parent segment, a control character and a non-API path", () => {
    expect(normalizeMobileActionPath("https://evil.example/api/v1/x").ok).toBe(false);
    expect(normalizeMobileActionPath("//evil.example/api/v1/x").ok).toBe(false);
    expect(normalizeMobileActionPath("/api/v1/../../etc").ok).toBe(false);
    expect(normalizeMobileActionPath("/api/v1/x\u0000y").ok).toBe(false);
    expect(normalizeMobileActionPath("/internal/x").ok).toBe(false);
    expect(normalizeMobileActionPath("").ok).toBe(false);
  });

  it("refuses credential, session and queue-control endpoints with the reason", async () => {
    seedDevice(DEVICE);
    for (const path of [
      "/api/v1/auth/login",
      "/api/v1/mfa/verify",
      "/api/v1/mobile/offline/sync",
      "/api/v1/mobile/pin/set",
      "/api/v1/mobile/biometric/auth-verify",
    ]) {
      const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [
        action(`x-${path}`, { path }),
      ]);
      expect(result.receipts[0]!.reason).toBe("path_not_allowed");
      expect(result.receipts[0]!.retainLocally).toBe(true);
    }
  });

  it("accepts an ordinary API path including its query string", () => {
    const result = normalizeMobileActionPath("/api/v1/crm/deals/d1?expand=owner");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.path).toBe("/api/v1/crm/deals/d1?expand=owner");
  });

  it("does not treat a path that merely starts with a denied prefix's letters as denied", () => {
    // "/api/v1/authoring" is not "/api/v1/auth".
    expect(normalizeMobileActionPath("/api/v1/authoring/docs").ok).toBe(true);
  });
});

describe("size and capacity limits refuse rather than corrupt", () => {
  it("refuses an oversized body instead of truncating it", async () => {
    seedDevice(DEVICE);
    const huge = "x".repeat(MOBILE_ACTION_MAX_BODY_BYTES + 100);
    const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [
      action("big", { body: { content: huge } }),
    ]);
    expect(result.receipts[0]!.reason).toBe("body_too_large");
    expect(result.receipts[0]!.detail).toMatch(/not truncated/i);
    expect(result.stored).toBe(0);
  });

  it("refuses new actions at the queue limit and drops nothing to make room", async () => {
    seedDevice(DEVICE);
    await Mobile.updatePolicy(ORG_A, "admin-1", { maxQueuedActions: 2 });
    const first = await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1"), action("a2")]);
    expect(first.stored).toBe(2);

    const overflow = await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a3")]);
    expect(overflow.receipts[0]!.reason).toBe("queue_full");
    expect(overflow.receipts[0]!.retainLocally).toBe(true);
    // Nothing was evicted.
    const listed = await Mobile.listActions(USER, { deviceId: DEVICE });
    expect(listed.actions.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("refuses everything with a reason when the organization turns the queue off", async () => {
    seedDevice(DEVICE);
    await Mobile.updatePolicy(ORG_A, "admin-1", { offlineQueueEnabled: false });
    const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    expect(result.receipts[0]!.reason).toBe("queue_disabled");
    expect(result.stored).toBe(0);
  });

  it("refuses an action with no id, because it cannot be deduplicated", async () => {
    seedDevice(DEVICE);
    const result = await Mobile.submitActions(USER, ORG_A, DEVICE, [
      { method: "POST", path: "/api/v1/x", body: {} } as any,
    ]);
    expect(result.receipts[0]!.reason).toBe("action_id_invalid");
  });
});

/* ── Resolution ─────────────────────────────────────────────────────────── */

describe("only the device can move an action out of stored", () => {
  it("records the outcome the device reports, verbatim", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    const resolved = await Mobile.resolveAction(USER, "a1", "applied", { statusCode: 201 });
    expect(resolved.status).toBe("applied");
    expect(resolved.outcomeStatusCode).toBe(201);
    expect(resolved.replayAttempts).toBe(1);
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("records a failure as a failure and keeps the error text", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    const resolved = await Mobile.resolveAction(USER, "a1", "failed", {
      statusCode: 409,
      error: "Conversation was deleted while offline",
    });
    expect(resolved.status).toBe("failed");
    expect(resolved.outcomeError).toMatch(/deleted while offline/);
  });

  it("refuses a second outcome, because that means the write was replayed twice", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await Mobile.resolveAction(USER, "a1", "applied", { statusCode: 200 });
    await expect(Mobile.resolveAction(USER, "a1", "applied")).rejects.toThrow(/already recorded as applied/i);
  });

  it("allows a retry after a failure and counts the attempts", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await Mobile.resolveAction(USER, "a1", "failed", { statusCode: 500 });
    const second = await Mobile.resolveAction(USER, "a1", "applied", { statusCode: 200 });
    expect(second.status).toBe("applied");
    expect(second.replayAttempts).toBe(2);
  });

  it("records a discard rather than deleting the record", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    const discarded = await Mobile.discardAction(USER, "a1", "No longer needed");
    expect(discarded.status).toBe("discarded");
    const still = await Mobile.getAction(USER, "a1");
    expect(still.status).toBe("discarded");
  });

  it("refuses to discard an action already applied — discarding would not undo the write", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await Mobile.resolveAction(USER, "a1", "applied");
    await expect(Mobile.discardAction(USER, "a1")).rejects.toThrow(/would not undo/i);
  });

  it("refuses to resolve a discarded action", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await Mobile.discardAction(USER, "a1");
    await expect(Mobile.resolveAction(USER, "a1", "applied")).rejects.toThrow(/discarded/i);
  });
});

/* ── Expiry ─────────────────────────────────────────────────────────────── */

describe("retention", () => {
  it("reports an action past its retention window as expired, not applied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    seedDevice(DEVICE);
    await Mobile.updatePolicy(ORG_A, "admin-1", { actionRetentionDays: 1 });
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);

    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
    const detail = await Mobile.getAction(USER, "a1");
    expect(detail.status).toBe("expired");

    const summary = await Mobile.offlineSummary(USER, ORG_A);
    expect(summary.byStatus.expired).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.retentionNote).toMatch(/without ever being executed/i);
    vi.useRealTimers();
  });

  it("writes a ledger entry when an action expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    seedDevice(DEVICE);
    await Mobile.updatePolicy(ORG_A, "admin-1", { actionRetentionDays: 1 });
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    vi.setSystemTime(new Date("2026-01-05T00:00:00.000Z"));
    await Mobile.listActions(USER, { deviceId: DEVICE });

    const ledger = await Mobile.listEvents(USER, { kind: "action_expired" });
    expect(ledger.events).toHaveLength(1);
    expect(ledger.events[0]!.detail).toMatch(/expired without being applied/i);
    vi.useRealTimers();
  });
});

/* ── Replay order ───────────────────────────────────────────────────────── */

describe("replay plan", () => {
  it("orders by the server's receipt time, not the device clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
    seedDevice(DEVICE);
    // The device claims the second action was queued first. A phone that has
    // been offline may have any clock at all, so the claim is stored but never
    // used for ordering.
    await Mobile.submitActions(USER, ORG_A, DEVICE, [
      action("first", { queuedAt: "2030-01-01T00:00:00.000Z" }),
    ]);
    vi.setSystemTime(new Date("2026-02-01T10:00:05.000Z"));
    await Mobile.submitActions(USER, ORG_A, DEVICE, [
      action("second", { queuedAt: "1999-01-01T00:00:00.000Z" }),
    ]);

    const plan = await Mobile.replayPlan(USER, DEVICE);
    expect(plan.actions.map((a) => a.id)).toEqual(["first", "second"]);
    expect(plan.replayNote).toMatch(/on the device/i);
    vi.useRealTimers();
  });

  it("keeps submission order for actions that share a receipt millisecond", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [
      action("one"),
      action("two"),
      action("three"),
    ]);
    const plan = await Mobile.replayPlan(USER, DEVICE);
    expect(plan.actions.map((a) => a.id)).toEqual(["one", "two", "three"]);
    vi.useRealTimers();
  });

  it("excludes resolved actions and reports truncation honestly", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1"), action("a2"), action("a3")]);
    await Mobile.resolveAction(USER, "a2", "applied");

    const plan = await Mobile.replayPlan(USER, DEVICE, 1);
    expect(plan.pending).toBe(2);
    expect(plan.actions).toHaveLength(1);
    expect(plan.truncated).toBe(true);
    expect(plan.actions.map((a) => a.id)).not.toContain("a2");
  });
});

/* ── Isolation ──────────────────────────────────────────────────────────── */

describe("one principal cannot reach another's queue", () => {
  it("does not return another user's action", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await expect(Mobile.getAction(OTHER, "a1")).rejects.toThrow(/not found/i);
    await expect(Mobile.resolveAction(OTHER, "a1", "applied")).rejects.toThrow(/not found/i);
    await expect(Mobile.discardAction(OTHER, "a1")).rejects.toThrow(/not found/i);
  });

  it("skips a forged record whose stored userId does not match the index it sits in", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    // Hand-plant a record under this user's index that claims another owner.
    await kv.set(
      `mob:action:${USER}:forged`,
      JSON.stringify({ id: "forged", userId: OTHER, deviceId: DEVICE, status: "stored" }),
    );
    await kv.zadd(`mob:actidx:${USER}:${DEVICE}`, Date.now(), "forged");

    const listed = await Mobile.listActions(USER, { deviceId: DEVICE });
    expect(listed.actions.map((a) => a.id)).toEqual(["a1"]);
  });

  it("keeps two organizations' policies apart", async () => {
    await Mobile.updatePolicy(ORG_A, "admin-1", { pinAllowed: false });
    const a = await Mobile.getPolicy(ORG_A);
    const b = await Mobile.getPolicy(ORG_B);
    expect(a.pinAllowed).toBe(false);
    expect(b.pinAllowed).toBe(true);
    expect(b.isDefault).toBe(true);
  });
});

/* ── Device ownership and views ─────────────────────────────────────────── */

describe("device ownership", () => {
  it("refuses a device id registered to another account and records the refusal", async () => {
    seedDevice("dev-theirs", OTHER);
    await expect(Mobile.assertDeviceOwnership(USER, "dev-theirs")).rejects.toThrow(
      /registered to another account/i,
    );
    const ledger = await Mobile.listEvents(USER, { kind: "device_ownership_refused" });
    expect(ledger.events).toHaveLength(1);
  });

  it("returns null for an id that does not exist yet, so a first registration works", async () => {
    await expect(Mobile.assertDeviceOwnership(USER, "brand-new")).resolves.toBeNull();
  });

  it("returns the device when the caller owns it", async () => {
    seedDevice(DEVICE);
    const device = await Mobile.assertDeviceOwnership(USER, DEVICE);
    expect(device?.id).toBe(DEVICE);
  });
});

describe("a device view never carries a secret", () => {
  it("omits pinHash and pushTokenHash and reports pinConfigured instead", async () => {
    seedDevice(DEVICE, USER, { pinHash: "$2a$10$abcdefghijklmnopqrstuv", pushTokenHash: "deadbeef" });
    const inventory = await Mobile.deviceInventory(USER, ORG_A);
    const serialized = JSON.stringify(inventory);

    expect(serialized).not.toContain("$2a$10$");
    expect(serialized).not.toContain("deadbeef");
    expect(serialized).not.toMatch(/pinHash/);
    expect(serialized).not.toMatch(/pushTokenHash/);
    expect(inventory.devices[0]!.pinConfigured).toBe(true);
    expect(inventory.withPin).toBe(1);
  });

  it("counts push subscriptions and biometric credentials for the device", async () => {
    seedDevice(DEVICE);
    db.seed("PushSubscription", [
      { id: "sub-1", userId: USER, deviceId: DEVICE, endpoint: "https://fcm.googleapis.com/x", failures: 0 },
    ]);
    db.seed("BiometricCredential", [{ id: "bio-1", userId: USER, deviceId: DEVICE }]);
    const view = await Mobile.deviceTrust(USER, DEVICE, ORG_A);
    expect(view.pushSubscriptions).toBe(1);
    expect(view.biometricCredentials).toBe(1);
  });

  it("marks a device stale after the staleness window and never revokes it", async () => {
    const old = new Date(Date.now() - (MOBILE_DEVICE_STALE_DAYS + 5) * 86_400_000);
    seedDevice(DEVICE, USER, { lastSeenAt: old });
    const inventory = await Mobile.deviceInventory(USER, ORG_A);
    expect(inventory.devices[0]!.stale).toBe(true);
    expect(inventory.devices[0]!.daysSinceLastSeen).toBeGreaterThanOrEqual(MOBILE_DEVICE_STALE_DAYS);
    expect(inventory.stale).toBe(1);
    // Still present: staleness is a report, not an action.
    expect(inventory.total).toBe(1);
  });

  it("refuses to show another user's device", async () => {
    seedDevice("dev-theirs", OTHER);
    await expect(Mobile.deviceTrust(USER, "dev-theirs", ORG_A)).rejects.toThrow(/not found/i);
  });
});

/* ── Update standing ────────────────────────────────────────────────────── */

describe("update standing is never rounded up", () => {
  it("compares versions and returns null when either side cannot be parsed", () => {
    expect(compareMobileVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareMobileVersions("1.2.4", "1.2.3")).toBeGreaterThan(0);
    expect(compareMobileVersions("1.2.3", "1.10.0")).toBeLessThan(0);
    expect(compareMobileVersions("nightly", "1.2.3")).toBeNull();
    expect(compareMobileVersions(null, "1.2.3")).toBeNull();
  });

  it("reports unknown when the policy sets no minimum", () => {
    expect(
      mobileUpdateStanding("1.0.0", { minAppVersion: null, updateRequirement: "none" }),
    ).toBe("unknown");
  });

  it("reports unknown — not current — for a build whose version cannot be parsed", () => {
    expect(
      mobileUpdateStanding("dev-build", { minAppVersion: "1.2.0", updateRequirement: "required" }),
    ).toBe("unknown");
  });

  it("distinguishes advisory from required", () => {
    expect(
      mobileUpdateStanding("1.1.0", { minAppVersion: "1.2.0", updateRequirement: "advisory" }),
    ).toBe("outdated_advisory");
    expect(
      mobileUpdateStanding("1.1.0", { minAppVersion: "1.2.0", updateRequirement: "required" }),
    ).toBe("outdated_required");
    expect(
      mobileUpdateStanding("1.2.0", { minAppVersion: "1.2.0", updateRequirement: "required" }),
    ).toBe("current");
  });

  it("applies the organization's policy to the device view", async () => {
    seedDevice(DEVICE, USER, { appVersion: "1.0.0" });
    await Mobile.updatePolicy(ORG_A, "admin-1", {
      minAppVersion: "2.0.0",
      updateRequirement: "required",
    });
    const view = await Mobile.deviceTrust(USER, DEVICE, ORG_A);
    expect(view.updateStanding).toBe("outdated_required");
  });
});

/* ── PIN throttle ───────────────────────────────────────────────────────── */

describe("device PIN throttle", () => {
  it("counts failures and locks at the threshold", async () => {
    seedDevice(DEVICE);
    for (let i = 1; i < MOBILE_PIN_MAX_ATTEMPTS; i++) {
      const state = await Mobile.recordPinFailure(USER, DEVICE);
      expect(state.locked).toBe(false);
      expect(state.failedAttempts).toBe(i);
    }
    const locked = await Mobile.recordPinFailure(USER, DEVICE);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.remainingAttempts).toBe(0);
  });

  it("refuses an attempt while locked and names the wait", async () => {
    seedDevice(DEVICE);
    for (let i = 0; i < MOBILE_PIN_MAX_ATTEMPTS; i++) await Mobile.recordPinFailure(USER, DEVICE);
    await expect(Mobile.assertPinAttemptAllowed(USER, DEVICE)).rejects.toThrow(/Try again in \d+ seconds/);
  });

  it("ages failures out of the window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    seedDevice(DEVICE);
    await Mobile.recordPinFailure(USER, DEVICE);
    await Mobile.recordPinFailure(USER, DEVICE);
    expect((await Mobile.pinLockState(USER, DEVICE)).failedAttempts).toBe(2);

    vi.setSystemTime(new Date(Date.now() + (MOBILE_PIN_FAILURE_WINDOW_SECONDS + 60) * 1000));
    expect((await Mobile.pinLockState(USER, DEVICE)).failedAttempts).toBe(0);
    vi.useRealTimers();
  });

  it("is cleared by a success", async () => {
    seedDevice(DEVICE);
    for (let i = 0; i < MOBILE_PIN_MAX_ATTEMPTS; i++) await Mobile.recordPinFailure(USER, DEVICE);
    await Mobile.clearPinFailures(USER, DEVICE);
    const state = await Mobile.pinLockState(USER, DEVICE);
    expect(state.locked).toBe(false);
    expect(state.failedAttempts).toBe(0);
    await expect(Mobile.assertPinAttemptAllowed(USER, DEVICE)).resolves.toBeUndefined();
  });

  it("is per device, so one phone's lock does not lock another", async () => {
    seedDevice(DEVICE);
    seedDevice("dev-2");
    for (let i = 0; i < MOBILE_PIN_MAX_ATTEMPTS; i++) await Mobile.recordPinFailure(USER, DEVICE);
    expect((await Mobile.pinLockState(USER, "dev-2")).locked).toBe(false);
  });

  it("clears the PIN and its lock, and refuses a device the caller does not own", async () => {
    seedDevice(DEVICE, USER, { pinHash: "$2a$10$hash" });
    await Mobile.recordPinFailure(USER, DEVICE);
    const result = await Mobile.clearPin(USER, DEVICE);
    expect(result.pinConfigured).toBe(false);
    expect((await Mobile.pinLockState(USER, DEVICE)).failedAttempts).toBe(0);
    const row = (db.tables.get("MobileDevice") ?? []).find((d: any) => d.id === DEVICE)!;
    expect(row.pinHash).toBeNull();

    seedDevice("dev-theirs", OTHER, { pinHash: "$2a$10$other" });
    await expect(Mobile.clearPin(USER, "dev-theirs")).rejects.toThrow(/not found/i);
    const theirs = (db.tables.get("MobileDevice") ?? []).find((d: any) => d.id === "dev-theirs")!;
    expect(theirs.pinHash).toBe("$2a$10$other");
  });
});

/* ── Policy ─────────────────────────────────────────────────────────────── */

describe("organization policy", () => {
  it("returns platform defaults, marked as defaults, when nothing is stored", async () => {
    const policy = await Mobile.getPolicy(ORG_A);
    expect(policy.isDefault).toBe(true);
    expect(policy.offlineQueueEnabled).toBe(true);
    expect(policy.minAppVersion).toBeNull();
    expect(policy.updateRequirement).toBe("none");
    expect(policy.note).toMatch(/advisory/i);
  });

  it("stores an update and records who made it", async () => {
    const updated = await Mobile.updatePolicy(ORG_A, "admin-9", {
      minAppVersion: "2.1.0",
      updateRequirement: "advisory",
    });
    expect(updated.isDefault).toBe(false);
    expect(updated.updatedBy).toBe("admin-9");
    expect(updated.minAppVersion).toBe("2.1.0");
    const ledger = await Mobile.listEvents("admin-9", { kind: "policy_updated" });
    expect(ledger.events).toHaveLength(1);
  });

  it("refuses an update requirement with no minimum version to check against", async () => {
    await expect(
      Mobile.updatePolicy(ORG_A, "admin-1", { updateRequirement: "required" }),
    ).rejects.toThrow(/needs a minAppVersion/i);
  });
});

/* ── Push health ────────────────────────────────────────────────────────── */

describe("push health", () => {
  it("reports the endpoint host only — the full endpoint is a bearer capability", async () => {
    db.seed("PushSubscription", [
      {
        id: "sub-1",
        userId: USER,
        deviceId: DEVICE,
        endpoint: "https://fcm.googleapis.com/fcm/send/SECRET-TOKEN-VALUE",
        failures: 0,
      },
    ]);
    const health = await Mobile.pushHealth(USER);
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain("SECRET-TOKEN-VALUE");
    expect(health.subscriptions[0]!.endpointHost).toBe("fcm.googleapis.com");
  });

  it("reports zero recorded deliveries as zero, with no last delivery", async () => {
    const health = await Mobile.pushHealth(USER);
    expect(health.recordedDeliveries).toBe(0);
    expect(health.lastDeliveryAt).toBeNull();
    expect(health.note).toMatch(/not shown to the user/i);
  });

  it("counts recorded deliveries and separates accepted from attempted", async () => {
    await Mobile.recordPushDelivery(USER, { notificationId: "n1", accepted: 1, attempted: 3 });
    await Mobile.recordPushDelivery(USER, { notificationId: "n2", accepted: 2, attempted: 2 });
    const health = await Mobile.pushHealth(USER);
    expect(health.recordedDeliveries).toBe(2);
    expect(health.recordedAccepted).toBe(3);
    expect(health.recordedAttempted).toBe(5);
    expect(health.lastDeliveryAt).not.toBeNull();
  });

  it("flags a subscription one failure short of retirement, and records a retirement", async () => {
    db.seed("PushSubscription", [
      {
        id: "sub-1",
        userId: USER,
        deviceId: DEVICE,
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc",
        failures: MOBILE_PUSH_FAILURE_RETIREMENT - 1,
      },
    ]);
    await Mobile.recordPushSubscriptionRetired(USER, {
      endpointHost: "updates.push.services.mozilla.com",
      failures: MOBILE_PUSH_FAILURE_RETIREMENT,
    });
    const health = await Mobile.pushHealth(USER);
    expect(health.atRiskSubscriptions).toBe(1);
    expect(health.retiredSubscriptions).toBe(1);
    expect(health.retirementThreshold).toBe(MOBILE_PUSH_FAILURE_RETIREMENT);
    // The retirement is not counted as a delivery.
    expect(health.recordedDeliveries).toBe(0);
  });
});

/* ── Configuration and gaps ─────────────────────────────────────────────── */

describe("configuration report", () => {
  it("warns that the committed development VAPID key pair is in use", () => {
    const report = Mobile.configuration();
    const check = report.checks.find((c) => c.key === "vapid_keys_deployment_specific")!;
    expect(check.state).toBe("warn");
    expect(check.detail).toMatch(/committed to config\/env\.ts/i);
    expect(report.usingRepositoryDefaultVapidKeys).toBe(true);
  });

  it("never echoes a key value", () => {
    const serialized = JSON.stringify(Mobile.configuration());
    // Guard against a vacuous pass: the report must be substantive first.
    expect(serialized).toContain("vapid_private_key");
    // The development private key, and the public key it is paired with.
    expect(serialized).not.toContain("Tg9wSuR5xpNc8wspnQjuurMbNL0uRlnQLtcCzCoRVIo");
    expect(serialized).not.toContain("BKwIHmBhWdeXUpnNQ_IGQOnQb0jry");
  });

  it("labels the public config's minimum version as a build-time constant", () => {
    const report = Mobile.configuration();
    expect(report.publicConfigSource).toBe("build_time_constant");
    const check = report.checks.find((c) => c.key === "public_config_min_version")!;
    expect(check.state).toBe("warn");
    expect(check.detail).toMatch(/unauthenticated/i);
  });

  it("is ready when no check failed, and says configured rather than working", () => {
    const report = Mobile.configuration();
    expect(report.ready).toBe(report.checks.every((c) => c.state !== "fail"));
    expect(report.note).toMatch(/configured, not working/i);
  });

  it("states the gaps rather than implying they are covered", () => {
    const gaps = Mobile.gaps();
    expect(gaps.gaps.length).toBeGreaterThanOrEqual(5);
    expect(gaps.gaps.some((g) => /never executes one/i.test(g.gap))).toBe(true);
    expect(gaps.gaps.some((g) => /not idempotent/i.test(g.gap))).toBe(true);
  });
});

/* ── Summary, ledger and keyspace hygiene ───────────────────────────────── */

describe("summary and ledger", () => {
  it("counts by status and names the oldest pending action", async () => {
    seedDevice(DEVICE);
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1"), action("a2"), action("a3")]);
    await Mobile.resolveAction(USER, "a1", "applied");
    await Mobile.discardAction(USER, "a2");

    const summary = await Mobile.offlineSummary(USER, ORG_A);
    expect(summary.byStatus.stored).toBe(1);
    expect(summary.byStatus.applied).toBe(1);
    expect(summary.byStatus.discarded).toBe(1);
    expect(summary.totalRecorded).toBe(3);
    expect(summary.pending).toBe(1);
    expect(summary.oldestPendingAt).not.toBeNull();
    expect(summary.pendingByDevice).toEqual([{ deviceId: DEVICE, pending: 1 }]);
  });

  it("filters the ledger by kind and by device", async () => {
    seedDevice(DEVICE);
    seedDevice("dev-2");
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await Mobile.submitActions(USER, ORG_A, "dev-2", [action("b1")]);

    const all = await Mobile.listEvents(USER, { kind: "actions_submitted" });
    expect(all.events).toHaveLength(2);
    const one = await Mobile.listEvents(USER, { kind: "actions_submitted", deviceId: "dev-2" });
    expect(one.events).toHaveLength(1);
    expect(one.note).toMatch(/since it was introduced/i);
  });

  it("reports the caller's own posture without inventing anything", async () => {
    seedDevice(DEVICE, USER, { pinHash: "$2a$10$x" });
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    const self = await Mobile.selfAssurance(USER, ORG_A);
    expect(self.devices).toBe(1);
    expect(self.devicesWithPin).toBe(1);
    expect(self.pendingActions).toBe(1);
    expect(self.pushSubscriptions).toBe(0);
    expect(self.policy.isDefault).toBe(true);
  });

  it("keeps no bcrypt hash or full push endpoint anywhere in its own keyspace", async () => {
    seedDevice(DEVICE, USER, { pinHash: "$2a$10$averyrealbcrypthashvalue" });
    await Mobile.submitActions(USER, ORG_A, DEVICE, [action("a1")]);
    await Mobile.recordPushDelivery(USER, { notificationId: "n1", accepted: 1, attempted: 1 });
    await Mobile.deviceInventory(USER, ORG_A);

    const dump = keyspaceDump();
    // Guard against a vacuous pass: the dump must actually contain this
    // session's records before "the secret is not in it" means anything.
    expect(dump).toContain("mob:action:");
    expect(dump).toContain("message a1");
    expect(dump).not.toContain("$2a$10$averyrealbcrypthashvalue");
    expect(dump).not.toContain("fcm/send/");
  });
});
