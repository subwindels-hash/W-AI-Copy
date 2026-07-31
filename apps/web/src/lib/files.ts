/**
 * Files — API client for the real attachment store (Session 4 module,
 * completed in this workspace). The /app/files page renders this data.
 */
import { api, ApiError } from "./api";

export interface FileRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  previewText?: string | null;
  conversationId?: string | null;
  talkMessageId?: string | null;
  createdAt: string;
}

export interface FileList {
  items: FileRecord[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export const filesApi = {
  list: (opts: { page?: number; perPage?: number; q?: string } = {}) =>
    api.get<FileList>("/attachments", { page: 1, perPage: 50, ...opts }),
  downloadUrl: (id: string) => `/attachments/${id}`,
  /** Multipart upload (FormData — browser-managed boundary). */
  upload: async (file: File): Promise<FileRecord> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`${base}/attachments`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      throw new ApiError(body?.error?.code ?? "UPLOAD_FAILED", body?.error?.message ?? `Upload failed (HTTP ${res.status})`, res.status);
    }
    return body.data as FileRecord;
  },
  remove: (id: string) => api.del<{}>(`/attachments/${id}`),
};

export function formatBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
