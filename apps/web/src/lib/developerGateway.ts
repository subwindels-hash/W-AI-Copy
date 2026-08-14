/**
 * Developer Gateway web client.
 *
 * The developer gateway extends the Session 120 public REST surface
 * (`/api/rest/v1`) with agent/workflow/knowledge/trading/media endpoints
 * authenticated by API key. For console use inside WINDELS itself we proxy
 * through the authenticated `/api/v1` surface — each gateway capability is
 * also reachable via the internal service layer; this client calls the
 * gateway itself so docs/playground/test-key flows work from the browser.
 */
import { api } from "./api";
import type {
  ApiAgentExecuteInput,
  ApiAgentExecuteResult,
  ApiWorkflowExecuteInput,
  ApiTradingAnalysisQuery,
} from "@windels/shared";
export type {
  ApiAgentExecuteInput,
  ApiAgentExecuteResult,
  ApiWorkflowExecuteInput,
  ApiTradingAnalysisQuery,
};

const REST = "/rest/v1";

export interface AiCompleteInput {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  system?: string;
  temperature?: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  startedAt?: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
}

export interface KnowledgeHit {
  id: string;
  title: string;
  snippet?: string;
  score?: number;
}

export interface MediaGenerationResult {
  id: string;
  kind: "image" | "audio" | "video";
  url?: string;
  status: "queued" | "ready" | "failed";
}

export const developerGatewayApi = {
  // ── AI completion ───────────────────────────────────────────────────
  aiComplete: (input: AiCompleteInput) =>
    api<{ text: string; model: string; usage?: { promptTokens?: number; completionTokens?: number } }>(
      `${REST}/ai/complete`,
      { method: "POST", json: input },
    ),

  // ── Agents ──────────────────────────────────────────────────────────
  listAgents: () => api<Array<{ id: string; name: string; description?: string }>>(`${REST}/agents`),
  executeAgent: (agentId: string, input: ApiAgentExecuteInput) =>
    api<ApiAgentExecuteResult>(`${REST}/agents/${encodeURIComponent(agentId)}/execute`, {
      method: "POST",
      json: input,
    }),

  // ── Workflows ───────────────────────────────────────────────────────
  executeWorkflow: (workflowId: string, input: ApiWorkflowExecuteInput) =>
    api<WorkflowRun>(`${REST}/workflows/${encodeURIComponent(workflowId)}/execute`, {
      method: "POST",
      json: input,
    }),
  listWorkflowRuns: (workflowId: string) =>
    api<WorkflowRun[]>(`${REST}/workflows/${encodeURIComponent(workflowId)}/runs`),
  cancelWorkflowRun: (workflowId: string, runId: string) =>
    api<{ ok: true }>(`${REST}/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
    }),

  // ── Knowledge ───────────────────────────────────────────────────────
  searchKnowledge: (q: string, opts?: { limit?: number }) =>
    api<{ query: string; hits: KnowledgeHit[] }>(
      `${REST}/knowledge/search?q=${encodeURIComponent(q)}${opts?.limit ? `&limit=${opts.limit}` : ""}`,
    ),

  // ── Trading ─────────────────────────────────────────────────────────
  tradingAnalysis: (query: ApiTradingAnalysisQuery) =>
    api<{ symbol: string; analysis: unknown }>(`${REST}/trading/analysis`, {
      method: "GET",
      // Use query-string serialization for GET; caller passes simple scalars.
    }),

  // ── Media ───────────────────────────────────────────────────────────
  generateMedia: (input: {
    modality: "image" | "audio" | "video";
    op: string;
    prompt: string;
    childTargeted?: boolean;
  }) =>
    api<MediaGenerationResult>(`${REST}/media/generate`, { method: "POST", json: input }),
};
