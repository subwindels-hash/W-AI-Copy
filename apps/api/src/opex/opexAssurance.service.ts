/**
 * Session 118 — Operational-excellence assurance.
 *
 * Session 73's `opex.service.ts` is not rewritten by this file. Its three
 * endpoints keep their paths and their payload shapes; `createAlert` and
 * `updateAlert` now write *through* this service, so they gain a durable
 * register without changing a line of their contract.
 *
 * WHAT WAS WRONG, AND IS FIXED HERE
 * ---------------------------------
 *   - **The register was one JSON blob in one Redis string.** Filing an alert
 *     was GET -> push -> SET, and so was every status change. Two concurrent
 *     writers silently lost one of their writes, and the blob grew without a
 *     bound: every dashboard read fetched and parsed the organization's entire
 *     safety history. Findings are now one key each, indexed by an append-only
 *     list, so a concurrent file cannot erase another.
 *   - **"Mitigations (24h)" counted the wrong timestamp.** The filter was
 *     `status === "resolved" && at >= 24h ago`, and `at` is the *filing* time.
 *     A finding filed three days ago and resolved a minute ago did not count;
 *     one filed two hours ago and resolved ninety minutes ago did. There was no
 *     resolution timestamp anywhere in the record. There is now, and records
 *     adopted from the old blob — which genuinely have none — are reported
 *     separately as `resolvedTimeUnknown` rather than being given one.
 *   - **The "safety pass rate" was a closure rate.** `(total - open) / total`
 *     is the share of filed findings that have been closed. It was fed into
 *     `trust.safety` and rendered as "Safety Pass". An organization that files
 *     one trivial finding and closes it reached 100%. It is still computed, is
 *     still returned under its original field for the existing console, and is
 *     now named `closureRatePercent` with a note that says what it is.
 *   - **Unassessed dimensions were the number 0.** `alignment`, `compliance`,
 *     `transparency`, `explainability` and `hallucinationRisk` were literal
 *     zeros. On a 0-100 scale zero is a score, and the console rendered
 *     "Alignment 0%". For `hallucinationRisk` it is worse than meaningless: 0
 *     on a risk metric is the *best* possible reading, so a platform nobody had
 *     ever assessed reported no hallucination risk. Every dimension here is
 *     `number | null` with the basis it was obtained on.
 *   - **Reliability rounded up.** `Math.round(999/1000 * 100)` is 100. A metric
 *     that rounds a failure away cannot be used to notice one. It is floored.
 *   - **`dataFreshnessHours` was 0 when nothing had ever run**, which reads as
 *     perfectly fresh. It is null.
 *   - **One signal was presented as three dimensions.** `trust.trust`,
 *     `trust.reliability` and `trust.operationalStability` were all the AI
 *     success rate.
 *   - **`humanApprovalRate` mixed two windows.** The numerator counted tasks
 *     completed in the last 30 days; the denominator added every TODO and
 *     IN_PROGRESS task ever created. No approval workflow feeds either. The
 *     windows now match, and the measure is reported as what it is.
 *   - **A resolved finding could never be reopened**, so a mis-resolution was
 *     permanent, and no transition history was kept at all.
 *
 * WHAT THIS SERVICE REFUSES TO CLAIM
 * ----------------------------------
 *   - It publishes no single composite trust score. Averaging observed traffic
 *     against unassessed dimensions produces a number whose movement cannot be
 *     attributed to anything.
 *   - A dimension is `not_assessed` until a person records an assessment and
 *     says how they performed it. The platform never scores itself.
 *   - The register holds what the organization filed. An empty register is not
 *     evidence that nothing happened, and the payload says so.
 *   - Expectations are advisory. A breach is recorded; nothing is refused.
 *
 * Keys (organization id is always the segment straight after the prefix, so the
 * Session 89 sweep can check conformance):
 *   opx:alert:<org>:<alertId>   one finding
 *   opx:idx:<org>               append-only list of finding ids, newest first
 *   opx:assess:<org>:<dim>      one operator assessment
 *   opx:policy:<org>            the organization's expectations
 *   opx:event:<org>             the ledger
 *   opx:imported:<org>          marker: the Session 73 blob has been adopted
 *
 * The new namespaces are `opx:`, not `opex:`, deliberately. Session 73's keys
 * are `opex:<org>:meta` and `opex:<org>:safety-alerts` — the organization sits
 * in the *second* segment. Adding `opex:alert:<org>:<id>` under the same root
 * would make the isolation sweep read the literal string "alert" as an
 * organization id and report a conformance check it never performed.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import {
  OPEX_ALERT_STATUSES,
  OPEX_ASSESSED_DIMENSIONS,
  OPEX_ASSESSMENT_NOTE,
  OPEX_BREACH_NOTE,
  OPEX_CLOSURE_NOTE,
  OPEX_COMPOSITE_NOTE,
  OPEX_CONFIG_NOTE,
  OPEX_DEFAULT_ASSESSMENT_VALIDITY_DAYS,
  OPEX_EVENT_LIMIT,
  OPEX_FRESHNESS_NOTE,
  OPEX_IMPORT_NOTE,
  OPEX_LEDGER_NOTE,
  OPEX_MAX_ALERTS,
  OPEX_MAX_ALERT_PAGE,
  OPEX_MAX_LATENCY_SAMPLE,
  OPEX_MEASURE_NOTE,
  OPEX_PROVENANCE_NOTE,
  OPEX_REGISTER_NOTE,
  OPEX_RELIABILITY_NOTE,
  OPEX_SEVERITIES,
  OPEX_UNIMPLEMENTED_SECTIONS,
  defaultOpexPolicy,
  emptyOpexAgeing,
  notAssessedMeasure,
  opexAgeingBucket,
  opexAssessmentExpiry,
  opexAssessmentStale,
  opexDimensionDirection,
  opexGapReport,
  opexHoursBetween,
  opexPercentile,
  opexRatePercent,
} from "@windels/shared/opex";
import type {
  OpexAgeing,
  OpexAlertPage,
  OpexAlertRecord,
  OpexAlertStatus,
  OpexAssessedDimension,
  OpexAssessment,
  OpexAssessmentRegister,
  OpexAssuranceSummary,
  OpexBreach,
  OpexBreachReport,
  OpexConfigurationCheck,
  OpexConfigurationReport,
  OpexEvent,
  OpexEventKind,
  OpexEventPage,
  OpexFailureBreakdown,
  OpexFailureGroup,
  OpexGapReport,
  OpexMeasure,
  OpexPolicy,
  OpexPolicyUpdateInput,
  OpexProvenance,
  OpexRegisterSummary,
  OpexReliability,
  OpexSeverity,
  OpexStat,
  OpexTimings,
  OpexTransition,
  OpexTrustReport,
} from "@windels/shared/opex";

/* ── Keys ──────────────────────────────────────────────────────────────── */

const kAlert = (org: string, id: string) => `opx:alert:${org}:${id}`;
const kIndex = (org: string) => `opx:idx:${org}`;
const kAssess = (org: string, dim: string) => `opx:assess:${org}:${dim}`;
const kPolicy = (org: string) => `opx:policy:${org}`;
const kEvent = (org: string) => `opx:event:${org}`;
const kImported = (org: string) => `opx:imported:${org}`;
/** Session 73's own key, read once so nothing already filed is lost. */
const kLegacyRegister = (org: string) => `opex:${org}:safety-alerts`;

/** The Session 73 record shape, as it is still returned by the original routes. */
export interface LegacyOpexAlert {
  id: string;
  category: string;
  severity: OpexSeverity;
  source: string;
  message: string;
  model?: string;
  at: string;
  status: OpexAlertStatus;
  acknowledgedBy?: string;
  resolvedBy?: string;
  note?: string;
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Reduce a durable record to the shape Session 73's callers already expect. */
export function toLegacyAlert(record: OpexAlertRecord): LegacyOpexAlert {
  const out: LegacyOpexAlert = {
    id: record.id,
    category: record.category,
    severity: record.severity,
    source: record.source,
    message: record.message,
    at: record.filedAt,
    status: record.status,
  };
  if (record.model) out.model = record.model;
  if (record.acknowledgedBy) out.acknowledgedBy = record.acknowledgedBy;
  if (record.resolvedBy) out.resolvedBy = record.resolvedBy;
  if (record.note) out.note = record.note;
  return out;
}

export const OpexAssuranceService = {
  /* ── Policy ──────────────────────────────────────────────────────────── */

  async getPolicy(organizationId: string): Promise<OpexPolicy> {
    const stored = parse<Partial<OpexPolicy>>(await redis.get(kPolicy(organizationId)));
    const base = defaultOpexPolicy(organizationId);
    if (!stored) return base;
    return {
      ...base,
      ...stored,
      organizationId,
      isDefault: false,
      note: base.note,
    };
  },

  async updatePolicy(
    organizationId: string,
    actorId: string,
    input: OpexPolicyUpdateInput,
  ): Promise<OpexPolicy> {
    const current = await this.getPolicy(organizationId);
    const next: OpexPolicy = {
      ...current,
      ...input,
      organizationId,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
      isDefault: false,
    };
    if (next.criticalResolveHours < next.criticalAckHours) {
      throw AppError.badRequest(
        "A resolution expectation earlier than the acknowledgement expectation cannot be met: every breach of one would be a breach of the other.",
      );
    }
    await redis.set(kPolicy(organizationId), JSON.stringify(next));
    await this.recordEvent(organizationId, {
      kind: "policy_updated",
      actorId,
      alertId: null,
      detail: "Operational-excellence expectations were updated.",
      metadata: {
        reliabilityWindowDays: next.reliabilityWindowDays,
        criticalAckHours: next.criticalAckHours,
        criticalResolveHours: next.criticalResolveHours,
        assessmentValidityDays: next.assessmentValidityDays,
      },
    });
    return next;
  },

  /* ── Ledger ──────────────────────────────────────────────────────────── */

  async recordEvent(
    organizationId: string,
    input: {
      kind: OpexEventKind;
      actorId: string | null;
      alertId: string | null;
      detail: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ): Promise<void> {
    const event: OpexEvent = {
      id: `opxe-${randomUUID()}`,
      at: new Date().toISOString(),
      kind: input.kind,
      organizationId,
      actorId: input.actorId,
      alertId: input.alertId,
      detail: input.detail,
      metadata: input.metadata ?? {},
    };
    try {
      await redis.lpush(kEvent(organizationId), JSON.stringify(event));
      await redis.ltrim(kEvent(organizationId), 0, OPEX_EVENT_LIMIT - 1);
    } catch {
      /* the ledger must never fail the action it observes */
    }
  },

  async listEvents(
    organizationId: string,
    filters: { kind?: OpexEventKind; alertId?: string; limit?: number } = {},
  ): Promise<OpexEventPage> {
    const raw = await redis.lrange(kEvent(organizationId), 0, OPEX_EVENT_LIMIT - 1);
    const all = raw
      .map((r) => parse<OpexEvent>(r))
      .filter((e): e is OpexEvent => !!e && e.organizationId === organizationId);
    let matching = all;
    if (filters.kind) matching = matching.filter((e) => e.kind === filters.kind);
    if (filters.alertId) matching = matching.filter((e) => e.alertId === filters.alertId);
    const limit = Math.min(filters.limit ?? 50, OPEX_EVENT_LIMIT);
    return {
      events: matching.slice(0, limit),
      stored: all.length,
      retentionLimit: OPEX_EVENT_LIMIT,
      oldestAt: all.length ? (all[all.length - 1]!.at ?? null) : null,
      note: OPEX_LEDGER_NOTE,
    };
  },

  /* ── Register: storage ───────────────────────────────────────────────── */

  /**
   * Adopt Session 73's blob, once.
   *
   * The old register is read and every finding it holds becomes a durable
   * record. Their acknowledgement and resolution times are set to null and the
   * record is flagged `importedFromLegacyRegister`, because those times were
   * never recorded and inventing them would be the same class of error this
   * session exists to fix.
   */
  async ensureLegacyImported(organizationId: string): Promise<number> {
    if (await redis.exists(kImported(organizationId))) return 0;
    const legacy = parse<LegacyOpexAlert[]>(await redis.get(kLegacyRegister(organizationId)));
    // Mark first: a second concurrent reader must not import the same blob twice.
    await redis.set(kImported(organizationId), new Date().toISOString());
    if (!Array.isArray(legacy) || legacy.length === 0) return 0;

    let imported = 0;
    // Oldest first, so the newest ends up at the head of the index.
    for (const old of legacy) {
      if (!old || typeof old.id !== "string" || !old.id) continue;
      if (await redis.get(kAlert(organizationId, old.id))) continue;
      const filedAt = typeof old.at === "string" ? old.at : new Date().toISOString();
      const status: OpexAlertStatus = OPEX_ALERT_STATUSES.includes(old.status as OpexAlertStatus)
        ? (old.status as OpexAlertStatus)
        : "open";
      const record: OpexAlertRecord = {
        id: old.id,
        organizationId,
        category: String(old.category ?? "uncategorised"),
        severity: OPEX_SEVERITIES.includes(old.severity as OpexSeverity)
          ? (old.severity as OpexSeverity)
          : "info",
        source: String(old.source ?? "unknown"),
        message: String(old.message ?? ""),
        model: old.model ?? null,
        status,
        filedAt,
        acknowledgedAt: null,
        acknowledgedBy: old.acknowledgedBy ?? null,
        resolvedAt: null,
        resolvedBy: old.resolvedBy ?? null,
        reopenedAt: null,
        reopenCount: 0,
        updatedAt: filedAt,
        note: old.note ?? null,
        importedFromLegacyRegister: true,
        transitions: [],
      };
      await redis.set(kAlert(organizationId, record.id), JSON.stringify(record));
      await redis.lpush(kIndex(organizationId), record.id);
      imported++;
    }
    if (imported > 0) {
      await this.recordEvent(organizationId, {
        kind: "legacy_register_imported",
        actorId: null,
        alertId: null,
        detail: `${imported} finding(s) were adopted from the Session 73 register. Their acknowledgement and resolution times were never recorded and are reported as unknown.`,
        metadata: { imported },
      });
    }
    return imported;
  },

  async readAlert(organizationId: string, alertId: string): Promise<OpexAlertRecord | null> {
    const record = parse<OpexAlertRecord>(await redis.get(kAlert(organizationId, alertId)));
    // A record whose stored organization does not match the caller's is skipped
    // rather than returned: the key namespace is the boundary, and a mismatch
    // means the value was written by something that did not respect it.
    if (!record || record.organizationId !== organizationId) return null;
    return record;
  },

  async getAlert(organizationId: string, alertId: string): Promise<OpexAlertRecord> {
    await this.ensureLegacyImported(organizationId);
    const record = await this.readAlert(organizationId, alertId);
    if (!record) throw AppError.notFound("Safety finding not found");
    return record;
  },

  async loadAll(organizationId: string): Promise<{ records: OpexAlertRecord[]; truncated: boolean }> {
    await this.ensureLegacyImported(organizationId);
    const policy = await this.getPolicy(organizationId);
    const cap = Math.min(policy.registerRetention, OPEX_MAX_ALERTS);
    const ids = await redis.lrange(kIndex(organizationId), 0, cap - 1);
    const total = await redis.lrange(kIndex(organizationId), 0, OPEX_MAX_ALERTS);
    const records: OpexAlertRecord[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const record = await this.readAlert(organizationId, id);
      if (record) records.push(record);
    }
    return { records, truncated: total.length > cap };
  },

  /**
   * File a finding.
   *
   * The record is written under its own key before the index entry, so a
   * failure between the two leaves an unindexed record rather than an index
   * entry pointing at nothing.
   */
  async fileAlert(
    organizationId: string,
    actorId: string | null,
    input: {
      category: string;
      severity: OpexSeverity;
      source: string;
      message: string;
      model?: string | null;
    },
  ): Promise<OpexAlertRecord> {
    await this.ensureLegacyImported(organizationId);
    const now = new Date().toISOString();
    const record: OpexAlertRecord = {
      id: `safety-${randomUUID()}`,
      organizationId,
      category: input.category,
      severity: input.severity,
      source: input.source,
      message: input.message,
      model: input.model ?? null,
      status: "open",
      filedAt: now,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      reopenedAt: null,
      reopenCount: 0,
      updatedAt: now,
      note: null,
      importedFromLegacyRegister: false,
      transitions: [{ at: now, from: null, to: "open", actorId: actorId ?? "system", reason: null }],
    };
    await redis.set(kAlert(organizationId, record.id), JSON.stringify(record));
    await redis.lpush(kIndex(organizationId), record.id);

    const policy = await this.getPolicy(organizationId);
    const cap = Math.min(policy.registerRetention, OPEX_MAX_ALERTS);
    await redis.ltrim(kIndex(organizationId), 0, cap - 1);

    await this.recordEvent(organizationId, {
      kind: "alert_filed",
      actorId,
      alertId: record.id,
      detail: `A ${input.severity} finding was filed in category ${input.category}.`,
      metadata: { severity: input.severity, category: input.category, source: input.source },
    });
    return record;
  },

  /**
   * Move a finding to `acknowledged` or `resolved`, recording when and by whom.
   *
   * Session 73 stamped only `acknowledgedBy` / `resolvedBy` on the record and
   * never a time, which is why "mitigations in the last 24 hours" could not be
   * computed. Each transition is now appended to an immutable history.
   */
  async transitionAlert(
    organizationId: string,
    alertId: string,
    actorId: string,
    to: "acknowledged" | "resolved",
    note?: string,
  ): Promise<OpexAlertRecord> {
    const record = await this.getAlert(organizationId, alertId);
    if (record.status === "resolved") {
      throw AppError.conflict(
        "Safety alert is already resolved. Reopen it first if the resolution was wrong.",
      );
    }
    if (record.status === to) {
      throw AppError.conflict(`Safety finding is already ${to}.`);
    }
    const now = new Date().toISOString();
    const transition: OpexTransition = {
      at: now,
      from: record.status,
      to,
      actorId,
      reason: note ?? null,
    };
    const next: OpexAlertRecord = {
      ...record,
      status: to,
      note: note ?? record.note,
      updatedAt: now,
      ...(to === "acknowledged"
        ? { acknowledgedAt: now, acknowledgedBy: actorId }
        : { resolvedAt: now, resolvedBy: actorId }),
      transitions: [...record.transitions, transition],
    };
    await redis.set(kAlert(organizationId, alertId), JSON.stringify(next));
    await this.recordEvent(organizationId, {
      kind: to === "acknowledged" ? "alert_acknowledged" : "alert_resolved",
      actorId,
      alertId,
      detail: `Finding moved from ${record.status} to ${to}.`,
      metadata: { from: record.status, to, severity: record.severity },
    });
    return next;
  },

  /**
   * Reopen a resolved finding.
   *
   * There was no way to do this: `updateAlert` refused any change to a resolved
   * record, so a mis-resolution was permanent. The previous resolution stays in
   * the history — reopening adds a transition, it does not erase one.
   */
  async reopenAlert(
    organizationId: string,
    alertId: string,
    actorId: string,
    reason: string,
  ): Promise<OpexAlertRecord> {
    const record = await this.getAlert(organizationId, alertId);
    if (record.status !== "resolved") {
      throw AppError.conflict("Only a resolved finding can be reopened.");
    }
    const policy = await this.getPolicy(organizationId);
    if (policy.requireReopenReason && reason.trim().length === 0) {
      throw AppError.badRequest("This organization requires a reason to reopen a finding.");
    }
    const now = new Date().toISOString();
    const next: OpexAlertRecord = {
      ...record,
      status: "open",
      // The resolution that is being undone stays visible.
      resolvedAt: record.resolvedAt,
      resolvedBy: record.resolvedBy,
      reopenedAt: now,
      reopenCount: record.reopenCount + 1,
      updatedAt: now,
      note: reason,
      transitions: [
        ...record.transitions,
        { at: now, from: "resolved", to: "open", actorId, reason },
      ],
    };
    await redis.set(kAlert(organizationId, alertId), JSON.stringify(next));
    await this.recordEvent(organizationId, {
      kind: "alert_reopened",
      actorId,
      alertId,
      detail: "A resolved finding was reopened.",
      metadata: { reopenCount: next.reopenCount, severity: record.severity },
    });
    return next;
  },

  /* ── Register: reads ─────────────────────────────────────────────────── */

  async listAlerts(
    organizationId: string,
    filters: {
      status?: OpexAlertStatus;
      severity?: OpexSeverity;
      category?: string;
      limit?: number;
    } = {},
  ): Promise<OpexAlertPage> {
    const { records, truncated } = await this.loadAll(organizationId);
    let matching = records;
    if (filters.status) matching = matching.filter((r) => r.status === filters.status);
    if (filters.severity) matching = matching.filter((r) => r.severity === filters.severity);
    if (filters.category) {
      const needle = filters.category.toLowerCase();
      matching = matching.filter((r) => r.category.toLowerCase() === needle);
    }
    const limit = Math.min(filters.limit ?? 50, OPEX_MAX_ALERT_PAGE);
    const page = matching.slice(0, limit);
    return {
      alerts: page,
      total: matching.length,
      returned: page.length,
      truncated: truncated || matching.length > limit,
      note: OPEX_REGISTER_NOTE,
    };
  },

  async registerSummary(organizationId: string, nowMs = Date.now()): Promise<OpexRegisterSummary> {
    const { records, truncated } = await this.loadAll(organizationId);
    const policy = await this.getPolicy(organizationId);

    const byStatus: Record<OpexAlertStatus, number> = { open: 0, acknowledged: 0, resolved: 0 };
    const bySeverity: Record<OpexSeverity, number> = { info: 0, warning: 0, critical: 0 };
    const categories = new Map<string, { total: number; open: number }>();
    const ageing: OpexAgeing = emptyOpexAgeing();

    let open = 0;
    let openCritical = 0;
    let oldestOpenAt: string | null = null;
    let resolvedLast24h = 0;
    let resolvedTimeUnknown = 0;
    let imported = 0;

    for (const r of records) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      const cat = categories.get(r.category) ?? { total: 0, open: 0 };
      cat.total++;
      if (r.importedFromLegacyRegister) imported++;

      if (r.status !== "resolved") {
        open++;
        cat.open++;
        if (r.severity === "critical") openCritical++;
        const filed = Date.parse(r.filedAt);
        if (Number.isFinite(filed)) {
          ageing[opexAgeingBucket((nowMs - filed) / 3_600_000)]++;
          if (!oldestOpenAt || filed < Date.parse(oldestOpenAt)) oldestOpenAt = r.filedAt;
        }
      } else if (r.resolvedAt) {
        const resolved = Date.parse(r.resolvedAt);
        if (Number.isFinite(resolved) && nowMs - resolved <= 86_400_000) resolvedLast24h++;
      } else {
        // Resolved, but the time was never recorded. Counted as unknown rather
        // than folded into or out of the 24-hour figure.
        resolvedTimeUnknown++;
      }
      categories.set(r.category, cat);
    }

    const resolvedTotal = byStatus.resolved;
    const oldestOpenAgeHours = oldestOpenAt
      ? Math.round(((nowMs - Date.parse(oldestOpenAt)) / 3_600_000) * 100) / 100
      : null;

    return {
      total: records.length,
      byStatus,
      bySeverity,
      byCategory: [...categories.entries()]
        .map(([category, v]) => ({ category, total: v.total, open: v.open }))
        .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)),
      open,
      openCritical,
      oldestOpenAt,
      oldestOpenAgeHours,
      ageing,
      closureRatePercent: opexRatePercent(resolvedTotal, records.length),
      resolvedLast24h,
      resolvedTimeUnknown,
      imported,
      retentionLimit: Math.min(policy.registerRetention, OPEX_MAX_ALERTS),
      truncated,
      note: OPEX_REGISTER_NOTE,
      closureNote: OPEX_CLOSURE_NOTE,
    };
  },

  /**
   * Median and p90 time-to-acknowledge and time-to-resolve.
   *
   * Only records that carry both endpoints contribute. Everything else is
   * counted in `excluded` with the reason stated, so a small sample cannot be
   * mistaken for a complete one.
   */
  async timings(organizationId: string): Promise<OpexTimings> {
    const { records } = await this.loadAll(organizationId);
    const ackHours: number[] = [];
    const resolveHours: number[] = [];
    let ackExcluded = 0;
    let resolveExcluded = 0;

    for (const r of records) {
      const ack = opexHoursBetween(r.filedAt, r.acknowledgedAt);
      if (ack === null) ackExcluded++;
      else ackHours.push(ack);

      const res = opexHoursBetween(r.filedAt, r.resolvedAt);
      if (res === null) resolveExcluded++;
      else resolveHours.push(res);
    }

    const stat = (values: number[], excluded: number, what: string): OpexStat => ({
      median: opexPercentile(values, 50),
      p90: opexPercentile(values, 90),
      sampleSize: values.length,
      excluded,
      excludedReason: `${excluded} record(s) have no recorded ${what} time — they were never ${what}, or they were adopted from the Session 73 register, which stored no transition times.`,
    });

    return {
      timeToAcknowledgeHours: stat(ackHours, ackExcluded, "acknowledgement"),
      timeToResolveHours: stat(resolveHours, resolveExcluded, "resolution"),
      note: OPEX_IMPORT_NOTE,
    };
  },

  async breaches(organizationId: string, nowMs = Date.now()): Promise<OpexBreachReport> {
    const { records } = await this.loadAll(organizationId);
    const policy = await this.getPolicy(organizationId);
    const breaches: OpexBreach[] = [];
    let excludedImported = 0;

    for (const r of records) {
      if (r.severity !== "critical") continue;
      if (r.status === "resolved") continue;
      if (r.importedFromLegacyRegister) {
        excludedImported++;
        continue;
      }
      const filed = Date.parse(r.filedAt);
      if (!Number.isFinite(filed)) continue;
      const ageHours = Math.round(((nowMs - filed) / 3_600_000) * 100) / 100;
      if (r.status === "open" && ageHours > policy.criticalAckHours) {
        breaches.push({
          alertId: r.id,
          severity: r.severity,
          kind: "acknowledgement_overdue",
          ageHours,
          expectationHours: policy.criticalAckHours,
          filedAt: r.filedAt,
          message: r.message,
        });
      }
      if (ageHours > policy.criticalResolveHours) {
        breaches.push({
          alertId: r.id,
          severity: r.severity,
          kind: "resolution_overdue",
          ageHours,
          expectationHours: policy.criticalResolveHours,
          filedAt: r.filedAt,
          message: r.message,
        });
      }
    }

    return {
      breaches,
      counts: {
        acknowledgement_overdue: breaches.filter((b) => b.kind === "acknowledgement_overdue").length,
        resolution_overdue: breaches.filter((b) => b.kind === "resolution_overdue").length,
      },
      excludedImported,
      note: OPEX_BREACH_NOTE,
    };
  },

  /* ── Reliability, from recorded AI traffic ───────────────────────────── */

  async reliability(organizationId: string, windowDays?: number): Promise<OpexReliability> {
    const policy = await this.getPolicy(organizationId);
    const days = windowDays ?? policy.reliabilityWindowDays;
    const since = new Date(Date.now() - days * 86_400_000);

    const [total, failed, latest, sample] = await Promise.all([
      prisma.aiRequest
        .count({ where: { organizationId, createdAt: { gte: since } } })
        .catch(() => 0),
      prisma.aiRequest
        .count({
          where: { organizationId, createdAt: { gte: since }, status: { not: "succeeded" } },
        })
        .catch(() => 0),
      prisma.aiRequest
        .findFirst({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
        .catch(() => null),
      prisma.aiRequest
        .findMany({
          where: { organizationId, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: OPEX_MAX_LATENCY_SAMPLE,
          select: { durationMs: true },
        })
        .catch(() => [] as Array<{ durationMs: number }>),
    ]);

    const succeeded = Math.max(total - failed, 0);
    const durations = (sample ?? [])
      .map((r) => Number(r.durationMs))
      .filter((n) => Number.isFinite(n) && n >= 0);

    const lastRequestAt = latest?.createdAt ? new Date(latest.createdAt).toISOString() : null;

    return {
      windowDays: days,
      total,
      succeeded,
      failed,
      // Floored. 999 of 1000 is 99, never 100.
      successRatePercent: opexRatePercent(succeeded, total),
      latency: {
        p50Ms: opexPercentile(durations, 50),
        p95Ms: opexPercentile(durations, 95),
        sampleSize: durations.length,
        sampled: total > durations.length,
      },
      // Null, not 0: "0 hours old" reads as perfectly fresh.
      dataFreshnessHours: lastRequestAt
        ? Math.round(((Date.now() - Date.parse(lastRequestAt)) / 3_600_000) * 100) / 100
        : null,
      lastRequestAt,
      note: OPEX_RELIABILITY_NOTE,
      freshnessNote: OPEX_FRESHNESS_NOTE,
    };
  },

  async failureBreakdown(
    organizationId: string,
    windowDays?: number,
  ): Promise<OpexFailureBreakdown> {
    const policy = await this.getPolicy(organizationId);
    const days = windowDays ?? policy.reliabilityWindowDays;
    const since = new Date(Date.now() - days * 86_400_000);

    const [rows, total] = await Promise.all([
      prisma.aiRequest
        .findMany({
          where: { organizationId, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: OPEX_MAX_LATENCY_SAMPLE,
          select: { provider: true, modelId: true, channel: true, status: true },
        })
        .catch(
          () => [] as Array<{ provider: string; modelId: string; channel: string; status: string }>,
        ),
      prisma.aiRequest
        .count({ where: { organizationId, createdAt: { gte: since } } })
        .catch(() => 0),
    ]);

    const group = (pick: (r: (typeof rows)[number]) => string): OpexFailureGroup[] => {
      const map = new Map<string, { total: number; failed: number }>();
      for (const r of rows) {
        const key = pick(r) || "unknown";
        const entry = map.get(key) ?? { total: 0, failed: 0 };
        entry.total++;
        if (r.status !== "succeeded") entry.failed++;
        map.set(key, entry);
      }
      return [...map.entries()]
        .map(([key, v]) => ({
          key,
          total: v.total,
          failed: v.failed,
          failureRatePercent: opexRatePercent(v.failed, v.total),
        }))
        .sort((a, b) => b.failed - a.failed || b.total - a.total || a.key.localeCompare(b.key));
    };

    return {
      windowDays: days,
      sampleSize: rows.length,
      sampled: total > rows.length,
      byProvider: group((r) => r.provider),
      byModel: group((r) => r.modelId),
      byChannel: group((r) => r.channel),
      note:
        total > rows.length
          ? `The breakdown covers the most recent ${rows.length} of ${total} recorded requests in the window. It is a sample, and the note says so rather than presenting it as the whole.`
          : "The breakdown covers every recorded request in the window.",
    };
  },

  /* ── Operator assessments ────────────────────────────────────────────── */

  async listAssessments(organizationId: string): Promise<OpexAssessmentRegister> {
    const policy = await this.getPolicy(organizationId);
    const now = Date.now();
    const assessments: OpexAssessment[] = [];
    const notAssessed: OpexAssessedDimension[] = [];

    for (const dimension of OPEX_ASSESSED_DIMENSIONS) {
      const stored = parse<OpexAssessment>(await redis.get(kAssess(organizationId, dimension)));
      if (!stored) {
        notAssessed.push(dimension);
        continue;
      }
      const stale = opexAssessmentStale(stored.assessedAt, policy.assessmentValidityDays, now);
      assessments.push({
        ...stored,
        dimension,
        stale,
        expiresAt: opexAssessmentExpiry(stored.assessedAt, policy.assessmentValidityDays),
      });
    }

    return {
      assessments,
      assessed: assessments.length,
      stale: assessments.filter((a) => a.stale).length,
      notAssessed,
      validityDays: policy.assessmentValidityDays,
      note: OPEX_ASSESSMENT_NOTE,
    };
  },

  async recordAssessment(
    organizationId: string,
    dimension: OpexAssessedDimension,
    actorId: string,
    input: { score: number; method: string; note?: string },
  ): Promise<OpexAssessment> {
    const policy = await this.getPolicy(organizationId);
    const assessedAt = new Date().toISOString();
    const assessment: OpexAssessment = {
      dimension,
      score: Math.round(input.score * 100) / 100,
      method: input.method,
      assessedBy: actorId,
      assessedAt,
      expiresAt: opexAssessmentExpiry(assessedAt, policy.assessmentValidityDays),
      stale: false,
      note: input.note ?? null,
    };
    await redis.set(kAssess(organizationId, dimension), JSON.stringify(assessment));
    await this.recordEvent(organizationId, {
      kind: "assessment_recorded",
      actorId,
      alertId: null,
      detail: `An assessment for ${dimension} was recorded by an operator.`,
      metadata: { dimension, score: assessment.score },
    });
    return assessment;
  },

  async clearAssessment(
    organizationId: string,
    dimension: OpexAssessedDimension,
    actorId: string,
  ): Promise<{ dimension: OpexAssessedDimension; cleared: boolean; note: string }> {
    const existing = await redis.get(kAssess(organizationId, dimension));
    if (!existing) {
      return {
        dimension,
        cleared: false,
        note: "There was no assessment to clear; the dimension already reports not_assessed.",
      };
    }
    await redis.del(kAssess(organizationId, dimension));
    await this.recordEvent(organizationId, {
      kind: "assessment_cleared",
      actorId,
      alertId: null,
      detail: `The assessment for ${dimension} was cleared; the dimension returns to not_assessed.`,
      metadata: { dimension },
    });
    return {
      dimension,
      cleared: true,
      note: "The dimension now reports null with basis not_assessed, which is what it was before anybody assessed it.",
    };
  },

  /* ── Trust report ────────────────────────────────────────────────────── */

  /**
   * Every dimension this module can speak to, with the basis it was obtained
   * on. There is deliberately no composite score.
   */
  async trustReport(organizationId: string): Promise<OpexTrustReport> {
    const [reliability, register] = await Promise.all([
      this.reliability(organizationId),
      this.listAssessments(organizationId),
    ]);
    const taskClosure = await this.taskClosure(organizationId, reliability.windowDays);

    const measures: OpexMeasure[] = [];

    measures.push({
      key: "reliability",
      label: "AI request success rate",
      value: reliability.successRatePercent,
      unit: "percent",
      basis: reliability.total > 0 ? "observed" : "not_assessed",
      direction: "higher_is_better",
      sampleSize: reliability.total,
      asOf: reliability.lastRequestAt,
      stale: false,
      detail:
        reliability.total > 0
          ? `${reliability.succeeded} of ${reliability.total} recorded requests succeeded in the last ${reliability.windowDays} days. The percentage is floored.`
          : `No AI requests were recorded in the last ${reliability.windowDays} days, so there is nothing to compute a rate from.`,
    });

    measures.push({
      key: "data_freshness",
      label: "Age of most recent AI request",
      value: reliability.dataFreshnessHours,
      unit: "hours",
      basis: reliability.lastRequestAt ? "observed" : "not_assessed",
      direction: "lower_is_better",
      sampleSize: reliability.lastRequestAt ? 1 : 0,
      asOf: reliability.lastRequestAt,
      stale: false,
      detail: reliability.lastRequestAt
        ? `The most recent recorded request was at ${reliability.lastRequestAt}.`
        : "No AI request has ever been recorded for this organization.",
    });

    measures.push({
      key: "latency_p95",
      label: "AI request latency (p95)",
      value: reliability.latency.p95Ms,
      unit: "milliseconds",
      basis: reliability.latency.sampleSize > 0 ? "observed" : "not_assessed",
      direction: "lower_is_better",
      sampleSize: reliability.latency.sampleSize,
      asOf: reliability.lastRequestAt,
      stale: false,
      detail: reliability.latency.sampled
        ? `Computed over the most recent ${reliability.latency.sampleSize} recorded requests, which is a sample of the window.`
        : `Computed over all ${reliability.latency.sampleSize} recorded requests in the window.`,
    });

    measures.push({
      key: "task_closure",
      label: "Task closure rate",
      value: taskClosure.ratePercent,
      unit: "percent",
      basis: taskClosure.considered > 0 ? "observed" : "not_assessed",
      direction: "higher_is_better",
      sampleSize: taskClosure.considered,
      asOf: taskClosure.considered > 0 ? new Date().toISOString() : null,
      stale: false,
      detail:
        "Share of this organization's tasks that reached DONE inside the window. Session 73 published this figure as a 'human approval rate'; no approval workflow feeds it, and its numerator and denominator used different windows. Both now use the same window, and it is labelled as what it measures.",
    });

    const assessedByDimension = new Map<OpexAssessedDimension, OpexAssessment>(
      register.assessments.map((a) => [a.dimension, a] as const),
    );
    for (const dimension of OPEX_ASSESSED_DIMENSIONS) {
      const assessment = assessedByDimension.get(dimension);
      const direction = opexDimensionDirection(dimension);
      if (!assessment) {
        measures.push(
          notAssessedMeasure(
            dimension,
            dimension.replace(/_/g, " "),
            direction,
            direction === "lower_is_better"
              ? "Nobody has assessed this risk. It reports null rather than 0, because 0 on a risk scale is the best possible result and would be read as one."
              : "Nobody has assessed this dimension. It reports null rather than 0, because 0 on a 0-100 scale is a score.",
          ),
        );
        continue;
      }
      measures.push({
        key: dimension,
        label: dimension.replace(/_/g, " "),
        value: assessment.score,
        unit: "percent",
        basis: "operator_assessed",
        direction,
        sampleSize: 1,
        asOf: assessment.assessedAt,
        stale: assessment.stale,
        detail: assessment.stale
          ? `Assessed by ${assessment.assessedBy} on ${assessment.assessedAt} using: ${assessment.method}. This assessment has passed its validity window and is reported stale.`
          : `Assessed by ${assessment.assessedBy} on ${assessment.assessedAt} using: ${assessment.method}.`,
      });
    }

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      measures,
      observed: measures.filter((m) => m.basis === "observed").length,
      assessed: measures.filter((m) => m.basis === "operator_assessed").length,
      notAssessed: measures.filter((m) => m.basis === "not_assessed").length,
      compositeScore: null,
      compositeNote: OPEX_COMPOSITE_NOTE,
      note: OPEX_MEASURE_NOTE,
    };
  },

  /**
   * Task closure over one window.
   *
   * Session 73 compared tasks completed in the last 30 days against every TODO
   * and IN_PROGRESS task ever created, and published the ratio as a "human
   * approval rate". Both sides now use the same window.
   */
  async taskClosure(
    organizationId: string,
    windowDays: number,
  ): Promise<{ done: number; openInWindow: number; considered: number; ratePercent: number | null }> {
    const since = new Date(Date.now() - windowDays * 86_400_000);
    const [done, openInWindow] = await Promise.all([
      prisma.task
        .count({ where: { organizationId, status: "DONE", updatedAt: { gte: since } } })
        .catch(() => 0),
      prisma.task
        .count({
          where: {
            organizationId,
            status: { in: ["TODO", "IN_PROGRESS"] },
            updatedAt: { gte: since },
          },
        })
        .catch(() => 0),
    ]);
    const considered = done + openInWindow;
    return { done, openInWindow, considered, ratePercent: opexRatePercent(done, considered) };
  },

  /* ── Provenance for the Session 73 rollup ────────────────────────────── */

  provenance(observed: { reliability: boolean; freshness: boolean; register: boolean; maturityMeasured?: boolean }): OpexProvenance {
    const entries = [
      {
        field: "trust.reliability",
        basis: (observed.reliability ? "observed" : "not_assessed") as OpexProvenance["entries"][number]["basis"],
        detail: observed.reliability
          ? "Observed success rate of recorded AI requests, floored."
          : "No AI requests were recorded in the window; the rollup's non-nullable field reports 0, which is not a measurement.",
      },
      {
        field: "trust.trust",
        basis: "observed" as const,
        detail:
          "A copy of trust.reliability. Session 73 published the same signal under three names (trust, reliability, operationalStability); it is one measurement, not three.",
      },
      {
        field: "trust.operationalStability",
        basis: "observed" as const,
        detail: "A copy of trust.reliability. See trust.trust.",
      },
      {
        field: "trust.safety",
        basis: "observed" as const,
        detail:
          "The closure rate over filed findings, not a safety assessment. Use GET /opex/trust for the assessed dimension, which is null until somebody assesses it.",
      },
      {
        field: "trust.dataFreshnessHours",
        basis: (observed.freshness ? "observed" : "not_assessed") as OpexProvenance["entries"][number]["basis"],
        detail: observed.freshness
          ? "Age of the most recent recorded AI request."
          : "No AI request has ever been recorded; the rollup's non-nullable field reports 0, which reads as perfectly fresh and is not a measurement.",
      },
      {
        field: "trust.humanApprovalRate",
        basis: "observed" as const,
        detail:
          "A task closure ratio. No approval workflow feeds it. Session 73 computed its numerator and denominator over different windows; they now match.",
      },
      {
        field: "safety.passRate",
        basis: "observed" as const,
        detail: "The closure rate over filed findings. See trust.safety.",
      },
      {
        field: "safety.mitigations24h",
        basis: (observed.register ? "observed" : "not_assessed") as OpexProvenance["entries"][number]["basis"],
        detail:
          "Findings resolved in the last 24 hours, from the recorded resolution time. Session 73 filtered on the filing time, so this number was previously wrong in both directions. Records adopted from the old register have no resolution time and are excluded.",
      },
      ...OPEX_UNIMPLEMENTED_SECTIONS.map((section) => ({
        field: section,
        basis: "not_assessed" as const,
        detail: `Declared by the Session 73 contract; nothing in this deployment populates it. The zero is structural, not a measurement.`,
      })),
      {
        // The composite maturity score is a weighted average over the signals
        // this deployment measures. It is `observed` once at least one component
        // has real data, and `not_assessed` (a structural 0) when none do.
        field: "continuous.maturityScore",
        basis: (observed.maturityMeasured ? "observed" : "not_assessed") as OpexProvenance["entries"][number]["basis"],
        detail: observed.maturityMeasured
          ? "A weighted average over measured operational signals (reliability, safety pass rate, human approval, governance/regulatory/playbook coverage, explainability and safety benchmarks). Absent signals are dropped from the denominator, not scored as zero."
          : "No component signal has been measured yet, so the composite is a structural 0 rather than an average over nothing.",
      },
    ];
    return {
      entries,
      observedFields: entries.filter((e) => e.basis === "observed").length,
      structuralZeroFields: entries.filter((e) => e.basis === "not_assessed").length,
      note: OPEX_PROVENANCE_NOTE,
    };
  },

  /* ── Assurance ───────────────────────────────────────────────────────── */

  async summary(organizationId: string): Promise<OpexAssuranceSummary> {
    const [register, reliability, trust, breaches] = await Promise.all([
      this.registerSummary(organizationId),
      this.reliability(organizationId),
      this.trustReport(organizationId),
      this.breaches(organizationId),
    ]);
    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      register,
      reliability,
      trust,
      breaches,
      note: OPEX_MEASURE_NOTE,
    };
  },

  configuration(): OpexConfigurationReport {
    const checks: OpexConfigurationCheck[] = [
      {
        key: "durable_register",
        label: "Safety register storage",
        state: "pass",
        detail:
          "Findings are stored one key per record with an append-only index. Session 73 stored the whole register as a single JSON string, so two concurrent writers lost one of their writes.",
      },
      {
        key: "transition_timestamps",
        label: "Transition timestamps",
        state: "pass",
        detail:
          "Acknowledgement and resolution times are recorded, so time-to-acknowledge, time-to-resolve and the 24-hour mitigation count are computable rather than approximated from the filing time.",
      },
      {
        key: "legacy_import",
        label: "Session 73 register adoption",
        state: "warn",
        detail:
          "Findings adopted from the Session 73 register carry no transition times, because none were ever stored. They are flagged and excluded from every timing statistic rather than being given an invented timestamp.",
      },
      {
        key: "composite_score",
        label: "Composite trust score",
        state: "pass",
        detail:
          "Not published. A single number averaging observed traffic against unassessed dimensions cannot be attributed to anything.",
      },
      {
        key: "unimplemented_sections",
        label: "Unimplemented rollup sections",
        state: OPEX_UNIMPLEMENTED_SECTIONS.length === 0 ? "pass" : "warn",
        detail: OPEX_UNIMPLEMENTED_SECTIONS.length === 0
          ? "Every Session 73 rollup section is now backed by a real org-scoped store or a measured composite. None report a structural zero for lack of an implementation."
          : `The Session 73 rollup declares ${OPEX_UNIMPLEMENTED_SECTIONS.length} sections that nothing populates: ${OPEX_UNIMPLEMENTED_SECTIONS.join(", ")}. They report structural zeros, and the provenance block says so field by field.`,
      },
      {
        key: "reliability_source",
        label: "Reliability source",
        state: "pass",
        detail:
          "Derived from AiRequest rows this deployment recorded. Nothing is synthesised, and the rate is null when the window holds no requests.",
      },
    ];
    return {
      checks,
      // A warning is a warning. It is never rounded up to a pass, and never
      // rounded down to a failure.
      ready: !checks.some((c) => c.state === "fail"),
      unimplementedSections: [...OPEX_UNIMPLEMENTED_SECTIONS],
      generatedAt: new Date().toISOString(),
      note: OPEX_CONFIG_NOTE,
    };
  },

  async gaps(organizationId: string): Promise<OpexGapReport> {
    const [register, assessments, reliability, breaches] = await Promise.all([
      this.registerSummary(organizationId),
      this.listAssessments(organizationId),
      this.reliability(organizationId),
      this.breaches(organizationId),
    ]);
    return opexGapReport({
      openCritical: register.openCritical,
      oldestOpenAgeHours: register.oldestOpenAgeHours,
      notAssessed: assessments.notAssessed.length,
      staleAssessments: assessments.stale,
      reliabilitySample: reliability.total,
      breaches: breaches.breaches.length,
    });
  },
};

export const OPEX_DEFAULT_VALIDITY_DAYS = OPEX_DEFAULT_ASSESSMENT_VALIDITY_DAYS;
