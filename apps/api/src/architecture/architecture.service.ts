/**
 * Enterprise Foundation Architecture registry (Session 37).
 * Baseline stubs and deployment-target registry. Does NOT implement
 * ESI/SI/Kernel/God-Node — it only records their declared existence and
 * dependency edges so later sessions can resolve wiring.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ArchitectureModule, ArchitectureStatus, EsiFeed, SuperintelligenceSignal } from "@windels/shared";

const K = { modules: "arch:modules", esi: "arch:esi" };

export const ArchitectureService = {
  async registerModule(m: Omit<ArchitectureModule,"id">): Promise<ArchitectureModule> {
    const existing = await this.listModules();
    if (existing.find(e => e.id === m.introducedInSession + ":" + m.name.replace(/\s/g,"-").toLowerCase())) {
      return existing.find(e => e.name === m.name)!;
    }
    const full: ArchitectureModule = { ...m, id: m.introducedInSession + ":" + m.name.replace(/\s/g,"-").toLowerCase() };
    await redis.zadd(K.modules, m.introducedInSession, JSON.stringify(full));
    return full;
  },
  async listModules(): Promise<ArchitectureModule[]> {
    const raw = await redis.zrange(K.modules, 0, -1);
    return raw.map(s => JSON.parse(s));
  },
  async pushEsiSignal(s: Omit<SuperintelligenceSignal,"id"|"at">): Promise<SuperintelligenceSignal> {
    const sig: SuperintelligenceSignal = { ...s, id: "esi-" + randomUUID().slice(0,8), at: new Date().toISOString() };
    await redis.zadd(K.esi, Date.now(), JSON.stringify(sig));
    await redis.zremrangebyrank(K.esi, 0, -201); // cap 200
    return sig;
  },
  async readEsi(limit = 50): Promise<EsiFeed> {
    const raw = await redis.zrange(K.esi, 0, -1, "REV");
    return { signals: raw.slice(0,limit).map(s => JSON.parse(s)), lastUpdated: new Date().toISOString() };
  },
  async status(): Promise<ArchitectureStatus> {
    return {
      monorepo: "windels-ai-os-pnpm-turborepo",
      deploymentTargets: ["desktop","mobile","web","cloud","edge","air-gapped","offline","federated"],
      modules: await this.listModules(),
    };
  },
};
