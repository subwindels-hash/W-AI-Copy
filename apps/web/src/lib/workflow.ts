import { api } from "./api";

export type NodeType =
  | "TRIGGER"
  | "ACTION"
  | "AI"
  | "CONDITION"
  | "LOOP"
  | "APPROVAL"
  | "DELAY"
  | "END";

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  config: Record<string, any>;
}

export interface FlowEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  condition?: string;
}

export interface WorkflowTrigger {
  type: "manual" | "schedule" | "event" | "webhook";
  config: Record<string, any>;
}

export interface WorkflowSettings {
  retryCount?: number;
  retryDelayMs?: number;
  agentId?: string;
  notifyOnFailure?: boolean;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "active" | "paused" | "archived";
  triggers: WorkflowTrigger[];
  settings: WorkflowSettings;
  runsCount: number;
  successCount: number;
  failureCount: number;
  lastRunAt?: string | null;
  createdBy: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status:
    | "queued"
    | "running"
    | "waiting_approval"
    | "succeeded"
    | "failed"
    | "cancelled";
  triggerType: string;
  startedAt?: string | null;
  endedAt?: string | null;
  error?: string | null;
  createdBy?: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  input: Record<string, any>;
  output: Record<string, any>;
  nodeRuns: Array<{
    nodeId: string;
    label: string;
    type: string;
    status: string;
    attempts: number;
    durationMs: number;
    output?: any;
    error?: string | null;
  }>;
}

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export async function listWorkflows(params?: { page?: number; perPage?: number; status?: string }) {
  return api<Paginated<WorkflowSummary>>("/workflows", { method: "GET", params });
}

export async function getWorkflow(id: string) {
  return api<WorkflowDetail>(`/workflows/${id}`, { method: "GET" });
}

export async function createWorkflow(input: {
  name: string;
  description?: string;
  workspaceId?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  triggers?: WorkflowTrigger[];
  settings?: WorkflowSettings;
}) {
  return api<WorkflowDetail>("/workflows", { method: "POST", json: input });
}

export async function updateWorkflow(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    nodes: FlowNode[];
    edges: FlowEdge[];
    triggers: WorkflowTrigger[];
    settings: WorkflowSettings;
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  }>
) {
  return api<WorkflowDetail>(`/workflows/${id}`, { method: "PATCH", json: input });
}

export async function deleteWorkflow(id: string) {
  return api<void>(`/workflows/${id}`, { method: "DELETE" });
}

export async function runWorkflow(
  id: string,
  input: { input?: Record<string, any>; triggerType?: "manual" | "schedule" | "event" | "webhook"; triggerData?: Record<string, any> } = {}
) {
  return api<{ runId: string; status: string; nodeRuns: any[] }>(`/workflows/${id}/run`, {
    method: "POST",
    json: { input: input.input ?? {}, triggerType: input.triggerType ?? "manual", triggerData: input.triggerData ?? {} },
  });
}

export async function listRuns(params?: { page?: number; perPage?: number; workflowId?: string; status?: string }) {
  return api<Paginated<WorkflowRunSummary>>("/workflows/runs/list", { method: "GET", params });
}

export async function getRun(id: string) {
  return api<WorkflowRunDetail>(`/workflows/runs/${id}`, { method: "GET" });
}

export async function approveRun(id: string, approved: boolean, feedback?: string) {
  return api<{ ok: boolean }>(`/workflows/runs/${id}/approve`, {
    method: "POST",
    json: { approved, feedback },
  });
}

export async function cancelRun(id: string) {
  return api<void>(`/workflows/runs/${id}/cancel`, { method: "POST" });
}

// ─── Node templates for palette ────────────────────────────────
export interface NodeTemplate {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultConfig: Record<string, any>;
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  { type: "TRIGGER", label: "Trigger", description: "Start the workflow (manual, schedule, event, webhook)", icon: "⚡", color: "#F59E0B", defaultConfig: { trigger: "manual" } },
  { type: "ACTION", label: "Action", description: "Send message, create task, HTTP request, log, or action item", icon: "▶", color: "#3B82F6", defaultConfig: { action: "log", message: "" } },
  { type: "AI", label: "AI Step", description: "Run an AI prompt against the current context", icon: "✦", color: "#8B5CF6", defaultConfig: { modelId: "", prompt: "", systemPrompt: "" } },
  { type: "CONDITION", label: "Condition", description: "Branch the flow based on a simple expression", icon: "◇", color: "#14B8A6", defaultConfig: { expr: "input.go == true" } },
  { type: "LOOP", label: "Loop", description: "Iterate over a list from context (max 20 items)", icon: "↻", color: "#D946EF", defaultConfig: { collectionPath: "items" } },
  { type: "APPROVAL", label: "Approval", description: "Pause and wait for a human to approve/reject", icon: "✓", color: "#10B981", defaultConfig: { requireHuman: true, prompt: "Please approve this step" } },
  { type: "DELAY", label: "Delay", description: "Wait before proceeding (max 60s in MVP)", icon: "⏱", color: "#64748B", defaultConfig: { delayMs: 1000 } },
  { type: "END", label: "End", description: "Mark the workflow complete", icon: "■", color: "#DC2626", defaultConfig: {} },
];

export function newNodeId() {
  return `n_${Math.random().toString(36).slice(2, 9)}`;
}
export function newEdgeId() {
  return `e_${Math.random().toString(36).slice(2, 9)}`;
}
