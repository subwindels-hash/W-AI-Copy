/**
 * Session 60 — Enterprise AI Training & Fine-Tuning Platform (V8).
 */

export const JOB_STATUS = ["queued", "preparing", "training", "evaluating", "governance_review", "canary", "deployed", "rolled_back", "failed", "paused"] as const;
export type TrainingJobStatus = typeof JOB_STATUS[number];

export const DATASET_FORMATS = ["jsonl", "csv", "parquet", "hf_dataset", "custom"] as const;
export type DatasetFormat = typeof DATASET_FORMATS[number];

export const TUNING_STRATEGIES = ["full", "lora", "qlora", "dpo", "rlhf", "rag_only", "prompt_only"] as const;
export type TuningStrategy = typeof TUNING_STRATEGIES[number];

export interface TrainingDataset {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  format: DatasetFormat;
  rows: number;
  sizeBytes: number;
  syntheticPct: number;
  cleaned: boolean;
  ragbuilderIncluded: boolean;
  governanceApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingJob {
  id: string;
  organizationId: string;
  name: string;
  baseModel: string;
  datasetId: string;
  strategy: TuningStrategy;
  hyperparams: { lr: number; epochs: number; batchSize: number; loraRank?: number };
  status: TrainingJobStatus;
  progressPct: number;
  evalScore?: number;
  safetyPassed?: boolean;
  canaryPct: number;
  targetModelId?: string;
  gpuHours: number;
  costEstimateUsd: number;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyCheck {
  id: string;
  jobId: string;
  category: "toxicity" | "hallucination" | "bias" | "pii" | "jailbreak" | "harm";
  score: number;
  threshold: number;
  passed: boolean;
  ranAt: string;
}

export interface ContinuousLearningPipeline {
  id: string;
  name: string;
  modelId: string;
  cadenceHours: number;
  datasetSource: string;
  lastRanAt?: string;
  nextRunAt?: string;
  enabled: boolean;
  status: "idle" | "running" | "paused" | "error";
}

export interface TrainingDashboard {
  datasets: number;
  jobsRunning: number;
  jobsQueued: number;
  jobsCompleted30d: number;
  jobsFailed30d: number;
  safetyChecksPassRate: number;
  canaryDeployments: number;
  clPipelines: number;
  gpuHoursUsed30d: number;
  costUsd30d: number;
  avgEvalScore: number;
  recentJobs: TrainingJob[];
  recentDatasets: TrainingDataset[];
}
