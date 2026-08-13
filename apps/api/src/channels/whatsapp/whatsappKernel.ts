/**
 * Bridge to the God-Node Orchestrator (KernelService).
 *
 * Every meaningful WhatsApp lifecycle transition is dispatched to the kernel
 * event bus so the channel is observable from the same place as every other
 * WINDELS subsystem. Uses the same lazy-import, never-throw convention as
 * mediaGen.service.ts so kernel unavailability can never break message flow.
 */
import { logger } from "../../observability/logger.js";

export async function emitKernelEvent(kind: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { KernelService } = await import("../../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "whatsapp-channel", kind, payload });
  } catch (e: any) {
    // The kernel is an observability sink here, not a hard dependency.
    logger.debug("kernel dispatch skipped", { kind, err: e?.message });
  }
}

/**
 * Asks the God-Node whether an action is permitted before the pipeline acts.
 * Fails OPEN on kernel unavailability (matching evaluatePolicy's MVP contract)
 * but fails CLOSED on an explicit deny.
 */
export async function evaluateKernelPolicy(input: {
  action: string;
  risk?: "low" | "medium" | "high";
  organizationId: string;
  approved?: boolean;
}): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { KernelService } = await import("../../kernel/kernel.service.js");
    const decision: any = await KernelService.evaluatePolicy({
      action: input.action,
      risk: input.risk ?? "low",
      approved: input.approved ?? false,
      context: { organizationId: input.organizationId, channel: "whatsapp" },
    } as any);
    if (decision && typeof decision.allowed === "boolean") {
      return { allowed: decision.allowed, reason: decision.reason };
    }
    return { allowed: true };
  } catch (e: any) {
    logger.debug("kernel policy evaluation unavailable", { action: input.action, err: e?.message });
    return { allowed: true };
  }
}
