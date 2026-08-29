/**
 * Conversation Summarizer (Module 2 — Gap 4)
 *
 * Automatically summarizes long conversations to preserve context when
 * messages are dropped from the context window. Uses the AI provider
 * to generate concise summaries that capture:
 * - Key decisions and conclusions
 * - Action items and tasks
 * - Important facts and context
 * - User preferences and requirements
 *
 * Summaries are stored as special SYSTEM messages with metadata
 * and injected into context by the ContextManager.
 */
import { prisma } from "../../db/client.js";
import { aiRegistry } from "./registry.js";
import { MessageRole, MessageStatus } from "@prisma/client";
import { logger } from "../../config/logger.js";
import { estimateTokens } from "./contextManager.js";
import { buildSmartContext, getUnsumarizedRange } from "./contextManager.js";

// ─── Summarization Prompt ───────────────────────────────────────

const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a concise, structured summary of a conversation that preserves all important context for future reference.

Focus on:
1. **Key decisions** — what was decided and why
2. **Action items** — tasks assigned or agreed upon
3. **Important facts** — data, requirements, constraints mentioned
4. **User preferences** — how the user wants things done
5. **Open questions** — unresolved issues or pending items

Format your summary as a structured list. Be concise but complete. Do not include greetings or meta-commentary.`;

const SUMMARIZE_USER_PROMPT = `Summarize the following conversation. Focus on decisions, action items, important facts, and user preferences.

CONVERSATION:
{{conversation}}

SUMMARY:`;

// ─── Summarization Service ──────────────────────────────────────

export interface SummarizationResult {
  summaryId: string;
  content: string;
  messagesSummarized: number;
  fromTimestamp: Date;
  toTimestamp: Date;
  tokensUsed: number;
}

/**
 * Summarize a conversation's unsymmarized messages.
 * Creates a SYSTEM message with the summary and metadata.
 */
export async function summarizeConversation(
  conversationId: string,
  organizationId: string,
  options?: {
    maxMessages?: number;      // Max messages to summarize at once (default 50)
    maxTokens?: number;        // Max tokens in summary (default 500)
    force?: boolean;           // Force summarization even if below threshold
    threshold?: number;        // Min messages before summarizing (default 20)
  },
): Promise<SummarizationResult | null> {
  const {
    maxMessages = 50,
    maxTokens = 500,
    force = false,
    threshold = 20,
  } = options ?? {};

  // Check if summarization is needed
  const range = await getUnsumarizedRange(conversationId);
  if (!force && range.count < threshold) {
    return null;
  }

  if (range.count === 0) {
    return null;
  }

  // Fetch messages to summarize
  const where: any = {
    conversationId,
    status: MessageStatus.COMPLETED,
    role: { not: "SYSTEM" },
  };
  if (range.from) {
    where.createdAt = { gte: range.from };
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: maxMessages,
    include: {
      user: { include: { profile: true } },
      agent: true,
    },
  });

  if (messages.length === 0) return null;

  // Build conversation text for summarization
  const conversationText = messages
    .map((m) => {
      const speaker = m.user
        ? `User (${m.user.profile?.displayName ?? m.user.email})`
        : m.agent
          ? `Agent (${m.agent.name})`
          : m.role;
      return `${speaker}: ${m.content}`;
    })
    .join("\n\n");

  // Estimate tokens in conversation
  const inputTokens = estimateTokens(conversationText);
  if (inputTokens < 100) {
    // Too short to summarize
    return null;
  }

  // Call AI to generate summary
  const resolved = aiRegistry.resolve();
  if (!resolved) {
    logger.warn("No AI provider available for summarization", { conversationId });
    return null;
  }

  const userPrompt = SUMMARIZE_USER_PROMPT.replace("{{conversation}}", conversationText.slice(0, 8000));

  try {
    const result = await aiRegistry.complete(
      {
        model: resolved.model.id,
        messages: [
          { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        maxTokens,
        temperature: 0.3, // Low temperature for factual summaries
      },
      { feature: "summarization" },
    );

    const summaryContent = result.content.trim();
    if (!summaryContent) {
      logger.warn("Empty summary returned", { conversationId });
      return null;
    }

    // Store summary as a SYSTEM message with metadata
    const summaryMessage = await prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.SYSTEM,
        content: summaryContent,
        status: MessageStatus.COMPLETED,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costMicros: result.usage.costMicros,
        // Store metadata as JSON (if the schema supports it)
        // Otherwise, use a separate Summary model
      },
    });

    logger.info("Conversation summarized", {
      conversationId,
      summaryId: summaryMessage.id,
      messagesSummarized: messages.length,
      tokensUsed: result.usage.tokensIn + result.usage.tokensOut,
    });

    return {
      summaryId: summaryMessage.id,
      content: summaryContent,
      messagesSummarized: messages.length,
      fromTimestamp: messages[0].createdAt,
      toTimestamp: messages[messages.length - 1].createdAt,
      tokensUsed: result.usage.tokensIn + result.usage.tokensOut,
    };
  } catch (e: any) {
    logger.warn("Summarization failed", { conversationId, error: e.message });
    return null;
  }
}

/**
 * Get all summaries for a conversation.
 */
export async function getConversationSummaries(conversationId: string) {
  return prisma.message.findMany({
    where: {
      conversationId,
      role: MessageRole.SYSTEM,
      // In a full implementation, filter by metadata.type === "summary"
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/**
 * Progressive summarization: summarize existing summaries to create
 * a higher-level overview. Useful for very long conversations.
 */
export async function progressiveSummarize(
  conversationId: string,
  organizationId: string,
): Promise<SummarizationResult | null> {
  const summaries = await getConversationSummaries(conversationId);
  if (summaries.length < 3) return null; // Need at least 3 summaries to combine

  const combinedText = summaries
    .reverse() // Oldest first
    .map((s, i) => `Summary ${i + 1} (${s.createdAt.toLocaleDateString()}):\n${s.content}`)
    .join("\n\n---\n\n");

  const resolved = aiRegistry.resolve();
  if (!resolved) return null;

  try {
    const result = await aiRegistry.complete(
      {
        model: resolved.model.id,
        messages: [
          {
            role: "system",
            content: "You are creating a high-level overview by combining multiple conversation summaries. Extract the most important points, decisions, and context. Be concise.",
          },
          {
            role: "user",
            content: `Combine these conversation summaries into a single comprehensive overview:\n\n${combinedText.slice(0, 6000)}`,
          },
        ],
        maxTokens: 800,
        temperature: 0.3,
      },
      { feature: "progressive-summarization" },
    );

    const summaryMessage = await prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.SYSTEM,
        content: `[Progressive Overview]\n${result.content.trim()}`,
        status: MessageStatus.COMPLETED,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costMicros: result.usage.costMicros,
      },
    });

    return {
      summaryId: summaryMessage.id,
      content: result.content.trim(),
      messagesSummarized: summaries.length,
      fromTimestamp: summaries[summaries.length - 1].createdAt,
      toTimestamp: summaries[0].createdAt,
      tokensUsed: result.usage.tokensIn + result.usage.tokensOut,
    };
  } catch (e: any) {
    logger.warn("Progressive summarization failed", { conversationId, error: e.message });
    return null;
  }
}

/**
 * Auto-summarize conversations that need it.
 * Called periodically by a background job.
 */
export async function autoSummarizeConversations(
  batchSize: number = 10,
  threshold: number = 40,
): Promise<number> {
  // Find conversations with many unsymmarized messages
  const conversations = await prisma.conversation.findMany({
    where: {
      deletedAt: null,
      lastMessageAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Active in last 24h
    },
    orderBy: { lastMessageAt: "desc" },
    take: batchSize * 2, // Over-fetch to account for filtering
  });

  let summarized = 0;
  for (const conv of conversations) {
    if (summarized >= batchSize) break;

    const range = await getUnsumarizedRange(conv.id);
    if (range.count >= threshold) {
      const orgId = conv.organizationId;
      const result = await summarizeConversation(conv.id, orgId, { threshold });
      if (result) summarized++;
    }
  }

  if (summarized > 0) {
    logger.info("Auto-summarization complete", { conversations: summarized });
  }

  return summarized;
}
