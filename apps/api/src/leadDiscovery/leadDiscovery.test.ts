/**
 * Session 85 — AI Lead Discovery.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This module reaches a paid third-party API (Google Places) and stores what
 * comes back as business leads. The inventory reported `tests=0`, which left
 * two things unverified that the repo's own rules care about:
 *
 *  1. **Honest unavailability.** With no `GOOGLE_PLACES_API_KEY` the service
 *     must fail with a 503, not return an empty list that reads like "we
 *     searched and found nobody", and certainly not invented leads.
 *  2. **No enrichment.** Every stored field must come from the provider
 *     response. A lead is labelled `verificationStatus: "source_returned"` —
 *     i.e. the provider returned it, nobody verified it — and the code must not
 *     upgrade that claim or synthesise contact details the API did not give.
 *
 * Tenant isolation matters too: leads are commercially sensitive, and the keys
 * are organization-scoped.
 *
 * Redis is substituted with FakeKv and `fetch` is stubbed, so no network or
 * infrastructure is required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { LeadDiscoveryService } = await import("./leadDiscovery.service.js");

const ORG_A = "org-a";
const ORG_B = "org-b";

/** A minimal Google Places textsearch payload. */
function placesResponse(results: any[], status = "OK") {
  return new Response(JSON.stringify({ status, results }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("configuration honesty", () => {
  it("returns 503 when no API key is configured, rather than an empty result", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    // The distinction matters: an empty array would be read as "no businesses
    // match", which is a claim the service is in no position to make.
    await expect(LeadDiscoveryService.search(ORG_A, "dentists in Abuja")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("does not fall back to cached or invented leads when unconfigured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([
      { place_id: "p1", name: "Real Co", formatted_address: "1 St", types: ["store"] },
    ])));
    await LeadDiscoveryService.search(ORG_A, "shops");
    expect(await LeadDiscoveryService.list(ORG_A)).toHaveLength(1);

    delete process.env.GOOGLE_PLACES_API_KEY;
    // Previously-stored leads must not be replayed as fresh search results.
    await expect(LeadDiscoveryService.search(ORG_A, "shops")).rejects.toMatchObject({ status: 503 });
  });
});

describe("search stores only what the provider returned", () => {
  it("maps provider fields without inventing contact details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([
      { place_id: "place-1", name: "Bella Cafe", formatted_address: "12 Wuse II, Abuja", types: ["cafe", "food"] },
    ])));

    const res = await LeadDiscoveryService.search(ORG_A, "cafes in Abuja");
    expect(res.results).toHaveLength(1);
    const lead = res.results[0]!;

    expect(lead.name).toBe("Bella Cafe");
    expect(lead.address).toBe("12 Wuse II, Abuja");
    expect(lead.category).toBe("cafe");
    expect(lead.sourceId).toBe("place-1");
    expect(lead.source).toBe("google_places");
    expect(lead.query).toBe("cafes in Abuja");

    // The payload carried no phone or website, so neither may be present.
    expect(lead.phone).toBeUndefined();
    expect(lead.website).toBeUndefined();
  });

  it("labels every lead as unverified provider output", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([
      { place_id: "p", name: "N", formatted_address: "A", types: ["x"] },
    ])));
    const res = await LeadDiscoveryService.search(ORG_A, "q");
    // "source_returned" = the provider listed it; nobody confirmed it trades,
    // is solvent, or wants contact. Upgrading this wording would be a claim the
    // platform cannot support.
    expect(res.results[0]!.verificationStatus).toBe("source_returned");
  });

  it("handles ZERO_RESULTS as a real empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([], "ZERO_RESULTS")));
    const res = await LeadDiscoveryService.search(ORG_A, "nothing here");
    expect(res.results).toEqual([]);
  });

  it("skips entries with no place_id instead of fabricating one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([
      { name: "No ID Co", formatted_address: "?" },
      { place_id: "ok-1", name: "Has ID", formatted_address: "1 St" },
    ])));
    const res = await LeadDiscoveryService.search(ORG_A, "q");
    expect(res.results.map((l: any) => l.sourceId)).toEqual(["ok-1"]);
  });

  it("caps a single search at 20 results", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      place_id: `p${i}`, name: `Co ${i}`, formatted_address: `${i} St`, types: ["store"],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse(many)));
    const res = await LeadDiscoveryService.search(ORG_A, "many");
    expect(res.results).toHaveLength(20);
  });
});

describe("upstream failures surface honestly", () => {
  it("raises when the provider returns a non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(LeadDiscoveryService.search(ORG_A, "q")).rejects.toMatchObject({
      code: expect.stringMatching(/UPSTREAM|SERVICE/i),
    });
  });

  it("raises on a provider-level error status such as REQUEST_DENIED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([], "REQUEST_DENIED")));
    await expect(LeadDiscoveryService.search(ORG_A, "q")).rejects.toThrow(/REQUEST_DENIED/);
  });
});

describe("tenant isolation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([
      { place_id: "p1", name: "Org A Lead", formatted_address: "1 St", types: ["store"] },
    ])));
  });

  it("does not leak one organization's leads into another's list", async () => {
    await LeadDiscoveryService.search(ORG_A, "q");
    expect(await LeadDiscoveryService.list(ORG_A)).toHaveLength(1);
    expect(await LeadDiscoveryService.list(ORG_B)).toHaveLength(0);
  });

  it("refuses to resolve a lead id belonging to another organization", async () => {
    const res = await LeadDiscoveryService.search(ORG_A, "q");
    const id = res.results[0]!.id;
    await expect(LeadDiscoveryService.selected(ORG_B, [id])).rejects.toMatchObject({ status: 404 });
  });
});

describe("collections", () => {
  async function seedLead() {
    vi.stubGlobal("fetch", vi.fn(async () => placesResponse([
      { place_id: "p1", name: "Lead", formatted_address: "1 St", types: ["store"] },
    ])));
    const res = await LeadDiscoveryService.search(ORG_A, "q");
    return res.results[0]!.id;
  }

  it("creates a collection owned by the caller", async () => {
    const c = await LeadDiscoveryService.createCollection(ORG_A, "user-1", "Q3 prospects");
    expect(c.name).toBe("Q3 prospects");
    expect(c.createdById).toBe("user-1");
    expect(c.leadIds).toEqual([]);
  });

  it("adds a lead and stays idempotent on repeat", async () => {
    const leadId = await seedLead();
    const c = await LeadDiscoveryService.createCollection(ORG_A, "user-1", "List");

    const once = await LeadDiscoveryService.addLeadToCollection(ORG_A, c.id, leadId);
    expect(once.leadIds).toEqual([leadId]);

    const twice = await LeadDiscoveryService.addLeadToCollection(ORG_A, c.id, leadId);
    expect(twice.leadIds).toEqual([leadId]); // no duplicate
  });

  it("404s when the collection or lead does not exist", async () => {
    const c = await LeadDiscoveryService.createCollection(ORG_A, "user-1", "List");
    await expect(
      LeadDiscoveryService.addLeadToCollection(ORG_A, c.id, "lead-does-not-exist"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      LeadDiscoveryService.addLeadToCollection(ORG_A, "collection-nope", "x"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps collections organization-scoped", async () => {
    await LeadDiscoveryService.createCollection(ORG_A, "user-1", "A list");
    expect(await LeadDiscoveryService.listCollections(ORG_A)).toHaveLength(1);
    expect(await LeadDiscoveryService.listCollections(ORG_B)).toHaveLength(0);
  });
});
