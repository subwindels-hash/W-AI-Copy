/**
 * Agent selection for WhatsApp turns.
 *
 * Selection runs over the organisation's EXISTING `Agent` rows — this module
 * creates no agents and holds no AI logic of its own. It scores the org's
 * agents against the inbound text and returns the best match, honouring the
 * channel's `allowedAgentIds` allow-list.
 */
import { prisma } from "../../db/client.js";

/** The Phase 1 domain taxonomy, with the cues that route to each. */
const DOMAINS: Array<{ domain: string; keywords: string[] }> = [
  { domain: "education", keywords: ["learn", "study", "course", "lesson", "teach", "exam", "homework", "tutor", "school", "university", "explain"] },
  { domain: "business", keywords: ["invoice", "client", "revenue", "sales", "marketing", "proposal", "contract", "strategy", "customer", "startup", "business"] },
  { domain: "trading", keywords: ["trade", "trading", "stock", "crypto", "bitcoin", "forex", "market", "portfolio", "invest", "chart", "price"] },
  { domain: "health", keywords: ["health", "symptom", "doctor", "medicine", "fitness", "diet", "sleep", "workout", "mental", "wellness"] },
  { domain: "developer", keywords: ["code", "bug", "api", "deploy", "function", "typescript", "python", "database", "error", "repository", "compile", "server"] },
  { domain: "media", keywords: ["image", "video", "photo", "design", "edit", "render", "audio", "music", "thumbnail", "logo"] },
  { domain: "knowledge", keywords: ["document", "file", "knowledge", "search", "summarize", "summary", "reference", "archive", "note"] },
  { domain: "research", keywords: ["research", "paper", "study", "analysis", "data", "evidence", "compare", "investigate", "source", "citation"] },
  { domain: "assistant", keywords: ["remind", "schedule", "meeting", "calendar", "task", "todo", "book", "appointment", "plan"] },
  { domain: "general", keywords: [] },
];

/** Classifies free text into one of the domains above. */
export function classifyDomain(text: string | null): string {
  if (!text) return "general";
  const lower = text.toLowerCase();
  let best = "general";
  let bestScore = 0;
  for (const { domain, keywords } of DOMAINS) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = domain;
    }
  }
  return best;
}

export interface SelectedAgent {
  id: string;
  name: string;
  systemPrompt: string | null;
  modelId: string | null;
  temperature: number;
  maxTokens: number;
  domain: string;
}

/** How strongly an agent matches a domain, by its own metadata. */
function scoreAgent(agent: any, domain: string): number {
  const haystack = [
    agent.name, agent.role, agent.department, agent.description,
    ...(Array.isArray(agent.capabilities) ? agent.capabilities : []),
  ].filter(Boolean).join(" ").toLowerCase();

  let score = 0;
  if (haystack.includes(domain)) score += 10;
  const cues = DOMAINS.find((d) => d.domain === domain)?.keywords ?? [];
  for (const kw of cues) {
    if (haystack.includes(kw)) score += 1;
  }
  // Prefer a purpose-built agent over the catch-all when both match.
  if (domain !== "general" && /general/.test(haystack)) score -= 2;
  return score;
}

/**
 * Picks the agent that should answer. Returns null when the org has no agent
 * available — the caller then answers with the default WINDELS assistant
 * persona rather than failing.
 */
export async function selectAgent(input: {
  organizationId: string;
  text: string | null;
  allowedAgentIds: string[];
}): Promise<SelectedAgent | null> {
  const domain = classifyDomain(input.text);

  const agents = await prisma.agent.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.allowedAgentIds.length > 0 ? { id: { in: input.allowedAgentIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (agents.length === 0) return null;

  let best = agents[0];
  let bestScore = -Infinity;
  for (const a of agents) {
    const s = scoreAgent(a, domain);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }

  return {
    id: best.id,
    name: best.name,
    systemPrompt: best.systemPrompt ?? null,
    modelId: best.modelId ?? null,
    temperature: best.temperature ?? 0.7,
    maxTokens: best.maxTokens ?? 2048,
    domain,
  };
}
