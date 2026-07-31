/**
 * Session 64 — Enterprise Sustainability & ESG Intelligence.
 * Carbon, ESG reporting, energy, water, waste, supply chain, green AI monitoring.
 */

export interface EsgScore {
  environmental: number; // 0..100
  social: number;
  governance: number;
  overall: number;
  trend: "up" | "down" | "flat";
}

export interface EmissionsSource {
  id: string;
  category: "scope1" | "scope2" | "scope3";
  source: string;
  tCO2e: number;
  changePct: number;
}

export interface EnergyMetric {
  period: string;     // YYYY-MM
  kwh: number;
  renewablePct: number;
  costUsd: number;
  pue?: number;
}

export interface ResourceMetric {
  label: string;
  waterML: number;      // megaliters
  wasteT: number;       // tonnes
  recycledPct: number;
}

export interface SupplyChainSupplier {
  id: string;
  name: string;
  esgScore: number;
  riskLevel: "low" | "medium" | "high";
  carbonIntensity: number; // kgCO2e/$
}

export interface GreenAiMetric {
  workload: string;
  gpuHours: number;
  kwh: number;
  co2eKg: number;
  optimizedPct: number;
}

export interface SustainabilityDashboard {
  scores: EsgScore;
  emissionsTotalTCO2e: number;
  emissionsYtdChangePct: number;
  energyRenewablePct: number;
  waterMl: number;
  wasteRecycledPct: number;
  offsetsPurchasedT: number;
  netZeroTargetYear: number;
  emissionsBySource: EmissionsSource[];
  energySeries: EnergyMetric[]; // last 12 months
  resources: ResourceMetric[];
  suppliers: SupplyChainSupplier[];
  greenAi: GreenAiMetric[];
  reportingFrameworks: Array<{ name: string; lastReportedAt: string; status: "on_track" | "at_risk" | "overdue" }>;
}
