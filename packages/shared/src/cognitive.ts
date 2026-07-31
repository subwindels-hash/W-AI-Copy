/** Session 69 — Enterprise Cognitive Evolution & World Intelligence (V9.0) */
export const WORLD_MODEL_DOMAINS = [
  "enterprise","customers","projects","markets","competitors","supply_chain",
  "financial","regulatory","infrastructure","global_events","risk","industry_trends",
] as const;
export type WorldModelDomain = typeof WORLD_MODEL_DOMAINS[number];

export interface SelfEvolutionMetric {
  component: string;
  health: number;        // 0..1
  bottleneck?: string;
  autoFixes: number;
  lastOptimizedAt: string;
  recommendation?: string;
}

export interface DnaProfile {
  companyIdentity: string;
  culture: string[];
  brandPersonality: string[];
  objectives: string[];
  ethics: string[];
  riskAppetite: "conservative"|"moderate"|"aggressive";
  communicationStyle: string;
  vocabulary: string[];
  vision: string;
}

export interface FederationPartner {
  id: string;
  name: string;
  type: "enterprise"|"government"|"academic"|"supplier"|"partner";
  trustTier: "bronze"|"silver"|"gold"|"platinum";
  sharedDatasets: number;
  sharedModels: number;
  federatedJobs30d: number;
  status: "active"|"pending"|"suspended";
}

export interface ObservatoryNode {
  category: "ai_employees"|"workforce"|"memory"|"knowledge_graph"|"gpu"|"infra"|"processes"|"security"|"digihumans"|"workflows"|"services"|"events";
  healthy: boolean;
  count: number;
  alerts: number;
}

export interface ReasoningCapability {
  domain: "logical"|"mathematical"|"scientific"|"financial"|"legal"|"medical"|"engineering"|"strategic"|"executive"|"emotional"|"ethical"|"creative"|"systems"|"spatial"|"probabilistic";
  accuracy: number;
  latencyMs: number;
  calls24h: number;
}

export interface MemoryLayer { layer: string; entries: number; accesses24h: number; sizeGb: number; }
export interface InnovationProposal { id: string; title: string; category: string; projectedValueUsd: number; risk: "low"|"med"|"high"; status: "proposed"|"reviewing"|"approved"|"rejected"|"executing"; }
export interface CivilizationEntity { id: string; kind: "citizen"|"team"|"department"|"org"; name: string; members?: number; lead?: string; }
export interface WorldScenario { id: string; name: string; domain: WorldModelDomain; horizonMonths: number; outcomeP50: string; outcomeP90: string; confidence: number; }

export interface CognitiveDashboard {
  selfEvolutionHealth: number;
  autoFixes30d: number;
  activeBottlenecks: number;
  dnaCompleteness: number;
  marketplaceUnifiedAssets: number;
  federationPartners: number;
  observatoryHealthyPct: number;
  observabilityNodes: number;
  reasoningAccuracyAvg: number;
  globalMemoryEntries: number;
  innovationProposalsOpen: number;
  innovationPipelineValueUsd: number;
  civilizationEntities: number;
  worldScenariosTracked: number;
  predictionsMade30d: number;
  predictionAccuracyPct: number;
  components: SelfEvolutionMetric[];
  partners: FederationPartner[];
  observatory: ObservatoryNode[];
  reasoning: ReasoningCapability[];
  memoryLayers: MemoryLayer[];
  innovations: InnovationProposal[];
  scenarios: WorldScenario[];
}
