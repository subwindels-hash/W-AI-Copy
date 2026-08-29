/**
 * Session 20 — AI Workforce Communication API client.
 *
 * Mirrors apps/api/src/http/routes/agentComm.ts — all routes are mounted
 * under /api/v1/agents/comm/*.
 */
import { api } from "./api";
import type {
  AgentIdentity, AgentLifecycle, AgentCredential, AgentCapability,
  CommEnvelope, CommMessageType, CommPriority,
  AgentTeam, TaskHandoff, TeamRole,
  ReasoningArtifact, ReasoningStatus,
  AgentFeedback, FeedbackKind, AgentPerformanceMetric,
  EscalationPolicy, Escalation, EscalationStatus,
  AgentCommStats,
} from "@windels/shared/agentComm";

export type {
  AgentIdentity, AgentLifecycle, AgentCredential, AgentCapability,
  CommEnvelope, CommMessageType, CommPriority,
  AgentTeam, TaskHandoff, TeamRole,
  ReasoningArtifact, ReasoningStatus,
  AgentFeedback, FeedbackKind, AgentPerformanceMetric,
  EscalationPolicy, Escalation, EscalationStatus,
  AgentCommStats,
} from "@windels/shared/agentComm";

export const agentCommApi = {
  // ── Identities ─────────────────────────────────────────────────
  listIdentities: () =>
    api<{ identities: AgentIdentity[] }>("/agents/comm/identities"),
  getIdentity: (agentId: string) =>
    api<AgentIdentity>(`/agents/comm/identities/${agentId}`),
  updateIdentity: (agentId: string, patch: Partial<AgentIdentity>) =>
    api<AgentIdentity>(`/agents/comm/identities/${agentId}`, { method: "PATCH", json: patch }),
  transitionLifecycle: (agentId: string, to: AgentLifecycle) =>
    api<AgentIdentity>(`/agents/comm/identities/${agentId}/lifecycle`, { method: "POST", json: { to } }),
  attestCapability: (agentId: string, cap: Omit<AgentCapability, "attestedAt">) =>
    api<AgentIdentity>(`/agents/comm/identities/${agentId}/capabilities`, { method: "POST", json: cap }),
  mintCredential: (agentId: string, scopes: string[], ttlDays?: number) =>
    api<{ credential: AgentCredential; rawKey: string }>(
      `/agents/comm/identities/${agentId}/credentials`, { method: "POST", json: { scopes, ttlDays } },
    ),
  revokeCredential: (agentId: string, credentialId: string) =>
    api<AgentIdentity>(`/agents/comm/identities/${agentId}/credentials/${credentialId}`, { method: "DELETE" }),

  // ── Messaging ──────────────────────────────────────────────────
  sendMessage: (input: {
    from: string; to: string; type: CommMessageType; subject: string;
    payload?: Record<string, unknown>; priority?: CommPriority;
    correlationId?: string; causationId?: string; reasoningChainId?: string;
    ttlMs?: number; requiresAck?: boolean; metadata?: Record<string, unknown>;
  }) => api<CommEnvelope>("/agents/comm/messages", { method: "POST", json: input }),
  inbox: (agentId: string, limit = 50) =>
    api<{ messages: CommEnvelope[] }>(`/agents/comm/messages/inbox/${agentId}`, { params: { limit } }).then((r) => r.messages),
  outbox: (agentId: string, limit = 50) =>
    api<{ messages: CommEnvelope[] }>(`/agents/comm/messages/outbox/${agentId}`, { params: { limit } }).then((r) => r.messages),
  history: () =>
    api<{ messages: CommEnvelope[] }>("/agents/comm/messages/history").then((r) => r.messages),

  // ── Teams ──────────────────────────────────────────────────────
  listTeams: () => api<{ teams: AgentTeam[] }>("/agents/comm/teams").then((r) => r.teams),
  createTeam: (input: { name: string; mission: string; department?: string; coordinatorId?: string; members?: Array<{ agentId: string; role?: TeamRole; skills?: string[]; capacity?: number }>; metadata?: Record<string, unknown> }) =>
    api<AgentTeam>("/agents/comm/teams", { method: "POST", json: input }),
  getTeam: (id: string) => api<AgentTeam>(`/agents/comm/teams/${id}`),
  teamMemberOp: (id: string, input: { agentId: string; op: "add" | "remove" | "role"; role?: TeamRole; skills?: string[]; capacity?: number }) =>
    api<AgentTeam>(`/agents/comm/teams/${id}/members`, { method: "PATCH", json: input }),
  deleteTeam: (id: string) => api<{ removed: boolean }>(`/agents/comm/teams/${id}`, { method: "DELETE" }).then((r) => r.removed),

  // ── Handoffs ───────────────────────────────────────────────────
  listHandoffs: (filter?: { taskId?: string; agentId?: string; status?: TaskHandoff["status"] }) =>
    api<{ handoffs: TaskHandoff[] }>("/agents/comm/handoffs", { params: filter as any }).then((r) => r.handoffs),
  createHandoff: (input: { taskId: string; fromAgentId: string; toAgentId: string; reason: string; context?: Record<string, unknown> }) =>
    api<TaskHandoff>("/agents/comm/handoffs", { method: "POST", json: input }),
  respondHandoff: (id: string, accept: boolean, note?: string) =>
    api<TaskHandoff>(`/agents/comm/handoffs/${id}/respond`, { method: "POST", json: { accept, note } }),
  completeHandoff: (id: string) =>
    api<TaskHandoff>(`/agents/comm/handoffs/${id}/complete`, { method: "POST" }),

  // ── Reasoning ──────────────────────────────────────────────────
  listReasoning: (filter?: { status?: ReasoningStatus; authorAgentId?: string; limit?: number }) =>
    api<{ artifacts: ReasoningArtifact[] }>("/agents/comm/reasoning", { params: filter as any }).then((r) => r.artifacts),
  createReasoning: (input: { authorAgentId: string; subject: string; hypothesis: string; chainId?: string; evidence?: any[]; steps?: any[]; confidence?: number; metadata?: Record<string, unknown> }) =>
    api<ReasoningArtifact>("/agents/comm/reasoning", { method: "POST", json: input }),
  getReasoning: (id: string) => api<ReasoningArtifact>(`/agents/comm/reasoning/${id}`),
  chainReasoning: (chainId: string) =>
    api<{ artifacts: ReasoningArtifact[] }>(`/agents/comm/reasoning/chain/${chainId}`).then((r) => r.artifacts),
  addEvidence: (id: string, ev: { source: string; content: string; strength: "weak" | "moderate" | "strong" | "conclusive"; confidence?: number }) =>
    api<ReasoningArtifact>(`/agents/comm/reasoning/${id}/evidence`, { method: "POST", json: ev }),
  addStep: (id: string, step: { note: string; stepType: "observation" | "deduction" | "assumption" | "conclusion" }) =>
    api<ReasoningArtifact>(`/agents/comm/reasoning/${id}/steps`, { method: "POST", json: step }),
  conclude: (id: string, conclusion: string, confidence?: number, status?: ReasoningStatus) =>
    api<ReasoningArtifact>(`/agents/comm/reasoning/${id}/conclude`, { method: "POST", json: { conclusion, confidence, status } }),
  critique: (id: string, reviewerAgentId: string, note: string, verdict: "approve" | "revise" | "reject") =>
    api<ReasoningArtifact>(`/agents/comm/reasoning/${id}/critique`, { method: "POST", json: { reviewerAgentId, note, verdict } }),

  // ── Feedback ───────────────────────────────────────────────────
  recordFeedback: (fb: Omit<AgentFeedback, "id" | "createdAt">) =>
    api<AgentFeedback>("/agents/comm/feedback", { method: "POST", json: fb }),
  listFeedback: (filter?: { kind?: FeedbackKind; refType?: AgentFeedback["refType"] }) =>
    api<{ feedback: AgentFeedback[] }>("/agents/comm/feedback", { params: filter as any }).then((r) => r.feedback),
  agentFeedback: (agentId: string, limit = 50) =>
    api<{ feedback: AgentFeedback[] }>(`/agents/comm/feedback/agent/${agentId}`, { params: { limit } }).then((r) => r.feedback),
  metrics: (agentId: string, window: "hour" | "day" | "week" | "all" = "all") =>
    api<AgentPerformanceMetric>(`/agents/comm/metrics/${agentId}`, { params: { window } }),

  // ── Escalation ─────────────────────────────────────────────────
  listPolicies: () => api<{ policies: EscalationPolicy[] }>("/agents/comm/policies").then((r) => r.policies),
  createPolicy: (p: Omit<EscalationPolicy, "id" | "createdAt" | "updatedAt">) =>
    api<EscalationPolicy>("/agents/comm/policies", { method: "POST", json: p }),
  updatePolicy: (id: string, patch: Partial<EscalationPolicy>) =>
    api<EscalationPolicy>(`/agents/comm/policies/${id}`, { method: "PATCH", json: patch }),
  deletePolicy: (id: string) => api<{ removed: boolean }>(`/agents/comm/policies/${id}`, { method: "DELETE" }).then((r) => r.removed),
  togglePolicy: (id: string, enabled: boolean) =>
    api<EscalationPolicy>(`/agents/comm/policies/${id}/toggle`, { method: "POST", json: { enabled } }),
  evaluateEscalation: (ctx: { fromAgentId: string; confidence?: number; estimatedCostMicros?: number; retries?: number; priority?: CommPriority; dataClassifications?: Array<"public" | "internal" | "confidential" | "restricted" | "pii">; taskId?: string; correlationId?: string; reason?: string }) =>
    api<{ escalation: Escalation | null; matched: boolean }>("/agents/comm/escalations/evaluate", { method: "POST", json: ctx }),
  listEscalations: (filter?: { status?: EscalationStatus; toId?: string; fromAgentId?: string }) =>
    api<{ escalations: Escalation[] }>("/agents/comm/escalations", { params: filter as any }).then((r) => r.escalations),
  decideEscalation: (id: string, approved: boolean, deciderId: string, note?: string) =>
    api<Escalation>(`/agents/comm/escalations/${id}/decide`, { method: "POST", json: { approved, deciderId, note } }),
  acknowledgeEscalation: (id: string, deciderId: string) =>
    api<Escalation>(`/agents/comm/escalations/${id}/acknowledge`, { method: "POST", json: { deciderId } }),

  // ── Aggregate ──────────────────────────────────────────────────
  stats: () => api<AgentCommStats>("/agents/comm/stats"),
};
