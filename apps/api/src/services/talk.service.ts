import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { logger } from "../config/logger.js";
import { z } from "zod";
import { claimTalkAttachments } from "../attachments/attachments.service.js";
import type { PaginationQuery } from "@windels/shared/api";
import {
  TalkChannelType,
  TalkChannelAccess,
  TalkMessageType,
  ActionItemStatus,
  ActionItemPriority,
} from "@prisma/client";

// ─── Zod schemas ────────────────────────────────────────────────
export const CreateChannelSchema = z.object({
  type: z.enum(["DM", "CHANNEL"]),
  name: z.string().min(1).max(80).optional(),
  topic: z.string().max(300).optional(),
  access: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  workspaceId: z.string().cuid().optional(),
  peerUserId: z.string().cuid().optional(), // DM target
  memberUserIds: z.array(z.string().cuid()).optional(),
  memberAgentIds: z.array(z.string().cuid()).optional(),
});

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  topic: z.string().max(300).optional(),
  access: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  isArchived: z.boolean().optional(),
});

export const CreateMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  threadParentId: z.string().cuid().optional(),
  attachmentIds: z.array(z.string().cuid()).optional(),
});

export const UpdateMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const AddReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

// ─── Access helpers ─────────────────────────────────────────────
export async function assertChannelAccess(userId: string, channelId: string) {
  const ctx = await resolveUserContext(userId);
  const channel = await prisma.talkChannel.findFirst({
    where: { id: channelId, organizationId: ctx.organizationId },
    include: { members: true, organization: true, workspace: true },
  });
  if (!channel) throw AppError.notFound("Channel not found");
  const member = channel.members.find(
    (m: any) => m.userId === userId || (m.userId === null && m.agentId === null) // future proof
  );
  // Private channels must have explicit membership; public channels in same org are visible.
  if (channel.access === "PRIVATE" && !member) {
    throw AppError.forbidden("Not a member of this channel");
  }
  return { channel, ctx, member: member ?? null };
}

async function getOrCreateDM(userId: string, peerUserId: string, ctx: Awaited<ReturnType<typeof resolveUserContext>>) {
  if (peerUserId === userId) throw AppError.badRequest("Cannot DM yourself");
  // Look up existing DM between these two users (direction-agnostic).
  const dm = await prisma.talkChannel.findFirst({
    where: {
      organizationId: ctx.organizationId,
      type: TalkChannelType.DM,
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: peerUserId } } },
      ],
    },
    include: { members: true },
  });
  if (dm) return dm;
  const peer = await prisma.user.findUnique({ where: { id: peerUserId }, include: { profile: true } });
  if (!peer) throw AppError.notFound("Peer user not found");
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const meName = me?.profile?.displayName ?? me?.email ?? "You";
  const peerName = peer.profile?.displayName ?? peer.email;
  const created = await prisma.talkChannel.create({
    data: {
      organizationId: ctx.organizationId,
      type: TalkChannelType.DM,
      access: TalkChannelAccess.PRIVATE,
      name: `DM: ${meName} & ${peerName}`,
      createdById: userId,
      members: {
        create: [{ userId }, { userId: peerUserId }],
      },
    },
    include: { members: true },
  });
  return created;
}

// ─── Channels ───────────────────────────────────────────────────
export async function listChannels(userId: string, q: PaginationQuery & { q?: string; type?: "DM" | "CHANNEL" }) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId, isArchived: false };
  if (q.type) where.type = q.type;
  if (q.q) where.name = { contains: q.q, mode: "insensitive" };
  // Only show channels that are PUBLIC in org OR that user is a member of.
  where.OR = [
    { access: TalkChannelAccess.PUBLIC },
    { members: { some: { userId } } },
  ];
  const [items, total] = await Promise.all([
    prisma.talkChannel.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        members: { include: { user: { include: { profile: true } }, agent: true } },
        _count: { select: { messages: true, members: true } },
      },
    }),
    prisma.talkChannel.count({ where }),
  ]);
  return {
    items: items.map((c: any) => serializeChannel(c, userId)),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

function serializeChannel(c: any, currentUserId: string) {
  const isDM = c.type === "DM";
  const otherMember = isDM ? c.members.find((m: any) => m.userId && m.userId !== currentUserId) : null;
  return {
    id: c.id,
    type: (c.type as string).toLowerCase() as "dm" | "channel",
    access: (c.access as string).toLowerCase() as "public" | "private",
    name: isDM && otherMember
      ? (otherMember.user?.profile?.displayName ?? otherMember.user?.email)
      : c.name,
    displayName: isDM && otherMember
      ? (otherMember.user?.profile?.displayName ?? otherMember.user?.email)
      : c.name,
    topic: c.topic,
    workspaceId: c.workspaceId,
    isArchived: c.isArchived,
    lastMessageAt: c.lastMessageAt,
    membersCount: c._count.members,
    messagesCount: c._count.messages,
    unreadCount: 0, // computed live when needed
    peer: otherMember ? {
      id: otherMember.user.id,
      displayName: otherMember.user.profile?.displayName ?? otherMember.user.email,
      avatarUrl: otherMember.user.profile?.avatarUrl,
    } : null,
    members: c.members.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      agentId: m.agentId,
      isMuted: m.isMuted,
      isPinned: m.isPinned,
      lastReadAt: m.lastReadAt,
      user: m.userId ? {
        id: m.user.id,
        displayName: m.user.profile?.displayName ?? m.user.email,
        avatarUrl: m.user.profile?.avatarUrl,
        email: m.user.email,
      } : null,
      agent: m.agentId ? {
        id: m.agent.id, name: m.agent.name, emoji: m.agent.emoji, color: m.agent.color,
      } : null,
    })),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function getChannel(userId: string, channelId: string) {
  const { channel } = await assertChannelAccess(userId, channelId);
  const full = await prisma.talkChannel.findUnique({
    where: { id: channelId },
    include: {
      members: { include: { user: { include: { profile: true } }, agent: true } },
      _count: { select: { messages: true } },
    },
  });
  return serializeChannel(full!, userId);
}

export async function createChannel(userId: string, input: z.infer<typeof CreateChannelSchema>) {
  const ctx = await resolveUserContext(userId);
  if (input.type === "DM") {
    if (!input.peerUserId) throw AppError.badRequest("DM requires a peer user");
    return getOrCreateDM(userId, input.peerUserId, ctx);
  }
  const name = (input.name ?? "new-channel").replace(/^#+/, "").trim();
  if (!name) throw AppError.badRequest("Channel name required");
  const memberIds = Array.from(new Set([userId, ...(input.memberUserIds ?? [])]));
  const agentIds = Array.from(new Set(input.memberAgentIds ?? []));
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
  const ch = await prisma.talkChannel.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: input.workspaceId ?? ctx.workspaceId,
      type: TalkChannelType.CHANNEL,
      access: input.access === "PRIVATE" ? TalkChannelAccess.PRIVATE : TalkChannelAccess.PUBLIC,
      name: `#${slug}`,
      topic: input.topic,
      createdById: userId,
      members: {
        create: [
          ...memberIds.map((uid) => ({ userId: uid })),
          ...agentIds.map((aid) => ({ agentId: aid })),
        ],
      },
    },
    include: { members: { include: { user: { include: { profile: true } }, agent: true } }, _count: { select: { messages: true, members: true } } },
  });
  return serializeChannel(ch, userId);
}

export async function updateChannel(userId: string, channelId: string, input: z.infer<typeof UpdateChannelSchema>) {
  await assertChannelAccess(userId, channelId);
  const data: any = {};
  if (input.name !== undefined) data.name = input.name.startsWith("#") ? input.name : `#${input.name.replace(/\s+/g, "-")}`;
  if (input.topic !== undefined) data.topic = input.topic;
  if (input.access !== undefined) data.access = input.access;
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;
  const ch = await prisma.talkChannel.update({ where: { id: channelId }, data });
  return ch;
}

export async function archiveChannel(userId: string, channelId: string) {
  await assertChannelAccess(userId, channelId);
  await prisma.talkChannel.update({ where: { id: channelId }, data: { isArchived: true } });
}

export async function addChannelMembers(userId: string, channelId: string, memberUserIds: string[] = [], memberAgentIds: string[] = []) {
  const { channel } = await assertChannelAccess(userId, channelId);
  if (channel.type === TalkChannelType.DM) throw AppError.badRequest("Cannot add members to a DM");
  for (const uid of memberUserIds) {
    const existing = await prisma.talkMember.findFirst({ where: { channelId, userId: uid } });
    if (!existing) await prisma.talkMember.create({ data: { channelId, userId: uid } });
  }
  for (const aid of memberAgentIds) {
    const existing = await prisma.talkMember.findFirst({ where: { channelId, agentId: aid } });
    if (!existing) await prisma.talkMember.create({ data: { channelId, agentId: aid } });
  }
}

export async function removeChannelMember(userId: string, channelId: string, memberId: string) {
  const { channel } = await assertChannelAccess(userId, channelId);
  if (channel.type === TalkChannelType.DM) throw AppError.badRequest("Cannot remove members from a DM");
  await prisma.talkMember.deleteMany({ where: { id: memberId, channelId } });
}

// ─── Messages ───────────────────────────────────────────────────
function serializeMessage(m: any) {
  return {
    id: m.id,
    channelId: m.channelId,
    type: (m.type as string).toLowerCase(),
    content: m.content,
    userId: m.userId,
    agentId: m.agentId,
    threadParentId: m.threadParentId,
    replyCount: m.replyCount,
    lastReplyAt: m.lastReplyAt,
    reactions: m.reactions ?? {},
    meetingId: m.meetingId,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    attachments: m.attachments ?? [],
    user: m.userId ? {
      id: m.user.id,
      displayName: m.user.profile?.displayName ?? m.user.email,
      avatarUrl: m.user.profile?.avatarUrl,
      email: m.user.email,
    } : null,
    agent: m.agentId ? {
      id: m.agent.id, name: m.agent.name, emoji: m.agent.emoji, color: m.agent.color,
    } : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function listMessages(userId: string, channelId: string, q: PaginationQuery & { threadParentId?: string }) {
  const { channel } = await assertChannelAccess(userId, channelId);
  const where: any = { channelId, deletedAt: null };
  if (q.threadParentId) where.threadParentId = q.threadParentId;
  else where.threadParentId = null; // top-level only, unless asking for a thread
  const [items, total] = await Promise.all([
    prisma.talkMessage.findMany({
      where,
      orderBy: { createdAt: q.threadParentId ? "asc" : "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        user: { include: { profile: true } },
        agent: true,
        attachments: true,
      },
    }),
    prisma.talkMessage.count({ where }),
  ]);
  // Mark read
  await prisma.talkMember.updateMany({
    where: { channelId, userId },
    data: { lastReadAt: new Date() },
  });
  const order = q.threadParentId ? items : items.slice().reverse(); // newest-first at top
  return {
    items: order.map(serializeMessage),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

export async function getMessage(userId: string, messageId: string) {
  const m = await prisma.talkMessage.findUnique({
    where: { id: messageId },
    include: { user: { include: { profile: true } }, agent: true, attachments: true, channel: true },
  });
  if (!m) throw AppError.notFound("Message not found");
  await assertChannelAccess(userId, m.channelId);
  return serializeMessage(m);
}

export async function sendMessage(userId: string, channelId: string, input: z.infer<typeof CreateMessageSchema>, opts: { agentId?: string } = {}) {
  const { channel } = await assertChannelAccess(userId, channelId);
  if (input.threadParentId) {
    const parent = await prisma.talkMessage.findUnique({ where: { id: input.threadParentId } });
    if (!parent || parent.channelId !== channelId) throw AppError.badRequest("Invalid thread parent");
  }
  const attachmentIds = await claimTalkAttachments(userId, channel.organizationId, input.attachmentIds ?? []);
  const data: any = {
    channelId,
    type: TalkMessageType.TEXT,
    content: input.content,
    userId: opts.agentId ? null : userId,
    agentId: opts.agentId ?? null,
    threadParentId: input.threadParentId ?? null,
  };
  if (attachmentIds.length) {
    data.attachments = { connect: attachmentIds.map((id: string) => ({ id })) };
  }
  const m = await prisma.talkMessage.create({
    data,
    include: { user: { include: { profile: true } }, agent: true, attachments: true },
  });
  await prisma.talkChannel.update({ where: { id: channelId }, data: { lastMessageAt: m.createdAt } });
  if (input.threadParentId) {
    await prisma.talkMessage.update({
      where: { id: input.threadParentId },
      data: { replyCount: { increment: 1 }, lastReplyAt: m.createdAt },
    });
  }
  // Auto-schedule AI participant reply if @mentioned or channel has AI members.
  scheduleAIParticipantReply(channel.organizationId, channelId, m.id, input.content).catch(() => {});
  return serializeMessage(m);
}

export async function editMessage(userId: string, messageId: string, input: z.infer<typeof UpdateMessageSchema>) {
  const m = await prisma.talkMessage.findUnique({ where: { id: messageId } });
  if (!m) throw AppError.notFound("Message not found");
  if (m.userId !== userId) throw AppError.forbidden("You can only edit your own messages");
  const updated = await prisma.talkMessage.update({
    where: { id: messageId },
    data: { content: input.content, editedAt: new Date() },
    include: { user: { include: { profile: true } }, agent: true, attachments: true },
  });
  return serializeMessage(updated);
}

export async function deleteMessage(userId: string, messageId: string) {
  const m = await prisma.talkMessage.findUnique({ where: { id: messageId } });
  if (!m) throw AppError.notFound("Message not found");
  if (m.userId !== userId) throw AppError.forbidden("You can only delete your own messages");
  await prisma.talkMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), content: "" } });
}

// ─── Reactions ──────────────────────────────────────────────────
export async function toggleReaction(userId: string, messageId: string, emoji: string, opts: { agentId?: string } = {}) {
  const m = await prisma.talkMessage.findUnique({ where: { id: messageId } });
  if (!m) throw AppError.notFound("Message not found");
  await assertChannelAccess(userId, m.channelId);
  const reactor = opts.agentId ? `agent:${opts.agentId}` : `user:${userId}`;
  const reactions = (m.reactions as Record<string, string[]>) ?? {};
  const list = reactions[emoji] ?? [];
  let updated: Record<string, string[]>;
  if (list.includes(reactor)) {
    updated = { ...reactions, [emoji]: list.filter((x) => x !== reactor) };
    if (updated[emoji].length === 0) delete updated[emoji];
  } else {
    updated = { ...reactions, [emoji]: [...list, reactor] };
  }
  await prisma.talkMessage.update({ where: { id: messageId }, data: { reactions: updated } });
  return updated;
}

// ─── AI Participant reply ───────────────────────────────────────
async function scheduleAIParticipantReply(organizationId: string, channelId: string, messageId: string, content: string) {
  // Find AI members of this channel.
  const aiMembers = await prisma.talkMember.findMany({
    where: { channelId, agentId: { not: null } },
    include: { agent: true },
  });
  if (!aiMembers.length) return;
  const lower = content.toLowerCase();
  // If @agent name is mentioned OR DM-style channel includes an AI member, reply.
  for (const m of aiMembers) {
    if (!m.agent || !m.agentId) continue;
    const mentionedByName = lower.includes(`@${m.agent.name.toLowerCase()}`) || lower.includes(m.agent.name.toLowerCase());
    const channel = await prisma.talkChannel.findUnique({ where: { id: channelId } });
    const isDM = channel?.type === TalkChannelType.DM;
    if (!mentionedByName && !isDM) continue;
    await triggerAIReply(organizationId, channelId, m.agentId, messageId);
    return; // only one AI reply per message to avoid chatter
  }
}

async function triggerAIReply(organizationId: string, channelId: string, agentId: string, triggerMessageId: string) {
  try {
    const { aiRegistry } = await import("./ai/registry.js");
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return;
    // Grab last N messages for context.
    const recent = await prisma.talkMessage.findMany({
      where: { channelId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { include: { profile: true } }, agent: true },
    });
    const context = recent.slice().reverse().map((msg: any) => {
      const name = msg.userId
        ? (msg.user!.profile?.displayName ?? msg.user!.email)
        : (msg.agent?.name ?? "AI");
      return `${name}: ${msg.content}`;
    }).join("\n");
    const sysPrompt = `${agent.systemPrompt ?? `You are ${agent.name}, ${agent.role}.`}\nYou are participating in a team chat. Reply concisely (under 120 words) in the same conversational tone.`;
    const resolved = aiRegistry.resolve(agent.modelId ?? undefined);
    if (!resolved) {
      logger.warn("[talk] AI not configured; skipping agent auto-reply", { agentId, channelId });
      return;
    }
    let text = "";
    for await (const chunk of aiRegistry.guardedStream({
      model: resolved.model.id,
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: `<recent channel messages>\n${context}\n\nReply now as ${agent.name} to the latest message. Keep it natural and brief.` },
      ],
      stream: true,
    }, { feature: "talk-agent-reply" })) {
      if (chunk.type === "token") text += chunk.text ?? "";
    }
    await prisma.talkMessage.create({
      data: {
        channelId,
        type: TalkMessageType.TEXT,
        content: text.trim(),
        agentId,
      },
    });
    await prisma.talkChannel.update({ where: { id: channelId }, data: { lastMessageAt: new Date() } });
    await prisma.activity.create({
      data: { organizationId, type: "MESSAGE_SENT", agentId, message: `${agent.name} replied in channel` },
    });
  } catch (err) {
    // Silent failure — don't break user's send path.
    console.error("[talk] AI reply failed:", err);
  }
}

// Re-export enums for service consumer convenience.
export { ActionItemStatus, ActionItemPriority };
