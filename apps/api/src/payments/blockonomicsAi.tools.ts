/** Read-only AI tools for organization-scoped Blockonomics assistance. */
import { prisma } from "../db/client.js";
import { ToolRegistry, type Tool, type ToolContext, type ToolResult } from "../services/tools/toolRegistry.js";
import { BlockonomicsPaymentService } from "./blockonomicsPayment.service.js";

export const BLOCKONOMICS_AI_TOOL_NAMES = [
  "get_blockonomics_payment_status",
  "get_blockonomics_payment_instructions",
] as const;

function exactCryptoAmount(asset: string | undefined, units: string | undefined): string | null {
  const decimals = asset === "BTC" ? 8 : asset === "USDT" ? 6 : null;
  if (decimals === null || !units || !/^\d+$/.test(units)) return null;
  const value = BigInt(units);
  const divisor = 10n ** BigInt(decimals);
  return `${value / divisor}.${(value % divisor).toString().padStart(decimals, "0")}`;
}

function contextError(context: ToolContext): ToolResult | null {
  if (!context.userId || !context.organizationId) {
    return { success: false, error: "Authenticated user and organization context are required" };
  }
  return null;
}

async function paymentFor(params: Record<string, any>, context: ToolContext, action: string) {
  const paymentId = String(params.payment_id ?? "").trim();
  if (!paymentId) return { error: "payment_id is required" } as const;
  const payment = await BlockonomicsPaymentService.get(context.organizationId!, paymentId);
  if (!payment) return { error: "Blockonomics payment was not found in this organization" } as const;
  await prisma.auditLog.create({
    data: {
      organizationId: context.organizationId!,
      userId: context.userId!,
      action,
      resourceType: "PaymentRecord",
      resourceId: payment.id,
      metadata: { provider: "blockonomics", agentId: context.agentId ?? null, conversationId: context.conversationId ?? null },
    },
  });
  return { payment } as const;
}

const statusTool: Tool = {
  definition: {
    name: BLOCKONOMICS_AI_TOOL_NAMES[0],
    description: "Read the backend-verified status of one Blockonomics payment in the caller's organization. This tool cannot create, confirm, credit, debit, refund, cancel, reconcile, or settle a payment.",
    category: "billing",
    hasSideEffects: false,
    parameters: { payment_id: { type: "string", description: "WINDELS Blockonomics payment ID" } },
    required: ["payment_id"],
    timeoutMs: 10_000,
  },
  async execute(params, context) {
    const invalid = contextError(context);
    if (invalid) return invalid;
    const result = await paymentFor(params, context, "payment.blockonomics.ai_status_read");
    if ("error" in result) return { success: false, error: result.error };
    const payment = result.payment;
    return {
      success: true,
      data: {
        paymentId: payment.id,
        reference: payment.reference,
        status: payment.status,
        providerStatus: payment.providerStatus ?? null,
        confirmations: payment.confirmations ?? 0,
        requiredConfirmations: payment.requiredConfirmations ?? 2,
        reconciliationStatus: payment.reconciliationStatus ?? "pending",
        amount: payment.amount,
        currency: payment.currency,
        cryptoCurrency: payment.cryptoCurrency ?? null,
        cryptoNetwork: payment.cryptoNetwork ?? null,
        invoiceId: payment.invoiceId ?? null,
        completedAt: payment.completedAt ?? null,
        note: "Report this backend status exactly. Only status completed means backend verification and billing settlement finished.",
      },
      metadata: { readOnly: true, source: "windels_backend" },
    };
  },
};

const instructionsTool: Tool = {
  definition: {
    name: BLOCKONOMICS_AI_TOOL_NAMES[1],
    description: "Read backend-generated BTC or USDT ERC-20 payment instructions for one Blockonomics payment in the caller's organization. This tool cannot submit a transaction hash or mutate financial state.",
    category: "billing",
    hasSideEffects: false,
    parameters: { payment_id: { type: "string", description: "WINDELS Blockonomics payment ID" } },
    required: ["payment_id"],
    timeoutMs: 10_000,
  },
  async execute(params, context) {
    const invalid = contextError(context);
    if (invalid) return invalid;
    const result = await paymentFor(params, context, "payment.blockonomics.ai_instructions_read");
    if ("error" in result) return { success: false, error: result.error };
    const payment = result.payment;
    const instruction = typeof payment.metadata?.instructions === "string" ? payment.metadata.instructions : null;
    return {
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        cryptoCurrency: payment.cryptoCurrency ?? null,
        cryptoNetwork: payment.cryptoNetwork ?? null,
        cryptoAddress: payment.cryptoAddress ?? null,
        exactCryptoAmount: exactCryptoAmount(payment.cryptoCurrency, payment.expectedCryptoUnits),
        expectedCryptoUnits: payment.expectedCryptoUnits ?? null,
        expiresAt: payment.expiresAt ?? null,
        instruction,
        note: "Use only these backend-generated instructions. Never claim that sending, submitting, or displaying a transaction completes payment.",
      },
      metadata: { readOnly: true, source: "windels_backend" },
    };
  },
};

export function registerBlockonomicsAiTools() {
  ToolRegistry.register(statusTool);
  ToolRegistry.register(instructionsTool);
}

registerBlockonomicsAiTools();
