/**
 * Advanced Lead Discovery uses real-provider adapters but its unit tests never
 * contact one. Provider payloads here are minimal fixtures that exercise how
 * authenticated responses are retained; they are not demo lead data and no
 * fixture is reachable at runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
const spies = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  usage: vi.fn().mockResolvedValue(undefined),
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../audit/audit.service.js", () => ({ auditService: { log: spies.audit } }));
vi.mock("../usage/usageEvents.service.js", () => ({ UsageEventsService: { record: spies.usage } }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: spies.dispatch } }));
vi.mock("../services/ai/registry.js", () => ({ aiRegistry: { hasRealModelConfigured: () => false } }));
vi.mock("../sitePlatform/sitePlatform.service.js", () => ({ SitePlatformService: { hydrateApiOverlay: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../sitePlatform/platformApis.runtime.js", () => ({
  resolvePlatformApi: (_slot: string, envKey?: string, baseUrl?: string | null) => {
    const apiKey = envKey ? process.env[envKey] ?? null : null;
    return { configured: Boolean(apiKey), apiKey, baseUrl: baseUrl ?? null, source: apiKey ? "env" : "none", extra: {} };
  },
}));
vi.mock("./leadPipeline.service.js", () => ({
  LeadPipelineService: { getLead: vi.fn().mockResolvedValue({ pipeline: { status: "new" } }) },
}));

const { AdvancedLeadDiscoveryService } = await import("./advancedLeadDiscovery.service.js");

const ORG_A = "advanced-org-a";
const ORG_B = "advanced-org-b";
const ACTOR = "lead-user";

function clearStore() {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
}
function googlePayload(results: unknown[], status = "OK") {
  return new Response(JSON.stringify({ status, results }), { status: 200, headers: { "content-type": "application/json" } });
}
function apolloPayload(people: unknown[]) {
  return new Response(JSON.stringify({ people }), { status: 200, headers: { "content-type": "application/json" } });
}
async function execute(input: Record<string, unknown>) {
  const queued = await AdvancedLeadDiscoveryService.createSearch(ORG_A, ACTOR, input);
  // The request schedules this same work in a microtask. Calling runJob is
  // deliberately idempotent and makes the completed/failed assertion stable.
  return AdvancedLeadDiscoveryService.runJob(ORG_A, queued.id);
}

beforeEach(() => {
  clearStore();
  spies.audit.mockClear(); spies.usage.mockClear(); spies.dispatch.mockClear();
  process.env.GOOGLE_PLACES_API_KEY = "google-test-key";
  process.env.LEAD_APOLLO_API_KEY = "apollo-test-key";
  process.env.LEAD_NEVERBOUNCE_API_KEY = "neverbounce-test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.LEAD_APOLLO_API_KEY;
  delete process.env.LEAD_NEVERBOUNCE_API_KEY;
});

describe("the three provider-backed modes", () => {
  it("runs Business Mode through Google Places and preserves only returned detail fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async (request: URL | string) => {
      const url = String(request);
      if (url.includes("textsearch")) return googlePayload([{ place_id: "place-42", name: "River Logistics", types: ["moving_company"] }]);
      if (url.includes("details")) return googlePayload([], "OK");
      throw new Error(`Unexpected provider URL ${url}`);
    }));

    const job = await execute({ mode: "business", keywords: ["logistics"], country: "Nigeria", limit: 10 });
    expect(job.status).toBe("completed");
    expect(job.created).toBe(1);
    const [lead] = await AdvancedLeadDiscoveryService.resultLeads(ORG_A, job.id);
    expect(lead).toMatchObject({ name: "River Logistics", company: "River Logistics", source: "google_places", verificationStatus: "unverified", phone: null, companyWebsite: null });
    expect(lead!.sourceTrace[0]).toMatchObject({ providerRecordId: "place-42", discoveryMethod: "google_places_textsearch", searchMode: "business" });
  });

  it("runs Apollo Mode with industry and professional criteria without inventing contact data", async () => {
    const fetchMock = vi.fn(async (request: URL | string) => {
      const url = new URL(String(request));
      expect(url.pathname).toBe("/api/v1/mixed_people/api_search");
      expect(url.searchParams.getAll("person_titles[]")).toEqual(["Operations Director"]);
      expect(url.searchParams.get("q_keywords")).toContain("logistics");
      return apolloPayload([{ id: "apollo-person-1", first_name: "Amina", last_name: "Okafor", title: "Operations Director", organization: { name: "River Logistics", industry: "logistics", website_url: "https://river.example" }, linkedin_url: "https://www.linkedin.com/in/amina-okafor", city: "Lagos", country: "Nigeria" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await execute({ mode: "apollo", industry: "logistics", jobTitles: ["Operations Director"], city: "Lagos", country: "Nigeria", limit: 10 });
    expect(job.status).toBe("completed");
    const [lead] = await AdvancedLeadDiscoveryService.resultLeads(ORG_A, job.id);
    expect(lead).toMatchObject({ name: "Amina Okafor", jobTitle: "Operations Director", company: "River Logistics", email: null, phone: null, source: "apollo" });
    expect(lead!.sourceTrace[0]!.discoveryMethod).toBe("apollo_people_api_search");
  });

  it("runs Person Mode only with permitted person criteria and retains no absent email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => apolloPayload([{ id: "apollo-person-2", name: "Ravi Shah", title: "Founder", organization: { name: "Northstar Software" } }])));

    const job = await execute({ mode: "person", names: ["Ravi Shah"], jobTitles: ["Founder"], company: "Northstar Software", limit: 10 });
    expect(job.status).toBe("completed");
    const [lead] = await AdvancedLeadDiscoveryService.resultLeads(ORG_A, job.id);
    expect(lead).toMatchObject({ name: "Ravi Shah", company: "Northstar Software", email: null, emailStatus: "not_available" });
  });

  it("fails a personal-domain filter closed when compliance policy has not enabled it", async () => {
    const job = await execute({ mode: "person", names: ["Ravi Shah"], emailDomains: ["gmail.com"], limit: 10 });
    expect(job).toMatchObject({ status: "failed", stage: "failed" });
    expect(job.error).toMatch(/Personal email-domain filtering is disabled/);
  });
});

describe("provenance, deduplication, tags, retention and organization isolation", () => {
  it("merges only a confident same-provider identifier and appends the second source trace", async () => {
    vi.stubGlobal("fetch", vi.fn(async (request: URL | string) => {
      const url = String(request);
      if (url.includes("textsearch")) return googlePayload([{ place_id: "same-place", name: "Same Business", types: ["store"] }]);
      return new Response(JSON.stringify({ status: "OK", result: {} }), { status: 200 });
    }));

    const first = await execute({ mode: "business", keywords: ["first query"], limit: 10 });
    const second = await execute({ mode: "business", keywords: ["second query"], limit: 10 });
    expect(first.created).toBe(1);
    expect(second).toMatchObject({ created: 0, duplicates: 1 });
    const history = await AdvancedLeadDiscoveryService.jobHistory(ORG_A, 10);
    expect(history).toMatchObject({ returned: 2 });
    expect(history.jobs.map((item) => item.id)).toEqual([second.id, first.id]);
    const listed = await AdvancedLeadDiscoveryService.list(ORG_A, { limit: 10 });
    expect(listed.total).toBe(1);
    expect(listed.leads[0]!.sourceTrace).toHaveLength(2);

    await AdvancedLeadDiscoveryService.setTags(ORG_A, listed.leads[0]!.id, { tags: ["Q4", "logistics"] }, ACTOR);
    expect((await AdvancedLeadDiscoveryService.list(ORG_A, { tag: "q4", limit: 10 })).total).toBe(1);
    await expect(AdvancedLeadDiscoveryService.get(ORG_B, listed.leads[0]!.id)).rejects.toMatchObject({ status: 404 });
  });

  it("prunes expired advanced records and removes their existing-list membership", async () => {
    const id = "lead-expired-record";
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await kv.set(`leads85:${ORG_A}:lead:${id}`, JSON.stringify({ id, name: "Historical Provider Record", source: "apollo", sourceId: "old-provider-id", discoveredAt: old, verificationStatus: "source_returned", query: "old", email: undefined }));
    await kv.lpush(`leads85:${ORG_A}:leads`, id);
    await kv.set(`leads85:${ORG_A}:collection:collection-old`, JSON.stringify({ id: "collection-old", leadIds: [id], updatedAt: old }));
    await kv.lpush(`leads85:${ORG_A}:collections`, "collection-old");
    await AdvancedLeadDiscoveryService.updatePolicy({ retentionDays: 1 }, ACTOR);

    expect((await AdvancedLeadDiscoveryService.list(ORG_A, { limit: 10 })).total).toBe(0);
    await expect(AdvancedLeadDiscoveryService.get(ORG_A, id)).rejects.toMatchObject({ status: 404 });
    expect(await kv.get(`leads85:${ORG_A}:lead:${id}`)).toBeNull();
    expect(JSON.parse((await kv.get(`leads85:${ORG_A}:collection:collection-old`))!).leadIds).toEqual([]);
  });
});

describe("verification, handoff, metering and error honesty", () => {
  it("reports credential presence without claiming any provider is operational", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.LEAD_APOLLO_API_KEY;
    delete process.env.LEAD_NEVERBOUNCE_API_KEY;
    const status = await AdvancedLeadDiscoveryService.adminStatus();
    expect(status.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "apollo", configured: false, operational: false, credentialSource: "none" }),
      expect.objectContaining({ provider: "google_places", configured: false, operational: false, credentialSource: "none" }),
      expect.objectContaining({ provider: "neverbounce", configured: false, operational: false, credentialSource: "none" }),
    ]));
    expect(status.note).toMatch(/not that it was successfully tested/);
  });

  async function seedEmailLead() {
    const id = "lead-provider-email";
    await kv.set(`leads85:${ORG_A}:lead:${id}`, JSON.stringify({ id, name: "Provider-returned contact", source: "apollo", sourceId: "provider-email-1", discoveredAt: new Date().toISOString(), verificationStatus: "source_returned", query: "fixture", email: "contact@provider.example" }));
    await kv.lpush(`leads85:${ORG_A}:leads`, id);
    return id;
  }

  it("maps an authorized NeverBounce valid result to Verified and creates evidence", async () => {
    const id = await seedEmailLead();
    vi.stubGlobal("fetch", vi.fn(async (request: URL | string) => {
      expect(new URL(String(request)).pathname).toBe("/v4/single/check");
      return new Response(JSON.stringify({ result: "valid" }), { status: 200 });
    }));

    const lead = await AdvancedLeadDiscoveryService.verifyEmail(ORG_A, id, ACTOR);
    expect(lead.verification).toMatchObject({ status: "verified", emailStatus: "verified", provider: "neverbounce", method: "NeverBounce Single Check" });
    expect(lead.lastVerifiedDate).toEqual(expect.any(String));
    expect(spies.usage).toHaveBeenCalledWith(ORG_A, expect.objectContaining({ feature: "lead_discovery.verifications", quantity: 1 }), ACTOR);
  });

  it("does not upgrade an unknown verification response and never sends outreach", async () => {
    const id = await seedEmailLead();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: "unknown" }), { status: 200 })));
    const lead = await AdvancedLeadDiscoveryService.verifyEmail(ORG_A, id, ACTOR);
    expect(lead.verificationStatus).toBe("unverified");

    const review = await AdvancedLeadDiscoveryService.recommendations(ORG_A, [id], ACTOR);
    expect(review.recommendations[0]).toMatchObject({ leadId: id, source: "heuristic", classification: { provider: "apollo" }, qualityRecommendation: { missingFields: expect.arrayContaining(["Job title"]) } });
    expect(review.note).toMatch(/do not infer missing contact details/);

    const handoff = await AdvancedLeadDiscoveryService.prepareOutreach(ORG_A, [id], ACTOR);
    expect(handoff).toMatchObject({ selected: 1, emailEligibleLeadIds: [id], destination: "/app/email-intel", requiresExplicitSend: true });
    expect(handoff.note).toMatch(/sends nothing/);
    await AdvancedLeadDiscoveryService.recordExport(ORG_A, ACTOR, 1);
    expect(spies.usage).toHaveBeenCalledWith(ORG_A, expect.objectContaining({ feature: "lead_discovery.exports", quantity: 1 }), ACTOR);
    expect(spies.audit).toHaveBeenCalled();
  });

  it("records a truthful failed job when an authorized provider is missing", async () => {
    delete process.env.LEAD_APOLLO_API_KEY;
    const job = await execute({ mode: "apollo", industry: "technology", limit: 10 });
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/Apollo Mode requires an Apollo API key/);
    expect(await AdvancedLeadDiscoveryService.resultLeads(ORG_A, job.id)).toEqual([]);
  });
});
