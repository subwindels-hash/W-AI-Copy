/**
 * Innovation Pipeline — org-scoped register of innovation proposals.
 *
 * Backs the cognitive dashboard's previously-null `innovationProposalsOpen` and
 * `innovationPipelineValueUsd` with a real store. Each proposal has a projected
 * value, risk and lifecycle status. The rollup is computed from stored records
 * only, never estimated:
 *   - openCount = proposals in an open state (proposed|reviewing|approved|executing)
 *   - pipelineValueUsd = sum of projectedValueUsd over those open proposals
 *
 * Tenant-scoped in Redis (`cog:innov:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type { InnovationProposal, CogInnovationCreateInput, CogInnovationStatus } from "@windels/shared/cognitive";

interface ProposalRecord extends InnovationProposal {
  createdAt: string;
  createdBy: string | null;
}

const OPEN_STATES: ReadonlySet<CogInnovationStatus> = new Set(["proposed", "reviewing", "approved", "executing"]);
const K = {
  idx: (org: string) => `cog:innov:idx:${org}`,
  item: (org: string, id: string) => `cog:innov:i:${org}:${id}`,
};

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw AppError.badRequest("organizationId is required");
}
async function read(org: string, id: string): Promise<ProposalRecord | null> {
  const raw = await redis.get(K.item(org, id));
  if (!raw) return null;
  const rec = JSON.parse(raw) as ProposalRecord;
  return rec.id === id ? rec : null;
}
function toPublic(rec: ProposalRecord): InnovationProposal {
  const { createdAt: _c, createdBy: _b, ...pub } = rec;
  return pub;
}

export const InnovationPipelineService = {
  async create(oid: string, input: CogInnovationCreateInput, createdBy?: string): Promise<InnovationProposal> {
    assertOrg(oid);
    const rec: ProposalRecord = {
      id: `innov_${randomUUID().slice(0, 8)}`,
      title: input.title,
      category: input.category,
      projectedValueUsd: input.projectedValueUsd,
      risk: input.risk,
      status: input.status,
      createdAt: new Date().toISOString(),
      createdBy: createdBy ?? null,
    };
    await redis.set(K.item(oid, rec.id), JSON.stringify(rec));
    await redis.zadd(K.idx(oid), Date.now(), rec.id);
    return toPublic(rec);
  },

  async setStatus(oid: string, id: string, status: CogInnovationStatus): Promise<InnovationProposal> {
    assertOrg(oid);
    const cur = await read(oid, id);
    if (!cur) throw AppError.notFound("Innovation proposal not found in organization");
    const next: ProposalRecord = { ...cur, status };
    await redis.set(K.item(oid, id), JSON.stringify(next));
    return toPublic(next);
  },

  async get(oid: string, id: string): Promise<InnovationProposal | null> {
    assertOrg(oid);
    const rec = await read(oid, id);
    return rec ? toPublic(rec) : null;
  },

  async list(oid: string, limit = 200): Promise<InnovationProposal[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid), 0, -1, "REV");
    const out: InnovationProposal[] = [];
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

  /** Rollup: open proposal count + total projected value of open proposals. */
  async rollup(oid: string): Promise<{ openCount: number; pipelineValueUsd: number; proposals: InnovationProposal[]; hasData: boolean }> {
    assertOrg(oid);
    const proposals = await this.list(oid, 1000);
    const open = proposals.filter((p) => OPEN_STATES.has(p.status));
    const pipelineValueUsd = open.reduce((sum, p) => sum + p.projectedValueUsd, 0);
    return { openCount: open.length, pipelineValueUsd, proposals: proposals.slice(0, 20), hasData: proposals.length > 0 };
  },
};

export default InnovationPipelineService;
