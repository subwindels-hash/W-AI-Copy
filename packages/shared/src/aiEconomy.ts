/** Session 71 — Enterprise AI Economy Platform */
export interface AiCredit {
  id: string;
  owner: string;
  balance: number;
  earned: number;
  spent: number;
  tier: "free"|"pro"|"enterprise"|"unlimited";
}

export interface ComputeOffer {
  id: string;
  provider: "internal"|"aws"|"gcp"|"azure"|"lambda_labs"|"peer";
  gpuType: string;
  vramGb: number;
  pricePerHour: number;
  region: string;
  available: boolean;
  utilizationPct: number;
}

export interface GpuAllocation {
  id: string;
  cluster: string;
  gpuType: string;
  assignedTo: string;
  job?: string;
  utilizationPct: number;
  vramUsedGb: number;
  costPerHour: number;
  startedAt: string;
}

export interface ResourceUsage {
  resource: "gpu"|"cpu"|"ram"|"storage"|"bandwidth"|"tokens";
  allocated: number;
  used: number;
  unit: string;
  costPerUnit: number;
  department: string;
}

export interface EconomyDashboard {
  creditsInCirculation: number;
  creditsSpent30d: number;
  creditsEarned30d: number;
  computeRevenue30d: number;
  computeCost30d: number;
  marginPct: number;
  gpuUtilizationPct: number;
  gpusAvailable: number;
  gpusTotal: number;
  activeAllocations: number;
  forecasts: Array<{ month: string; costUsd: number; usageTokens: number }>;
  topDepartments: Array<{ department: string; spend: number; credits: number }>;
  offers: ComputeOffer[];
  allocations: GpuAllocation[];
  usage: ResourceUsage[];
  marketplaceVolume30d: number;
}
