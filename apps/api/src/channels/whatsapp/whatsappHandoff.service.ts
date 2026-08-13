/**
 * Human handoff — Phase 2 §12.
 *
 * Phase 1 marked a conversation ESCALATED and stopped there: nobody was ever
 * told. This closes that loop by raising a real ticket in the EXISTING
 * Customer Support Center (HelpdeskService) and attaching the conversation
 * transcript, so the human agent opens the ticket already knowing the context.
 *
 * No new support system, no new inbox, no new notification channel.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { HelpdeskService } from "../../helpdesk/helpdesk.service.js";
import { auditService } from "../../audit/audit.service.js";
import { notificationsService } from "../../notifications/notifications.service.js";

/** How much history the human agent receives with the ticket. */
const TRANSCRIPT_TURNS = 20;

export interface HandoffInput {
  organizationId: string;
  /** WhatsAppConversation.id */
  whatsappConversationId: string;
  /** WINDELS Conversation.id — the source of the transcript. */
  windelsConversationId: string | null;
  contactName: string | null;
  phoneNumber: string;
  linkedUserId: string | null;
  /** Why we are escalating: the user asked, or the AI could not resolve it. */
  reason: "user_requested" | "ai_unresolved" | "policy_block" | "high_risk";
  /** The message that triggered the escalation. */
  triggerText: string;
}

export interface HandoffResult {
  ok: boolean;
  ticketId: string | null;
  ticketNumber: string | null;
  /** The message to send back to the WhatsApp user. */
  replyText: string;
}

const REASON_LABEL: Record<HandoffInput["reason"], string> = {
  user_requested: "The customer asked to speak to a person",
  ai_unresolved: "The AI assistant could not resolve the request",
  policy_block: "An organisation policy blocked the automated response",
  high_risk: "A high-risk action needs human authorisation",
};

/** Builds the transcript the human agent will read. */
async function buildTranscript(windelsConversationId: string | null): Promise<string> {
  if (!windelsConversationId) return "(no prior conversation history)";
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: windelsConversationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: TRANSCRIPT_TURNS,
      select: { role: true, content: true, createdAt: true },
    });
    if (messages.length === 0) return "(no prior conversation history)";
    return messages
      .reverse()
      .map((m) => {
        const who = m.role === "USER" ? "Customer" : m.role === "ASSISTANT" ? "WINDELS AI" : String(m.role);
        const when = new Date(m.createdAt).toISOString().replace("T", " ").slice(0, 16);
        return `[${when}] ${who}: ${(m.content ?? "").slice(0, 1000)}`;
      })
      .join("\n");
  } catch (e: any) {
    logger.warn("whatsapp handoff transcript failed", { err: e?.message });
    return "(transcript unavailable)";
  }
}

/**
 * Escalates a WhatsApp conversation to a human.
 *
 * Idempotent per conversation: an already-escalated thread does not spawn a
 * second ticket, so a user typing "human" five times does not create five.
 */
export async function requestHumanHandoff(input: HandoffInput): Promise<HandoffResult> {
  const existing = await prisma.whatsAppConversation
    .findUnique({ where: { id: input.whatsappConversationId }, select: { status: true, metadata: true } })
    .catch(() => null);

  const priorTicket = (existing?.metadata as any)?.helpdeskTicketNumber ?? null;
  if (existing?.status === "ESCALATED" && priorTicket) {
    return {
      ok: true,
      ticketId: (existing?.metadata as any)?.helpdeskTicketId ?? null,
      ticketNumber: priorTicket,
      replyText: `You're already in the queue for a human agent (ticket ${priorTicket}). Someone will reply here shortly.`,
    };
  }

  const transcript = await buildTranscript(input.windelsConversationId);
  const requesterName = input.contactName?.trim() || input.phoneNumber;

  try {
    const ticket = await HelpdeskService.createTicket(
      input.organizationId,
      {
        subject: `WhatsApp escalation from ${requesterName}`,
        description: [
          `Escalation reason: ${REASON_LABEL[input.reason]}.`,
          `WhatsApp number: ${input.phoneNumber}`,
          input.linkedUserId ? `Linked WINDELS user: ${input.linkedUserId}` : "This number is NOT linked to a WINDELS account — verify identity before sharing account data.",
          "",
          `Latest message: ${input.triggerText.slice(0, 1000)}`,
          "",
          "── Conversation transcript ──",
          transcript,
        ].join("\n"),
        // "chat" is the existing channel enum value that fits a messaging thread.
        channel: "chat",
        priority: input.reason === "high_risk" ? "high" : "medium",
        requesterName,
        tags: ["whatsapp", `reason:${input.reason}`],
      },
      input.linkedUserId,
    );

    await prisma.whatsAppConversation
      .update({
        where: { id: input.whatsappConversationId },
        data: {
          status: "ESCALATED",
          metadata: {
            ...((existing?.metadata as any) ?? {}),
            helpdeskTicketId: ticket.id,
            helpdeskTicketNumber: ticket.number,
            escalatedAt: new Date().toISOString(),
            escalationReason: input.reason,
          },
        },
      })
      .catch((e: any) => logger.warn("whatsapp handoff status update failed", { err: e?.message }));

    // Tell the humans through the EXISTING notification service. Notifications
    // are per-user, so route to the org's owners/admins — an unlinked WhatsApp
    // number has no WINDELS user of its own to notify.
    await notifyResponders(input.organizationId, ticket.number, requesterName, input.reason, {
      ticketId: ticket.id,
      whatsappConversationId: input.whatsappConversationId,
    });

    await auditService
      .log({
        organizationId: input.organizationId,
        userId: input.linkedUserId ?? undefined,
        action: "channel.handoff_requested",
        resourceType: "channel_conversation",
        resourceId: input.whatsappConversationId,
        metadata: { reason: input.reason, ticketNumber: ticket.number },
      })
      .catch(() => { /* audit must never break the flow */ });

    return {
      ok: true,
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      replyText: `👤 I've passed this to a human agent. Your reference is *${ticket.number}* — someone will reply here shortly. The AI assistant is paused on this conversation until then.`,
    };
  } catch (e: any) {
    logger.error("whatsapp handoff failed", { organizationId: input.organizationId, err: e?.message });

    // The ticket failed, but the user still must not be left talking to a bot
    // that cannot help. Escalate the conversation state regardless.
    await prisma.whatsAppConversation
      .update({ where: { id: input.whatsappConversationId }, data: { status: "ESCALATED" } })
      .catch(() => { /* best effort */ });

    return {
      ok: false,
      ticketId: null,
      ticketNumber: null,
      replyText: "I've flagged this conversation for a human agent. Someone will get back to you as soon as possible.",
    };
  }
}

/** Notifies org owners/admins that a WhatsApp thread needs a person. */
async function notifyResponders(
  organizationId: string,
  ticketNumber: string,
  requesterName: string,
  reason: HandoffInput["reason"],
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const responders = await prisma.membership.findMany({
      where: { organizationId, role: { in: ["OWNER", "ADMIN"] as any } },
      select: { userId: true },
      take: 10,
    });
    for (const r of responders) {
      await notificationsService
        .createAndSend({
          userId: r.userId,
          organizationId,
          title: `WhatsApp escalation ${ticketNumber}`,
          body: `${requesterName} needs a human agent. ${REASON_LABEL[reason]}.`,
          category: "collaboration.message_received",
          priority: reason === "high_risk" ? "high" : "normal",
          channels: ["in_app"],
          data,
        })
        .catch(() => { /* one failed notification must not block the handoff */ });
    }
  } catch (e: any) {
    logger.warn("whatsapp handoff notify failed", { organizationId, err: e?.message });
  }
}

/** True when the AI's own answer signals it could not help (§12 auto-escalation). */
export function looksUnresolved(answer: string): boolean {
  // A failed generation can hand us null/undefined; escalating on that would
  // open a ticket for every provider hiccup.
  if (typeof answer !== "string" || !answer.trim()) return false;
  const t = answer.toLowerCase();
  return (
    /i (?:can'?t|cannot|am unable to) (?:help|assist|do that)/.test(t) ||
    /i (?:don'?t|do not) have (?:access|the ability|enough information)/.test(t) ||
    /please contact (?:support|a human|customer service)/.test(t)
  );
}
