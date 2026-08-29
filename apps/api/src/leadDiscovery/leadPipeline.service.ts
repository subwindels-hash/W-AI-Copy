/**
 * Session 115 — Lead Discovery pipeline, deduplication, provenance and export.
 *
 * Session 85's `LeadDiscoveryService` is untouched by this file: it still calls
 * Google Places text search with a real key, still refuses with 503 when no key
 * is configured, still stores only provider output, and still labels every
 * record `verificationStatus: "source_returned"`. This service is everything
 * that was missing *after* discovery:
 *
 *   - **A pipeline.** Status, owner and notes per lead, stored separately from
 *     the provider record so human judgement and provider output can never
 *     overwrite one another. A lead with no pipeline record simply reads `new`.
 *   - **Deduplication.** Running the same search twice stored the same business
 *     twice. Groups are formed on the provider's own place identifier, the
 *     earliest record is named keeper, and resolution *marks* the later ones —
 *     nothing is deleted, so a grouping can be undone.
 *   - **Coverage that explains itself.** `phone` and `website` were always
 *     empty because text search does not return them. The coverage report says
 *     that in the payload instead of leaving an operator to conclude the
 *     businesses have no phone.
 *   - **A search ledger.** What was queried, when, by whom, and how much of it
 *     was already held — spend on a paid API used to leave no trace.
 *   - **Collection maintenance.** Rename, delete, and remove a lead: all three
 *     were missing, so a mistyped collection was permanent.
 *   - **An export preview** that names the columns which will be empty and how
 *     many cells the formula guard will neutralise, before anything downloads.
 *
 * WHAT THIS SERVICE REFUSES TO CLAIM
 * ----------------------------------
 *   - A pipeline status is an operator's decision, never a verification. The
 *     underlying `verificationStatus` is never rewritten here.
 *   - Coverage of zero is reported together with the reason it is zero.
 *   - Duplicate grouping uses the provider id only. Two records with similar
 *     names and no shared id are left alone; guessing they are one business is
 *     not something this code is in a position to do.
 *   - The search ledger describes searches recorded since it existed. Earlier
 *     ones were never written and are not reconstructed.
 *   - Every read re-checks the organization stored on the record, so a
 *     guessed or leaked id from another tenant resolves to a 404 rather than
 *     to data.
 *
 * Keys (organization-scoped, audited by the Session 89 namespace sweep):
 *   lead:pipe:<org>:<leadId>        pipeline record
 *   lead:note:<org>:<noteId>        note
 *   lead:noteidx:<org>:<leadId>     note id list
 *   lead:hist:<org>                 search ledger (trimmed)
 *
 * Session 85's own keys (`leads85:<org>:…`) are read but never rewritten by
 * this file, except for the two collection maintenance operations that were
 * always meant to exist.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import {
  LEAD_CONTACT_COVERAGE_NOTE,
  LEAD_CSV_INJECTION_NOTE,
  LEAD_DEDUPE_NOTE,
  LEAD_DEFAULT_STATUS,
  LEAD_EXPORT_FIELDS,
  LEAD_EXPORT_NOTE,
  LEAD_HISTORY_LIMIT,
  LEAD_HISTORY_NOTE,
  LEAD_MAX_DUPLICATE_GROUPS,
  LEAD_MAX_NOTES_PER_LEAD,
  LEAD_PROVIDER_NOTE,
  LEAD_RETENTION_LIMIT,
  LEAD_STATUS_NOTE,
  emptyLeadStatusCounts,
  leadCellNeedsGuard,
  leadCsvCell,
  leadHasContactChannel,
  type Lead,
  type LeadCollection,
  type LeadCollectionDetail,
  type LeadCoverageReport,
  type LeadDuplicateGroup,
  type LeadDuplicateReport,
  type LeadDuplicateResolution,
  type LeadExportColumnPreview,
  type LeadExportPreview,
  type LeadFieldCoverage,
  type LeadList,
  type LeadNote,
  type LeadNoteList,
  type LeadPipelineRecord,
  type LeadQuery,
  type LeadStatus,
  type LeadStatusUpdateInput,
  type LeadSearchHistory,
  type LeadSearchHistoryEntry,
  type LeadSummary,
  type LeadWithPipeline,
} from "@windels/shared/leadDiscovery";

/* ── Storage plumbing ─────────────────────────────────────────────────── */

/**
 * Session 85's key layout, restated so this file reads the same keyspace rather
 * than a copy of it. Duplicating the strings is deliberate: importing them
 * would mean exporting them from a service this session is not allowed to
 * reshape, and a mismatch is caught immediately by the tests, which seed
 * through the real Session 85 service.
 */
const K85 = {
  leads: (org: string) => `leads85:${org}:leads`,
  lead: (org: string, id: string) => `leads85:${org}:lead:${id}`,
  collections: (org: string) => `leads85:${org}:collections`,
  collection: (org: string, id: string) => `leads85:${org}:collection:${id}`,
};

const K = {
  pipe: (org: string, leadId: string) => `lead:pipe:${org}:${leadId}`,
  note: (org: string, noteId: string) => `lead:note:${org}:${noteId}`,
  noteIdx: (org: string, leadId: string) => `lead:noteidx:${org}:${leadId}`,
  history: (org: string) => `lead:hist:${org}`,
};

/** What is actually stored: the public record plus the tenant it belongs to. */
type StoredPipeline = LeadPipelineRecord & { organizationId: string };
type StoredNote = LeadNote & { organizationId: string };

function nowIso(): string {
  return new Date().toISOString();
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A record that will not parse is treated as absent rather than crashing a
    // whole listing. It is not silently repaired either — nothing here writes
    // over a value it could not read.
    return null;
  }
}

/**
 * The pipeline record for a lead that has never been touched. Materialising a
 * default rather than storing one on discovery means Session 85's write path
 * stays exactly as it was, and an untouched lead costs no storage.
 */
function defaultPipeline(leadId: string): LeadPipelineRecord {
  return {
    leadId,
    status: LEAD_DEFAULT_STATUS,
    ownerId: null,
    duplicateOf: null,
    noteCount: 0,
    statusChangedAt: null,
    statusChangedBy: null,
    updatedAt: "",
  };
}

function strip(record: StoredPipeline): LeadPipelineRecord {
  const { organizationId: _org, ...rest } = record;
  return rest;
}

async function readPipeline(org: string, leadId: string): Promise<LeadPipelineRecord> {
  const stored = parse<StoredPipeline>(await redis.get(K.pipe(org, leadId)));
  // Fail closed: a record whose stored organization does not match is treated
  // as absent, so a key crafted with another tenant's id yields the default
  // rather than that tenant's state.
  if (!stored || stored.organizationId !== org) return defaultPipeline(leadId);
  return strip(stored);
}

async function writePipeline(org: string, record: LeadPipelineRecord): Promise<LeadPipelineRecord> {
  const stored: StoredPipeline = { ...record, organizationId: org, updatedAt: nowIso() };
  await redis.set(K.pipe(org, record.leadId), JSON.stringify(stored));
  return strip(stored);
}

/* ── Reading Session 85's leads ───────────────────────────────────────── */

/**
 * Every stored lead for an organization, newest first (Session 85 `lpush`es),
 * together with each lead's position in that index.
 *
 * The read window is the retention limit, which is also the cap Session 85
 * trims the list to, so the scan is complete by construction rather than a
 * sample that would make every count below an understatement.
 *
 * The position matters for deduplication. Two searches run in the same
 * millisecond produce identical `discoveredAt` strings, so the timestamp alone
 * cannot say which record came first; the index is a real insertion order the
 * store already maintains, and a larger position means an older record.
 */
async function scanLeads(org: string): Promise<{ leads: Lead[]; order: Map<string, number> }> {
  const ids = await redis.lrange(K85.leads(org), 0, LEAD_RETENTION_LIMIT - 1);
  const leads: Lead[] = [];
  const order = new Map<string, number>();
  for (const [position, id] of ids.entries()) {
    // The list can legitimately hold the same id twice if a push was retried;
    // the lead itself is keyed, so de-duplicating the *index* here is not a
    // claim about the data, only about the index. The first sighting is the
    // newest, and that is the position kept.
    if (order.has(id)) continue;
    order.set(id, position);
    const lead = parse<Lead>(await redis.get(K85.lead(org, id)));
    if (lead) leads.push(lead);
  }
  return { leads, order };
}

async function readLead(org: string, leadId: string): Promise<Lead> {
  const lead = parse<Lead>(await redis.get(K85.lead(org, leadId)));
  if (!lead) throw AppError.notFound("Lead not found in this organization.");
  return lead;
}

async function join(org: string, lead: Lead): Promise<LeadWithPipeline> {
  return {
    ...lead,
    pipeline: await readPipeline(org, lead.id),
    hasContactChannel: leadHasContactChannel(lead),
  };
}

function tally(records: Array<{ status: LeadStatus }>): Record<LeadStatus, number> {
  const counts = emptyLeadStatusCounts();
  for (const r of records) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

/* ── Duplicate grouping ───────────────────────────────────────────────── */

/**
 * Group leads by the pair of provider and provider identifier.
 *
 * This is the only pipeline grouping rule. Two records with similar names, or
 * a coincidentally identical identifier issued by different providers, are not
 * merged here. Advanced discovery adds its own confident cross-source checks
 * at ingest while preserving every source trace.
 */
function groupBySourceId(leads: Lead[]): Map<string, Lead[]> {
  const groups = new Map<string, Lead[]>();
  for (const lead of leads) {
    if (!lead.sourceId) continue;
    const key = `${lead.source}:${lead.sourceId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(lead);
    else groups.set(key, [lead]);
  }
  return groups;
}

/**
 * Oldest first.
 *
 * `discoveredAt` decides it whenever the two differ. When it does not — two
 * searches inside the same millisecond, which is exactly what a repeated search
 * looks like — the tie is broken by position in the organization's own index,
 * where a larger position is an older record. Falling back to comparing ids
 * would have picked an arbitrary UUID and then called it "the earliest", which
 * is a claim the data does not support.
 */
function sortByDiscovery(leads: Lead[], order: Map<string, number>): Lead[] {
  return [...leads].sort((a, b) => {
    if (a.discoveredAt !== b.discoveredAt) return a.discoveredAt < b.discoveredAt ? -1 : 1;
    return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
  });
}

/* ── Service ──────────────────────────────────────────────────────────── */

export const LeadPipelineService = {
  /* ---- Leads ---------------------------------------------------------- */

  /**
   * Filtered, paged view of the organization's leads joined with pipeline
   * state. `total` counts what matched the filter, `returned` what the window
   * held, and `truncated` says plainly when the two differ.
   */
  async listLeads(org: string, query: LeadQuery): Promise<LeadList> {
    const { leads } = await scanLeads(org);
    const joined: LeadWithPipeline[] = [];
    for (const lead of leads) joined.push(await join(org, lead));

    let collectionIds: Set<string> | null = null;
    if (query.collectionId) {
      const collection = parse<LeadCollection>(await redis.get(K85.collection(org, query.collectionId)));
      if (!collection) throw AppError.notFound("Collection not found in this organization.");
      collectionIds = new Set(collection.leadIds);
    }

    const needle = query.q?.toLowerCase();
    const matched = joined.filter((lead) => {
      if (query.status && lead.pipeline.status !== query.status) return false;
      if (query.ownerId && lead.pipeline.ownerId !== query.ownerId) return false;
      if (query.unowned === true && lead.pipeline.ownerId !== null) return false;
      if (query.hasContact === true && !lead.hasContactChannel) return false;
      if (query.hasContact === false && lead.hasContactChannel) return false;
      if (collectionIds && !collectionIds.has(lead.id)) return false;
      if (needle) {
        const hay = `${lead.name} ${lead.address ?? ""} ${lead.category ?? ""} ${lead.query}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const page = matched.slice(query.offset, query.offset + query.limit);
    return {
      leads: page,
      total: matched.length,
      returned: page.length,
      truncated: query.offset + page.length < matched.length,
      // Counts describe everything that matched, not just this page, so the
      // tallies do not change as somebody scrolls.
      statusCounts: tally(matched.map((l) => l.pipeline)),
      providerNote: LEAD_PROVIDER_NOTE,
      statusNote: LEAD_STATUS_NOTE,
    };
  },

  async getLead(org: string, leadId: string): Promise<LeadWithPipeline> {
    return join(org, await readLead(org, leadId));
  },

  /**
   * Move a lead through the pipeline. `duplicate` is not reachable from here —
   * it carries a keeper pointer only the grouping pass can establish.
   */
  async setStatus(
    org: string,
    leadId: string,
    input: LeadStatusUpdateInput,
    actorId: string | null,
  ): Promise<LeadWithPipeline> {
    const lead = await readLead(org, leadId);
    const current = await readPipeline(org, leadId);
    const next: LeadPipelineRecord = {
      ...current,
      status: input.status,
      // `LeadStatusUpdateSchema` cannot carry `duplicate`, so any status set
      // here takes the lead *out* of a duplicate grouping. Clearing the pointer
      // is therefore unconditional: a record back in the pipeline on its own
      // terms must not keep pointing at a keeper it no longer defers to.
      duplicateOf: null,
      statusChangedAt: nowIso(),
      statusChangedBy: actorId,
    };
    if (input.note) {
      await this.addNote(org, leadId, input.note, actorId);
      next.noteCount = current.noteCount + 1;
    }
    const saved = await writePipeline(org, next);
    return { ...lead, pipeline: saved, hasContactChannel: leadHasContactChannel(lead) };
  },

  /** Assign or, with `null`, release the lead back to the unowned pool. */
  async setOwner(
    org: string,
    leadId: string,
    ownerId: string | null,
    _actorId: string | null,
  ): Promise<LeadWithPipeline> {
    const lead = await readLead(org, leadId);
    const current = await readPipeline(org, leadId);
    const saved = await writePipeline(org, { ...current, ownerId });
    return { ...lead, pipeline: saved, hasContactChannel: leadHasContactChannel(lead) };
  },

  /* ---- Notes ---------------------------------------------------------- */

  async addNote(org: string, leadId: string, body: string, authorId: string | null): Promise<LeadNote> {
    await readLead(org, leadId); // 404 before writing anything
    const existing = await redis.lrange(K.noteIdx(org, leadId), 0, -1);
    if (existing.length >= LEAD_MAX_NOTES_PER_LEAD) {
      throw AppError.conflict(
        `This lead already holds the maximum of ${LEAD_MAX_NOTES_PER_LEAD} notes. Older notes are kept rather than discarded, so nothing is dropped to make room.`,
      );
    }
    const note: StoredNote = {
      id: `leadnote-${randomUUID()}`,
      leadId,
      body,
      authorId,
      createdAt: nowIso(),
      organizationId: org,
    };
    await redis.set(K.note(org, note.id), JSON.stringify(note));
    await redis.lpush(K.noteIdx(org, leadId), note.id);

    const pipeline = await readPipeline(org, leadId);
    await writePipeline(org, { ...pipeline, noteCount: existing.length + 1 });

    const { organizationId: _org, ...pub } = note;
    return pub;
  },

  async listNotes(org: string, leadId: string): Promise<LeadNoteList> {
    await readLead(org, leadId);
    const ids = await redis.lrange(K.noteIdx(org, leadId), 0, LEAD_MAX_NOTES_PER_LEAD - 1);
    const notes: LeadNote[] = [];
    for (const id of ids) {
      const stored = parse<StoredNote>(await redis.get(K.note(org, id)));
      if (!stored || stored.organizationId !== org) continue;
      const { organizationId: _org, ...pub } = stored;
      notes.push(pub);
    }
    return { notes, returned: notes.length, limit: LEAD_MAX_NOTES_PER_LEAD };
  },

  /* ---- Deduplication -------------------------------------------------- */

  /** Read-only duplicate report. Nothing is changed by looking. */
  async duplicates(org: string): Promise<LeadDuplicateReport> {
    const { leads, order } = await scanLeads(org);
    const grouped = groupBySourceId(leads);

    const groups: LeadDuplicateGroup[] = [];
    let affectedLeads = 0;
    let unresolvedGroups = 0;

    for (const [, members] of grouped) {
      if (members.length < 2) continue;
      affectedLeads += members.length;
      const ordered = sortByDiscovery(members, order);
      const keeper = ordered[0]!;
      const rest = ordered.slice(1);

      const statuses: LeadStatus[] = [];
      for (const dup of rest) statuses.push((await readPipeline(org, dup.id)).status);
      const resolved = statuses.every((s) => s === "duplicate");
      if (!resolved) unresolvedGroups++;

      if (groups.length < LEAD_MAX_DUPLICATE_GROUPS) {
        groups.push({
          sourceId: keeper.sourceId,
          name: keeper.name,
          keeperId: keeper.id,
          duplicateIds: rest.map((l) => l.id),
          count: members.length,
          queries: [...new Set(members.map((l) => l.query))],
          firstDiscoveredAt: keeper.discoveredAt,
          lastDiscoveredAt: ordered[ordered.length - 1]!.discoveredAt,
          resolved,
        });
      }
    }

    return {
      groups,
      affectedLeads,
      distinctListings: grouped.size,
      scanned: leads.length,
      unresolvedGroups,
      groupLimit: LEAD_MAX_DUPLICATE_GROUPS,
      dedupeNote: LEAD_DEDUPE_NOTE,
    };
  },

  /**
   * Mark every non-keeper in every duplicate group.
   *
   * Deletion was the obvious implementation and is deliberately not what this
   * does: a lead someone has already worked would vanish along with its notes.
   * Marking is reversible — moving the record back to `new` returns it to the
   * pipeline and clears the pointer.
   */
  async resolveDuplicates(org: string, actorId: string | null): Promise<LeadDuplicateResolution> {
    const { leads, order } = await scanLeads(org);
    const grouped = groupBySourceId(leads);
    const markedLeadIds: string[] = [];
    let groupsResolved = 0;
    let alreadyResolved = 0;

    for (const [, members] of grouped) {
      if (members.length < 2) continue;
      const ordered = sortByDiscovery(members, order);
      const keeper = ordered[0]!;
      let changedInGroup = 0;

      for (const dup of ordered.slice(1)) {
        const pipeline = await readPipeline(org, dup.id);
        if (pipeline.status === "duplicate" && pipeline.duplicateOf === keeper.id) continue;
        await writePipeline(org, {
          ...pipeline,
          status: "duplicate",
          duplicateOf: keeper.id,
          statusChangedAt: nowIso(),
          statusChangedBy: actorId,
        });
        markedLeadIds.push(dup.id);
        changedInGroup++;
      }

      if (changedInGroup > 0) groupsResolved++;
      else alreadyResolved++;
    }

    return {
      groupsResolved,
      leadsMarked: markedLeadIds.length,
      markedLeadIds,
      alreadyResolved,
      resolvedAt: nowIso(),
      dedupeNote: LEAD_DEDUPE_NOTE,
    };
  },

  /* ---- Coverage ------------------------------------------------------- */

  /**
   * How much of each field the provider actually supplied.
   *
   * `suppliedByProvider: false` on phone and website is the point of this
   * report: those columns are empty because the endpoint in use does not return
   * them, not because the businesses lack them.
   */
  async coverage(org: string): Promise<LeadCoverageReport> {
    const { leads } = await scanLeads(org);
    const total = leads.length;

    const count = (predicate: (lead: Lead) => boolean) => leads.filter(predicate).length;
    const pct = (present: number) => (total === 0 ? null : Math.round((present / total) * 1000) / 10);
    const hasAdvancedRecords = leads.some((lead) => lead.source === "apollo" || lead.sourceTrace?.some((trace) => trace.searchMode !== "legacy"));
    const returnedPhone = count((lead) => Boolean(lead.phone?.trim()));
    const returnedWebsite = count((lead) => Boolean(lead.website?.trim()));

    const spec: Array<{
      field: LeadFieldCoverage["field"];
      present: number;
      suppliedByProvider: boolean;
      detail: string;
    }> = [
      {
        field: "name",
        present: count((l) => Boolean(l.name?.trim())),
        suppliedByProvider: true,
        detail: "Returned by Places text search for every result.",
      },
      {
        field: "category",
        present: count((l) => Boolean(l.category?.trim())),
        suppliedByProvider: true,
        detail: "First entry of the provider's `types` array, when it sent one.",
      },
      {
        field: "address",
        present: count((l) => Boolean(l.address?.trim())),
        suppliedByProvider: true,
        detail: "The provider's `formatted_address`, when it sent one.",
      },
      {
        field: "phone",
        present: returnedPhone,
        suppliedByProvider: hasAdvancedRecords ? returnedPhone > 0 : false,
        detail: hasAdvancedRecords
          ? "Phone values, where present, came from an authorized provider response. Missing values remain unknown; no number is inferred or enriched."
          : "Places text search does not return phone numbers. This column is empty because the field was never requested — it requires a separate Place Details call this deployment does not make.",
      },
      {
        field: "website",
        present: returnedWebsite,
        suppliedByProvider: hasAdvancedRecords ? returnedWebsite > 0 : false,
        detail: hasAdvancedRecords
          ? "Website values, where present, came from an authorized provider response. Missing values remain unknown; no website is inferred."
          : "Places text search does not return websites, for the same reason as the phone column.",
      },
    ];

    return {
      totalLeads: total,
      fields: spec.map((s) => ({
        field: s.field,
        present: s.present,
        missing: total - s.present,
        percentPresent: pct(s.present),
        suppliedByProvider: s.suppliedByProvider,
        detail: s.detail,
      })),
      contactable: count(leadHasContactChannel),
      generatedAt: nowIso(),
      coverageNote: LEAD_CONTACT_COVERAGE_NOTE,
      providerNote: LEAD_PROVIDER_NOTE,
    };
  },

  /* ---- Search ledger -------------------------------------------------- */

  /**
   * Record a completed search.
   *
   * Called from Session 85's `search()` after the results are stored, and
   * deliberately best-effort there: a ledger write must never be the reason a
   * paid search appears to fail.
   *
   * `newListings` and `repeatListings` are computed by counting how many stored
   * leads now share each returned provider id. A id held exactly once was new to
   * this organization; held more than once, this search repeated something
   * already there. That is exact, and it needs no second index that could drift
   * away from the leads themselves.
   */
  async recordSearch(input: {
    organizationId: string;
    query: string;
    actorId: string | null;
    sourceIds: string[];
  }): Promise<LeadSearchHistoryEntry> {
    const { organizationId: org } = input;
    const { leads } = await scanLeads(org);
    const counts = new Map<string, number>();
    for (const lead of leads) counts.set(lead.sourceId, (counts.get(lead.sourceId) ?? 0) + 1);

    let newListings = 0;
    let repeatListings = 0;
    for (const sourceId of new Set(input.sourceIds)) {
      if ((counts.get(sourceId) ?? 0) > 1) repeatListings++;
      else newListings++;
    }

    const entry: LeadSearchHistoryEntry = {
      id: `leadsearch-${randomUUID()}`,
      query: input.query,
      at: nowIso(),
      actorId: input.actorId,
      returned: input.sourceIds.length,
      newListings,
      repeatListings,
    };
    await redis.lpush(K.history(org), JSON.stringify(entry));
    await redis.ltrim(K.history(org), 0, LEAD_HISTORY_LIMIT - 1);
    return entry;
  },

  async history(org: string, limit: number): Promise<LeadSearchHistory> {
    const raw = await redis.lrange(K.history(org), 0, LEAD_HISTORY_LIMIT - 1);
    const all: LeadSearchHistoryEntry[] = [];
    for (const item of raw) {
      const entry = parse<LeadSearchHistoryEntry>(item);
      if (entry) all.push(entry);
    }
    const entries = all.slice(0, limit);
    return {
      entries,
      returned: entries.length,
      stored: all.length,
      retentionLimit: LEAD_HISTORY_LIMIT,
      // Newest first, so the oldest held entry is the last one.
      oldestAt: all.length ? all[all.length - 1]!.at : null,
      historyNote: LEAD_HISTORY_NOTE,
    };
  },

  /* ---- Collections ---------------------------------------------------- */

  async collection(org: string, collectionId: string): Promise<LeadCollectionDetail> {
    const collection = parse<LeadCollection>(await redis.get(K85.collection(org, collectionId)));
    if (!collection) throw AppError.notFound("Collection not found in this organization.");

    const leads: LeadWithPipeline[] = [];
    const missingLeadIds: string[] = [];
    for (const leadId of collection.leadIds) {
      const lead = parse<Lead>(await redis.get(K85.lead(org, leadId)));
      // A member id that no longer resolves is named rather than quietly
      // dropped: the count and the list would otherwise disagree with no
      // explanation.
      if (!lead) missingLeadIds.push(leadId);
      else leads.push(await join(org, lead));
    }

    return {
      ...collection,
      leadsCount: collection.leadIds.length,
      missingLeadIds,
      leads,
    };
  },

  async renameCollection(org: string, collectionId: string, name: string): Promise<LeadCollection> {
    const collection = parse<LeadCollection>(await redis.get(K85.collection(org, collectionId)));
    if (!collection) throw AppError.notFound("Collection not found in this organization.");
    const updated: LeadCollection = { ...collection, name, updatedAt: nowIso() };
    await redis.set(K85.collection(org, collectionId), JSON.stringify(updated));
    return updated;
  },

  /**
   * Delete a collection. The leads it grouped are untouched — a collection is a
   * grouping, and deleting one has never been a reason to lose the underlying
   * records.
   */
  async deleteCollection(
    org: string,
    collectionId: string,
  ): Promise<{ id: string; deleted: true; leadsKept: number; deletedAt: string }> {
    const collection = parse<LeadCollection>(await redis.get(K85.collection(org, collectionId)));
    if (!collection) throw AppError.notFound("Collection not found in this organization.");
    await redis.del(K85.collection(org, collectionId));
    await redis.lrem(K85.collections(org), 0, collectionId);
    return {
      id: collectionId,
      deleted: true,
      leadsKept: collection.leadIds.length,
      deletedAt: nowIso(),
    };
  },

  async removeLeadFromCollection(
    org: string,
    collectionId: string,
    leadId: string,
  ): Promise<LeadCollection> {
    const collection = parse<LeadCollection>(await redis.get(K85.collection(org, collectionId)));
    if (!collection) throw AppError.notFound("Collection not found in this organization.");
    if (!collection.leadIds.includes(leadId)) {
      throw AppError.notFound("That lead is not in this collection.");
    }
    const updated: LeadCollection = {
      ...collection,
      leadIds: collection.leadIds.filter((id) => id !== leadId),
      updatedAt: nowIso(),
    };
    await redis.set(K85.collection(org, collectionId), JSON.stringify(updated));
    return updated;
  },

  /* ---- Export --------------------------------------------------------- */

  /**
   * What a CSV of this selection would contain, before it downloads: which ids
   * do not resolve, which columns are entirely empty, and how many cells the
   * formula guard will rewrite.
   */
  async exportPreview(org: string, leadIds: string[]): Promise<LeadExportPreview> {
    const requested = leadIds.length;
    const unique = [...new Set(leadIds)];
    const duplicatesInSelection = requested - unique.length;

    const resolved: LeadWithPipeline[] = [];
    const missingIds: string[] = [];
    for (const id of unique) {
      const lead = parse<Lead>(await redis.get(K85.lead(org, id)));
      if (!lead) missingIds.push(id);
      else resolved.push(await join(org, lead));
    }

    let cellsNeutralised = 0;
    const columns: LeadExportColumnPreview[] = LEAD_EXPORT_FIELDS.map((field) => {
      let populated = 0;
      for (const lead of resolved) {
        const value = exportValue(lead, field);
        if (value !== "" && value !== null && value !== undefined) populated++;
        if (leadCellNeedsGuard(value)) cellsNeutralised++;
      }
      return {
        field,
        populated,
        // With nothing resolved, "always empty" would be an artefact of an
        // empty selection rather than a statement about the columns.
        alwaysEmpty: resolved.length > 0 && populated === 0,
      };
    });

    return {
      requested,
      resolved: resolved.length,
      missingIds,
      duplicatesInSelection,
      columns,
      cellsNeutralised,
      statusCounts: tally(resolved.map((l) => l.pipeline)),
      generatedAt: nowIso(),
      exportNote: LEAD_EXPORT_NOTE,
      csvInjectionNote: LEAD_CSV_INJECTION_NOTE,
      coverageNote: LEAD_CONTACT_COVERAGE_NOTE,
    };
  },

  /**
   * CSV including pipeline columns, with every cell passed through the formula
   * guard. Session 85's `/export` is untouched and still serves its original
   * eleven columns.
   */
  async exportCsv(org: string, leadIds: string[]): Promise<{ csv: string; rows: number }> {
    const unique = [...new Set(leadIds)];
    const rows: LeadWithPipeline[] = [];
    for (const id of unique) {
      const lead = parse<Lead>(await redis.get(K85.lead(org, id)));
      if (!lead) throw AppError.notFound(`Lead ${id} not found in this organization.`);
      rows.push(await join(org, lead));
    }
    const header = LEAD_EXPORT_FIELDS.map(leadCsvCell).join(",");
    const body = rows.map((lead) =>
      LEAD_EXPORT_FIELDS.map((field) => leadCsvCell(exportValue(lead, field))).join(","),
    );
    return { csv: [header, ...body].join("\r\n"), rows: rows.length };
  },

  /* ---- Summary -------------------------------------------------------- */

  async summary(org: string): Promise<LeadSummary> {
    const { leads, order } = await scanLeads(org);
    const pipelines: LeadPipelineRecord[] = [];
    for (const lead of leads) pipelines.push(await readPipeline(org, lead.id));

    const grouped = groupBySourceId(leads);
    let unresolvedDuplicateGroups = 0;
    const byId = new Map(pipelines.map((p) => [p.leadId, p]));
    for (const [, members] of grouped) {
      if (members.length < 2) continue;
      const ordered = sortByDiscovery(members, order);
      const unresolved = ordered
        .slice(1)
        .some((dup) => byId.get(dup.id)?.status !== "duplicate");
      if (unresolved) unresolvedDuplicateGroups++;
    }

    const collectionIds = await redis.lrange(K85.collections(org), 0, LEAD_RETENTION_LIMIT - 1);
    const history = await this.history(org, 1);
    const last = history.entries[0] ?? null;

    return {
      totalLeads: leads.length,
      statusCounts: tally(pipelines),
      distinctListings: grouped.size,
      unresolvedDuplicateGroups,
      collections: collectionIds.length,
      contactable: leads.filter(leadHasContactChannel).length,
      ownedLeads: pipelines.filter((p) => p.ownerId !== null).length,
      unownedLeads: pipelines.filter((p) => p.ownerId === null).length,
      notesRecorded: pipelines.reduce((sum, p) => sum + p.noteCount, 0),
      lastSearchAt: last?.at ?? null,
      lastSearchQuery: last?.query ?? null,
      searchesRecorded: history.stored,
      searchConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      generatedAt: nowIso(),
      providerNote: LEAD_PROVIDER_NOTE,
      coverageNote: LEAD_CONTACT_COVERAGE_NOTE,
      historyNote: LEAD_HISTORY_NOTE,
    };
  },
};

/** One export cell's raw value, before escaping. */
function exportValue(lead: LeadWithPipeline, field: (typeof LEAD_EXPORT_FIELDS)[number]): string {
  switch (field) {
    case "status":
      return lead.pipeline.status;
    case "ownerId":
      return lead.pipeline.ownerId ?? "";
    default: {
      const value = (lead as unknown as Record<string, unknown>)[field];
      return value === null || value === undefined ? "" : String(value);
    }
  }
}
