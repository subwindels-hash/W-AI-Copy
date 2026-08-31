/**
 * Autonomous client — request contract for the PHP/cPanel build.
 *
 * `api` is mocked, so what is asserted is the path, verb and body each call
 * sends. The PHP routes are matched on URI first and only then on the HTTP
 * method, so a wrong verb is not a 405 from the router — it is whatever handler
 * the URI happens to name. That makes these six signatures worth pinning:
 *
 *   GET    /autonomous/dashboard/rollup
 *   GET    /autonomous/decisions
 *   POST   /autonomous/decisions
 *   GET    /autonomous/decisions/:id
 *   POST   /autonomous/decisions/:id/resolve
 *   DELETE /autonomous/decisions/:id
 *
 * The list query is validated server-side (status must be a known status,
 * limit between 1 and 100), so the client must not send empty strings that
 * would fail that check.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { autApi } from "./autonomous";

beforeEach(() => {
  apiFn.mockReset();
  apiFn.mockResolvedValue({});
});

describe("autonomous read endpoints", () => {
  it("requests the approval-register rollup", async () => {
    await autApi.dashboard();
    expect(apiFn).toHaveBeenCalledWith("/autonomous/dashboard/rollup");
  });

  it("requests the register with no query by default", async () => {
    await autApi.decisions();
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions", { params: undefined });
  });

  it("passes filters through as query params", async () => {
    await autApi.decisions({ status: "awaiting_human", department: "Finance", limit: 100 });
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions", {
      params: { status: "awaiting_human", department: "Finance", limit: 100 },
    });
  });

  it("requests one decision by id", async () => {
    await autApi.getDecision("decision-42");
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions/decision-42");
  });
});

describe("autonomous write endpoints", () => {
  it("posts a proposal to the collection", async () => {
    const input = {
      title: "Consolidate the Abuja logistics hub",
      department: "Finance",
      recommendation: "Move to a single hub.",
      confidence: 0.82,
      riskLevel: "med" as const,
      estimatedImpactUsd: 125000,
      reasoning: "Three contracts expire this quarter.",
    };
    await autApi.propose(input);
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions", { method: "POST", json: input });
  });

  it("posts a resolution to the resolve sub-route", async () => {
    await autApi.resolve("decision-42", { approved: true, note: "Board approved." });
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions/decision-42/resolve", {
      method: "POST",
      json: { approved: true, note: "Board approved." },
    });
  });

  it("posts a bare resolution when there is no note", async () => {
    await autApi.resolve("decision-42", { approved: false });
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions/decision-42/resolve", {
      method: "POST",
      json: { approved: false },
    });
  });

  it("deletes a pending proposal by id", async () => {
    await autApi.deleteDecision("decision-42");
    expect(apiFn).toHaveBeenCalledWith("/autonomous/decisions/decision-42", { method: "DELETE" });
  });
});
