/**
 * Shared types for Session 20 — AI Workforce Communication.
 *
 * Covers the six slices of Phase 19:
 *   171 — AI Agent Identity (lifecycle, credentials, capability attestations)
 *   172 — AI Communication Protocol (envelope, signed messages, priorities)
 *   173 — Agent Collaboration (teams/pods, coordinators, handoffs)
 *   174 — Reasoning Exchange (hypotheses, evidence, critique)
 *   175 — Feedback & Learning (rewards, performance metrics, up/down votes)
 *   176 — Task Escalation (policy-based routing, human approval hooks)
 */

// ─── Slice 171: AI Agent Identity ───────────────────────────────────────

/** AI-employee lifecycle from §6.10. */
export type AgentLifecycle =
  | "created" | "trained" | "active" | "optimized"
  | "suspended" | "archived" | "retired";

/** A capability an agent is allowed to invoke. */
export interface AgentCapability {
  /** Stable capability id e.g. "chat.stream", "tool.web_search", "data.catalog.read". */
  id: string;
  description?: string;
  /** Unix-epoch (ms) when this capability was attested (approved) for the agent. */
  attestedAt?: string;
  /** Who/what attested it (system, governance, userId). */
  attestedBy?: string;
  /** Capability version when attested. */
  version?: string;
}

/** Service-account / API-key pair an agent uses to call internal services. */
export interface AgentCredential {
  id: string;
  /** Masked key shown in UI (e.g. "windels-ag-••••3f9a"). */
  keyHint: string;
  /** Public key for verifying messages signed by this agent. Ed25519/PEM base64. */
  publicKey?: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface AgentIdentity {
  agentId: string;
  /** Human-readable display name, may diverge from Agent.name. */
  displayName: string;
  department?: string;
  managerId?: string;          // user or agent id
  lifecycle: AgentLifecycle;
  permissions: string[];       // e.g. "workspace.read", "memory.write"
  capabilities: AgentCapability[];
  credentials: AgentCredential[];
  /** Service-discovery endpoint (e.g. internal gRPC/REST URL) for routing messages. */
  endpoint?: string;
  /** Version of the agent definition (prompt + skills bundle). */
  version: string;
  /** Objectively measured performance/quality score 0..1. */
  performanceScore: number;
  /** Reputation score from peer feedback 0..1. */
  reputationScore: number;
  objectives: string[];
  trainedAt?: string;
  activatedAt?: string;
  lastPromotedAt?: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

// ─── Slice 172: AI Communication Protocol ───────────────────────────────

export type CommMessageType =
  | "request" | "response" | "event" | "heartbeat"
  | "reasoning" | "feedback" | "escalation" | "handoff";

export type CommPriority = "low" | "normal" | "high" | "urgent";

export interface CommEnvelope {
  id: string;                    // message id (ulid/cuid)
  type: CommMessageType;
  /** Message schema URI, e.g. "windels.comm/request/v1". */
  schema: string;
  /** Sender agent identity id. */
  from: string;
  /** Recipient id (agent id, team id, or "*" for broadcast). */
  to: string;
  /** Correlation id tying a request→response chain together. */
  correlationId: string;
  /** Causation id — id of the message that caused this one. */
  causationId?: string;
  /** Reasoning chain id (see Slice 174). */
  reasoningChainId?: string;
  priority: CommPriority;
  ttlMs?: number;                // hop/expiry budget
  deadline?: string;             // ISO timestamp
  /** Short subject for inboxes/logs. */
  subject: string;
  /** Typed payload — schema identified by `schema`. */
  payload: Record<string, unknown>;
  /** Structured error, if this message represents a failure. */
  error?: { code: string; message: string; details?: unknown };
  /** HMAC/EdDSA signature hex — proves sender owns the key. */
  signature?: string;
  /** Number of hops traversed (decrement TTL on each). */
  hops: number;
  /** Acknowledgement requirement. */
  requiresAck: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

// ─── Slice 173: Agent Collaboration ────────────────────────────────────

export type TeamRole = "coordinator" | "worker" | "reviewer" | "observer";

export interface AgentTeamMember {
  agentId: string;
  role: TeamRole;
  joinedAt: string;
  /** Skills this member contributes to the team. */
  skills: string[];
  /** Fraction (0..1) of capacity allocated to this team. */
  capacity: number;
}

export interface AgentTeam {
  id: string;
  name: string;
  mission: string;
  department?: string;
  coordinatorId?: string;
  members: AgentTeamMember[];
  /** Team inbox channel (where messages addressed to team are routed). */
  channel: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface TaskHandoff {
  id: string;
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  /** Serialised checkpoint/context the receiving agent should resume from. */
  context: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | "completed";
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

// ─── Slice 174: Reasoning Exchange ─────────────────────────────────────

export type ReasoningStatus = "draft" | "proposed" | "reviewed" | "verified" | "rejected";
export type EvidenceStrength = "weak" | "moderate" | "strong" | "conclusive";

export interface ReasoningEvidence {
  id: string;
  source: string;              // "kg", "memory", "document:<id>", "user_input", ...
  content: string;
  strength: EvidenceStrength;
  /** Optional confidence 0..1. */
  confidence?: number;
  retrievedAt?: string;
}

export interface ReasoningArtifact {
  id: string;
  /** Chain id — groups hypotheses→evidence→conclusion for one decision. */
  chainId: string;
  authorAgentId: string;
  subject: string;
  /** Candidate answer / claim. */
  hypothesis: string;
  evidence: ReasoningEvidence[];
  /** Reasoning steps (chain-of-thought, structured). */
  steps: Array<{ id: string; note: string; stepType: "observation" | "deduction" | "assumption" | "conclusion" }>;
  /** Final claim (may differ from hypothesis after critique). */
  conclusion?: string;
  confidence: number;           // 0..1
  status: ReasoningStatus;
  /** Peer critiques attached during the review protocol. */
  critiques: Array<{
    id: string;
    reviewerAgentId: string;
    note: string;
    verdict: "approve" | "revise" | "reject";
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

// ─── Slice 175: Feedback & Learning ───────────────────────────────────

export type FeedbackKind = "upvote" | "downvote" | "correction" | "reward" | "rating" | "comment";

export interface AgentFeedback {
  id: string;
  targetAgentId: string;
  /** Source of the signal: user id, agent id, or "system". */
  fromId: string;
  kind: FeedbackKind;
  /** Correlated message/reasoning/task id, if any. */
  refType?: "message" | "reasoning" | "task" | "handoff";
  refId?: string;
  /** Numeric signal, e.g. rating 1..5, reward -1..1. */
  value?: number;
  comment?: string;
  /** Skill tags that should be credited/penalised. */
  skills: string[];
  createdAt: string;
}

export interface AgentPerformanceMetric {
  agentId: string;
  /** Window over which the metric is computed. */
  window: "hour" | "day" | "week" | "all";
  /** Start of the window (ISO). */
  windowStart: string;
  tasksCompleted: number;
  tasksFailed: number;
  avgLatencyMs: number;
  /** Fraction of feedback signals that were positive (upvote/rating≥4). */
  approvalRate: number;
  /** Mean reward signal (weighted across feedback). */
  meanReward: number;
  /** Rolling performance score (0..1). */
  performanceScore: number;
  /** Rolling reputation score (0..1). */
  reputationScore: number;
  updatedAt: string;
}

// ─── Slice 176: Task Escalation ───────────────────────────────────────

export type EscalationPolicyAction =
  | "notify_manager" | "request_human_approval"
  | "reroute_team" | "pause_task" | "fail_task" | "invoke_governance";

export interface EscalationPolicy {
  id: string;
  name: string;
  description?: string;
  /** Which department/team/agent this applies to; "*" = global. */
  scope: string;
  /** Conditions are AND-ed; any match fires the actions. */
  conditions: {
    /** Escalate when confidence below this threshold. */
    minConfidence?: number;
    /** Escalate when estimated costMicros exceeds budget. */
    maxCostMicros?: number;
    /** Escalate when an agent has retried N times. */
    maxRetries?: number;
    /** Escalate when task priority is >= this. */
    priorityAtLeast?: CommPriority;
    /** Escalate when the payload matches these data classifications. */
    dataClassifications?: Array<"public" | "internal" | "confidential" | "restricted" | "pii">;
    /** Custom rule expression (future; descriptive label for MVP). */
    customRule?: string;
  };
  actions: EscalationPolicyAction[];
  /** Where the escalation is routed (agent id / team id / user id). */
  routeTo?: string;
  /** SLA before auto-fail/pause (ms). */
  slaMs?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EscalationStatus = "open" | "acknowledged" | "approved" | "denied" | "expired";

export interface Escalation {
  id: string;
  policyId: string;
  taskId?: string;
  /** Correlated message/reasoning id. */
  correlationId?: string;
  fromAgentId: string;
  toId: string;                 // user or agent id (approver)
  reason: string;
  status: EscalationStatus;
  /** Snapshot of the context that triggered escalation. */
  context: Record<string, unknown>;
  decisionNote?: string;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
}

// ─── Aggregate stats ──────────────────────────────────────────────────

export interface AgentCommStats {
  identities: number;
  teams: number;
  messagesInFlight: number;
  messagesTotal: number;
  reasoningArtifacts: number;
  feedbackSignals: number;
  openEscalations: number;
  policies: number;
}
