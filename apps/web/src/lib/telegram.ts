/** Telegram channel management API client. */
import { api } from "./api";

export interface TelegramChannel {
  id: string;
  name: string;
  botUsername: string | null;
  telegramBotId: string | null;
  status: string;
  webhookStatus: string;
  enabled: boolean;
  configured: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
}
export interface TelegramStats {
  channels: number; connectedUsers: number; activeChats: number;
  messages24h: number; failed24h: number; events24h: number;
}
export interface TelegramConnection {
  id: string; telegramUsername: string | null; displayName: string | null;
  status: string; linkedAt: string | null; lastActivityAt: string;
}
export interface LinkToken { token: string; expiresInSeconds: number; botUsername: string | null; deepLink: string; }

export const telegramApi = {
  channels: () => api.get<TelegramChannel[]>("/channels/telegram/channels"),
  setup: (body: { botToken: string; webhookBaseUrl: string; name?: string; settings?: Record<string, unknown> }) =>
    api.post<TelegramChannel>("/channels/telegram/channels", body),
  disconnect: (id: string) => api.delete<{ ok: boolean }>(`/channels/telegram/channels/${id}`),
  setEnabled: (id: string, enabled: boolean) => api.post(`/channels/telegram/channels/${id}/enabled`, { enabled }),
  updateSettings: (id: string, settings: Record<string, unknown>) =>
    api.patch(`/channels/telegram/channels/${id}/settings`, settings),
  rotateWebhook: (id: string, webhookBaseUrl: string) =>
    api.post(`/channels/telegram/channels/${id}/rotate-webhook`, { webhookBaseUrl }),
  stats: () => api.get<TelegramStats>("/channels/telegram/stats"),
  linkToken: (channelId?: string) => api.post<LinkToken>("/channels/telegram/link-token", { channelId }),
  connections: () => api.get<TelegramConnection[]>("/channels/telegram/connections"),
  unlink: (id: string) => api.delete(`/channels/telegram/connections/${id}`),
};
