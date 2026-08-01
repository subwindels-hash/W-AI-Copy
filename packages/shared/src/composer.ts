// Session 49 — AI Capability Composer (V8.4 §4)
// Visual, no-code capability composition. Composes primitives from prior sessions.

import { z } from "zod";

export const COMPOSER_CAPABILITY_TYPES = [
  "ocr",
  "vision_analysis",
  "translation",
  "voice_generation",
  "video_generation",
  "knowledge_retrieval",
  "ai_reasoning",
  "crm_action",
  "workflow_automation",
  "notification",
  "analytics",
] as const;
export type ComposerCapabilityType = (typeof COMPOSER_CAPABILITY_TYPES)[number];

export const NODE_KINDS = ["trigger", "capability", "logic", "output"] as const;
export type ComposerNodeKind = (typeof NODE_KINDS)[number];

export interface ComposerNode {
  id: string;
  kind: ComposerNodeKind;
  type?: ComposerCapabilityType; // for capability nodes
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

export interface ComposerEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface ComposedWorkflow {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  nodes: ComposerNode[];
  edges: ComposerEdge[];
  status: "draft" | "validated" | "deployed" | "paused";
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastDeployedAt?: string;
  runs: number;
  avgDurationMs: number;
  successRate: number;
}

export interface ComposerLibraryEntry {
  type: ComposerCapabilityType;
  label: string;
  description: string;
  sourceSession: string;
  icon: string;
  inputs: string[];
  outputs: string[];
}

export interface ComposerDashboard {
  totalWorkflows: number;
  deployedWorkflows: number;
  draftWorkflows: number;
  totalRuns: number;
  successRate: number;
  popularCapabilities: Array<{ type: ComposerCapabilityType; uses: number }>;
  library: ComposerLibraryEntry[];
}

export interface ComposerValidationResult {
  valid: boolean;
  errors: Array<{ nodeId?: string; edgeId?: string; message: string }>;
  warnings: string[];
  capabilityCount: number;
  estimatedCostPerRun: number;
}

/**
 * Outcome of a composer workflow run.
 *
 * `queued` exists because triggering a run does not execute it: node execution
 * belongs to the workflow engine, which reports back separately. The service
 * previously recorded `succeeded` immediately and fed that into the stored
 * successRate, so a workflow that had never run anything showed 100% success.
 * A run is `queued` until something actually reports an outcome.
 */
export type ComposerRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface ComposerRunLog {
  id: string;
  workflowId: string;
  startedAt: string;
  completedAt?: string;
  status: ComposerRunStatus;
  durationMs: number;
  stepCount: number;
  triggeredBy: string;
  /** Present when an executor reported the outcome; absent while queued. */
  reportedBy?: string;
}

/** Result an executor posts back once it has actually run the workflow. */
export interface ComposerRunOutcome {
  status: "succeeded" | "failed";
  durationMs?: number;
  reportedBy: string;
}

export const upsertWorkflowSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  nodes: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(NODE_KINDS),
      type: z.enum(COMPOSER_CAPABILITY_TYPES).optional(),
      label: z.string(),
      x: z.number(),
      y: z.number(),
      config: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      label: z.string().optional(),
      condition: z.string().optional(),
    }),
  ),
});

export const runWorkflowSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
});
