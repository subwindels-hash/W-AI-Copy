/**
 * Advanced Lead Discovery is an additive layer over Session 85's Redis lead
 * store (`leads85:<organization>:*`). It deliberately does not create a second
 * lead database: legacy Google Places records, collections, pipeline state and
 * exports continue to address the same lead ids.
 *
 * Provider adapters only persist fields actually returned by an authorized
 * provider. No URL, email, phone, identity, verification result, or source is
 * inferred. Paid/credentialed providers fail closed and jobs expose the exact
 * configuration error instead of manufacturing results.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { KernelService } from "../kernel/kernel.service.js";
import { aiRegistry } from "../services/ai/registry.js";
import { auditService } from "../audit/audit.service.js";
import { UsageEventsService } from "../usage/usageEvents.service.js";
import { SitePlatformService } from "../sitePlatform/sitePlatform.service.js";
import { resolvePlatformApi } from "../sitePlatform/platformApis.runtime.js";
import { LeadPipelineService } from "./leadPipeline.service.js";
import {
  AdvancedLeadListQuerySchema,
  LeadAdvancedSearchSchema,
  LeadDiscoveryPolicySchema,
  LEAD_PRIVACY_NOTE,
  LEAD_QUALITY_NOTE,
  LEAD_VERIFICATION_NOTE,
  type AdvancedLead,
  type AdvancedLeadList,
  type AdvancedLeadListQuery,
  type LeadAdvancedSearchInput,
  type LeadAgentInterpretation,
  type LeadAgentLeadRecommendation,
  type LeadAgentRecommendationResult,
  type LeadDiscoveryAdminStatus,
  type LeadDiscoveryJob,
  type LeadDiscoveryJobHistory,
  type LeadDiscoveryMode,
  type LeadDiscoveryPolicy,
  type LeadDiscoveryProvider,
  type LeadEmailStatus,
  type LeadOutreachHandoff,
  type LeadProviderStatus,
  type LeadSourceTrace,
  type LeadTagUpdateInput,
  type LeadVerification,
  type LeadVerificationStatus,
} from "@windels/shared/leadDiscoveryAdvanced";
import type { Lead, LeadPipelineRecord } from "@windels/shared/leadDiscovery";

const LEAD_RETENTION_LIMIT = 10_000;
const JOB_LIMIT = 250;
const DEFAULT_POLICY: LeadDiscoveryPolicy = {
  enabled: true,
  verificationEnabled: true,
  exportEnabled: true,
  // Personal email-domain filtering is disabled by default so an administrator
  // consciously enables it after reviewing the organization's legal basis.
  allowPersonalEmailDomainFiltering: false,
  maxResultsPerSearch: 50,
  retentionDays: 365,
};

const K85 = {
  leads: (org: string) => `leads85:${org}:leads`,
  lead: (org: string, id: string) => `leads85:${org}:lead:${id}`,
  collections: (org: string) => `leads85:${org}:collections`,
  collection: (org: string, id: string) => `leads85:${org}:collection:${id}`,
};
const K = {
  job: (org: string, id: string) => `lead:advanced:job:${org}:${id}`,
  jobs: (org: string) => `lead:advanced:jobs:${org}`,
  verification: (org: string, id: string) => `lead:advanced:verification:${org}:${id}`,
  meta: (org: string, id: string) => `lead:advanced:meta:${org}:${id}`,
  policy: "lead:advanced:policy",
};

interface LeadMeta { organizationId: string; tags: string[]; updatedAt: string; }
interface StoredVerification extends LeadVerification { organizationId: string; leadId: string; }
interface Candidate {
  name: string;
  jobTitle?: string;
  company?: string;
  industry?: string;
  country?: string;
  stateRegion?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  professionalProfileUrl?: string;
  category?: string;
  source: LeadDiscoveryProvider;
  sourceId: string;
  trace: LeadSourceTrace;
}
interface ProviderSearch { candidates: Candidate[]; limitations: string[]; }

const now = () => new Date().toISOString();
const json = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};
const clean = (value: unknown, max = 500): string | undefined => {
  if (typeof value !== "string") return undefined;
  const output = value.trim();
  return output && output.length <= max ? output : undefined;
};
const safeUrl = (value: unknown): string | undefined => {
  const text = clean(value, 1000);
  if (!text) return undefined;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch { return undefined; }
};
const canonical = (value: string | undefined) => value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
const canonicalPhone = (value: string | undefined) => value?.replace(/[^\d+]/g, "") ?? "";
const canonicalUrl = (value: string | undefined) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch { return ""; }
};

async function scan(org: string): Promise<Lead[]> {
  const ids = await redis.lrange(K85.leads(org), 0, LEAD_RETENTION_LIMIT - 1);
  const out: Lead[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const lead = json<Lead>(await redis.get(K85.lead(org, id)));
    if (lead) out.push(lead);
  }
  return out;
}

function sourceTrace(lead: Lead): LeadSourceTrace[] {
  if (lead.sourceTrace?.length) return lead.sourceTrace;
  return [{
    provider: lead.source,
    providerRecordId: lead.sourceId,
    sourceUrl: null,
    discoveryMethod: lead.source === "apollo" ? "apollo_people_api_search" : "google_places_textsearch",
    searchMode: lead.source === "apollo" ? "apollo" : "legacy",
    searchQuery: lead.query,
    discoveredAt: lead.discoveredAt,
  }];
}

async function readMeta(org: string, leadId: string): Promise<LeadMeta> {
  const stored = json<LeadMeta>(await redis.get(K.meta(org, leadId)));
  return stored?.organizationId === org ? stored : { organizationId: org, tags: [], updatedAt: "" };
}
async function writeMeta(org: string, leadId: string, tags: string[]): Promise<LeadMeta> {
  const record: LeadMeta = { organizationId: org, tags: [...new Set(tags)], updatedAt: now() };
  await redis.set(K.meta(org, leadId), JSON.stringify(record));
  return record;
}
function defaultVerification(lead: Lead): LeadVerification {
  return {
    status: "unverified",
    emailStatus: lead.email ? "unverified" : "not_available",
    method: null,
    provider: null,
    verifiedAt: null,
    detail: null,
  };
}
async function readVerification(org: string, lead: Lead): Promise<LeadVerification> {
  const record = json<StoredVerification>(await redis.get(K.verification(org, lead.id)));
  return record?.organizationId === org && record.leadId === lead.id ? {
    status: record.status, emailStatus: record.emailStatus, method: record.method,
    provider: record.provider, verifiedAt: record.verifiedAt, detail: record.detail,
  } : defaultVerification(lead);
}
async function readPipeline(org: string, leadId: string): Promise<LeadPipelineRecord> {
  // The existing pipeline service materialises an honest default for untouched
  // leads and already enforces organization scope.
  return (await LeadPipelineService.getLead(org, leadId)).pipeline;
}

const qualityWeights: Array<[string, keyof Pick<AdvancedLead, "name" | "company" | "jobTitle" | "email" | "phone" | "companyWebsite" | "country">, number]> = [
  ["Name", "name", 10], ["Company", "company", 15], ["Job title", "jobTitle", 10],
  ["Corporate/public email", "email", 20], ["Phone", "phone", 15], ["Website", "companyWebsite", 10], ["Location", "country", 10],
];
function quality(lead: Pick<AdvancedLead, "name" | "company" | "jobTitle" | "email" | "phone" | "companyWebsite" | "country" | "sourceTrace">) {
  const factors = qualityWeights.map(([field, key, weight]) => ({ field, present: Boolean(lead[key]), weight }));
  const trace = { field: "Source traceability", present: lead.sourceTrace.length > 0, weight: 10 };
  factors.push(trace);
  return { score: factors.reduce((sum, item) => sum + (item.present ? item.weight : 0), 0), factors };
}

async function expand(org: string, lead: Lead): Promise<AdvancedLead> {
  const [verification, meta, pipeline] = await Promise.all([readVerification(org, lead), readMeta(org, lead.id), readPipeline(org, lead.id)]);
  const view: Omit<AdvancedLead, "qualityScore" | "qualityFactors"> = {
    id: lead.id,
    name: lead.name,
    jobTitle: lead.jobTitle ?? null,
    company: lead.company ?? null,
    industry: lead.industry ?? lead.category ?? null,
    country: lead.country ?? null,
    stateRegion: lead.stateRegion ?? null,
    city: lead.city ?? null,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    emailStatus: verification.emailStatus,
    companyWebsite: lead.website ?? null,
    professionalProfileUrl: lead.professionalProfileUrl ?? null,
    source: lead.source,
    sourceId: lead.sourceId,
    sourceTrace: sourceTrace(lead),
    verification,
    verificationStatus: verification.status,
    discoveryDate: lead.discoveredAt,
    lastVerifiedDate: verification.verifiedAt,
    tags: meta.tags,
    pipelineStatus: pipeline.status,
  };
  const assessment = quality(view);
  return { ...view, qualityScore: assessment.score, qualityFactors: assessment.factors };
}

function comparable(lead: Lead, candidate: Candidate): boolean {
  // A provider's own id is definitive within a provider.
  if (lead.source === candidate.source && lead.sourceId === candidate.sourceId) return true;
  if (lead.email && candidate.email && canonical(lead.email) === canonical(candidate.email)) return true;
  if (lead.professionalProfileUrl && candidate.professionalProfileUrl && canonicalUrl(lead.professionalProfileUrl) === canonicalUrl(candidate.professionalProfileUrl)) return true;
  if (lead.phone && candidate.phone && canonicalPhone(lead.phone) === canonicalPhone(candidate.phone)) return true;
  // Name + company is only used when both identifiers are present exactly; no
  // loose company-name-only matching that could merge separate people.
  return Boolean(lead.company && candidate.company && canonical(lead.name) === canonical(candidate.name) && canonical(lead.company) === canonical(candidate.company));
}
function mergeString(first?: string, second?: string): string | undefined { return first ?? second; }

async function persist(org: string, candidate: Candidate): Promise<{ lead: Lead; created: boolean }> {
  const current = await scan(org);
  const existing = current.find((lead) => comparable(lead, candidate));
  if (existing) {
    const traces = sourceTrace(existing);
    const alreadyTraced = traces.some((item) => item.provider === candidate.trace.provider && item.providerRecordId === candidate.trace.providerRecordId && item.searchQuery === candidate.trace.searchQuery);
    const merged: Lead = {
      ...existing,
      jobTitle: mergeString(existing.jobTitle, candidate.jobTitle),
      company: mergeString(existing.company, candidate.company),
      industry: mergeString(existing.industry, candidate.industry),
      country: mergeString(existing.country, candidate.country),
      stateRegion: mergeString(existing.stateRegion, candidate.stateRegion),
      city: mergeString(existing.city, candidate.city),
      phone: mergeString(existing.phone, candidate.phone),
      email: mergeString(existing.email, candidate.email),
      website: mergeString(existing.website, candidate.website),
      professionalProfileUrl: mergeString(existing.professionalProfileUrl, candidate.professionalProfileUrl),
      category: mergeString(existing.category, candidate.category),
      sourceTrace: alreadyTraced ? traces : [...traces, candidate.trace],
    };
    await redis.set(K85.lead(org, existing.id), JSON.stringify(merged));
    return { lead: merged, created: false };
  }

  const lead: Lead = {
    id: `lead-${randomUUID()}`,
    name: candidate.name,
    category: candidate.category,
    address: undefined,
    phone: candidate.phone,
    website: candidate.website,
    source: candidate.source,
    sourceId: candidate.sourceId,
    discoveredAt: candidate.trace.discoveredAt,
    verificationStatus: "source_returned",
    query: candidate.trace.searchQuery,
    jobTitle: candidate.jobTitle,
    company: candidate.company,
    industry: candidate.industry,
    country: candidate.country,
    stateRegion: candidate.stateRegion,
    city: candidate.city,
    email: candidate.email,
    emailStatus: candidate.email ? "unverified" : "not_available",
    professionalProfileUrl: candidate.professionalProfileUrl,
    sourceTrace: [candidate.trace],
  };
  await redis.set(K85.lead(org, lead.id), JSON.stringify(lead));
  await redis.lpush(K85.leads(org), lead.id);
  await redis.ltrim(K85.leads(org), 0, LEAD_RETENTION_LIMIT - 1);
  return { lead, created: true };
}

function terms(input: LeadAdvancedSearchInput): string[] {
  return [input.city, input.stateRegion, input.region, input.postalCode, input.country].filter((item): item is string => Boolean(item));
}
function googleQuery(input: LeadAdvancedSearchInput): string {
  const core = [input.keywords.join(" "), input.businessType, input.industry, input.company].filter(Boolean).join(" ").trim();
  return [core, terms(input).join(", ")].filter(Boolean).join(" in ").trim();
}
function addArray(url: URL, key: string, values: string[]) { for (const value of values) url.searchParams.append(key, value); }
function apolloBase(): string { return "https://api.apollo.io"; }

async function providerCredential(slot: "apollo" | "google-places-lead-discovery" | "neverbounce", envKey: string, defaultBase: string) {
  // Persisted super-admin settings are encrypted by SitePlatformService. Hydrate
  // after process restart before asking the in-memory resolver for the secret.
  await SitePlatformService.hydrateApiOverlay();
  return resolvePlatformApi(slot, envKey, defaultBase);
}

function apolloCandidate(person: Record<string, any>, input: LeadAdvancedSearchInput, at: string): Candidate | null {
  const id = clean(person.id ?? person.person_id, 200);
  const name = clean(person.name) ?? ([clean(person.first_name), clean(person.last_name)].filter(Boolean).join(" ") || undefined);
  if (!id || !name) return null;
  const org = (person.organization && typeof person.organization === "object" ? person.organization : {}) as Record<string, any>;
  const profile = safeUrl(person.linkedin_url ?? person.linkedin);
  const website = safeUrl(org.website_url ?? person.organization_website_url ?? person.website_url);
  return {
    name,
    jobTitle: clean(person.title ?? person.job_title),
    company: clean(org.name ?? person.organization_name),
    industry: clean(org.industry ?? person.industry),
    country: clean(person.country ?? org.country),
    stateRegion: clean(person.state ?? org.state),
    city: clean(person.city ?? org.city),
    phone: clean(person.phone ?? person.phone_number),
    email: clean(person.email),
    website,
    professionalProfileUrl: profile,
    source: "apollo",
    sourceId: id,
    trace: {
      provider: "apollo", providerRecordId: id, sourceUrl: profile ?? null,
      discoveryMethod: "apollo_people_api_search", searchMode: input.mode,
      searchQuery: JSON.stringify(input), discoveredAt: at,
    },
  };
}
async function searchApolloPeople(input: LeadAdvancedSearchInput): Promise<ProviderSearch> {
  const cfg = await providerCredential("apollo", "LEAD_APOLLO_API_KEY", apolloBase());
  if (!cfg.configured || !cfg.apiKey) throw new AppError("SERVICE_UNAVAILABLE", "Apollo Mode requires an Apollo API key with People API Search scope. Configure LEAD_APOLLO_API_KEY or Super Admin → Site & platform control → APIs → Apollo Lead Intelligence.", 503);
  const url = new URL("/api/v1/mixed_people/api_search", cfg.baseUrl ?? apolloBase());
  addArray(url, "person_titles[]", input.jobTitles);
  addArray(url, "person_locations[]", terms(input));
  addArray(url, "organization_num_employees_ranges[]", input.companySizeRanges);
  if (input.company) url.searchParams.set("q_organization_name", input.company);
  const keywords = [input.industry, input.businessType, ...input.keywords, ...input.names].filter(Boolean).join(" ");
  if (keywords) url.searchParams.set("q_keywords", keywords);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(input.limit));
  const response = await fetch(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "x-api-key": cfg.apiKey }, body: "{}", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw AppError.upstream(`Apollo People API Search failed (HTTP ${response.status}).`);
  const payload = await response.json() as Record<string, unknown>;
  const people = Array.isArray(payload.people) ? payload.people : [];
  const at = now();
  const candidates = people.map((item) => apolloCandidate(item as Record<string, any>, input, at)).filter((item): item is Candidate => item !== null);
  const limitations = ["Apollo People API Search returns only the fields its authorized response includes. It does not reveal email addresses or phone numbers by default; absent values are left unknown."];
  return { candidates, limitations };
}

function addressPart(components: unknown, type: string): string | undefined {
  if (!Array.isArray(components)) return undefined;
  const part = components.find((item: any) => Array.isArray(item?.types) && item.types.includes(type));
  return clean(part?.long_name, 160);
}
async function searchGoogle(input: LeadAdvancedSearchInput): Promise<ProviderSearch> {
  const cfg = await providerCredential("google-places-lead-discovery", "GOOGLE_PLACES_API_KEY", "https://maps.googleapis.com");
  if (!cfg.configured || !cfg.apiKey) throw new AppError("SERVICE_UNAVAILABLE", "Business Mode requires GOOGLE_PLACES_API_KEY (or the encrypted Google Places Lead Discovery credential in Super Admin controls).", 503);
  const query = googleQuery(input);
  if (!query) throw AppError.validation("Business Mode needs a business keyword or location criterion.");
  const url = new URL("/maps/api/place/textsearch/json", cfg.baseUrl ?? "https://maps.googleapis.com");
  url.searchParams.set("query", query);
  url.searchParams.set("key", cfg.apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw AppError.upstream(`Google Places text search failed (HTTP ${response.status}).`);
  const payload = await response.json() as Record<string, any>;
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") throw AppError.upstream(`Google Places: ${payload.status}`);
  const raw = Array.isArray(payload.results) ? payload.results.slice(0, input.limit) : [];
  const limitations: string[] = [];
  const candidates: Candidate[] = [];
  for (const item of raw) {
    const id = clean(item?.place_id, 200);
    const name = clean(item?.name);
    if (!id || !name) continue;
    // Place Details is an authorized Google endpoint. When a detail lookup is
    // unavailable, preserve text-search output rather than synthesizing fields.
    let detail: Record<string, any> = {};
    try {
      const detailUrl = new URL("/maps/api/place/details/json", cfg.baseUrl ?? "https://maps.googleapis.com");
      detailUrl.searchParams.set("place_id", id);
      detailUrl.searchParams.set("fields", "formatted_phone_number,website,url,address_component,types");
      detailUrl.searchParams.set("key", cfg.apiKey);
      const detailResponse = await fetch(detailUrl, { signal: AbortSignal.timeout(10_000) });
      const detailPayload = await detailResponse.json() as Record<string, any>;
      if (detailResponse.ok && detailPayload.status === "OK" && detailPayload.result) detail = detailPayload.result;
      else limitations.push(`Google Place Details was unavailable for one or more results; only text-search fields were retained.`);
    } catch { limitations.push(`Google Place Details was unavailable for one or more results; only text-search fields were retained.`); }
    const at = now();
    candidates.push({
      name,
      company: name,
      industry: clean(item?.types?.[0]),
      category: clean(detail.types?.[0] ?? item?.types?.[0]),
      country: addressPart(detail.address_components, "country"),
      stateRegion: addressPart(detail.address_components, "administrative_area_level_1"),
      city: addressPart(detail.address_components, "locality"),
      phone: clean(detail.formatted_phone_number),
      website: safeUrl(detail.website),
      source: "google_places",
      sourceId: id,
      trace: {
        provider: "google_places", providerRecordId: id, sourceUrl: safeUrl(detail.url) ?? null,
        discoveryMethod: "google_places_textsearch", searchMode: "business", searchQuery: query, discoveredAt: at,
      },
    });
  }
  return { candidates, limitations: [...new Set(limitations)] };
}

function passesFilters(candidate: Candidate, input: LeadAdvancedSearchInput): boolean {
  const contact = input.contactAvailability;
  if (contact === "email" && !candidate.email) return false;
  if (contact === "phone" && !candidate.phone) return false;
  if (contact === "email_or_phone" && !candidate.email && !candidate.phone) return false;
  if (input.emailDomains.length) {
    if (!candidate.email) return false;
    const domain = candidate.email.split("@")[1]?.toLowerCase();
    if (!domain || !input.emailDomains.includes(domain as any)) return false;
  }
  return true;
}

async function loadPolicy(): Promise<LeadDiscoveryPolicy> {
  const stored = json<LeadDiscoveryPolicy>(await redis.get(K.policy));
  return { ...DEFAULT_POLICY, ...(stored ?? {}) };
}

async function pruneExpired(org: string, retentionDays: number): Promise<void> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  // Jobs contain the requested criteria and therefore follow the same tenant
  // retention period as results; stale jobs are not retained as a shadow search
  // history after their lead data has expired.
  const jobIds = await redis.lrange(K.jobs(org), 0, JOB_LIMIT - 1);
  for (const jobId of jobIds) {
    const job = json<LeadDiscoveryJob>(await redis.get(K.job(org, jobId)));
    const createdAt = job ? Date.parse(job.createdAt) : NaN;
    if (!job || job.organizationId !== org || !Number.isFinite(createdAt) || createdAt < cutoff) {
      await redis.del(K.job(org, jobId));
      await redis.lrem(K.jobs(org), 0, jobId);
    }
  }
  const leads = await scan(org);
  for (const lead of leads) {
    const discovered = Date.parse(lead.discoveredAt);
    if (!Number.isFinite(discovered) || discovered >= cutoff) continue;
    await redis.del(K85.lead(org, lead.id), K.meta(org, lead.id), K.verification(org, lead.id));
    await redis.lrem(K85.leads(org), 0, lead.id);
    // A list may contain the lead, so remove only its membership and preserve
    // the list and all other leads.
    const collectionIds = await redis.lrange(K85.collections(org), 0, LEAD_RETENTION_LIMIT - 1);
    for (const collectionId of collectionIds) {
      const collection = json<{ leadIds?: string[] }>(await redis.get(K85.collection(org, collectionId)));
      if (!collection?.leadIds?.includes(lead.id)) continue;
      await redis.set(K85.collection(org, collectionId), JSON.stringify({ ...collection, leadIds: collection.leadIds.filter((id) => id !== lead.id), updatedAt: now() }));
    }
  }
}

async function enforceRetention(org: string): Promise<LeadDiscoveryPolicy> {
  const policy = await loadPolicy();
  await pruneExpired(org, policy.retentionDays);
  return policy;
}

function jobMessage(stage: LeadDiscoveryJob["stage"]): string {
  return ({ queued: "Queued for provider discovery.", provider_search: "Searching authorized provider data.", normalization: "Normalizing provider-returned fields.", deduplication: "Checking existing lead records for confident duplicates.", completed: "Discovery completed.", failed: "Discovery failed." })[stage];
}
async function updateJob(org: string, job: LeadDiscoveryJob, patch: Partial<LeadDiscoveryJob>): Promise<LeadDiscoveryJob> {
  const next: LeadDiscoveryJob = { ...job, ...patch };
  await redis.set(K.job(org, job.id), JSON.stringify(next));
  return next;
}

async function audit(org: string, actor: string | null, action: "data.create" | "data.update" | "data.delete" | "data.export", resourceId: string, metadata: Record<string, unknown>) {
  await auditService.log({ organizationId: org, userId: actor ?? undefined, action, resourceType: "custom", resourceId, metadata: { module: "lead_discovery", ...metadata } });
}
async function meter(org: string, actor: string | null, feature: string, quantity: number, unit: string, meta: Record<string, unknown>) {
  await UsageEventsService.record(org, { feature, actor: actor ?? "system", quantity, unit, meta }, actor ?? undefined);
}

async function completeJob(org: string, job: LeadDiscoveryJob): Promise<LeadDiscoveryJob> {
  const policy = await loadPolicy();
  if (!policy.enabled) throw AppError.forbidden("Lead Discovery is disabled by Super Admin policy.");
  await pruneExpired(org, policy.retentionDays);
  job = await updateJob(org, job, { status: "running", progress: 10, stage: "provider_search", message: jobMessage("provider_search"), startedAt: now() });
  const input = { ...job.input, limit: Math.min(job.input.limit, policy.maxResultsPerSearch) };
  if (input.emailDomains.length && !policy.allowPersonalEmailDomainFiltering) {
    throw AppError.forbidden("Personal email-domain filtering is disabled by Super Admin compliance policy.");
  }
  const provider = input.mode === "business" ? searchGoogle(input) : searchApolloPeople(input);
  const result = await provider;
  job = await updateJob(org, job, { progress: 50, stage: "normalization", message: jobMessage("normalization"), discovered: result.candidates.length, limitations: result.limitations });
  const allowed = result.candidates.filter((candidate) => passesFilters(candidate, input));
  job = await updateJob(org, job, { progress: 70, stage: "deduplication", message: jobMessage("deduplication"), filteredOut: result.candidates.length - allowed.length });
  let created = 0;
  let duplicates = 0;
  const resultLeadIds: string[] = [];
  for (const candidate of allowed) {
    const saved = await persist(org, candidate);
    if (saved.created) created++; else duplicates++;
    if (!resultLeadIds.includes(saved.lead.id)) resultLeadIds.push(saved.lead.id);
  }
  const finished = await updateJob(org, job, {
    status: "completed", progress: 100, stage: "completed", message: jobMessage("completed"), created, duplicates, resultLeadIds, completedAt: now(),
  });
  await Promise.allSettled([
    meter(org, job.requestedById, "lead_discovery.searches", 1, "search", { mode: input.mode, provider: input.mode === "business" ? "google_places" : "apollo", discovered: result.candidates.length, created, duplicates }),
    meter(org, job.requestedById, "lead_discovery.leads_discovered", created, "lead", { mode: input.mode }),
    audit(org, job.requestedById, "data.create", job.id, { event: "lead_discovery.search.completed", mode: input.mode, discovered: result.candidates.length, created, duplicates }),
    KernelService.dispatch({ kind: "lead-discovery.search.completed", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, jobId: job.id, mode: input.mode, created, duplicates } }),
  ]);
  return finished;
}

// A job is normally started only by the queued microtask. Keeping a local
// in-flight promise also makes a repeated poll/retry in the same worker
// idempotent, so two concurrent invocations cannot both insert a lead before
// either sees the other record. The persisted job remains the cross-restart
// source of truth; a restart simply resumes a non-terminal job once.
const inFlightJobs = new Map<string, Promise<LeadDiscoveryJob>>();
async function runJobInternal(org: string, jobId: string): Promise<LeadDiscoveryJob> {
  const job = json<LeadDiscoveryJob>(await redis.get(K.job(org, jobId)));
  if (!job || job.organizationId !== org) throw AppError.notFound("Lead discovery job not found in this organization.");
  if (job.status === "completed" || job.status === "failed") return job;
  try { return await completeJob(org, job); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Lead discovery failed.";
    const failed = await updateJob(org, job, { status: "failed", progress: 100, stage: "failed", message: jobMessage("failed"), error: message, completedAt: now() });
    await Promise.allSettled([
      audit(org, job.requestedById, "data.update", job.id, { event: "lead_discovery.search.failed", mode: job.input.mode, error: message }),
      KernelService.dispatch({ kind: "lead-discovery.search.failed", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, jobId, mode: job.input.mode } }),
    ]);
    return failed;
  }
}

async function getRawLead(org: string, id: string): Promise<Lead> {
  const lead = json<Lead>(await redis.get(K85.lead(org, id)));
  if (!lead) throw AppError.notFound("Lead not found in this organization.");
  return lead;
}

function heuristicInterpretation(request: string): LeadAgentInterpretation {
  const lower = request.toLowerCase();
  const industries = ["logistics", "supply chain", "banking", "insurance", "healthcare", "technology", "real estate", "construction", "manufacturing", "education", "professional services", "architecture", "software", "import/export"];
  const industry = industries.find((value) => lower.includes(value));
  const titles = ["ceo", "founder", "director", "head", "manager", "vp", "vice president", "decision maker"];
  const jobTitle = titles.find((value) => lower.includes(value));
  const place = request.match(/\b(?:in|at|near)\s+([A-Z][\p{L}\s,'-]{1,80})(?:[.?!]|$)/u)?.[1]?.trim();
  const criteria: Partial<LeadAdvancedSearchInput> = {
    mode: /\b(person|people|individual|contact)s?\b/i.test(request) ? "person" : jobTitle || /decision.?maker/i.test(request) ? "apollo" : "business",
    ...(industry ? { industry } : {}),
    ...(jobTitle && jobTitle !== "decision maker" ? { jobTitles: [jobTitle] } : {}),
    ...(place ? { city: place } : {}),
    keywords: industry ? [industry] : [],
  };
  const recommendations = [
    !criteria.country && criteria.city ? "Add a country to disambiguate the city." : "Add a city or region to narrow results.",
    !criteria.jobTitles && criteria.mode === "apollo" ? "Add a decision-maker title such as CEO, Director, or Head." : "Review returned source fields before filtering on contact availability.",
  ];
  return { source: "heuristic", criteria, recommendations, limitations: ["No real AI provider is configured, so this is deterministic request parsing rather than an AI-agent interpretation."] };
}

const normalizedFieldLabels: Array<[keyof Pick<AdvancedLead, "name" | "jobTitle" | "company" | "industry" | "country" | "stateRegion" | "city" | "phone" | "email" | "companyWebsite" | "professionalProfileUrl">, string]> = [
  ["name", "Name"], ["jobTitle", "Job title"], ["company", "Company"], ["industry", "Industry"],
  ["country", "Country"], ["stateRegion", "State / region"], ["city", "City"], ["phone", "Phone"],
  ["email", "Email"], ["companyWebsite", "Website"], ["professionalProfileUrl", "Professional profile"],
];
function storedCandidate(lead: Lead): Candidate {
  return {
    name: lead.name, jobTitle: lead.jobTitle, company: lead.company, industry: lead.industry,
    country: lead.country, stateRegion: lead.stateRegion, city: lead.city, phone: lead.phone,
    email: lead.email, website: lead.website, professionalProfileUrl: lead.professionalProfileUrl,
    category: lead.category, source: lead.source, sourceId: lead.sourceId, trace: sourceTrace(lead)[0]!,
  };
}
async function recommendForLead(org: string, leadId: string, allRaw: Lead[]): Promise<LeadAgentLeadRecommendation> {
  const raw = await getRawLead(org, leadId);
  const lead = await expand(org, raw);
  const normalizedFields = normalizedFieldLabels.filter(([key]) => Boolean(lead[key])).map(([, label]) => label);
  const missingFields = normalizedFieldLabels.filter(([key]) => !lead[key]).map(([, label]) => label);
  const matches = allRaw.filter((other) => other.id !== raw.id && comparable(other, storedCandidate(raw))).map((other) => other.id);
  const suggestedTags = [lead.industry, [lead.city, lead.country].filter(Boolean).join(", ")].filter((value): value is string => Boolean(value));
  const locationLabel = [lead.city, lead.country].filter(Boolean).join(", ");
  return {
    leadId,
    source: "heuristic",
    classification: { provider: lead.source, industry: lead.industry, normalizedFields, suggestedTags },
    duplicateRecommendation: {
      confidentMatchLeadIds: matches,
      note: matches.length ? "Confident identifier matches were found. Review source traces before deciding how to use the records; this review does not delete or merge anything." : "No additional confident identifier match is currently stored in this organization.",
    },
    qualityRecommendation: {
      score: lead.qualityScore,
      missingFields,
      note: missingFields.length ? "Quality is field completeness only. Missing fields should remain unknown unless an authorized source returns them." : "The recorded source fields are complete for this score; quality is not a conversion or consent assessment.",
    },
    verificationRecommendation: lead.email
      ? lead.verificationStatus === "unverified" ? "An email is stored but remains Unverified. An authorized user may explicitly request NeverBounce verification if enabled by policy." : `Email verification is ${lead.verificationStatus.replace(/_/g, " ")}; review its recorded evidence and timestamp before outreach.`
      : "No provider-returned email is stored, so email verification cannot be requested.",
    listRecommendation: `No list was changed. ${lead.industry || locationLabel ? `Consider explicitly saving this lead to a ${[lead.industry, locationLabel].filter(Boolean).join(" · ")} review list after reviewing source and lawful basis.` : "Add a source-backed tag or list only after manual review."}`,
  };
}

export const AdvancedLeadDiscoveryService = {
  async policy(): Promise<LeadDiscoveryPolicy> { return loadPolicy(); },

  async updatePolicy(input: Partial<LeadDiscoveryPolicy>, actorId: string): Promise<LeadDiscoveryPolicy> {
    const previous = await loadPolicy();
    const parsed = LeadDiscoveryPolicySchema.parse(input);
    const next: LeadDiscoveryPolicy = {
      enabled: parsed.enabled ?? previous.enabled,
      verificationEnabled: parsed.verificationEnabled ?? previous.verificationEnabled,
      exportEnabled: parsed.exportEnabled ?? previous.exportEnabled,
      allowPersonalEmailDomainFiltering: parsed.allowPersonalEmailDomainFiltering ?? previous.allowPersonalEmailDomainFiltering,
      maxResultsPerSearch: parsed.maxResultsPerSearch ?? previous.maxResultsPerSearch,
      retentionDays: parsed.retentionDays ?? previous.retentionDays,
    };
    await redis.set(K.policy, JSON.stringify(next));
    await auditService.log({ userId: actorId, action: "system.config_change", resourceType: "custom", resourceId: "lead-discovery-policy", metadata: { module: "lead_discovery", changed: Object.keys(input) } });
    return next;
  },

  async adminStatus(): Promise<LeadDiscoveryAdminStatus> {
    await SitePlatformService.hydrateApiOverlay();
    const apollo = resolvePlatformApi("apollo", "LEAD_APOLLO_API_KEY", apolloBase());
    const google = resolvePlatformApi("google-places-lead-discovery", "GOOGLE_PLACES_API_KEY", "https://maps.googleapis.com");
    const neverbounce = resolvePlatformApi("neverbounce", "LEAD_NEVERBOUNCE_API_KEY", "https://api.neverbounce.com");
    const item = (provider: LeadProviderStatus["provider"], kind: LeadProviderStatus["kind"], cfg: ReturnType<typeof resolvePlatformApi>, requiredConfiguration: string): LeadProviderStatus => ({
      provider, kind, configured: cfg.configured && Boolean(cfg.apiKey), credentialSource: cfg.source === "dashboard" ? "dashboard" : cfg.source === "env" ? "environment" : "none", operational: false, requiredConfiguration,
    });
    return {
      providers: [
        item("apollo", "discovery", apollo, "Apollo API key with the mixed_people_api_search scope."),
        item("google_places", "discovery", google, "Google Places API key with Text Search and Place Details enabled."),
        item("neverbounce", "verification", neverbounce, "NeverBounce API key with Single Check access."),
      ],
      policy: await loadPolicy(),
      note: "Configured means a server-side credential is present, not that it was successfully tested against the live provider. Credentials are encrypted in Super Admin API controls or supplied via server environment secrets; they are never returned by this endpoint.",
    };
  },

  async createSearch(org: string, actorId: string | null, rawInput: unknown): Promise<LeadDiscoveryJob> {
    const policy = await loadPolicy();
    if (!policy.enabled) throw AppError.forbidden("Lead Discovery is disabled by Super Admin policy.");
    const parsed = LeadAdvancedSearchSchema.parse(rawInput);
    const input = { ...parsed, limit: Math.min(parsed.limit, policy.maxResultsPerSearch) };
    const job: LeadDiscoveryJob = {
      id: `leadjob-${randomUUID()}`, organizationId: org, requestedById: actorId, input,
      status: "queued", progress: 0, stage: "queued", message: jobMessage("queued"), discovered: 0, created: 0, duplicates: 0, filteredOut: 0,
      resultLeadIds: [], limitations: [], error: null, createdAt: now(), startedAt: null, completedAt: null,
    };
    await redis.set(K.job(org, job.id), JSON.stringify(job));
    await redis.lpush(K.jobs(org), job.id);
    await redis.ltrim(K.jobs(org), 0, JOB_LIMIT - 1);
    await Promise.allSettled([
      audit(org, actorId, "data.create", job.id, { event: "lead_discovery.search.queued", mode: input.mode }),
      KernelService.dispatch({ kind: "lead-discovery.search.queued", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, jobId: job.id, mode: input.mode } }),
    ]);
    // The response returns immediately. The job survives the request and is
    // available to poll; no UI has to wait on provider network latency.
    queueMicrotask(() => {
      this.runJob(org, job.id).catch(() => {});
    });
    return job;
  },

  async runJob(org: string, jobId: string): Promise<LeadDiscoveryJob> {
    const key = `${org}:${jobId}`;
    const existing = inFlightJobs.get(key);
    if (existing) return existing;
    const execution = runJobInternal(org, jobId);
    inFlightJobs.set(key, execution);
    try { return await execution; }
    finally {
      if (inFlightJobs.get(key) === execution) inFlightJobs.delete(key);
    }
  },

  async job(org: string, jobId: string): Promise<LeadDiscoveryJob> {
    await enforceRetention(org);
    const job = json<LeadDiscoveryJob>(await redis.get(K.job(org, jobId)));
    if (!job || job.organizationId !== org) throw AppError.notFound("Lead discovery job not found in this organization.");
    return job;
  },

  async jobHistory(org: string, limit = 25): Promise<LeadDiscoveryJobHistory> {
    await enforceRetention(org);
    const ids = await redis.lrange(K.jobs(org), 0, Math.min(Math.max(limit, 1), 100) - 1);
    const jobs: LeadDiscoveryJob[] = [];
    for (const id of ids) {
      const job = json<LeadDiscoveryJob>(await redis.get(K.job(org, id)));
      if (job?.organizationId === org) jobs.push(job);
    }
    return { jobs, returned: jobs.length };
  },

  async list(org: string, rawQuery: unknown = {}): Promise<AdvancedLeadList> {
    const query: AdvancedLeadListQuery = AdvancedLeadListQuerySchema.parse(rawQuery);
    await enforceRetention(org);
    let leads = await Promise.all((await scan(org)).map((lead) => expand(org, lead)));
    const needle = query.q?.toLowerCase();
    leads = leads.filter((lead) => {
      if (needle && ![lead.name, lead.company, lead.jobTitle, lead.industry, lead.city, lead.country, lead.email].some((value) => value?.toLowerCase().includes(needle))) return false;
      if (query.industry && lead.industry?.toLowerCase() !== query.industry.toLowerCase()) return false;
      if (query.country && lead.country?.toLowerCase() !== query.country.toLowerCase()) return false;
      if (query.city && lead.city?.toLowerCase() !== query.city.toLowerCase()) return false;
      if (query.verificationStatus && lead.verificationStatus !== query.verificationStatus) return false;
      if (query.tag && !lead.tags.some((tag) => tag.toLowerCase() === query.tag!.toLowerCase())) return false;
      return true;
    });
    if (query.sort === "quality_desc") leads.sort((a, b) => b.qualityScore - a.qualityScore || b.discoveryDate.localeCompare(a.discoveryDate));
    else if (query.sort === "name_asc") leads.sort((a, b) => a.name.localeCompare(b.name));
    else leads.sort((a, b) => b.discoveryDate.localeCompare(a.discoveryDate));
    const page = leads.slice(query.offset, query.offset + query.limit);
    return { leads: page, total: leads.length, returned: page.length, nextOffset: query.offset + page.length < leads.length ? query.offset + page.length : null };
  },

  async get(org: string, leadId: string): Promise<AdvancedLead> {
    await enforceRetention(org);
    return expand(org, await getRawLead(org, leadId));
  },

  async resultLeads(org: string, jobId: string): Promise<AdvancedLead[]> {
    const job = await this.job(org, jobId);
    const rows: AdvancedLead[] = [];
    for (const id of job.resultLeadIds) {
      const raw = json<Lead>(await redis.get(K85.lead(org, id)));
      if (raw) rows.push(await expand(org, raw));
    }
    return rows;
  },

  async setTags(org: string, leadId: string, input: LeadTagUpdateInput, actorId: string | null): Promise<AdvancedLead> {
    await enforceRetention(org);
    await getRawLead(org, leadId);
    await writeMeta(org, leadId, input.tags);
    await Promise.allSettled([audit(org, actorId, "data.update", leadId, { event: "lead_discovery.tags.updated", tags: input.tags })]);
    return this.get(org, leadId);
  },

  async remove(org: string, leadId: string, actorId: string | null): Promise<{ id: string; deleted: true }> {
    await enforceRetention(org);
    await getRawLead(org, leadId);
    await redis.del(K85.lead(org, leadId), K.meta(org, leadId), K.verification(org, leadId));
    await redis.lrem(K85.leads(org), 0, leadId);
    const collectionIds = await redis.lrange(K85.collections(org), 0, LEAD_RETENTION_LIMIT - 1);
    for (const collectionId of collectionIds) {
      const collection = json<{ leadIds?: string[] }>(await redis.get(K85.collection(org, collectionId)));
      if (collection?.leadIds?.includes(leadId)) await redis.set(K85.collection(org, collectionId), JSON.stringify({ ...collection, leadIds: collection.leadIds.filter((id) => id !== leadId), updatedAt: now() }));
    }
    await Promise.allSettled([audit(org, actorId, "data.delete", leadId, { event: "lead_discovery.removed" })]);
    return { id: leadId, deleted: true };
  },

  async verifyEmail(org: string, leadId: string, actorId: string | null): Promise<AdvancedLead> {
    const policy = await enforceRetention(org);
    if (!policy.verificationEnabled) throw AppError.forbidden("Lead verification is disabled by Super Admin policy.");
    const lead = await getRawLead(org, leadId);
    if (!lead.email) throw AppError.validation("This lead has no provider-returned email address to verify.");
    const cfg = await providerCredential("neverbounce", "LEAD_NEVERBOUNCE_API_KEY", "https://api.neverbounce.com");
    if (!cfg.configured || !cfg.apiKey) throw new AppError("SERVICE_UNAVAILABLE", "Email verification requires a NeverBounce API key. Configure LEAD_NEVERBOUNCE_API_KEY or Super Admin → Site & platform control → APIs → NeverBounce Email Verification.", 503);
    const url = new URL("/v4/single/check", cfg.baseUrl ?? "https://api.neverbounce.com");
    url.searchParams.set("key", cfg.apiKey);
    url.searchParams.set("email", lead.email);
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw AppError.upstream(`NeverBounce verification failed (HTTP ${response.status}).`);
    const payload = await response.json() as Record<string, unknown>;
    const outcome = clean(payload.result, 40)?.toLowerCase();
    let status: LeadVerificationStatus = "unverified";
    let emailStatus: LeadEmailStatus = "unverified";
    if (outcome === "valid") { status = "verified"; emailStatus = "verified"; }
    else if (outcome === "catchall") { status = "likely_valid"; emailStatus = "likely_valid"; }
    else if (outcome === "invalid" || outcome === "disposable") { status = "invalid"; emailStatus = "invalid"; }
    const verification: StoredVerification = {
      organizationId: org, leadId, status, emailStatus, method: "NeverBounce Single Check", provider: "neverbounce", verifiedAt: now(),
      detail: outcome ? `NeverBounce returned ${outcome}.` : "NeverBounce returned no recognized result; the address remains unverified.",
    };
    await redis.set(K.verification(org, leadId), JSON.stringify(verification));
    await Promise.allSettled([
      meter(org, actorId, "lead_discovery.verifications", 1, "verification", { provider: "neverbounce", outcome: outcome ?? "unrecognized" }),
      audit(org, actorId, "data.update", leadId, { event: "lead_discovery.email.verified", provider: "neverbounce", outcome: outcome ?? "unrecognized" }),
      KernelService.dispatch({ kind: "lead-discovery.verification.completed", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, leadId, status } }),
    ]);
    return this.get(org, leadId);
  },

  async recordExport(org: string, actorId: string | null, count: number): Promise<void> {
    await Promise.allSettled([
      meter(org, actorId, "lead_discovery.exports", count, "lead", { format: "structured_json" }),
      audit(org, actorId, "data.export", "lead-discovery-export", { event: "lead_discovery.exported", count }),
    ]);
  },

  async prepareOutreach(org: string, leadIds: string[], actorId: string | null): Promise<LeadOutreachHandoff> {
    await enforceRetention(org);
    const unique = [...new Set(leadIds)];
    const eligible: string[] = [];
    const excluded: Array<{ leadId: string; reason: string }> = [];
    for (const id of unique) {
      const lead = await getRawLead(org, id);
      if (!lead.email) excluded.push({ leadId: id, reason: "No provider-returned email address is stored." });
      else eligible.push(id);
    }
    await Promise.allSettled([audit(org, actorId, "data.update", "email-intel-handoff", { event: "lead_discovery.outreach.handoff_prepared", selected: unique.length, eligible: eligible.length })]);
    return {
      selected: unique.length, emailEligibleLeadIds: eligible, excluded, destination: "/app/email-intel", requiresExplicitSend: true,
      note: "This handoff prepares no message and sends nothing. In Email Intelligence, choose a configured mailbox, review lawful basis and consent, compose a message, and explicitly send it.",
    };
  },

  async interpret(org: string, request: string, actorId: string | null): Promise<LeadAgentInterpretation> {
    const fallback = heuristicInterpretation(request);
    if (!aiRegistry.hasRealModelConfigured()) {
      void KernelService.dispatch({ kind: "lead-discovery.agent.interpreted", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, source: "heuristic" } });
      return fallback;
    }
    try {
      const response = await aiRegistry.complete({
        model: "", temperature: 0, maxTokens: 500, responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: "You are the WINDELS Lead Discovery AI Agent. Convert a lawful business lead request into JSON only: {criteria:{mode,industry,jobTitles,company,country,stateRegion,city,region,keywords,names},recommendations:[string],limitations:[string]}. Do not invent names, contact details, companies, source claims, or verification." },
          { role: "user", content: request },
        ],
      }, { organizationId: org, userId: actorId ?? undefined, feature: "lead-discovery-agent" });
      const parsed = JSON.parse(response.content) as Record<string, any>;
      const sourceCriteria = parsed.criteria && typeof parsed.criteria === "object" ? parsed.criteria : {};
      const safeCriteria: Partial<LeadAdvancedSearchInput> = {
        ...(typeof sourceCriteria.mode === "string" && ["apollo", "business", "person"].includes(sourceCriteria.mode) ? { mode: sourceCriteria.mode } : {}),
        ...(clean(sourceCriteria.industry) ? { industry: clean(sourceCriteria.industry) } : {}),
        ...(clean(sourceCriteria.company) ? { company: clean(sourceCriteria.company) } : {}),
        ...(clean(sourceCriteria.country) ? { country: clean(sourceCriteria.country) } : {}),
        ...(clean(sourceCriteria.stateRegion) ? { stateRegion: clean(sourceCriteria.stateRegion) } : {}),
        ...(clean(sourceCriteria.city) ? { city: clean(sourceCriteria.city) } : {}),
        ...(clean(sourceCriteria.region) ? { region: clean(sourceCriteria.region) } : {}),
        jobTitles: Array.isArray(sourceCriteria.jobTitles) ? sourceCriteria.jobTitles.map((x: unknown) => clean(x)).filter(Boolean).slice(0, 20) as string[] : [],
        keywords: Array.isArray(sourceCriteria.keywords) ? sourceCriteria.keywords.map((x: unknown) => clean(x)).filter(Boolean).slice(0, 20) as string[] : [],
        names: Array.isArray(sourceCriteria.names) ? sourceCriteria.names.map((x: unknown) => clean(x)).filter(Boolean).slice(0, 50) as string[] : [],
      };
      const result: LeadAgentInterpretation = {
        source: response.modelSource === "real" ? "ai" : "heuristic",
        criteria: Object.keys(safeCriteria).length ? safeCriteria : fallback.criteria,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map((x: unknown) => clean(x, 300)).filter(Boolean).slice(0, 5) as string[] : fallback.recommendations,
        limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map((x: unknown) => clean(x, 300)).filter(Boolean).slice(0, 5) as string[] : fallback.limitations,
      };
      await Promise.allSettled([meter(org, actorId, "lead_discovery.agent_interpretations", 1, "request", { source: result.source }), KernelService.dispatch({ kind: "lead-discovery.agent.interpreted", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, source: result.source } })]);
      return result;
    } catch {
      return { ...fallback, limitations: [...fallback.limitations, "The configured AI provider did not return usable structured criteria; no AI-generated criteria were applied."] };
    }
  },

  async recommendations(org: string, leadIds: string[], actorId: string | null): Promise<LeadAgentRecommendationResult> {
    await enforceRetention(org);
    const unique = [...new Set(leadIds)];
    const allRaw = await scan(org);
    const recommendations = await Promise.all(unique.map((leadId) => recommendForLead(org, leadId, allRaw)));
    await Promise.allSettled([
      meter(org, actorId, "lead_discovery.agent_recommendations", recommendations.length, "lead", { source: "local_evidence_review" }),
      audit(org, actorId, "data.update", "lead-discovery-agent-review", { event: "lead_discovery.agent.recommendations", count: recommendations.length }),
      KernelService.dispatch({ kind: "lead-discovery.agent.recommendations", source: "lead-discovery-agent", target: "god-node", payload: { organizationId: org, leadIds: unique } }),
    ]);
    return {
      recommendations,
      note: "These are local, deterministic recommendations from stored provider, quality, duplication, and verification evidence. They do not infer missing contact details, modify leads or lists, or send outreach.",
    };
  },

  notes: { quality: LEAD_QUALITY_NOTE, verification: LEAD_VERIFICATION_NOTE, privacy: LEAD_PRIVACY_NOTE },
};
