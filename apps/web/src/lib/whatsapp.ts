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

export async function listConversations(params?: { limit?: number }) {
  return api<WhatsAppConversationSummary[]>(`${BASE}/conversations`, { method: "GET", params });
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
