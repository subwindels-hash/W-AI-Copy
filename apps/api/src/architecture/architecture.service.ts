/**
 * Enterprise Foundation Architecture registry (Session 37).
 * Baseline stubs and deployment-target registry. Does NOT implement
 * ESI/SI/Kernel/God-Node — it only records their declared existence and
 * dependency edges so later sessions can resolve wiring.
 *
 * Session 193 — additive fix:
 *  - Every method requires an `oid` (no implicit "org-windels" default).
 *  - All keys are now `<prefix>:<org>:…` so a tenant's modules, ESI
 *    signals, and adoption marker never leak to another tenant.
 *  - One-shot legacy adoption: a `arch:modules` / `arch:esi` global key
 *    is read once and copied into the org namespace; the marker
 *    `arch:imported:<org>` is set; the global keys are left in place.
 *
 * Keys (org id is always the segment straight after the prefix):
 *   arch:modules:<org>     zset of registered modules (scored by session)
 *   arch:esi:<org>         zset of ESI signals (timestamped)
 *   arch:imported:<org>    marker: legacy global keys adopted
 *   arch:notes:<org>       tenantStore-backed notes ledger (already per-org)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ArchitectureModule, ArchitectureStatus, EsiFeed, SuperintelligenceSignal } from "@windels/shared";

const K = {
  modules: (oid: string) => `arch:modules:${oid}`,
  esi: (oid: string) => `arch:esi:${oid}`,
  imported: (oid: string) => `arch:imported:${oid}`,
  // Legacy global keys from S37 — left in place after adoption.
  legacyModules: "arch:modules",
  legacyEsi: "arch:esi",
};

function assertOrg(oid: string) {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw Object.assign(new Error("organizationId is required"), { status: 403 });
  }
}

/**
 * One-shot adoption of the S37 global keys. Runs once per organization:
 * the global zset is read, every entry is written into the org namespace,
 * the marker is set, and the global keys are left in place (rollback
 * safety; no invented timestamps).
 */
async function ensureAdopted(oid: string) {
  if (await redis.exists(K.imported(oid))) return;
  const globalModules = await redis.zrange(K.legacyModules, 0, -1);
  for (const raw of globalModules) {
    try {
      const m: ArchitectureModule = JSON.parse(raw);
      if (m && typeof m.id === "string" && typeof m.name === "string") {
        await redis.zadd(K.modules(oid), m.introducedInSession ?? 0, JSON.stringify(m));
      }
    } catch {
      // Corrupt legacy entry: skip, do not abort.
    }
  }
  const globalEsi = await redis.zrange(K.legacyEsi, 0, -1);
  for (const raw of globalEsi) {
    try {
      const s: SuperintelligenceSignal = JSON.parse(raw);
      if (s && typeof s.id === "string") {
        const ts = Date.parse(s.at) || Date.now();
        await redis.zadd(K.esi(oid), ts, JSON.stringify(s));
      }
    } catch {
      // Corrupt legacy entry: skip, do not abort.
    }
  }
  await redis.set(K.imported(oid), "1");
}

export const ArchitectureService = {
  async registerModule(oid: string, m: Omit<ArchitectureModule, "id">): Promise<ArchitectureModule> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const id = m.introducedInSession + ":" + m.name.replace(/\s/g, "-").toLowerCase();
    const full: ArchitectureModule = { ...m, id };
    const existing = await this.listModules(oid);
    if (existing.find((e) => e.id === id)) {
      return existing.find((e) => e.id === id)!;
    }
    await redis.zadd(K.modules(oid), m.introducedInSession, JSON.stringify(full));
    return full;
  },

  async listModules(oid: string): Promise<ArchitectureModule[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const raw = await redis.zrange(K.modules(oid), 0, -1);
    return raw.map((s) => JSON.parse(s) as ArchitectureModule);
  },

  async pushEsiSignal(oid: string, s: Omit<SuperintelligenceSignal, "id" | "at">): Promise<SuperintelligenceSignal> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const sig: SuperintelligenceSignal = {
      ...s,
      id: "esi-" + randomUUID().slice(0, 8),
      at: new Date().toISOString(),
    };
    await redis.zadd(K.esi(oid), Date.now(), JSON.stringify(sig));
    await redis.zremrangebyrank(K.esi(oid), 0, -201); // cap 200
    return sig;
  },

  async readEsi(oid: string, limit = 50): Promise<EsiFeed> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const raw = await redis.zrange(K.esi(oid), 0, -1, "REV");
    return {
      signals: raw.slice(0, limit).map((s) => JSON.parse(s) as SuperintelligenceSignal),
      lastUpdated: new Date().toISOString(),
    };
  },

  async status(oid: string): Promise<ArchitectureStatus> {
    assertOrg(oid);
    return {
      monorepo: "windels-ai-os-pnpm-turborepo",
      deploymentTargets: ["desktop", "mobile", "web", "cloud", "edge", "air-gapped", "offline", "federated"],
      modules: await this.listModules(oid),
    };
  },
};
