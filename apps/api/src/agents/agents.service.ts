import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import type { z } from "zod";
import type { PaginationQuery } from "@windels/shared/api";
import { AgAgentCreateSchema, AgAgentUpdateSchema } from "@windels/shared/agents";
import type { AgAgent, AgAgentListQuery } from "@windels/shared/agents";
import { aiRegistry } from "../services/ai/registry.js";

// Backwards-compatible names retained for existing route and consumer imports.
export const CreateAgentSchema = AgAgentCreateSchema;
export const UpdateAgentSchema = AgAgentUpdateSchema;

function serializeAgent(a: any): AgAgent {
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    color: a.color,
    emoji: a.emoji,
    description: a.description,
    systemPrompt: a.systemPrompt,
    department: a.department,
    capabilities: a.capabilities,
    modelId: a.modelId,
    temperature: a.temperature,
    maxTokens: a.maxTokens,
    avatarStyle: a.avatarStyle,
    isBuiltIn: a.isBuiltIn,
    status: String(a.status ?? "IDLE").toLowerCase() as AgAgent["status"],
    lastActivityAt: a.lastActivityAt,
    activeTaskId: a.activeTaskId,
    activeTask: a.activeTask ? { id: a.activeTask.id, title: a.activeTask.title, status: a.activeTask.status } : null,
    stats: a._count
      ? {
          tasks: a._count.tasks ?? 0,
          messages: a._count.messages ?? 0,
          memories: a._count.memories ?? 0,
          knowledge: a._count.knowledge ?? 0,
          events: a._count.events ?? 0,
        }
      : undefined,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export async function listAgents(
  userId: string,
  pagination: AgAgentListQuery,
  filters?: { status?: AgAgentListQuery["status"]; q?: string }
) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId };
  if (filters?.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { role: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters?.status) where.status = filters.status.toUpperCase();
  const [items, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      include: {
        activeTask: true,
        _count: { select: { tasks: true, messages: true, memories: true, knowledge: true, events: true } },
      },
      orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }],
      skip: (pagination.page - 1) * pagination.perPage,
      take: pagination.perPage,
    }),
    prisma.agent.count({ where }),
  ]);
  return { items: items.map(serializeAgent), pagination: { page: pagination.page, perPage: pagination.perPage, total, totalPages: Math.ceil(total / pagination.perPage) } };
}

export async function getAgent(userId: string, agentId: string) {
  const ctx = await resolveUserContext(userId);
  const a = await prisma.agent.findFirst({
    where: { id: agentId, organizationId: ctx.organizationId },
    include: {
      activeTask: true,
      _count: { select: { tasks: true, messages: true, memories: true, knowledge: true, events: true, skills: true } },
    },
  });
  if (!a) throw AppError.notFound("Agent not found");
  return serializeAgent(a);
}

export async function createAgent(userId: string, input: z.infer<typeof CreateAgentSchema>) {
  const ctx = await resolveUserContext(userId);
  // Validate modelId if provided
  if (input.modelId) {
    const m = aiRegistry.resolveSafe(input.modelId);
    if (!m) throw AppError.badRequest(`Model ${input.modelId} not available`);
  }
  const a = await prisma.agent.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      role: input.role,
      description: input.description,
      color: input.color ?? "azure",
      emoji: input.emoji ?? "🤖",
      systemPrompt: input.systemPrompt,
      department: input.department,
      capabilities: input.capabilities ?? [],
      modelId: input.modelId,
      temperature: input.temperature ?? 0.7,
      maxTokens: input.maxTokens ?? 2048,
      avatarStyle: input.avatarStyle,
    },
    include: { _count: { select: { tasks: true, messages: true, memories: true, knowledge: true, events: true } } },
  });
  await prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      userId,
      type: "SYSTEM",
      message: `created AI employee \"${a.name}\" (${a.role})`,
      metadata: { agentId: a.id },
    },
  });
  return serializeAgent(a);
}

export async function updateAgent(userId: string, agentId: string, input: z.infer<typeof UpdateAgentSchema>) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.agent.findFirst({ where: { id: agentId, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("Agent not found");
  if (input.modelId !== undefined && input.modelId && !aiRegistry.resolveSafe(input.modelId)) {
    throw AppError.badRequest(`Model ${input.modelId} not available`);
  }
  const a = await prisma.agent.update({
    where: { id: agentId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.emoji !== undefined && { emoji: input.emoji }),
      ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
      ...(input.department !== undefined && { department: input.department }),
      ...(input.capabilities !== undefined && { capabilities: input.capabilities }),
      ...(input.modelId !== undefined && { modelId: input.modelId }),
      ...(input.temperature !== undefined && { temperature: input.temperature }),
      ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
      ...(input.avatarStyle !== undefined && { avatarStyle: input.avatarStyle }),
    },
    include: { _count: { select: { tasks: true, messages: true, memories: true, knowledge: true, events: true } } },
  });
  return serializeAgent(a);
}

export async function deleteAgent(userId: string, agentId: string) {
  const ctx = await resolveUserContext(userId);
  const a = await prisma.agent.findFirst({ where: { id: agentId, organizationId: ctx.organizationId } });
  if (!a) throw AppError.notFound("Agent not found");
  if (a.isBuiltIn) throw AppError.forbidden("Built-in agents cannot be deleted");
  await prisma.agent.delete({ where: { id: agentId } });
  await prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      userId,
      type: "SYSTEM",
      message: `deleted AI employee \"${a.name}\"`,
      metadata: { agentId },
    },
  });
}

export async function listAgentEvents(userId: string, agentId: string, pagination: PaginationQuery) {
  const ctx = await resolveUserContext(userId);
  const exists = await prisma.agent.findFirst({ where: { id: agentId, organizationId: ctx.organizationId } });
  if (!exists) throw AppError.notFound("Agent not found");
  const [items, total] = await Promise.all([
    prisma.agentEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.perPage,
      take: pagination.perPage,
    }),
    prisma.agentEvent.count({ where: { agentId } }),
  ]);
  return { items: items.map((e) => ({ ...e, type: e.type.toLowerCase() })), pagination: { page: pagination.page, perPage: pagination.perPage, total, totalPages: Math.ceil(total / pagination.perPage) } };
}

export async function updateAgentStatus(agentId: string, status: string, tx?: any) {
  const p = tx ?? prisma;
  await p.agent.update({
    where: { id: agentId },
    data: { status: status as any, lastActivityAt: new Date() },
  });
}

export async function recordAgentEvent(agentId: string, type: string, message: string, metadata: Record<string, unknown> = {}) {
  await prisma.agentEvent.create({
    data: { agentId, type: type as any, message, metadata: metadata as any },
  });
}
