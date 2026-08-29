/**
 * Shared types — Session 47: Enterprise Memory Evolution Engine (V8.4 §2).
 *
 * Builds on S37 Memory Fabric + S39 Kernel Global Memory Coordination with
 * 9 memory types, consolidation, refinement, aging, confidence scoring,
 * intelligent forgetting, dedup, cross-agent sharing, historical recall,
 * context evolution, analytics.
 */

export type MeMemoryType = "episodic" | "semantic" | "procedural" | "organizational" | "department" | "project" | "user" | "team" | "knowledge";

export interface MeMemory {
  id: string;
  type: MeMemoryType;
  content: string;
  confidence: number;        // 0..1
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
  decayedStrength: number;  // 0..1 — aging factor
  tags: string[];
  scope: string;            // enterprise/dept/project/user/team id
}

export interface MeConsolidationJob {
  id: string;
  kind: "merge" | "deduplicate" | "refine" | "age" | "forget";
  processedAt: string;
  affected: number;
}

export interface MeDashboard {
  memoriesByType: Record<MeMemoryType, number>;
  total: number;
  avgConfidence: number;
  consolidationJobs24h: number;
  duplicatesMerged: number;
  memoriesForgotten: number;
  crossAgentShares: number;
  agingActive: boolean;
  intelligentForgettingActive: boolean;
  extendsS37Fabric: boolean;
}
