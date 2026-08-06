// Session 102 — AI Workforce / Agent Framework shared contracts.
//
// The Prisma-backed agent surface is core infrastructure, so these contracts
// describe the JSON boundary without leaking Prisma enum names or Date objects.

import { z } from "zod";

export const AGENT_STATUSES = ["idle", "online", "working", "error", "paused", "offline"] as const;
export type AgAgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_LIFECYCLE_STATES = ["ONBOARDING", "ACTIVE", "TRAINING", "RETIRED", "ARCHIVED"] as const;
export type AgLifecycleState = (typeof AGENT_LIFECYCLE_STATES)[number];

export const AGENT_MEMORY_TYPES = ["FACT", "PREFERENCE", "PROCEDURE", "CONVERSATION", "TASK", "FEEDBACK"] as const;
export const AGENT_KNOWLEDGE_TYPES = ["DOCUMENT", "URL", "SNIPPET", "FILE"] as const;

export interface AgAgentStats {
  tasks: number;
  messages: number;
  memories: number;
  knowledge: number;
  events: number;
}

export interface AgAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
  description: string | null;
  systemPrompt: string | null;
  department: string | null;
  capabilities: string[];
  modelId: string | null;
  temperature: number;
  maxTokens: number;
  avatarStyle: string | null;
  isBuiltIn: boolean;
  status: AgAgentStatus;
  lastActivityAt: string;
  activeTaskId: string | null;
  activeTask: { id: string; title: string; status: string } | null;
  stats?: AgAgentStats;
  createdAt: string;
  updatedAt: string;
}

export interface AgAgentEvent {
  id: string;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgAgentMemory {
  id: string;
  type: string;
  content: string;
  source: string | null;
  sourceRef: string | null;
  importance: number;
  tags: string[];
  createdAt: string;
}

export interface AgAgentKnowledge {
  id: string;
  type: string;
  title: string;
  contentPreview: string;
  source: string | null;
  mimeType: string | null;
  tokens: number;
  createdAt: string;
}

export interface AgAgentSkill {
  id: string;
  agentId: string;
  name: string;
  description: string | null;
  toolName: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const AgSkillCreateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().max(500).optional(),
  toolName: z.string().trim().min(1).max(64),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
});
export const AgSkillUpdateSchema = AgSkillCreateSchema.partial();

export interface AgModelInfo {
  id: string;
  provider: string;
  displayName: string;
  contextWindow?: number;
  maxOutput?: number;
  capabilities?: string[];
  source?: "real" | "echo-demo";
  healthy?: boolean;
  configured?: boolean;
}

export interface AgPaginated<T> {
  items: T[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export const AgAgentCreateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  role: z.string().trim().min(1).max(64),
  description: z.string().max(500).optional(),
  color: z.string().trim().min(1).max(32).default("azure"),
  emoji: z.string().max(8).default("🤖"),
  systemPrompt: z.string().max(8000).optional(),
  department: z.string().trim().max(64).optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  modelId: z.string().trim().max(160).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(64000).optional(),
  avatarStyle: z.string().trim().max(64).optional(),
});
export type AgAgentCreateInput = z.infer<typeof AgAgentCreateSchema>;

export const AgAgentUpdateSchema = AgAgentCreateSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type AgAgentUpdateInput = z.infer<typeof AgAgentUpdateSchema>;

export const AgAgentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(120).optional(),
  status: z.enum(AGENT_STATUSES).optional(),
});
export type AgAgentListQuery = z.infer<typeof AgAgentListQuerySchema>;
export const AgAgentIdSchema = z.object({ id: z.string().cuid() });

export const AgMemoryCreateSchema = z.object({
  type: z.enum(AGENT_MEMORY_TYPES).default("FACT"),
  content: z.string().trim().min(1).max(4000),
  source: z.string().max(64).optional(),
  sourceRef: z.string().max(128).optional(),
  importance: z.number().min(0).max(1).default(0.5),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
export const AgKnowledgeCreateSchema = z.object({
  type: z.enum(AGENT_KNOWLEDGE_TYPES).default("SNIPPET"),
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(200_000),
  source: z.string().max(500).optional(),
  mimeType: z.string().max(128).optional(),
});

export const AgLifecycleTransitionSchema = z.object({
  to: z.enum(AGENT_LIFECYCLE_STATES),
  reason: z.string().trim().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
});
