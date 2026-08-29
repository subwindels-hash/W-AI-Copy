/**
 * Session 119 — Prompt Templates usage ledger.
 *
 * Session 23 counted template uses in a single `usageCount` column on the
 * PromptTemplate row. That counter is durable and remains the source of truth
 * for lifetime totals, but it has no time dimension: nothing could answer
 * "which templates were used this week", "how many times this month", or
 * "what is the most-used template right now". This file adds an org-scoped
 * event ledger in Redis that records *when* a use happened, plus the
 * statistics endpoint built on it.
 *
 * Keys (the organization id is always the segment straight after the prefix,
 * so the Session 89 isolation sweep's org-segment derivation holds):
 *   pt:since:<org>          first-event marker (set once with NX) — the true
 *                           ledger start, immune to the event-list cap
 *   pt:use:<org>            append-only list of use events (newest first,
 *                           capped at PROMPT_TEMPLATE_LEDGER_CAP)
 *   pt:recent:<org>         sorted set: templateId → last-used epoch ms
 *   pt:day:<org>:<YYYY-MM-DD>  hash: templateId → uses that UTC day (TTL 92 d)
 *
 * The prefix is `pt:` and NOT a shorter `pt` entry in the isolation catalog:
 * `pt:use:<org>` has the org in the second segment, and a bare `pt` namespace
 * would make the sweep expect it in the first — it would read the literal
 * `use` as an organization id and report a conformance check it never made.
 *
 * The ledger is best-effort by design: a Redis outage must never block or
 * fail a template use (the durable `usageCount` increment still happens), and
 * the statistics payload says `ledgerAvailable: false` rather than pretending
 * the empty ledger is a measured zero.
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { resolveUserContext } from "../services/workspace.service.js";
import {
  PROMPT_TEMPLATE_DAY_BUCKET_TTL_DAYS,
  PROMPT_TEMPLATE_LEDGER_CAP,
  PROMPT_TEMPLATE_STATS_NOTE,
  PROMPT_TEMPLATE_STATS_TOP_N,
  promptTemplateAvgPerDay,
  utcDayBefore,
  utcDayOf,
} from "@windels/shared/promptTemplates";
import type {
  PromptTemplateDailyUses,
  PromptTemplateStats,
  PromptTemplateTopTemplate,
} from "@windels/shared/promptTemplates";

const K = {
  since: (orgId: string) => `pt:since:${orgId}`,
  events: (orgId: string) => `pt:use:${orgId}`,
  recent: (orgId: string) => `pt:recent:${orgId}`,
  day: (orgId: string, day: string) => `pt:day:${orgId}:${day}`,
};

interface UseEvent {
  templateId: string;
  userId: string;
  at: string; // ISO
}

/** Record one template use in the org ledger. Never throws: the caller's use
 *  path must not depend on the ledger. */
export async function recordTemplateUse(
  organizationId: string,
  templateId: string,
  userId: string,
  at: Date,
): Promise<void> {
  const event: UseEvent = { templateId, userId, at: at.toISOString() };
  const day = utcDayOf(at);
  // First-event marker: NX so the true ledger start survives the event-list
  // cap (the list keeps only the newest PROMPT_TEMPLATE_LEDGER_CAP events).
  await redis.set(K.since(organizationId), event.at, "NX");
  await redis.lpush(K.events(organizationId), JSON.stringify(event));
  await redis.ltrim(K.events(organizationId), 0, PROMPT_TEMPLATE_LEDGER_CAP - 1);
  await redis.zadd(K.recent(organizationId), at.getTime(), templateId);
  await redis.hincrby(K.day(organizationId, day), templateId, 1);
  // A fresh TTL on every write keeps active buckets alive for 92 days; the
  // largest statistics window is 90, so a live bucket always covers it.
  await redis.expire(K.day(organizationId, day), PROMPT_TEMPLATE_DAY_BUCKET_TTL_DAYS * 86400);
}

/**
 * Statistics for the organization's prompt library.
 *
 * Honesty rules:
 *   - lifetime numbers come from the database (`usageCount`); window numbers
 *     come from the event ledger; the two are never mixed;
 *   - a day with no recorded event is absent from `daily` — absence is not a
 *     measured zero, and the payload says when the ledger began;
 *   - `avgUsesPerDay` divides by the calendar days the ledger actually covers
 *     inside the window (days before `ledgerStart` are not counted as zero);
 *   - rates/averages are floored, never rounded, and `null` on an empty
 *     denominator;
 *   - a template deleted after its uses were recorded keeps its id and count
 *     in the window aggregates, with `title: null` — the title is not
 *     invented.
 */
export async function templateStats(
  userId: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<PromptTemplateStats> {
  const ctx = await resolveUserContext(userId);
  const orgId = ctx.organizationId;
  const generatedAt = now;

  // ── Database side (measured, durable) ─────────────────────────────────
  const rows = await prisma.promptTemplate.findMany({
    where: { organizationId: orgId },
  });
  const byId = new Map<string, { id: string; title: string | null }>(
    rows.map((r) => [r.id, r] as [string, { id: string; title: string | null }]),
  );
  const totalTemplates = rows.length;
  const builtInTemplates = rows.filter((r) => r.isBuiltIn).length;
  const totalUses = rows.reduce((sum, r) => sum + (r.usageCount ?? 0), 0);

  // ── Ledger side (best-effort) ─────────────────────────────────────────
  let ledgerAvailable = true;
  let events: UseEvent[] = [];
  let recentIds: string[] = [];
  let dayBuckets: Map<string, Record<string, number>> = new Map();
  let since: string | null = null;
  try {
    since = await redis.get(K.since(orgId));
    const rawEvents = await redis.lrange(K.events(orgId), 0, -1);
    events = rawEvents
      .map((s) => {
        try {
          const e = JSON.parse(s) as UseEvent;
          return typeof e?.templateId === "string" && typeof e?.at === "string" ? e : null;
        } catch {
          return null;
        }
      })
      .filter((e): e is UseEvent => e !== null);
    recentIds = await redis.zrange(K.recent(orgId), 0, -1, "REV");
    // Buckets for the requested window: (windowDays-1) days ago … today.
    const windowDaysList: string[] = [];
    for (let i = windowDays - 1; i >= 0; i--) windowDaysList.push(utcDayBefore(generatedAt, i));
    for (const day of windowDaysList) {
      const h = await redis.hgetall(K.day(orgId, day));
      const counts: Record<string, number> = {};
      for (const [templateId, raw] of Object.entries(h)) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) counts[templateId] = n;
      }
      if (Object.keys(counts).length > 0) dayBuckets.set(day, counts);
    }
  } catch (err) {
    ledgerAvailable = false;
    logger.warn("[prompt-templates] usage ledger read failed", { err: (err as Error)?.message });
    events = [];
    recentIds = [];
    dayBuckets = new Map();
    since = null;
  }

  // ── Derived numbers ───────────────────────────────────────────────────
  const ledgerStart: string | null =
    since ??
    (events.length > 0
      ? events.reduce((min, e) => (e.at < min ? e.at : min), events[0]!.at)
      : null);

  let usesInWindow = 0;
  let distinctUseDays = 0;
  const perTemplate = new Map<string, { uses: number }>();
  const daily: PromptTemplateDailyUses[] = [];
  for (const [day, counts] of [...dayBuckets.entries()].sort()) {
    const dayUses = Object.values(counts).reduce((a, b) => a + b, 0);
    usesInWindow += dayUses;
    distinctUseDays += 1;
    daily.push({ day, uses: dayUses });
    for (const [templateId, n] of Object.entries(counts)) {
      const acc = perTemplate.get(templateId) ?? { uses: 0 };
      acc.uses += n;
      perTemplate.set(templateId, acc);
    }
  }

  // Calendar days inside the window that the ledger covers:
  // max(ledgerStart day, window start) … today, inclusive.
  let ledgerCoveredDays = 0;
  if (ledgerStart) {
    const startDay = ledgerStart.slice(0, 10);
    const windowStartDay = utcDayBefore(generatedAt, windowDays - 1);
    const coveredFrom = startDay > windowStartDay ? startDay : windowStartDay;
    const today = utcDayOf(generatedAt);
    if (coveredFrom <= today) {
      const from = Date.parse(coveredFrom);
      const to = Date.parse(today);
      ledgerCoveredDays = Math.floor((to - from) / 86400000) + 1;
    }
  }

  const topTemplates: PromptTemplateTopTemplate[] = [...perTemplate.entries()]
    .sort((a, b) => b[1].uses - a[1].uses)
    .slice(0, PROMPT_TEMPLATE_STATS_TOP_N)
    .map(([templateId, { uses }]) => ({
      templateId,
      uses,
      title: byId.get(templateId)?.title ?? null,
      lastUsedAt: null, // filled below, after the score lookup
    }));

  const recentTemplates: PromptTemplateTopTemplate[] = recentIds
    .slice(0, PROMPT_TEMPLATE_STATS_TOP_N)
    .map((templateId) => ({
      templateId,
      uses: perTemplate.get(templateId)?.uses ?? 0,
      title: byId.get(templateId)?.title ?? null,
      lastUsedAt: null, // filled below, after the score lookup
    }));

  // Last-used timestamps: looked up once per id for the union of the two
  // lists (≤ 10 lookups), never fabricated for ids outside them.
  const recentScores = new Map<string, number>();
  for (const id of new Set([...recentTemplates, ...topTemplates].map((t) => t.templateId))) {
    const score = await redis.zscore(K.recent(orgId), id).catch(() => null);
    const ms = score !== null ? Number(score) : NaN;
    if (Number.isFinite(ms)) recentScores.set(id, ms);
  }
  for (const t of [...topTemplates, ...recentTemplates]) {
    t.lastUsedAt = recentScores.has(t.templateId)
      ? new Date(recentScores.get(t.templateId)!).toISOString()
      : null;
  }

  return {
    windowDays,
    generatedAt: generatedAt.toISOString(),
    totalTemplates,
    builtInTemplates,
    userTemplates: totalTemplates - builtInTemplates,
    totalUses,
    ledgerAvailable,
    ledgerStart,
    usesInWindow,
    distinctUseDays,
    ledgerCoveredDays,
    avgUsesPerDay: promptTemplateAvgPerDay(usesInWindow, ledgerCoveredDays),
    topTemplates,
    recentTemplates,
    daily,
    note: PROMPT_TEMPLATE_STATS_NOTE,
  };
}
