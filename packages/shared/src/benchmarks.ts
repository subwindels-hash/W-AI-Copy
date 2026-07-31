// Session 50 — Enterprise AI Benchmark Center (V8.4 §5)
// Prefix "Bm" to avoid collision with aiEcosystem.BenchmarkRun.

import { z } from "zod";

export const BM_AREAS = [
  "ai_models",
  "ai_employees",
  "ai_workflows",
  "voice_models",
  "vision_models",
  "translation_quality",
  "coding_performance",
  "response_accuracy",
  "latency",
  "resource_consumption",
  "cost_efficiency",
  "safety_metrics",
  "reliability",
  "user_satisfaction",
] as const;
export type BmArea = (typeof BM_AREAS)[number];

export interface BmMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  higherIsBetter: boolean;
  baseline?: number;
  target?: number;
}

export interface BmRun {
  id: string;
  organizationId: string;
  area: BmArea;
  targetId?: string;
  targetName: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  metrics: BmMetric[];
  overallScore: number;
  passed: boolean;
  notes?: string;
}

export interface BmScheduled {
  id: string;
  area: BmArea;
  targetId?: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface BmDashboard {
  totalRuns: number;
  completed24h: number;
  avgScore: number;
  passRate: number;
  leaderboard: Array<{ area: BmArea; targetName: string; overallScore: number; runs: number }>;
  areaScores: Record<BmArea, number>;
  recentRuns: BmRun[];
  feedbackToModelFactory: { optimizedModels: number; pendingRecommendations: number };
}

export const bmRunSchema = z.object({
  area: z.enum(BM_AREAS),
  targetId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const bmScheduleSchema = z.object({
  area: z.enum(BM_AREAS),
  targetId: z.string().optional(),
  cron: z.string().regex(/^[\d\-\*\/,\?\sA-Za-z]+$/).default("0 0 * * *"),
  enabled: z.boolean().default(true),
});
