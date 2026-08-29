import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";
import { encryptJson, decryptJson, maskSecret } from "../security/encryption.js";
import { EventBus } from "./eventBus.js";

export const INTEGRATION_TYPES = [
  { type: "slack", name: "Slack", description: "Send Talk notifications and receive slash commands from Slack", icon: "💬" },
  { type: "discord", name: "Discord", description: "Post workflow updates to Discord channels", icon: "🎮" },
  { type: "email", name: "Email (SMTP)", description: "Send emails via SMTP for approvals and alerts", icon: "✉" },
  { type: "github", name: "GitHub", description: "Open issues, comment on PRs, trigger workflows on pushes", icon: "🐙" },
  { type: "linear", name: "Linear", description: "Sync tasks with Linear issues", icon: "📐" },
  { type: "jira", name: "Jira", description: "Sync tasks with Jira tickets", icon: "🧩" },
  { type: "notion", name: "Notion", description: "Publish pages and read databases", icon: "📝" },
  { type: "google_drive", name: "Google Drive", description: "Attach and index files from Drive", icon: "📁" },
  { type: "s3", name: "S3-compatible storage", description: "Store attachments and backups to any S3 bucket", icon: "🗄" },
  { type: "webhook", name: "Custom Webhook", description: "Generic outgoing webhook integration", icon: "🔗" },
];

export const CreateIntegrationSchema = z.object({
  type: z.string(),
  name: z.string().min(1).max(100),
  config: z.record(z.any()).default({}),
  credentials: z.record(z.any()).default({}),
});

export const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.any()).optional(),
  credentials: z.record(z.any()).optional(),
  status: z.enum(["connected", "disconnected", "error"]).optional(),
});

const SENSITIVE_KEY_PATTERN = /(secret|token|key|password|api[_-]?key|private)/i;

function encryptForStorage(obj: Record<string, any>): any {
  // Wrap the whole credentials object; store as tagged JSON string.
  return "enc.v1|" + JSON.stringify(encryptJson(obj));
}
function decryptFromStorage(field: any): Record<string, any> | null {
  if (!field) return null;
  if (typeof field === "string") {
    if (field.startsWith("enc.v1|")) {
      try { return decryptJson(JSON.parse(field.slice("enc.v1|".length))) ?? {}; } catch { return {}; }
    }
    // Try parsing legacy JSON plaintext.
    try { return JSON.parse(field); } catch { return {}; }
  }
  if (typeof field === "object") {
    // Legacy plain JSON object — return as-is.
    return field as any;
  }
  return {};
}

function redact(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(k) && typeof v === "string") out[k] = v ? maskSecret(v) : "";
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}

export async function listIntegrations(userId: string) {
  const ctx = await resolveUserContext(userId);
  const installed = await prisma.integration.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { type: "asc" } });
  const safe = installed.map((i: any) => {
    const creds = decryptFromStorage(i.credentials) ?? {};
    return { ...i, credentials: creds && Object.keys(creds).length ? { connected: true, ...redact(creds) } : { connected: false } };
  });
  return { available: INTEGRATION_TYPES, installed: safe };
}

export async function connectIntegration(userId: string, input: z.infer<typeof CreateIntegrationSchema>) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.integration.findFirst({ where: { organizationId: ctx.organizationId, type: input.type } });
  if (existing) throw AppError.conflict(`${input.type} is already connected. Update it instead.`);
  const encryptedCreds = encryptForStorage({ ...input.credentials, _tokenId: randomBytes(8).toString("hex") });
  const i = await prisma.integration.create({
    data: {
      organizationId: ctx.organizationId,
      type: input.type,
      name: input.name,
      config: input.config,
      credentials: encryptedCreds as any,
      status: "connected",
    },
  });
  await EventBus.emit("integration.connected", { integrationId: i.id, type: i.type, organizationId: ctx.organizationId });
  return { ...i, credentials: { connected: true } };
}

export async function updateIntegration(userId: string, id: string, input: z.infer<typeof UpdateIntegrationSchema>) {
  const ctx = await resolveUserContext(userId);
  const i = await prisma.integration.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!i) throw AppError.notFound("Integration not found");
  const data: any = { ...input, lastSyncAt: new Date() };
  if (input.credentials) {
    const existing = decryptFromStorage(i.credentials) ?? {};
    const merged = { ...existing, ...input.credentials };
    data.credentials = encryptForStorage(merged) as any;
  }
  const updated = await prisma.integration.update({ where: { id }, data });
  return { ...updated, credentials: { connected: true } };
}

export async function disconnectIntegration(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const i = await prisma.integration.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!i) throw AppError.notFound("Integration not found");
  await prisma.integration.delete({ where: { id } });
}

/** Helper used by other services to read decrypted credentials at runtime. */
export async function getCredentials(integrationId: string): Promise<Record<string, any> | null> {
  const i = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!i) return null;
  return decryptFromStorage(i.credentials);
}
