/**
 * Safety Benchmarks — org-scoped store of safety-benchmark results.
 *
 * Backs the opex rollup's previously-empty `safety.benchmarks` map with a real
 * store. Each run records a score for a SafetyCategory against a recorded
 * passing threshold; `pass` is derived (score >= threshold), never a free-form
 * claim. The rollup exposes the LATEST result per evaluated category as
 * `{ pass, score }`; a category that has never been benchmarked is absent from
 * the map (never reported as passing).
 *
 * Tenant-scoped in Redis (`opex:bench:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type {
  SafetyCategory,
  OpexSafetyBenchmarkRecordInput,
  OpexSafetyBenchmarkResult,
} from "@windels/shared/opex";

interface BenchmarkRecord extends OpexSafetyBenchmarkResult {
  id: string;
}

const K = {
  // One sorted set + item keys per category so "latest per category" is O(1)-ish.
  idx: (org: string, category: string) => `opex:bench:idx:${org}:${category}`,
  cats: (org: string) => `opex:bench:cats:${org}`,
  item: (org: string, id: string) => `opex:bench:i:${org}:${id}`,
};

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw AppError.badRequest("organizationId is required");
  }
}

async function read(org: string, id: string): Promise<BenchmarkRecord | null> {
  const raw = await redis.get(K.item(org, id));
  if (!raw) return null;
  const rec = JSON.parse(raw) as BenchmarkRecord;
  return rec.id === id ? rec : null;
}

export const SafetyBenchmarksService = {
  /** Record a benchmark result for a category. `pass` is derived, not supplied. */
  async record(oid: string, input: OpexSafetyBenchmarkRecordInput, recordedBy?: string): Promise<OpexSafetyBenchmarkResult> {
    assertOrg(oid);
    const rec: BenchmarkRecord = {
      id: `bench_${randomUUID().slice(0, 8)}`,
      category: input.category,
      score: input.score,
      passThreshold: input.passThreshold,
      pass: input.score >= input.passThreshold,
      suite: input.suite ?? null,
      recordedAt: new Date().toISOString(),
      recordedBy: recordedBy ?? null,
    };
    await redis.set(K.item(oid, rec.id), JSON.stringify(rec));
    await redis.zadd(K.idx(oid, input.category), Date.now(), rec.id);
    await redis.sadd(K.cats(oid), input.category);
    const { id: _id, ...pub } = rec;
    return pub;
  },

  /** History for a single category, newest first. */
  async history(oid: string, category: SafetyCategory, limit = 100): Promise<OpexSafetyBenchmarkResult[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid, category), 0, -1, "REV");
    const out: OpexSafetyBenchmarkResult[] = [];
    for (const id of ids.slice(0, limit)) {
      const rec = await read(oid, id);
      if (rec) { const { id: _id, ...pub } = rec; out.push(pub); }
    }
    return out;
  },

  /** The latest recorded result for a category, or null if never benchmarked. */
  async latest(oid: string, category: SafetyCategory): Promise<OpexSafetyBenchmarkResult | null> {
    assertOrg(oid);
    const ids = await redis.zrange(K.idx(oid, category), -1, -1, "REV");
    // "REV" with -1..-1 yields the oldest; fetch newest via index 0.
    const newest = await redis.zrange(K.idx(oid, category), 0, 0, "REV");
    const id = newest[0] ?? ids[0];
    if (!id) return null;
    const rec = await read(oid, id);
    if (!rec) return null;
    const { id: _id, ...pub } = rec;
    return pub;
  },

  /**
   * The opex rollup: a partial map of the latest `{ pass, score }` per evaluated
   * category. Categories never benchmarked are absent.
   */
  async rollup(oid: string): Promise<Partial<Record<SafetyCategory, { pass: boolean; score: number }>>> {
    assertOrg(oid);
    const categories = (await redis.smembers(K.cats(oid))) as SafetyCategory[];
    const out: Partial<Record<SafetyCategory, { pass: boolean; score: number }>> = {};
    for (const category of categories) {
      const latest = await this.latest(oid, category);
      if (latest) out[category] = { pass: latest.pass, score: latest.score };
    }
    return out;
  },
};

export default SafetyBenchmarksService;
