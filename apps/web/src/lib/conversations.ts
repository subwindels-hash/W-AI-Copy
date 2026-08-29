/**
 * Sessions 2/3/4 + 112 — Conversations / Messaging client.
 *
 * `lib/chat.ts` remains the thread-and-stream client used by ChatPage. This
 * module adds the Session 112 operations surface — participants, read state,
 * measured statistics, message search, edit/redact, transcript export, the
 * extractive digest and soft-delete recovery — and it imports its types from
 * `@windels/shared/conversations` rather than re-declaring them, so the client
 * and the API can no longer drift.
 */
import { api } from "./api";
import type {
  ConvAddParticipantInput,
  ConvDeletedConversation,
  ConvDigest,
  ConvEditMessageInput,
  ConvMessage,
  ConvMessageRole,
  ConvParticipant,
  ConvReadState,
  ConvSearchResult,
  ConvStats,
  ConvTranscript,
  ConvUnreadSummary,
} from "@windels/shared/conversations";

export type {
  ConvDeletedConversation,
  ConvDigest,
  ConvDigestTerm,
  ConvMessage,
  ConvMessageRole,
  ConvMessageStatus,
  ConvParticipant,
  ConvReadBasis,
  ConvReadState,
  ConvSearchHit,
  ConvSearchResult,
  ConvStats,
  ConvTranscript,
  ConvTranscriptEntry,
  ConvUnreadItem,
  ConvUnreadSummary,
} from "@windels/shared/conversations";

export interface ConvDeletedPage {
  items: ConvDeletedConversation[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export const conversationsApi = {
  /* Collection-level */
  search: (query: { q: string; conversationId?: string; role?: ConvMessageRole; page?: number; perPage?: number }) =>
    api<ConvSearchResult>("/conversations/search", { params: query }),
  unread: (limit = 50) => api<ConvUnreadSummary>("/conversations/unread", { params: { limit } }),
  deleted: (page = 1, perPage = 20) =>
    api<ConvDeletedPage>("/conversations/deleted", { params: { page, perPage } }),

  /* Participants */
  participants: (id: string) => api<ConvParticipant[]>(`/conversations/${id}/participants`),
  addParticipant: (id: string, input: ConvAddParticipantInput) =>
    api<ConvParticipant>(`/conversations/${id}/participants`, { method: "POST", json: input }),
  removeParticipant: (id: string, participantId: string) =>
    api<{ removed: true; id: string }>(`/conversations/${id}/participants/${participantId}`, { method: "DELETE" }),

  /* Read state */
  readState: (id: string) => api<ConvReadState>(`/conversations/${id}/read-state`),
  markRead: (id: string, at?: string) =>
    api<ConvReadState>(`/conversations/${id}/read`, { method: "POST", json: at ? { at } : {} }),

  /* Measured statistics */
  stats: (id: string) => api<ConvStats>(`/conversations/${id}/stats`),

  /* Transcript, digest, restore */
  transcript: (id: string, format: "json" | "markdown" = "json", includeSystem = true) =>
    api<ConvTranscript>(`/conversations/${id}/transcript`, {
      params: { format, includeSystem: includeSystem ? "true" : "false" },
    }),
  digest: (id: string, maxKeywords = 8) =>
    api<ConvDigest>(`/conversations/${id}/digest`, { params: { maxKeywords } }),
  restore: (id: string) =>
    api<{ id: string; title: string; restoredAt: string }>(`/conversations/${id}/restore`, { method: "POST" }),

  /* Single-message operations */
  message: (id: string, messageId: string) => api<ConvMessage>(`/conversations/${id}/messages/${messageId}`),
  editMessage: (id: string, messageId: string, input: ConvEditMessageInput) =>
    api<ConvMessage>(`/conversations/${id}/messages/${messageId}`, { method: "PATCH", json: input }),
  redactMessage: (id: string, messageId: string, reason?: string) =>
    api<ConvMessage>(`/conversations/${id}/messages/${messageId}`, {
      method: "DELETE",
      json: reason ? { reason } : {},
    }),
};
