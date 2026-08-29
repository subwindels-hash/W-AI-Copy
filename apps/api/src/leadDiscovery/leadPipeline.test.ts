/**
 * Session 115 — Lead Discovery pipeline, deduplication, coverage and export.
 *
 * WHAT THESE TESTS ARE FOR
 * ------------------------
 * Session 85's discovery half already had a suite covering honest
 * unavailability and no-enrichment. This one covers what happens *after*
 * discovery, and in particular the four claims this session makes that would be
 * easy to fake:
 *
 *   1. **A pipeline status is not a verification.** Moving a lead to
 *      `qualified` must leave `verificationStatus: "source_returned"` exactly
 *      as the provider left it.
 *   2. **Deduplication is grouped on the provider's id, and never deletes.**
 *      Two records with the same name but different place ids are *not* the
 *      same business; and resolving a group must leave every record — and its
 *      notes — still readable.
 *   3. **Empty contact columns are explained.** Coverage must report zero phone
 *      numbers *and* say the endpoint never returned any, rather than implying
 *      the businesses have none.
 *   4. **Exports are safe and honest.** A directory listing called
 *      `=HYPERLINK(...)` is attacker-controlled text that a spreadsheet will
 *      execute, and a column that will be empty should be named before the file
 *      downloads, not after.
 *
 * Leads are seeded **through the real Session 85 service** rather than by
 * writing keys by hand, so the two files' key layouts must genuinely agree; a
 * drift there fails these tests rather than silently returning empty lists.
 *
 * Redis is substituted with FakeKv and `fetch` is stubbed: no network, no
 * infrastructure.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import {
  LEAD_HISTORY_LIMIT,
  LEAD_MAX_NOTES_PER_LEAD,
  LeadQuerySchema,
  LeadStatusUpdateSchema,
  leadCellNeedsGuard,
  leadCsvCell,
} from "@windels/shared/leadDiscovery";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { LeadDiscoveryService } = await import("./leadDiscovery.service.js");
const { LeadPipelineService } = await import("./leadPipeline.service.js");

const ORG_A = "org-lead-a";
const ORG_B = "org-lead-b";
const USER = "user-115";

function placesResponse(results: any[], status = "OK") {
  return new Response(JSON.stringify({ status, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Seed leads through Session 85's real search path. */
async function seed(org: string, query: string, results: any[]) {
  vi.stubGlobal("fetch", vi.fn(async () => placesResponse(results)));
  return LeadDiscoveryService.search(org, query, USER);
}

const q = (over: Record<string, unknown> = {}) => LeadQuerySchema.parse(over);

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

/* ── Pipeline basics ───────────────────────────────────────────────────── */

describe("pipeline state", () => {
  it("reads an untouched lead as new, with no invented timestamps", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "Cafe One", formatted_address: "1 St" }]);
    const lead = await LeadPipelineService.getLead(ORG_A, res.results[0]!.id);

    expect(lead.pipeline.status).toBe("new");
    expect(lead.pipeline.ownerId).toBeNull();
    expect(lead.pipeline.noteCount).toBe(0);
    // Nobody has changed the status, so there is no "changed at" to report.
    // A creation date borrowed from discovery would read as a decision.
    expect(lead.pipeline.statusChangedAt).toBeNull();
    expect(lead.pipeline.statusChangedBy).toBeNull();
  });

  it("never upgrades the provider's verification status when a status is set", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "Cafe One" }]);
    const id = res.results[0]!.id;

    const updated = await LeadPipelineService.setStatus(
      ORG_A, id, LeadStatusUpdateSchema.parse({ status: "qualified" }), USER,
    );

    expect(updated.pipeline.status).toBe("qualified");
    // The operator judged it worth pursuing. The provider still only *listed*
    // it, and that claim must be untouched.
    expect(updated.verificationStatus).toBe("source_returned");
  });

  it("records who changed a status and when", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "Cafe One" }]);
    const updated = await LeadPipelineService.setStatus(
      ORG_A, res.results[0]!.id, LeadStatusUpdateSchema.parse({ status: "contacted" }), USER,
    );
    expect(updated.pipeline.statusChangedBy).toBe(USER);
    expect(Date.parse(updated.pipeline.statusChangedAt!)).not.toBeNaN();
  });

  it("attaches an optional note to a status change and counts it", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "Cafe One" }]);
    const id = res.results[0]!.id;

    const updated = await LeadPipelineService.setStatus(
      ORG_A, id, LeadStatusUpdateSchema.parse({ status: "contacted", note: "Called, no answer." }), USER,
    );
    expect(updated.pipeline.noteCount).toBe(1);

    const notes = await LeadPipelineService.listNotes(ORG_A, id);
    expect(notes.notes[0]!.body).toBe("Called, no answer.");
    expect(notes.notes[0]!.authorId).toBe(USER);
  });

  it("404s on a lead id that does not exist", async () => {
    await expect(
      LeadPipelineService.setStatus(ORG_A, "lead-nope", LeadStatusUpdateSchema.parse({ status: "contacted" }), USER),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("assigns an owner and releases it again with null", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "Cafe One" }]);
    const id = res.results[0]!.id;

    expect((await LeadPipelineService.setOwner(ORG_A, id, "rep-1", USER)).pipeline.ownerId).toBe("rep-1");
    expect((await LeadPipelineService.setOwner(ORG_A, id, null, USER)).pipeline.ownerId).toBeNull();
  });
});

/* ── Notes ─────────────────────────────────────────────────────────────── */

describe("notes", () => {
  it("keeps notes newest-first and scoped to their lead", async () => {
    const res = await seed(ORG_A, "cafes", [
      { place_id: "p1", name: "One" },
      { place_id: "p2", name: "Two" },
    ]);
    const [first, second] = res.results;

    await LeadPipelineService.addNote(ORG_A, first!.id, "older", USER);
    await LeadPipelineService.addNote(ORG_A, first!.id, "newer", USER);
    await LeadPipelineService.addNote(ORG_A, second!.id, "other lead", USER);

    const notes = await LeadPipelineService.listNotes(ORG_A, first!.id);
    expect(notes.notes.map((n) => n.body)).toEqual(["newer", "older"]);
    expect(notes.returned).toBe(2);
  });

  it("refuses a note on a lead belonging to another organization", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    await expect(
      LeadPipelineService.addNote(ORG_B, res.results[0]!.id, "leak", USER),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses the note beyond the cap rather than dropping an older one", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    const id = res.results[0]!.id;
    for (let i = 0; i < LEAD_MAX_NOTES_PER_LEAD; i++) {
      await LeadPipelineService.addNote(ORG_A, id, `note ${i}`, USER);
    }
    await expect(LeadPipelineService.addNote(ORG_A, id, "one too many", USER))
      .rejects.toMatchObject({ status: 409 });
    // The cap must not have been enforced by silently discarding history.
    expect((await LeadPipelineService.listNotes(ORG_A, id)).returned).toBe(LEAD_MAX_NOTES_PER_LEAD);
  });
});

/* ── Filtering ─────────────────────────────────────────────────────────── */

describe("pipeline listing", () => {
  it("filters by status, owner and free text", async () => {
    const res = await seed(ORG_A, "abuja cafes", [
      { place_id: "p1", name: "Bella Cafe", formatted_address: "12 Wuse II" },
      { place_id: "p2", name: "Zebra Bar", formatted_address: "3 Maitama" },
    ]);
    const bella = res.results.find((l) => l.name === "Bella Cafe")!;

    await LeadPipelineService.setStatus(ORG_A, bella.id, LeadStatusUpdateSchema.parse({ status: "contacted" }), USER);
    await LeadPipelineService.setOwner(ORG_A, bella.id, "rep-1", USER);

    expect((await LeadPipelineService.listLeads(ORG_A, q({ status: "contacted" }))).total).toBe(1);
    expect((await LeadPipelineService.listLeads(ORG_A, q({ ownerId: "rep-1" }))).total).toBe(1);
    expect((await LeadPipelineService.listLeads(ORG_A, q({ unowned: true }))).total).toBe(1);
    expect((await LeadPipelineService.listLeads(ORG_A, q({ q: "wuse" }))).total).toBe(1);
    expect((await LeadPipelineService.listLeads(ORG_A, q({ q: "nothing here" }))).total).toBe(0);
  });

  it("tallies every status key, including the ones at zero", async () => {
    await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    const list = await LeadPipelineService.listLeads(ORG_A, q());
    // A UI reading `statusCounts.qualified` must get 0, not undefined.
    expect(list.statusCounts).toEqual({ new: 1, contacted: 0, qualified: 0, disqualified: 0, duplicate: 0 });
  });

  it("pages without letting the tallies drift with the window", async () => {
    await seed(
      ORG_A,
      "many",
      Array.from({ length: 5 }, (_, i) => ({ place_id: `p${i}`, name: `Co ${i}` })),
    );
    const page = await LeadPipelineService.listLeads(ORG_A, q({ limit: 2, offset: 0 }));

    expect(page.returned).toBe(2);
    expect(page.total).toBe(5);
    expect(page.truncated).toBe(true);
    // Counts describe the whole match, not the two rows on screen.
    expect(page.statusCounts.new).toBe(5);

    const last = await LeadPipelineService.listLeads(ORG_A, q({ limit: 2, offset: 4 }));
    expect(last.returned).toBe(1);
    expect(last.truncated).toBe(false);
  });

  it("filters to a collection and 404s on an unknown one", async () => {
    const res = await seed(ORG_A, "cafes", [
      { place_id: "p1", name: "One" },
      { place_id: "p2", name: "Two" },
    ]);
    const collection = await LeadDiscoveryService.createCollection(ORG_A, USER, "Shortlist");
    await LeadDiscoveryService.addLeadToCollection(ORG_A, collection.id, res.results[0]!.id);

    const inCollection = await LeadPipelineService.listLeads(ORG_A, q({ collectionId: collection.id }));
    expect(inCollection.total).toBe(1);

    await expect(LeadPipelineService.listLeads(ORG_A, q({ collectionId: "collection-nope" })))
      .rejects.toMatchObject({ status: 404 });
  });

  it("reports contact channels honestly for provider output and for enriched rows", async () => {
    await seed(ORG_A, "cafes", [{ place_id: "p1", name: "No Contact Co" }]);
    // Nothing from text search ever carries a phone, so the true branch would
    // be untestable without a row that has one. This plants what a future Place
    // Details enrichment would store, so the filter is exercised both ways.
    const enriched = {
      id: "lead-enriched-1", name: "Has Phone Co", source: "google_places", sourceId: "p-enriched",
      discoveredAt: new Date().toISOString(), verificationStatus: "source_returned",
      query: "cafes", phone: "+234 800 000 0000",
    };
    await kv.set(`leads85:${ORG_A}:lead:${enriched.id}`, JSON.stringify(enriched));
    await kv.lpush(`leads85:${ORG_A}:leads`, enriched.id);

    expect((await LeadPipelineService.listLeads(ORG_A, q({ hasContact: true }))).total).toBe(1);
    expect((await LeadPipelineService.listLeads(ORG_A, q({ hasContact: false }))).total).toBe(1);
  });
});

/* ── Deduplication ─────────────────────────────────────────────────────── */

describe("deduplication", () => {
  it("groups repeat searches on the provider id and names the earliest as keeper", async () => {
    const first = await seed(ORG_A, "cafes in abuja", [{ place_id: "same-1", name: "Bella Cafe" }]);
    const second = await seed(ORG_A, "abuja coffee", [{ place_id: "same-1", name: "Bella Cafe" }]);

    const report = await LeadPipelineService.duplicates(ORG_A);
    expect(report.groups).toHaveLength(1);
    const group = report.groups[0]!;

    expect(group.sourceId).toBe("same-1");
    expect(group.keeperId).toBe(first.results[0]!.id);
    expect(group.duplicateIds).toEqual([second.results[0]!.id]);
    expect(group.queries.sort()).toEqual(["abuja coffee", "cafes in abuja"]);
    expect(group.resolved).toBe(false);
    expect(report.affectedLeads).toBe(2);
    expect(report.distinctListings).toBe(1);
    expect(report.scanned).toBe(2);
  });

  it("does not group a coincidentally identical identifier from different providers", async () => {
    const records = [
      { id: "lead-google-collision", name: "Google result", source: "google_places", sourceId: "shared-id", discoveredAt: new Date().toISOString(), verificationStatus: "source_returned", query: "google" },
      { id: "lead-apollo-collision", name: "Apollo result", source: "apollo", sourceId: "shared-id", discoveredAt: new Date().toISOString(), verificationStatus: "unverified", query: "apollo" },
    ];
    for (const record of records) {
      await kv.set(`leads85:${ORG_A}:lead:${record.id}`, JSON.stringify(record));
      await kv.lpush(`leads85:${ORG_A}:leads`, record.id);
    }
    expect((await LeadPipelineService.duplicates(ORG_A)).groups).toEqual([]);
  });

  it("does not group two different listings that merely share a name", async () => {
    await seed(ORG_A, "chains", [
      { place_id: "branch-1", name: "Same Name Ltd", formatted_address: "1 St" },
      { place_id: "branch-2", name: "Same Name Ltd", formatted_address: "2 Ave" },
    ]);
    const report = await LeadPipelineService.duplicates(ORG_A);
    // Two branches of one chain are two listings. Merging them on the name
    // would be a guess presented as a fact.
    expect(report.groups).toHaveLength(0);
    expect(report.distinctListings).toBe(2);
  });

  it("marks duplicates against their keeper and is idempotent", async () => {
    const first = await seed(ORG_A, "q1", [{ place_id: "same-1", name: "Bella" }]);
    const second = await seed(ORG_A, "q2", [{ place_id: "same-1", name: "Bella" }]);

    const resolution = await LeadPipelineService.resolveDuplicates(ORG_A, USER);
    expect(resolution.groupsResolved).toBe(1);
    expect(resolution.leadsMarked).toBe(1);
    expect(resolution.markedLeadIds).toEqual([second.results[0]!.id]);

    const marked = await LeadPipelineService.getLead(ORG_A, second.results[0]!.id);
    expect(marked.pipeline.status).toBe("duplicate");
    expect(marked.pipeline.duplicateOf).toBe(first.results[0]!.id);
    // The keeper is left alone.
    expect((await LeadPipelineService.getLead(ORG_A, first.results[0]!.id)).pipeline.status).toBe("new");

    const again = await LeadPipelineService.resolveDuplicates(ORG_A, USER);
    expect(again.leadsMarked).toBe(0);
    expect(again.alreadyResolved).toBe(1);
  });

  it("resolves by marking, never by deleting — the record and its notes survive", async () => {
    await seed(ORG_A, "q1", [{ place_id: "same-1", name: "Bella" }]);
    const second = await seed(ORG_A, "q2", [{ place_id: "same-1", name: "Bella" }]);
    const dupId = second.results[0]!.id;
    await LeadPipelineService.addNote(ORG_A, dupId, "spoke to the manager here", USER);

    await LeadPipelineService.resolveDuplicates(ORG_A, USER);

    // Deleting would have taken somebody's work with it.
    const still = await LeadPipelineService.getLead(ORG_A, dupId);
    expect(still.name).toBe("Bella");
    expect((await LeadPipelineService.listNotes(ORG_A, dupId)).notes[0]!.body).toBe("spoke to the manager here");
  });

  it("returns a marked duplicate to the pipeline and clears its keeper pointer", async () => {
    await seed(ORG_A, "q1", [{ place_id: "same-1", name: "Bella" }]);
    const second = await seed(ORG_A, "q2", [{ place_id: "same-1", name: "Bella" }]);
    await LeadPipelineService.resolveDuplicates(ORG_A, USER);

    const back = await LeadPipelineService.setStatus(
      ORG_A, second.results[0]!.id, LeadStatusUpdateSchema.parse({ status: "new" }), USER,
    );
    expect(back.pipeline.status).toBe("new");
    expect(back.pipeline.duplicateOf).toBeNull();
    expect((await LeadPipelineService.duplicates(ORG_A)).unresolvedGroups).toBe(1);
  });
});

/* ── Coverage ──────────────────────────────────────────────────────────── */

describe("field coverage", () => {
  it("reports empty contact columns together with the reason they are empty", async () => {
    await seed(ORG_A, "cafes", [
      { place_id: "p1", name: "One", formatted_address: "1 St", types: ["cafe"] },
      { place_id: "p2", name: "Two", formatted_address: "2 St", types: ["bar"] },
    ]);
    const report = await LeadPipelineService.coverage(ORG_A);

    const phone = report.fields.find((f) => f.field === "phone")!;
    expect(phone.present).toBe(0);
    expect(phone.suppliedByProvider).toBe(false);
    // The point of the whole report: the column is empty because of the call
    // that was made, not because of the businesses.
    expect(phone.detail).toMatch(/does not return phone numbers/i);
    expect(report.coverageNote).toMatch(/does not return phone numbers/i);
    expect(report.contactable).toBe(0);

    const address = report.fields.find((f) => f.field === "address")!;
    expect(address.present).toBe(2);
    expect(address.percentPresent).toBe(100);
    expect(address.suppliedByProvider).toBe(true);
  });

  it("reports null, not zero percent, when there are no leads to measure", async () => {
    const report = await LeadPipelineService.coverage(ORG_B);
    expect(report.totalLeads).toBe(0);
    // 0% would read as "none of them have a name". There is nothing to measure.
    for (const field of report.fields) expect(field.percentPresent).toBeNull();
  });
});

/* ── Search ledger ─────────────────────────────────────────────────────── */

describe("search ledger", () => {
  it("records a search made through the real Session 85 path", async () => {
    await seed(ORG_A, "dentists in enugu", [
      { place_id: "d1", name: "Smile Co" },
      { place_id: "d2", name: "Bright Co" },
    ]);
    const history = await LeadPipelineService.history(ORG_A, 50);

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]!.query).toBe("dentists in enugu");
    expect(history.entries[0]!.returned).toBe(2);
    expect(history.entries[0]!.newListings).toBe(2);
    expect(history.entries[0]!.repeatListings).toBe(0);
    expect(history.entries[0]!.actorId).toBe(USER);
  });

  it("counts a listing already held as a repeat, not as a new find", async () => {
    await seed(ORG_A, "first pass", [{ place_id: "same-1", name: "Bella" }]);
    await seed(ORG_A, "second pass", [{ place_id: "same-1", name: "Bella" }, { place_id: "new-1", name: "Fresh" }]);

    const history = await LeadPipelineService.history(ORG_A, 50);
    const latest = history.entries[0]!;
    expect(latest.returned).toBe(2);
    expect(latest.repeatListings).toBe(1);
    expect(latest.newListings).toBe(1);
  });

  it("trims to the retention limit and says what it holds", async () => {
    for (let i = 0; i < LEAD_HISTORY_LIMIT + 5; i++) {
      await LeadPipelineService.recordSearch({
        organizationId: ORG_A, query: `q${i}`, actorId: USER, sourceIds: [],
      });
    }
    const history = await LeadPipelineService.history(ORG_A, LEAD_HISTORY_LIMIT);
    expect(history.stored).toBe(LEAD_HISTORY_LIMIT);
    expect(history.retentionLimit).toBe(LEAD_HISTORY_LIMIT);
    expect(history.oldestAt).not.toBeNull();
    expect(history.historyNote).toMatch(/trimmed/i);
  });

  it("reports an empty ledger as empty rather than as a zero date", async () => {
    const history = await LeadPipelineService.history(ORG_B, 50);
    expect(history.entries).toEqual([]);
    expect(history.oldestAt).toBeNull();
  });

  it("never fails a paid search because the ledger write failed", async () => {
    vi.spyOn(LeadPipelineService, "recordSearch").mockRejectedValue(new Error("redis down"));
    // The provider has already been called and billed at this point; turning
    // that into an error for the caller would lose the results as well.
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "Bella" }]);
    expect(res.results).toHaveLength(1);
    expect(await LeadDiscoveryService.list(ORG_A)).toHaveLength(1);
  });
});

/* ── Collections ───────────────────────────────────────────────────────── */

describe("collection maintenance", () => {
  it("renames a collection", async () => {
    const created = await LeadDiscoveryService.createCollection(ORG_A, USER, "Typo'd Name");
    const renamed = await LeadPipelineService.renameCollection(ORG_A, created.id, "Q3 prospects");
    expect(renamed.name).toBe("Q3 prospects");
    expect((await LeadDiscoveryService.listCollections(ORG_A))[0]!.name).toBe("Q3 prospects");
  });

  it("deletes a collection without touching the leads it grouped", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    const created = await LeadDiscoveryService.createCollection(ORG_A, USER, "Temp");
    await LeadDiscoveryService.addLeadToCollection(ORG_A, created.id, res.results[0]!.id);

    const deleted = await LeadPipelineService.deleteCollection(ORG_A, created.id);
    expect(deleted.deleted).toBe(true);
    expect(deleted.leadsKept).toBe(1);

    // Gone from the index as well as the record, so the list does not show a
    // collection that no longer resolves.
    expect(await LeadDiscoveryService.listCollections(ORG_A)).toHaveLength(0);
    // The lead itself is a separate thing and survives.
    expect(await LeadDiscoveryService.list(ORG_A)).toHaveLength(1);
  });

  it("removes one lead from a collection and 404s when it was never in it", async () => {
    const res = await seed(ORG_A, "cafes", [
      { place_id: "p1", name: "One" },
      { place_id: "p2", name: "Two" },
    ]);
    const created = await LeadDiscoveryService.createCollection(ORG_A, USER, "Shortlist");
    await LeadDiscoveryService.addLeadToCollection(ORG_A, created.id, res.results[0]!.id);

    const updated = await LeadPipelineService.removeLeadFromCollection(ORG_A, created.id, res.results[0]!.id);
    expect(updated.leadIds).toEqual([]);

    await expect(
      LeadPipelineService.removeLeadFromCollection(ORG_A, created.id, res.results[1]!.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("names member ids that no longer resolve instead of quietly dropping them", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    const created = await LeadDiscoveryService.createCollection(ORG_A, USER, "Shortlist");
    await LeadDiscoveryService.addLeadToCollection(ORG_A, created.id, res.results[0]!.id);
    await kv.del(`leads85:${ORG_A}:lead:${res.results[0]!.id}`);

    const detail = await LeadPipelineService.collection(ORG_A, created.id);
    expect(detail.leadsCount).toBe(1);
    expect(detail.leads).toHaveLength(0);
    // The count and the list disagree, and the payload explains why.
    expect(detail.missingLeadIds).toEqual([res.results[0]!.id]);
  });
});

/* ── Export ────────────────────────────────────────────────────────────── */

describe("export", () => {
  it("names the columns that will be empty before anything downloads", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One", formatted_address: "1 St" }]);
    const preview = await LeadPipelineService.exportPreview(ORG_A, [res.results[0]!.id]);

    const phone = preview.columns.find((c) => c.field === "phone")!;
    expect(phone.alwaysEmpty).toBe(true);
    expect(preview.columns.find((c) => c.field === "name")!.alwaysEmpty).toBe(false);
    expect(preview.coverageNote).toMatch(/does not return phone numbers/i);
  });

  it("reports unresolved ids and duplicate selections rather than silently shrinking", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    const id = res.results[0]!.id;
    const preview = await LeadPipelineService.exportPreview(ORG_A, [id, id, "lead-missing-1"]);

    expect(preview.requested).toBe(3);
    expect(preview.duplicatesInSelection).toBe(1);
    expect(preview.resolved).toBe(1);
    expect(preview.missingIds).toEqual(["lead-missing-1"]);
  });

  it("does not call a column always-empty when nothing was resolved to measure", async () => {
    const preview = await LeadPipelineService.exportPreview(ORG_A, ["lead-missing-1"]);
    expect(preview.resolved).toBe(0);
    // Every column is empty here, but only because the selection was.
    for (const column of preview.columns) expect(column.alwaysEmpty).toBe(false);
  });

  it("neutralises spreadsheet formulas in provider-controlled text", async () => {
    const res = await seed(ORG_A, "cafes", [
      { place_id: "p1", name: '=HYPERLINK("http://evil","Click")', formatted_address: "1 St" },
    ]);
    const { csv } = await LeadPipelineService.exportCsv(ORG_A, [res.results[0]!.id]);

    // A directory listing is attacker-controlled input; Excel executes a
    // leading "=" on open.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""Click"")"`);
    expect(csv).not.toMatch(/,"=HYPERLINK/);

    const preview = await LeadPipelineService.exportPreview(ORG_A, [res.results[0]!.id]);
    expect(preview.cellsNeutralised).toBe(1);
    expect(preview.csvInjectionNote).toMatch(/apostrophe/i);
  });

  it("carries the pipeline columns and refuses an id from another organization", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    const id = res.results[0]!.id;
    await LeadPipelineService.setStatus(ORG_A, id, LeadStatusUpdateSchema.parse({ status: "qualified" }), USER);
    await LeadPipelineService.setOwner(ORG_A, id, "rep-9", USER);

    const { csv, rows } = await LeadPipelineService.exportCsv(ORG_A, [id]);
    expect(rows).toBe(1);
    expect(csv.split("\r\n")[0]).toContain('"status","ownerId"');
    expect(csv).toContain('"qualified"');
    expect(csv).toContain('"rep-9"');

    await expect(LeadPipelineService.exportCsv(ORG_B, [id])).rejects.toMatchObject({ status: 404 });
  });

  it("escapes and guards cells at the helper level", () => {
    expect(leadCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(leadCsvCell("=1+1")).toBe(`"'=1+1"`);
    expect(leadCsvCell(null)).toBe('""');
    expect(leadCellNeedsGuard("@sum")).toBe(true);
    expect(leadCellNeedsGuard("Bella Cafe")).toBe(false);
  });
});

/* ── Tenant isolation ──────────────────────────────────────────────────── */

describe("tenant isolation", () => {
  it("keeps one organization's pipeline invisible to another", async () => {
    const res = await seed(ORG_A, "cafes", [{ place_id: "p1", name: "One" }]);
    await LeadPipelineService.setStatus(
      ORG_A, res.results[0]!.id, LeadStatusUpdateSchema.parse({ status: "qualified" }), USER,
    );

    expect((await LeadPipelineService.listLeads(ORG_B, q())).total).toBe(0);
    await expect(LeadPipelineService.getLead(ORG_B, res.results[0]!.id)).rejects.toMatchObject({ status: 404 });
  });

  it("ignores a pipeline record planted under the wrong organization", async () => {
    const res = await seed(ORG_B, "cafes", [{ place_id: "p1", name: "B Lead" }]);
    const leadId = res.results[0]!.id;

    // A forged key in org B's namespace whose payload claims org A. Reads must
    // fail closed on the stored organization rather than trusting the key.
    await kv.set(
      `lead:pipe:${ORG_B}:${leadId}`,
      JSON.stringify({
        leadId, status: "qualified", ownerId: "attacker", duplicateOf: null,
        noteCount: 0, statusChangedAt: null, statusChangedBy: null,
        updatedAt: new Date().toISOString(), organizationId: ORG_A,
      }),
    );

    const lead = await LeadPipelineService.getLead(ORG_B, leadId);
    expect(lead.pipeline.status).toBe("new");
    expect(lead.pipeline.ownerId).toBeNull();
  });

  it("does not let one organization's search ledger reach another", async () => {
    await seed(ORG_A, "org a query", [{ place_id: "p1", name: "One" }]);
    expect((await LeadPipelineService.history(ORG_B, 50)).entries).toEqual([]);
  });
});

/* ── Summary ───────────────────────────────────────────────────────────── */

describe("summary", () => {
  it("separates records held from distinct listings", async () => {
    await seed(ORG_A, "q1", [{ place_id: "same-1", name: "Bella" }, { place_id: "other", name: "Zed" }]);
    await seed(ORG_A, "q2", [{ place_id: "same-1", name: "Bella" }]);

    const summary = await LeadPipelineService.summary(ORG_A);
    expect(summary.totalLeads).toBe(3);
    // Three records, two businesses. Reporting only the first would overstate
    // the size of the list.
    expect(summary.distinctListings).toBe(2);
    expect(summary.unresolvedDuplicateGroups).toBe(1);

    await LeadPipelineService.resolveDuplicates(ORG_A, USER);
    expect((await LeadPipelineService.summary(ORG_A)).unresolvedDuplicateGroups).toBe(0);
  });

  it("reports an untouched organization without inventing activity", async () => {
    const summary = await LeadPipelineService.summary(ORG_B);
    expect(summary.totalLeads).toBe(0);
    expect(summary.collections).toBe(0);
    expect(summary.contactable).toBe(0);
    // No search was ever recorded, so there is no last search to name.
    expect(summary.lastSearchAt).toBeNull();
    expect(summary.lastSearchQuery).toBeNull();
    expect(summary.searchesRecorded).toBe(0);
  });

  it("counts owners, notes and collections, and reports whether search is configured", async () => {
    const res = await seed(ORG_A, "cafes", [
      { place_id: "p1", name: "One" },
      { place_id: "p2", name: "Two" },
    ]);
    await LeadPipelineService.setOwner(ORG_A, res.results[0]!.id, "rep-1", USER);
    await LeadPipelineService.addNote(ORG_A, res.results[0]!.id, "note", USER);
    await LeadDiscoveryService.createCollection(ORG_A, USER, "Shortlist");

    const summary = await LeadPipelineService.summary(ORG_A);
    expect(summary.ownedLeads).toBe(1);
    expect(summary.unownedLeads).toBe(1);
    expect(summary.notesRecorded).toBe(1);
    expect(summary.collections).toBe(1);
    expect(summary.lastSearchQuery).toBe("cafes");
    expect(summary.searchConfigured).toBe(true);

    delete process.env.GOOGLE_PLACES_API_KEY;
    expect((await LeadPipelineService.summary(ORG_A)).searchConfigured).toBe(false);
  });
});
