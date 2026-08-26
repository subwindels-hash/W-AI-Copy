/**
 * Session 200 — Financial Policy enforcement tests (first dedicated suite).
 *
 * financialPolicy.service.ts is the single authoritative validation layer used
 * by payments, billing, invoices, wallet, trading, risk, valuation, P&L and AI
 * financial tools — and it shipped without a dedicated test. This suite locks
 * in the decision-safety gate and the provenance factories: the rules that
 * decide whether money-affecting operations may proceed.
 */
import { describe, it, expect } from "vitest";
import { FinancialPolicyService, FinancialPolicyError } from "./financialPolicy.service.js";

const ORG = "org-fin";

describe("assertDecisionSafe — the money gate", () => {
  it("permits a fresh REAL provenance", () => {
    const p = FinancialPolicyService.createRealProvenance("stripe", "stripe", "txn_1", ORG);
    expect(() => FinancialPolicyService.assertDecisionSafe(p)).not.toThrow();
  });

  it("blocks SIMULATED provenance for a live decision", () => {
    const p = FinancialPolicyService.createSimulatedProvenance("fixture", ORG);
    expect(() => FinancialPolicyService.assertDecisionSafe(p)).toThrow(FinancialPolicyError);
    try {
      FinancialPolicyService.assertDecisionSafe(p);
    } catch (e) {
      expect((e as FinancialPolicyError).classification).toBe("SIMULATED");
    }
  });

  it("allows SIMULATED only when the caller opts into a sandbox", () => {
    const p = FinancialPolicyService.createSimulatedProvenance("fixture", ORG);
    expect(() => FinancialPolicyService.assertDecisionSafe(p, { allowSandbox: true })).not.toThrow();
  });

  it("blocks UNAVAILABLE provenance (fail-closed)", () => {
    const p = FinancialPolicyService.createUnavailableProvenance("balance", "stripe", ORG, "provider down");
    expect(() => FinancialPolicyService.assertDecisionSafe(p)).toThrow(/UNAVAILABLE/i);
  });

  it("rejects a REAL record older than the freshness window", () => {
    const p = FinancialPolicyService.createRealProvenance("quote", "twelvedata", "q1", ORG);
    p.observedAt = new Date(Date.now() - 60_000).toISOString(); // 60s ago
    expect(() => FinancialPolicyService.assertDecisionSafe(p, { maxAgeMs: 5_000 })).toThrow(/EXPIRED/i);
  });

  it("accepts a REAL record within the freshness window", () => {
    const p = FinancialPolicyService.createRealProvenance("quote", "twelvedata", "q2", ORG);
    expect(() => FinancialPolicyService.assertDecisionSafe(p, { maxAgeMs: 60_000 })).not.toThrow();
  });
});

describe("provenance factories", () => {
  it("createRealProvenance records the source/provider/txn and REAL status with verifiedAt", () => {
    const p = FinancialPolicyService.createRealProvenance("payout", "stripe", "po_9", ORG, "EUR");
    expect(p).toMatchObject({ source: "payout", provider: "stripe", providerTransactionId: "po_9", organizationId: ORG, currency: "EUR", status: "REAL" });
    expect(p.verifiedAt).toBeTruthy();
    expect(p.observedAt).toBeTruthy();
  });

  it("createSimulatedProvenance is clearly labeled and carries no verification", () => {
    const p = FinancialPolicyService.createSimulatedProvenance("demo", ORG, "DEMO_FIXTURE");
    expect(p.status).toBe("SIMULATED");
    expect(p.provider).toBe("simulated_fixture");
    expect(p.providerTransactionId).toBeNull();
    expect(p.verifiedAt).toBeNull();
    expect(p.reason).toBe("DEMO_FIXTURE");
  });

  it("createUnavailableProvenance records the reason and is not verified", () => {
    const p = FinancialPolicyService.createUnavailableProvenance("balance", "plaid", ORG, "no credentials");
    expect(p.status).toBe("UNAVAILABLE");
    expect(p.reason).toBe("no credentials");
    expect(p.verifiedAt).toBeNull();
  });
});

describe("returnUnavailable — fail-closed response", () => {
  it("returns an unavailable financial result rather than a fabricated number", () => {
    const res = FinancialPolicyService.returnUnavailable("stripe", ORG, "provider unhealthy") as any;
    expect(res).toBeTruthy();
    // Whatever the shape, it must not present itself as a usable REAL value.
    expect(JSON.stringify(res)).toMatch(/UNAVAILABLE/i);
  });
});
