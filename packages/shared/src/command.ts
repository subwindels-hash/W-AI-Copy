/**
 * Session 70 / 111 — Enterprise Global Command Center.
 *
 * Session 70 defined the read-only dashboard shape below. Session 111 adds the
 * `Cmd*` operations register that finally fills it: incidents, regions,
 * briefings, initiatives and directives that real people record, plus a
 * deterministic rollup over them. See the Session 111 block further down.
 */
import { z } from "zod";

export interface CommandIncident {
  id: string;
  severity: "info"|"warning"|"critical";
  title: string;
  region: string;
  service: string;
  /** `acknowledged` was added in Session 111 (a named human took ownership). */
  status: "open"|"acknowledged"|"mitigating"|"resolved";
  owner?: string;
  openedAt: string;
  resolvedAt?: string;
}

export interface KpiCard { label: string; value: number | string; delta?: number; unit?: string; tone: "azure"|"emerald"|"amber"|"crimson"|"violet"|"fuchsia"|"teal"; }

export interface RegionalStatus {
  region: string;
  /**
   * `unreported` was added in Session 111: a region no operator has filed a
   * status report for is unknown, and is never rendered as healthy.
   */
  health: "healthy"|"degraded"|"down"|"unreported";
  /** `null` until an operator reports the region (Session 111). */
  servicesUp: number | null;
  servicesTotal: number;
  latencyMs: number | null;
  activeUsers: number | null;
}

export interface ExecutiveBriefing {
  id: string;
  title: string;
  summary: string;
  priority: "low"|"med"|"high"|"critical";
  category: "market"|"ops"|"risk"|"security"|"financial"|"personnel";
  generatedAt: string;
}

export interface GlobalCommandDashboard {
  enterpriseHealth: number;   // 0..100
  globalRevenueMtd: number;
  activeUsersGlobal: number;
  incidentsOpen: number;
  incidentsCritical: number;
  incidentsResolved30d: number;
  mttrMinutes: number;
  workforceProductivity: number; // 0..100
  aiDecisions24h: number;
  humanOverrides24h: number;
  kpis: KpiCard[];
  regions: RegionalStatus[];
  incidents: CommandIncident[];
  briefings: ExecutiveBriefing[];
  /** `due` is `null` when the owner has not committed to a date (Session 111). */
  strategicInitiatives: Array<{ id: string; name: string; progress: number; owner: string; due: string | null }>;
}

// ─── Session 111 — Global Command Center operations register ───────────────
//
// Session 70 shipped the command centre as one Prisma-backed rollup plus an
// opaque directive blob store: `regions`, `incidents`, `briefings` and
// `strategicInitiatives` were always empty arrays and `mttrMinutes` was a
// hardcoded `0`. Session 111 completes the module by giving each of those four
// surfaces a real, organization-scoped record — and nothing more:
//
//   - an incident is declared, acknowledged and resolved by *named humans*,
//     so `meanTimeToResolveMinutes` is measured from stored timestamps rather
//     than asserted;
//   - a region's health is derived from the operator's own last status report
//     plus its open incidents, and a region nobody has reported on is
//     `unreported` — never optimistically `healthy`;
//   - a briefing is authored by a human, or explicitly stamped `ai_assisted`
//     and counted separately as advisory;
//   - initiative progress is whatever the owner reported
//     (`progressKind: "self_reported"`), never inferred from activity.

/** How serious an incident is, as declared by the operator who opened it. */
export const CMD_INCIDENT_SEVERITIES = ["info", "warning", "critical"] as const;
export type CmdIncidentSeverity = (typeof CMD_INCIDENT_SEVERITIES)[number];

/** Incident lifecycle. Every transition is performed by a named human. */
export const CMD_INCIDENT_STATUSES = ["open", "acknowledged", "mitigating", "resolved"] as const;
export type CmdIncidentStatus = (typeof CMD_INCIDENT_STATUSES)[number];

/** Statuses a timeline update may set (resolution has its own endpoint). */
export const CMD_INCIDENT_PROGRESS_STATUSES = ["acknowledged", "mitigating"] as const;
export type CmdIncidentProgressStatus = (typeof CMD_INCIDENT_PROGRESS_STATUSES)[number];

/**
 * Derived regional health. `unreported` is a first-class value: a region no
 * operator has filed a status report for is unknown, not healthy.
 */
export const CMD_REGION_HEALTHS = ["healthy", "degraded", "down", "unreported"] as const;
export type CmdRegionHealth = (typeof CMD_REGION_HEALTHS)[number];

export const CMD_BRIEFING_PRIORITIES = ["low", "med", "high", "critical"] as const;
export type CmdBriefingPriority = (typeof CMD_BRIEFING_PRIORITIES)[number];

export const CMD_BRIEFING_CATEGORIES = ["market", "ops", "risk", "security", "financial", "personnel"] as const;
export type CmdBriefingCategory = (typeof CMD_BRIEFING_CATEGORIES)[number];

/** `ai_assisted` briefings are advisory and are counted separately. */
export const CMD_BRIEFING_ORIGINS = ["human", "ai_assisted"] as const;
export type CmdBriefingOrigin = (typeof CMD_BRIEFING_ORIGINS)[number];

export const CMD_INITIATIVE_STATUSES = ["planned", "active", "blocked", "done", "cancelled"] as const;
export type CmdInitiativeStatus = (typeof CMD_INITIATIVE_STATUSES)[number];

export const CMD_DIRECTIVE_SCOPES = ["global", "region", "workspace", "team"] as const;
export type CmdDirectiveScope = (typeof CMD_DIRECTIVE_SCOPES)[number];

export const CMD_DIRECTIVE_SEVERITIES = ["info", "warn", "critical"] as const;
export type CmdDirectiveSeverity = (typeof CMD_DIRECTIVE_SEVERITIES)[number];

export const CMD_DIRECTIVE_STATUSES = ["issued", "acknowledged", "resolved", "cancelled"] as const;
export type CmdDirectiveStatus = (typeof CMD_DIRECTIVE_STATUSES)[number];

/** Statuses a directive can be moved to after it has been issued. */
export const CMD_DIRECTIVE_TRANSITIONS = ["acknowledged", "resolved", "cancelled"] as const;
export type CmdDirectiveTransition = (typeof CMD_DIRECTIVE_TRANSITIONS)[number];

/** One human-written line on an incident's timeline. */
export interface CmdIncidentUpdate {
  at: string;
  /** Authenticated user id, or `null` for an update recorded without a session. */
  author: string | null;
  note: string;
  /** The incident's status immediately after this update was filed. */
  status: CmdIncidentStatus;
}

export interface CmdIncident {
  id: string;
  title: string;
  description: string | null;
  severity: CmdIncidentSeverity;
  service: string;
  /** Code of a registered region, or `null` for a global incident. */
  regionCode: string | null;
  status: CmdIncidentStatus;
  /** Named human currently accountable, set on acknowledgement. */
  owner: string | null;
  declaredBy: string | null;
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  /**
   * Measured minutes between `openedAt` and `resolvedAt`. `null` while the
   * incident is open — it is never estimated.
   */
  timeToResolveMinutes: number | null;
  updates: CmdIncidentUpdate[];
}

/**
 * A region of the operator's declared footprint. `servicesUp`, `latencyMs` and
 * `activeUsers` are `null` until an operator files a status report; the
 * platform does not probe anything on its own.
 */
export interface CmdRegion {
  id: string;
  code: string;
  name: string;
  servicesTotal: number;
  servicesUp: number | null;
  latencyMs: number | null;
  activeUsers: number | null;
  statusReportedAt: string | null;
  statusReportedBy: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derived on read from the last report plus this region's open incidents. */
  health: CmdRegionHealth;
  /** The rule that produced `health`, spelled out rather than implied. */
  healthBasis: string;
  openIncidents: number;
  criticalOpenIncidents: number;
}

export interface CmdBriefing {
  id: string;
  title: string;
  summary: string;
  priority: CmdBriefingPriority;
  category: CmdBriefingCategory;
  origin: CmdBriefingOrigin;
  /** Mirror of `origin === "ai_assisted"`, kept explicit for UI labelling. */
  aiAssisted: boolean;
  authoredBy: string | null;
  /** Where the statements in the summary came from. */
  source: string | null;
  createdAt: string;
}

export interface CmdInitiative {
  id: string;
  name: string;
  owner: string;
  status: CmdInitiativeStatus;
  /** 0..100 exactly as the owner reported it. */
  progressPct: number;
  /** Always `self_reported` — the platform never computes initiative progress. */
  progressKind: "self_reported";
  dueAt: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastReportedBy: string | null;
  lastReportedAt: string | null;
}

export interface CmdDirective {
  id: string;
  scope: CmdDirectiveScope;
  targetRef: string | null;
  title: string;
  body: string;
  severity: CmdDirectiveSeverity;
  status: CmdDirectiveStatus;
  issuedBy: string | null;
  createdAt: string;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  statusNote: string | null;
}

export interface CmdSeverityBreakdown { info: number; warning: number; critical: number; }

/**
 * Deterministic projection over the stored command-centre records. It contains
 * no wall-clock arithmetic and no generated timestamp, so two consecutive
 * reads of an unchanged organization are byte-identical.
 */
export interface CmdOperationsRollup {
  incidentCount: number;
  openIncidents: number;
  acknowledgedIncidents: number;
  mitigatingIncidents: number;
  resolvedIncidents: number;
  /** Declared but not yet acknowledged by anyone. */
  unacknowledgedIncidents: number;
  incidentsBySeverity: CmdSeverityBreakdown;
  unresolvedBySeverity: CmdSeverityBreakdown;
  /**
   * Mean of the measured `timeToResolveMinutes` values. `null` when nothing
   * has been resolved — never `0`, which would read as "instant recovery".
   */
  meanTimeToResolveMinutes: number | null;
  /** Number of resolved incidents the mean was measured over. */
  mttrSampleSize: number;
  mttrKind: "measured" | "none";
  regionCount: number;
  regionsReported: number;
  regionsUnreported: number;
  regionsHealthy: number;
  regionsDegraded: number;
  regionsDown: number;
  /** Sum of the declared `servicesTotal` across regions. */
  declaredServices: number;
  /** Sum of reported `servicesUp`, `null` when no region has been reported. */
  reportedServicesUp: number | null;
  regions: CmdRegion[];
  briefingCount: number;
  humanBriefings: number;
  aiAssistedBriefings: number;
  criticalBriefings: number;
  initiativeCount: number;
  activeInitiatives: number;
  blockedInitiatives: number;
  completedInitiatives: number;
  /** Mean reported progress, `null` when no initiative exists. */
  avgReportedProgressPct: number | null;
  progressKind: "self_reported_average" | "none";
  directiveCount: number;
  issuedDirectives: number;
  acknowledgedDirectives: number;
  resolvedDirectives: number;
  cancelledDirectives: number;
  lastIncidentOpenedAt: string | null;
  lastDirectiveIssuedAt: string | null;
  /** Human-readable honesty statement rendered next to the numbers. */
  note: string;
}

/** `/api/v1/command/dashboard/rollup` — Session 70 shape plus Session 111 data. */
export interface GlobalCommandRollup extends GlobalCommandDashboard {
  directives: CmdDirective[];
  operations: CmdOperationsRollup;
}

// ─── Zod contracts ─────────────────────────────────────────────────────────

const cmdId = z.string().trim().min(3).max(96);
const cmdNote = z.string().trim().min(2).max(2000);

export const CmdIdSchema = z.object({ id: cmdId });

export const CmdIncidentCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  // Required on purpose: severity is a human judgement, so the platform never
  // picks a default on the declarer's behalf.
  severity: z.enum(CMD_INCIDENT_SEVERITIES),
  service: z.string().trim().min(1).max(120),
  regionCode: z.string().trim().min(1).max(40).nullable().optional(),
});
export type CmdIncidentCreateInput = z.input<typeof CmdIncidentCreateSchema>;

export const CmdIncidentUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  severity: z.enum(CMD_INCIDENT_SEVERITIES).optional(),
  service: z.string().trim().min(1).max(120).optional(),
  regionCode: z.string().trim().min(1).max(40).nullable().optional(),
  owner: z.string().trim().min(1).max(120).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one incident field is required");
export type CmdIncidentUpdateInput = z.infer<typeof CmdIncidentUpdateSchema>;

export const CmdIncidentNoteSchema = z.object({
  note: cmdNote,
  status: z.enum(CMD_INCIDENT_PROGRESS_STATUSES).optional(),
});
export type CmdIncidentNoteInput = z.infer<typeof CmdIncidentNoteSchema>;

export const CmdIncidentAcknowledgeSchema = z.object({
  note: z.string().trim().min(2).max(2000).optional(),
});
export type CmdIncidentAcknowledgeInput = z.infer<typeof CmdIncidentAcknowledgeSchema>;

/** A resolution always carries a written note from the human who signed it. */
export const CmdIncidentResolveSchema = z.object({ note: cmdNote });
export type CmdIncidentResolveInput = z.infer<typeof CmdIncidentResolveSchema>;

export const CmdIncidentQuerySchema = z.object({
  status: z.enum(CMD_INCIDENT_STATUSES).optional(),
  severity: z.enum(CMD_INCIDENT_SEVERITIES).optional(),
  regionCode: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type CmdIncidentQuery = z.infer<typeof CmdIncidentQuerySchema>;

export const CmdRegionCreateSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, "Region code must be lowercase alphanumeric with dashes"),
  name: z.string().trim().min(2).max(120),
  servicesTotal: z.coerce.number().int().min(0).max(100_000).default(0),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type CmdRegionCreateInput = z.input<typeof CmdRegionCreateSchema>;

export const CmdRegionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  servicesTotal: z.coerce.number().int().min(0).max(100_000).optional(),
  note: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one region field is required");
export type CmdRegionUpdateInput = z.infer<typeof CmdRegionUpdateSchema>;

/** An operator's own measurement of a region. Nothing here is probed. */
export const CmdRegionStatusReportSchema = z.object({
  servicesUp: z.coerce.number().int().min(0).max(100_000),
  latencyMs: z.coerce.number().int().min(0).max(600_000).nullable().optional(),
  activeUsers: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type CmdRegionStatusReportInput = z.infer<typeof CmdRegionStatusReportSchema>;

export const CmdRegionQuerySchema = z.object({
  health: z.enum(CMD_REGION_HEALTHS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type CmdRegionQuery = z.infer<typeof CmdRegionQuerySchema>;

export const CmdBriefingCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  summary: z.string().trim().min(2).max(4000),
  priority: z.enum(CMD_BRIEFING_PRIORITIES),
  category: z.enum(CMD_BRIEFING_CATEGORIES),
  origin: z.enum(CMD_BRIEFING_ORIGINS).default("human"),
  source: z.string().trim().max(500).nullable().optional(),
});
export type CmdBriefingCreateInput = z.input<typeof CmdBriefingCreateSchema>;

export const CmdBriefingQuerySchema = z.object({
  priority: z.enum(CMD_BRIEFING_PRIORITIES).optional(),
  category: z.enum(CMD_BRIEFING_CATEGORIES).optional(),
  origin: z.enum(CMD_BRIEFING_ORIGINS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type CmdBriefingQuery = z.infer<typeof CmdBriefingQuerySchema>;

export const CmdInitiativeCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  owner: z.string().trim().min(1).max(120),
  status: z.enum(CMD_INITIATIVE_STATUSES).default("planned"),
  progressPct: z.coerce.number().int().min(0).max(100).default(0),
  dueAt: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type CmdInitiativeCreateInput = z.input<typeof CmdInitiativeCreateSchema>;

export const CmdInitiativeUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  owner: z.string().trim().min(1).max(120).optional(),
  status: z.enum(CMD_INITIATIVE_STATUSES).optional(),
  progressPct: z.coerce.number().int().min(0).max(100).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one initiative field is required");
export type CmdInitiativeUpdateInput = z.infer<typeof CmdInitiativeUpdateSchema>;

export const CmdInitiativeQuerySchema = z.object({
  status: z.enum(CMD_INITIATIVE_STATUSES).optional(),
  owner: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type CmdInitiativeQuery = z.infer<typeof CmdInitiativeQuerySchema>;

/** Unchanged from Session 70 so existing directive clients keep working. */
export const CmdDirectiveCreateSchema = z.object({
  scope: z.enum(CMD_DIRECTIVE_SCOPES),
  targetRef: z.string().trim().max(200).nullable().optional(),
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(4000),
  severity: z.enum(CMD_DIRECTIVE_SEVERITIES).default("info"),
});
export type CmdDirectiveCreateInput = z.input<typeof CmdDirectiveCreateSchema>;

export const CmdDirectiveStatusSchema = z.object({
  status: z.enum(CMD_DIRECTIVE_TRANSITIONS),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type CmdDirectiveStatusInput = z.infer<typeof CmdDirectiveStatusSchema>;

export const CmdDirectiveQuerySchema = z.object({
  status: z.enum(CMD_DIRECTIVE_STATUSES).optional(),
  scope: z.enum(CMD_DIRECTIVE_SCOPES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type CmdDirectiveQuery = z.infer<typeof CmdDirectiveQuerySchema>;
