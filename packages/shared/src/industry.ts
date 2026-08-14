/**
 * Session 74 / Session 169 — Semantic Intelligence, Industry Solutions & Digital Operations
 * - Enterprise Ontology & semantic KG
 * - 25 industry solution packs
 * - Real tenant-scoped industry adoption registry
 * - Governance lifecycle & Digital Operations Center
 * - Maturity framework with honest unmeasured nulls
 */

import { z } from "zod";

export const INDUSTRY_SUITES = [
  "government", "healthcare", "banking", "insurance", "construction", "manufacturing", "mining",
  "oil_gas", "energy_utilities", "agriculture", "education", "retail", "telecom", "aviation", "maritime",
  "logistics", "smart_cities", "hospitality", "legal_services", "real_estate", "pharmaceutical", "biotechnology",
  "media_entertainment", "non_profit", "defense_public_safety",
] as const;
export type IndustrySuite = typeof INDUSTRY_SUITES[number];

export const INDUSTRY_SUITE_NAMES: Record<IndustrySuite, string> = {
  government: "Government",
  healthcare: "Healthcare",
  banking: "Banking",
  insurance: "Insurance",
  construction: "Construction",
  manufacturing: "Manufacturing",
  mining: "Mining",
  oil_gas: "Oil & Gas",
  energy_utilities: "Energy & Utilities",
  agriculture: "Agriculture",
  education: "Education",
  retail: "Retail",
  telecom: "Telecom",
  aviation: "Aviation",
  maritime: "Maritime",
  logistics: "Logistics",
  smart_cities: "Smart Cities",
  hospitality: "Hospitality",
  legal_services: "Legal Services",
  real_estate: "Real Estate",
  pharmaceutical: "Pharmaceutical",
  biotechnology: "Biotechnology",
  media_entertainment: "Media & Entertainment",
  non_profit: "Non-Profit",
  defense_public_safety: "Defense & Public Safety",
};

export const INDUSTRY_ADOPTION_STATUSES = ["planned", "piloting", "adopted", "sunset"] as const;
export type IndustryAdoptionStatus = (typeof INDUSTRY_ADOPTION_STATUSES)[number];

export const IndustryAdoptionSchema = z.object({
  industry: z.string().min(2).max(64),
  packageName: z.string().min(2).max(200),
  status: z.enum(INDUSTRY_ADOPTION_STATUSES),
  employees: z.number().int().min(0).max(1_000_000),
  notes: z.string().max(2000).optional(),
});
export type CreateIndustryAdoptionInput = z.infer<typeof IndustryAdoptionSchema>;

export const IndustryAdoptionPatchSchema = IndustryAdoptionSchema.partial();
export type UpdateIndustryAdoptionInput = z.infer<typeof IndustryAdoptionPatchSchema>;

export interface IndustryAdoption {
  id: string;
  industry: string;
  packageName: string;
  status: IndustryAdoptionStatus;
  employees: number;
  notes?: string;
  createdAt: string;
}

export interface IndustryPack {
  id: IndustrySuite;
  name: string;
  employees: number;
  workflows: number;
  compliancePacks: number;
  knowledgeEntries: number;
  dashboards: number;
  kpis: number;
  templates: number;
  reports: number;
  analytics: number;
  bestPractices: number;
  twins: number;
  skills: number;
  digitalHumans: number;
  readinessPct: number | null;
  adoptionsCount?: number;
}

export interface OntologyStats {
  terms: number;
  classes: number;
  relationships: number;
  entities: number;
  mappings: number;
  evolvingPerDay: number;
}

export interface GovernanceLifecycle {
  activePolicies: number;
  arbMeetings: number;
  pendingReviews: number;
  exceptionsOpen: number;
  changesMerged30d: number;
  auditFindings: number;
}

export interface OperationsCenter {
  regions: Array<{ name: string; health: "ok" | "warn" | "crit"; incidents: number; alerts: number }>;
  workloads: Array<{ domain: string; load: number; status: string }>;
  oncall: number;
}

export interface IndMaturityScore {
  overall: number | null;
  dimensions: Array<{ name: string; score: number | null }>;
  benchmarkPct: number | null;
  recommendedNext: string;
}

export interface IndustryProvenance {
  source: "windels_telemetry" | "catalog_reference";
  metrics: {
    adoptionsCount: "measured" | "structural_zero";
    employeesCovered: "measured" | "structural_zero";
    ontologyEntities: "measured" | "structural_zero";
    semanticSearchLatencyMs: "measured" | "null_unmeasured";
    maturityScore: "measured" | "null_unmeasured";
  };
  collectedAt: string;
}

export interface IndustryDashboard {
  ontology: OntologyStats;
  industries: IndustryPack[];
  governance: GovernanceLifecycle;
  doc: OperationsCenter;
  maturity: IndMaturityScore;
  activeTwins: number;
  semanticSearchLatencyMs: number | null;
  businessGlossary: number;
  layerMapping: Record<string, string[]>;
  adoptions?: IndustryAdoption[];
  provenance: IndustryProvenance;
}
