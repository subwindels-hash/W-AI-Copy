import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { aiRegistry } from "./ai/registry.js";
import type { ChatMessage } from "./ai/types.js";
import { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } from "./ai/types.js";
import { buildSmartContext } from "./ai/contextManager.js";
import { MessageRole, MessageStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { z } from "zod";
import { claimConversationAttachments } from "../attachments/attachments.service.js";

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  modelId: z.string().optional(),
  agentIds: z.array(z.string().cuid()).optional(),
  attachmentIds: z.array(z.string().cuid()).max(10).optional(),
  parentId: z.string().cuid().optional(),
});

export interface StreamEvent {
  event: "message.created" | "message.delta" | "message.done" | "message.error" | "typing";
  data: Record<string, unknown>;
}

async function assertConversationAccess(userId: string, conversationId: string) {
  const ctx = await resolveUserContext(userId);
  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    },
    include: { participants: true },
  });
  if (!conv) throw AppError.notFound("Conversation not found");
  return { conv, ctx };
}

async function buildContext(conversationId: string, systemPrompt?: string): Promise<ChatMessage[]> {
  // Use smart context manager for intelligent context building
  // with token counting, prioritization, and summarization
  const resolved = aiRegistry.resolve();
  const contextWindow = resolved?.model.contextWindow ?? 128000;
  const maxOutput = resolved?.model.maxOutput ?? 4096;

  try {
    const ctx = await buildSmartContext({
      conversationId,
      systemPrompt,
      contextWindow,
      maxOutput,
      maxMessages: env.AI_MAX_CONTEXT_MESSAGES,
      includeSummaries: true,
    });

    return ctx.messages;
  } catch (e) {
    // Fallback to naive approach if smart context fails
    const messages = await prisma.message.findMany({
      where: { conversationId, status: MessageStatus.COMPLETED },
      orderBy: { createdAt: "asc" },
      take: env.AI_MAX_CONTEXT_MESSAGES,
    });
    const out: ChatMessage[] = [];
    if (systemPrompt) out.push({ role: "system", content: systemPrompt });
    for (const m of messages) {
      out.push({
        role: m.role.toLowerCase() as ChatMessage["role"],
        content: m.content,
      });
    }
    return out;
  }
}

function serialize(chunk: StreamEvent): string {
  return `event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`;
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: z.infer<typeof SendMessageSchema>,
  signal: AbortSignal,
  write: (chunk: string) => void
) {
  const { conv, ctx } = await assertConversationAccess(userId, conversationId);

  // 1. Claim uploaded files before creating the message. This prevents another
  // user or conversation from attaching a file simply by knowing its id.
  const attachmentIds = await claimConversationAttachments(userId, ctx.organizationId, conversationId, input.attachmentIds ?? []);

  if (input.parentId) {
    const parent = await prisma.message.findFirst({ where: { id: input.parentId, conversationId } });
    if (!parent) throw AppError.badRequest("Parent message does not belong to this conversation");
  }

  // 2. Persist user message and link its claimed attachments atomically.
  const userMessage = await prisma.message.create({
    data: {
      conversationId,
      role: MessageRole.USER,
      content: input.content,
      userId,
      status: MessageStatus.COMPLETED,
      parentId: input.parentId,
      ...(attachmentIds.length ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } } : {}),
    },
  });
  write(serialize({ event: "message.created", data: { id: userMessage.id, role: "user", content: userMessage.content, createdAt: userMessage.createdAt } }));

  // 2. Add any @mentioned agents as participants (dedupe).
  if (input.agentIds?.length) {
    for (const aid of input.agentIds) {
      const agent = await prisma.agent.findFirst({ where: { id: aid, organizationId: ctx.organizationId }, select: { id: true } });
      if (!agent) throw AppError.notFound("Agent not found");
      const exists = await prisma.conversationParticipant.findFirst({
        where: { conversationId, agentId: aid },
      });
      if (!exists) {
        await prisma.conversationParticipant.create({
          data: { conversationId, agentId: aid },
        });
      }
    }
  }

  // 3. Resolve model & create assistant message in STREAMING state.
  const modelId = input.modelId ?? conv.modelId ?? env.AI_DEFAULT_MODEL;
  const resolved = aiRegistry.resolve(modelId);
  if (!resolved) {
    write(serialize({ event: "message.error", data: { code: "AI_PROVIDER_CONFIGURATION_REQUIRED", message: AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE, error: { code: "AI_PROVIDER_CONFIGURATION_REQUIRED", message: AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } } }));
    return;
  }
  const assistantMsg = await prisma.message.create({
    data: {
      conversationId,
      role: MessageRole.ASSISTANT,
      content: "",
      modelId: resolved.model.id,
      status: MessageStatus.STREAMING,
    },
  });
  write(serialize({ event: "message.created", data: { id: assistantMsg.id, role: "assistant", modelId: resolved.model.id, status: "streaming" } }));
  write(serialize({ event: "typing", data: { messageId: assistantMsg.id } satisfies Record<string, unknown> }));

  // 4. Stream response.
  const history = await buildContext(conversationId);
  history.push({ role: "user", content: input.content });

  let fullText = "";
  const started = Date.now();
  let usage = { tokensIn: 0, tokensOut: 0, costMicros: 0 };
  // We track error info from yielded error chunks so we can propagate errorCode to SSE consumers
  // (both the streaming UI and the non-streaming fallback that collects events into JSON).
  let fatalErrorCode: string | null = null;
  let fatalErrorMessage: string | null = null;
  try {
    for await (const chunk of aiRegistry.guardedStream({
      model: resolved.model.id,
      messages: history,
      stream: true,
      signal,
    }, { userId, feature: "chat" })) {
      if (chunk.type === "token" && chunk.text) {
        fullText += chunk.text;
        write(serialize({ event: "message.delta", data: { id: assistantMsg.id, delta: chunk.text } }));
        // Periodically persist progress (every ~50 chars) without blocking.
        if (fullText.length % 50 < (chunk.text.length)) {
          prisma.message
            .update({ where: { id: assistantMsg.id }, data: { content: fullText } })
            .catch(() => {});
        }
      } else if (chunk.type === "done") {
        usage = {
          tokensIn: chunk.usage?.tokensIn ?? Math.ceil(history.reduce((a, m) => a + m.content.length, 0) / 4),
          tokensOut: chunk.usage?.tokensOut ?? Math.ceil(fullText.length / 4),
          costMicros: chunk.usage?.costMicros ?? 0,
        };
      } else if (chunk.type === "error") {
        fatalErrorCode = chunk.errorCode ?? "AI_PROVIDER_ERROR";
        fatalErrorMessage = chunk.error ?? "stream error";
        const aiErr: any = new Error(fatalErrorMessage);
        aiErr.code = fatalErrorCode;
        throw aiErr;
      }
    }
    // Persist final message.
    await prisma.$transaction([
      prisma.message.update({
        where: { id: assistantMsg.id },
        data: {
          content: fullText,
          status: MessageStatus.COMPLETED,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          costMicros: usage.costMicros,
          durationMs: Date.now() - started,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          summary: fullText.slice(0, 120),
        },
      }),
      prisma.activity.create({
        data: {
          organizationId: ctx.organizationId,
          workspaceId: ctx.workspaceId,
          userId,
          type: "MESSAGE_SENT",
          message: `sent a message in "${conv.title}"`,
          metadata: { conversationId, modelId: resolved.model.id },
        },
      }),
    ]);
    write(serialize({ event: "message.done", data: { id: assistantMsg.id, content: fullText, usage } }));
  } catch (err: any) {
    const errCode = err.code ?? fatalErrorCode ?? "AI_PROVIDER_ERROR";
    const errMsg = err.message ?? fatalErrorMessage ?? "error";
    await prisma.message.update({
      where: { id: assistantMsg.id },
      data: { status: MessageStatus.FAILED, error: errMsg, content: fullText },
    });
    write(serialize({ event: "message.error", data: { id: assistantMsg.id, error: { code: errCode, message: errMsg } } }));
  }
}

export async function listMessages(userId: string, conversationId: string, input: { page: number; perPage: number } = { page: 1, perPage: 100 }) {
  await assertConversationAccess(userId, conversationId);
  const where = { conversationId };
  const [messages, total] = await prisma.$transaction([
    prisma.message.findMany({
      where, orderBy: { createdAt: "asc" }, skip: (input.page - 1) * input.perPage, take: input.perPage,
      include: { user: { include: { profile: true } }, agent: true, attachments: true },
    }),
    prisma.message.count({ where }),
  ]);
  return {
    messages: messages.map((m) => ({
      id: m.id, role: m.role.toLowerCase(), content: m.content, status: m.status.toLowerCase(),
      modelId: m.modelId, tokensIn: m.tokensIn, tokensOut: m.tokensOut, createdAt: m.createdAt,
      user: m.user ? { id: m.user.id, email: m.user.email, displayName: m.user.profile?.displayName ?? null, avatarUrl: m.user.profile?.avatarUrl ?? null } : null,
      agent: m.agent ? { id: m.agent.id, name: m.agent.name, color: m.agent.color, emoji: m.agent.emoji } : null,
      attachments: m.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
    })),
    pagination: { page: input.page, perPage: input.perPage, total, totalPages: Math.ceil(total / input.perPage) },
  };
}
