/**
 * Self-Evolution Register — org-scoped record of self-optimizing components.
 *
 * Backs the cognitive dashboard's previously-null `selfEvolutionHealth`,
 * `autoFixes30d` and `dnaCompleteness` with a real store. Each component records
 * a health value, optional bottleneck/recommendation, and an auto-fix counter;
 * auto-fixes are also logged as timestamped events so the 30-day figure is real.
 * Rollup, all from stored records:
 *   - health (%)      = mean component health × 100 (null when no components)
 *   - autoFixes30d    = auto-fix events recorded in the last 30 days
 *   - dnaCompleteness = configured components / expected DNA components (%)
 *
 * Tenant-scoped in Redis (`cog:evo:*:<org>:*`); reads never cross orgs.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import {
  COG_DNA_EXPECTED_COMPONENTS,
  type SelfEvolutionMetric,
  type CogSelfEvolutionComponentInput,
} from "@windels/shared/cognitive";

interface ComponentRecord extends SelfEvolutionMetric {}

const K = {
  set: (org: string) => `cog:evo:components:${org}`,
  item: (org: string, component: string) => `cog:evo:c:${org}:${component}`,
  fixes: (org: string) => `cog:evo:fixes:${org}`, // sorted set: score = timestamp
};
const DAY_MS = 86_400_000;

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw AppError.badRequest("organizationId is required");
}
async function read(org: string, component: string): Promise<ComponentRecord | null> {
  const raw = await redis.get(K.item(org, component));
  return raw ? (JSON.parse(raw) as ComponentRecord) : null;
}

export const SelfEvolutionService = {
  /** Register or update a self-optimizing component (idempotent by name). */
  async upsertComponent(oid: string, input: CogSelfEvolutionComponentInput): Promise<SelfEvolutionMetric> {
    assertOrg(oid);
    const existing = await read(oid, input.component);
    const rec: ComponentRecord = {
      component: input.component,
      health: input.health,
      ...(input.bottleneck ? { bottleneck: input.bottleneck } : {}),
      autoFixes: existing?.autoFixes ?? 0,
      lastOptimizedAt: new Date().toISOString(),
      ...(input.recommendation ? { recommendation: input.recommendation } : {}),
    };
    await redis.set(K.item(oid, input.component), JSON.stringify(rec));
    await redis.sadd(K.set(oid), input.component);
    return rec;
  },

  /** Record an auto-fix against a component: bumps its counter + logs an event. */
  async recordAutoFix(oid: string, component: string): Promise<SelfEvolutionMetric> {
    assertOrg(oid);
    const cur = await read(oid, component);
    if (!cur) throw AppError.notFound("Self-evolution component not found in organization");
    const now = Date.now();
    const next: ComponentRecord = { ...cur, autoFixes: cur.autoFixes + 1, lastOptimizedAt: new Date(now).toISOString() };
    await redis.set(K.item(oid, component), JSON.stringify(next));
    await redis.zadd(K.fixes(oid), now, `${component}:${now}:${randomUUID().slice(0, 8)}`);
    return next;
  },

  async listComponents(oid: string): Promise<SelfEvolutionMetric[]> {
    assertOrg(oid);
    const names = await redis.smembers(K.set(oid));
    const out: SelfEvolutionMetric[] = [];
    for (const name of names) {
      const rec = await read(oid, name);
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => a.component.localeCompare(b.component));
  },

  /** Count auto-fix events recorded within the trailing window (default 30d). */
  async autoFixesSince(oid: string, now = Date.now(), windowMs = 30 * DAY_MS): Promise<number> {
    assertOrg(oid);
    const cutoff = now - windowMs;
    const members = await redis.zrangebyscore(K.fixes(oid), cutoff, now);
    return members.length;
  },

  /**
   * Rollup for the cognitive dashboard. Health is null when no component exists
   * (a real "not measured", not a fabricated 0).
   */
  async rollup(oid: string, now = Date.now()): Promise<{
    health: number | null;
    autoFixes30d: number | null;
    dnaCompleteness: number | null;
    components: SelfEvolutionMetric[];
    hasData: boolean;
  }> {
    assertOrg(oid);
    const components = await this.listComponents(oid);
    if (components.length === 0) {
      return { health: null, autoFixes30d: null, dnaCompleteness: null, components: [], hasData: false };
    }
    const health = Math.round((components.reduce((s, c) => s + c.health, 0) / components.length) * 100);
    const autoFixes30d = await this.autoFixesSince(oid, now);
    const configuredExpected = new Set(components.map((c) => c.component));
    const covered = COG_DNA_EXPECTED_COMPONENTS.filter((c) => configuredExpected.has(c)).length;
    const dnaCompleteness = Math.round((covered / COG_DNA_EXPECTED_COMPONENTS.length) * 100);
    return { health, autoFixes30d, dnaCompleteness, components, hasData: true };
  },
};

export default SelfEvolutionService;
