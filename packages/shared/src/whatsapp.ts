/**
 * WhatsApp Channel — shared contracts.
 *
 * WhatsApp is a CHANNEL into the existing WINDELS AI OS, not a separate
 * product. These types describe the channel surface only; conversations,
 * messages, agents, auth and billing all reuse the existing WINDELS models.
 */
import { z } from "zod";

/** Message kinds the WhatsApp Cloud API can deliver. */
export const WHATSAPP_MESSAGE_TYPES = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "location",
  "interactive",
  "button",
  "reaction",
  "sticker",
  "contacts",
  "order",
  "system",
  "unknown",
] as const;
export type WhatsAppMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number];

export type WhatsAppDirection = "inbound" | "outbound";

/** Mirrors WhatsApp delivery states plus our local pre-send states. */
export type WhatsAppMessageStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type WhatsAppChannelStatus = "disconnected" | "connected" | "error" | "disabled";
export type WhatsAppWebhookStatus = "unverified" | "verified" | "failing";
export type WhatsAppContactStatus = "active" | "blocked" | "opted_out";
export type WhatsAppConversationStatus = "open" | "closed" | "escalated";

/** Webhook event processing lifecycle — drives idempotency and retries. */
export type WhatsAppEventProcessingStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "duplicate"
  | "ignored";

/** How the channel replies: AI, humans only, or off. */
export type WhatsAppResponseMode = "ai" | "human" | "off";

export interface WhatsAppChannelSettings {
  /** AI, human-only, or no automatic replies. */
  responseMode: WhatsAppResponseMode;
  /** Agent ids permitted to serve this channel. Empty = any org agent. */
  allowedAgentIds: string[];
  /** IANA timezone for workingHours. */
  timezone: string;
  /** Outside these hours the channel auto-responds instead of invoking AI. */
  workingHours: { enabled: boolean; startMinute: number; endMinute: number; days: number[] };
  autoResponseText: string | null;
  /** Days to retain WhatsApp message rows. 0 = keep indefinitely. */
  conversationRetentionDays: number;
  /**
   * Whether conversation content may be written to the WINDELS Memory Fabric.
   * Default false — Phase 1 §9 forbids saving every message as memory.
   */
  memoryWriteEnabled: boolean;
  mediaEnabled: boolean;
  voiceEnabled: boolean;
  humanEscalationEnabled: boolean;
  /** Per-contact inbound message cap per hour. 0 = unlimited. */
  perContactHourlyLimit: number;
  /** Org-wide inbound message cap per hour. 0 = unlimited. */
  orgHourlyLimit: number;
}

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppChannelSettings = {
  responseMode: "ai",
  allowedAgentIds: [],
  timezone: "UTC",
  workingHours: { enabled: false, startMinute: 9 * 60, endMinute: 17 * 60, days: [1, 2, 3, 4, 5] },
  autoResponseText: null,
  conversationRetentionDays: 90,
  memoryWriteEnabled: false,
  mediaEnabled: true,
  voiceEnabled: false,
  humanEscalationEnabled: true,
  perContactHourlyLimit: 60,
  orgHourlyLimit: 1000,
};

export interface WhatsAppChannel {
  id: string;
  organizationId: string;
  name: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string | null;
  status: WhatsAppChannelStatus;
  webhookStatus: WhatsAppWebhookStatus;
  enabled: boolean;
  apiVersion: string;
  /** True when an access token is stored. The token itself is never returned. */
  hasAccessToken: boolean;
  /** True when an app secret is stored — required for signature verification. */
  hasAppSecret: boolean;
  lastWebhookAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  settings: WhatsAppChannelSettings;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppContact {
  id: string;
  channelId: string;
  whatsappUserId: string;
  /** E.164. Treated as personal data — masked in list views for non-admins. */
  phoneNumber: string;
  displayName: string | null;
  linkedUserId: string | null;
  status: WhatsAppContactStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConversationSummary {
  id: string;
  channelId: string;
  contactId: string;
  /** FK into the existing WINDELS Conversation table. */
  conversationId: string | null;
  status: WhatsAppConversationStatus;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppMessageRecord {
  id: string;
  conversationId: string;
  whatsappMessageId: string | null;
  direction: WhatsAppDirection;
  messageType: WhatsAppMessageType;
  text: string | null;
  mediaId: string | null;
  status: WhatsAppMessageStatus;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppChannelStats {
  messagesReceived: number;
  messagesSent: number;
  messagesFailed: number;
  activeConversations: number;
  connectedUsers: number;
  contacts: number;
  aiResponses: number;
  mediaMessages: number;
  queueDepth: number;
  lastWebhookAt: string | null;
}

export interface WhatsAppDashboard {
  channel: WhatsAppChannel | null;
  stats: WhatsAppChannelStats;
  recentErrors: Array<{ at: string; code: string | null; message: string }>;
  /**
   * Null when fully configured. Otherwise the human-readable list of
   * configuration still required — never a pretend "connected" state.
   */
  configurationRequired: string[] | null;
}

/* ── Input contracts ─────────────────────────────────────────────────── */

const phoneNumberId = z.string().min(1).max(64).regex(/^[0-9]+$/, "phoneNumberId must be numeric");

export const CreateWhatsAppChannelSchema = z.object({
  name: z.string().min(1).max(120),
  phoneNumberId,
  businessAccountId: z.string().min(1).max(64),
  displayPhoneNumber: z.string().max(32).optional(),
  apiVersion: z.string().regex(/^v\d+\.\d+$/, "apiVersion must look like v21.0").optional(),
  accessToken: z.string().min(20).max(1000).optional(),
  appSecret: z.string().min(8).max(512).optional(),
  verifyToken: z.string().min(8).max(512).optional(),
});
export type CreateWhatsAppChannelInput = z.infer<typeof CreateWhatsAppChannelSchema>;

export const UpdateWhatsAppChannelSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  apiVersion: z.string().regex(/^v\d+\.\d+$/).optional(),
  displayPhoneNumber: z.string().max(32).optional(),
  accessToken: z.string().min(20).max(1000).optional(),
  appSecret: z.string().min(8).max(512).optional(),
  verifyToken: z.string().min(8).max(512).optional(),
});
export type UpdateWhatsAppChannelInput = z.infer<typeof UpdateWhatsAppChannelSchema>;

export const WhatsAppSettingsSchema = z.object({
  responseMode: z.enum(["ai", "human", "off"]).optional(),
  allowedAgentIds: z.array(z.string().min(1)).max(50).optional(),
  timezone: z.string().min(1).max(64).optional(),
  workingHours: z
    .object({
      enabled: z.boolean(),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(0).max(1439),
      days: z.array(z.number().int().min(0).max(6)).max(7),
    })
    .optional(),
  autoResponseText: z.string().max(1000).nullable().optional(),
  conversationRetentionDays: z.number().int().min(0).max(3650).optional(),
  memoryWriteEnabled: z.boolean().optional(),
  mediaEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  humanEscalationEnabled: z.boolean().optional(),
  perContactHourlyLimit: z.number().int().min(0).max(100000).optional(),
  orgHourlyLimit: z.number().int().min(0).max(1000000).optional(),
});
export type WhatsAppSettingsInput = z.infer<typeof WhatsAppSettingsSchema>;

export const SendWhatsAppMessageSchema = z.object({
  to: z.string().min(5).max(32).regex(/^\+?[0-9]+$/, "to must be a phone number"),
  type: z.enum(["text", "image", "audio", "video", "document"]).default("text"),
  text: z.string().min(1).max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  mediaId: z.string().min(1).max(128).optional(),
  caption: z.string().max(1024).optional(),
  filename: z.string().max(255).optional(),
});
export type SendWhatsAppMessageInput = z.infer<typeof SendWhatsAppMessageSchema>;

/** Identity linking: a WhatsApp number is only bound after code verification. */
export const StartWhatsAppLinkSchema = z.object({
  phoneNumber: z.string().min(5).max(32).regex(/^\+?[0-9]+$/),
});
export type StartWhatsAppLinkInput = z.infer<typeof StartWhatsAppLinkSchema>;

export const ConfirmWhatsAppLinkSchema = z.object({
  phoneNumber: z.string().min(5).max(32).regex(/^\+?[0-9]+$/),
  code: z.string().min(4).max(12),
});
export type ConfirmWhatsAppLinkInput = z.infer<typeof ConfirmWhatsAppLinkSchema>;

/** Message shown when the channel exists but credentials are absent. */
export const WHATSAPP_CONFIGURATION_REQUIRED_MESSAGE =
  "WhatsApp channel is not fully configured. Set WHATSAPP_ACCESS_TOKEN, " +
  "WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN (or store them on the channel) " +
  "to connect to the WhatsApp Cloud API.";
