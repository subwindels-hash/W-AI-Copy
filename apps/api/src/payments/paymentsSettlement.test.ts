/**
 * Session 201 — payment settlement transition guards.
 *
 * ── CI-ONLY (Prisma-gated) ──────────────────────────────────────────────────
 * This suite imports payments.service.ts, whose dependency graph reaches the
 * generated Prisma client (`@prisma/client` → `.prisma/client`). In CI that
 * client exists (the build runs `prisma generate`); in a fresh sandbox without
 * it, the import throws "Cannot find module '.prisma/client/*'". To avoid a
 * spurious red on such machines the suite probes for the client once and
 * `describe.skip`s itself when it is absent — exactly like the repo's other
 * live/integration suites self-skip. Under CI it runs fully.
 *
 * What it locks in (the state-transition guards in applyVerifiedResult that
 * payments.test.ts does not cover — the anti-double-settlement money path):
 *   - re-applying the SAME verified completion is idempotent (no dup invoice)
 *   - a completed payment cannot be re-completed with a DIFFERENT provider txn
 *   - completed → refunded is allowed; refund of a non-completed txn is rejected
 *   - a provider transaction identifier is required
 *   - a transaction from another org is not settleable (404)
 */
import { createRequire } from "node:module";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";

/** True when the GENERATED Prisma client is importable (i.e. CI ran `prisma generate`). */
function prismaClientAvailable(): boolean {
  try {
    // The service imports `@prisma/client/wasm`, which at runtime loads the
    // generated `.prisma/client`. Probe the generated client specifically —
    // `@prisma/client` (the package) resolves even when nothing was generated.
    createRequire(import.meta.url).resolve(".prisma/client");
    return true;
  } catch {
    return false;
  }
}

const RUN = prismaClientAvailable();

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();
  return {
    __resetPaymentStore() { store.clear(); zsets.clear(); },
    redisCmd: {
      async set(k: string, v: string, ...args: any[]) { if (args.includes("NX") && store.has(k)) return null; store.set(k, v); return "OK"; },
      async get(k: string) { return store.get(k) ?? null; },
      async del(...keys: string[]) { for (const key of keys) store.delete(key); return keys.length; },
      async zadd(k: string, score: string, member: string) {
        let list = zsets.get(k); if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex((i) => i.member === member); if (idx >= 0) list.splice(idx, 1);
        list.push({ score: Number(score), member }); list.sort((a, b) => a.score - b.score); return 1;
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) { const l = zsets.get(k) ?? []; return l.slice(start, stop === -1 ? l.length : stop + 1).map((i) => i.member); },
      async zrem(k: string, ...members: string[]) { const l = zsets.get(k); if (!l) return 0; for (const m of members) { const i = l.findIndex((x) => x.member === m); if (i >= 0) l.splice(i, 1); } return members.length; },
    },
  };
});
vi.mock("../services/billing.service.js", () => ({ markInvoicePaidForOrganization: vi.fn().mockResolvedValue({ id: "inv-paid", status: "PAID" }) }));

const originalEnv = { ...process.env };
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe.skipIf(!RUN)("applyVerifiedResult — settlement transition guards (CI: Prisma required)", () => {
  let PaymentGatewaysService: typeof import("./payments.service.js").PaymentGatewaysService;
  let billing: typeof import("../services/billing.service.js");

  beforeEach(async () => {
    vi.clearAllMocks(); vi.unstubAllGlobals();
    delete process.env.PAYSTACK_SECRET_KEY;
    process.env.NODE_ENV = "test";
    process.env.WINDELS_PUBLIC_API_ORIGIN = "https://payments.example.test";
    ({ PaymentGatewaysService } = await import("./payments.service.js"));
    billing = await import("../services/billing.service.js");
    (await import("../db/redis.js") as any).__resetPaymentStore();
  });
  afterAll(() => { process.env = originalEnv; });

  async function paystackCheckout(orgId: string, amount = 100, currency = "NGN") {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return jsonResponse(200, { status: true, data: { authorization_url: "https://checkout.paystack.com/live", access_code: "access", reference: request.reference } });
    }));
    return PaymentGatewaysService.initiateCheckout(orgId, { provider: "paystack", amount, currency, customerEmail: "buyer@example.test", invoiceId: "inv-1" });
  }

  const completed = (reference: string, providerTransactionId: string) => ({
    verified: true as const, provider: "paystack" as const, reference, status: "completed" as const,
    amount: 100, currency: "NGN", providerTransactionId, verificationSource: "provider_api" as const,
  });

  it("is idempotent when the SAME verified completion is applied twice", async () => {
    const tx = await paystackCheckout("org-idem");
    const first = await PaymentGatewaysService.applyVerifiedResult("org-idem", tx.reference, completed(tx.reference, "ptxn-1"));
    expect(first.status).toBe("completed");
    expect(billing.markInvoicePaidForOrganization).toHaveBeenCalledTimes(1);

    const second = await PaymentGatewaysService.applyVerifiedResult("org-idem", tx.reference, completed(tx.reference, "ptxn-1"));
    expect(second.status).toBe("completed");
    expect(billing.markInvoicePaidForOrganization).toHaveBeenCalledTimes(1); // no second invoice mark
  });

  it("refuses to re-complete a completed payment with a DIFFERENT provider transaction", async () => {
    const tx = await paystackCheckout("org-diff");
    await PaymentGatewaysService.applyVerifiedResult("org-diff", tx.reference, completed(tx.reference, "ptxn-1"));
    await expect(PaymentGatewaysService.applyVerifiedResult("org-diff", tx.reference, completed(tx.reference, "ptxn-2")))
      .rejects.toMatchObject({ status: 409 });
  });

  it("allows a completed payment to transition to refunded", async () => {
    const tx = await paystackCheckout("org-refund");
    await PaymentGatewaysService.applyVerifiedResult("org-refund", tx.reference, completed(tx.reference, "ptxn-1"));
    const refunded = await PaymentGatewaysService.applyVerifiedResult("org-refund", tx.reference, { ...completed(tx.reference, "ptxn-1"), status: "refunded" });
    expect(refunded.status).toBe("refunded");
  });

  it("refuses to refund a payment that was never completed", async () => {
    const tx = await paystackCheckout("org-badrefund");
    await expect(PaymentGatewaysService.applyVerifiedResult("org-badrefund", tx.reference, { ...completed(tx.reference, "ptxn-1"), status: "refunded" }))
      .rejects.toMatchObject({ status: 409 });
    expect((await PaymentGatewaysService.getTransaction("org-badrefund", tx.id))?.status).toBe("pending");
  });

  it("requires a provider transaction identifier to settle", async () => {
    const tx = await paystackCheckout("org-noptxn");
    await expect(PaymentGatewaysService.applyVerifiedResult("org-noptxn", tx.reference, { ...completed(tx.reference, "ptxn-1"), providerTransactionId: "" }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("does not settle a transaction that belongs to another organization", async () => {
    const tx = await paystackCheckout("org-owner");
    await expect(PaymentGatewaysService.applyVerifiedResult("org-intruder", tx.reference, completed(tx.reference, "ptxn-1")))
      .rejects.toMatchObject({ status: 404 });
  });
});
