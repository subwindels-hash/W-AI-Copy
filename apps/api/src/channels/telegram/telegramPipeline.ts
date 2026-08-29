/**
 * Telegram inbound pipeline.
 *
 * The webhook does validation + enqueue only; this runs off the request path
 * and delegates every capability to an EXISTING WINDELS system:
 *   conversation → prisma Conversation / Message
 *   reasoning    → aiRegistry (the single AI brain)
 *   memory       → the conversation's message history
 *   billing      → aiRegistry usage tags
 *   governance   → Kernel policy + permissionsModule
 *
 * There is NO Telegram-specific AI logic.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } from "../../services/ai/types.js";
import type { ChatImage, ChatMessage } from "../../services/ai/types.js";
import { permissionsModule } from "../../permissions/permissions.module.js";
import { auditService } from "../../audit/audit.service.js";
import { Permission } from "@prisma/client";
import { TelegramIdentityService, type ResolvedTelegramIdentity } from "./telegramIdentity.service.js";
import { TelegramOutbound } from "./telegramOutbound.js";
import { TelegramMedia } from "./telegramMedia.js";
import { parseCommand, HELP_TEXT, gatingMessage } from "./telegramCommands.js";
import type { TelegramChannel } from "@prisma/client";
import { resolveConfig } from "./telegramConfig.js";

const CONTEXT_TURNS = 10;

type Inbound = {
  channel: TelegramChannel;
  identity: ResolvedTelegramIdentity;
  chat: { id: number; type: string; title?: string };
  message: { id: number; text: string | null; media?: { fileId: string; mimeType?: string; fileName?: string; caption?: string; kind: string } };
};

export type PipelineResult = { status: "processed" | "ignored" | "failed"; reason?: string; replySent?: boolean };

async function ensureChat(channel: TelegramChannel, identity: ResolvedTelegramIdentity, chat: Inbound["chat"]) {
  return prisma.telegramChat.upsert({
    where: { channelId_telegramChatId: { channelId: channel.id, telegramChatId: BigInt(chat.id) } },
    create: { organizationId: channel.organizationId, channelId: channel.id, connectionId: identity.connectionId, telegramChatId: BigInt(chat.id), chatType: chat.type, title: chat.title ?? null },
    update: { lastMessageAt: new Date(), connectionId: identity.connectionId, ...(chat.title ? { title: chat.title } : {}) },
  });
}

async function ensureWindelsConversation(organizationId: string, tgChatId: string, existing: string | null, linkedUserId: string | null, label: string): Promise<string | null> {
  if (existing) {
    const found = await prisma.conversation.findFirst({ where: { id: existing, organizationId, deletedAt: null }, select: { id: true } });
    if (found) return found.id;
  }
  let ownerId = linkedUserId;
  if (!ownerId) {
    const owner = await prisma.membership.findFirst({ where: { organizationId, role: { in: ["OWNER", "ADMIN"] as any } }, orderBy: { createdAt: "asc" }, select: { userId: true } }).catch(() => null);
    ownerId = owner?.userId ?? null;
  }
  if (!ownerId) { logger.error("telegram: org has no owner to attribute conversation", { organizationId }); return null; }
  const created = await prisma.conversation.create({
    data: { organizationId, title: `Telegram — ${label}`, createdById: ownerId, metadata: { channel: "telegram", telegramChatId: tgChatId, identityVerified: Boolean(linkedUserId) } },
  });
  await prisma.telegramChat.update({ where: { id: tgChatId }, data: { windelsConversationId: created.id } }).catch(() => {});
  return created.id;
}

function buildContext(windelsConversationId: string, isLinked: boolean, currentText: string, currentImages: ChatImage[]): Promise<ChatMessage[]> {
  return prisma.message.findMany({ where: { conversationId: windelsConversationId }, orderBy: { createdAt: "desc" }, take: CONTEXT_TURNS, select: { role: true, content: true } })
    .then((history) => {
      const messages: ChatMessage[] = [{
        role: "system",
        content: [
          "You are the WINDELS AI assistant, replying over Telegram.",
          "Keep answers concise and readable on a phone, and use HTML formatting sparingly.",
          isLinked
            ? "This user has a verified WINDELS account and may ask about their own authorized data."
            : "This user has NOT verified a WINDELS account. Never reveal account, billing or private data; direct them to link.",
        ].join(" "),
      }];
      for (const m of history.reverse()) {
        const role = m.role === "USER" ? "user" : m.role === "ASSISTANT" ? "assistant" : null;
        if (role && m.content) messages.push({ role, content: m.content });
      }
      const last = messages[messages.length - 1];
      if (!last || last.role !== "user" || last.content !== currentText) messages.push({ role: "user", content: currentText });
      if (currentImages.length) {
        const target = messages[messages.length - 1];
        if (target?.role === "user") target.images = currentImages;
      }
      return messages;
    });
}

export const TelegramPipeline = {
  async process(input: Inbound): Promise<PipelineResult> {
    const { channel, identity, chat } = input;
    const cfg = resolveConfig(channel);
    if (!channel.enabled) return { status: "ignored", reason: "channel disabled" };
    if (cfg.settings.maintenanceMode) {
      await TelegramOutbound.sendText(channel, chat.id, "🛠️ WINDELS Telegram is in maintenance mode. Please try again shortly.");
      return { status: "processed", replySent: true };
    }
    if (await TelegramIdentityService.isBlocked(identity.connectionId)) return { status: "ignored", reason: "blocked" };

    const tgChat = await ensureChat(channel, identity, chat);

    // ── Ingest media ──
    let userText = input.message.text?.trim() ?? "";
    let images: ChatImage[] = [];
    if (input.message.media) {
      const m = input.message.media;
      const ingested = await TelegramMedia.ingest(channel, m.fileId, m.mimeType, m.fileName, m.caption ?? null, cfg.settings);
      if (ingested.kind === "image" && ingested.image) {
        images = [{ mimeType: ingested.image.mimeType, dataBase64: ingested.image.data.toString("base64") }];
        userText = [userText, ingested.text].filter(Boolean).join("\n\n") || "Analyze this image.";
      } else if (ingested.text) {
        userText = [userText, ingested.text].filter(Boolean).join("\n\n");
      }
    }
    if (!userText) return { status: "ignored", reason: "empty" };

    const windelsConversationId = await ensureWindelsConversation(channel.organizationId, tgChat.id, tgChat.windelsConversationId, identity.linkedUserId, identity.displayName ?? identity.username ?? `user ${identity.telegramUserId}`);
    if (!windelsConversationId) return { status: "failed", reason: "no conversation owner" };

    // ── Commands ──
    const command = parseCommand(userText);
    if (command) {
      const result = await this.handleCommand({ command, channel, identity, chat, windelsConversationId });
      if (result.handled) return { status: "processed", replySent: true };
      userText = userText.replace(command.raw, "").trim() || "help";
    }

    // Gating: unlinked users get a link prompt before any account-data answers.
    if (!identity.isLinked && /\b(my|billing|account|wallet|usage|subscription|organization)\b/i.test(userText)) {
      await TelegramOutbound.sendText(channel, chat.id, gatingMessage(identity)!);
      return { status: "processed", replySent: true };
    }

    // ── Persist user turn ──
    const userMessage = await prisma.message.create({
      data: { conversationId: windelsConversationId, role: "USER", content: userText, userId: identity.linkedUserId, status: "COMPLETED", metadata: { channel: "telegram", telegramMessageId: input.message.id } },
    });
    await prisma.conversation.update({ where: { id: windelsConversationId }, data: { lastMessageAt: new Date() } }).catch(() => {});

    const assistantMessage = await prisma.message.create({
      data: { conversationId: windelsConversationId, role: "ASSISTANT", content: "", agentId: null, status: "PENDING", parentId: userMessage.id, metadata: { channel: "telegram" } },
    });

    // ── Reasoning through the ONE AI brain ──
    try {
      const context = await buildContext(windelsConversationId, identity.isLinked, userText, images);
      const completion = await aiRegistry.complete(
        { model: "", messages: context, temperature: 0.7, maxTokens: 1024, ...(images.length ? { requiredCapabilities: ["vision"] as any } : {}) },
        { userId: identity.linkedUserId ?? undefined, organizationId: channel.organizationId, conversationId: windelsConversationId, channel: "chat", feature: "telegram" },
      );
      const answer = (completion.content ?? "").trim();
      if (!answer) throw new Error("empty AI response");
      await prisma.message.update({ where: { id: assistantMessage.id }, data: { content: answer, status: "COMPLETED", modelId: completion.model ?? null, tokensIn: completion.usage?.tokensIn ?? null, tokensOut: completion.usage?.tokensOut ?? null, costMicros: completion.usage?.costMicros ?? null } });
      const sent = await TelegramOutbound.sendText(channel, chat.id, answer, { windelsMessageId: assistantMessage.id });
      return { status: sent.ok ? "processed" : "failed", reason: sent.ok ? undefined : sent.error?.code, replySent: sent.ok };
    } catch (e: any) {
      const code = e?.code ?? "AI_ERROR";
      await prisma.message.update({ where: { id: assistantMessage.id }, data: { status: "FAILED", error: String(e?.message ?? e).slice(0, 500) } }).catch(() => {});
      logger.error("telegram AI generation failed", { organizationId: channel.organizationId, code });
      const note = code === "AI_PROVIDER_CONFIGURATION_REQUIRED"
        ? AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE
        : "Sorry — I can't generate a reply right now. Please try again shortly.";
      await TelegramOutbound.sendText(channel, chat.id, note);
      return { status: "failed", reason: code, replySent: true };
    }
  },

  async handleCommand(ctx: { command: ReturnType<typeof parseCommand> extends infer T ? T extends { name: infer N } ? { name: N; argument: string; raw: string } : never : never; channel: TelegramChannel; identity: ResolvedTelegramIdentity; chat: { id: number; type: string }; windelsConversationId: string }): Promise<{ handled: boolean }> {
    const { command, channel, identity, chat } = ctx;
    if (!command || typeof command !== "object") return { handled: false };
    const c = command as { name: string; argument: string; raw: string };
    const send = (text: string) => TelegramOutbound.sendText(channel, chat.id, text);

    switch (c.name) {
      case "start": {
        if (!c.argument) { await send(`👋 Welcome to WINDELS AI.\n\n${HELP_TEXT}`); return { handled: true }; }
        const res = await TelegramIdentityService.consumeLinkingToken({ channelId: channel.id, connectionId: identity.connectionId, telegramUserId: identity.telegramUserId, token: c.argument });
        await send(res.ok ? "✅ Your Telegram account is now linked to WINDELS. You can access your authorized capabilities here." : `❌ ${res.error}`);
        return { handled: true };
      }
      case "help": await send(HELP_TEXT); return { handled: true };
      case "login": case "connect": {
        await send("To connect, open WINDELS → Integrations → Telegram and choose *Connect Telegram*. You'll get a secure link to /start here.");
        return { handled: true };
      }
      case "disconnect": {
        if (!identity.isLinked) { await send("This Telegram account isn't linked."); return { handled: true }; }
        await TelegramIdentityService.unlink({ userId: identity.linkedUserId!, connectionId: identity.connectionId });
        await send("✅ Your Telegram account has been unlinked.");
        return { handled: true };
      }
      case "status": {
        await send(`*Status*\nLinked: ${identity.isLinked ? "✅ yes" : "❌ no"}\nUser: ${identity.linkedUserId ? "verified" : "channel identity"}\nChannel: ${channel.name}`);
        return { handled: true };
      }
      case "newchat": case "clear": {
        await prisma.conversation.update({ where: { id: ctx.windelsConversationId }, data: { deletedAt: new Date() } }).catch(() => {});
        await send("🧹 Started a new conversation.");
        return { handled: true };
      }
      case "usage": {
        if (!identity.isLinked) { await send(gatingMessage(identity)!); return { handled: true }; }
        const [msgs, convs] = await Promise.all([
          prisma.message.count({ where: { conversation: { organizationId: channel.organizationId }, userId: identity.linkedUserId } }),
          prisma.conversation.count({ where: { organizationId: channel.organizationId, createdById: identity.linkedUserId } }),
        ]);
        await send(`*Usage*\nMessages: ${msgs}\nConversations: ${convs}`);
        return { handled: true };
      }
      case "billing": {
        if (!identity.isLinked) { await send(gatingMessage(identity)!); return { handled: true }; }
        const allowed = await permissionsModule.hasPermission(identity.linkedUserId!, Permission.BILLING_READ, channel.organizationId).catch(() => false);
        await send(allowed ? "Open WINDELS → Billing to manage your subscription." : "You don't have billing permission in this workspace.");
        return { handled: true };
      }
      case "agents": {
        const allowed = identity.isLinked;
        await send(allowed ? "Agents are available through WINDELS. Describe your task and the orchestrator will select the right agent." : gatingMessage(identity)!);
        return { handled: true };
      }
      case "workflows": {
        if (!identity.isLinked) { await send(gatingMessage(identity)!); return { handled: true }; }
        await send("To run a workflow, tell me which one (e.g. \"run my daily business report\"). Workflow permissions are enforced exactly as in the web app.");
        return { handled: true };
      }
      case "stop": case "cancel": await send("⏹ There's nothing running in this conversation right now."); return { handled: true };
      case "settings": {
        await auditService.log({ organizationId: channel.organizationId, userId: identity.linkedUserId, action: "data.read", resourceType: "conversation", resourceId: String(chat.id) }).catch(() => {});
        await send(`*Settings*\nMedia: ${cfg(channel).settings.mediaEnabled ? "on" : "off"}\nVoice: ${cfg(channel).settings.voiceEnabled ? "on" : "off"}\nResponse: ${cfg(channel).settings.responseMode ?? "ai"}`);
        return { handled: true };
      }
      case "support": await send("Contact support in WINDELS → Help, or reply here and an agent will assist where authorized."); return { handled: true };
      default: return { handled: false };
    }
  },
};

function cfg(channel: TelegramChannel) { return resolveConfig(channel); }
