/**
 * Federation Register — org-scoped record of federation partners + shared assets.
 *
 * Backs the cognitive dashboard's previously-null `federationPartners` and
 * `marketplaceUnifiedAssets` with a real store. Each partner records shared
 * dataset/model counts, a trust tier and a status. Rollup, from stored records:
 *   - partners (active)       = partners with status "active"
 *   - unifiedAssets           = sum of sharedDatasets + sharedModels over active partners
 *
 * Tenant-scoped in Redis (`cog:fed:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type {
  FederationPartner,
  CogFederationPartnerCreateInput,
  CogFederationPartnerUpdateInput,
} from "@windels/shared/cognitive";

interface PartnerRecord extends FederationPartner {
  createdAt: string;
  createdBy: string | null;
}

const K = {
  idx: (org: string) => `cog:fed:idx:${org}`,
  item: (org: string, id: string) => `cog:fed:i:${org}:${id}`,
};

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw AppError.badRequest("organizationId is required");
}
async function read(org: string, id: string): Promise<PartnerRecord | null> {
  const raw = await redis.get(K.item(org, id));
  if (!raw) return null;
  const rec = JSON.parse(raw) as PartnerRecord;
  return rec.id === id ? rec : null;
}
function toPublic(rec: PartnerRecord): FederationPartner {
  const { createdAt: _c, createdBy: _b, ...pub } = rec;
  return pub;
}

export const FederationService = {
  async create(oid: string, input: CogFederationPartnerCreateInput, createdBy?: string): Promise<FederationPartner> {
    assertOrg(oid);
    const rec: PartnerRecord = {
      id: `fed_${randomUUID().slice(0, 8)}`,
      name: input.name,
      type: input.type,
      trustTier: input.trustTier,
      sharedDatasets: input.sharedDatasets,
      sharedModels: input.sharedModels,
      federatedJobs30d: 0,
      status: input.status,
      createdAt: new Date().toISOString(),
      createdBy: createdBy ?? null,
    };
    await redis.set(K.item(oid, rec.id), JSON.stringify(rec));
    await redis.zadd(K.idx(oid), Date.now(), rec.id);
    return toPublic(rec);
  },

  async update(oid: string, id: string, patch: CogFederationPartnerUpdateInput): Promise<FederationPartner> {
    assertOrg(oid);
    const cur = await read(oid, id);
    if (!cur) throw AppError.notFound("Federation partner not found in organization");
    const next: PartnerRecord = { ...cur, ...patch };
    await redis.set(K.item(oid, id), JSON.stringify(next));
    return toPublic(next);
  },

  async get(oid: string, id: string): Promise<FederationPartner | null> {
    assertOrg(oid);
    const rec = await read(oid, id);
    return rec ? toPublic(rec) : null;
  },

  async list(oid: string, limit = 200): Promise<FederationPartner[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const out: FederationPartner[] = [];
    for (const id of ids.slice(0, limit)) {
      const rec = await read(oid, id);
      if (rec) out.push(toPublic(rec));
    }
    return out;
  },

  async delete(oid: string, id: string): Promise<boolean> {
    assertOrg(oid);
    const cur = await read(oid, id);
    if (!cur) return false;
    await redis.del(K.item(oid, id));
    await redis.zrem(K.idx(oid), id);
    return true;
  },

  /** Rollup: active partner count + unified shared-asset tally over active partners. */
  async rollup(oid: string): Promise<{ activePartners: number; unifiedAssets: number; partners: FederationPartner[]; hasData: boolean }> {
    assertOrg(oid);
    const partners = await this.list(oid, 1000);
    const active = partners.filter((p) => p.status === "active");
    const unifiedAssets = active.reduce((sum, p) => sum + p.sharedDatasets + p.sharedModels, 0);
    return { activePartners: active.length, unifiedAssets, partners: partners.slice(0, 20), hasData: partners.length > 0 };
  },
};

export default FederationService;
