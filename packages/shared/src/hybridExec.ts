/**
 * Shared types — Session 43: Hybrid AI Execution & Model/Compute Management.
 *
 * Three execution modes (self-hosted / hybrid / connected-enterprise), model
 * registry extending S38, GPU scheduling, canary/rollback, policy routing.
 */

export type HxExecutionMode = "self-hosted" | "hybrid" | "connected-enterprise";
export type HxModelStatus = "registered" | "benchmarking" | "canary" | "deployed" | "deprecated" | "retired";

export interface HxModel {
  id: string;
  name: string;
  modality: "text" | "image" | "audio" | "video" | "speech" | "multimodal" | "embedding" | "vision";
  size: string;        // e.g., "7B", "400M", "sdxl-1.0"
  quant: string;       // fp16/q8/q4/gguf/etc.
  vramMb: number;
  provider: "self-hosted" | "connected-enterprise";
  status: HxModelStatus;
  benchmarkScore?: number;
  registeredAt: string;
  canaryPct?: number;
  versions?: number;
}

export interface HxGpuNode {
  id: string;
  name: string;
  vramTotalMb: number;
  vramUsedMb: number;
  utilPct: number;
  activeJobs: number;
  online: boolean;
}

export interface HxRouteDecision {
  requestId: string;
  mode: HxExecutionMode;
  targetModel: string;
  targetNode?: string;
  reason: string;
  fallbackAvailable: boolean;
}

export interface HxDashboard {
  modes: HxExecutionMode[];
  activeMode: HxExecutionMode;
  modelsRegistered: number;
  modelsDeployed: number;
  gpuNodes: number;
  gpuUtilizationPct: number;
  canaryActive: boolean;
  rollbacks24h: number;
  costOptimization: boolean;
  vendorNeutral: boolean;
  routedThroughKernel: boolean;
}
