import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import type { z } from "zod";
import type { PaginationQuery } from "@windels/shared/api";
import { AgKnowledgeCreateSchema } from "@windels/shared/agents";

export const CreateKnowledgeSchema = AgKnowledgeCreateSchema;

async function assertAccess(userId: string, agentId: string) {
  const ctx = await resolveUserContext(userId);
  const a = await prisma.agent.findFirst({ where: { id: agentId, organizationId: ctx.organizationId } });
  if (!a) throw AppError.notFound("Agent not found");
  return { ctx, agent: a };
}

function estimateTokens(text: string) {
  // rough: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export async function listKnowledge(userId: string, agentId: string, q: PaginationQuery & { type?: string; q?: string }) {
  await assertAccess(userId, agentId);
  const where: any = { agentId };
  if (q.type) where.type = q.type.toUpperCase();
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: "insensitive" } },
      { content: { contains: q.q, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.agentKnowledge.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
    prisma.agentKnowledge.count({ where }),
  ]);
  return {
    items: items.map((k) => ({ ...k, type: k.type.toLowerCase(), contentPreview: k.content.slice(0, 200) })),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

export async function addKnowledge(userId: string, agentId: string, input: z.infer<typeof CreateKnowledgeSchema>) {
  const { ctx } = await assertAccess(userId, agentId);
  const k = await prisma.agentKnowledge.create({
    data: {
      agentId,
      type: input.type,
      title: input.title,
      content: input.content,
      source: input.source,
      mimeType: input.mimeType,
      tokens: estimateTokens(input.content),
    },
  });
  await prisma.agentEvent.create({
    data: { agentId, type: "KNOWLEDGE_ADDED", message: `added knowledge: \"${input.title}\"`, metadata: { knowledgeId: k.id, type: input.type, tokens: k.tokens } },
  });
  await prisma.activity.create({
    data: { organizationId: ctx.organizationId, userId, type: "SYSTEM", message: `taught an AI employee something new: ${input.title}`, metadata: { agentId, knowledgeId: k.id } },
  });
  return { ...k, type: k.type.toLowerCase() };
}

export async function deleteKnowledge(userId: string, agentId: string, knowledgeId: string) {
  await assertAccess(userId, agentId);
  const k = await prisma.agentKnowledge.findFirst({ where: { id: knowledgeId, agentId } });
  if (!k) throw AppError.notFound("Knowledge not found");
  await prisma.agentKnowledge.delete({ where: { id: knowledgeId } });
}

export async function retrieveKnowledge(agentId: string, query: string, k = 5) {
  const terms = query.split(/\s+/).filter(Boolean).map((t) => t.replace(/[^\w]/g, "")).filter(Boolean);
  const where: any = { agentId };
  if (terms.length) {
    where.OR = [];
    for (const t of terms) {
      where.OR.push({ title: { contains: t, mode: "insensitive" as const } });
      where.OR.push({ content: { contains: t, mode: "insensitive" as const } });
    }
  }
  return prisma.agentKnowledge.findMany({ where, take: k, orderBy: { createdAt: "desc" } });
}
