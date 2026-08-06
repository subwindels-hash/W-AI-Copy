import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import type { z } from "zod";
import type { PaginationQuery } from "@windels/shared/api";
import { AgMemoryCreateSchema } from "@windels/shared/agents";

export const CreateMemorySchema = AgMemoryCreateSchema;

async function assertAccess(userId: string, agentId: string) {
  const ctx = await resolveUserContext(userId);
  const a = await prisma.agent.findFirst({ where: { id: agentId, organizationId: ctx.organizationId } });
  if (!a) throw AppError.notFound("Agent not found");
  return { ctx, agent: a };
}

export async function listMemories(userId: string, agentId: string, q: PaginationQuery & { type?: string; q?: string }) {
  await assertAccess(userId, agentId);
  const where: any = { agentId };
  if (q.type) where.type = q.type.toUpperCase();
  if (q.q) where.content = { contains: q.q, mode: "insensitive" };
  const [items, total] = await Promise.all([
    prisma.agentMemory.findMany({
      where,
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
    prisma.agentMemory.count({ where }),
  ]);
  return {
    items: items.map((m) => ({ ...m, type: m.type.toLowerCase() })),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

export async function addMemory(userId: string, agentId: string, input: z.infer<typeof CreateMemorySchema>) {
  const { ctx } = await assertAccess(userId, agentId);
  const m = await prisma.agentMemory.create({
    data: {
      agentId,
      type: input.type,
      content: input.content,
      source: input.source,
      sourceRef: input.sourceRef,
      importance: input.importance,
      tags: input.tags ?? [],
    },
  });
  await prisma.agentEvent.create({
    data: { agentId, type: "MEMORY_STORED", message: `stored memory: "${input.content.slice(0, 80)}"`, metadata: { memoryId: m.id, type: input.type } },
  });
  await prisma.activity.create({
    data: { organizationId: ctx.organizationId, userId, type: "SYSTEM", message: `added a memory to an AI employee`, metadata: { agentId, memoryId: m.id } },
  });
  return { ...m, type: m.type.toLowerCase() };
}

export async function deleteMemory(userId: string, agentId: string, memoryId: string) {
  await assertAccess(userId, agentId);
  const m = await prisma.agentMemory.findFirst({ where: { id: memoryId, agentId } });
  if (!m) throw AppError.notFound("Memory not found");
  await prisma.agentMemory.delete({ where: { id: memoryId } });
}

/**
 * Recall top-K memories relevant to a query (simple lexical + importance weighting).
 * Used by agent runtime when building context for a task/response.
 */
export async function recallMemories(agentId: string, query: string, k = 10): Promise<any[]> {
  const q = query.trim();
  if (!q) {
    return prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      take: k,
    });
  }
  // Basic ILIKE on content; vector/RAG is future session.
  const terms = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/[^\w]/g, "")).filter(Boolean);
  const contains = terms.length > 0 ? { OR: terms.map((t) => ({ content: { contains: t, mode: "insensitive" as const } })) } : {};
  const results = await prisma.agentMemory.findMany({
    where: { agentId, ...contains },
    orderBy: { importance: "desc" },
    take: k * 3,
  });
  // score by term overlap + importance
  const scored = results.map((m) => {
    const content = m.content.toLowerCase();
    let hits = 0;
    for (const t of terms) if (content.includes(t.toLowerCase())) hits++;
    const score = (hits / Math.max(terms.length, 1)) * 0.6 + m.importance * 0.4;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(({ m }) => m);
}

export async function autoRemember(agentId: string, content: string, opts: { source?: string; sourceRef?: string; type?: any; importance?: number; tags?: string[] } = {}) {
  const trimmed = content.trim();
  if (trimmed.length < 4) return null;
  // Skip duplicates: same content already stored
  const dup = await prisma.agentMemory.findFirst({ where: { agentId, content: trimmed } });
  if (dup) return dup;
  return prisma.agentMemory.create({
    data: {
      agentId,
      type: opts.type ?? "CONVERSATION",
      content: trimmed,
      source: opts.source,
      sourceRef: opts.sourceRef,
      importance: opts.importance ?? 0.4,
      tags: opts.tags ?? [],
    },
  });
}
