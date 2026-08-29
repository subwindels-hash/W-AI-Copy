/**
 * Session 5–6 — Talk client (Session 122 completion).
 *
 * The method surface is unchanged; the types now come from the shared
 * contract (`@windels/shared/talk`) so the API and the web app compile
 * against one definition. Notable widenings: `TalkChannel.unreadCount` is
 * `number | null` (null = the caller has not joined the channel — never a
 * fabricated 0), and `TalkActionItem.aiGenerated` states that the meeting
 * notetaker extracted the item rather than a person typing it.
 */
import { api } from "./api";
import type {
  TalkActionItem,
  TalkActionItemList,
  TalkChannel,
  TalkChannelList,
  TalkCreateChannelInput,
  TalkCreateMeetingInput,
  TalkMeetingDetail,
  TalkMeetingList,
  TalkMeetingSummary,
  TalkMessage,
  TalkMessageList,
  TalkReactions,
  TalkUpdateChannelInput,
  TalkUpdateMeetingInput,
} from "@windels/shared/talk";

export type {
  TalkActionItem,
  TalkActionItemList,
  TalkChannel,
  TalkChannelList,
  TalkCreateChannelInput,
  TalkCreateMeetingInput,
  TalkMeetingDetail,
  TalkMeetingList,
  TalkMeetingSummary,
  TalkMessage,
  TalkMessageList,
  TalkReactions,
  TalkUpdateChannelInput,
  TalkUpdateMeetingInput,
} from "@windels/shared/talk";

// Backwards-compatible aliases for the Session 5–6 names the rest of the app
// imports.
export type ChannelType = "dm" | "channel";
export type ChannelAccess = "public" | "private";
export type TalkMember = TalkChannel["members"][number];
export type TalkAttachment = NonNullable<TalkMessage["attachments"]>[number];
export type Meeting = TalkMeetingDetail;
export type ActionItem = TalkActionItem;

export const talkApi = {
  listChannels: (params?: { q?: string; type?: "DM" | "CHANNEL"; page?: number; perPage?: number }) =>
    api.get<TalkChannelList>("/talk/channels", params),
  createChannel: (input: TalkCreateChannelInput) => api.post<TalkChannel>("/talk/channels", input),
  getChannel: (id: string) => api.get<TalkChannel>(`/talk/channels/${id}`),
  updateChannel: (id: string, input: TalkUpdateChannelInput) => api.patch<TalkChannel>(`/talk/channels/${id}`, input),
  archiveChannel: (id: string) => api.del<void>(`/talk/channels/${id}`),
  addMembers: (id: string, userIds: string[] = [], agentIds: string[] = []) =>
    api.post<void>(`/talk/channels/${id}/members`, { userIds, agentIds }),
  removeMember: (id: string, memberId: string) => api.del<void>(`/talk/channels/${id}/members/${memberId}`),

  listMessages: (channelId: string, params?: { threadParentId?: string; page?: number; perPage?: number }) =>
    api.get<TalkMessageList>(`/talk/channels/${channelId}/messages`, params),
  sendMessage: (channelId: string, input: { content: string; threadParentId?: string; attachmentIds?: string[] }) =>
    api.post<TalkMessage>(`/talk/channels/${channelId}/messages`, input),
  editMessage: (id: string, content: string) => api.patch<TalkMessage>(`/talk/messages/${id}`, { content }),
  deleteMessage: (id: string) => api.del<void>(`/talk/messages/${id}`),
  toggleReaction: (id: string, emoji: string) =>
    api.post<TalkReactions>(`/talk/messages/${id}/reactions`, { emoji }),

  listMeetings: (params?: { status?: string; channelId?: string; page?: number; perPage?: number }) =>
    api.get<TalkMeetingList>("/talk/meetings", params),
  createMeeting: (input: TalkCreateMeetingInput) => api.post<TalkMeetingSummary>("/talk/meetings", input),
  getMeeting: (id: string) => api.get<TalkMeetingDetail>(`/talk/meetings/${id}`),
  updateMeeting: (id: string, input: TalkUpdateMeetingInput) => api.patch<TalkMeetingSummary>(`/talk/meetings/${id}`, input),
  addTranscript: (id: string, text: string, final = false) =>
    api.post<void>(`/talk/meetings/${id}/transcript`, { text, final }),

  listActionItems: (params?: {
    status?: string;
    meetingId?: string;
    channelId?: string;
    assigneeId?: string;
    mine?: boolean;
    page?: number;
    perPage?: number;
  }) => api.get<TalkActionItemList>("/talk/action-items", params),
  createActionItem: (input: any) => api.post<TalkActionItem>("/talk/action-items", input),
  updateActionItem: (id: string, input: any) => api.patch<TalkActionItem>(`/talk/action-items/${id}`, input),
  deleteActionItem: (id: string) => api.del<void>(`/talk/action-items/${id}`),

  availableAgents: () => api.get<{ id: string; name: string; role: string; emoji: string; color: string; isBuiltIn: boolean }[]>("/talk/available-agents"),

  // File upload helper — returns attachment id
  async uploadAttachment(file: File): Promise<{ id: string; filename: string; mimeType: string; sizeBytes: number }> {
    const form = new FormData();
    form.append("file", file);
    const store = await import("@/store/auth");
    const t = store.useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {};
    if (t) headers.Authorization = `Bearer ${t}`;
    const base = import.meta.env.VITE_API_URL ?? "/api/v1";
    const res = await fetch(`${base}/attachments`, {
      method: "POST",
      headers,
      body: form,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data?.error?.message ?? "Upload failed");
    return data.data;
  },
};
