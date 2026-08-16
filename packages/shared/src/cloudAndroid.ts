import { z } from "zod";

export const CLOUD_ANDROID_LIFECYCLE = ["CREATING", "PROVISIONING", "STOPPED", "BOOTING", "RUNNING", "SUSPENDING", "SUSPENDED", "REBOOTING", "SNAPSHOTTING", "RESTORING", "DEGRADED", "FAILED", "DESTROYING", "DESTROYED"] as const;
export const CLOUD_ANDROID_MODES = ["HUMAN", "AI", "COLLABORATIVE"] as const;
export const CLOUD_ANDROID_ACTIONS = [
  "device.start", "device.stop", "device.restart", "device.delete", "device.lock", "device.unlock",
  "screen.capture", "screen.stream", "app.list", "app.install", "app.uninstall", "app.launch", "app.stop",
  "ui.inspect", "ui.tap", "ui.type", "ui.swipe", "ui.scroll", "ui.back", "ui.home",
  "file.upload", "file.download", "file.list", "device.snapshot", "device.restore", "device.logs", "device.metrics",
] as const;
export const CLOUD_ANDROID_AGENT_PERMISSIONS = [
  "device:view", "device:start", "device:stop", "device:restart", "device:delete",
  "screen:view", "screen:screenshot", "screen:record",
  "ui:tap", "ui:swipe", "ui:type", "ui:navigate",
  "apps:view", "apps:launch", "apps:install", "apps:remove",
  "files:read", "files:write", "files:upload", "files:download",
  "network:internet", "network:restricted",
  "sensitive:send_message", "sensitive:submit_form", "sensitive:purchase", "sensitive:delete_data",
  "sensitive:account_settings", "sensitive:authenticate", "sensitive:financial_action",
] as const;
export const CLOUD_ANDROID_SENSITIVE_ACTIONS = ["NONE", "SEND_MESSAGE", "SUBMIT_FORM", "PURCHASE", "DELETE_DATA", "ACCOUNT_SETTINGS", "AUTHENTICATE", "FINANCIAL_ACTION", "UNKNOWN"] as const;

const AndroidVersion = z.enum(["12", "13", "14", "15"]);
export const CloudAndroidDeviceConfigSchema = z.object({
  name: z.string().trim().min(2).max(100),
  templateId: z.string().cuid().optional(),
  imageId: z.string().cuid().optional(),
  androidVersion: AndroidVersion,
  region: z.string().regex(/^[a-z]{2,12}-[a-z]+-\d$/).max(40),
  cpuCores: z.number().int().min(1).max(32),
  ramMb: z.number().int().min(1024).max(131072),
  storageGb: z.number().int().min(8).max(2048),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default("en-US"),
  timezone: z.string().min(3).max(80).default("UTC"),
  networkPolicy: z.object({
    mode: z.enum(["shared", "dedicated", "organization", "restricted"]).default("restricted"),
    internetAccess: z.boolean().default(false),
    domainAllowlist: z.array(z.string().min(1).max(253)).max(500).default([]),
    domainBlocklist: z.array(z.string().min(1).max(253)).max(500).default([]),
    bandwidthMbps: z.number().int().min(1).max(10000).default(20),
    proxyUrl: z.string().url().optional(),
  }).strict().default({ mode: "restricted", internetAccess: false, domainAllowlist: [], domainBlocklist: [], bandwidthMbps: 20 }),
  securityProfile: z.enum(["standard", "business", "automation", "developer", "testing", "enterprise"]).default("standard"),
  installedApplications: z.array(z.object({ packageName: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/), source: z.enum(["managed_store", "private_store"]) }).strict()).max(100).default([]),
}).strict();
export type CloudAndroidDeviceConfig = z.infer<typeof CloudAndroidDeviceConfigSchema>;

export const CloudAndroidTemplateSchema = CloudAndroidDeviceConfigSchema.omit({ name: true, templateId: true, imageId: true }).extend({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(1000).optional(),
  category: z.enum(["standard", "business", "automation", "ai_agent", "developer", "testing", "enterprise"]),
  imageId: z.string().cuid().optional(),
}).strict();

export const CloudAndroidSessionSchema = z.object({
  mode: z.enum(CLOUD_ANDROID_MODES),
  agentId: z.string().cuid().optional(),
  applicationPackage: z.string().max(255).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.mode === "AI" || value.mode === "COLLABORATIVE") && !value.agentId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agentId"], message: "AI and collaborative sessions require an assigned agent" });
});

export const CloudAndroidUiActionSchema = z.union([
  z.object({ type: z.literal("tap"), elementId: z.string().max(500).optional(), x: z.number().int().nonnegative().optional(), y: z.number().int().nonnegative().optional(), intendedAction: z.string().max(500).optional() }).refine((v) => !!v.elementId || (v.x !== undefined && v.y !== undefined), "elementId or x/y required"),
  z.object({ type: z.literal("type"), elementId: z.string().max(500).optional(), text: z.string().max(20_000), replace: z.boolean().default(false), intendedAction: z.string().max(500).optional() }),
  z.object({ type: z.literal("swipe"), startX: z.number().int().nonnegative(), startY: z.number().int().nonnegative(), endX: z.number().int().nonnegative(), endY: z.number().int().nonnegative(), durationMs: z.number().int().min(50).max(5000).default(300) }),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down", "left", "right"]), amount: z.enum(["small", "medium", "large"]).default("medium") }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("home") }),
]);
export type CloudAndroidUiAction = z.infer<typeof CloudAndroidUiActionSchema>;

export const CloudAndroidAppInstallSchema = z.object({ packageName: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/), source: z.enum(["managed_store", "private_store"]), version: z.string().max(80).optional() }).strict();
export const CloudAndroidAppLaunchSchema = z.object({ packageName: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/) }).strict();
export const CloudAndroidAgentGrantSchema = z.object({
  agentId: z.string().cuid(),
  permissions: z.array(z.enum(CLOUD_ANDROID_AGENT_PERMISSIONS)).min(1).max(CLOUD_ANDROID_AGENT_PERMISSIONS.length),
  sensitiveActions: z.array(z.enum(CLOUD_ANDROID_SENSITIVE_ACTIONS)).max(CLOUD_ANDROID_SENSITIVE_ACTIONS.length).default([]),
  domainAllowlist: z.array(z.string().min(1).max(253)).max(500).default([]),
  expiresAt: z.string().datetime().optional(),
}).strict();

export const CloudAndroidApprovalDecisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(1000).optional() }).strict();
export const CloudAndroidBulkSchema = z.object({ deviceIds: z.array(z.string().cuid()).min(1).max(100) }).strict();

export interface CloudAndroidObservation {
  capturedAt: string;
  screenshot?: { mimeType: "image/png" | "image/jpeg"; dataBase64: string; width: number; height: number; sha256: string };
  elements: Array<{ id: string; role: string; text?: string; contentDescription?: string; bounds?: { left: number; top: number; right: number; bottom: number }; enabled: boolean; clickable: boolean; editable: boolean; sensitive?: boolean }>;
  accessibilityTree: Record<string, unknown>;
  app: { packageName: string | null; activity: string | null };
  window: { title: string | null; focusedElementId: string | null };
  deviceState: Record<string, unknown>;
}

export interface CloudAndroidProviderAction {
  protocol: "windels-cloud-android-provider/v1";
  action: string;
  requestId: string;
  organizationId: string;
  device?: { id: string; providerRef?: string | null };
  session?: { id: string; mode: typeof CLOUD_ANDROID_MODES[number]; controllerType: "HUMAN" | "AGENT"; controllerId: string };
  payload: Record<string, unknown>;
  policy: { permissions: string[]; networkPolicy: Record<string, unknown>; approvalToken?: string };
}

export interface CloudAndroidProviderResult {
  ok: boolean;
  requestId: string;
  operationId: string;
  status: string;
  providerDeviceRef?: string;
  observation?: CloudAndroidObservation;
  metrics?: Record<string, number | string | boolean | null>;
  result?: Record<string, unknown>;
  preparedAction?: { token: string; expiresAt: string; sensitivity: typeof CLOUD_ANDROID_SENSITIVE_ACTIONS[number]; description: string; target?: Record<string, unknown> };
  evidence: Record<string, unknown>;
  error?: { code: string; message: string; retryable?: boolean };
}
