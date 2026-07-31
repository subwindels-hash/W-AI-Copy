/**
 * ReleaseService — Slice 179 (Deployment Automation), 180 (Blue/Green), 181 (Canary).
 *
 * Tracks releases across services/environments, exposes B/G and canary state,
 * and simulates deploy/promote/rollback operations. For MVP these are state
 * machines persisted in Redis with a few deterministic transitions; real
 * controllers will be added when kubeconfig-based clients are wired up.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../observability/logger.js";
import type {
  Release, ReleaseStatus, DeploymentStrategy, BlueGreenState, BGColor, CanaryState, CanaryStatus,
} from "@windels/shared/infrastructure";

const RELEASES_KEY = "infra:releases";
const REL_PREFIX = "infra:release:";
const BG_PREFIX = "infra:bg:";
const CANARY_PREFIX = "infra:canary:";
let seeded = false;
function now(){return new Date().toISOString();}

export const ReleaseService = {
  async seed() {
    if (seeded) return; seeded = true;
    try { if (await redisCmd.exists(RELEASES_KEY)) return; } catch { /* ignore */ }
    // Seed a historical release + current blue-green/canary state per env
    const v = (n: number) => `0.20.${n}`;
    const envs: Array<{env:any;svc:any;ver:number;strat:DeploymentStrategy}> = [
      { env: "prod", svc: "api", ver: 0, strat: "canary" },
      { env: "prod", svc: "web", ver: 0, strat: "blue-green" },
      { env: "staging", svc: "api", ver: 1, strat: "rolling" },
      { env: "staging", svc: "web", ver: 1, strat: "rolling" },
    ];
    for (const e of envs) {
      const rel: Release = {
        id: randomUUID(), version: v(e.ver), environment: e.env, service: e.svc,
        strategy: e.strat, author: "ci", commitSha: randomUUID().slice(0,7),
        status: "deployed", previousVersion: e.ver > 0 ? v(e.ver-1) : undefined,
        startedAt: now(), deployedAt: now(), durationMs: 42_000, healthGatePassed: true,
        changelog: "Session 20 shipped",
      };
      await redisCmd.set(`${REL_PREFIX}${rel.id}`, JSON.stringify(rel));
      await redisCmd.sadd(RELEASES_KEY, rel.id);

      if (e.env === "prod") {
        if (e.strat === "blue-green") {
          const bg: BlueGreenState = {
            service: e.svc, environment: e.env, activeColor: "blue", stagingColor: "green",
            activeVersion: v(e.ver), stagingVersion: undefined, activeReplicas: 3, stagingReplicas: 0,
            stagingHealthy: false,
          };
          await redisCmd.set(`${BG_PREFIX}${e.env}:${e.svc}`, JSON.stringify(bg));
        } else if (e.strat === "canary") {
          const c: CanaryState = {
            service: e.svc, environment: e.env, stableVersion: v(e.ver), canaryVersion: undefined,
            canaryWeightPercent: 0, status: "idle", errorRate: 0.2, latencyP95: 28,
          };
          await redisCmd.set(`${CANARY_PREFIX}${e.env}:${e.svc}`, JSON.stringify(c));
        }
      }
    }
  },

  async list(filter?: { environment?: string; service?: string; status?: ReleaseStatus }): Promise<Release[]> {
    await this.seed();
    const ids = await redisCmd.smembers(RELEASES_KEY);
    const out: Release[] = [];
    for (const id of ids) {
      const r = await redisCmd.get(`${REL_PREFIX}${id}`); if (!r) continue;
      const rel = JSON.parse(r) as Release;
      if (filter?.environment && rel.environment !== filter.environment) continue;
      if (filter?.service && rel.service !== filter.service) continue;
      if (filter?.status && rel.status !== filter.status) continue;
      out.push(rel);
    }
    return out.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  },

  async deploy(input: { environment: Release["environment"]; service: Release["service"]; version: string; strategy: DeploymentStrategy; author: string; commitSha?: string; changelog?: string }): Promise<Release> {
    await this.seed();
    const previous = (await this.list({ environment: input.environment, service: input.service, status: "deployed" }))[0];
    const rel: Release = {
      id: randomUUID(), version: input.version, environment: input.environment, service: input.service,
      strategy: input.strategy, author: input.author, commitSha: input.commitSha, status: "deploying",
      previousVersion: previous?.version, startedAt: now(), changelog: input.changelog,
    };
    await redisCmd.set(`${REL_PREFIX}${rel.id}`, JSON.stringify(rel));
    await redisCmd.sadd(RELEASES_KEY, rel.id);

    // Simulate deploy finishing in-memory (instant for MVP).
    rel.status = "deployed"; rel.deployedAt = now(); rel.durationMs = 45_000; rel.healthGatePassed = true;
    await redisCmd.set(`${REL_PREFIX}${rel.id}`, JSON.stringify(rel));

    // Update B/G or canary state if applicable
    if (input.strategy === "blue-green") {
      const bg: BlueGreenState = {
        service: input.service, environment: input.environment,
        activeColor: "blue", stagingColor: "green",
        activeVersion: rel.version, activeReplicas: 3, stagingReplicas: 0, stagingHealthy: false,
        lastSwappedAt: now(),
      };
      await redisCmd.set(`${BG_PREFIX}${input.environment}:${input.service}`, JSON.stringify(bg));
    } else if (input.strategy === "canary") {
      const c: CanaryState = {
        service: input.service, environment: input.environment,
        stableVersion: rel.version, canaryVersion: undefined, canaryWeightPercent: 0,
        status: "idle", errorRate: 0.3, latencyP95: 25, lastPromotedAt: now(),
      };
      await redisCmd.set(`${CANARY_PREFIX}${input.environment}:${input.service}`, JSON.stringify(c));
    }
    logger.info("release deployed", { id: rel.id, version: rel.version, env: rel.environment, svc: rel.service });
    return rel;
  },

  // ── Blue/Green ────────────────────────────────────────────────────
  async bgStage(environment: string, service: string, version: string): Promise<BlueGreenState> {
    await this.seed();
    const key = `${BG_PREFIX}${environment}:${service}`;
    const raw = await redisCmd.get(key);
    const bg: BlueGreenState = raw ? JSON.parse(raw) : { service, environment, activeColor: "blue", stagingColor: "green", activeVersion: version, activeReplicas: 3, stagingReplicas: 0, stagingHealthy: false };
    bg.stagingVersion = version;
    bg.stagingColor = bg.activeColor === "blue" ? "green" : "blue";
    bg.stagingReplicas = bg.activeReplicas;
    bg.stagingHealthy = true; // simulate health gate
    await redisCmd.set(key, JSON.stringify(bg));
    return bg;
  },
  async bgSwap(environment: string, service: string): Promise<BlueGreenState> {
    await this.seed();
    const key = `${BG_PREFIX}${environment}:${service}`;
    const raw = await redisCmd.get(key); if (!raw) throw new Error("no bg state");
    const bg: BlueGreenState = JSON.parse(raw);
    if (!bg.stagingVersion) throw new Error("no staged version");
    const newActive = bg.stagingColor;
    bg.activeColor = newActive;
    bg.activeVersion = bg.stagingVersion;
    bg.stagingVersion = undefined;
    bg.stagingReplicas = 0;
    bg.stagingHealthy = false;
    bg.lastSwappedAt = now();
    await redisCmd.set(key, JSON.stringify(bg));
    return bg;
  },
  async bgGet(environment: string, service: string): Promise<BlueGreenState | null> {
    await this.seed();
    const r = await redisCmd.get(`${BG_PREFIX}${environment}:${service}`);
    return r ? JSON.parse(r) : null;
  },

  // ── Canary ────────────────────────────────────────────────────────
  async canaryStart(environment: string, service: string, version: string): Promise<CanaryState> {
    await this.seed();
    const key = `${CANARY_PREFIX}${environment}:${service}`;
    const raw = await redisCmd.get(key);
    const c: CanaryState = raw ? JSON.parse(raw) : { service, environment, stableVersion: version, canaryWeightPercent:0, status:"idle", errorRate:0, latencyP95:0 };
    c.canaryVersion = version;
    c.canaryWeightPercent = 5;
    c.status = "ramping";
    c.startedAt = now();
    c.errorRate = 0.2; c.latencyP95 = 30;
    await redisCmd.set(key, JSON.stringify(c));
    return c;
  },
  async canarySetWeight(environment: string, service: string, weight: number): Promise<CanaryState> {
    await this.seed();
    const key = `${CANARY_PREFIX}${environment}:${service}`;
    const raw = await redisCmd.get(key); if (!raw) throw new Error("no canary state");
    const c: CanaryState = JSON.parse(raw);
    c.canaryWeightPercent = Math.max(0, Math.min(100, weight));
    c.status = c.canaryWeightPercent >= 100 ? "promoted" : c.canaryWeightPercent <= 0 ? "rolled-back" : "ramping";
    if (c.status === "promoted") { c.stableVersion = c.canaryVersion!; c.canaryVersion = undefined; c.canaryWeightPercent = 0; c.lastPromotedAt = now(); }
    if (c.status === "rolled-back") { c.canaryVersion = undefined; c.canaryWeightPercent = 0; }
    await redisCmd.set(key, JSON.stringify(c));
    return c;
  },
  async canaryGet(environment: string, service: string): Promise<CanaryState | null> {
    await this.seed();
    const r = await redisCmd.get(`${CANARY_PREFIX}${environment}:${service}`);
    return r ? JSON.parse(r) : null;
  },
};
