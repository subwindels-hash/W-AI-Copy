/**
 * Session 64 — Sustainability & ESG measurement ledger (Session 121 completion).
 *
 * Session 64's honesty charter is kept: activities are recorded with an
 * explicit, disclosed emission factor and every reported figure is arithmetic
 * over those records; nothing is invented. Session 121 fixes the defects that
 * remained in the arithmetic and the storage:
 *
 *   1. **Lost writes.** The whole org ledger was one JSON string
 *      (`esg:<org>:records`) and every record was a read-modify-write over it,
 *      so two concurrent POSTs silently lost one. There is now one key per
 *      record (`esg:<org>:rec:<id>`) behind an append-only newest-first index
 *      (`esg:<org>:idx`). A concurrent file cannot erase another.
 *   2. **Wrong comparison windows.** `emissionsYtdChangePct` compared
 *      year-to-date against the FULL previous calendar year, and per-source
 *      `changePct` compared all-time totals against last year — both
 *      systematically wrong. Changes are now same-period (YTD this year vs
 *      YTD last year, cut off at the same instant one year ago).
 *   3. **`0` without a baseline.** `changePct`/`emissionsYtdChangePct` were 0
 *      when the prior period had no records — 0 reads as "no change". They are
 *      now `null`, and a signed change is truncated toward zero (never
 *      exaggerates a magnitude).
 *   4. **Invented ESG scores.** `environmental = max(10, min(100, 92 - ytd *
 *      2.5))` and hard-coded `social: 85` / `governance: 88` were fabricated
 *      ratings presented as "data-derived" while the comment claimed nothing
 *      is invented. An ESG score requires an attested assessment; none exists
 *      here, so every score field is `null` with a `note` saying so.
 *   5. **Mixed energy readings.** `greenAi[].kwh` summed every record's kWh —
 *      including non-compute scope2 electricity — into the compute row. It
 *      now sums compute records only; `gpuHours`/`optimizedPct` are `null`
 *      (nothing meters them) instead of 0.
 *   6. **No correction path.** A mis-entered record could never be removed.
 *      `deleteRecord` (admin-gated in the routes) removes the record and its
 *      index entry; `getRecord` fetches a single record.
 *
 * Structural zeros that cannot be measured by this module (renewables share,
 * water, waste, offsets, net-zero target year, energy cost) keep their 0 for
 * contract compatibility, but the rollup now ships a `provenance` block that
 * names them field by field (the Session 118 pattern).
 *
 * Keys (org id is always the segment straight after the prefix, so the
 * Session 89 sweep's org-segment derivation holds):
 *   esg:<org>:meta       bootstrap marker (unchanged)
 *   esg:<org>:records    Session 64 legacy blob — adopted once, left in place
 *   esg:<org>:imported   marker: the legacy blob has been adopted
 *   esg:<org>:idx        append-only newest-first index of record ids
 *   esg:<org>:rec:<id>   one record
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import type {
  EmissionsSource,
  EnergyMetric,
  EsgProvenance,
  EsgRecordRow,
  EsgScore,
  GreenAiMetric,
  SustainabilityCategory,
  SustainabilityDashboard,
} from "@windels/shared";
import { ESG_PROVENANCE_NOTE, SUSTAINABILITY_MAX_RECORDS } from "@windels/shared/sustainability";

const K = {
  meta: (oid: string) => `esg:${oid}:meta`,
  legacyRecords: (oid: string) => `esg:${oid}:records`,
  imported: (oid: string) => `esg:${oid}:imported`,
  idx: (oid: string) => `esg:${oid}:idx`,
  rec: (oid: string, id: string) => `esg:${oid}:rec:${id}`,
};

/** `compute` is tracked separately from the GHG scopes and rolls up into scope2. */
const toScope = (c: SustainabilityCategory): EmissionsSource["category"] =>
  c === "compute" ? "scope2" : c;

const trunc1 = (n: number) => Math.trunc(n * 10) / 10;
const round = (n: number, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;

function parseRecord(raw: string | null): EsgRecordRow | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as EsgRecordRow;
    return typeof r?.id === "string" && typeof r?.tCO2e === "number" ? r : null;
  } catch {
    return null;
  }
}

/** All record ids, newest first. */
async function listIds(oid: string): Promise<string[]> {
  return redis.lrange(K.idx(oid), 0, -1);
}

/** Fetch the records for a list of ids (order preserved). */
async function fetchRecords(oid: string, ids: string[]): Promise<EsgRecordRow[]> {
  const rows = await Promise.all(ids.map((id) => redis.get(K.rec(oid, id))));
  return rows.map(parseRecord).filter((r): r is EsgRecordRow => r !== null);
}

/** All records, newest first. */
async function allRecords(oid: string): Promise<EsgRecordRow[]> {
  return fetchRecords(oid, await listIds(oid));
}

/** Write one record to its own key and push its id onto the index. */
async function storeRecord(oid: string, record: EsgRecordRow): Promise<void> {
  await redis.set(K.rec(oid, record.id), JSON.stringify(record));
  await redis.lpush(K.idx(oid), record.id);
  await redis.ltrim(K.idx(oid), 0, SUSTAINABILITY_MAX_RECORDS - 1);
}

/**
 * One-shot adoption of the Session 64 blob. Runs once per organization: every
 * entry becomes its own key and index entry, the marker is set, and the legacy
 * string is left in place. A missing or corrupt blob is tolerated rather than
 * fatal (nothing can be recovered from it, and the marker prevents re-reading
 * it on every call).
 */
async function ensureAdopted(oid: string): Promise<void> {
  if (await redis.exists(K.imported(oid))) return;
  const raw = await redis.get(K.legacyRecords(oid));
  if (raw) {
    try {
      const legacy = JSON.parse(raw) as EsgRecordRow[];
      if (Array.isArray(legacy)) {
        // The legacy blob is in insertion order (oldest first); LPUSH each id
        // oldest→newest so the index ends up newest-first like the new writes.
        for (const r of legacy) {
          if (typeof r?.id !== "string" || typeof r?.tCO2e !== "number") continue;
          await storeRecord(oid, r);
        }
      }
    } catch {
      // Corrupt legacy blob: nothing to adopt.
    }
  }
  await redis.set(K.imported(oid), "1");
}

export const SustainabilityService = {
  async ensureBootstrapped(logger: any | undefined, oid: string) {
    if (await redis.exists(K.meta(oid))) return;
    // Synthetic baseline records are gated by WINDELS_DEMO_DATA (default off).
    // When disabled a fresh org starts empty and fills from real records only,
    // so an org with no measurements reports 0, never invented emissions.
    if (!demoDataEnabled()) return skipDemoSeed("sustainability", logger);
    await redis.set(K.meta(oid), "1");

    // Bootstrap some baseline emissions records so the ledger is not completely blank on startup.
    const now = new Date();
    const thisYear = now.getUTCFullYear();
    const lastYear = thisYear - 1;

    const seedRecords: Omit<EsgRecordRow, "id" | "tCO2e" | "recordedAt">[] = [
      { category: "scope1", activity: "Natural Gas (heating)", quantity: 2400, unit: "m3", emissionFactorKg: 2.03, occurredAt: `${thisYear}-02-15T12:00:00Z`, source: "facility-heating" },
      { category: "scope1", activity: "Natural Gas (heating)", quantity: 2800, unit: "m3", emissionFactorKg: 2.03, occurredAt: `${lastYear}-02-15T12:00:00Z`, source: "facility-heating" },
      { category: "scope2", activity: "Purchased Electricity", quantity: 18000, unit: "kWh", emissionFactorKg: 0.38, occurredAt: `${thisYear}-05-20T14:00:00Z`, source: "grid-power", kwh: 18000 },
      { category: "scope2", activity: "Purchased Electricity", quantity: 20000, unit: "kWh", emissionFactorKg: 0.38, occurredAt: `${lastYear}-05-20T14:00:00Z`, source: "grid-power", kwh: 20000 },
      { category: "scope3", activity: "Business Travel (flight)", quantity: 12, unit: "passengers", emissionFactorKg: 150.0, occurredAt: `${thisYear}-06-10T08:00:00Z`, source: "travel-vendor" },
      { category: "scope3", activity: "Business Travel (flight)", quantity: 15, unit: "passengers", emissionFactorKg: 150.0, occurredAt: `${lastYear}-06-10T08:00:00Z`, source: "travel-vendor" },
      { category: "compute", activity: "AI Model Fine-Tuning", quantity: 450, unit: "hours", emissionFactorKg: 0.24, occurredAt: `${thisYear}-07-04T10:00:00Z`, source: "mlops-platform", kwh: 450 },
    ];

    for (const r of seedRecords) {
      await storeRecord(oid, {
        ...r,
        id: `esg-${randomUUID().slice(0, 8)}`,
        tCO2e: round(r.quantity * r.emissionFactorKg / 1000),
        recordedAt: now.toISOString(),
      });
    }
    logger?.info?.("[sustainability] measurement ledger initialized with seeded baseline");
  },

  async record(oid: string, input: Omit<EsgRecordRow, "id" | "tCO2e" | "recordedAt">) {
    // Session 168: this called ensureBootstrapped() unconditionally. Writing a
    // real measurement must never inject seven synthetic baseline records
    // first — the user's first honest reading would arrive pre-contaminated.
    // bootstrap.ts owns seeding.
    await ensureAdopted(oid);
    const record: EsgRecordRow = {
      ...input,
      id: `esg-${randomUUID()}`,
      // tCO2e = quantity x factor(kg) / 1000. The factor is always disclosed.
      tCO2e: round(input.quantity * input.emissionFactorKg / 1000),
      recordedAt: new Date().toISOString(),
    };
    await storeRecord(oid, record);
    return record;
  },

  async listRecords(oid: string, limit = 200): Promise<EsgRecordRow[]> {
    await ensureAdopted(oid);
    const ids = await listIds(oid);
    return fetchRecords(oid, ids.slice(0, limit));
  },

  /** Session 121 — single record fetch (org-scoped). */
  async getRecord(oid: string, id: string): Promise<EsgRecordRow | null> {
    await ensureAdopted(oid);
    return parseRecord(await redis.get(K.rec(oid, id)));
  },

  /** Session 121 — correction path: remove a mis-entered record. */
  async deleteRecord(oid: string, id: string): Promise<{ id: string; deleted: true } | null> {
    await ensureAdopted(oid);
    const exists = await redis.exists(K.rec(oid, id));
    if (!exists) return null;
    await redis.del(K.rec(oid, id));
    await redis.lrem(K.idx(oid), 0, id);
    return { id, deleted: true };
  },

  async dashboard(oid: string, now: Date = new Date()): Promise<SustainabilityDashboard> {
    // Session 168: a read does not seed. (See record() above.)
    await ensureAdopted(oid);
    const records = await allRecords(oid);

    const thisYear = now.getUTCFullYear();
    // Same-period windows: YTD this year vs the same instant one year ago.
    const yearStart = (y: number) => Date.UTC(y, 0, 1);
    const priorCutoff = new Date(now);
    priorCutoff.setUTCFullYear(thisYear - 1);
    const nowMs = now.getTime();
    const inWindow = (r: EsgRecordRow, y: number, cutoff: number) => {
      const at = Date.parse(r.occurredAt);
      return Number.isFinite(at) && at >= yearStart(y) && at <= cutoff;
    };
    const thisCutoff = nowMs;
    const priorYtdCutoff = priorCutoff.getTime();

    const total = round(records.reduce((n, r) => n + r.tCO2e, 0));
    const ytd = records.filter((r) => inWindow(r, thisYear, thisCutoff)).reduce((n, r) => n + r.tCO2e, 0);
    const priorYtd = records.filter((r) => inWindow(r, thisYear - 1, priorYtdCutoff)).reduce((n, r) => n + r.tCO2e, 0);
    // Same-period YTD change; null without a prior-period baseline. Truncated
    // toward zero so a change is never exaggerated (unlike round).
    const emissionsYtdChangePct =
      priorYtd > 0 ? trunc1(((ytd - priorYtd) / priorYtd) * 100) : null;

    // Group by scope + activity so the same activity does not appear N times.
    // tCO2e is the all-time total (so by-source rows sum to the rollup total);
    // the change is the same-period comparison: YTD this year vs YTD last
    // year, never all-time-vs-prior-year (which is what Session 64 computed).
    const grouped = new Map<string, { category: EmissionsSource["category"]; source: string; tCO2e: number; ytd: number; priorYtd: number }>();
    for (const r of records) {
      const key = `${toScope(r.category)}::${r.activity}`;
      const g = grouped.get(key) ?? { category: toScope(r.category), source: r.activity, tCO2e: 0, ytd: 0, priorYtd: 0 };
      g.tCO2e += r.tCO2e;
      if (inWindow(r, thisYear, thisCutoff)) g.ytd += r.tCO2e;
      if (inWindow(r, thisYear - 1, priorYtdCutoff)) g.priorYtd += r.tCO2e;
      grouped.set(key, g);
    }
    const emissionsBySource: EmissionsSource[] = [...grouped.entries()]
      .map(([id, g]) => ({
        id,
        category: g.category,
        source: g.source,
        tCO2e: round(g.tCO2e, 3),
        // Same-period change; null without a baseline.
        changePct: g.priorYtd > 0 ? trunc1(((g.ytd - g.priorYtd) / g.priorYtd) * 100) : null,
      }))
      .sort((a, b) => b.tCO2e - a.tCO2e);

    // 12-month energy series from records that reported a kWh reading.
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const kwhByMonth = new Map<string, number>(months.map((m) => [m, 0]));
    for (const r of records) {
      if (!r.kwh) continue;
      const m = r.occurredAt.slice(0, 7);
      if (kwhByMonth.has(m)) kwhByMonth.set(m, kwhByMonth.get(m)! + r.kwh);
    }
    const energySeries: EnergyMetric[] = months.map((period) => ({
      period,
      kwh: Math.round(kwhByMonth.get(period) ?? 0),
      // Session 168: renewable share and cost require a utility feed we do not
      // have. They were 0 — a measured claim of "0% renewable, $0 spent" on
      // every one of the twelve months. Unmeasured is null.
      renewablePct: null,
      costUsd: null,
    }));

    const computeRecords = records.filter((r) => r.category === "compute");
    // The truthiness check uses the UNROUNDED sum: Session 64 rounded to 3
    // decimals first, so a compute record below 0.0005 tCO2e (under 0.5 kg)
    // rounded to 0.000 and vanished from greenAi entirely.
    const computeTCO2eRaw = computeRecords.reduce((n, r) => n + r.tCO2e, 0);
    const computeTCO2e = round(computeTCO2eRaw, 3);
    // Session 121 fix: the compute row's kWh sums compute records only — the
    // Session 64 code summed every record's reading (including non-compute
    // electricity) into the "recorded compute" row.
    const computeKwh = Math.round(computeRecords.reduce((n, r) => n + (r.kwh ?? 0), 0));

    // ESG scores require an attested assessment; none exists in this module.
    // Session 64 computed `92 - ytd*2.5` and hard-coded 85/88 — invented
    // ratings — so every score is now null with the reason attached.
    const scores: EsgScore = {
      environmental: null,
      social: null,
      governance: null,
      overall: null,
      trend: priorYtd > 0 ? (ytd < priorYtd ? "up" : ytd > priorYtd ? "down" : "flat") : null,
      note: "No ESG score is reported: a rating requires an attested assessment, and nothing " +
        "in this platform attests one. Emissions arithmetic is reported separately.",
    };

    const greenAi: GreenAiMetric[] = computeTCO2eRaw > 0
      ? [{
          workload: "recorded compute",
          gpuHours: null, // nothing meters GPU-hours; null, never 0
          kwh: computeKwh,
          co2eKg: Math.round(computeTCO2eRaw * 1000),
          optimizedPct: null, // no optimisation reporting; null, never 0
        }]
      : [];

    // Session 121 — provenance: name the measured numbers and the structural
    // zeros field by field (the Session 118 pattern).
    const provenance: EsgProvenance = {
      entries: [
        { field: "emissionsTotalTCO2e", basis: "measured", detail: "sum of tCO2e over all recorded activity" },
        { field: "emissionsYtdChangePct", basis: "measured", detail: "same-period YTD vs prior-year YTD; null without a baseline" },
        { field: "emissionsBySource", basis: "measured", detail: "all-time tCO2e per activity; changePct is same-period YTD" },
        { field: "energySeries.kwh", basis: "measured", detail: "sum of recorded kWh readings per month" },
        { field: "greenAi", basis: "measured", detail: "derived from compute-category records only" },
        { field: "scores", basis: "not_assessed", detail: "no attested ESG assessment exists; all score fields are null" },
        { field: "energyRenewablePct", basis: "structural_zero", detail: "no utility/renewables feed is connected; reported as null, not 0" },
        { field: "energySeries.renewablePct / costUsd", basis: "structural_zero", detail: "no utility feed is connected; reported as null, not 0" },
        { field: "waterMl", basis: "structural_zero", detail: "no water metering is recorded; reported as null, not 0" },
        { field: "wasteRecycledPct", basis: "structural_zero", detail: "no waste tracking is recorded; reported as null, not 0" },
        { field: "offsetsPurchasedT", basis: "structural_zero", detail: "no offset purchases are recorded; reported as null, not 0" },
        { field: "netZeroTargetYear", basis: "structural_zero", detail: "no net-zero commitment is declared; reported as null, not year 0" },
        { field: "greenAi.gpuHours / optimizedPct", basis: "structural_zero", detail: "no GPU-hour metering or optimisation reporting is recorded" },
        { field: "resources / suppliers / reportingFrameworks", basis: "structural_zero", detail: "no attested data exists for these sections" },
      ],
      note: ESG_PROVENANCE_NOTE,
    };

    return {
      scores,
      emissionsTotalTCO2e: total,
      emissionsYtdChangePct,
      // Session 168: renewables share, water, waste, offsets and a net-zero
      // target all require attested measurements or a declared commitment;
      // none are recorded. Session 121 set them to 0 "rather than a plausible
      // default" and named them structural_zero in `provenance` — but 0 is
      // itself a claim, and a worse one: a dashboard renders `0` as a measured
      // 0% recycling rate, and `netZeroTargetYear: 0` asserts a target of the
      // year 0. Unmeasured is null. The provenance block below still names why.
      energyRenewablePct: null,
      waterMl: null,
      wasteRecycledPct: null,
      offsetsPurchasedT: null,
      netZeroTargetYear: null,
      emissionsBySource,
      energySeries,
      resources: [],
      // Supply-chain ESG ratings are attestation we do not have — report none.
      suppliers: [],
      // Only the fields we actually measure are populated; GPU-hours,
      // optimisation and kwh come only from recorded compute records.
      greenAi,
      // Reporting-framework attestations are not filed by this system — report none.
      reportingFrameworks: [],
      provenance,
    } satisfies SustainabilityDashboard;
  },
};
