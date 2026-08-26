/**
 * Web client coverage for the completed cognitive subsystems.
 *
 * Verifies the innovation-pipeline, self-evolution and federation client methods
 * issue the correct HTTP verb, path and body. The api module is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn(async () => ({}));
vi.mock("./api", () => ({ api: (...args: unknown[]) => apiMock(...args) }));

import { cogApi } from "./cognitive";

function lastCall() {
  return apiMock.mock.calls[apiMock.mock.calls.length - 1]!;
}

beforeEach(() => apiMock.mockClear());

describe("innovation pipeline client", () => {
  it("lists, creates, sets status, and deletes", async () => {
    await cogApi.innovations();
    expect(lastCall()).toEqual(["/cognitive/innovations"]);
    await cogApi.createInnovation({ title: "Edge", category: "infra", projectedValueUsd: 1000 } as any);
    expect(lastCall()[1]).toMatchObject({ method: "POST" });
    await cogApi.setInnovationStatus("i1", "approved");
    expect(lastCall()[0]).toBe("/cognitive/innovations/i1/status");
    expect(lastCall()[1]).toMatchObject({ method: "POST", json: { status: "approved" } });
    await cogApi.deleteInnovation("i1");
    expect(lastCall()[1]).toMatchObject({ method: "DELETE" });
  });
});

describe("self-evolution client", () => {
  it("lists components, upserts a component, and records an auto-fix", async () => {
    await cogApi.selfEvolution();
    expect(lastCall()).toEqual(["/cognitive/self-evolution"]);
    await cogApi.upsertSelfEvolutionComponent({ component: "memory", health: 0.8 } as any);
    expect(lastCall()[0]).toBe("/cognitive/self-evolution/components");
    expect(lastCall()[1]).toMatchObject({ method: "PUT" });
    await cogApi.recordAutoFix({ component: "memory", summary: "patched" } as any);
    expect(lastCall()[0]).toBe("/cognitive/self-evolution/auto-fix");
    expect(lastCall()[1]).toMatchObject({ method: "POST" });
  });
});

describe("federation client", () => {
  it("lists, creates, updates, and deletes partners", async () => {
    await cogApi.federation();
    expect(lastCall()).toEqual(["/cognitive/federation"]);
    await cogApi.createFederationPartner({ name: "Acme", type: "enterprise" } as any);
    expect(lastCall()[1]).toMatchObject({ method: "POST" });
    await cogApi.updateFederationPartner("p1", { status: "active" } as any);
    expect(lastCall()[0]).toBe("/cognitive/federation/p1");
    expect(lastCall()[1]).toMatchObject({ method: "PATCH", json: { status: "active" } });
    await cogApi.deleteFederationPartner("p1");
    expect(lastCall()[1]).toMatchObject({ method: "DELETE" });
  });
});
