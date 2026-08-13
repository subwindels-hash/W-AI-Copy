/** WhatsApp channel client (Phase 1 §12). Mirrors /api/v1/channels/whatsapp. */
import { api } from "./api";
import type {
  ConfirmWhatsAppLinkInput,
  CreateWhatsAppChannelInput,
  SendWhatsAppMessageInput,
  StartWhatsAppLinkInput,
  UpdateWhatsAppChannelInput,
  WhatsAppChannel,
  WhatsAppChannelSettings,
  WhatsAppChannelStats,
  WhatsAppConversationSummary,
  WhatsAppDashboard,
  WhatsAppSettingsInput,
} from "@windels/shared/whatsapp";

export type {
  WhatsAppChannel,
  WhatsAppChannelSettings,
  WhatsAppChannelStats,
  WhatsAppConversationSummary,
  WhatsAppDashboard,
  WhatsAppSettingsInput,
} from "@windels/shared/whatsapp";

/** Stats carry two queue fields the dashboard route adds on top of the base type. */
export type WhatsAppDashboardData = Omit<WhatsAppDashboard, "stats"> & {
  stats: WhatsAppChannelStats & { dlqDepth?: number; orgHourlyUsage?: number };
};

const BASE = "/channels/whatsapp";

export async function getDashboard() {
  return api<WhatsAppDashboardData>(BASE);
}

export async function listChannels() {
  return api<WhatsAppChannel[]>(`${BASE}/channels`);
}

export async function createChannel(input: CreateWhatsAppChannelInput) {
  return api<WhatsAppChannel>(`${BASE}/channels`, { method: "POST", json: input });
}

export async function updateChannel(id: string, input: UpdateWhatsAppChannelInput) {
  return api<WhatsAppChannel>(`${BASE}/channels/${id}`, { method: "PATCH", json: input });
}

export async function updateSettings(id: string, input: WhatsAppSettingsInput) {
  return api<WhatsAppChannel>(`${BASE}/channels/${id}/settings`, { method: "PATCH", json: input });
}

/** Probes the Cloud API for real — it fails loudly when credentials are absent. */
export async function reconnect(id: string) {
  return api<WhatsAppChannel>(`${BASE}/channels/${id}/reconnect`, { method: "POST" });
}

export async function disconnect(id: string) {
  return api<WhatsAppChannel>(`${BASE}/channels/${id}/disconnect`, { method: "POST" });
}

/**
 * The list route returns a view, not the raw row: the contact is joined in and
 * the phone number is masked for non-admins. `WhatsAppConversationSummary`
 * (the DB-shaped shared type) does not describe that payload, so the view has
 * its own type here.
 */
export interface WhatsAppConversationListItem {
  id: string;
  status: string;
  lastMessageAt: string;
  messageCount: number;
  windelsConversationId: string | null;
  contact: {
    id: string;
    displayName: string | null;
    phoneNumber: string | null;
    linked: boolean;
  };
}

export async function listConversations(params?: { limit?: number }) {
  return api<WhatsAppConversationListItem[]>(`${BASE}/conversations`, { method: "GET", params });
}

export async function sendMessage(input: SendWhatsAppMessageInput) {
  return api<{ messageId: string | null; recordId: string | null }>(`${BASE}/send`, {
    method: "POST",
    json: input,
  });
}

export async function startLink(input: StartWhatsAppLinkInput) {
  return api<{ expiresInSeconds: number }>(`${BASE}/link/start`, { method: "POST", json: input });
}

export async function confirmLink(input: ConfirmWhatsAppLinkInput) {
  return api<{ contactId: string }>(`${BASE}/link/confirm`, { method: "POST", json: input });
}

export async function unlink(contactId: string) {
  return api<{ unlinked: boolean }>(`${BASE}/link/${contactId}`, { method: "DELETE" });
}

/* ── Phase 2: status, messages, jobs, connectivity test ─────────────── */

export interface WhatsAppStatus {
  connected: boolean;
  enabled: boolean;
  status: string;
  webhookStatus: string;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  displayPhoneNumber?: string | null;
  apiVersion?: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
  lastErrorAt?: string | null;
  queueDepth: number;
  dlqDepth: number;
  pendingJobs: number;
  runningJobs: number;
  activeSessions: number;
  configurationRequired: string[] | null;
}

export interface WhatsAppMessageRow {
  id: string;
  conversationId: string;
  whatsappMessageId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  /** Null for non-admin callers — message bodies are personal data. */
  text: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  windelsMessageId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  contact: { displayName: string | null; phoneNumber: string | null };
}

export interface WhatsAppJobRow {
  id: string;
  kind: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  conversationId: string;
  requestText: string | null;
  resultText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  workflowId: string | null;
  workflowRunId: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WhatsAppTestResult {
  passed: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  sent: { ok: boolean; messageId: string | null; error: string | null } | null;
  phoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
}

export async function getStatus() {
  return api<WhatsAppStatus>(`${BASE}/status`);
}

export async function listMessages(params?: {
  limit?: number;
  conversationId?: string;
  direction?: "INBOUND" | "OUTBOUND";
  status?: string;
  cursor?: string;
}) {
  return api<WhatsAppMessageRow[]>(`${BASE}/messages`, { method: "GET", params });
}

export async function listJobs(params?: { limit?: number; status?: string }) {
  return api<WhatsAppJobRow[]>(`${BASE}/jobs`, { method: "GET", params });
}

/**
 * Runs a REAL connectivity check against the Meta Graph API, optionally
 * sending a real message. Nothing here is simulated.
 */
export async function testChannel(input?: { to?: string; text?: string }) {
  return api<WhatsAppTestResult>(`${BASE}/test`, { method: "POST", json: input ?? {} });
}
