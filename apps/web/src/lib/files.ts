/**
 * Files — API client for the real attachment store (Session 4/105).
 * Metadata is org-scoped and normalized by the shared Att contracts; bytes are
 * streamed by the API and never embedded in list responses.
 */
import { api, ApiError } from "./api";
import type { AttAttachment, AttAttachmentList } from "@windels/shared/attachments";

export type FileRecord = AttAttachment;
export type FileList = AttAttachmentList;
export type { AttAttachment, AttAttachmentList } from "@windels/shared/attachments";

export const filesApi = {
  list: (opts: { page?: number; perPage?: number; q?: string } = {}) =>
    api.get<AttAttachmentList>("/attachments", { page: 1, perPage: 50, ...opts }),
  metadata: (id: string) => api.get<AttAttachment>(`/attachments/${id}/meta`),
  downloadUrl: (id: string) => `/attachments/${id}`,
  /** Multipart upload (FormData — browser-managed boundary). */
  upload: async (file: File): Promise<AttAttachment> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`${base}/attachments`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new ApiError(body?.error?.code ?? "UPLOAD_FAILED", body?.error?.message ?? `Upload failed (HTTP ${res.status})`, res.status);
    return body.data as AttAttachment;
  },
  remove: (id: string) => api.del<{}>(`/attachments/${id}`),
};

export function formatBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
