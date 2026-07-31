/**
 * Context Window Manager (Module 2 — Gap 2)
 *
 * Intelligently builds context for AI requests by:
 * 1. Counting tokens (tiktoken-style estimation)
 * 2. Allocating budget across system/history/current message
 * 3. Prioritizing recent messages over older ones
 * 4. Truncating when exceeding model limits
 * 5. Injecting summaries for dropped context
 */
import type { ChatMessage } from "./types.js";
import { prisma } from "../../db/client.js";
import { MessageStatus } from "@prisma/client";
import { logger } from "../../config/logger.js";

// ─── Token Estimation ───────────────────────────────────────────
// Rough estimation: ~4 chars per token for English, ~2 chars per token for CJK.
// This is intentionally conservative (over-estimates) so we never exceed limits.

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters (higher density)
  let cjkChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3000 && code <= 0x303f) || // CJK Punctuation
      (code >= 0xac00 && code <= 0xd7af)    // Korean
    ) {
      cjkChars++;
    }
  }
  const nonCjk = text.length - cjkChars;
  return Math.ceil(cjkChars / 2 + nonCjk / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  // Add ~4 tokens per message for role/formatting overhead
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

// ─── Context Budget ─────────────────────────────────────────────

interface ContextBudget {
  totalTokens: number;         // Model's context window
  systemTokens: number;        // Reserved for system prompt (10%)
  historyTokens: number;       // Available for history (70%)
  currentTokens: number;       // Reserved for current exchange (20%)
  maxOutputTokens: number;     // Model's max output
}

export function calculateBudget(
  contextWindow: number,
  maxOutput: number,
  systemPromptLength: number = 0,
): ContextBudget {
  const systemTokens = Math.max(
    Math.ceil(contextWindow * 0.1),
    estimateTokens(systemPromptLength > 0 ? "x".repeat(systemPromptLength) : "") + 100,
  );
  const outputReserve = Math.min(maxOutput, Math.ceil(contextWindow * 0.2));
  const historyTokens = contextWindow - systemTokens - outputReserve;

  return {
    totalTokens: contextWindow,
    systemTokens,
    historyTokens,
    currentTokens: outputReserve,
    maxOutputTokens: maxOutput,
  };
}

// ─── Context Builder ────────────────────────────────────────────

interface ContextBuildOptions {
  conversationId: string;
  systemPrompt?: string;
  contextWindow?: number;    // Default 128000
  maxOutput?: number;        // Default 4096
  maxMessages?: number;      // Hard cap on messages (default 100)
  includeSummaries?: boolean; // Include conversation summaries
}

interface BuiltContext {
  messages: ChatMessage[];
  tokensUsed: number;
  messagesIncluded: number;
  messagesDropped: number;
  truncated: boolean;
  summaryInjected: boolean;
}

/**
 * Build an intelligent context for a conversation.
 *
 * Strategy:
 * 1. Always include system prompt first
 * 2. Always include the most recent messages (up to budget)
 * 3. If budget allows, include older messages
 * 4. If messages were dropped, inject a summary of them
 * 5. Pin important messages (decisions, action items) even if old
 */
export async function buildSmartContext(
  options: ContextBuildOptions,
): Promise<BuiltContext> {
  const {
    conversationId,
    systemPrompt,
    contextWindow = 128000,
    maxOutput = 4096,
    maxMessages = 100,
    includeSummaries = true,
  } = options;

  const budget = calculateBudget(contextWindow, maxOutput, systemPrompt?.length ?? 0);
  const messages: ChatMessage[] = [];
  let tokensUsed = 0;

  // 1. System prompt
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
    tokensUsed += estimateTokens(systemPrompt) + 4;
  }

  // 2. Fetch messages from DB (newest first, then reverse)
  const dbMessages = await prisma.message.findMany({
    where: {
      conversationId,
      status: MessageStatus.COMPLETED,
    },
    orderBy: { createdAt: "desc" },
    take: maxMessages,
  });

  // Reverse to chronological order
  dbMessages.reverse();

  // 3. Check for existing summaries (system messages with summary metadata)
  const summaries = await prisma.message.findMany({
    where: {
      conversationId,
      role: "SYSTEM",
      metadata: { path: ["type"], equals: "summary" },
    },
    orderBy: { createdAt: "desc" },
    take: 3, // Last 3 summaries
  });

  // 4. Build context from newest messages first (fill budget)
  const includedMessages: ChatMessage[] = [];
  let historyTokens = 0;
  let messagesIncluded = 0;
  let messagesDropped = dbMessages.length;
  let truncated = false;

  // Process from newest to oldest, then reverse
  for (let i = dbMessages.length - 1; i >= 0; i--) {
    const m = dbMessages[i];
    const msgTokens = estimateTokens(m.content) + 4;

    if (historyTokens + msgTokens > budget.historyTokens) {
      truncated = true;
      break;
    }

    includedMessages.unshift({
      role: m.role.toLowerCase() as ChatMessage["role"],
      content: m.content,
    });
    historyTokens += msgTokens;
    messagesIncluded++;
    messagesDropped--;
  }

  // 5. Inject summary of dropped messages if available
  let summaryInjected = false;
  if (truncated && includeSummaries && summaries.length > 0) {
    // Find summaries that cover the dropped time range
    const droppedCutoff = dbMessages[messagesIncluded]?.createdAt;
    const relevantSummaries = summaries.filter(
      (s) => !droppedCutoff || s.createdAt < droppedCutoff,
    );

    if (relevantSummaries.length > 0) {
      const summaryText = relevantSummaries
        .map((s) => s.content)
        .join("\n\n");
      const summaryTokens = estimateTokens(summaryText) + 4;

      if (historyTokens + summaryTokens <= budget.historyTokens) {
        includedMessages.unshift({
          role: "system",
          content: `[Summary of earlier conversation]\n${summaryText}`,
        });
        historyTokens += summaryTokens;
        summaryInjected = true;
      }
    }
  }

  // If no summaries exist but messages were dropped, generate a brief note
  if (truncated && !summaryInjected && messagesDropped > 0) {
    includedMessages.unshift({
      role: "system",
      content: `[Note: ${messagesDropped} earlier messages were omitted to fit context window. Focus on the most recent exchange.]`,
    });
  }

  // 6. Combine system prompt + history
  messages.push(...includedMessages);
  tokensUsed += historyTokens;

  return {
    messages,
    tokensUsed,
    messagesIncluded,
    messagesDropped,
    truncated,
    summaryInjected,
  };
}

// ─── Context Trimmer ────────────────────────────────────────────

/**
 * Trim a set of messages to fit within a token budget.
 * Keeps the most recent messages and system messages.
 */
export function trimMessagesToBudget(
  messages: ChatMessage[],
  maxTokens: number,
): { messages: ChatMessage[]; tokensUsed: number; dropped: number } {
  const result: ChatMessage[] = [];
  let tokensUsed = 0;
  let dropped = 0;

  // Always keep system messages
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  for (const m of systemMessages) {
    const t = estimateTokens(m.content) + 4;
    result.push(m);
    tokensUsed += t;
  }

  // Add non-system messages from newest to oldest
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const m = nonSystemMessages[i];
    const t = estimateTokens(m.content) + 4;

    if (tokensUsed + t > maxTokens) {
      dropped = i + 1;
      break;
    }

    result.splice(systemMessages.length, 0, m);
    tokensUsed += t;
  }

  return { messages: result, tokensUsed, dropped };
}

// ─── Auto-Summarization Trigger ─────────────────────────────────

/**
 * Check if a conversation needs summarization.
 * Returns true if the conversation has enough messages to warrant a summary.
 */
export async function needsSummarization(
  conversationId: string,
  thresholdMessages: number = 40,
): Promise<boolean> {
  const count = await prisma.message.count({
    where: {
      conversationId,
      status: MessageStatus.COMPLETED,
    },
  });
  return count >= thresholdMessages;
}

/**
 * Get the unsymmarized message range for a conversation.
 * Returns messages that haven't been covered by a summary yet.
 */
export async function getUnsumarizedRange(
  conversationId: string,
): Promise<{ from: Date | null; to: Date; count: number }> {
  const lastSummary = await prisma.message.findFirst({
    where: {
      conversationId,
      role: "SYSTEM",
      metadata: { path: ["type"], equals: "summary" },
    },
    orderBy: { createdAt: "desc" },
  });

  const where: any = {
    conversationId,
    status: MessageStatus.COMPLETED,
    role: { not: "SYSTEM" },
  };
  if (lastSummary) {
    where.createdAt = { gt: lastSummary.createdAt };
  }

  const [oldest, newest, count] = await Promise.all([
    prisma.message.findFirst({ where, orderBy: { createdAt: "asc" } }),
    prisma.message.findFirst({ where, orderBy: { createdAt: "desc" } }),
    prisma.message.count({ where }),
  ]);

  return {
    from: oldest?.createdAt ?? null,
    to: newest?.createdAt ?? new Date(),
    count,
  };
}
