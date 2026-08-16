import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
const nativeComplete = vi.hoisted(() => vi.fn());
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("./nativeAi.service.js", () => ({ nativeComplete }));
vi.mock("../services/webhook.service.js", () => ({ dispatchEvent: vi.fn(async () => undefined) }));
const service = await import("./externalAgent.service.js");
const A = { organizationId: "org-a", userId: "user-a", apiKeyId: "key-a" };
const B = { organizationId: "org-b", userId: "user-b", apiKeyId: "key-b" };
function seed() {
  db.seed("Organization", [{ id: "org-a" }, { id: "org-b" }]);
  db.seed("User", [{ id: "user-a", email: "a@test", role: "USER" }, { id: "user-b", email: "b@test", role: "USER" }]);
  db.seed("ApiKey", [{ id: "key-a", organizationId: "org-a" }, { id: "key-b", organizationId: "org-b" }]);
  db.seed("Agent", [{ id: "agent-a", organizationId: "org-a", name: "Analyst", role: "Business Analyst", status: "IDLE", capabilities: ["analysis"], temperature: 0.5, maxTokens: 1000, createdAt: new Date() }]);
}
beforeEach(() => { db.reset(); seed(); nativeComplete.mockReset(); });

describe("external WINDELS agent runs", () => {
  it("persists an organization-scoped real agent run and deduplicates retries", async () => {
    nativeComplete.mockResolvedValue({ content: "Analysis complete", toolCalls: [], finishReason: "stop", usage: { tokensIn: 10, tokensOut: 5, costMicros: 4 }, internalModel: "real-chat", provider: "provider-a", durationMs: 10 });
    const input: any = { messages: [{ role: "user", content: "Analyze revenue" }] };
    const first = await service.executeExternalAgent(A, "agent-a", input, "idempotency-agent-run-1");
    const second = await service.executeExternalAgent(A, "agent-a", input, "idempotency-agent-run-1");
    expect(first).toMatchObject({ object: "agent.run", status: "completed", output: { content: "Analysis complete" } });
    expect(second.id).toBe(first.id);
    expect(db.tables.get("ExternalAgentRun")).toHaveLength(1);
    await expect(service.getExternalAgentRun(B, "agent-a", first.id)).rejects.toThrow(/not found/i);
  });

  it("records provider failures without simulating success", async () => {
    nativeComplete.mockRejectedValue(Object.assign(new Error("No real model"), { code: "AI_PROVIDER_CONFIGURATION_REQUIRED" }));
    const run = await service.executeExternalAgent(A, "agent-a", { messages: [{ role: "user", content: "Analyze" }] } as any, "idempotency-agent-run-fail");
    expect(run).toMatchObject({ status: "failed", error: { code: "AI_PROVIDER_CONFIGURATION_REQUIRED" } });
    expect(run.output).toEqual({});
  });

  it("cancels an in-flight run through its AbortSignal", async () => {
    nativeComplete.mockImplementation((_input: any, context: any) => new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "AI_ABORTED" })))));
    const pending = service.executeExternalAgent(A, "agent-a", { messages: [{ role: "user", content: "Long task" }] } as any, "idempotency-agent-run-cancel");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const row = db.tables.get("ExternalAgentRun")![0]!;
    await expect(service.cancelExternalAgentRun(A, "agent-a", row.id)).resolves.toMatchObject({ status: "cancelling" });
    await expect(pending).resolves.toMatchObject({ status: "cancelled" });
  });
});
