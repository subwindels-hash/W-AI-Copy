/**
 * The AI Commerce Agent (§24-§27).
 *
 * This is NOT a second agent platform. It is a specification for an agent
 * inside the EXISTING AI Workforce: the same `Agent` Prisma model, the same
 * agent runtime, the same ToolRegistry, the same God-Node kernel. The only new
 * things here are the persona, the capability list and the commerce tool
 * allow-list.
 */
import { prisma } from "../db/client.js";
import { logger } from "../observability/logger.js";
import { COMMERCE_TOOL_NAMES } from "./tools/commerceTools.js";

/** The specialized commerce capabilities described in §2 and §25. */
export const COMMERCE_AGENT_CAPABILITIES = [
  "commerce.understanding",
  "commerce.product_discovery",
  "commerce.recommendations",
  "commerce.comparison",
  "commerce.image_shopping",
  "commerce.voice_commerce",
  "commerce.cart_orchestration",
  "commerce.checkout_orchestration",
  "commerce.order_assistant",
  "commerce.order_tracking",
  "commerce.support",
] as const;
export type CommerceAgentCapability = (typeof COMMERCE_AGENT_CAPABILITIES)[number];

export const COMMERCE_AGENT_NAME = "Commerce Assistant";
export const COMMERCE_AGENT_ROLE = "AI Commerce Specialist";

/**
 * The agent's system prompt. Every truthfulness rule from §9-§17 is stated as
 * an instruction here AND enforced structurally by the tools, the guard and
 * the connector — the prompt is the last line of defence, not the only one.
 */
export const COMMERCE_AGENT_SYSTEM_PROMPT = `You are the WINDELS Commerce Assistant. You help users shop on the WMPC marketplace through conversation, voice and images.

HOW YOU GET FACTS
- Every product, price, stock level, vendor, specification, delivery estimate, warranty, return policy, cart, checkout, payment, order and tracking fact comes from a commerce tool call. WMPC is the single source of truth.
- You have no product knowledge of your own. If you have not called a tool, you do not know.
- If a tool returns a field as unavailable, say it is not published by the marketplace. Do not estimate, infer from similar products, or fill it in from general knowledge.

WHAT YOU MUST NEVER DO
- Never invent or guess a price, stock level, vendor, specification, delivery date, warranty or return policy.
- Never calculate, adjust, negotiate or override a price, tax, shipping cost, fee, discount or total. Quote the marketplace's figures exactly as returned.
- Never claim a payment succeeded, failed or is pending unless a tool told you so. Never ask for or accept card numbers, CVVs or any payment credential; payment always happens inside WMPC.
- Never act on another person's cart, order, checkout, payment or gift card. If a tool denies you, tell the user you are not authorized and stop; do not try another route.
- Never state that an image match is exact unless the tool labelled it exact. Use the tool's own wording: exact match, likely match, similar item, same category, or visually related.

HOW YOU ACT
- Confirm before anything irreversible. Emptying a cart and creating a checkout both require the user to say yes first; pass confirmed only after they have.
- Before adding to a cart, make sure the user has chosen a specific product, not just a category.
- When comparing, present the marketplace's facts side by side and let the user decide. Do not declare a winner or a "best" option.
- When something is unavailable or a tool fails, say so plainly and offer the next useful step. Never paper over an error with a plausible-sounding answer.
- Keep replies short and concrete. Lead with the answer, then the supporting facts.`;

export interface CommerceAgentSpec {
  name: string;
  role: string;
  department: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
  temperature: number;
  isBuiltIn: boolean;
}

export function commerceAgentSpec(): CommerceAgentSpec {
  return {
    name: COMMERCE_AGENT_NAME,
    role: COMMERCE_AGENT_ROLE,
    department: "Commerce",
    description:
      "Conversational shopping assistant backed by the WMPC marketplace. Searches products, compares options, manages the cart, starts checkout and tracks orders. All figures come from WMPC.",
    systemPrompt: COMMERCE_AGENT_SYSTEM_PROMPT,
    capabilities: [...COMMERCE_AGENT_CAPABILITIES],
    tools: [...COMMERCE_TOOL_NAMES],
    temperature: 0.2, // Low: this agent reports facts, it does not invent.
    isBuiltIn: true,
  };
}

/**
 * Ensure the organization has a commerce agent in the existing AI Workforce.
 * Idempotent; never duplicates. Returns the agent id, or null when the agent
 * could not be provisioned (which is not fatal — commerce tools remain
 * available to any agent).
 */
export async function ensureCommerceAgent(organizationId: string): Promise<string | null> {
  if (!organizationId) return null;
  const spec = commerceAgentSpec();
  try {
    const existing = await prisma.agent.findFirst({
      where: { organizationId, name: spec.name },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.agent.create({
      data: {
        organizationId,
        name: spec.name,
        role: spec.role,
        department: spec.department,
        description: spec.description,
        systemPrompt: spec.systemPrompt,
        capabilities: spec.capabilities,
        temperature: spec.temperature,
        isBuiltIn: spec.isBuiltIn,
        emoji: "🛍️",
        color: "amber",
      },
      select: { id: true },
    });
    logger.info("[aiCommerce] provisioned commerce agent", { organizationId, agentId: created.id });
    return created.id;
  } catch (err) {
    logger.warn("[aiCommerce] could not provision commerce agent", {
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * God-Node (kernel) registration (§26). Announces the commerce capability to
 * the existing kernel so it shows up in the Command Center alongside every
 * other subsystem. Never throws.
 */
export async function registerCommerceWithKernel(): Promise<boolean> {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({
      kind: "capability.registered",
      source: "ai-commerce",
      payload: {
        capability: "ai-commerce",
        capabilities: COMMERCE_AGENT_CAPABILITIES,
        tools: COMMERCE_TOOL_NAMES,
        backend: "wmpc",
        authoritative: false,
      },
    } as never);
    return true;
  } catch (err) {
    logger.debug("[aiCommerce] kernel registration skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
