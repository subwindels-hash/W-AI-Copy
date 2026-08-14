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

/**
 * S166 — `validated` was removed because nothing could ever assign it: validity
 * is computed from the graph on demand by `validate()` and never stored, so the
 * value was unreachable. `paused` was equally unassignable but names a real
 * operational need, so S166 implemented it rather than deleting it.
 */
export type ComposedWorkflowStatus = "draft" | "deployed" | "paused";

/** How a workflow came to exist. S166 — seeded examples must be identifiable. */
export type ComposerWorkflowSource = "operator_created" | "demo_seed";

export interface ComposedWorkflow {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  nodes: ComposerNode[];
  edges: ComposerEdge[];
  status: ComposedWorkflowStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastDeployedAt?: string;
  /** Runs that reached a real outcome. Queued runs are counted separately. */
  runs: number;
  /**
   * S166 — null until at least one run has been resolved by an executor.
   * Previously 0, which renders as "0ms average" — a measurement, not an
   * absence of one.
   */
  avgDurationMs: number | null;
  /**
   * S166 — null until at least one run has been resolved.
   *
   * This was a plain number seeded at 1, so a workflow that had never run
   * advertised a perfect record. The seed was later corrected to 0, which is
   * just as wrong in the other direction: 0 means "every run failed", not
   * "nothing has run".
   */
  successRate: number | null;
  /** Triggered but not yet resolved by an executor. */
  queuedRuns: number;
  source: ComposerWorkflowSource;
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
  pausedWorkflows: number;
  /** Every run ever triggered, resolved or not. */
  totalRuns: number;
  /** Runs an executor has reported an outcome for. */
  resolvedRuns: number;
  /** Triggered and still awaiting an outcome. Nothing in this repo executes
   *  composer workflows, so on most installations this is the whole total. */
  queuedRuns: number;
  failedRuns: number;
  /** Workflows with at least one resolved run — the denominator of successRate. */
  workflowsWithRuns: number;
  /**
   * S166 — null when no run has ever been resolved.
   *
   * Was `totalRuns ? succ/totalRuns : 1`, so an organization that had never run
   * anything reported a 100% success rate. The UI compounded it with
   * `(d.successRate||1)`, which also turned a real 0% — everything failed —
   * into 100%.
   */
  successRate: number | null;
  /** Workflow rows whose stored document could not be parsed. Surfaced rather
   *  than deleted: S166 removed a bootstrap branch that wiped them. */
  unreadableWorkflows: number;
  popularCapabilities: Array<{ type: ComposerCapabilityType; uses: number }>;
  library: ComposerLibraryEntry[];
}

export interface ComposerValidationResult {
  valid: boolean;
  errors: Array<{ nodeId?: string; edgeId?: string; message: string }>;
  warnings: string[];
  capabilityCount: number;
  /**
   * S166 — null. This was `capabilityCount * 0.002` and rendered in the console
   * as "est $0.0000/run". No pricing table exists anywhere in the module, and
   * the formula charged a video-generation node the same as an analytics event.
   * A fabricated number denominated in dollars is worse than no number.
   */
  estimatedCostPerRun: number | null;
  /** False until per-capability rates exist somewhere real. */
  costModelConfigured: boolean;
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
