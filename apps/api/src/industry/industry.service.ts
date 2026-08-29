/**
 * Session 74 / Session 169 — Semantic Intelligence, Industry Solutions & Digital Operations.
 * Ontology + 25 industry packs + governance lifecycle + DOC + maturity.
 * Keys: ind:*
 */
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import {
  IndustryDashboard,
  INDUSTRY_SUITES,
  INDUSTRY_SUITE_NAMES,
  IndustryPack,
  IndMaturityScore,
  IndustryAdoption,
  IndustryAdoptionStatus,
  CreateIndustryAdoptionInput,
  UpdateIndustryAdoptionInput,
  IndustryProvenance,
} from "@windels/shared";
import { tenantStore } from "../utils/tenantStore.js";
import { demoDataEnabled } from "../config/demoData.js";

const K = {
  meta: (oid: string) => `ind:meta:${oid}`,
};

export const industryAdoptionsStore = tenantStore<{
  industry: string;
  packageName: string;
  status: IndustryAdoptionStatus;
  employees: number;
  notes?: string;
}>({ prefix: "ind:adopt", idPrefix: "ind-" });

/**
 * Maturity is an assessment, not an assumed measurement.
 * Until one is explicitly conducted, dimensions report null.
 */
function maturity(): IndMaturityScore {
  return {
    overall: null,
    dimensions: [
      { name: "data", score: null },
      { name: "ai_capability", score: null },
      { name: "governance", score: null },
      { name: "adoption", score: null },
      { name: "ops", score: null },
    ],
    benchmarkPct: null,
    recommendedNext: "Run an industry maturity assessment to evaluate organization readiness.",
  };
}

function buildIndustryPacks(adoptions: IndustryAdoption[]): IndustryPack[] {
  // Aggregate per-suite employee counts and workflow deployments from real tenant adoptions.
  return INDUSTRY_SUITES.map((id) => {
    const matching = adoptions.filter(
      (a) => a.industry.toLowerCase() === id.toLowerCase() || a.industry.toLowerCase() === (INDUSTRY_SUITE_NAMES[id] || "").toLowerCase()
    );
    const employees = matching.reduce((sum, a) => sum + (a.employees || 0), 0);
    const workflows = matching.filter((a) => a.status === "adopted" || a.status === "piloting").length;
    const readinessPct = matching.length > 0
      ? Math.min(100, Math.round(matching.reduce((acc, a) => {
          if (a.status === "adopted") return acc + 100;
          if (a.status === "piloting") return acc + 50;
          if (a.status === "planned") return acc + 25;
          return acc;
        }, 0) / matching.length))
      : null;

    return {
      id,
      name: INDUSTRY_SUITE_NAMES[id] || id,
      employees,
      workflows,
      compliancePacks: 0,
      knowledgeEntries: 0,
      dashboards: 0,
      kpis: 0,
      templates: 0,
      reports: 0,
      analytics: 0,
      bestPractices: 0,
      twins: 0,
      skills: 0,
      digitalHumans: 0,
      readinessPct,
      adoptionsCount: matching.length,
    };
  });
}

function buildProvenance(adoptionsCount: number): IndustryProvenance {
  return {
    source: "windels_telemetry",
    metrics: {
      adoptionsCount: adoptionsCount > 0 ? "measured" : "structural_zero",
      employeesCovered: adoptionsCount > 0 ? "measured" : "structural_zero",
      ontologyEntities: "structural_zero",
      semanticSearchLatencyMs: "null_unmeasured",
      maturityScore: "null_unmeasured",
    },
    collectedAt: new Date().toISOString(),
  };
}

export const IndustryService = {
  async ensureBootstrapped(logger?: Logger, oid?: string): Promise<void> {
    if (!oid) return;
    if (await redis.exists(K.meta(oid))) return;

    if (demoDataEnabled()) {
      const existing = await industryAdoptionsStore.list(oid, 10);
      if (existing.length === 0) {
        await industryAdoptionsStore.create(oid, {
          industry: "healthcare",
          packageName: "Clinical Workflow & EHR Intelligence Pack",
          status: "piloting",
          employees: 120,
          notes: "Pilot deployment in radiology department.",
        }, "seed-admin");

        await industryAdoptionsStore.create(oid, {
          industry: "banking",
          packageName: "Financial Fraud Sentinel & AML Copilot",
          status: "adopted",
          employees: 450,
          notes: "Full production rollout across compliance team.",
        }, "seed-admin");
      }
    }

    await redis.set(K.meta(oid), "1");
    logger?.info({ msg: "[industry] bootstrap complete", oid, industries: INDUSTRY_SUITES.length });
  },

  async dashboard(oid: string): Promise<IndustryDashboard> {
    // Standing protocol: Read path must never be a seeder. ensureBootstrapped is not called here.
    const rawAdoptions = await industryAdoptionsStore.list(oid, 200);
    const adoptionsList: IndustryAdoption[] = rawAdoptions.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      industry: a.data.industry,
      packageName: a.data.packageName,
      status: a.data.status,
      employees: a.data.employees,
      notes: a.data.notes,
    }));

    const industries = buildIndustryPacks(adoptionsList);

    return {
      ontology: { terms: 0, classes: 0, relationships: 0, entities: 0, mappings: 0, evolvingPerDay: 0 },
      industries,
      governance: { activePolicies: 0, arbMeetings: 0, pendingReviews: 0, exceptionsOpen: 0, changesMerged30d: 0, auditFindings: 0 },
      doc: { regions: [], workloads: [], oncall: 0 },
      maturity: maturity(),
      activeTwins: 0,
      semanticSearchLatencyMs: null, // Honest null: no semantic search query measured on dashboard load
      businessGlossary: 0,
      layerMapping: {
        "Platform One — AI Core": ["kernel", "superintelligence", "synthetic", "memory", "knowledge_graph", "semantic", "world_model", "reasoning", "god_node", "governance"],
        "Platform Two — Enterprise Business": ["crm", "finance", "procurement", "hr", "support", "trading", "cyber", "bi", "digital_ops", "automation", "industry_suites"],
        "Platform Three — AI Studio": ["voice_studio", "voice_foundry", "video", "image", "animation", "music", "digital_humans", "workflow", "agents", "model_factory", "prompts", "training", "personality"],
        "Platform Four — Developer & Marketplace": ["sdk", "apis", "connectors", "package_mgr", "marketplace", "certification", "plugins", "extensions", "devops", "deployment", "testing", "docs"],
      },
      adoptions: adoptionsList,
      provenance: buildProvenance(adoptionsList.length),
    };
  },

  async listAdoptions(oid: string, limit = 200): Promise<IndustryAdoption[]> {
    const raw = await industryAdoptionsStore.list(oid, limit);
    return raw.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      industry: a.data.industry,
      packageName: a.data.packageName,
      status: a.data.status,
      employees: a.data.employees,
      notes: a.data.notes,
    }));
  },

  async getAdoption(oid: string, id: string): Promise<IndustryAdoption | null> {
    const raw = await industryAdoptionsStore.get(oid, id);
    if (!raw) return null;
    return {
      id: raw.id,
      createdAt: raw.createdAt,
      industry: raw.data.industry,
      packageName: raw.data.packageName,
      status: raw.data.status,
      employees: raw.data.employees,
      notes: raw.data.notes,
    };
  },

  async createAdoption(oid: string, input: CreateIndustryAdoptionInput, userId?: string): Promise<IndustryAdoption> {
    const raw = await industryAdoptionsStore.create(oid, input, userId);
    return {
      id: raw.id,
      createdAt: raw.createdAt,
      industry: raw.data.industry,
      packageName: raw.data.packageName,
      status: raw.data.status,
      employees: raw.data.employees,
      notes: raw.data.notes,
    };
  },

  async updateAdoption(oid: string, id: string, patch: UpdateIndustryAdoptionInput): Promise<IndustryAdoption | null> {
    const raw = await industryAdoptionsStore.update(oid, id, patch);
    if (!raw) return null;
    return {
      id: raw.id,
      createdAt: raw.createdAt,
      industry: raw.data.industry,
      packageName: raw.data.packageName,
      status: raw.data.status,
      employees: raw.data.employees,
      notes: raw.data.notes,
    };
  },

  async deleteAdoption(oid: string, id: string): Promise<boolean> {
    return await industryAdoptionsStore.delete(oid, id);
  },

  listSuites(): Array<{ id: string; name: string }> {
    return INDUSTRY_SUITES.map((id) => ({ id, name: INDUSTRY_SUITE_NAMES[id] || id }));
  },
};
