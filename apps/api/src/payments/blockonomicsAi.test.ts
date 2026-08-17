import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ audits: [] as any[], getCalls: [] as any[] }));
const payment = {
  id: "pay-ai-1", organizationId: "org-a", provider: "blockonomics", reference: "BLK_AI",
  amount: 25, currency: "USD", status: "confirming", cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20",
  cryptoAddress: `0x${"a".repeat(40)}`, cryptoAmount: 25, expectedCryptoUnits: "25000000",
  confirmations: 1, requiredConfirmations: 2, reconciliationStatus: "pending", invoiceId: "inv-a",
  providerStatus: "1", expiresAt: "2026-08-17T13:00:00.000Z", completedAt: null,
  createdAt: "2026-08-17T12:00:00.000Z",
  metadata: { instructions: "Send USDT on Ethereum ERC-20 only." },
} as any;

vi.mock("./blockonomicsPayment.service.js", () => ({
  BlockonomicsPaymentService: {
    get: vi.fn(async (organizationId: string, paymentId: string) => {
      state.getCalls.push({ organizationId, paymentId });
      return organizationId === "org-a" && paymentId === payment.id ? payment : null;
    }),
  },
}));
vi.mock("../db/client.js", () => ({
  prisma: { auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return { id: `audit-${state.audits.length}`, ...data }; }) } },
}));

const { ToolRegistry, executeTool } = await import("../services/tools/toolRegistry.js");
const { BLOCKONOMICS_AI_TOOL_NAMES } = await import("./blockonomicsAi.tools.js");

beforeEach(() => { state.audits.length = 0; state.getCalls.length = 0; });

const context = { userId: "user-a", organizationId: "org-a", agentId: "agent-a", conversationId: "conversation-a" };

describe("Blockonomics AI read-only tools", () => {
  it("registers only status and instruction reads with no financial side effects", () => {
    expect(BLOCKONOMICS_AI_TOOL_NAMES).toEqual(["get_blockonomics_payment_status", "get_blockonomics_payment_instructions"]);
    for (const name of BLOCKONOMICS_AI_TOOL_NAMES) {
      const definition = ToolRegistry.get(name)?.definition;
      expect(definition).toMatchObject({ category: "billing", hasSideEffects: false });
      expect(definition?.description).toMatch(/cannot/i);
    }
    expect(BLOCKONOMICS_AI_TOOL_NAMES.some((name) => /credit|debit|refund|confirm|settle|reconcile/.test(name))).toBe(false);
  });

  it("reports backend status exactly and distinguishes confirmation from completion", async () => {
    const result = await executeTool("get_blockonomics_payment_status", { payment_id: payment.id }, context);
    expect(result).toMatchObject({
      success: true,
      data: { status: "confirming", confirmations: 1, requiredConfirmations: 2, completedAt: null },
      metadata: { readOnly: true, source: "windels_backend" },
    });
    expect(result.data.note).toContain("Only status completed");
    expect(state.audits).toContainEqual(expect.objectContaining({ action: "payment.blockonomics.ai_status_read", userId: "user-a", organizationId: "org-a" }));
  });

  it("returns only backend-generated instructions and ignores mutation-like extra arguments", async () => {
    const result = await executeTool("get_blockonomics_payment_instructions", {
      payment_id: payment.id,
      action: "refund",
      credit_amount: 999999,
      mark_completed: true,
    }, context);
    expect(result).toMatchObject({
      success: true,
      data: {
        status: "confirming",
        cryptoCurrency: "USDT",
        cryptoNetwork: "eth_erc20",
        exactCryptoAmount: "25.000000",
        expectedCryptoUnits: "25000000",
        instruction: "Send USDT on Ethereum ERC-20 only.",
      },
    });
    expect(state.getCalls).toEqual([{ organizationId: "org-a", paymentId: payment.id }]);
    expect(payment.status).toBe("confirming");
  });

  it("fails closed without organization context or for another tenant", async () => {
    await expect(executeTool("get_blockonomics_payment_status", { payment_id: payment.id }, { userId: "user-a" })).resolves.toMatchObject({ success: false, error: expect.stringContaining("organization") });
    await expect(executeTool("get_blockonomics_payment_status", { payment_id: payment.id }, { ...context, organizationId: "org-b" })).resolves.toMatchObject({ success: false, error: expect.stringContaining("not found") });
    expect(state.audits).toEqual([]);
  });
});
