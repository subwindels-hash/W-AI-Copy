import { api } from "./api";
import type {
  SpAnnouncement,
  SpAnnouncementPatch,
  SpApiCredentialPublic,
  SpApiUpsertInput,
  SpBrand,
  SpBrandPatch,
  SpChatHealth,
  SpChatReply,
  SpContactMap,
  SpContactMapPatch,
  SpControlSummary,
  SpCreateAdminInput,
  SpMediaPublic,
  SpPageContent,
  SpPageContentInput,
  SpPageSeo,
  SpPublicSite,
  SpReview,
  SpSeoSettings,
  SpSmtpConfigPublic,
  SpSmtpSaveInput,
  SpSmtpTestResult,
} from "@windels/shared/sitePlatform";

export type {
  SpAnnouncement, SpChatReply, SpSeoSettings, SpSmtpConfigPublic, SpPageSeo,
  SpBrand, SpPageContent, SpReview, SpContactMap, SpApiCredentialPublic, SpPublicSite, SpControlSummary,
};

export const siteApi = {
  announcement: () => api<SpAnnouncement | null>("/site/announcement", { skipAuth: true }),
  seo: (path = "/") => api<Record<string, string | null>>("/site/seo", { skipAuth: true, params: { path } }),
  publicSite: () => api<SpPublicSite>("/site/public", { skipAuth: true }),
  chatHealth: () => api<SpChatHealth>("/site/chat/health", { skipAuth: true }),
  startChat: (message: string) => api<SpChatReply>("/site/chat", { method: "POST", json: { message }, skipAuth: true }),
  chatMessage: (id: string, message: string) =>
    api<SpChatReply>(`/site/chat/${id}/message`, { method: "POST", json: { message }, skipAuth: true }),
  streamChat: async (
    message: string,
    conversationId: string | undefined,
    onEvent: (event: string, data: any) => void,
  ): Promise<SpChatReply> => {
    const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
    const res = await fetch(`${BASE}/site/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversationId }),
    });
    if (!res.ok || !res.body) {
      throw new Error(res.statusText || "Chat stream unavailable");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let doneReply: SpChatReply | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        try {
          const data = JSON.parse(dataLines.join("\n"));
          onEvent(event, data);
          if (event === "done" && data?.reply) doneReply = data.reply as SpChatReply;
        } catch { /* ignore a truncated frame; next read will complete it */ }
      }
    }
    if (!doneReply) throw new Error("Chat stream ended without a reply");
    return doneReply;
  },
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
  brand: () => api<SpBrand>("/site-admin/brand"),
  saveBrand: (patch: SpBrandPatch) => api<SpBrand>("/site-admin/brand", { method: "PATCH", json: patch }),
  images: () => api<Record<string, string>>("/site-admin/images"),
  saveImage: (slot: string, url: string) => api<Record<string, string>>(`/site-admin/images/${encodeURIComponent(slot)}`, { method: "PUT", json: { url } }),
  uploadMedia: (input: { slot: string; mime: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" | "image/gif"; dataBase64: string; filename?: string }) =>
    api<SpMediaPublic>("/site-admin/media", { method: "POST", json: input }),
  pageContent: () => api<SpPageContent[]>("/site-admin/pages"),
  savePageContent: (page: SpPageContentInput) => api<SpPageContent>("/site-admin/pages", { method: "PUT", json: page }),
  reviews: () => api<SpReview[]>("/site-admin/reviews"),
  saveReviews: (reviews: Array<Omit<SpReview, "illustrative"> & { illustrative?: boolean }>) =>
    api<SpReview[]>("/site-admin/reviews", { method: "PUT", json: { reviews } }),
  map: () => api<SpContactMap>("/site-admin/map"),
  saveMap: (patch: SpContactMapPatch) => api<SpContactMap>("/site-admin/map", { method: "PATCH", json: patch }),
  apis: () => api<SpApiCredentialPublic[]>("/site-admin/apis"),
  saveApi: (input: SpApiUpsertInput) => api<SpApiCredentialPublic[]>("/site-admin/apis", { method: "PUT", json: input }),
  removeApi: (id: string) => api<SpApiCredentialPublic[]>(`/site-admin/apis/${encodeURIComponent(id)}`, { method: "DELETE" }),
  summary: () => api<SpControlSummary>("/site-admin/summary"),
};
