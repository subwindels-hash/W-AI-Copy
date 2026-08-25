import { api } from "./api";
import type {
  SpAnnouncement,
  SpAnnouncementPatch,
  SpChatHealth,
  SpChatReply,
  SpCreateAdminInput,
  SpPageSeo,
  SpSeoSettings,
  SpSmtpConfigPublic,
  SpSmtpSaveInput,
  SpSmtpTestResult,
} from "@windels/shared/sitePlatform";

export type { SpAnnouncement, SpChatReply, SpSeoSettings, SpSmtpConfigPublic, SpPageSeo };

export const siteApi = {
  announcement: () => api<SpAnnouncement | null>("/site/announcement", { skipAuth: true }),
  seo: (path = "/") => api<Record<string, string | null>>("/site/seo", { skipAuth: true, params: { path } }),
  chatHealth: () => api<SpChatHealth>("/site/chat/health", { skipAuth: true }),
  startChat: (message: string) => api<SpChatReply>("/site/chat", { method: "POST", json: { message }, skipAuth: true }),
  chatMessage: (id: string, message: string) =>
    api<SpChatReply>(`/site/chat/${id}/message`, { method: "POST", json: { message }, skipAuth: true }),
  clearChat: (id: string) => api<{ cleared: boolean }>(`/site/chat/${id}`, { method: "DELETE", skipAuth: true }),
};

export const siteAdminApi = {
  announcement: () => api<SpAnnouncement>("/site-admin/announcement"),
  saveAnnouncement: (patch: SpAnnouncementPatch) => api<SpAnnouncement>("/site-admin/announcement", { method: "PATCH", json: patch }),
  seo: () => api<SpSeoSettings>("/site-admin/seo"),
  saveSeo: (patch: Partial<SpSeoSettings>) => api<SpSeoSettings>("/site-admin/seo", { method: "PATCH", json: patch }),
  pages: () => api<SpPageSeo[]>("/site-admin/seo/pages"),
  savePage: (page: SpPageSeo) => api<SpPageSeo>("/site-admin/seo/pages", { method: "PUT", json: page }),
  smtp: () => api<SpSmtpConfigPublic>("/site-admin/smtp"),
  saveSmtp: (input: SpSmtpSaveInput) => api<SpSmtpConfigPublic>("/site-admin/smtp", { method: "PATCH", json: input }),
  testSmtp: (to: string) => api<SpSmtpTestResult>("/site-admin/smtp/test", { method: "POST", json: { to } }),
  createAdmin: (input: SpCreateAdminInput) => api<{ id: string; email: string; role: string }>("/site-admin/admins", { method: "POST", json: input }),
};
