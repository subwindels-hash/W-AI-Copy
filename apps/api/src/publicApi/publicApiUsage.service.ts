/**
 * Session 120 — Public API call ledger and usage report.
 *
 * Before this session the public gateway recorded nothing about who calls
 * what: the only signal was `lastUsedAt` on the ApiKey row — a database write
 * on every request, with no counts, no time dimension and no history. This
 * file adds an org-scoped, best-effort Redis ledger written from the
 * `apiKeyAuth` middleware after a successful verification, plus the usage
 * report both the public and the internal surfaces serve.
 *
 * Keys (the organization id is always the segment straight after the prefix,
 * so the Session 89 isolation sweep's org-segment derivation holds):
 *   pub:since:<org>           first-call marker (set once with NX)
 *   pub:req:<org>             hash: keyId → lifetime calls
 *   pub:day:<org>:<YYYY-MM-DD>  hash: keyId → calls that UTC day (TTL 92 d)
 *   pub:evt:<org>             list of recent calls (newest first, capped at
 *                             PUBLIC_API_EVENT_CAP)
 *
 * The prefix is `pub:` and NOT a bare `pub` entry in the isolation catalog:
 * `pub:req:<org>` has the org in the *second* segment, and a shorter entry
 * would make the sweep expect it in the first — it would read the literal
 * `req` as an organization id and report a conformance check it never made.
 *
 * The ledger is best-effort by design: a Redis outage must never fail or
 * slow down an API call, and the report says `ledgerAvailable: false`
 * rather than pretending an empty ledger is a measured zero.
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import {
  PUBLIC_API_DAY_BUCKET_TTL_DAYS,
  PUBLIC_API_EVENT_CAP,
  PUBLIC_API_RECENT_CALLS_LIMIT,
  PUBLIC_API_USAGE_NOTE,
} from "@windels/shared/publicApi";
import type {
  PubKeyUsageRow,
  PubRecentCall,
  PubUsageReport,
} from "@windels/shared/publicApi";
// Shared UTC-day and floored-average helpers (null on an empty denominator),
// reused so the two usage surfaces behave identically.
import { promptTemplateAvgPerDay, utcDayBefore, utcDayOf } from "@windels/shared/promptTemplates";

const K = {
  since: (orgId: string) => `pub:since:${orgId}`,
  req: (orgId: string) => `pub:req:${orgId}`,
  day: (orgId: string, day: string) => `pub:day:${orgId}:${day}`,
  evt: (orgId: string) => `pub:evt:${orgId}`,
};

interface CallEvent {
  keyId: string;
  method: string;
  path: string;
  at: string; // ISO
}

/** Record one authenticated public API call. Never throws: the request path
 *  must not depend on the ledger. */
export async function recordPublicApiCall(
  key: { id: string; organizationId: string },
  method: string,
  path: string,
  at: Date,
): Promise<void> {
  const orgId = key.organizationId;
  const event: CallEvent = { keyId: key.id, method, path, at: at.toISOString() };
  const day = utcDayOf(at);
  await redis.set(K.since(orgId), event.at, "NX");
  await redis.hincrby(K.req(orgId), key.id, 1);
  await redis.hincrby(K.day(orgId, day), key.id, 1);
  // A fresh TTL on every write keeps active buckets alive for 92 days; the
  // largest statistics window is 90, so a live bucket always covers it.
  await redis.expire(K.day(orgId, day), PUBLIC_API_DAY_BUCKET_TTL_DAYS * 86400);
  await redis.lpush(K.evt(orgId), JSON.stringify(event));
  await redis.ltrim(K.evt(orgId), 0, PUBLIC_API_EVENT_CAP - 1);
}

/**
 * Usage report for an organization's public API keys.
 *
 * Honesty rules (mirroring the prompt-templates ledger):
 *   - counts come only from the ledger; identifiers only from the database;
 *     the two are never mixed into one number;
 *   - a day with no recorded call is absent, and days before `ledgerStart`
 *     are not counted as zero-call days;
 *   - averages are floored, never rounded, and `null` on an empty
 *     denominator;
 *   - a key deleted after its calls were recorded keeps its counts with
 *     `name: null` / `keyPrefix: null`.
 */
export async function publicApiUsage(
  organizationId: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<PubUsageReport> {
  const generatedAt = now;

  // ── Database side: identifiers (measured) ─────────────────────────────
  const rows = await prisma.apiKey.findMany({ where: { organizationId } });
  const byId = new Map<string, { id: string; name: string | null; keyPrefix: string | null; revoked: boolean; lastUsedAt: Date | null }>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        revoked: Boolean((r as any).revokedAt),
        lastUsedAt: (r as any).lastUsedAt ?? null,
      },
    ]),
  );

  // ── Ledger side (best-effort) ─────────────────────────────────────────
  let ledgerAvailable = true;
  let since: string | null = null;
  let totals: Record<string, number> = {};
  let dayBuckets: Map<string, Record<string, number>> = new Map();
  let recentEvents: CallEvent[] = [];
  try {
    since = await redis.get(K.since(organizationId));
    const rawTotals = await redis.hgetall(K.req(organizationId));
    for (const [keyId, raw] of Object.entries(rawTotals)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) totals[keyId] = n;
    }
    const windowDaysList: string[] = [];
    for (let i = windowDays - 1; i >= 0; i--) windowDaysList.push(utcDayBefore(generatedAt, i));
    for (const day of windowDaysList) {
      const h = await redis.hgetall(K.day(organizationId, day));
      const counts: Record<string, number> = {};
      for (const [keyId, raw] of Object.entries(h)) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) counts[keyId] = n;
      }
      if (Object.keys(counts).length > 0) dayBuckets.set(day, counts);
    }
    const rawEvents = await redis.lrange(K.evt(organizationId), 0, PUBLIC_API_RECENT_CALLS_LIMIT - 1);
    recentEvents = rawEvents
      .map((s) => {
        try {
          const e = JSON.parse(s) as CallEvent;
          return typeof e?.keyId === "string" && typeof e?.method === "string" &&
            typeof e?.path === "string" && typeof e?.at === "string"
            ? e
            : null;
        } catch {
          return null;
        }
      })
      .filter((e): e is CallEvent => e !== null);
  } catch (err) {
    ledgerAvailable = false;
    logger.warn("[public-api] usage ledger read failed", { err: (err as Error)?.message });
    since = null;
    totals = {};
    dayBuckets = new Map();
    recentEvents = [];
  }

  // ── Derived numbers ───────────────────────────────────────────────────
  let totalCalls = 0;
  let callsInWindow = 0;
  let callsToday = 0;
  let distinctUseDays = 0;
  const perKeyWindow = new Map<string, number>();
  const today = utcDayOf(generatedAt);

  for (const [day, counts] of [...dayBuckets.entries()].sort()) {
    const dayTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    callsInWindow += dayTotal;
    distinctUseDays += 1;
    if (day === today) callsToday = dayTotal;
    for (const [keyId, n] of Object.entries(counts)) {
      perKeyWindow.set(keyId, (perKeyWindow.get(keyId) ?? 0) + n);
    }
  }
  totalCalls = Object.values(totals).reduce((a, b) => a + b, 0);

  let ledgerCoveredDays = 0;
  if (since) {
    const startDay = since.slice(0, 10);
    const windowStartDay = utcDayBefore(generatedAt, windowDays - 1);
    const coveredFrom = startDay > windowStartDay ? startDay : windowStartDay;
    if (coveredFrom <= today) {
      ledgerCoveredDays = Math.floor((Date.parse(today) - Date.parse(coveredFrom)) / 86400000) + 1;
    }
  }

  const keyIds = new Set([...byId.keys(), ...Object.keys(totals), ...perKeyWindow.keys()]);
  const perKey: PubKeyUsageRow[] = [...keyIds].map((keyId) => ({
    keyId,
    name: byId.get(keyId)?.name ?? null,
    keyPrefix: byId.get(keyId)?.keyPrefix ?? null,
    revoked: byId.get(keyId)?.revoked ?? false,
    calls: totals[keyId] ?? 0,
    callsInWindow: perKeyWindow.get(keyId) ?? 0,
    callsToday: dayBuckets.get(today)?.[keyId] ?? 0,
    lastUsedAt: byId.get(keyId)?.lastUsedAt
      ? new Date(byId.get(keyId)!.lastUsedAt!).toISOString()
      : null,
  })).sort((a, b) => b.calls - a.calls || a.keyId.localeCompare(b.keyId));

  return {
    windowDays,
    generatedAt: generatedAt.toISOString(),
    ledgerAvailable,
    ledgerStart: since,
    totalCalls,
    callsInWindow,
    callsToday,
    distinctUseDays,
    ledgerCoveredDays,
    avgCallsPerDay: promptTemplateAvgPerDay(callsInWindow, ledgerCoveredDays),
    perKey,
    recentCalls: recentEvents.map((e) => ({ keyId: e.keyId, method: e.method, path: e.path, at: e.at })),
    note: PUBLIC_API_USAGE_NOTE,
  };
}
