/**
 * Web client coverage for the completed opex subsystems.
 *
 * Verifies the governance-gate, regulations, playbooks, explanations and
 * safety-benchmark client methods issue the correct HTTP verb, path and body.
 * The api module is mocked, so no network/DOM is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn(async () => ({}));
vi.mock("./api", () => ({ api: (...args: unknown[]) => apiMock(...args) }));

import {
  opexGovernanceApi,
  opexRegulationsApi,
  opexPlaybooksApi,
  opexExplanationsApi,
  opexSafetyBenchmarksApi,
} from "./opex";

function lastCall() {
  return apiMock.mock.calls[apiMock.mock.calls.length - 1]!;
}

beforeEach(() => apiMock.mockClear());

describe("opexGovernanceApi", () => {
  it("lists and creates gates", async () => {
    await opexGovernanceApi.listGates();
    expect(lastCall()).toEqual(["/opex/governance/gates"]);
    await opexGovernanceApi.createGate({ name: "Prod", level: "l3_director" } as any);
    expect(lastCall()[0]).toBe("/opex/governance/gates");
    expect(lastCall()[1]).toMatchObject({ method: "POST", json: { name: "Prod", level: "l3_director" } });
  });

  it("opens and decides requests with encoded ids", async () => {
    await opexGovernanceApi.openRequest("g 1", { subject: "ship" } as any);
    expect(lastCall()[0]).toBe("/opex/governance/gates/g%201/requests");
    await opexGovernanceApi.decideRequest("g1", "r1", { decision: "approved" } as any);
    expect(lastCall()[0]).toBe("/opex/governance/gates/g1/requests/r1/decision");
    expect(lastCall()[1]).toMatchObject({ method: "POST", json: { decision: "approved" } });
  });
});

describe("opexRegulationsApi", () => {
  it("supports list/create/update/remove", async () => {
    await opexRegulationsApi.list();
    expect(lastCall()).toEqual(["/opex/regulations"]);
    await opexRegulationsApi.create({ name: "GDPR", jurisdiction: "EU", category: "privacy" } as any);
    expect(lastCall()[1]).toMatchObject({ method: "POST" });
    await opexRegulationsApi.update("reg1", { status: "enforcing" } as any);
    expect(lastCall()[0]).toBe("/opex/regulations/reg1");
    expect(lastCall()[1]).toMatchObject({ method: "PATCH" });
    await opexRegulationsApi.remove("reg1");
    expect(lastCall()[1]).toMatchObject({ method: "DELETE" });
  });
});

describe("opexPlaybooksApi", () => {
  it("supports create/update/simulate/remove", async () => {
    await opexPlaybooksApi.create({ name: "IR", category: "cyber" } as any);
    expect(lastCall()[0]).toBe("/opex/playbooks");
    await opexPlaybooksApi.simulate("pb1");
    expect(lastCall()[0]).toBe("/opex/playbooks/pb1/simulate");
    expect(lastCall()[1]).toMatchObject({ method: "POST" });
    await opexPlaybooksApi.remove("pb1");
    expect(lastCall()[1]).toMatchObject({ method: "DELETE" });
  });
});

describe("opexExplanationsApi", () => {
  it("records and challenges explanations", async () => {
    await opexExplanationsApi.record({ decisionId: "d1", decisionSummary: "ok", confidence: 0.9 } as any);
    expect(lastCall()[0]).toBe("/opex/explanations");
    await opexExplanationsApi.challenge("x1", { outcome: "upheld" } as any);
    expect(lastCall()[0]).toBe("/opex/explanations/x1/challenge");
    expect(lastCall()[1]).toMatchObject({ method: "POST", json: { outcome: "upheld" } });
  });
});

describe("opexSafetyBenchmarksApi", () => {
  it("reads the rollup and records a result", async () => {
    await opexSafetyBenchmarksApi.rollup();
    expect(lastCall()).toEqual(["/opex/safety-benchmarks"]);
    await opexSafetyBenchmarksApi.record({ category: "jailbreak", score: 90, passThreshold: 80 } as any);
    expect(lastCall()[1]).toMatchObject({ method: "POST", json: { category: "jailbreak", score: 90 } });
  });
});
