/**
 * The WhatsApp inbound pipeline — Phase 1 §6, steps 5-17.
 *
 * Steps 1-4 (receive, validate, verify signature, identify channel) happen in
 * the webhook handler so that Meta gets its ACK immediately. Everything from
 * contact identification onward runs here, off the request path, driven by the
 * queue worker.
 *
 * Every stage delegates to an existing WINDELS system:
 *   conversation  → prisma Conversation / Message  (the real chat system)
 *   orchestration → KernelService                  (God-Node)
 *   reasoning     → aiRegistry                     (the one AI brain)
 *   metering      → aiRegistry usage tags          (existing billing)
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } from "../../services/ai/types.js";
import type { ChatMessage } from "../../services/ai/types.js";
import { WhatsAppChannelService, resolveConfig } from "./whatsappChannel.service.js";
import { WhatsAppIdentityService } from "./whatsappIdentity.service.js";
import { WhatsAppMessageService } from "./whatsappMessage.service.js";
import { selectAgent } from "./whatsappAgentRouter.js";
import { emitKernelEvent, evaluateKernelPolicy } from "./whatsappKernel.js";
import { checkWhatsAppRateLimits } from "./whatsappRateLimit.js";
import type { ParsedInboundMessage } from "./whatsappPayload.js";
import type { WhatsAppChannelSettings } from "@windels/shared";

/** How many prior turns are replayed as context. */
const CONTEXT_TURNS = 10;

const TYPE_TO_PRISMA: Record<string, string> = {
  text: "TEXT", image: "IMAGE", audio: "AUDIO", video: "VIDEO", document: "DOCUMENT",
  location: "LOCATION", interactive: "INTERACTIVE", button: "BUTTON", reaction: "REACTION",
  sticker: "STICKER", contacts: "CONTACTS", order: "ORDER", system: "SYSTEM", unknown: "UNKNOWN",
};

export interface PipelineResult {
  status: "processed" | "ignored" | "rate_limited" | "failed" | "duplicate";
  reason?: string;
  whatsappConversationId?: string;
  replySent?: boolean;
}

/** Minutes-since-midnight in the channel's timezone. */
function minutesInTz(now: Date, timeZone: string): { minutes: number; day: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return { minutes: h * 60 + m, day: Math.max(0, days.indexOf(wd)) };
  } catch {
    return { minutes: now.getUTCHours() * 60 + now.getUTCMinutes(), day: now.getUTCDay() };
  }
}

function withinWorkingHours(settings: WhatsAppChannelSettings, now = new Date()): boolean {
  const wh = settings.workingHours;
  if (!wh?.enabled) return true;
  const { minutes, day } = minutesInTz(now, settings.timezone || "UTC");
  if (Array.isArray(wh.days) && wh.days.length > 0 && !wh.days.includes(day)) return false;
  // A window that wraps midnight (e.g. 22:00 → 06:00).
  if (wh.startMinute <= wh.endMinute) return minutes >= wh.startMinute && minutes <= wh.endMinute;
  return minutes >= wh.startMinute || minutes <= wh.endMinute;
}

/** Human-readable stand-in for media we accepted but did not transcribe. */
function describeNonText(msg: ParsedInboundMessage): string {
  switch (msg.messageType) {
    case "image": return "[the user sent an image]";
    case "audio": return "[the user sent a voice note]";
    case "video": return "[the user sent a video]";
    case "document": return `[the user sent a document${msg.metadata?.filename ? `: ${msg.metadata.filename}` : ""}]`;
    case "location": return `[the user shared a location${msg.text ? `: ${msg.text}` : ""}]`;
    case "sticker": return "[the user sent a sticker]";
    case "contacts": return "[the user shared a contact card]";
    default: return "[the user sent an unsupported message type]";
  }
}

/**
 * Ensures a WINDELS Conversation backs the WhatsApp thread.
 *
 * Conversation.createdById is non-nullable, so an unlinked channel identity
 * needs an owner: we attribute to the linked user when there is one, else to
 * the organisation's owner. The conversation is tagged so it is filterable and
 * so an unlinked thread can never be mistaken for a user's private chat.
 */
async function ensureWindelsConversation(input: {
  organizationId: string;
  waConversationId: string;
  existingConversationId: string | null;
  linkedUserId: string | null;
  displayName: string | null;
  phoneNumber: string;
}): Promise<string | null> {
  if (input.existingConversationId) {
    const still = await prisma.conversation.findFirst({
      where: { id: input.existingConversationId, organizationId: input.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (still) return still.id;
  }

  let ownerId = input.linkedUserId;
  if (!ownerId) {
    const owner = await prisma.membership.findFirst({
      where: { organizationId: input.organizationId, role: { in: ["OWNER", "ADMIN"] as any } },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    }).catch(() => null);
    ownerId = owner?.userId ?? null;
  }
  if (!ownerId) {
    logger.error("cannot create WINDELS conversation: organization has no owner", { organizationId: input.organizationId });
    return null;
  }

  const label = input.displayName || `+${input.phoneNumber}`;
  const created = await prisma.conversation.create({
    data: {
      organizationId: input.organizationId,
      title: `WhatsApp — ${label}`,
      createdById: ownerId,
      metadata: {
        channel: "whatsapp",
        whatsappConversationId: input.waConversationId,
        // Explicitly records that this thread is NOT an authenticated user's
        // private conversation unless a verified link exists.
        identityVerified: Boolean(input.linkedUserId),
      },
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: input.waConversationId },
    data: { windelsConversationId: created.id },
  });
  return created.id;
}

/**
 * Builds the model context.
 *
 * MEMORY CONTRACT (§9): only the *current conversation* is replayed. No
 * cross-conversation memory, no knowledge-base retrieval and no org data are
 * injected for an unlinked contact — a WhatsApp sender must never receive
 * another user's private information.
 */
async function buildContext(input: {
  windelsConversationId: string;
  isLinked: boolean;
  agentPrompt: string | null;
  currentText: string;
}): Promise<ChatMessage[]> {
  const history = await prisma.message.findMany({
    where: { conversationId: input.windelsConversationId },
    orderBy: { createdAt: "desc" },
    take: CONTEXT_TURNS,
    select: { role: true, content: true },
  });

  const system = [
    input.agentPrompt || "You are a helpful WINDELS AI assistant.",
    "You are replying over WhatsApp. Keep answers concise and readable on a phone.",
    input.isLinked
      ? "This user has verified their WINDELS account and may ask about their own data."
      : "This user has NOT verified a WINDELS account. Never reveal account, billing, organisation, or any private data. If they ask for such information, tell them to link and verify their WINDELS account first.",
  ].join(" ");

  const messages: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of history.reverse()) {
    const role = m.role === "USER" ? "user" : m.role === "ASSISTANT" ? "assistant" : null;
    if (role && m.content) messages.push({ role, content: m.content });
  }
  // The current turn is already persisted, so avoid duplicating it.
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content !== input.currentText) {
    messages.push({ role: "user", content: input.currentText });
  }
  return messages;
}

export const WhatsAppPipeline = {
  /**
   * Processes one inbound message end to end.
   * Never throws: every failure is captured and reported as a PipelineResult.
   */
  async processInboundMessage(msg: ParsedInboundMessage): Promise<PipelineResult> {
    // ── Step 4: identify the channel ───────────────────────────────────
    const channel = await WhatsAppChannelService.findByPhoneNumberId(msg.phoneNumberId);
    if (!channel) return { status: "ignored", reason: "no channel registered for this phone number id" };
    if (!channel.enabled) return { status: "ignored", reason: "channel disabled" };

    const cfg = resolveConfig(channel);
    const settings = cfg.settings;
    const organizationId = channel.organizationId;

    // ── Step 5: identify the contact ───────────────────────────────────
    const identity = await WhatsAppIdentityService.resolveContact({
      channelId: channel.id,
      organizationId,
      whatsappUserId: msg.waId,
      phoneNumber: msg.from,
      profileName: msg.profileName,
    });

    if (await WhatsAppIdentityService.isBlocked(identity.contactId)) {
      return { status: "ignored", reason: "contact blocked or opted out" };
    }

    // ── Step 11 (early): rate limiting, before any expensive work ──────
    const limits = await checkWhatsAppRateLimits({
      organizationId,
      contactId: identity.contactId,
      phoneNumber: identity.phoneNumber,
      settings,
    });
    if (!limits.allowed) {
      logger.warn("whatsapp inbound rate limited", { organizationId, scope: limits.scope });
      await emitKernelEvent("whatsapp.rate_limited", { organizationId, scope: limits.scope });
      return { status: "rate_limited", reason: limits.scope };
    }

    // ── Step 6: identify or create the WhatsApp conversation ───────────
    const waConversation = await prisma.whatsAppConversation.upsert({
      where: { channelId_contactId: { channelId: channel.id, contactId: identity.contactId } },
      create: {
        organizationId,
        channelId: channel.id,
        contactId: identity.contactId,
        lastMessageAt: msg.timestamp,
      },
      update: { lastMessageAt: msg.timestamp, status: "OPEN" },
    });

    // ── Step 8: store inbound message metadata (idempotent on wamid) ───
    try {
      await prisma.whatsAppMessage.create({
        data: {
          organizationId,
          conversationId: waConversation.id,
          whatsappMessageId: msg.messageId,
          direction: "INBOUND",
          messageType: (TYPE_TO_PRISMA[msg.messageType] ?? "UNKNOWN") as any,
          text: msg.text,
          mediaId: msg.mediaId,
          status: "DELIVERED",
          metadata: msg.metadata as any,
          deliveredAt: msg.timestamp,
        },
      });
    } catch (e: any) {
      // A unique-constraint hit means Meta redelivered a message we already have.
      if (e?.code === "P2002") return { status: "duplicate", reason: "message already stored" };
      throw e;
    }

    // ── Step 7 + 9: bind to the existing WINDELS conversation system ───
    const windelsConversationId = await ensureWindelsConversation({
      organizationId,
      waConversationId: waConversation.id,
      existingConversationId: waConversation.windelsConversationId,
      linkedUserId: identity.linkedUserId,
      displayName: identity.displayName,
      phoneNumber: identity.phoneNumber,
    });
    if (!windelsConversationId) {
      return { status: "failed", reason: "could not bind a WINDELS conversation" };
    }

    const promptText = msg.text && msg.text.trim().length > 0 ? msg.text.trim() : describeNonText(msg);

    // Media arrives when media handling is disabled → refuse politely.
    const isMedia = ["image", "audio", "video", "document", "sticker"].includes(msg.messageType);
    if (isMedia && !settings.mediaEnabled) {
      await WhatsAppMessageService.sendText(
        channel, identity.phoneNumber,
        "Media messages are not enabled on this channel. Please send your question as text.",
        { conversationId: waConversation.id },
      );
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: true };
    }

    // Persist the user's turn in the REAL message table.
    const userMessage = await prisma.message.create({
      data: {
        conversationId: windelsConversationId,
        role: "USER",
        content: promptText,
        userId: identity.linkedUserId,
        status: "COMPLETED",
        metadata: { channel: "whatsapp", whatsappMessageId: msg.messageId, messageType: msg.messageType },
      },
    });
    await prisma.conversation.update({
      where: { id: windelsConversationId },
      data: { lastMessageAt: new Date() },
    }).catch(() => { /* non-fatal */ });

    // ── Step 9: dispatch to the God-Node Orchestrator ──────────────────
    await emitKernelEvent("whatsapp.message.received", {
      organizationId,
      channelId: channel.id,
      conversationId: windelsConversationId,
      contactLinked: identity.isLinked,
      messageType: msg.messageType,
    });

    // Response mode / working hours gates.
    if (settings.responseMode === "off") {
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: false };
    }
    if (settings.responseMode === "human") {
      await prisma.whatsAppConversation.update({
        where: { id: waConversation.id }, data: { status: "ESCALATED" },
      }).catch(() => { /* non-fatal */ });
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: false };
    }
    if (!withinWorkingHours(settings)) {
      if (settings.autoResponseText) {
        await WhatsAppMessageService.sendText(channel, identity.phoneNumber, settings.autoResponseText, {
          conversationId: waConversation.id,
        });
        return { status: "processed", whatsappConversationId: waConversation.id, replySent: true };
      }
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: false };
    }

    // ── Step 13: policy check through the orchestrator ─────────────────
    const policy = await evaluateKernelPolicy({
      action: "whatsapp.ai_response",
      risk: identity.isLinked ? "low" : "medium",
      organizationId,
      approved: true,
    });
    if (!policy.allowed) {
      logger.warn("whatsapp AI response blocked by kernel policy", { organizationId, reason: policy.reason });
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: false };
    }

    // ── Step 10: agent selection over the org's existing agents ────────
    const agent = await selectAgent({
      organizationId,
      text: msg.text,
      allowedAgentIds: settings.allowedAgentIds ?? [],
    });

    // ── Step 11 + 12: generate the response via the ONE AI brain ───────
    const context = await buildContext({
      windelsConversationId,
      isLinked: identity.isLinked,
      agentPrompt: agent?.systemPrompt ?? null,
      currentText: promptText,
    });

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: windelsConversationId,
        role: "ASSISTANT",
        content: "",
        agentId: agent?.id ?? null,
        status: "PENDING",
        parentId: userMessage.id,
        metadata: { channel: "whatsapp", agentDomain: agent?.domain ?? "general" },
      },
    });

    let answer: string;
    try {
      const completion = await aiRegistry.complete(
        {
          ...(agent?.modelId ? { model: agent.modelId } : { model: "" }),
          messages: context,
          temperature: agent?.temperature ?? 0.7,
          maxTokens: Math.min(agent?.maxTokens ?? 1024, 1024),
        },
        {
          // ── Step 17: usage metering through the existing pipeline ────
          userId: identity.linkedUserId ?? undefined,
          organizationId,
          agentId: agent?.id,
          conversationId: windelsConversationId,
          channel: "chat",
          feature: "whatsapp",
        },
      );
      answer = (completion.content ?? "").trim();
      if (!answer) throw new Error("The AI provider returned an empty response");

      await prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          content: answer,
          status: "COMPLETED",
          modelId: completion.model ?? null,
          tokensIn: completion.usage?.tokensIn ?? null,
          tokensOut: completion.usage?.tokensOut ?? null,
          costMicros: completion.usage?.costMicros ?? null,
        },
      });
    } catch (e: any) {
      const code = e?.code ?? "AI_ERROR";
      const isConfig = code === "AI_PROVIDER_CONFIGURATION_REQUIRED";
      await prisma.message.update({
        where: { id: assistantMessage.id },
        data: { status: "FAILED", error: String(e?.message ?? e).slice(0, 500) },
      }).catch(() => { /* non-fatal */ });

      logger.error("whatsapp AI generation failed", { organizationId, code });
      await emitKernelEvent("whatsapp.ai_failed", { organizationId, channelId: channel.id, code });
      await WhatsAppChannelService.recordError(
        channel.id,
        isConfig ? AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE : `AI generation failed: ${code}`,
      );

      // No fabricated answer. The user is told the service is unavailable.
      await WhatsAppMessageService.sendText(
        channel, identity.phoneNumber,
        "Sorry — I can't generate a reply right now. Please try again shortly.",
        { conversationId: waConversation.id },
      );
      return { status: "failed", reason: code, whatsappConversationId: waConversation.id, replySent: true };
    }

    // ── Step 14: send via the shared outbound service ──────────────────
    const sent = await WhatsAppMessageService.sendText(channel, identity.phoneNumber, answer, {
      conversationId: waConversation.id,
      windelsMessageId: assistantMessage.id,
    });

    // ── Step 16: update conversation state ─────────────────────────────
    await prisma.whatsAppConversation.update({
      where: { id: waConversation.id },
      data: { lastMessageAt: new Date() },
    }).catch(() => { /* non-fatal */ });
    await prisma.conversation.update({
      where: { id: windelsConversationId },
      data: { lastMessageAt: new Date() },
    }).catch(() => { /* non-fatal */ });

    await emitKernelEvent("whatsapp.response.delivered", {
      organizationId, channelId: channel.id, ok: sent.ok, agentId: agent?.id ?? null,
    });

    return {
      status: sent.ok ? "processed" : "failed",
      reason: sent.ok ? undefined : sent.error?.code,
      whatsappConversationId: waConversation.id,
      replySent: sent.ok,
    };
  },
};
