/** Session 74 — Semantic Intelligence, Industry Solutions & Digital Operations (V9.3)
 * - Enterprise Ontology & semantic KG
 * - 25 industry solution packs
 * - Governance lifecycle
 * - Digital Operations Center (24/7 ops layer)
 * - Maturity/adoption framework
 */

export const INDUSTRY_SUITES = [
  "government","healthcare","banking","insurance","construction","manufacturing","mining",
  "oil_gas","energy_utilities","agriculture","education","retail","telecom","aviation","maritime",
  "logistics","smart_cities","hospitality","legal_services","real_estate","pharmaceutical","biotechnology",
  "media_entertainment","non_profit","defense_public_safety",
] as const;
export type IndustrySuite = typeof INDUSTRY_SUITES[number];

export interface IndustryPack {
  id: IndustrySuite; name: string; employees: number; workflows: number; compliancePacks: number;
  knowledgeEntries: number; dashboards: number; kpis: number; templates: number;
  reports: number; analytics: number; bestPractices: number; twins: number; skills: number;
  digitalHumans: number; readinessPct: number;
}

export interface OntologyStats { terms: number; classes: number; relationships: number; entities: number; mappings: number; evolvingPerDay: number; }
export interface GovernanceLifecycle { activePolicies: number; arbMeetings: number; pendingReviews: number; exceptionsOpen: number; changesMerged30d: number; auditFindings: number; }
export interface OperationsCenter { regions: Array<{name:string;health:"ok"|"warn"|"crit";incidents:number;alerts:number}>; workloads: Array<{domain:string;load:number;status:string}>; oncall: number; }
export interface IndMaturityScore { overall: number; dimensions: Array<{name:string;score:number}>; benchmarkPct: number; recommendedNext: string; }

export interface IndustryDashboard {
  ontology: OntologyStats;
  industries: IndustryPack[];
  governance: GovernanceLifecycle;
  doc: OperationsCenter;
  maturity: IndMaturityScore;
  activeTwins: number;
  semanticSearchLatencyMs: number;
  businessGlossary: number;
  layerMapping: Record<string,string[]>;
}
