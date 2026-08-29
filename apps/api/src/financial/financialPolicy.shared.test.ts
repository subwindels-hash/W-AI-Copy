/**
 * Session 202 — pure financial-policy primitives from @windels/shared.
 *
 * The API service wrapper (financialPolicy.service.ts) is already covered, but
 * it delegates to two pure functions in @windels/shared/financialPolicy that
 * ship with NO dedicated tests of their own — and @windels/shared has no test
 * harness at all. These primitives are the money gate every financial surface
 * relies on, so their full branch behaviour is exercised here directly (the
 * shared build is a prerequisite of the API test run, so importing the compiled
 * module is safe):
 *   - isFinancialDataDecisionSafe: REAL/SIMULATED/UNAVAILABLE/UNVERIFIED/STALE,
 *     the sandbox escape hatch, the maxAgeMs freshness window, and the
 *     unknown-status fail-closed fallback
 *   - createUnavailableFinancialResponse: fail-closed shape with a zeroed value
 */
import { describe, it, expect } from "vitest";
import {
  isFinancialDataDecisionSafe,
  createUnavailableFinancialResponse,
  type FinancialProvenance,
} from "@windels/shared/financialPolicy";

const ORG = "org-shared";

function prov(overrides: Partial<FinancialProvenance>): FinancialProvenance {
  return {
    source: "test",
    provider: "test-provider",
    providerTransactionId: null,
    organizationId: ORG,
    observedAt: new Date().toISOString(),
    verifiedAt: null,
    currency: "USD",
    status: "REAL",
    ...overrides,
  };
}

describe("isFinancialDataDecisionSafe — status gating", () => {
  it("permits a fresh REAL record", () => {
    expect(isFinancialDataDecisionSafe(prov({ status: "REAL" }))).toEqual({ safe: true });
  });

  it("blocks SIMULATED with a labelled reason", () => {
    const r = isFinancialDataDecisionSafe(prov({ status: "SIMULATED" }));
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/FINANCIAL_DATA_SIMULATED/);
  });

  it("permits SIMULATED only when allowSandbox is set", () => {
    expect(isFinancialDataDecisionSafe(prov({ status: "SIMULATED" }), { allowSandbox: true })).toEqual({ safe: true });
  });

  it("does not let allowSandbox rescue a non-SIMULATED bad status", () => {
    // allowSandbox only whitelists SIMULATED; UNAVAILABLE must still fail closed.
    const r = isFinancialDataDecisionSafe(prov({ status: "UNAVAILABLE" }), { allowSandbox: true });
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/UNAVAILABLE/);
  });

  it("blocks UNAVAILABLE (provider not connected)", () => {
    expect(isFinancialDataDecisionSafe(prov({ status: "UNAVAILABLE" })).reason).toMatch(/UNAVAILABLE/);
  });

  it("blocks UNVERIFIED (not reconciled against ledger)", () => {
    const r = isFinancialDataDecisionSafe(prov({ status: "UNVERIFIED" }));
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/UNVERIFIED/);
  });

  it("blocks STALE (exceeds freshness threshold)", () => {
    const r = isFinancialDataDecisionSafe(prov({ status: "STALE" }));
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/STALE/);
  });

  it("fails closed on an unrecognized status", () => {
    const r = isFinancialDataDecisionSafe(prov({ status: "WAT" as unknown as FinancialProvenance["status"] }));
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/FINANCIAL_DATA_UNSAFE/);
  });
});

describe("isFinancialDataDecisionSafe — freshness window", () => {
  it("rejects a REAL record older than maxAgeMs", () => {
    const p = prov({ status: "REAL", observedAt: new Date(Date.now() - 60_000).toISOString() });
    const r = isFinancialDataDecisionSafe(p, { maxAgeMs: 5_000 });
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/FINANCIAL_DATA_EXPIRED/);
  });

  it("accepts a REAL record within maxAgeMs", () => {
    const p = prov({ status: "REAL", observedAt: new Date(Date.now() - 1_000).toISOString() });
    expect(isFinancialDataDecisionSafe(p, { maxAgeMs: 60_000 })).toEqual({ safe: true });
  });

  it("ignores freshness when maxAgeMs is not supplied", () => {
    const p = prov({ status: "REAL", observedAt: new Date(Date.now() - 999_999).toISOString() });
    expect(isFinancialDataDecisionSafe(p)).toEqual({ safe: true });
  });
});

describe("createUnavailableFinancialResponse", () => {
  it("returns a fail-closed UNAVAILABLE result with a zeroed value", () => {
    const res = createUnavailableFinancialResponse("stripe", ORG, "no credentials", "EUR");
    expect(res.status).toBe("UNAVAILABLE");
    expect(res.errorCode).toBe("REAL_PROVIDER_NOT_CONFIGURED");
    expect(res.reason).toBe("no credentials");
    expect(res.data?.value).toBe(0);
    expect(res.data?.provenance).toMatchObject({
      provider: "stripe",
      organizationId: ORG,
      currency: "EUR",
      status: "UNAVAILABLE",
      providerTransactionId: null,
      verifiedAt: null,
    });
  });

  it("defaults the currency to USD", () => {
    const res = createUnavailableFinancialResponse("plaid", ORG, "down");
    expect(res.data?.provenance.currency).toBe("USD");
  });

  it("produces a result that is itself decision-unsafe", () => {
    const res = createUnavailableFinancialResponse("stripe", ORG, "down");
    expect(isFinancialDataDecisionSafe(res.data!.provenance).safe).toBe(false);
  });
});
