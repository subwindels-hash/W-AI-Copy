/**
 * WhatsApp channel registry.
 *
 * Owns channel CRUD, credential storage and configuration resolution. Secrets
 * live either in the environment (single-tenant deployments) or AES-256-GCM
 * encrypted on the channel row (multi-tenant), reusing src/security/encryption.
 * They are NEVER returned to a client — the API exposes only `hasAccessToken`
 * style booleans.
 */
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { encryptJson, decryptJson, isEncryptedBlob } from "../../security/encryption.js";
import {
  DEFAULT_WHATSAPP_SETTINGS,
  type WhatsAppChannel as WhatsAppChannelDTO,
  type WhatsAppChannelSettings,
  type CreateWhatsAppChannelInput,
  type UpdateWhatsAppChannelInput,
  type WhatsAppSettingsInput,
} from "@windels/shared";
import type { WhatsAppCredentials } from "./whatsappClient.js";

/** Stores a secret as an encrypted blob, or null to leave it unset. */
function seal(value: string | undefined | null): any {
  if (value == null || value === "") return null;
  return encryptJson({ v: value }) as any;
}

/** Reverses `seal`. Tolerates legacy plaintext so a partial rollout can't lock anyone out. */
function unseal(blob: unknown): string | null {
  if (blob == null) return null;
  try {
    if (isEncryptedBlob(blob)) {
      const out = decryptJson<{ v: string }>(blob as any);
      return out?.v ?? null;
    }
    if (typeof blob === "string") return blob;
    if (typeof blob === "object" && typeof (blob as any).v === "string") return (blob as any).v;
  } catch {
    return null;
  }
  return null;
}

function mergeSettings(raw: unknown): WhatsAppChannelSettings {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Partial<WhatsAppChannelSettings>;
  return {
    ...DEFAULT_WHATSAPP_SETTINGS,
    ...stored,
    workingHours: { ...DEFAULT_WHATSAPP_SETTINGS.workingHours, ...(stored.workingHours ?? {}) },
    allowedAgentIds: Array.isArray(stored.allowedAgentIds) ? stored.allowedAgentIds : [],
  };
}

/** Row → DTO. Strips every secret. */
export function toChannelDTO(row: any): WhatsAppChannelDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    displayPhoneNumber: row.displayPhoneNumber ?? null,
    status: String(row.status).toLowerCase() as WhatsAppChannelDTO["status"],
    webhookStatus: String(row.webhookStatus).toLowerCase() as WhatsAppChannelDTO["webhookStatus"],
    enabled: row.enabled,
    apiVersion: row.apiVersion,
    hasAccessToken: Boolean(unseal(row.accessTokenEnc) ?? env.WHATSAPP_ACCESS_TOKEN),
    hasAppSecret: Boolean(unseal(row.appSecretEnc) ?? env.WHATSAPP_APP_SECRET),
    lastWebhookAt: row.lastWebhookAt ? new Date(row.lastWebhookAt).toISOString() : null,
    lastErrorAt: row.lastErrorAt ? new Date(row.lastErrorAt).toISOString() : null,
    lastError: row.lastError ?? null,
    settings: mergeSettings(row.settings),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export interface ResolvedChannelConfig {
  channelId: string;
  organizationId: string;
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  enabled: boolean;
  settings: WhatsAppChannelSettings;
  /** Non-empty when the channel cannot actually talk to the Cloud API. */
  missing: string[];
}

/**
 * Resolves effective credentials for a channel: row-level encrypted values win,
 * falling back to process env. Returns the list of what is still missing rather
 * than throwing, so callers can surface an honest configuration state.
 */
export function resolveConfig(row: any): ResolvedChannelConfig {
  const accessToken = unseal(row.accessTokenEnc) ?? env.WHATSAPP_ACCESS_TOKEN ?? null;
  const appSecret = unseal(row.appSecretEnc) ?? env.WHATSAPP_APP_SECRET ?? null;
  const verifyToken = unseal(row.verifyTokenEnc) ?? env.WHATSAPP_VERIFY_TOKEN ?? null;

  const missing: string[] = [];
  if (!accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!appSecret) missing.push("WHATSAPP_APP_SECRET");
  if (!verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");

  return {
    channelId: row.id,
    organizationId: row.organizationId,
    apiVersion: row.apiVersion ?? env.WHATSAPP_API_VERSION,
    phoneNumberId: row.phoneNumberId,
    accessToken,
    appSecret,
    verifyToken,
    enabled: row.enabled,
    settings: mergeSettings(row.settings),
    missing,
  };
}

/** Narrows a resolved config to send-capable credentials, or null. */
export function toCredentials(cfg: ResolvedChannelConfig): WhatsAppCredentials | null {
  if (!cfg.accessToken) return null;
  return { apiVersion: cfg.apiVersion, phoneNumberId: cfg.phoneNumberId, accessToken: cfg.accessToken };
}

export const WhatsAppChannelService = {
  /** Lists an org's channels. Org scoping is mandatory — never list globally. */
  async list(organizationId: string): Promise<WhatsAppChannelDTO[]> {
    const rows = await prisma.whatsAppChannel.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toChannelDTO);
  },

  /** Returns the org's primary (most recent enabled, else most recent) channel. */
  async primary(organizationId: string): Promise<any | null> {
    const enabled = await prisma.whatsAppChannel.findFirst({
      where: { organizationId, deletedAt: null, enabled: true },
      orderBy: { createdAt: "desc" },
    });
    if (enabled) return enabled;
    return prisma.whatsAppChannel.findFirst({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Fetches a channel scoped to an org — cross-org reads return null. */
  async getScoped(organizationId: string, channelId: string): Promise<any | null> {
    return prisma.whatsAppChannel.findFirst({
      where: { id: channelId, organizationId, deletedAt: null },
    });
  },

  /** Inbound routing: resolve the channel that owns a phone_number_id. */
  async findByPhoneNumberId(phoneNumberId: string): Promise<any | null> {
    return prisma.whatsAppChannel.findFirst({ where: { phoneNumberId, deletedAt: null } });
  },

  /**
   * Resolves the tenant for account-level notifications.
   *
   * WABA-scoped events (account_update, template status, quality signals) carry
   * no `metadata.phone_number_id` — only the entry id, which is the WhatsApp
   * Business Account id. Without this lookup those events could not be
   * attributed to a channel and were dropped before the signature check.
   * Deliberately global, like findByPhoneNumberId: the inbound edge has no
   * caller identity to scope by, and the identifier is issued by Meta.
   */
  async findByBusinessAccountId(businessAccountId: string): Promise<any | null> {
    return prisma.whatsAppChannel.findFirst({ where: { businessAccountId, deletedAt: null } });
  },

  async create(organizationId: string, input: CreateWhatsAppChannelInput): Promise<WhatsAppChannelDTO> {
    const row = await prisma.whatsAppChannel.create({
      data: {
        organizationId,
        name: input.name,
        phoneNumberId: input.phoneNumberId,
        businessAccountId: input.businessAccountId,
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        apiVersion: input.apiVersion ?? env.WHATSAPP_API_VERSION,
        accessTokenEnc: seal(input.accessToken),
        appSecretEnc: seal(input.appSecret),
        verifyTokenEnc: seal(input.verifyToken),
        appId: env.WHATSAPP_APP_ID ?? null,
        webhookUrl: env.WHATSAPP_WEBHOOK_URL ?? null,
        settings: DEFAULT_WHATSAPP_SETTINGS as any,
        enabled: false,
      },
    });
    return toChannelDTO(row);
  },

  async update(organizationId: string, channelId: string, input: UpdateWhatsAppChannelInput): Promise<WhatsAppChannelDTO | null> {
    const existing = await this.getScoped(organizationId, channelId);
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
      if (!input.enabled) data.status = "DISABLED";
    }
    if (input.apiVersion !== undefined) data.apiVersion = input.apiVersion;
    if (input.displayPhoneNumber !== undefined) data.displayPhoneNumber = input.displayPhoneNumber;
    if (input.accessToken !== undefined) data.accessTokenEnc = seal(input.accessToken);
    if (input.appSecret !== undefined) data.appSecretEnc = seal(input.appSecret);
    if (input.verifyToken !== undefined) data.verifyTokenEnc = seal(input.verifyToken);

    const row = await prisma.whatsAppChannel.update({ where: { id: channelId }, data });
    return toChannelDTO(row);
  },

  async updateSettings(organizationId: string, channelId: string, patch: WhatsAppSettingsInput): Promise<WhatsAppChannelDTO | null> {
    const existing = await this.getScoped(organizationId, channelId);
    if (!existing) return null;
    const merged: WhatsAppChannelSettings = {
      ...mergeSettings(existing.settings),
      ...patch,
      workingHours: patch.workingHours ?? mergeSettings(existing.settings).workingHours,
    } as WhatsAppChannelSettings;
    const row = await prisma.whatsAppChannel.update({
      where: { id: channelId },
      data: { settings: merged as any },
    });
    return toChannelDTO(row);
  },

  /**
   * Soft-disconnect: clears credentials and disables the channel but preserves
   * conversation history. Never a hard delete — history stays auditable.
   */
  async disconnect(organizationId: string, channelId: string): Promise<WhatsAppChannelDTO | null> {
    const existing = await this.getScoped(organizationId, channelId);
    if (!existing) return null;
    const row = await prisma.whatsAppChannel.update({
      where: { id: channelId },
      data: {
        enabled: false,
        status: "DISCONNECTED",
        webhookStatus: "UNVERIFIED",
        accessTokenEnc: null,
        appSecretEnc: null,
        verifyTokenEnc: null,
      },
    });
    return toChannelDTO(row);
  },

  /** Marks the GET subscription handshake as completed. */
  async markWebhookVerified(channelId: string): Promise<void> {
    await prisma.whatsAppChannel.update({
      where: { id: channelId },
      data: { webhookStatus: "VERIFIED", lastWebhookAt: new Date() },
    }).catch(() => { /* best-effort */ });
  },

  async recordWebhookSeen(channelId: string, verified = true): Promise<void> {
    await prisma.whatsAppChannel.update({
      where: { id: channelId },
      data: {
        lastWebhookAt: new Date(),
        webhookStatus: verified ? "VERIFIED" : "FAILING",
      },
    }).catch(() => { /* channel may have been removed mid-flight */ });
  },

  async recordError(channelId: string, message: string): Promise<void> {
    await prisma.whatsAppChannel.update({
      where: { id: channelId },
      data: { lastError: message.slice(0, 500), lastErrorAt: new Date(), status: "ERROR" },
    }).catch(() => { /* best-effort */ });
  },

  async recordConnected(channelId: string, displayPhoneNumber: string | null): Promise<void> {
    await prisma.whatsAppChannel.update({
      where: { id: channelId },
      data: {
        status: "CONNECTED",
        lastError: null,
        lastErrorAt: null,
        ...(displayPhoneNumber ? { displayPhoneNumber } : {}),
      },
    }).catch(() => { /* best-effort */ });
  },
};
