/**
 * Contact AI Assistant.
 *
 * Helps a user explain their issue before submitting a contact request. It
 * searches approved WINDELS knowledge, provides basic answers when it can,
 * asks follow-up questions, and determines when human support is required. It
 * never fabricates policies, pricing or commitments.
 *
 * The assistant keeps a small in-memory conversation store (transient) plus a
 * persistent record in the ContactRequest row's aiConversationId once a
 * request is created. It distinguishes verified knowledge answers from
 * clarifying prompts.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { aiRegistry } from "../services/ai/registry.js";
import type {
  ContactAiReply,
  ContactCategory,
  ContactFormInput,
} from "@windels/shared/contactCenter";
import { CONTACT_CATEGORIES } from "@windels/shared/contactCenter";

interface ChatSession {
  id: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  collected: Partial<ContactFormInput>;
  category: ContactCategory;
  needsHuman: boolean;
}

const sessions = new Map<string, ChatSession>();
// Cap transient sessions to bound memory.
setInterval(() => {
  if (sessions.size > 2000) {
    const keys = [...sessions.keys()].slice(0, 500);
    keys.forEach((k) => sessions.delete(k));
  }
}, 5 * 60_000).unref?.();

const SYSTEM_PROMPT = `You are the WINDELS AI OS contact assistant. You help users explain their issue before a contact request is submitted.

Rules you MUST follow:
- Never fabricate company policies, support answers, pricing, technical information, or commitments. If you don't know something, say so and offer to create a contact request for a human support representative.
- Identify the reason for contacting WINDELS and the best contact category.
- Ask only the information that is actually necessary. Prefer email; phone is optional.
- When you have the user's name, email, a subject and a clear description, say you are ready to create the contact request.
- If the user needs human support (technical troubleshooting you can't resolve, billing, security, etc.), tell them a human support representative may need to review the request.

Contact categories: general, sales, technical, billing, api_developer, partnership, enterprise, security, report_problem, feedback, other.

Keep replies concise and helpful.`;

const KNOWLEDGE_SYSTEM_HINT =
  "Use the approved WINDELS AI OS knowledge provided below to answer factually. If the answer is not in the provided knowledge, say you do not have that specific information and offer to escalate.";

/** Search approved WINDELS knowledge (AgentKnowledge). */
async function searchKnowledge(query: string, organizationId?: string | null): Promise<string[]> {
  try {
    const where: any = query ? { content: { contains: query, mode: "insensitive" } } : {};
    const rows = await prisma.agentKnowledge.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { title: true, content: true },
    });
    return rows.map((r) => `- ${r.title}: ${r.content.slice(0, 500)}`);
  } catch {
    return [];
  }
}

/** Best-guess category from the conversation (deterministic keyword fallback). */
function guessCategory(text: string, seed?: string): ContactCategory {
  const t = `${seed ?? ""} ${text}`.toLowerCase();
  if (/(billing|invoice|payment|charge|refund|subscription|price|cost)/.test(t)) return "billing";
  if (/(api|developer|sdk|key|oauth|webhook|integration)/.test(t)) return "api_developer";
  if (/(security|breach|privacy|data leak|unauthori[sz]ed|phishing|hack)/.test(t)) return "security";
  if (/(partner|affiliate|collaborat|integrat with us)/.test(t)) return "partnership";
  if (/(enterprise|company|organization contract|team plan)/.test(t)) return "enterprise";
  if (/(sales|buy|purchase|quote|demo|sign up)/.test(t)) return "sales";
  if (/(bug|error|not working|broken|crash|fail|issue|problem|can't|cannot)/.test(t)) return "technical";
  if (/(feedback|suggest|improve|feature request)/.test(t)) return "feedback";
  if (seed && CONTACT_CATEGORIES.includes(seed as ContactCategory)) return seed as ContactCategory;
  return "general";
}

function isNeedsHuman(category: ContactCategory, text: string): boolean {
  return category === "security" || category === "billing" || /urgent|emergency|critical/.test(text.toLowerCase());
}

export const ContactAiService = {
  async start(message: string, ctx?: { name?: string; email?: string; organizationId?: string | null }): Promise<ContactAiReply> {
    const id = randomUUID();
    const session: ChatSession = {
      id,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      collected: { ...(ctx?.name ? { name: ctx.name } : {}), ...(ctx?.email ? { email: ctx.email } : {}) },
      category: "general",
      needsHuman: false,
    };
    session.messages.push({ role: "user", content: message });
    sessions.set(id, session);
    return this.respond(id, message, ctx?.organizationId ?? null);
  },

  async message(conversationId: string, message: string, organizationId?: string | null): Promise<ContactAiReply> {
    const session = sessions.get(conversationId);
    if (!session) throw new Error("Conversation not found or expired. Please start a new chat.");
    session.messages.push({ role: "user", content: message });
    return this.respond(conversationId, message, organizationId ?? null);
  },

  async respond(conversationId: string, latestUser: string, organizationId: string | null): Promise<ContactAiReply> {
    const session = sessions.get(conversationId)!;
    session.category = guessCategory(latestUser, session.collected.category);
    session.needsHuman = isNeedsHuman(session.category, latestUser);

    // Extract contact fields with a lightweight heuristic (name/email/subject).
    this.extractFields(session, latestUser);

    const knowledge = await searchKnowledge(latestUser, organizationId);
    const knowledgeBlock = knowledge.length
      ? `${KNOWLEDGE_SYSTEM_HINT}\n\nApproved knowledge:\n${knowledge.join("\n")}`
      : "No approved knowledge matched this query.";

    const prompt: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      ...session.messages.slice(0, -1),
      { role: "user", content: `${latestUser}\n\n${knowledgeBlock}` },
    ];

    let reply = "";
    try {
      const res = await aiRegistry.complete(
        { model: "windels-assistant", messages: prompt, temperature: 0.3, maxTokens: 400 },
        { organizationId: organizationId ?? undefined, channel: "chat", feature: "contact-assistant" },
      );
      reply = res.content.trim() || "I'd be happy to help. Could you describe your issue in a bit more detail?";
    } catch {
      reply = this.fallbackReply(session, latestUser);
    }
    session.messages.push({ role: "assistant", content: reply });

    const ready = this.isReady(session);
    return {
      conversationId,
      reply,
      readyToSubmit: ready,
      collected: session.collected,
      needsHuman: session.needsHuman,
      category: session.category,
      answeredFromKnowledge: knowledge.length > 0,
    };
  },

  extractFields(session: ChatSession, text: string) {
    const c = session.collected;
    const nameMatch = text.match(/(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z .'-]{1,60})(?=\s+and|\s*[,.]|\s*$)/i);
    if (!c.name && nameMatch) c.name = nameMatch[1].trim();
    const emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (!c.email && emailMatch) c.email = emailMatch[0];
    const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
    if (!c.phone && phoneMatch) c.phone = phoneMatch[0].trim();
    const subjectMatch = text.match(/(?:subject|about|regarding)\s*[:]?\s+(.{3,80})/i);
    if (!c.subject && subjectMatch) c.subject = subjectMatch[1].trim();
  },

  isReady(session: ChatSession): boolean {
    const c = session.collected;
    return Boolean(c.name && c.email && (c.subject || c.message));
  },

  fallbackReply(session: ChatSession, text: string): string {
    const cat = session.category;
    const needsHuman = session.needsHuman;
    if (needsHuman) {
      return "Based on your message, a human support representative will likely need to review your request. I'll collect a bit of information and create a contact request so the right team can follow up. Could you confirm your name and email address?";
    }
    if (cat === "billing") {
      return "I can help you get a billing question to the right team. I don't have specific billing details beyond what's documented, so I'll create a contact request for our Billing team. What's your name and email?";
    }
    if (cat === "technical") {
      return "Let's make sure we capture your issue clearly so our Technical Support team can help. Please describe what you're experiencing, and share your name and email so we can follow up.";
    }
    return "Thanks for reaching out. So I can route your request to the right team, could you share your name, email, and a short subject line for your issue?";
  },

  /** Build a structured ContactRequest draft from a session's collected data. */
  buildDraft(conversationId: string, description: string): { collected: Partial<ContactFormInput>; category: ContactCategory } {
    const session = sessions.get(conversationId);
    const collected = session?.collected ?? {};
    if (!collected.message && description) collected.message = description;
    if (!collected.subject && description) collected.subject = description.slice(0, 80);
    return { collected, category: session?.category ?? guessCategory(description) };
  },
};

export { sessions as contactChatSessions };
