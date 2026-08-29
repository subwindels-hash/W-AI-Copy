import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { auditService } from "../audit/audit.service.js";
import { encryptString, decryptString } from "../security/encryption.js";
import { cloudAndroidProvider } from "./provider.js";
import { CLOUD_ANDROID_SENSITIVE_ACTIONS, type CloudAndroidDeviceConfig, type CloudAndroidObservation, type CloudAndroidUiAction } from "@windels/shared/cloudAndroid";

const db = prisma as any;
export interface CloudAndroidActor { organizationId: string; userId: string; apiKeyId?: string; agentId?: string }
const ACTIVE_SESSION = ["ACTIVE", "PAUSED_FOR_APPROVAL", "PAUSED_FOR_TAKEOVER"];
const LOCK_TTL_MS = 5 * 60_000;

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeEvidence(value: any, depth = 0): any {
  if (typeof value === "bigint") return value.toString();
  if (depth > 7 || value === null || value === undefined || typeof value !== "object") return typeof value === "string" ? value.slice(0, 2000) : value;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => safeEvidence(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(secret|password|cookie|authorization|token|providerDeviceRef|proxyUrl)/i.test(key)) continue;
    out[key] = safeEvidence(item, depth + 1);
  }
  return out;
}
function publicDevice(device: any) {
  const { providerDeviceRef: _providerDeviceRef, networkPolicy, ...rest } = device;
  return safeEvidence({ ...rest, networkPolicy: { ...(networkPolicy ?? {}), proxyUrl: networkPolicy?.proxyUrl ? "configured" : undefined } });
}
function storedActionPayload(actionType: string, payload: any) {
  if (actionType === "ui.type" && typeof payload?.text === "string") return { ...safeEvidence(payload), text: "[REDACTED_TYPED_INPUT]", textLength: payload.text.length, textSha256: createHash("sha256").update(payload.text).digest("hex") };
  return safeEvidence(payload);
}
function publicAction(action: any) { const { preparedTokenHash: _hash, ...rest } = action; const result = { ...(rest.result ?? {}) }; delete result.preparedTokenEnc; return { ...rest, result: safeEvidence(result) }; }
function publicApproval(approval: any) { return { ...approval, action: approval.action ? publicAction(approval.action) : undefined }; }
async function audit(actor: CloudAndroidActor, action: any, resourceType: any, resourceId: string, metadata: Record<string, unknown> = {}) {
  await auditService.log({ organizationId: actor.organizationId, userId: actor.userId, apiKeyId: actor.apiKeyId, action, resourceType, resourceId, metadata: safeEvidence(metadata) });
}
async function providerRegistration() {
  const health = await cloudAndroidProvider.health();
  const provider = await db.cloudAndroidProviderRegistration.upsert({ where: { providerKey: cloudAndroidProvider.id }, create: { providerKey: cloudAndroidProvider.id, name: process.env.CLOUD_ANDROID_PROVIDER_NAME || "WINDELS Cloud Android Provider", adapterVersion: "v1", status: health.healthy ? "HEALTHY" : "UNAVAILABLE", capabilities: health.capabilities, regions: health.regions, androidVersions: health.androidVersions, lastHealthAt: new Date(), lastError: health.error ?? null }, update: { status: health.healthy ? "HEALTHY" : "UNAVAILABLE", capabilities: health.capabilities, regions: health.regions, androidVersions: health.androidVersions, lastHealthAt: new Date(), lastError: health.error ?? null } });
  return { provider, health };
}
async function ownedDevice(actor: CloudAndroidActor, deviceId: string, include: any = undefined) {
  const device = await db.cloudAndroidDevice.findFirst({ where: { id: deviceId, organizationId: actor.organizationId }, ...(include ? { include } : {}) });
  if (!device) throw AppError.notFound("Cloud Android device not found"); return device;
}
async function activeSession(actor: CloudAndroidActor, deviceId: string, sessionId: string) {
  const session = await db.cloudAndroidSession.findFirst({ where: { id: sessionId, deviceId, organizationId: actor.organizationId, status: { in: ACTIVE_SESSION } } });
  if (!session) throw AppError.notFound("Active Cloud Android session not found");
  if (session.controllerType === "AGENT" && session.controllerId !== actor.agentId) throw AppError.conflict("Another agent owns the active device control lock");
  if (session.controllerType === "HUMAN" && session.userId !== actor.userId) throw AppError.conflict("Another human owns the active device control lock");
  return session;
}
const ACTION_PERMISSION: Record<string, string> = {
  "ui.tap": "ui:tap", "ui.type": "ui:type", "ui.swipe": "ui:swipe", "ui.scroll": "ui:swipe", "ui.back": "ui:navigate", "ui.home": "ui:navigate",
  "screen.capture": "screen:screenshot", "ui.inspect": "screen:view", "app.install": "apps:install", "app.uninstall": "apps:remove", "app.launch": "apps:launch", "app.stop": "apps:launch", "app.list": "apps:view",
  "file.list": "files:read", "file.upload": "files:upload", "file.download": "files:download", "device.snapshot": "screen:screenshot",
};
async function sessionPermissions(actor: CloudAndroidActor, deviceId: string, session: any, actionType: string) {
  if (session.controllerType === "HUMAN") return ["human:authorized"];
  if (!actor.agentId || actor.agentId !== session.agentId) throw AppError.forbidden("Agent identity does not match the session");
  const grant = await db.cloudAndroidAgentGrant.findFirst({ where: { deviceId, organizationId: actor.organizationId, agentId: actor.agentId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (!grant) throw AppError.forbidden("Agent has no active grant for this device");
  const needed = ACTION_PERMISSION[actionType];
  if (needed && !grant.permissions.includes(needed)) throw AppError.forbidden(`Agent grant missing permission: ${needed}`);
  return grant.permissions;
}
function localSensitivity(actionType: string, payload: any): typeof CLOUD_ANDROID_SENSITIVE_ACTIONS[number] {
  const text = `${payload?.intendedAction ?? ""} ${payload?.elementId ?? ""}`.toLowerCase();
  if (actionType === "app.uninstall" || /delete|remove data/.test(text)) return "DELETE_DATA";
  if (/purchase|buy|checkout|pay\b|financial|transfer/.test(text)) return "PURCHASE";
  if (/submit|confirm form/.test(text)) return "SUBMIT_FORM";
  if (/send message|reply|post message/.test(text)) return "SEND_MESSAGE";
  if (/password|login|sign in|authenticate|otp|pin/.test(text)) return "AUTHENTICATE";
  if (/account setting|change email|change phone/.test(text)) return "ACCOUNT_SETTINGS";
  return "NONE";
}
function validPreparedAction(value: any): value is { token: string; expiresAt: string; sensitivity: typeof CLOUD_ANDROID_SENSITIVE_ACTIONS[number]; description: string; target?: Record<string, unknown> } {
  return !!value && typeof value.token === "string" && value.token.length >= 3 && typeof value.description === "string" && CLOUD_ANDROID_SENSITIVE_ACTIONS.includes(value.sensitivity) && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now();
}
function validateObservation(value: any): CloudAndroidObservation {
  if (!value || typeof value !== "object" || !Array.isArray(value.elements) || !value.deviceState || !value.app || !value.window) throw AppError.upstream("Provider returned an invalid Android observation");
  if (value.screenshot?.dataBase64 && Buffer.byteLength(value.screenshot.dataBase64, "base64") > 15 * 1024 * 1024) throw AppError.upstream("Provider screenshot exceeds 15MB policy");
  return value as CloudAndroidObservation;
}

export const CloudAndroidOrchestrator = {
  async status() {
    const { provider, health } = await providerRegistration();
    return { configured: cloudAndroidProvider.id !== "not-configured", provider: { id: provider.id, name: provider.name, status: provider.status, capabilities: provider.capabilities, regions: provider.regions, androidVersions: provider.androidVersions, lastHealthAt: provider.lastHealthAt, error: provider.lastError }, healthy: health.healthy };
  },

  async listDevices(actor: CloudAndroidActor) {
    return (await db.cloudAndroidDevice.findMany({ where: { organizationId: actor.organizationId, lifecycle: { not: "DESTROYED" } }, include: { grants: { where: { active: true }, include: { agent: { select: { id: true, name: true, status: true } } } }, sessions: { where: { status: { in: ACTIVE_SESSION } }, select: { id: true, mode: true, status: true, controllerType: true, controllerId: true, startedAt: true } } }, orderBy: { updatedAt: "desc" } })).map(publicDevice);
  },
  async getDevice(actor: CloudAndroidActor, id: string) { return publicDevice(await ownedDevice(actor, id, { grants: { include: { agent: { select: { id: true, name: true, status: true } } } }, sessions: { orderBy: { startedAt: "desc" }, take: 20 }, actions: { orderBy: { createdAt: "desc" }, take: 100 }, snapshots: { orderBy: { createdAt: "desc" }, take: 20 } })); },

  async createDevice(actor: CloudAndroidActor, config: CloudAndroidDeviceConfig) {
    const { provider, health } = await providerRegistration();
    if (!health.healthy) throw AppError.serviceUnavailable(`Cloud Android provider unavailable: ${health.error ?? "health check failed"}`);
    if (!health.capabilities.includes("device.provision")) throw AppError.serviceUnavailable("Provider does not advertise device.provision");
    if (health.regions.length && !health.regions.includes(config.region)) throw AppError.validation(`Provider does not support region ${config.region}`);
    if (health.androidVersions.length && !health.androidVersions.includes(config.androidVersion)) throw AppError.validation(`Provider does not support Android ${config.androidVersion}`);
    if (config.templateId && !(await db.cloudAndroidTemplate.findFirst({ where: { id: config.templateId, organizationId: actor.organizationId, active: true } }))) throw AppError.notFound("Cloud Android template not found");
    if (config.imageId && !(await db.cloudAndroidImage.findFirst({ where: { id: config.imageId, organizationId: actor.organizationId, status: "READY" } }))) throw AppError.notFound("Ready Cloud Android image not found");
    const device = await db.cloudAndroidDevice.create({ data: { organizationId: actor.organizationId, ownerId: actor.userId, providerId: provider.id, name: config.name, androidVersion: config.androidVersion, lifecycle: "CREATING", desiredState: "STOPPED", cpuCores: config.cpuCores, ramMb: config.ramMb, storageGb: config.storageGb, region: config.region, locale: config.locale, timezone: config.timezone, networkPolicy: config.networkPolicy, securityProfile: config.securityProfile, templateId: config.templateId ?? null, imageId: config.imageId ?? null } });
    const result = await cloudAndroidProvider.execute({ action: "DEVICE_PROVISION", organizationId: actor.organizationId, device: { id: device.id }, payload: { config }, policy: { permissions: ["device:create"], networkPolicy: config.networkPolicy } });
    if (!result.ok || !result.providerDeviceRef) {
      await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: "FAILED", lastError: result.error?.message ?? "Provider provisioning failed" } });
      await audit(actor, "cloud_android.device_create_failed", "cloud_android_device", device.id, { operationId: result.operationId, error: result.error });
      throw AppError.upstream("Cloud Android provisioning failed", { deviceId: device.id, error: result.error });
    }
    const lifecycle = result.status === "RUNNING" ? "RUNNING" : "STOPPED";
    const updated = await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { providerDeviceRef: result.providerDeviceRef, lifecycle, desiredState: lifecycle, metrics: result.metrics ?? {}, runtimeState: safeEvidence(result.result ?? {}), securityStatus: result.evidence?.securityVerified === true ? "VERIFIED" : "UNVERIFIED", provisionedAt: new Date(), lastHealthAt: new Date(), lastError: null } });
    await audit(actor, "cloud_android.device_created", "cloud_android_device", device.id, { operationId: result.operationId, androidVersion: config.androidVersion, region: config.region });
    return publicDevice(updated);
  },

  async lifecycle(actor: CloudAndroidActor, deviceId: string, command: "start" | "stop" | "restart" | "delete") {
    const device = await ownedDevice(actor, deviceId);
    if (device.lifecycle === "DESTROYED") throw AppError.conflict("Device is destroyed");
    if (!device.providerDeviceRef) throw AppError.conflict("Device has no verified provider runtime");
    if (command === "delete" && device.activeSessionId) throw AppError.conflict("End the active control session before destroying the device");
    const actionMap = { start: "DEVICE_START", stop: "DEVICE_STOP", restart: "DEVICE_RESTART", delete: "DEVICE_DESTROY" } as const;
    const result = await cloudAndroidProvider.execute({ action: actionMap[command], organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, payload: {}, policy: { permissions: [`device:${command}`], networkPolicy: device.networkPolicy } });
    if (!result.ok) { await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: "DEGRADED", lastError: result.error?.message ?? `${command} failed` } }); throw AppError.upstream(`Device ${command} failed`, result.error); }
    const state: any = command === "start" ? "RUNNING" : command === "stop" ? "STOPPED" : command === "delete" ? "DESTROYED" : result.status === "RUNNING" ? "RUNNING" : "REBOOTING";
    const updated = await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: state, desiredState: command === "delete" ? "DESTROYED" : command === "stop" ? "STOPPED" : "RUNNING", metrics: result.metrics ?? device.metrics, lastHealthAt: new Date(), lastError: null, ...(command === "delete" ? { destroyedAt: new Date() } : {}) } });
    await audit(actor, `cloud_android.device_${command}`, "cloud_android_device", device.id, { operationId: result.operationId, state });
    return publicDevice(updated);
  },

  async observe(actor: CloudAndroidActor, deviceId: string) {
    const device = await ownedDevice(actor, deviceId);
    if (device.lifecycle !== "RUNNING") throw AppError.conflict("Device must be running to observe it");
    const result = await cloudAndroidProvider.execute({ action: "DEVICE_OBSERVE", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, payload: { includeScreenshot: true, includeAccessibilityTree: true }, policy: { permissions: ["screen:view"], networkPolicy: device.networkPolicy } });
    if (!result.ok || !result.observation) throw AppError.upstream("Device observation failed", result.error);
    const observation = validateObservation(result.observation);
    await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lastObservedAt: new Date(), lastHealthAt: new Date(), metrics: result.metrics ?? device.metrics, runtimeState: { app: observation.app, window: observation.window, deviceState: observation.deviceState }, lastError: null } });
    await audit(actor, "cloud_android.screen_observed", "cloud_android_device", device.id, { operationId: result.operationId, app: observation.app.packageName, elementCount: observation.elements.length });
    return observation;
  },

  async assignAgent(actor: CloudAndroidActor, deviceId: string, input: { agentId: string; permissions: string[]; sensitiveActions: string[]; domainAllowlist: string[]; expiresAt?: string }) {
    await ownedDevice(actor, deviceId);
    const agent = await db.agent.findFirst({ where: { id: input.agentId, organizationId: actor.organizationId } });
    if (!agent) throw AppError.notFound("Agent not found");
    const grant = await db.cloudAndroidAgentGrant.upsert({ where: { deviceId_agentId: { deviceId, agentId: input.agentId } }, create: { organizationId: actor.organizationId, deviceId, agentId: input.agentId, assignedById: actor.userId, permissions: input.permissions, sensitiveActions: input.sensitiveActions, domainAllowlist: input.domainAllowlist, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }, update: { active: true, assignedById: actor.userId, permissions: input.permissions, sensitiveActions: input.sensitiveActions, domainAllowlist: input.domainAllowlist, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } });
    await audit(actor, "cloud_android.agent_assigned", "cloud_android_device", deviceId, { agentId: agent.id, permissions: input.permissions, expiresAt: input.expiresAt });
    return grant;
  },

  async startSession(actor: CloudAndroidActor, deviceId: string, input: { mode: "HUMAN" | "AI" | "COLLABORATIVE"; agentId?: string; applicationPackage?: string }) {
    const device = await ownedDevice(actor, deviceId);
    if (device.lifecycle !== "RUNNING") throw AppError.conflict("Device must be running before a control session starts");
    const existing = await db.cloudAndroidSession.findFirst({ where: { deviceId, status: { in: ACTIVE_SESSION } } });
    if (existing) throw AppError.conflict(`Device already has active control session ${existing.id}`);
    let permissions: string[] = ["human:authorized"];
    if (input.agentId) {
      const grant = await db.cloudAndroidAgentGrant.findFirst({ where: { deviceId, organizationId: actor.organizationId, agentId: input.agentId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      if (!grant) throw AppError.forbidden("Agent is not assigned to this device"); permissions = grant.permissions;
    }
    const controllerType = input.mode === "AI" ? "AGENT" : "HUMAN";
    const controllerId = controllerType === "AGENT" ? input.agentId! : actor.userId;
    const session = await db.$transaction(async (tx: any) => {
      const created = await tx.cloudAndroidSession.create({ data: { organizationId: actor.organizationId, deviceId, userId: actor.userId, agentId: input.agentId ?? null, apiKeyId: actor.apiKeyId ?? null, mode: input.mode, status: "ACTIVE", controllerType, controllerId, applicationPackage: input.applicationPackage ?? null, permissions } });
      await tx.cloudAndroidDevice.update({ where: { id: deviceId }, data: { activeControllerType: controllerType, activeControllerId: controllerId, activeSessionId: created.id, controlLockVersion: { increment: 1 }, controlLockExpiresAt: new Date(Date.now() + LOCK_TTL_MS) } });
      return created;
    });
    await audit(actor, "cloud_android.session_started", "cloud_android_session", session.id, { deviceId, mode: input.mode, agentId: input.agentId });
    return session;
  },

  async takeover(actor: CloudAndroidActor, sessionId: string, controller: "HUMAN" | "AGENT") {
    const session = await db.cloudAndroidSession.findFirst({ where: { id: sessionId, organizationId: actor.organizationId, status: { in: ACTIVE_SESSION } } });
    if (!session) throw AppError.notFound("Active session not found");
    if (session.mode !== "COLLABORATIVE") throw AppError.conflict("Takeover requires collaborative mode");
    const controllerId = controller === "HUMAN" ? actor.userId : actor.agentId ?? session.agentId;
    if (!controllerId) throw AppError.validation("Agent identity is required for AI takeover");
    if (controller === "AGENT" && controllerId !== session.agentId) throw AppError.forbidden("Only the assigned session agent can take control");
    const updated = await db.$transaction(async (tx: any) => {
      const row = await tx.cloudAndroidSession.update({ where: { id: session.id }, data: { controllerType: controller, controllerId, status: "ACTIVE", lastActivityAt: new Date() } });
      await tx.cloudAndroidDevice.update({ where: { id: session.deviceId }, data: { activeControllerType: controller, activeControllerId: controllerId, controlLockVersion: { increment: 1 }, controlLockExpiresAt: new Date(Date.now() + LOCK_TTL_MS) } });
      return row;
    });
    await audit(actor, "cloud_android.control_takeover", "cloud_android_session", session.id, { controller, controllerId });
    return updated;
  },

  async endSession(actor: CloudAndroidActor, sessionId: string, result: Record<string, unknown> = {}) {
    const session = await db.cloudAndroidSession.findFirst({ where: { id: sessionId, organizationId: actor.organizationId, status: { in: ACTIVE_SESSION } } });
    if (!session) throw AppError.notFound("Active session not found");
    const ended = await db.$transaction(async (tx: any) => {
      const row = await tx.cloudAndroidSession.update({ where: { id: session.id }, data: { status: "COMPLETED", result: safeEvidence(result), endedAt: new Date(), lastActivityAt: new Date() } });
      await tx.cloudAndroidDevice.update({ where: { id: session.deviceId }, data: { activeControllerType: null, activeControllerId: null, activeSessionId: null, controlLockExpiresAt: null, controlLockVersion: { increment: 1 } } });
      return row;
    });
    const runtimeSeconds = Math.max(0, Math.floor((new Date(ended.endedAt).getTime() - new Date(ended.startedAt).getTime()) / 1000));
    await db.cloudAndroidUsageRecord.create({ data: { organizationId: actor.organizationId, deviceId: session.deviceId, sessionId: session.id, apiKeyId: actor.apiKeyId ?? null, metric: "device_runtime", quantity: BigInt(runtimeSeconds), unit: "seconds", costMicros: null, source: "control_plane_clock" } });
    await audit(actor, "cloud_android.session_ended", "cloud_android_session", session.id, { deviceId: session.deviceId, runtimeSeconds });
    return ended;
  },

  async executeUiAction(actor: CloudAndroidActor, deviceId: string, sessionId: string, input: CloudAndroidUiAction) {
    const device = await ownedDevice(actor, deviceId); const session = await activeSession(actor, deviceId, sessionId);
    const actionType = `ui.${input.type}`; const permissions = await sessionPermissions(actor, deviceId, session, actionType);
    const beforeResult = await cloudAndroidProvider.execute({ action: "DEVICE_OBSERVE", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, session: { id: session.id, mode: session.mode, controllerType: session.controllerType, controllerId: session.controllerId }, payload: { includeScreenshot: false, includeAccessibilityTree: true }, policy: { permissions, networkPolicy: device.networkPolicy } });
    if (!beforeResult.ok || !beforeResult.observation) throw AppError.upstream("Pre-action observation failed", beforeResult.error);
    const before = validateObservation(beforeResult.observation);
    const row = await db.cloudAndroidAction.create({ data: { organizationId: actor.organizationId, deviceId, sessionId, userId: session.controllerType === "HUMAN" ? actor.userId : null, agentId: session.controllerType === "AGENT" ? session.agentId : null, actionType, payload: storedActionPayload(actionType, input), status: "PREPARING", beforeObservationHash: hash(before) } });
    const prepared = await cloudAndroidProvider.execute({ action: "PREPARE_ACTION", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, session: { id: session.id, mode: session.mode, controllerType: session.controllerType, controllerId: session.controllerId }, payload: { actionId: row.id, actionType, input, observationHash: hash(before) }, policy: { permissions, networkPolicy: device.networkPolicy } });
    if (!prepared.ok || !validPreparedAction(prepared.preparedAction)) {
      const failed = await db.cloudAndroidAction.update({ where: { id: row.id }, data: { status: "FAILED", errorCode: prepared.error?.code ?? "PREPARE_FAILED", errorMessage: prepared.error?.message ?? "Provider did not prepare action", completedAt: new Date() } });
      await audit(actor, "cloud_android.action_failed", "cloud_android_action", row.id, { stage: "prepare", error: prepared.error }); return publicAction(failed);
    }
    const inferredSensitivity = localSensitivity(actionType, input);
    const sensitivity = prepared.preparedAction.sensitivity === "NONE" && inferredSensitivity !== "NONE" ? inferredSensitivity : prepared.preparedAction.sensitivity;
    const preparedTokenHash = createHash("sha256").update(prepared.preparedAction.token).digest("hex");
    const preparedTokenEnc = encryptString(prepared.preparedAction.token);
    const requiresApproval = session.controllerType === "AGENT" && sensitivity !== "NONE";
    await db.cloudAndroidAction.update({ where: { id: row.id }, data: { sensitivity, preparedTokenHash, providerOperationId: prepared.operationId, result: { preparedTokenEnc, prepared: safeEvidence(prepared.preparedAction) }, status: requiresApproval ? "APPROVAL_REQUIRED" : "EXECUTING" } });
    if (requiresApproval) {
      const approval = await db.cloudAndroidApproval.create({ data: { organizationId: actor.organizationId, actionId: row.id, sessionId, status: "PENDING", sensitivity, description: prepared.preparedAction.description, target: safeEvidence(prepared.preparedAction.target ?? {}), requestedByAgentId: session.agentId, expiresAt: new Date(prepared.preparedAction.expiresAt) } });
      await db.cloudAndroidSession.update({ where: { id: session.id }, data: { status: "PAUSED_FOR_APPROVAL" } });
      await audit(actor, "cloud_android.approval_requested", "cloud_android_approval", approval.id, { actionId: row.id, sensitivity, description: approval.description });
      return { action: publicAction(await db.cloudAndroidAction.findFirst({ where: { id: row.id } })), approval: publicApproval(approval), observation: before };
    }
    return { action: await this.executePrepared(actor, row.id, prepared.preparedAction.token), approval: null, observation: before };
  },

  async executePrepared(actor: CloudAndroidActor, actionId: string, token: string) {
    const action = await db.cloudAndroidAction.findFirst({ where: { id: actionId, organizationId: actor.organizationId }, include: { device: true, session: true, approval: true } });
    if (!action) throw AppError.notFound("Prepared action not found");
    if (!["EXECUTING", "APPROVAL_REQUIRED"].includes(action.status)) throw AppError.conflict(`Action cannot execute from ${action.status}`);
    if (createHash("sha256").update(token).digest("hex") !== action.preparedTokenHash) throw AppError.forbidden("Prepared action token mismatch");
    if (action.approval && action.approval.status !== "APPROVED") throw AppError.conflict("Sensitive action has not been approved");
    const result = await cloudAndroidProvider.execute({ action: "EXECUTE_PREPARED_ACTION", organizationId: actor.organizationId, device: { id: action.deviceId, providerRef: action.device.providerDeviceRef }, session: { id: action.session.id, mode: action.session.mode, controllerType: action.session.controllerType, controllerId: action.session.controllerId }, payload: { actionId: action.id, preparedToken: token }, policy: { permissions: action.session.permissions as string[], networkPolicy: action.device.networkPolicy, approvalToken: action.approval?.id } });
    if (!result.ok) { const failed = await db.cloudAndroidAction.update({ where: { id: action.id }, data: { status: "FAILED", errorCode: result.error?.code ?? "ACTION_FAILED", errorMessage: result.error?.message ?? "Provider action failed", result: safeEvidence(result.result ?? {}), completedAt: new Date() } }); await audit(actor, "cloud_android.action_failed", "cloud_android_action", action.id, { stage: "execute", error: result.error }); return publicAction(failed); }
    await db.cloudAndroidAction.update({ where: { id: action.id }, data: { status: "VERIFYING", providerOperationId: result.operationId } });
    const observed = await cloudAndroidProvider.execute({ action: "DEVICE_OBSERVE", organizationId: actor.organizationId, device: { id: action.deviceId, providerRef: action.device.providerDeviceRef }, session: { id: action.session.id, mode: action.session.mode, controllerType: action.session.controllerType, controllerId: action.session.controllerId }, payload: { includeScreenshot: false, includeAccessibilityTree: true, verifyActionId: action.id }, policy: { permissions: action.session.permissions as string[], networkPolicy: action.device.networkPolicy } });
    const verificationPassed = observed.ok && observed.observation && result.evidence?.verificationPassed === true;
    const afterHash = observed.observation ? hash(validateObservation(observed.observation)) : null;
    const completed = await db.cloudAndroidAction.update({ where: { id: action.id }, data: { status: verificationPassed ? "SUCCEEDED" : "FAILED", afterObservationHash: afterHash, result: safeEvidence({ providerResult: result.result, verification: result.evidence }), errorCode: verificationPassed ? null : "ACTION_VERIFICATION_FAILED", errorMessage: verificationPassed ? null : "Provider could not prove the action succeeded after re-observation", completedAt: new Date() } });
    if (action.approval) await db.cloudAndroidApproval.update({ where: { id: action.approval.id }, data: { status: verificationPassed ? "CONSUMED" : "APPROVED", consumedAt: verificationPassed ? new Date() : null } });
    await db.cloudAndroidSession.update({ where: { id: action.session.id }, data: { status: "ACTIVE", lastActivityAt: new Date() } });
    await audit(actor, verificationPassed ? "cloud_android.action_succeeded" : "cloud_android.action_failed", "cloud_android_action", action.id, { actionType: action.actionType, sensitivity: action.sensitivity, verificationPassed });
    return publicAction(completed);
  },

  async executeManagedAction(actor: CloudAndroidActor, deviceId: string, sessionId: string, actionType: string, payload: Record<string, unknown>) {
    const device = await ownedDevice(actor, deviceId); const session = await activeSession(actor, deviceId, sessionId);
    const permissions = await sessionPermissions(actor, deviceId, session, actionType);
    const row = await db.cloudAndroidAction.create({ data: { organizationId: actor.organizationId, deviceId, sessionId, userId: session.controllerType === "HUMAN" ? actor.userId : null, agentId: session.controllerType === "AGENT" ? session.agentId : null, actionType, payload: storedActionPayload(actionType, payload), status: "PREPARING" } });
    const prepared = await cloudAndroidProvider.execute({ action: "PREPARE_ACTION", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, session: { id: session.id, mode: session.mode, controllerType: session.controllerType, controllerId: session.controllerId }, payload: { actionId: row.id, actionType, input: payload }, policy: { permissions, networkPolicy: device.networkPolicy } });
    if (!prepared.ok || !validPreparedAction(prepared.preparedAction)) { const failed = await db.cloudAndroidAction.update({ where: { id: row.id }, data: { status: "FAILED", errorCode: prepared.error?.code ?? "PREPARE_FAILED", errorMessage: prepared.error?.message ?? "Provider did not prepare action", completedAt: new Date() } }); return { action: publicAction(failed), approval: null }; }
    const inferredSensitivity = localSensitivity(actionType, payload);
    const sensitivity = prepared.preparedAction.sensitivity === "NONE" && inferredSensitivity !== "NONE" ? inferredSensitivity : prepared.preparedAction.sensitivity;
    const preparedTokenHash = createHash("sha256").update(prepared.preparedAction.token).digest("hex");
    const preparedTokenEnc = encryptString(prepared.preparedAction.token);
    const requiresApproval = session.controllerType === "AGENT" && sensitivity !== "NONE";
    await db.cloudAndroidAction.update({ where: { id: row.id }, data: { sensitivity, preparedTokenHash, providerOperationId: prepared.operationId, result: { preparedTokenEnc, prepared: safeEvidence(prepared.preparedAction) }, status: requiresApproval ? "APPROVAL_REQUIRED" : "EXECUTING" } });
    if (requiresApproval) {
      const approval = await db.cloudAndroidApproval.create({ data: { organizationId: actor.organizationId, actionId: row.id, sessionId, status: "PENDING", sensitivity, description: prepared.preparedAction.description, target: safeEvidence(prepared.preparedAction.target ?? {}), requestedByAgentId: session.agentId, expiresAt: new Date(prepared.preparedAction.expiresAt) } });
      await db.cloudAndroidSession.update({ where: { id: session.id }, data: { status: "PAUSED_FOR_APPROVAL" } });
      await audit(actor, "cloud_android.approval_requested", "cloud_android_approval", approval.id, { actionId: row.id, sensitivity });
      return { action: publicAction(await db.cloudAndroidAction.findFirst({ where: { id: row.id } })), approval: publicApproval(approval) };
    }
    return { action: await this.executePrepared(actor, row.id, prepared.preparedAction.token), approval: null };
  },

  async decideApproval(actor: CloudAndroidActor, approvalId: string, decision: "APPROVED" | "REJECTED", note?: string) {
    const approval = await db.cloudAndroidApproval.findFirst({ where: { id: approvalId, organizationId: actor.organizationId }, include: { action: true } });
    if (!approval) throw AppError.notFound("Approval request not found");
    if (approval.status !== "PENDING") throw AppError.conflict(`Approval is already ${approval.status}`);
    if (approval.expiresAt < new Date()) { await db.cloudAndroidApproval.update({ where: { id: approval.id }, data: { status: "EXPIRED" } }); throw AppError.conflict("Approval request expired"); }
    const updated = await db.cloudAndroidApproval.update({ where: { id: approval.id }, data: { status: decision, decidedById: actor.userId, decisionNote: note ?? null, decidedAt: new Date() } });
    if (decision === "REJECTED") { await db.cloudAndroidAction.update({ where: { id: approval.actionId }, data: { status: "REJECTED", errorCode: "HUMAN_REJECTED", errorMessage: note ?? "Human rejected action", completedAt: new Date() } }); await db.cloudAndroidSession.update({ where: { id: approval.sessionId }, data: { status: "ACTIVE" } }); await audit(actor, "cloud_android.approval_rejected", "cloud_android_approval", approval.id, { actionId: approval.actionId, sensitivity: approval.sensitivity }); return { approval: publicApproval(updated), action: publicAction(await db.cloudAndroidAction.findFirst({ where: { id: approval.actionId } })) }; }
    const encrypted = (approval.action.result as any)?.preparedTokenEnc;
    const token = encrypted ? decryptString(encrypted) : null;
    if (!token) throw AppError.internal("Approved action token is unavailable");
    await audit(actor, "cloud_android.approval_approved", "cloud_android_approval", approval.id, { actionId: approval.actionId, sensitivity: approval.sensitivity });
    return { approval: publicApproval(updated), action: await this.executePrepared(actor, approval.actionId, token) };
  },

  async listSessions(actor: CloudAndroidActor) { return db.cloudAndroidSession.findMany({ where: { organizationId: actor.organizationId }, include: { device: { select: { id: true, name: true, lifecycle: true } }, agent: { select: { id: true, name: true } }, approvals: { where: { status: "PENDING" } } }, orderBy: { startedAt: "desc" }, take: 200 }); },
  async listApprovals(actor: CloudAndroidActor) { return (await db.cloudAndroidApproval.findMany({ where: { organizationId: actor.organizationId }, include: { action: true, session: { include: { device: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } } }, decidedBy: { select: { id: true, email: true, profile: true } } }, orderBy: { createdAt: "desc" }, take: 200 })).map(publicApproval); },
  async listAudit(actor: CloudAndroidActor) { return (await db.cloudAndroidAction.findMany({ where: { organizationId: actor.organizationId }, include: { device: { select: { id: true, name: true } }, session: { select: { id: true, mode: true } }, approval: true }, orderBy: { createdAt: "desc" }, take: 500 })).map(publicAction); },

  async listImages(actor: CloudAndroidActor) { return (await db.cloudAndroidImage.findMany({ where: { organizationId: actor.organizationId }, orderBy: { updatedAt: "desc" } })).map((row: any) => safeEvidence({ ...row, providerImageRef: undefined })); },
  async createImage(actor: CloudAndroidActor, input: { sourceDeviceId: string; name: string; version: string }) {
    const device = await ownedDevice(actor, input.sourceDeviceId);
    if (device.lifecycle !== "STOPPED") throw AppError.conflict("Stop the device before capturing a reusable image");
    const row = await db.cloudAndroidImage.create({ data: { organizationId: actor.organizationId, createdById: actor.userId, name: input.name, version: input.version, status: "CREATING", androidVersion: device.androidVersion, sourceDeviceId: device.id, configuration: { cpuCores: device.cpuCores, ramMb: device.ramMb, storageGb: device.storageGb, locale: device.locale, timezone: device.timezone, securityProfile: device.securityProfile }, applications: (device.runtimeState as any)?.applications ?? [], agentConfiguration: {}, automationConfiguration: {} } });
    const result = await cloudAndroidProvider.execute({ action: "DEVICE_IMAGE_CREATE", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, payload: { imageId: row.id, name: input.name, version: input.version }, policy: { permissions: ["image:create"], networkPolicy: device.networkPolicy } });
    const ready = result.ok && typeof result.result?.imageRef === "string" && result.evidence?.securityVerified === true;
    const updated = await db.cloudAndroidImage.update({ where: { id: row.id }, data: { status: ready ? "READY" : "FAILED", providerImageRef: ready ? String(result.result!.imageRef) : null, sizeBytes: typeof result.result?.sizeBytes === "number" ? BigInt(result.result.sizeBytes) : null, checksum: typeof result.result?.checksum === "string" ? result.result.checksum : null, securityReport: safeEvidence(result.evidence) } });
    await audit(actor, ready ? "cloud_android.image_created" : "cloud_android.image_failed", "cloud_android_image", row.id, { sourceDeviceId: device.id, operationId: result.operationId });
    if (!ready) throw AppError.upstream("Cloud Android image creation failed security/provider verification", result.error ?? result.evidence);
    return safeEvidence({ ...updated, providerImageRef: undefined });
  },

  async createTemplate(actor: CloudAndroidActor, input: any) { if (input.imageId && !(await db.cloudAndroidImage.findFirst({ where: { id: input.imageId, organizationId: actor.organizationId, status: "READY" } }))) throw AppError.notFound("Ready Cloud Android image not found"); const row = await db.cloudAndroidTemplate.create({ data: { organizationId: actor.organizationId, createdById: actor.userId, ...input } }); await audit(actor, "cloud_android.template_created", "cloud_android_template", row.id, { name: row.name }); return row; },
  async listTemplates(actor: CloudAndroidActor) { return db.cloudAndroidTemplate.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { updatedAt: "desc" } }); },

  async snapshot(actor: CloudAndroidActor, deviceId: string, name: string) {
    const device = await ownedDevice(actor, deviceId);
    const row = await db.cloudAndroidSnapshot.create({ data: { organizationId: actor.organizationId, deviceId, name, status: "CREATING", createdByType: actor.agentId ? "AGENT" : "USER", createdById: actor.agentId ?? actor.userId } });
    const result = await cloudAndroidProvider.execute({ action: "DEVICE_SNAPSHOT", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, payload: { snapshotId: row.id, name }, policy: { permissions: ["device:snapshot"], networkPolicy: device.networkPolicy } });
    const updated = await db.cloudAndroidSnapshot.update({ where: { id: row.id }, data: { status: result.ok ? "READY" : "FAILED", providerSnapshotRef: typeof result.result?.snapshotRef === "string" ? result.result.snapshotRef : null, sizeBytes: typeof result.result?.sizeBytes === "number" ? BigInt(result.result.sizeBytes) : null, checksum: typeof result.result?.checksum === "string" ? result.result.checksum : null, metadata: safeEvidence(result.evidence), completedAt: new Date() } });
    await audit(actor, result.ok ? "cloud_android.snapshot_created" : "cloud_android.snapshot_failed", "cloud_android_snapshot", row.id, { deviceId, operationId: result.operationId });
    return safeEvidence(updated);
  },

  async restoreSnapshot(actor: CloudAndroidActor, deviceId: string, snapshotId: string) {
    const device = await ownedDevice(actor, deviceId);
    if (device.activeSessionId) throw AppError.conflict("End the active session before restoring a snapshot");
    const snapshot = await db.cloudAndroidSnapshot.findFirst({ where: { id: snapshotId, deviceId, organizationId: actor.organizationId, status: "READY" } });
    if (!snapshot?.providerSnapshotRef) throw AppError.notFound("Ready snapshot not found");
    await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: "RESTORING" } });
    const result = await cloudAndroidProvider.execute({ action: "DEVICE_RESTORE", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, payload: { snapshotId: snapshot.id, providerSnapshotRef: snapshot.providerSnapshotRef }, policy: { permissions: ["device:restore"], networkPolicy: device.networkPolicy } });
    const updated = await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: result.ok ? (result.status === "RUNNING" ? "RUNNING" : "STOPPED") : "FAILED", lastError: result.ok ? null : result.error?.message ?? "Restore failed", lastHealthAt: new Date() } });
    await audit(actor, result.ok ? "cloud_android.snapshot_restored" : "cloud_android.snapshot_restore_failed", "cloud_android_snapshot", snapshot.id, { deviceId, operationId: result.operationId });
    if (!result.ok) throw AppError.upstream("Snapshot restore failed", result.error);
    return publicDevice(updated);
  },

  async metrics(actor: CloudAndroidActor, deviceId: string) {
    const device = await ownedDevice(actor, deviceId);
    const result = await cloudAndroidProvider.execute({ action: "DEVICE_METRICS", organizationId: actor.organizationId, device: { id: device.id, providerRef: device.providerDeviceRef }, payload: {}, policy: { permissions: ["device:metrics"], networkPolicy: device.networkPolicy } });
    if (!result.ok || !result.metrics) throw AppError.upstream("Device metrics unavailable", result.error);
    await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { metrics: result.metrics, lastHealthAt: new Date(), lifecycle: result.status === "DEGRADED" ? "DEGRADED" : device.lifecycle } });
    for (const [metric, raw] of Object.entries(result.metrics)) if (typeof raw === "number" && Number.isFinite(raw)) await db.cloudAndroidUsageRecord.create({ data: { organizationId: actor.organizationId, deviceId, apiKeyId: actor.apiKeyId ?? null, metric, quantity: BigInt(Math.round(raw)), unit: "provider_unit", source: cloudAndroidProvider.id } });
    return result.metrics;
  },

  async bulkLifecycle(actor: CloudAndroidActor, deviceIds: string[], command: "start" | "stop" | "restart" | "delete") {
    const results: Array<{ deviceId: string; ok: boolean; status?: string; error?: string }> = [];
    for (const deviceId of deviceIds) {
      try { const device = await this.lifecycle(actor, deviceId, command); results.push({ deviceId, ok: true, status: device.lifecycle }); }
      catch (error) { results.push({ deviceId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    }
    await audit(actor, "cloud_android.fleet_operation", "cloud_android_fleet", actor.organizationId, { command, count: deviceIds.length, succeeded: results.filter((item) => item.ok).length });
    return { command, requested: deviceIds.length, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, results };
  },

  async fleetDashboard(actor: CloudAndroidActor) {
    const devices = await db.cloudAndroidDevice.findMany({ where: { organizationId: actor.organizationId, lifecycle: { not: "DESTROYED" } } });
    const sessions = await db.cloudAndroidSession.count({ where: { organizationId: actor.organizationId, status: { in: ACTIVE_SESSION } } });
    const approvals = await db.cloudAndroidApproval.count({ where: { organizationId: actor.organizationId, status: "PENDING" } });
    const byLifecycle = Object.fromEntries([...new Set(devices.map((device: any) => device.lifecycle))].map((state) => [state, devices.filter((device: any) => device.lifecycle === state).length]));
    return { total: devices.length, running: devices.filter((device: any) => device.lifecycle === "RUNNING").length, degraded: devices.filter((device: any) => ["DEGRADED", "FAILED"].includes(device.lifecycle)).length, activeSessions: sessions, pendingApprovals: approvals, byLifecycle, providerConfigured: cloudAndroidProvider.id !== "not-configured", measuredAt: new Date().toISOString() };
  },

  async reconcileHealth(actor: CloudAndroidActor) {
    const devices = await db.cloudAndroidDevice.findMany({ where: { organizationId: actor.organizationId, lifecycle: { in: ["RUNNING", "DEGRADED"] } } });
    const results: Array<{ deviceId: string; health: string; recovery: string }> = [];
    for (const device of devices) {
      try {
        const metrics: any = await this.metrics(actor, device.id);
        const unhealthy = metrics.responsive === false || Number(metrics.cpuPct ?? 0) >= 98 || Number(metrics.memoryPct ?? 0) >= 98 || Number(metrics.storagePct ?? 0) >= 98;
        if (unhealthy) {
          await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: "DEGRADED", lastError: "Health policy threshold exceeded" } });
          results.push({ deviceId: device.id, health: "DEGRADED", recovery: "ESCALATED_RESTART_REQUIRES_OPERATOR" });
        } else results.push({ deviceId: device.id, health: "HEALTHY", recovery: "NONE" });
      } catch (error) { await db.cloudAndroidDevice.update({ where: { id: device.id }, data: { lifecycle: "DEGRADED", lastError: error instanceof Error ? error.message : String(error) } }); results.push({ deviceId: device.id, health: "UNKNOWN", recovery: "ESCALATED" }); }
    }
    await audit(actor, "cloud_android.fleet_health_reconciled", "cloud_android_fleet", actor.organizationId, { checked: results.length, degraded: results.filter((item) => item.health !== "HEALTHY").length });
    return { checkedAt: new Date().toISOString(), results, note: "Auto-healing never performs an unapproved destructive replacement. Degraded devices are escalated; configured policies may trigger verified restart through the normal lifecycle API." };
  },
};
