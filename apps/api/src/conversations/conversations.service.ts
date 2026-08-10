import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import type { PaginationMeta } from "@windels/shared/api";

export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200).default("New conversation"),
  modelId: z.string().optional(),
  firstMessage: z.string().min(1).max(10000).optional(),
  agentIds: z.array(z.string().cuid()).optional(),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  modelId: z.string().optional(),
});

function userConversationAccess(userId: string) {
  return { OR: [{ createdById: userId }, { participants: { some: { userId } } }] };
}

export async function listConversations(
  userId: string,
  query: PaginationQuery & { pinned?: string; archived?: string }
) {
  const ctx = await resolveUserContext(userId);
  const where: any = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    // The active sidebar shows non-archived; the Archived view passes archived=true.
    isArchived: query.archived === "true",
    OR: [{ createdById: userId }, { participants: { some: { userId } } }],
  };
  if (query.pinned === "true") where.pinned = true;
  if (query.q) where.title = { contains: query.q, mode: "insensitive" };
  const [total, items] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        participants: { include: { agent: true, user: { include: { profile: true } } } },
        _count: { select: { messages: true } },
      },
    }),
  ]);
  return {
    items: items.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      pinned: c.pinned,
      pinnedAt: c.pinnedAt,
      isArchived: c.isArchived,
      archivedAt: c.archivedAt,
      deletedAt: c.deletedAt,
      createdAt: c.createdAt,
      modelId: c.modelId,
      lastMessageAt: c.lastMessageAt,
      messageCount: c._count.messages,
      participants: c.participants.map((p) => ({
        id: p.id,
        agent: p.agent ? { id: p.agent.id, name: p.agent.name, color: p.agent.color, emoji: p.agent.emoji } : null,
        user: p.user ? { id: p.user.id, email: p.user.email, displayName: p.user.profile?.displayName ?? null } : null,
      })),
    })),
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    } satisfies PaginationMeta,
  };
}

export async function getConversation(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const c = await prisma.conversation.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, ...userConversationAccess(userId) },
    include: {
      participants: { include: { agent: true, user: { include: { profile: true } } } },
    },
  });
  if (!c) throw AppError.notFound("Conversation not found");
  return c;
}

export async function createConversation(
  userId: string,
  input: z.infer<typeof CreateConversationSchema>
) {
  const ctx = await resolveUserContext(userId);
  const conv = await prisma.$transaction(async (tx) => {
    const c = await tx.conversation.create({
      data: {
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        title: input.title,
        modelId: input.modelId ?? "windels-assistant",
        createdById: userId,
      },
    });
    // Creator is always a participant.
    await tx.conversationParticipant.create({
      data: { conversationId: c.id, userId },
    });
    // @mentioned agents become participants.
    if (input.agentIds?.length) {
      for (const aid of input.agentIds) {
        const agent = await tx.agent.findFirst({
          where: { id: aid, organizationId: ctx.organizationId },
        });
        if (agent) {
          await tx.conversationParticipant.create({
            data: { conversationId: c.id, agentId: aid },
          });
        }
      }
    }
    // Optionally create first user message now (caller will stream AI response separately).
    return c;
  });
  return conv;
}

export async function updateConversation(
  userId: string,
  id: string,
  input: z.infer<typeof UpdateConversationSchema>
) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.conversation.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, ...userConversationAccess(userId) },
  });
  if (!existing) throw AppError.notFound("Conversation not found");
  const data: any = { ...input };
  // Keep the pin/archive timestamps consistent with their flags when toggled
  // through the generic PATCH endpoint.
  if (typeof input.pinned === "boolean") {
    data.pinnedAt = input.pinned ? (existing.pinnedAt ?? new Date()) : null;
  }
  if (typeof input.isArchived === "boolean") {
    data.archivedAt = input.isArchived ? (existing.archivedAt ?? new Date()) : null;
  }
  return prisma.conversation.update({ where: { id }, data });
}

export async function deleteConversation(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.conversation.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, ...userConversationAccess(userId) },
  });
  if (!existing) throw AppError.notFound("Conversation not found");
  await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}
