import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";

const K = { leads: (oid: string) => `leads85:${oid}:leads`, lead: (oid: string, id: string) => `leads85:${oid}:lead:${id}`, collections: (oid: string) => `leads85:${oid}:collections`, collection: (oid: string, id: string) => `leads85:${oid}:collection:${id}` };
type Lead = { id: string; name: string; category?: string; address?: string; phone?: string; website?: string; source: "google_places"; sourceId: string; discoveredAt: string; verificationStatus: "source_returned"; query: string };

export const LeadDiscoveryService = {
  async search(organizationId: string, query: string) {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) throw new AppError("SERVICE_UNAVAILABLE", "Google Places API configuration required", 503);
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json"); url.searchParams.set("query", query); url.searchParams.set("key", key);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw AppError.upstream("Google Places search failed");
    const payload: any = await response.json(); if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") throw AppError.upstream(`Google Places: ${payload.status}`);
    const leads: Lead[] = [];
    for (const item of (payload.results ?? []).slice(0, 20)) {
      // Guard before coercing: String(undefined) is the truthy string
      // "undefined", so the previous `String(item.place_id); if (!sourceId)`
      // never rejected anything. A provider entry without a place_id was stored
      // as a lead whose sourceId literally read "undefined", which breaks
      // dedupe (every such lead collides) and pollutes CRM exports.
      if (item.place_id === undefined || item.place_id === null || item.place_id === "") continue;
      const sourceId = String(item.place_id);
      if (!sourceId) continue;
      const lead: Lead = { id: `lead-${randomUUID()}`, name: String(item.name), category: item.types?.[0], address: item.formatted_address, source: "google_places", sourceId, discoveredAt: new Date().toISOString(), verificationStatus: "source_returned", query };
      await redis.set(K.lead(organizationId, lead.id), JSON.stringify(lead)); await redis.lpush(K.leads(organizationId), lead.id); leads.push(lead);
    }
    await redis.ltrim(K.leads(organizationId), 0, 9999); return { query, source: "google_places", results: leads };
  },
  async list(organizationId: string) { const ids = await redis.lrange(K.leads(organizationId), 0, 199); const out: Lead[] = []; for (const id of ids) { const raw = await redis.get(K.lead(organizationId, id)); if (raw) out.push(JSON.parse(raw)); } return out; },
  async createCollection(organizationId: string, userId: string, name: string) { const item = { id: `collection-${randomUUID()}`, name, createdById: userId, leadIds: [] as string[], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await redis.set(K.collection(organizationId, item.id), JSON.stringify(item)); await redis.lpush(K.collections(organizationId), item.id); return item; },
  async listCollections(organizationId: string) { const ids = await redis.lrange(K.collections(organizationId), 0, 199); const out = []; for (const id of ids) { const raw = await redis.get(K.collection(organizationId, id)); if (raw) out.push(JSON.parse(raw)); } return out; },
  async addLeadToCollection(organizationId: string, collectionId: string, leadId: string) { const [collectionRaw, leadRaw] = await Promise.all([redis.get(K.collection(organizationId, collectionId)), redis.get(K.lead(organizationId, leadId))]); if (!collectionRaw || !leadRaw) throw AppError.notFound("Collection or lead not found"); const collection = JSON.parse(collectionRaw); if (!collection.leadIds.includes(leadId)) collection.leadIds.push(leadId); collection.updatedAt = new Date().toISOString(); await redis.set(K.collection(organizationId, collectionId), JSON.stringify(collection)); return collection; },
  async selected(organizationId: string, leadIds: string[]) { const out: Lead[] = []; for (const id of [...new Set(leadIds)].slice(0, 500)) { const raw = await redis.get(K.lead(organizationId, id)); if (!raw) throw AppError.notFound("Selected lead not found"); out.push(JSON.parse(raw)); } return out; },
};
