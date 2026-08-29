/**
 * Session 111 — Global Command Center operations register.
 *
 * Session 70 delivered the command centre as a single Prisma-backed rollup
 * (`CommandService.dashboard`) plus a generic `tenantStore` directive blob.
 * Four of the dashboard's arrays — `regions`, `incidents`, `briefings`,
 * `strategicInitiatives` — were hardcoded empty, and `mttrMinutes` was a
 * hardcoded `0` with a comment saying the timestamps were not recorded.
 *
 * This service records those timestamps. It stores five organization-scoped
 * record types and derives everything else from them:
 *
 *   - **Incidents** — declared, acknowledged and resolved by *named humans*
 *     with a written note. `timeToResolveMinutes` is measured from the stored
 *     `openedAt`/`resolvedAt` pair, so the rollup's MTTR is a measurement.
 *   - **Regions** — the operator's declared footprint. `servicesUp`,
 *     `latencyMs` and `activeUsers` stay `null` until an operator files a
 *     status report; a region nobody has reported on is `unreported`, never
 *     optimistically `healthy`. The platform probes nothing.
 *   - **Briefings** — human-authored, or explicitly `ai_assisted` and counted
 *     separately as advisory. No briefing is generated here.
 *   - **Initiatives** — progress is whatever the owner reported
 *     (`progressKind: "self_reported"`), never inferred from activity.
 *   - **Directives** — the Session 70 store, upgraded in place with the
 *     issuer, the transition author and an optional note.
 *
 * Keys (all org-scoped, audited by the Session 89 namespace sweep):
 *   cmd:meta:i:<org>:center
 *   cmd:incident:i:<org>:<id>    cmd:incident:idx:<org>
 *   cmd:region:i:<org>:<id>      cmd:region:idx:<org>
 *   cmd:briefing:i:<org>:<id>    cmd:briefing:idx:<org>
 *   cmd:initiative:i:<org>:<id>  cmd:initiative:idx:<org>
 *   cmd:dir:i:<org>:<id>         cmd:dir:idx:<org>
 *
 * The directive keys are intentionally the exact shape Session 70's
 * `tenantStore({ prefix: "cmd:dir" })` produced, so historical directives are
 * normalized in place (idempotently) rather than orphaned.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { AppError } from "../utils/result.js";
import {
  CMD_BRIEFING_CATEGORIES,
  CMD_BRIEFING_ORIGINS,
  CMD_BRIEFING_PRIORITIES,
  CMD_DIRECTIVE_SCOPES,
  CMD_DIRECTIVE_SEVERITIES,
  CMD_DIRECTIVE_STATUSES,
  CMD_INCIDENT_SEVERITIES,
  type CmdBriefing,
  type CmdBriefingCategory,
  type CmdBriefingCreateInput,
  type CmdBriefingOrigin,
  type CmdBriefingPriority,
  type CmdBriefingQuery,
  type CmdDirective,
  type CmdDirectiveCreateInput,
  type CmdDirectiveQuery,
  type CmdDirectiveScope,
  type CmdDirectiveSeverity,
  type CmdDirectiveStatus,
  type CmdDirectiveStatusInput,
  type CmdIncident,
  type CmdIncidentAcknowledgeInput,
  type CmdIncidentCreateInput,
  type CmdIncidentNoteInput,
  type CmdIncidentQuery,
  type CmdIncidentResolveInput,
  type CmdIncidentSeverity,
  type CmdIncidentUpdateInput,
  type CmdInitiative,
  type CmdInitiativeCreateInput,
  type CmdInitiativeQuery,
  type CmdInitiativeUpdateInput,
  type CmdOperationsRollup,
  type CmdRegion,
  type CmdRegionCreateInput,
  type CmdRegionHealth,
  type CmdRegionQuery,
  type CmdRegionStatusReportInput,
  type CmdRegionUpdateInput,
  type CmdSeverityBreakdown,
} from "@windels/shared/command";

type Entity = "meta" | "incident" | "region" | "briefing" | "initiative" | "dir";
type Owned<T> = T & { organizationId: string };
type IncidentRecord = Owned<Omit<CmdIncident, "timeToResolveMinutes">>;
/** Stored region fields only — health and incident counts are derived on read. */
type StoredRegion = Omit<CmdRegion, "health" | "healthBasis" | "openIncidents" | "criticalOpenIncidents">;
type RegionRecord = Owned<StoredRegion>;
type BriefingRecord = Owned<CmdBriefing>;
type InitiativeRecord = Owned<CmdInitiative>;
type DirectiveRecord = Owned<CmdDirective>;

const K = {
  item: (entity: Entity, org: string, id: string) => `cmd:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `cmd:${entity}:idx:${org}`,
};

const ROLLUP_NOTE =
  "Every number here is counted from records this organization stored. Mean time to resolve is measured from the paired openedAt/resolvedAt timestamps of incidents a human actually closed, and is null when nothing has been resolved. Regional health comes from the operator's own last status report — the platform probes nothing — and a region without a report is reported as unreported, not healthy. Initiative progress and AI-assisted briefings are labelled as such.";

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

/** CSPRNG identifiers — never a counter, a timestamp or Math.random. */
const incidentId = () => `cmd_inc_${randomUUID()}`;
const regionId = () => `cmd_reg_${randomUUID()}`;
const briefingId = () => `cmd_brf_${randomUUID()}`;
const initiativeId = () => `cmd_ini_${randomUUID()}`;
const directiveId = () => `cmd-${randomUUID()}`;

const strip = <T extends { organizationId: string }>(record: T): Omit<T, "organizationId"> => {
  const { organizationId: _organizationId, ...rest } = record;
  return rest;
};

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;
const asStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;
const asIntOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

async function writeItem<T extends { id: string }>(entity: Entity, org: string, value: T, score: number): Promise<void> {
  await redis.hset(K.item(entity, org, value.id), "_doc", JSON.stringify({ ...value, organizationId: org }));
  await redis.zadd(K.index(entity, org), score, value.id);
}

/** Fail-closed read: a record whose stored organization differs is invisible. */
async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const value = parse<T>(await redis.hget(K.item(entity, org, id), "_doc"));
  return value && value.organizationId === org ? value : null;
}

async function ids(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.index(entity, org), 0, -1);
}

async function removeItem(entity: Entity, org: string, id: string): Promise<void> {
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.index(entity, org), id);
}

const score = (iso: string | undefined): number => Date.parse(iso ?? "") || Date.now();

/** Newest first, with the id as a stable tie-break for equal timestamps. */
const byNewest = <T extends { id: string }>(key: (row: T) => string) =>
  (a: T, b: T) => key(b).localeCompare(key(a)) || b.id.localeCompare(a.id);

/**
 * Measured minutes between two stored timestamps. Returns `null` when either
 * end is missing or unparseable — an unmeasurable duration is never guessed.
 */
function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

const withDuration = (record: IncidentRecord): CmdIncident => ({
  ...strip(record),
  timeToResolveMinutes: minutesBetween(record.openedAt, record.resolvedAt),
});

/**
 * Session 70 stored directives as `tenantStore` envelopes
 * (`{ id, organizationId, createdAt, createdBy, data: { … } }`) with no issuer,
 * transition author or note. Normalize such a record into the Session 111
 * shape. Re-running this on an already-normalized record is a no-op, so the
 * migration is idempotent.
 */
function normalizeDirective(org: string, raw: Record<string, unknown>): { record: DirectiveRecord; upgraded: boolean } | null {
  const legacyData = (raw.data && typeof raw.data === "object" ? raw.data : null) as Record<string, unknown> | null;
  const flat = (legacyData ?? raw) as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = asStringOrNull(flat.title);
  if (!id || !title) return null;
  const record: DirectiveRecord = {
    id,
    organizationId: org,
    scope: oneOf<CmdDirectiveScope>(flat.scope, CMD_DIRECTIVE_SCOPES, "global"),
    targetRef: asStringOrNull(flat.targetRef),
    title,
    body: asString(flat.body, ""),
    severity: oneOf<CmdDirectiveSeverity>(flat.severity, CMD_DIRECTIVE_SEVERITIES, "info"),
    status: oneOf<CmdDirectiveStatus>(flat.status, CMD_DIRECTIVE_STATUSES, "issued"),
    // Session 70 recorded the issuer as the envelope's `createdBy`.
    issuedBy: asStringOrNull(raw.createdBy) ?? asStringOrNull(flat.issuedBy),
    createdAt: asString(raw.createdAt, asString(flat.createdAt, new Date().toISOString())),
    // A legacy record never captured who moved the status or why. Those stay
    // null rather than being attributed to the issuer.
    statusChangedAt: asStringOrNull(flat.statusChangedAt),
    statusChangedBy: asStringOrNull(flat.statusChangedBy),
    statusNote: asStringOrNull(flat.statusNote),
  };
  return { record, upgraded: legacyData !== null };
}

async function readDirective(org: string, id: string): Promise<DirectiveRecord | null> {
  const raw = parse<Record<string, unknown>>(await redis.hget(K.item("dir", org, id), "_doc"));
  if (!raw) return null;
  if (typeof raw.organizationId === "string" && raw.organizationId !== org) return null;
  const normalized = normalizeDirective(org, raw);
  if (!normalized) return null;
  if (normalized.upgraded) await writeItem("dir", org, normalized.record, score(normalized.record.createdAt));
  return normalized.record;
}

async function emitKernel(kind: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "command", kind, payload });
  } catch { /* best effort — a telemetry failure must not fail the write */ }
}

async function ensureCenter(org: string, logger?: Logger): Promise<void> {
  const key = K.item("meta", org, "center");
  if (!(await redis.exists(key))) {
    await writeItem("meta", org, { id: "center", createdAt: new Date().toISOString() }, Date.now());
    logger?.info?.({ msg: "[command] operations register initialized", organizationId: org });
  }
}

const emptyBreakdown = (): CmdSeverityBreakdown => ({ info: 0, warning: 0, critical: 0 });

function tallySeverity(incidents: CmdIncident[]): CmdSeverityBreakdown {
  const out = emptyBreakdown();
  for (const incident of incidents) out[incident.severity] += 1;
  return out;
}

/**
 * Regional health rules, in order. Each branch also returns the sentence that
 * explains it, so the UI never has to invent a justification.
 */
function deriveHealth(region: StoredRegion, openIncidents: number, criticalOpen: number): { health: CmdRegionHealth; healthBasis: string } {
  if (region.servicesUp === null || region.statusReportedAt === null) {
    return { health: "unreported", healthBasis: "No operator status report has been filed for this region." };
  }
  if (region.servicesTotal > 0 && region.servicesUp === 0) {
    return { health: "down", healthBasis: `Operator reported 0 of ${region.servicesTotal} declared services up.` };
  }
  if (region.servicesUp < region.servicesTotal) {
    return { health: "degraded", healthBasis: `Operator reported ${region.servicesUp} of ${region.servicesTotal} declared services up.` };
  }
  if (criticalOpen > 0) {
    return { health: "degraded", healthBasis: `All declared services reported up, but ${criticalOpen} critical incident(s) are unresolved here.` };
  }
  if (openIncidents > 0) {
    return { health: "degraded", healthBasis: `All declared services reported up, but ${openIncidents} incident(s) are unresolved here.` };
  }
  return { health: "healthy", healthBasis: `Operator reported all ${region.servicesTotal} declared services up with no unresolved incidents.` };
}

function projectRegion(region: RegionRecord, incidents: CmdIncident[]): CmdRegion {
  const stored = strip(region);
  const unresolved = incidents.filter((incident) => incident.regionCode === stored.code && incident.status !== "resolved");
  const criticalOpen = unresolved.filter((incident) => incident.severity === "critical").length;
  const { health, healthBasis } = deriveHealth(stored, unresolved.length, criticalOpen);
  return { ...stored, health, healthBasis, openIncidents: unresolved.length, criticalOpenIncidents: criticalOpen };
}

export const CommandOperationsService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels"): Promise<void> {
    await ensureCenter(oid, logger);
  },

  // ── Incidents ────────────────────────────────────────────────────────────

  async declareIncident(oid: string, input: CmdIncidentCreateInput, declaredBy?: string): Promise<CmdIncident> {
    await ensureCenter(oid);
    const regionCode = input.regionCode ?? null;
    if (regionCode && !(await this.findRegionByCode(oid, regionCode))) {
      throw AppError.notFound(`Region not found: ${regionCode}`);
    }
    const record: IncidentRecord = {
      id: incidentId(),
      organizationId: oid,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity as CmdIncidentSeverity,
      service: input.service,
      regionCode,
      // Always `open`: an incident is never born acknowledged or mitigated.
      status: "open",
      owner: null,
      declaredBy: declaredBy ?? null,
      openedAt: new Date().toISOString(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      updates: [],
    };
    await writeItem("incident", oid, record, score(record.openedAt));
    await emitKernel("command.incident_declared", {
      organizationId: oid, incidentId: record.id, severity: record.severity, service: record.service, regionCode,
    });
    return withDuration(record);
  },

  async listIncidents(oid: string, query: Partial<CmdIncidentQuery> = {}): Promise<CmdIncident[]> {
    await ensureCenter(oid);
    const rows: IncidentRecord[] = [];
    for (const id of await ids("incident", oid)) {
      const row = await readOwned<IncidentRecord>("incident", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.status || row.status === query.status)
        && (!query.severity || row.severity === query.severity)
        && (!query.regionCode || row.regionCode === query.regionCode))
      .sort(byNewest<IncidentRecord>((row) => row.openedAt))
      .slice(0, query.limit ?? 200)
      .map(withDuration);
  },

  async getIncident(oid: string, id: string): Promise<CmdIncident | null> {
    const row = await readOwned<IncidentRecord>("incident", oid, id);
    return row ? withDuration(row) : null;
  },

  async updateIncident(oid: string, id: string, patch: CmdIncidentUpdateInput): Promise<CmdIncident | null> {
    const current = await readOwned<IncidentRecord>("incident", oid, id);
    if (!current) return null;
    if (patch.regionCode !== undefined && patch.regionCode !== null
      && !(await this.findRegionByCode(oid, patch.regionCode))) {
      throw AppError.notFound(`Region not found: ${patch.regionCode}`);
    }
    const next: IncidentRecord = {
      ...current,
      ...patch,
      description: patch.description === undefined ? current.description : patch.description ?? null,
      regionCode: patch.regionCode === undefined ? current.regionCode : patch.regionCode ?? null,
      owner: patch.owner === undefined ? current.owner : patch.owner ?? null,
    };
    // The index score stays on openedAt so an edit never reorders the board.
    await writeItem("incident", oid, next, score(next.openedAt));
    return withDuration(next);
  },

  /** Appends a human timeline note and, optionally, moves the incident forward. */
  async addIncidentUpdate(oid: string, id: string, input: CmdIncidentNoteInput, author?: string): Promise<CmdIncident> {
    const current = await readOwned<IncidentRecord>("incident", oid, id);
    if (!current) throw AppError.notFound("Incident not found");
    if (current.status === "resolved") throw AppError.conflict("Incident is already resolved");
    const status = input.status ?? current.status;
    const now = new Date().toISOString();
    const next: IncidentRecord = {
      ...current,
      status,
      acknowledgedAt: current.acknowledgedAt ?? (status === "acknowledged" || status === "mitigating" ? now : null),
      acknowledgedBy: current.acknowledgedBy ?? (status === "acknowledged" || status === "mitigating" ? author ?? null : null),
      owner: current.owner ?? (status === "acknowledged" || status === "mitigating" ? author ?? null : null),
      updates: [...current.updates, { at: now, author: author ?? null, note: input.note, status }],
    };
    await writeItem("incident", oid, next, score(next.openedAt));
    return withDuration(next);
  },

  /** A named human takes ownership. Re-acknowledging keeps the first owner. */
  async acknowledgeIncident(oid: string, id: string, acknowledgedBy: string, input: CmdIncidentAcknowledgeInput = {}): Promise<CmdIncident> {
    const current = await readOwned<IncidentRecord>("incident", oid, id);
    if (!current) throw AppError.notFound("Incident not found");
    if (current.status === "resolved") throw AppError.conflict("Incident is already resolved");
    if (!acknowledgedBy) throw AppError.badRequest("An acknowledging user is required");
    if (current.acknowledgedAt) throw AppError.conflict("Incident has already been acknowledged");
    const now = new Date().toISOString();
    const next: IncidentRecord = {
      ...current,
      status: "acknowledged",
      owner: acknowledgedBy,
      acknowledgedAt: now,
      acknowledgedBy,
      updates: input.note
        ? [...current.updates, { at: now, author: acknowledgedBy, note: input.note, status: "acknowledged" as const }]
        : current.updates,
    };
    await writeItem("incident", oid, next, score(next.openedAt));
    await emitKernel("command.incident_acknowledged", { organizationId: oid, incidentId: id, acknowledgedBy });
    return withDuration(next);
  },

  /**
   * Resolution is the only place `resolvedAt` is written, and it always comes
   * with a named human and a written note. Nothing auto-resolves, so every
   * measured MTTR sample corresponds to a real human sign-off.
   */
  async resolveIncident(oid: string, id: string, resolvedBy: string, input: CmdIncidentResolveInput): Promise<CmdIncident> {
    const current = await readOwned<IncidentRecord>("incident", oid, id);
    if (!current) throw AppError.notFound("Incident not found");
    if (current.status === "resolved") throw AppError.conflict("Incident has already been resolved");
    if (!resolvedBy) throw AppError.badRequest("A resolving user is required");
    const now = new Date().toISOString();
    const next: IncidentRecord = {
      ...current,
      status: "resolved",
      owner: current.owner ?? resolvedBy,
      resolvedAt: now,
      resolvedBy,
      resolutionNote: input.note,
      updates: [...current.updates, { at: now, author: resolvedBy, note: input.note, status: "resolved" as const }],
    };
    await writeItem("incident", oid, next, score(next.openedAt));
    await emitKernel("command.incident_resolved", {
      organizationId: oid, incidentId: id, resolvedBy,
      timeToResolveMinutes: minutesBetween(next.openedAt, next.resolvedAt),
    });
    return withDuration(next);
  },

  async deleteIncident(oid: string, id: string): Promise<boolean> {
    const current = await readOwned<IncidentRecord>("incident", oid, id);
    if (!current) return false;
    await removeItem("incident", oid, id);
    return true;
  },

  // ── Regions ──────────────────────────────────────────────────────────────

  async findRegionByCode(oid: string, code: string): Promise<RegionRecord | null> {
    for (const id of await ids("region", oid)) {
      const row = await readOwned<RegionRecord>("region", oid, id);
      if (row && row.code === code) return row;
    }
    return null;
  },

  async createRegion(oid: string, input: CmdRegionCreateInput, createdBy?: string): Promise<CmdRegion> {
    await ensureCenter(oid);
    if (await this.findRegionByCode(oid, input.code)) {
      throw AppError.conflict(`Region code already registered: ${input.code}`);
    }
    const now = new Date().toISOString();
    const record: RegionRecord = {
      id: regionId(),
      organizationId: oid,
      code: input.code,
      name: input.name,
      servicesTotal: Number(input.servicesTotal ?? 0),
      // Nothing is known until an operator reports it.
      servicesUp: null,
      latencyMs: null,
      activeUsers: null,
      statusReportedAt: null,
      statusReportedBy: null,
      note: input.note ?? null,
      createdBy: createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("region", oid, record, score(record.createdAt));
    return projectRegion(record, []);
  },

  async listRegions(oid: string, query: Partial<CmdRegionQuery> = {}): Promise<CmdRegion[]> {
    await ensureCenter(oid);
    const incidents = await this.listIncidents(oid, { limit: 500 });
    const rows: RegionRecord[] = [];
    for (const id of await ids("region", oid)) {
      const row = await readOwned<RegionRecord>("region", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id))
      .map((row) => projectRegion(row, incidents))
      .filter((row) => !query.health || row.health === query.health)
      .slice(0, query.limit ?? 100);
  },

  async getRegion(oid: string, id: string): Promise<CmdRegion | null> {
    const row = await readOwned<RegionRecord>("region", oid, id);
    if (!row) return null;
    return projectRegion(row, await this.listIncidents(oid, { limit: 500 }));
  },

  async updateRegion(oid: string, id: string, patch: CmdRegionUpdateInput): Promise<CmdRegion | null> {
    const current = await readOwned<RegionRecord>("region", oid, id);
    if (!current) return null;
    const next: RegionRecord = {
      ...current,
      ...patch,
      servicesTotal: patch.servicesTotal === undefined ? current.servicesTotal : Number(patch.servicesTotal),
      note: patch.note === undefined ? current.note : patch.note ?? null,
      updatedAt: new Date().toISOString(),
    };
    await writeItem("region", oid, next, score(next.createdAt));
    return projectRegion(next, await this.listIncidents(oid, { limit: 500 }));
  },

  /**
   * An operator's own measurement of a region. Reporting more services up than
   * the declared footprint is rejected rather than silently clamped, because a
   * clamp would quietly turn a data-entry error into a healthy-looking region.
   */
  async reportRegionStatus(oid: string, id: string, input: CmdRegionStatusReportInput, reportedBy?: string): Promise<CmdRegion> {
    const current = await readOwned<RegionRecord>("region", oid, id);
    if (!current) throw AppError.notFound("Region not found");
    const servicesUp = Number(input.servicesUp);
    if (servicesUp > current.servicesTotal) {
      throw AppError.badRequest(`Reported ${servicesUp} services up but only ${current.servicesTotal} are declared for ${current.code}`);
    }
    const next: RegionRecord = {
      ...current,
      servicesUp,
      latencyMs: input.latencyMs === undefined ? current.latencyMs : asIntOrNull(input.latencyMs),
      activeUsers: input.activeUsers === undefined ? current.activeUsers : asIntOrNull(input.activeUsers),
      note: input.note === undefined ? current.note : input.note ?? null,
      statusReportedAt: new Date().toISOString(),
      statusReportedBy: reportedBy ?? null,
      updatedAt: new Date().toISOString(),
    };
    await writeItem("region", oid, next, score(next.createdAt));
    await emitKernel("command.region_status_reported", {
      organizationId: oid, regionId: id, code: next.code, servicesUp, servicesTotal: next.servicesTotal, reportedBy: reportedBy ?? null,
    });
    return projectRegion(next, await this.listIncidents(oid, { limit: 500 }));
  },

  /**
   * A region with unresolved incidents cannot be deleted: doing so would drop
   * those incidents off the regional board while they are still live.
   */
  async deleteRegion(oid: string, id: string): Promise<boolean> {
    const current = await readOwned<RegionRecord>("region", oid, id);
    if (!current) return false;
    const unresolved = (await this.listIncidents(oid, { limit: 500 }))
      .filter((incident) => incident.regionCode === current.code && incident.status !== "resolved");
    if (unresolved.length > 0) {
      throw AppError.conflict(`Region ${current.code} still has ${unresolved.length} unresolved incident(s)`);
    }
    await removeItem("region", oid, id);
    return true;
  },

  // ── Briefings ────────────────────────────────────────────────────────────

  async createBriefing(oid: string, input: CmdBriefingCreateInput, authoredBy?: string): Promise<CmdBriefing> {
    await ensureCenter(oid);
    const origin = (input.origin ?? "human") as CmdBriefingOrigin;
    const record: BriefingRecord = {
      id: briefingId(),
      organizationId: oid,
      title: input.title,
      summary: input.summary,
      priority: input.priority as CmdBriefingPriority,
      category: input.category as CmdBriefingCategory,
      origin,
      aiAssisted: origin === "ai_assisted",
      authoredBy: authoredBy ?? null,
      source: input.source ?? null,
      createdAt: new Date().toISOString(),
    };
    await writeItem("briefing", oid, record, score(record.createdAt));
    return strip(record);
  },

  async listBriefings(oid: string, query: Partial<CmdBriefingQuery> = {}): Promise<CmdBriefing[]> {
    await ensureCenter(oid);
    const rows: BriefingRecord[] = [];
    for (const id of await ids("briefing", oid)) {
      const row = await readOwned<BriefingRecord>("briefing", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.priority || row.priority === query.priority)
        && (!query.category || row.category === query.category)
        && (!query.origin || row.origin === query.origin))
      .sort(byNewest<BriefingRecord>((row) => row.createdAt))
      .slice(0, query.limit ?? 100)
      .map(strip);
  },

  async getBriefing(oid: string, id: string): Promise<CmdBriefing | null> {
    const row = await readOwned<BriefingRecord>("briefing", oid, id);
    return row ? strip(row) : null;
  },

  async deleteBriefing(oid: string, id: string): Promise<boolean> {
    const current = await readOwned<BriefingRecord>("briefing", oid, id);
    if (!current) return false;
    await removeItem("briefing", oid, id);
    return true;
  },

  // ── Strategic initiatives ────────────────────────────────────────────────

  async createInitiative(oid: string, input: CmdInitiativeCreateInput, createdBy?: string): Promise<CmdInitiative> {
    await ensureCenter(oid);
    const now = new Date().toISOString();
    const record: InitiativeRecord = {
      id: initiativeId(),
      organizationId: oid,
      name: input.name,
      owner: input.owner,
      status: (input.status ?? "planned") as CmdInitiative["status"],
      progressPct: Number(input.progressPct ?? 0),
      // Never computed from tasks, commits or workflow runs.
      progressKind: "self_reported",
      dueAt: input.dueAt ?? null,
      note: input.note ?? null,
      createdBy: createdBy ?? null,
      createdAt: now,
      updatedAt: now,
      lastReportedBy: createdBy ?? null,
      lastReportedAt: now,
    };
    await writeItem("initiative", oid, record, score(record.createdAt));
    return strip(record);
  },

  async listInitiatives(oid: string, query: Partial<CmdInitiativeQuery> = {}): Promise<CmdInitiative[]> {
    await ensureCenter(oid);
    const rows: InitiativeRecord[] = [];
    for (const id of await ids("initiative", oid)) {
      const row = await readOwned<InitiativeRecord>("initiative", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.status || row.status === query.status) && (!query.owner || row.owner === query.owner))
      .sort(byNewest<InitiativeRecord>((row) => row.createdAt))
      .slice(0, query.limit ?? 100)
      .map(strip);
  },

  async getInitiative(oid: string, id: string): Promise<CmdInitiative | null> {
    const row = await readOwned<InitiativeRecord>("initiative", oid, id);
    return row ? strip(row) : null;
  },

  async updateInitiative(oid: string, id: string, patch: CmdInitiativeUpdateInput, reportedBy?: string): Promise<CmdInitiative | null> {
    const current = await readOwned<InitiativeRecord>("initiative", oid, id);
    if (!current) return null;
    const now = new Date().toISOString();
    const next: InitiativeRecord = {
      ...current,
      ...patch,
      progressPct: patch.progressPct === undefined ? current.progressPct : Number(patch.progressPct),
      progressKind: "self_reported",
      dueAt: patch.dueAt === undefined ? current.dueAt : patch.dueAt ?? null,
      note: patch.note === undefined ? current.note : patch.note ?? null,
      updatedAt: now,
      lastReportedBy: reportedBy ?? current.lastReportedBy,
      lastReportedAt: now,
    };
    await writeItem("initiative", oid, next, score(next.createdAt));
    return strip(next);
  },

  async deleteInitiative(oid: string, id: string): Promise<boolean> {
    const current = await readOwned<InitiativeRecord>("initiative", oid, id);
    if (!current) return false;
    await removeItem("initiative", oid, id);
    return true;
  },

  // ── Directives (Session 70, completed) ───────────────────────────────────

  async issueDirective(oid: string, input: CmdDirectiveCreateInput, issuedBy?: string): Promise<CmdDirective> {
    await ensureCenter(oid);
    const record: DirectiveRecord = {
      id: directiveId(),
      organizationId: oid,
      scope: input.scope as CmdDirectiveScope,
      targetRef: input.targetRef ?? null,
      title: input.title,
      body: input.body,
      severity: (input.severity ?? "info") as CmdDirectiveSeverity,
      status: "issued",
      issuedBy: issuedBy ?? null,
      createdAt: new Date().toISOString(),
      statusChangedAt: null,
      statusChangedBy: null,
      statusNote: null,
    };
    await writeItem("dir", oid, record, score(record.createdAt));
    await emitKernel("command.directive_issued", {
      organizationId: oid, directiveId: record.id, scope: record.scope, severity: record.severity, issuedBy: issuedBy ?? null,
    });
    return strip(record);
  },

  async listDirectives(oid: string, query: Partial<CmdDirectiveQuery> = {}): Promise<CmdDirective[]> {
    await ensureCenter(oid);
    const rows: DirectiveRecord[] = [];
    for (const id of await ids("dir", oid)) {
      const row = await readDirective(oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.status || row.status === query.status) && (!query.scope || row.scope === query.scope))
      .sort(byNewest<DirectiveRecord>((row) => row.createdAt))
      .slice(0, query.limit ?? 200)
      .map(strip);
  },

  async getDirective(oid: string, id: string): Promise<CmdDirective | null> {
    const row = await readDirective(oid, id);
    return row ? strip(row) : null;
  },

  /** Only a named human moves a directive, and the transition is recorded. */
  async setDirectiveStatus(oid: string, id: string, input: CmdDirectiveStatusInput, changedBy?: string): Promise<CmdDirective | null> {
    const current = await readDirective(oid, id);
    if (!current) return null;
    if (current.status === input.status) {
      throw AppError.conflict(`Directive is already ${input.status}`);
    }
    if (current.status === "resolved" || current.status === "cancelled") {
      throw AppError.conflict(`Directive is already ${current.status} and cannot be moved to ${input.status}`);
    }
    const next: DirectiveRecord = {
      ...current,
      organizationId: oid,
      status: input.status,
      statusChangedAt: new Date().toISOString(),
      statusChangedBy: changedBy ?? null,
      statusNote: input.note ?? null,
    };
    await writeItem("dir", oid, next, score(next.createdAt));
    return strip(next);
  },

  // ── Deterministic rollup ─────────────────────────────────────────────────

  /**
   * Pure projection over the stored register. No `Math.random`, no wall-clock
   * arithmetic and no generated timestamp, so two consecutive reads of an
   * unchanged organization are byte-identical.
   */
  async operations(oid: string): Promise<CmdOperationsRollup> {
    const [incidents, briefings, initiatives, directives] = await Promise.all([
      this.listIncidents(oid, { limit: 500 }),
      this.listBriefings(oid, { limit: 200 }),
      this.listInitiatives(oid, { limit: 200 }),
      this.listDirectives(oid, { limit: 500 }),
    ]);
    const regions = await this.listRegions(oid, { limit: 200 });

    const unresolved = incidents.filter((incident) => incident.status !== "resolved");
    const resolved = incidents.filter((incident) => incident.status === "resolved");
    const measured = resolved
      .map((incident) => incident.timeToResolveMinutes)
      .filter((minutes): minutes is number => minutes !== null);
    const reportedRegions = regions.filter((region) => region.servicesUp !== null);
    const openedAtValues = incidents.map((incident) => incident.openedAt).sort();
    const directiveDates = directives.map((directive) => directive.createdAt).sort();
    const progressSum = initiatives.reduce((total, initiative) => total + initiative.progressPct, 0);

    return {
      incidentCount: incidents.length,
      openIncidents: unresolved.length,
      acknowledgedIncidents: incidents.filter((incident) => incident.status === "acknowledged").length,
      mitigatingIncidents: incidents.filter((incident) => incident.status === "mitigating").length,
      resolvedIncidents: resolved.length,
      unacknowledgedIncidents: incidents.filter((incident) => incident.status === "open").length,
      incidentsBySeverity: tallySeverity(incidents),
      unresolvedBySeverity: tallySeverity(unresolved),
      meanTimeToResolveMinutes: measured.length
        ? Math.round(measured.reduce((total, minutes) => total + minutes, 0) / measured.length)
        : null,
      mttrSampleSize: measured.length,
      mttrKind: measured.length ? "measured" : "none",
      regionCount: regions.length,
      regionsReported: reportedRegions.length,
      regionsUnreported: regions.filter((region) => region.health === "unreported").length,
      regionsHealthy: regions.filter((region) => region.health === "healthy").length,
      regionsDegraded: regions.filter((region) => region.health === "degraded").length,
      regionsDown: regions.filter((region) => region.health === "down").length,
      declaredServices: regions.reduce((total, region) => total + region.servicesTotal, 0),
      reportedServicesUp: reportedRegions.length
        ? reportedRegions.reduce((total, region) => total + (region.servicesUp ?? 0), 0)
        : null,
      regions,
      briefingCount: briefings.length,
      humanBriefings: briefings.filter((briefing) => briefing.origin === "human").length,
      aiAssistedBriefings: briefings.filter((briefing) => briefing.origin === "ai_assisted").length,
      criticalBriefings: briefings.filter((briefing) => briefing.priority === "critical").length,
      initiativeCount: initiatives.length,
      activeInitiatives: initiatives.filter((initiative) => initiative.status === "active").length,
      blockedInitiatives: initiatives.filter((initiative) => initiative.status === "blocked").length,
      completedInitiatives: initiatives.filter((initiative) => initiative.status === "done").length,
      avgReportedProgressPct: initiatives.length ? Math.round(progressSum / initiatives.length) : null,
      progressKind: initiatives.length ? "self_reported_average" : "none",
      directiveCount: directives.length,
      issuedDirectives: directives.filter((directive) => directive.status === "issued").length,
      acknowledgedDirectives: directives.filter((directive) => directive.status === "acknowledged").length,
      resolvedDirectives: directives.filter((directive) => directive.status === "resolved").length,
      cancelledDirectives: directives.filter((directive) => directive.status === "cancelled").length,
      lastIncidentOpenedAt: openedAtValues.at(-1) ?? null,
      lastDirectiveIssuedAt: directiveDates.at(-1) ?? null,
      note: ROLLUP_NOTE,
    } satisfies CmdOperationsRollup;
  },
};

/** Exported for the guard tests and the specification's severity table. */
export const CMD_SEVERITIES = CMD_INCIDENT_SEVERITIES;
export const CMD_PRIORITIES = CMD_BRIEFING_PRIORITIES;
export const CMD_CATEGORIES = CMD_BRIEFING_CATEGORIES;
export const CMD_ORIGINS = CMD_BRIEFING_ORIGINS;
