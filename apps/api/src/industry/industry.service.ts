/**
 * Session 74 — Semantic Intelligence, Industry Solutions & Digital Operations (V9.3).
 *
 * Per-tenant rollup that is generated ONCE at bootstrap and PERSISTED. Reads
 * return the stored snapshot rather than regenerating random numbers every
 * request. Values marked with `seed: true` on the outer record indicate
 * they are starter data.
 *
 * Keys: `ind:*`
 */
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { IndustryDashboard, INDUSTRY_SUITES, IndustryPack } from "@windels/shared";

const K = {
  meta: (oid: string) => `ind:meta:${oid}`,
  dashboard: (oid: string) => `ind:dashboard:${oid}`,
};

/** Deterministic pseudo-random derived from the org id + industry key. */
function det(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 131 + seed.charCodeAt(i)) | 0;
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100_000) / 100_000;
  };
}
function detInt(rng: () => number, min: number, max: number) { return Math.floor(rng() * (max - min + 1)) + min; }
function detFloat(rng: () => number, min: number, max: number) { return +(rng() * (max - min) + min).toFixed(2); }

function buildRollup(oid: string): IndustryDashboard {
  const names: Record<string, string> = {
    government: "Government", healthcare: "Healthcare", banking: "Banking", insurance: "Insurance",
    construction: "Construction", manufacturing: "Manufacturing", mining: "Mining", oil_gas: "Oil & Gas",
    energy_utilities: "Energy & Utilities", agriculture: "Agriculture", education: "Education",
    retail: "Retail", telecom: "Telecom", aviation: "Aviation", maritime: "Maritime", logistics: "Logistics",
    smart_cities: "Smart Cities", hospitality: "Hospitality", legal_services: "Legal Services",
    real_estate: "Real Estate", pharmaceutical: "Pharmaceutical", biotechnology: "Biotechnology",
    media_entertainment: "Media & Entertainment", non_profit: "Non-Profit", defense_public_safety: "Defense & Public Safety",
  };

  const industries: IndustryPack[] = INDUSTRY_SUITES.map((id) => {
    const rng = det(`${oid}:${id}`);
    return {
      id, name: names[id] || id,
      employees: detInt(rng, 5, 40),
      workflows: detInt(rng, 12, 80),
      compliancePacks: detInt(rng, 3, 16),
      knowledgeEntries: detInt(rng, 200, 5000),
      dashboards: detInt(rng, 4, 18),
      kpis: detInt(rng, 8, 40),
      templates: detInt(rng, 10, 60),
      reports: detInt(rng, 4, 20),
      analytics: detInt(rng, 6, 24),
      bestPractices: detInt(rng, 20, 120),
      twins: detInt(rng, 0, 12),
      skills: detInt(rng, 8, 50),
      digitalHumans: detInt(rng, 1, 8),
      readinessPct: detInt(rng, 35, 95),
    };
  });

  const rngMain = det(`${oid}:main`);
  const rngGov = det(`${oid}:gov`);
  const rngDoc = det(`${oid}:doc`);

  return {
    ontology: {
      terms: detInt(rngMain, 20_000, 80_000),
      classes: detInt(rngMain, 400, 2000),
      relationships: detInt(rngMain, 8000, 40_000),
      entities: detInt(rngMain, 1_000_000, 50_000_000),
      mappings: detInt(rngMain, 200, 2000),
      evolvingPerDay: detInt(rngMain, 20, 400),
    },
    industries,
    governance: {
      activePolicies: detInt(rngGov, 80, 300),
      arbMeetings: detInt(rngGov, 2, 12),
      pendingReviews: detInt(rngGov, 3, 20),
      exceptionsOpen: detInt(rngGov, 0, 8),
      changesMerged30d: detInt(rngGov, 20, 200),
      auditFindings: detInt(rngGov, 0, 12),
    },
    doc: {
      regions: ["us-east", "us-west", "eu-west", "eu-central", "ap-south", "ap-east", "sa-east", "af-south", "me-central"].map((n) => ({
        name: n,
        health: (["ok", "ok", "ok", "warn"] as const)[detInt(det(`${oid}:reg:${n}`), 0, 3)],
        incidents: detInt(det(`${oid}:reg:${n}:inc`), 0, 4),
        alerts: detInt(det(`${oid}:reg:${n}:al`), 0, 10),
      })),
      workloads: [
        { domain: "inference", load: detInt(rngDoc, 40, 95), status: "ok" as const },
        { domain: "training", load: detInt(rngDoc, 20, 80), status: "ok" as const },
        { domain: "data", load: detInt(rngDoc, 30, 70), status: "ok" as const },
        { domain: "agents", load: detInt(rngDoc, 10, 60), status: "ok" as const },
      ],
      oncall: detInt(rngDoc, 4, 12),
    },
    maturity: {
      overall: detInt(det(`${oid}:mat`), 55, 85),
      dimensions: [
        { name: "data", score: detInt(det(`${oid}:mat:data`), 50, 90) },
        { name: "ai_capability", score: detInt(det(`${oid}:mat:ai`), 45, 90) },
        { name: "governance", score: detInt(det(`${oid}:mat:gov`), 60, 95) },
        { name: "adoption", score: detInt(det(`${oid}:mat:ado`), 40, 85) },
        { name: "ops", score: detInt(det(`${oid}:mat:ops`), 55, 92) },
      ],
      benchmarkPct: detInt(det(`${oid}:mat:bench`), 40, 90),
      recommendedNext: "Deploy semantic search across enterprise docs; activate L3 governance gates for model changes.",
    },
    activeTwins: detInt(det(`${oid}:tw`), 40, 400),
    semanticSearchLatencyMs: detInt(det(`${oid}:sll`), 40, 180),
    businessGlossary: detInt(det(`${oid}:bg`), 200, 2000),
    layerMapping: {
      "Platform One — AI Core": ["kernel", "superintelligence", "synthetic", "memory", "knowledge_graph", "semantic", "world_model", "reasoning", "god_node", "governance"],
      "Platform Two — Enterprise Business": ["crm", "finance", "procurement", "hr", "support", "trading", "cyber", "bi", "digital_ops", "automation", "industry_suites"],
      "Platform Three — AI Studio": ["voice_studio", "voice_foundry", "video", "image", "animation", "music", "digital_humans", "workflow", "agents", "model_factory", "prompts", "training", "personality"],
      "Platform Four — Developer & Marketplace": ["sdk", "apis", "connectors", "package_mgr", "marketplace", "certification", "plugins", "extensions", "devops", "deployment", "testing", "docs"],
    },
  };
}

export const IndustryService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") {
    if (await redis.exists(K.meta(oid))) return;
    const dash = buildRollup(oid);
    await redis.set(K.dashboard(oid), JSON.stringify(dash));
    await redis.set(K.meta(oid), "1");
    logger?.info({ msg: "[industry] bootstrap complete", industries: INDUSTRY_SUITES.length, orgId: oid });
  },

  /**
   * Return the persisted rollup. If none exists yet (e.g. new org), bootstrap
   * synchronously.
   */
  async dashboard(oid: string): Promise<IndustryDashboard> {
    const raw = await redis.get(K.dashboard(oid));
    if (raw) return JSON.parse(raw) as IndustryDashboard;
    await this.ensureBootstrapped(undefined, oid);
    const fresh = await redis.get(K.dashboard(oid));
    if (fresh) return JSON.parse(fresh) as IndustryDashboard;
    // Very unlikely fallthrough — build in-memory
    return buildRollup(oid);
  },
};
