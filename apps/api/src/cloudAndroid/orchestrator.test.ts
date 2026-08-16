import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
const health = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("./provider.js", () => ({ cloudAndroidProvider: { id: "test-provider", health, execute } }));
vi.mock("../audit/audit.service.js", () => ({ auditService: { log: vi.fn(async () => undefined) } }));
const { CloudAndroidOrchestrator } = await import("./orchestrator.service.js");
const human = { organizationId: "org-a", userId: "user-a" };
const agentActor = { organizationId: "org-a", userId: "user-a", agentId: "agent-a" };
const config: any = { name: "Support Android", androidVersion: "15", region: "ng-central-1", cpuCores: 2, ramMb: 4096, storageGb: 32, locale: "en-US", timezone: "Africa/Lagos", networkPolicy: { mode: "restricted", internetAccess: false, domainAllowlist: ["support.example.com"], domainBlocklist: [], bandwidthMbps: 20 }, securityProfile: "business", installedApplications: [] };
const observation = (label: string) => ({ capturedAt: new Date().toISOString(), elements: [{ id: "submit", role: "button", text: label, enabled: true, clickable: true, editable: false }], accessibilityTree: { root: label }, app: { packageName: "com.example.support", activity: "Main" }, window: { title: label, focusedElementId: null }, deviceState: { responsive: true } });
function seed() { db.seed("Organization", [{ id: "org-a" }, { id: "org-b" }]); db.seed("User", [{ id: "user-a", email: "a@test", role: "ADMIN" }, { id: "user-b", email: "b@test", role: "ADMIN" }]); db.seed("Agent", [{ id: "agent-a", organizationId: "org-a", name: "Support Agent", status: "IDLE" }]); }
beforeEach(() => { db.reset(); seed(); health.mockReset().mockResolvedValue({ healthy: true, capabilities: ["device.provision", "screen.capture", "ui.semantic"], regions: ["ng-central-1"], androidVersions: ["15"], latencyMs: 5 }); execute.mockReset(); });

describe("Cloud Android orchestrator", () => {
  it("does not create a fake device when no provider is healthy", async () => {
    health.mockResolvedValueOnce({ healthy: false, capabilities: [], regions: [], androidVersions: [], latencyMs: 0, error: "not configured" });
    await expect(CloudAndroidOrchestrator.createDevice(human, config)).rejects.toThrow(/provider unavailable/i);
    expect(db.tables.get("CloudAndroidDevice") ?? []).toHaveLength(0);
  });

  it("provisions and exposes only the WINDELS device identity, not provider references", async () => {
    execute.mockResolvedValueOnce({ ok: true, requestId: "r", operationId: "op-provision", status: "STOPPED", providerDeviceRef: "secret-provider-ref", metrics: { cpuPct: 0 }, evidence: { securityVerified: true } });
    const device = await CloudAndroidOrchestrator.createDevice(human, config);
    expect(device).toMatchObject({ name: "Support Android", lifecycle: "STOPPED", securityStatus: "VERIFIED" });
    expect(device).not.toHaveProperty("providerDeviceRef");
    expect(db.tables.get("CloudAndroidDevice")![0].providerDeviceRef).toBe("secret-provider-ref");
  });

  it("enforces one writer lock across human and agent sessions", async () => {
    execute.mockResolvedValueOnce({ ok: true, requestId: "r", operationId: "op-provision", status: "RUNNING", providerDeviceRef: "ref", evidence: { securityVerified: true } });
    const device = await CloudAndroidOrchestrator.createDevice(human, config);
    await CloudAndroidOrchestrator.assignAgent(human, device.id, { agentId: "agent-a", permissions: ["device:view", "screen:view", "ui:tap"], sensitiveActions: [], domainAllowlist: [], expiresAt: undefined });
    const session = await CloudAndroidOrchestrator.startSession(human, device.id, { mode: "COLLABORATIVE", agentId: "agent-a" });
    await expect(CloudAndroidOrchestrator.startSession(human, device.id, { mode: "HUMAN" })).rejects.toThrow(/active control session/i);
    const ai = await CloudAndroidOrchestrator.takeover(agentActor, session.id, "AGENT");
    expect(ai.controllerType).toBe("AGENT");
    await expect(CloudAndroidOrchestrator.executeUiAction(human, device.id, session.id, { type: "tap", elementId: "submit" })).rejects.toThrow(/another agent owns/i);
  });

  it("pauses a sensitive AI action, requires human approval, then executes and verifies", async () => {
    execute.mockResolvedValueOnce({ ok: true, requestId: "r", operationId: "op-provision", status: "RUNNING", providerDeviceRef: "ref", evidence: { securityVerified: true } });
    const device = await CloudAndroidOrchestrator.createDevice(human, config);
    await CloudAndroidOrchestrator.assignAgent(human, device.id, { agentId: "agent-a", permissions: ["device:view", "screen:view", "ui:tap"], sensitiveActions: [], domainAllowlist: [], expiresAt: undefined });
    const session = await CloudAndroidOrchestrator.startSession(human, device.id, { mode: "AI", agentId: "agent-a" });
    execute
      .mockResolvedValueOnce({ ok: true, requestId: "obs1", operationId: "observe-1", status: "RUNNING", observation: observation("Submit"), evidence: {} })
      .mockResolvedValueOnce({ ok: true, requestId: "prep", operationId: "prepare-1", status: "PREPARED", preparedAction: { token: "one-time-provider-token", expiresAt: new Date(Date.now() + 60000).toISOString(), sensitivity: "NONE", description: "Submit support response", target: { elementId: "submit" } }, evidence: {} });
    const prepared: any = await CloudAndroidOrchestrator.executeUiAction(agentActor, device.id, session.id, { type: "tap", elementId: "submit", intendedAction: "submit response" });
    expect(prepared.action.status).toBe("APPROVAL_REQUIRED"); expect(prepared.approval.status).toBe("PENDING"); expect(JSON.stringify(prepared)).not.toContain("one-time-provider-token");
    execute
      .mockResolvedValueOnce({ ok: true, requestId: "exec", operationId: "execute-1", status: "RUNNING", result: { tapped: true }, evidence: { verificationPassed: true } })
      .mockResolvedValueOnce({ ok: true, requestId: "obs2", operationId: "observe-2", status: "RUNNING", observation: observation("Sent"), evidence: {} });
    const decided: any = await CloudAndroidOrchestrator.decideApproval(human, prepared.approval.id, "APPROVED", "Approved by operator");
    expect(decided.action).toMatchObject({ status: "SUCCEEDED", sensitivity: "SUBMIT_FORM" });
    expect((db.tables.get("CloudAndroidApproval")![0]).status).toBe("CONSUMED");
  });

  it("never persists raw keyboard input in the action audit", async () => {
    execute.mockResolvedValueOnce({ ok: true, requestId: "r", operationId: "op-provision", status: "RUNNING", providerDeviceRef: "ref", evidence: { securityVerified: true } });
    const device = await CloudAndroidOrchestrator.createDevice(human, config);
    const session = await CloudAndroidOrchestrator.startSession(human, device.id, { mode: "HUMAN" });
    execute
      .mockResolvedValueOnce({ ok: true, observation: observation("Login"), operationId: "obs", status: "RUNNING", evidence: {} })
      .mockResolvedValueOnce({ ok: true, operationId: "prep", status: "PREPARED", preparedAction: { token: "token", expiresAt: new Date(Date.now() + 60000).toISOString(), sensitivity: "NONE", description: "Type credential" }, evidence: {} })
      .mockResolvedValueOnce({ ok: true, operationId: "exec", status: "RUNNING", result: {}, evidence: { verificationPassed: true } })
      .mockResolvedValueOnce({ ok: true, observation: observation("Logged in"), operationId: "obs2", status: "RUNNING", evidence: {} });
    await CloudAndroidOrchestrator.executeUiAction(human, device.id, session.id, { type: "type", elementId: "password", text: "super-secret-password", replace: true });
    expect(JSON.stringify(db.tables.get("CloudAndroidAction"))).not.toContain("super-secret-password");
    expect(db.tables.get("CloudAndroidAction")![0].payload).toMatchObject({ text: "[REDACTED_TYPED_INPUT]", textLength: 21 });
  });

  it("fails an action when post-action verification evidence is absent", async () => {
    execute.mockResolvedValueOnce({ ok: true, requestId: "r", operationId: "op-provision", status: "RUNNING", providerDeviceRef: "ref", evidence: { securityVerified: true } });
    const device = await CloudAndroidOrchestrator.createDevice(human, config);
    const session = await CloudAndroidOrchestrator.startSession(human, device.id, { mode: "HUMAN" });
    execute
      .mockResolvedValueOnce({ ok: true, requestId: "obs", operationId: "observe", status: "RUNNING", observation: observation("Home"), evidence: {} })
      .mockResolvedValueOnce({ ok: true, requestId: "prep", operationId: "prepare", status: "PREPARED", preparedAction: { token: "token", expiresAt: new Date(Date.now() + 60000).toISOString(), sensitivity: "NONE", description: "Tap button" }, evidence: {} })
      .mockResolvedValueOnce({ ok: true, requestId: "exec", operationId: "execute", status: "RUNNING", result: {}, evidence: { verificationPassed: false } })
      .mockResolvedValueOnce({ ok: true, requestId: "obs2", operationId: "observe2", status: "RUNNING", observation: observation("Maybe"), evidence: {} });
    const result: any = await CloudAndroidOrchestrator.executeUiAction(human, device.id, session.id, { type: "tap", elementId: "submit" });
    expect(result.action).toMatchObject({ status: "FAILED", errorCode: "ACTION_VERIFICATION_FAILED" });
  });
});
