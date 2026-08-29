/**
 * Conversation share-link client.
 *
 * Wraps the conversation-management share endpoints (create, list, update,
 * disable/enable, revoke, access log) plus the public link resolver. Types
 * come from `@windels/shared/conversations` so the client and API cannot drift.
 */
import { api, apiRaw } from "./api";
import type {
  ConversationShare,
  ConversationShareAccessRecord,
  ConvCreateShareInput,
  ConvSharedView,
  ConvUpdateShareInput,
} from "@windels/shared/conversations";

export type {
  ConversationShare,
  ConversationShareAccessRecord,
  ConvSharedView,
} from "@windels/shared/conversations";

export const shareApi = {
  create: (conversationId: string, input: ConvCreateShareInput) =>
    api<ConversationShare>(`/conversations/${conversationId}/share`, { method: "POST", json: input }),
  list: (conversationId: string) =>
    api<ConversationShare[]>(`/conversations/${conversationId}/share`),
  update: (conversationId: string, shareId: string, input: ConvUpdateShareInput) =>
    api<ConversationShare>(`/conversations/${conversationId}/share/${shareId}`, { method: "PATCH", json: input }),
  enable: (conversationId: string, shareId: string) =>
    api<ConversationShare>(`/conversations/${conversationId}/share/${shareId}/enable`, { method: "POST" }),
  disable: (conversationId: string, shareId: string) =>
    api<ConversationShare>(`/conversations/${conversationId}/share/${shareId}/disable`, { method: "POST" }),
  revoke: (conversationId: string, shareId: string) =>
    api<{ deleted: true; id: string }>(`/conversations/${conversationId}/share/${shareId}`, { method: "DELETE" }),
  accessLog: (conversationId: string, shareId: string) =>
    api<ConversationShareAccessRecord[]>(`/conversations/${conversationId}/share/${shareId}/access`),
};

/**
 * Resolve a share link. This endpoint works without authentication for
 * `anyone_with_link` shares, so it bypasses the auth-injecting client. Returns
 * `null` when the token cannot be resolved (client callers decide how to show
 * the error — the raw error carries the reason).
 */
export async function resolveSharedView(token: string, password?: string): Promise<ConvSharedView> {
  const params: Record<string, string> = {};
  if (password) params.password = password;
  const { data } = await apiRaw<ConvSharedView>(`/share/${token}`, {
    params,
    skipAuth: true,
  });
  return data;
}
