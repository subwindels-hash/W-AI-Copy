/**
 * Operational Playbooks — org-scoped store of playbooks and their simulations.
 *
 * Backs the opex rollup's previously-structural `playbooks` field with a real
 * store. Each playbook has a category, version, step count, lifecycle status,
 * a recorded simulation count/lastRun, and a compliance posture. The rollup
 * figures are computed from stored records only, never estimated:
 *   - total            = playbooks on the register
 *   - active           = status === "active"
 *   - simulating       = playbooks with a simulation recorded in the last 24h
 *   - avgCompliancePct = mean of compliance scores (verified=100, gaps=50,
 *                        unknown=0); 0 when the register is empty
 *
 * Tenant-scoped in Redis (`opex:pb:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type {
  Playbook,
  OpexPlaybookCreateInput,
  OpexPlaybookUpdateInput,
  OpexPlaybookCompliance,
} from "@windels/shared/opex";

interface PlaybookRecord extends Playbook {
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

const K = {
  idx: (org: string) => `opex:pb:idx:${org}`,
  item: (org: string, id: string) => `opex:pb:i:${org}:${id}`,
};
const DAY_MS = 86_400_000;
const COMPLIANCE_SCORE: Record<OpexPlaybookCompliance, number> = { verified: 100, gaps: 50, unknown: 0 };

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw AppError.badRequest("organizationId is required");
  }
}

async function read(org: string, id: string): Promise<PlaybookRecord | null> {
  const raw = await redis.get(K.item(org, id));
  if (!raw) return null;
  const rec = JSON.parse(raw) as PlaybookRecord;
  return rec.id === id ? rec : null;
}

function toPublic(rec: PlaybookRecord): Playbook {
  const { createdAt: _c, updatedAt: _u, createdBy: _b, ...pub } = rec;
  return pub;
}

export const PlaybooksRegistryService = {
  async create(oid: string, input: OpexPlaybookCreateInput, createdBy?: string): Promise<Playbook> {
    assertOrg(oid);
    const now = new Date().toISOString();
    const rec: PlaybookRecord = {
      id: `pb_${randomUUID().slice(0, 8)}`,
      name: input.name,
      category: input.category,
      version: input.version,
      steps: input.steps,
      simulations: 0,
      status: input.status,
      compliance: input.compliance,
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy ?? null,
    };
    await redis.set(K.item(oid, rec.id), JSON.stringify(rec));
    await redis.zadd(K.idx(oid), Date.now(), rec.id);
    return toPublic(rec);
  },

  async update(oid: string, id: string, patch: OpexPlaybookUpdateInput): Promise<Playbook> {
    assertOrg(oid);
    const cur = await read(oid, id);
    if (!cur) throw AppError.notFound("Playbook not found in organization");
    const next: PlaybookRecord = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    await redis.set(K.item(oid, id), JSON.stringify(next));
    return toPublic(next);
  },

  /** Record a simulation run: increments the count and stamps lastRun. */
  async runSimulation(oid: string, id: string): Promise<Playbook> {
    assertOrg(oid);
    const cur = await read(oid, id);
    if (!cur) throw AppError.notFound("Playbook not found in organization");
    const now = new Date().toISOString();
    const next: PlaybookRecord = { ...cur, simulations: cur.simulations + 1, lastRun: now, updatedAt: now };
    await redis.set(K.item(oid, id), JSON.stringify(next));
    return toPublic(next);
  },

  async get(oid: string, id: string): Promise<Playbook | null> {
    assertOrg(oid);
    const rec = await read(oid, id);
    return rec ? toPublic(rec) : null;
  },

  async list(oid: string, limit = 200): Promise<Playbook[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const out: Playbook[] = [];
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

  /** Compute the opex playbooks rollup from stored records. `now` injectable. */
  async rollup(oid: string, now = Date.now()): Promise<{ total: number; active: number; simulating: number; avgCompliancePct: number }> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const records: PlaybookRecord[] = [];
    for (const id of ids) {
      const rec = await read(oid, id);
      if (rec) records.push(rec);
    }
    if (records.length === 0) return { total: 0, active: 0, simulating: 0, avgCompliancePct: 0 };

    const cutoff = now - DAY_MS;
    const active = records.filter((r) => r.status === "active").length;
    const simulating = records.filter((r) => r.lastRun && Date.parse(r.lastRun) >= cutoff).length;
    const avgCompliancePct = Math.round(
      records.reduce((sum, r) => sum + (COMPLIANCE_SCORE[r.compliance] ?? 0), 0) / records.length,
    );
    return { total: records.length, active, simulating, avgCompliancePct };
  },
};

export default PlaybooksRegistryService;
