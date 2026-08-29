/**
 * Regulatory Register — org-scoped tracking of regulations and their gaps.
 *
 * Backs the opex rollup's previously-structural `regulations` field with a real
 * store. Each regulation is a tracked record with a jurisdiction, category,
 * status, effective date and open/resolved compliance-gap counts. The rollup
 * figures are computed from stored records only, never estimated:
 *   - tracked    = number of regulations on the register
 *   - changed30d = records updated in the last 30 days (real updatedAt)
 *   - openGaps   = sum of (gapCount − gapResolved), floored at 0 per record
 *   - upcoming   = enacted/proposed regulations with a future effective date
 *
 * Tenant-scoped in Redis (`opex:reg:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type {
  Regulation,
  OpexRegulationCreateInput,
  OpexRegulationUpdateInput,
} from "@windels/shared/opex";

interface RegulationRecord extends Regulation {
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

const K = {
  idx: (org: string) => `opex:reg:idx:${org}`,
  item: (org: string, id: string) => `opex:reg:i:${org}:${id}`,
};
const DAY_MS = 86_400_000;

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw AppError.badRequest("organizationId is required");
  }
}

async function read(org: string, id: string): Promise<RegulationRecord | null> {
  const raw = await redis.get(K.item(org, id));
  if (!raw) return null;
  const rec = JSON.parse(raw) as RegulationRecord;
  return rec.id === id ? rec : null;
}

function toPublic(rec: RegulationRecord): Regulation {
  const { createdAt: _c, updatedAt: _u, createdBy: _b, ...pub } = rec;
  return pub;
}

export const RegulationsRegistryService = {
  async create(oid: string, input: OpexRegulationCreateInput, createdBy?: string): Promise<Regulation> {
    assertOrg(oid);
    const now = new Date().toISOString();
    const rec: RegulationRecord = {
      id: `reg_${randomUUID().slice(0, 8)}`,
      name: input.name,
      jurisdiction: input.jurisdiction,
      category: input.category,
      status: input.status,
      summary: input.summary,
      impactAreas: input.impactAreas,
      gapCount: input.gapCount,
      gapResolved: input.gapResolved,
      ...(input.effectiveDate ? { effectiveDate: input.effectiveDate } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy ?? null,
    };
    await redis.set(K.item(oid, rec.id), JSON.stringify(rec));
    await redis.zadd(K.idx(oid), Date.now(), rec.id);
    return toPublic(rec);
  },

  async update(oid: string, id: string, patch: OpexRegulationUpdateInput): Promise<Regulation> {
    assertOrg(oid);
    const cur = await read(oid, id);
    if (!cur) throw AppError.notFound("Regulation not found in organization");
    const next: RegulationRecord = {
      ...cur,
      ...patch,
      // Preserve nullable effectiveDate clearing semantics.
      ...(patch.effectiveDate === null ? { effectiveDate: undefined } : {}),
      updatedAt: new Date().toISOString(),
    };
    await redis.set(K.item(oid, id), JSON.stringify(next));
    return toPublic(next);
  },

  async get(oid: string, id: string): Promise<Regulation | null> {
    assertOrg(oid);
    const rec = await read(oid, id);
    return rec ? toPublic(rec) : null;
  },

  async list(oid: string, limit = 200): Promise<Regulation[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const out: Regulation[] = [];
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

  /**
   * Compute the opex regulations rollup + recent list from stored records.
   * `now` is injectable for deterministic tests.
   */
  async rollup(oid: string, now = Date.now()): Promise<{
    summary: { tracked: number; changed30d: number; openGaps: number; upcoming: number };
    recent: Regulation[];
  }> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const records: RegulationRecord[] = [];
    for (const id of ids) {
      const rec = await read(oid, id);
      if (rec) records.push(rec);
    }
    const cutoff = now - 30 * DAY_MS;
    let openGaps = 0;
    let changed30d = 0;
    let upcoming = 0;
    for (const rec of records) {
      openGaps += Math.max(0, rec.gapCount - rec.gapResolved);
      if (Date.parse(rec.updatedAt) >= cutoff) changed30d += 1;
      if (rec.effectiveDate && Date.parse(rec.effectiveDate) > now && (rec.status === "proposed" || rec.status === "enacted")) {
        upcoming += 1;
      }
    }
    return {
      summary: { tracked: records.length, changed30d, openGaps, upcoming },
      recent: records.slice(0, 20).map(toPublic),
    };
  },
};

export default RegulationsRegistryService;
