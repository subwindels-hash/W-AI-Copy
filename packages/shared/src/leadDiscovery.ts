// Session 115 — Lead Discovery: pipeline, deduplication, provenance, safe export.
//
// Session 85 shipped the discovery half of this module and it is untouched here:
// `apps/api/src/leadDiscovery/leadDiscovery.service.ts` calls Google Places text
// search with a real key, refuses with 503 when no key is configured, stores only
// what the provider returned, and labels every record `verificationStatus:
// "source_returned"`. That part works.
//
// What never existed was everything that happens *after* a lead is discovered:
//
//   - No workflow. A lead was found and then nothing — no status, no owner, no
//     notes. The module could not answer "which of these have we contacted?".
//   - No deduplication. Running the same search twice stored the same business
//     twice under two ids. The service's own comment referred to dedupe
//     ("breaks dedupe") but no dedupe existed anywhere in the module, so repeat
//     searches inflated the list and CRM exports shipped the same company more
//     than once.
//   - No provenance for the empty columns. `phone` and `website` are declared on
//     the lead and emitted as CSV columns, but Places *text search* does not
//     return either field, so they were always blank. An export therefore read
//     like "these businesses have no phone number", which is a claim about the
//     businesses rather than about the API call that was made.
//   - No collection maintenance. A collection could be created and appended to,
//     never renamed, never deleted, and a lead could not be taken back out.
//   - No record of what was searched. Spend on a paid API with no query log.
//
// HONESTY RULES ENCODED HERE
// --------------------------
//   - `verificationStatus: "source_returned"` is never upgraded by anything in
//     this layer. Moving a lead to `qualified` records an operator's judgement,
//     not a verification of the business (LEAD_STATUS_NOTE).
//   - Contact coverage reports the share of leads carrying a phone or website
//     **and names the reason it is zero**: the endpoint that produced them does
//     not return those fields (LEAD_CONTACT_COVERAGE_NOTE). Absence of data is
//     reported as absence of data, not as a property of the business.
//   - Duplicate resolution never deletes. The earliest record is named the
//     keeper and the others are marked, so a wrong grouping is reversible
//     (LEAD_DEDUPE_NOTE).
//   - The search history describes searches recorded since the ledger existed.
//     Earlier ones were never written and are not estimated (LEAD_HISTORY_NOTE).
//   - CSV cells that begin with a formula character are prefixed so a
//     spreadsheet renders them as text (LEAD_CSV_INJECTION_NOTE).

import { z } from "zod";

/* ── Limits ────────────────────────────────────────────────────────────── */

/** Matches the Session 85 `ltrim(..., 0, 9999)` on the per-org lead list. */
export const LEAD_RETENTION_LIMIT = 10_000;
/** Session 85 read a fixed window of 200; the pipeline list can page past it. */
export const LEAD_MAX_PAGE = 500;
export const LEAD_HISTORY_LIMIT = 250;
export const LEAD_MAX_NOTES_PER_LEAD = 200;
export const LEAD_NOTE_MAX_CHARS = 2000;
export const LEAD_MAX_EXPORT = 500;
/** How many duplicate groups a single report will enumerate. */
export const LEAD_MAX_DUPLICATE_GROUPS = 200;

/* ── Notes that ship with the payloads ─────────────────────────────────── */

export const LEAD_STATUS_NOTE =
  "A pipeline status records what an operator decided, not what was verified. Marking a lead qualified does not confirm that the business trades, is solvent, or wants to be contacted — the underlying record is still whatever the provider returned.";

export const LEAD_CONTACT_COVERAGE_NOTE =
  "Google Places text search does not return phone numbers or websites; those fields require a separate Place Details call this deployment does not make. A coverage of zero therefore describes the request that was made, not the businesses. Do not read an empty phone column as 'this business has no phone'.";

export const LEAD_DEDUPE_NOTE =
  "Duplicates are grouped by the provider's own place identifier, so they are the same listing returned by more than one search — not a guess that two similarly named businesses are the same company. Resolving a group marks the later records and keeps the earliest; nothing is deleted, and a lead that was marked can be returned to the pipeline.";

export const LEAD_HISTORY_NOTE =
  "Searches recorded since this ledger was introduced. Searches run before it existed were never written and are not reconstructed. The ledger keeps the most recent entries per organization; older ones are trimmed.";

export const LEAD_EXPORT_NOTE =
  "An export is a snapshot of stored provider output at the moment it was taken. It carries no verification, no consent to contact, and no guarantee the listing is current. Columns the provider never populated are exported empty and named in the preview.";

export const LEAD_CSV_INJECTION_NOTE =
  "Cells beginning with =, +, - or @ are prefixed with an apostrophe so spreadsheets render them as text. Business names from a public directory are attacker-controlled input, and a leading = is executed as a formula on open.";

export const LEAD_PROVIDER_NOTE =
  "Every lead in this module came from Google Places text search. No other source is queried, nothing is inferred from the name or address, and no contact detail is enriched from a third party.";

/* ── Pipeline status ───────────────────────────────────────────────────── */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "disqualified",
  "duplicate",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Rendered verbatim by the UI so the wording cannot drift between screens. */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Discovered and not yet worked.",
  contacted: "Somebody recorded an outreach attempt. Not a claim that anyone replied.",
  qualified: "An operator judged this worth pursuing. Not a verification of the business.",
  disqualified: "An operator ruled this out. The record is kept so it is not rediscovered as new.",
  duplicate: "The same provider listing as another lead in this organization; the earliest record is the keeper.",
};

/** The default a lead carries before anyone touches it. */
export const LEAD_DEFAULT_STATUS: LeadStatus = "new";

/* ── The Session 85 lead, restated so both sides compile against one type ── */

export interface Lead {
  id: string;
  name: string;
  category?: string;
  address?: string;
  /** Never populated by text search — see LEAD_CONTACT_COVERAGE_NOTE. */
  phone?: string;
  /** Never populated by text search — see LEAD_CONTACT_COVERAGE_NOTE. */
  website?: string;
  source: "google_places";
  /** The provider's own identifier; the only sound basis for deduplication. */
  sourceId: string;
  discoveredAt: string;
  /** The provider listed it. Nobody confirmed it. Never upgraded by this layer. */
  verificationStatus: "source_returned";
  query: string;
}

/* ── Pipeline record ───────────────────────────────────────────────────── */

/**
 * The operator-owned state attached to a discovered lead. Stored separately from
 * the lead itself so that provider output and human judgement never overwrite
 * one another, and so a lead with no pipeline record simply reads as `new`.
 */
export interface LeadPipelineRecord {
  leadId: string;
  status: LeadStatus;
  /** Platform user id, or null when nobody has taken it. */
  ownerId: string | null;
  /** Set only for `duplicate`: the lead this one repeats. */
  duplicateOf: string | null;
  noteCount: number;
  /** Null until somebody changes the status away from the default. */
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  updatedAt: string;
}

/** A lead joined with its pipeline state. */
export interface LeadWithPipeline extends Lead {
  pipeline: LeadPipelineRecord;
  /** True when the provider gave a phone or a website. Currently never true. */
  hasContactChannel: boolean;
}

export interface LeadList {
  leads: LeadWithPipeline[];
  /** Records held for this organization before filtering. */
  total: number;
  returned: number;
  /** True when the window ended before the stored records did. */
  truncated: boolean;
  statusCounts: Record<LeadStatus, number>;
  providerNote: string;
  statusNote: string;
}

/* ── Notes ─────────────────────────────────────────────────────────────── */

export interface LeadNote {
  id: string;
  leadId: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}

export interface LeadNoteList {
  notes: LeadNote[];
  returned: number;
  limit: number;
}

/* ── Deduplication ─────────────────────────────────────────────────────── */

export interface LeadDuplicateGroup {
  /** The provider identifier every member shares. */
  sourceId: string;
  name: string;
  /** Earliest `discoveredAt` — the record a resolution keeps. */
  keeperId: string;
  duplicateIds: string[];
  count: number;
  /** Distinct queries that returned this same listing. */
  queries: string[];
  firstDiscoveredAt: string;
  lastDiscoveredAt: string;
  /** True once every non-keeper is already marked `duplicate`. */
  resolved: boolean;
}

export interface LeadDuplicateReport {
  groups: LeadDuplicateGroup[];
  /** Leads that share a provider id with at least one other record. */
  affectedLeads: number;
  /** How many records would remain if every group were resolved. */
  distinctListings: number;
  scanned: number;
  unresolvedGroups: number;
  groupLimit: number;
  dedupeNote: string;
}

export interface LeadDuplicateResolution {
  groupsResolved: number;
  leadsMarked: number;
  /** Named so the caller can see exactly what was changed. */
  markedLeadIds: string[];
  alreadyResolved: number;
  resolvedAt: string;
  dedupeNote: string;
}

/* ── Field coverage ────────────────────────────────────────────────────── */

export interface LeadFieldCoverage {
  field: "name" | "category" | "address" | "phone" | "website";
  present: number;
  missing: number;
  /** Null when there are no leads at all — not 0, which would read as "none have it". */
  percentPresent: number | null;
  /** Whether the provider endpoint in use can supply this field at all. */
  suppliedByProvider: boolean;
  detail: string;
}

export interface LeadCoverageReport {
  totalLeads: number;
  fields: LeadFieldCoverage[];
  /** Leads with a phone or a website. Zero here is a provider limitation. */
  contactable: number;
  generatedAt: string;
  coverageNote: string;
  providerNote: string;
}

/* ── Search history ────────────────────────────────────────────────────── */

export interface LeadSearchHistoryEntry {
  id: string;
  query: string;
  at: string;
  actorId: string | null;
  /** Records the provider returned, after the module's own 20-result cap. */
  returned: number;
  /** Of those, how many carried a provider id not already stored. */
  newListings: number;
  /** Of those, how many repeated a listing already held. */
  repeatListings: number;
}

export interface LeadSearchHistory {
  entries: LeadSearchHistoryEntry[];
  returned: number;
  stored: number;
  retentionLimit: number;
  oldestAt: string | null;
  historyNote: string;
}

/* ── Collections ───────────────────────────────────────────────────────── */

export interface LeadCollection {
  id: string;
  name: string;
  createdById: string;
  leadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadCollectionDetail extends LeadCollection {
  leadsCount: number;
  /** Ids in `leadIds` whose lead record no longer resolves. */
  missingLeadIds: string[];
  leads: LeadWithPipeline[];
}

/* ── Export ────────────────────────────────────────────────────────────── */

export const LEAD_EXPORT_FIELDS = [
  "id",
  "name",
  "category",
  "address",
  "phone",
  "website",
  "source",
  "sourceId",
  "discoveredAt",
  "verificationStatus",
  "query",
  "status",
  "ownerId",
] as const;
export type LeadExportField = (typeof LEAD_EXPORT_FIELDS)[number];

export interface LeadExportColumnPreview {
  field: LeadExportField;
  populated: number;
  /** True when not one selected row has a value — surfaced before download. */
  alwaysEmpty: boolean;
}

export interface LeadExportPreview {
  requested: number;
  resolved: number;
  /** Requested ids that do not resolve in this organization. */
  missingIds: string[];
  duplicatesInSelection: number;
  columns: LeadExportColumnPreview[];
  /** Rows whose text would be neutralised by the formula guard. */
  cellsNeutralised: number;
  statusCounts: Record<LeadStatus, number>;
  generatedAt: string;
  exportNote: string;
  csvInjectionNote: string;
  coverageNote: string;
}

/* ── Summary ───────────────────────────────────────────────────────────── */

export interface LeadSummary {
  totalLeads: number;
  statusCounts: Record<LeadStatus, number>;
  /** Distinct provider listings — the honest "how many businesses" number. */
  distinctListings: number;
  unresolvedDuplicateGroups: number;
  collections: number;
  /** Leads carrying a phone or website. See LEAD_CONTACT_COVERAGE_NOTE. */
  contactable: number;
  ownedLeads: number;
  unownedLeads: number;
  notesRecorded: number;
  /** Null when no search has been recorded — not an epoch date. */
  lastSearchAt: string | null;
  lastSearchQuery: string | null;
  searchesRecorded: number;
  /** Whether this deployment can search at all right now. */
  searchConfigured: boolean;
  generatedAt: string;
  providerNote: string;
  coverageNote: string;
  historyNote: string;
}

/* ── Validation ────────────────────────────────────────────────────────── */

/** Session 85 mints `lead-<uuid>`; ids from elsewhere are rejected outright. */
export const LeadIdParamSchema = z.object({
  id: z.string().trim().min(5).max(80).regex(/^lead-[A-Za-z0-9-]+$/, "Not a lead id."),
});
export type LeadIdParam = z.infer<typeof LeadIdParamSchema>;

export const LeadCollectionIdParamSchema = z.object({
  id: z.string().trim().min(5).max(80).regex(/^collection-[A-Za-z0-9-]+$/, "Not a collection id."),
});

export const LeadCollectionLeadParamSchema = z.object({
  id: z.string().trim().min(5).max(80).regex(/^collection-[A-Za-z0-9-]+$/, "Not a collection id."),
  leadId: z.string().trim().min(5).max(80).regex(/^lead-[A-Za-z0-9-]+$/, "Not a lead id."),
});

export const LeadStatusUpdateSchema = z.object({
  /**
   * `duplicate` is deliberately not settable by hand: it carries a `duplicateOf`
   * pointer that only the grouping pass can establish, and a hand-set duplicate
   * with no keeper would be unexplainable in the UI.
   */
  status: z.enum(["new", "contacted", "qualified", "disqualified"]),
  note: z.string().trim().min(1).max(LEAD_NOTE_MAX_CHARS).optional(),
});
export type LeadStatusUpdateInput = z.infer<typeof LeadStatusUpdateSchema>;

export const LeadOwnerUpdateSchema = z.object({
  /** Null releases the lead back to the unowned pool. */
  ownerId: z.string().trim().min(1).max(120).nullable(),
});
export type LeadOwnerUpdateInput = z.infer<typeof LeadOwnerUpdateSchema>;

export const LeadNoteCreateSchema = z.object({
  body: z.string().trim().min(1).max(LEAD_NOTE_MAX_CHARS),
});
export type LeadNoteCreateInput = z.infer<typeof LeadNoteCreateSchema>;

export const LeadQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  ownerId: z.string().trim().min(1).max(120).optional(),
  /** "unowned" is a filter, not an owner id, so it gets its own flag. */
  unowned: z.coerce.boolean().optional(),
  /** Case-insensitive substring across name, address, category and query. */
  q: z.string().trim().min(1).max(200).optional(),
  collectionId: z.string().trim().min(5).max(80).optional(),
  hasContact: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(LEAD_MAX_PAGE).default(100),
  offset: z.coerce.number().int().min(0).max(LEAD_RETENTION_LIMIT).default(0),
});
export type LeadQuery = z.infer<typeof LeadQuerySchema>;

export const LeadHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LEAD_HISTORY_LIMIT).default(50),
});

export const LeadCollectionRenameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const LeadExportPreviewSchema = z.object({
  leadIds: z.array(z.string().trim().min(5).max(80)).min(1).max(LEAD_MAX_EXPORT),
});
export type LeadExportPreviewInput = z.infer<typeof LeadExportPreviewSchema>;

/* ── Helpers shared by both sides ──────────────────────────────────────── */

/**
 * Escape one CSV cell and neutralise spreadsheet formula injection.
 *
 * Lead names arrive from a public directory, so a listing called
 * `=HYPERLINK("http://x","click")` is attacker-controlled content that Excel and
 * Sheets execute on open. Prefixing with an apostrophe forces the text
 * interpretation; the value itself is not altered, and the apostrophe is
 * visible in the cell rather than silently changing what was exported.
 */
export function leadCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** True when a cell would be rewritten by the formula guard. */
export function leadCellNeedsGuard(value: unknown): boolean {
  const raw = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(raw);
}

/** Whether the provider actually gave a way to reach this business. */
export function leadHasContactChannel(lead: Pick<Lead, "phone" | "website">): boolean {
  return Boolean((lead.phone && lead.phone.trim()) || (lead.website && lead.website.trim()));
}

/** An empty status tally, so a UI never has to guess a missing key is zero. */
export function emptyLeadStatusCounts(): Record<LeadStatus, number> {
  return { new: 0, contacted: 0, qualified: 0, disqualified: 0, duplicate: 0 };
}
