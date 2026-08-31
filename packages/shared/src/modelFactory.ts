/**
 * Shared types — Session 46: Enterprise AI Model Factory (V8.4 §1).
 *
 * Extends S43 model registry (same registry, no fork) with full lifecycle:
 * research → validation → approval → deployment → monitoring → retirement.
 * Builders for SLM/LLM/vision/speech/audio/multimodal/domain; fine-tuning, RL,
 * distillation, compression, quantization, auto-benchmarks, safety eval,
 * governance approval, canary, rollback, continuous monitoring.
 */

export type Mf2Stage = "research" | "benchmarking" | "validation" | "approval" | "canary" | "deployed" | "monitoring" | "retired";
export type Mf2BuilderKind = "slm" | "llm" | "vision" | "speech" | "audio" | "multimodal" | "domain";

export interface Mf2Model {
  id: string;
  name: string;
  builder: Mf2BuilderKind;
  stage: Mf2Stage;
  baseModelId?: string;
  size: string;
  quant: string;
  vramMb: number;
  benchmarkScore?: number;
  safetyPassed?: boolean;
  governanceApproved?: boolean;
  canaryPct?: number; // 0–100
  versions: number;
  createdAt: string;
}

export interface Mf2FineTuneJob {
  id: string;
  modelId: string;
  dataset: string;
  method: "supervised" | "rlhf" | "dpo" | "lora" | "qlora";
  status: "queued" | "running" | "evaluating" | "complete" | "failed";
  progressPct: number;
  startedAt?: string;
}

export interface Mf2BenchmarkResult {
  id: string;
  modelId: string;
  benchmark: string;
  score: number;
  pass: boolean;
  at: string;
}

/**
 * An annotation on the factory itself — Node's tenantStore ledger behind the
 * `/notes` routes. The payload is deliberately three fields: a title, a body
 * and tags. It is not a model field and it is not derived from anything, so
 * nothing in the dashboard counts it.
 */
export interface Mf2Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  createdBy?: string;
}

export interface Mf2Dashboard {
  totalModels: number;
  byStage: Record<Mf2Stage, number>;
  activeFineTunes: number;
  benchmarksPassedPct: number;
  canaryActive: boolean;
  governanceBlocking: number;
  safetyEvaluations: number;
  extendsS43Registry: boolean;
}
