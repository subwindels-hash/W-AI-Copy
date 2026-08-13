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
import { WhatsAppMediaService } from "./whatsappMedia.service.js";
import { WhatsAppJobService } from "./whatsappJob.service.js";
import { parseCommand, HELP_TEXT, type ParsedCommand } from "./whatsappCommands.js";
import { executeQuery, type CommandActor } from "./whatsappCommandExec.js";
import {
  ensureSession, setPendingAction, consumePendingAction, clearPendingAction,
  type PendingAction,
} from "./whatsappSession.service.js";
import { requestHumanHandoff, looksUnresolved } from "./whatsappHandoff.service.js";
import { auditService } from "../../audit/audit.service.js";
import { permissionsModule } from "../../permissions/permissions.module.js";
import type { ParsedInboundMessage } from "./whatsappPayload.js";
import type { ChatImage } from "../../services/ai/types.js";
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

/**
 * Executes a parsed command under the full security model of §9.
 *
 * Order matters and is deliberately hostile:
 *   1. identity   — a phone number is never authorisation on its own
 *   2. RBAC       — the linked user must actually hold the permission
 *   3. step-up    — high-risk actions need an explicit confirmation turn
 *   4. execution  — inline for queries, a background Job for real work
 *
 * Returns null when the message should fall through to normal conversation.
 */
async function handleCommand(ctx: {
  command: ParsedCommand;
  session: { id: string; pendingAction: PendingAction | null };
  actor: CommandActor;
  channel: any;
  identity: any;
  settings: WhatsAppChannelSettings;
  waConversationId: string;
  windelsConversationId: string;
  requestMessageId: string | null;
  documentText: string | null;
  userMessageId: string;
}): Promise<PipelineResult | null> {
  const { command, session, actor, channel, identity } = ctx;
  const reply = (text: string) =>
    WhatsAppMessageService.sendText(channel, identity.phoneNumber, text, {
      conversationId: ctx.waConversationId,
    });
  const done = (): PipelineResult => ({
    status: "processed", whatsappConversationId: ctx.waConversationId, replySent: true,
  });

  // ── help ────────────────────────────────────────────────────────────
  if (command.kind === "help") {
    // parseCommand downgrades an UNMATCHED high-risk phrase ("sell all my BTC
    // now") to a help stub precisely so the model can never improvise an
    // execution. Say plainly that it was not run.
    if (command.risk === "high") {
      await auditService.log({
        organizationId: actor.organizationId,
        userId: actor.userId ?? undefined,
        action: "channel.command_denied",
        resourceType: "channel_conversation",
        resourceId: ctx.waConversationId,
        metadata: { reason: "unmatched_high_risk_intent", raw: command.raw.slice(0, 200) },
      }).catch(() => { /* non-fatal */ });
      await reply(
        "⚠️ That looks like a high-risk request, and I won't act on it from WhatsApp without an exact, supported command.\n\n" +
        "*Nothing has been executed.*\n\n" + HELP_TEXT,
      );
      return done();
    }
    await reply(HELP_TEXT);
    return done();
  }

  // ── human handoff (§12) ─────────────────────────────────────────────
  if (command.kind === "handoff") {
    const handoff = await requestHumanHandoff({
      organizationId: actor.organizationId,
      whatsappConversationId: ctx.waConversationId,
      windelsConversationId: ctx.windelsConversationId,
      contactName: identity.displayName ?? null,
      phoneNumber: identity.phoneNumber,
      linkedUserId: actor.userId,
      reason: "user_requested",
      triggerText: command.raw,
    });
    await reply(handoff.replyText);
    return done();
  }

  // ── cancel a pending step-up ────────────────────────────────────────
  if (command.kind === "cancel") {
    const pending = await consumePendingAction(session.id);
    if (!pending) {
      await reply("There's nothing pending to cancel.");
      return done();
    }
    await auditService.log({
      organizationId: actor.organizationId,
      userId: actor.userId ?? undefined,
      action: "channel.stepup_cancelled",
      resourceType: "channel_conversation",
      resourceId: ctx.waConversationId,
      metadata: { kind: pending.kind, describe: pending.describe },
    }).catch(() => { /* audit must not break the reply */ });
    await reply(`Cancelled: ${pending.describe}. Nothing was executed.`);
    return done();
  }

  // ── confirm a pending step-up ───────────────────────────────────────
  if (command.kind === "confirm") {
    // consumePendingAction clears the row BEFORE we execute, so a duplicate
    // "CONFIRM" (or a Meta redelivery) cannot run the action twice.
    const pending = await consumePendingAction(session.id);
    if (!pending) {
      await reply("There's nothing awaiting confirmation. Send *HELP* to see what I can do.");
      return done();
    }
    await auditService.log({
      organizationId: actor.organizationId,
      userId: actor.userId ?? undefined,
      action: "channel.stepup_confirmed",
      resourceType: "channel_conversation",
      resourceId: ctx.waConversationId,
      metadata: { kind: pending.kind, describe: pending.describe, risk: pending.risk },
    }).catch(() => { /* non-fatal */ });

    const resumed: ParsedCommand = {
      kind: pending.kind as any,
      argument: pending.argument,
      raw: pending.raw,
      describe: pending.describe,
      risk: pending.risk as any,
      requiredPermissions: [],
      async: true,
    };
    return dispatchCommand({ ...ctx, command: resumed, confirmed: true });
  }

  return dispatchCommand({ ...ctx, confirmed: false });
}

/** Permission + step-up gate, then execution. */
async function dispatchCommand(ctx: {
  command: ParsedCommand;
  session: { id: string };
  actor: CommandActor;
  channel: any;
  identity: any;
  settings: WhatsAppChannelSettings;
  waConversationId: string;
  windelsConversationId: string;
  requestMessageId: string | null;
  documentText: string | null;
  confirmed: boolean;
}): Promise<PipelineResult | null> {
  const { command, actor, channel, identity } = ctx;
  const reply = (text: string) =>
    WhatsAppMessageService.sendText(channel, identity.phoneNumber, text, {
      conversationId: ctx.waConversationId,
    });
  const done = (): PipelineResult => ({
    status: "processed", whatsappConversationId: ctx.waConversationId, replySent: true,
  });

  const denied = async (reason: string, userText: string) => {
    await auditService.log({
      organizationId: actor.organizationId,
      userId: actor.userId ?? undefined,
      action: "channel.command_denied",
      resourceType: "channel_conversation",
      resourceId: ctx.waConversationId,
      metadata: { kind: command.kind, reason, raw: command.raw.slice(0, 200) },
    }).catch(() => { /* non-fatal */ });
    await reply(userText);
    return done();
  };

  // ── 1. identity: a phone number alone authorises nothing ────────────
  if (!actor.userId) {
    return denied(
      "unlinked_sender",
      "That action needs a verified WINDELS account. This number isn't linked yet — ask your administrator for a link code, then send it here to connect.",
    );
  }

  // ── 2. RBAC ─────────────────────────────────────────────────────────
  for (const permission of command.requiredPermissions) {
    const allowed = await permissionsModule
      .hasPermission(actor.userId, permission, actor.organizationId)
      .catch(() => false);
    if (!allowed) {
      return denied(
        `missing_permission:${permission}`,
        `You don't have permission to ${command.describe} in this workspace.`,
      );
    }
  }

  // ── 3. org policy through the EXISTING orchestrator ─────────────────
  const policy = await evaluateKernelPolicy({
    action: `whatsapp.command.${command.kind}`,
    risk: command.risk,
    organizationId: actor.organizationId,
    // Only a completed step-up counts as approval. Phase 1 hardcoded `true`
    // here; that hole is closed.
    approved: command.risk !== "high" ? true : ctx.confirmed,
  });
  if (!policy.allowed) {
    return denied(`policy_denied:${policy.reason ?? "unspecified"}`,
      "That action is blocked by your organisation's policy. A workspace administrator can authorise it.");
  }

  // ── 4. step-up for high-risk actions (§9) ───────────────────────────
  if (command.risk === "high" && !ctx.confirmed) {
    await setPendingAction(ctx.session.id, {
      kind: command.kind,
      argument: command.argument,
      raw: command.raw,
      describe: command.describe,
      risk: command.risk,
      requestedAt: new Date().toISOString(),
    });
    await auditService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: "channel.stepup_requested",
      resourceType: "channel_conversation",
      resourceId: ctx.waConversationId,
      metadata: { kind: command.kind, describe: command.describe },
    }).catch(() => { /* non-fatal */ });

    await reply(
      `⚠️ *Confirmation required*\n\nYou asked me to ${command.describe}.\n\n` +
      `This is a high-risk action, so I need you to confirm it explicitly.\n` +
      `Reply *CONFIRM* within 5 minutes to proceed, or *CANCEL* to discard.`,
    );
    return done();
  }

  // ── 5a. inline query ────────────────────────────────────────────────
  if (!command.async) {
    try {
      const outcome = await executeQuery(command, actor);
      if (!outcome) return null; // not a query after all — fall through
      await reply(outcome.text);
      return done();
    } catch (e: any) {
      logger.error("whatsapp inline command failed", {
        organizationId: actor.organizationId, kind: command.kind, err: e?.message,
      });
      await reply("I couldn't complete that just now. Please try again in a moment.");
      return { status: "failed", reason: "command_failed", whatsappConversationId: ctx.waConversationId, replySent: true };
    }
  }

  // ── 5b. long-running work → Job + ACK, never inside the webhook (§7)
  try {
    await WhatsAppJobService.createAndAck({
      organizationId: actor.organizationId,
      conversationId: ctx.waConversationId,
      requestMessageId: ctx.requestMessageId,
      command,
      actor,
      documentText: ctx.documentText,
    });
    return done();
  } catch (e: any) {
    logger.error("whatsapp job creation failed", {
      organizationId: actor.organizationId, kind: command.kind, err: e?.message,
    });
    await reply("I couldn't queue that request. Please try again in a moment.");
    return { status: "failed", reason: "job_create_failed", whatsappConversationId: ctx.waConversationId, replySent: true };
  }
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
  /** Inline image parts for the current turn — vision, not a text stand-in. */
  currentImages?: ChatImage[];
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
  // Attach the image bytes to the final user turn so the vision-capable
  // provider sees the picture itself, not a description of it.
  if (input.currentImages && input.currentImages.length > 0) {
    const target = messages[messages.length - 1];
    if (target && target.role === "user") target.images = input.currentImages;
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
    let inboundRowId: string | null = null;
    try {
      const inboundRow = await prisma.whatsAppMessage.create({
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
      inboundRowId = inboundRow.id;
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

    // ── Step 8b: media ingestion (§4) ──────────────────────────────────
    // Phase 1 refused every attachment. Phase 2 downloads it from the Graph
    // API and puts the extracted content in front of the SAME AI brain.
    const isMedia = ["image", "audio", "video", "document", "sticker"].includes(msg.messageType);
    let mediaFragment: string | null = null;
    let mediaImages: ChatImage[] = [];
    let mediaRecordId: string | null = null;
    let documentText: string | null = null;

    if (isMedia && !settings.mediaEnabled) {
      await WhatsAppMessageService.sendText(
        channel, identity.phoneNumber,
        "Media messages are not enabled on this channel. Please send your question as text.",
        { conversationId: waConversation.id },
      );
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: true };
    }

    if (isMedia && msg.mediaId) {
      const ingested = await WhatsAppMediaService.ingest({
        organizationId,
        conversationId: waConversation.id,
        whatsappMessageId: inboundRowId,
        mediaId: msg.mediaId,
        messageType: msg.messageType,
        mimeType: (msg.metadata as any)?.mime_type ?? null,
        filename: (msg.metadata as any)?.filename ?? null,
        caption: msg.text ?? null,
        credentials: {
          apiVersion: cfg.apiVersion,
          phoneNumberId: channel.phoneNumberId,
          accessToken: cfg.accessToken,
        },
        // Vision costs money per image, so it rides on the operator's own
        // media switch rather than being enabled implicitly.
        visionEnabled: settings.mediaEnabled === true,
        usage: { userId: identity.linkedUserId },
      });

      mediaRecordId = ingested.mediaRecordId;

      if (ingested.status === "COMPLETED") {
        mediaFragment = ingested.text;
        if (ingested.image) mediaImages = [ingested.image];
        if (ingested.kind === "document") documentText = ingested.text;
      } else {
        // The attachment could not be read. Say so plainly — never pretend to
        // have understood a file we failed to open.
        const explain = ingested.failureMessage
          ?? "I couldn't read that attachment. Please try re-sending it, or describe it in text.";
        await WhatsAppMessageService.sendText(channel, identity.phoneNumber, explain, {
          conversationId: waConversation.id,
        });
        if (ingested.configurationRequired) {
          await WhatsAppChannelService.recordError(channel.id, `Media processing: ${ingested.failureCode}`);
        }
        return { status: "processed", whatsappConversationId: waConversation.id, replySent: true };
      }
    }

    const userText = msg.text && msg.text.trim().length > 0 ? msg.text.trim() : "";
    const promptText = [userText, mediaFragment].filter(Boolean).join("\n\n")
      || describeNonText(msg);

    // Persist the user's turn in the REAL message table.
    const userMessage = await prisma.message.create({
      data: {
        conversationId: windelsConversationId,
        role: "USER",
        content: promptText,
        userId: identity.linkedUserId,
        status: "COMPLETED",
        metadata: {
          channel: "whatsapp",
          whatsappMessageId: msg.messageId,
          messageType: msg.messageType,
          ...(mediaRecordId ? { whatsappMediaId: mediaRecordId } : {}),
        },
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

    // ── Step 8c: session (§8) ──────────────────────────────────────────
    // One live session per conversation, 24h idle window, carrying the
    // identity/permission context and any pending confirmation.
    const session = await ensureSession({
      organizationId,
      conversationId: waConversation.id,
      linkedUserId: identity.linkedUserId,
    });

    const actor: CommandActor = {
      organizationId,
      userId: identity.linkedUserId,
      agentId: null,
      conversationId: windelsConversationId,
    };

    // ── Step 8d: WINDELS Command Layer (§6) ────────────────────────────
    // Runs BEFORE agent selection: an explicit instruction is executed through
    // the Workflow Engine / Agent Orchestration, not paraphrased by a model.
    const command = parseCommand(userText);

    if (command) {
      const cmdResult = await handleCommand({
        command, session, actor, channel, identity, settings,
        waConversationId: waConversation.id,
        windelsConversationId,
        requestMessageId: inboundRowId,
        documentText,
        userMessageId: userMessage.id,
      });
      if (cmdResult) return cmdResult;
      // A null result means "not handled here" — fall through to conversation.
    } else if (session.pendingAction) {
      // Something is awaiting confirmation and the user said something else.
      // Do not silently execute it, and do not silently drop it either.
      await WhatsAppMessageService.sendText(
        channel, identity.phoneNumber,
        `You have a pending action: *${session.pendingAction.describe}*.\nReply *CONFIRM* to run it or *CANCEL* to discard it.`,
        { conversationId: waConversation.id },
      );
      return { status: "processed", whatsappConversationId: waConversation.id, replySent: true };
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
      currentImages: mediaImages,
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
          // An image turn must go to a vision-capable model. Pinning the
          // agent's configured text model would silently drop the picture,
          // so in that case we let the router choose by capability.
          ...(agent?.modelId && mediaImages.length === 0
            ? { model: agent.modelId }
            : { model: "" }),
          ...(mediaImages.length > 0 ? { requiredCapabilities: ["vision"] as any } : {}),
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

    // ── §12: escalate when the AI itself admits it cannot resolve ──────
    // Only when the operator has enabled handoff — some orgs run the channel
    // fully automated and do not want tickets raised on their behalf.
    if (settings.humanEscalationEnabled && looksUnresolved(answer)) {
      const handoff = await requestHumanHandoff({
        organizationId,
        whatsappConversationId: waConversation.id,
        windelsConversationId,
        contactName: identity.displayName ?? null,
        phoneNumber: identity.phoneNumber,
        linkedUserId: identity.linkedUserId,
        reason: "ai_unresolved",
        triggerText: promptText,
      });
      await WhatsAppMessageService.sendText(channel, identity.phoneNumber, handoff.replyText, {
        conversationId: waConversation.id,
      });
    }

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
