import { api } from "./api";

export type ChannelType = "dm" | "channel";
export type ChannelAccess = "public" | "private";

export interface TalkMember {
  id: string;
  userId: string | null;
  agentId: string | null;
  isMuted: boolean;
  isPinned: boolean;
  lastReadAt?: string | null;
  user: { id: string; displayName: string; avatarUrl?: string | null; email: string } | null;
  agent: { id: string; name: string; emoji: string; color: string } | null;
}

export interface TalkChannel {
  id: string;
  type: ChannelType;
  access: ChannelAccess;
  name: string;
  displayName: string;
  topic?: string | null;
  workspaceId?: string | null;
  isArchived: boolean;
  lastMessageAt: string;
  membersCount: number;
  messagesCount: number;
  unreadCount: number;
  peer?: { id: string; displayName: string; avatarUrl?: string | null } | null;
  members: TalkMember[];
  createdAt: string;
  updatedAt: string;
}

export interface TalkReactions {
  [emoji: string]: string[];
}

export interface TalkAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TalkMessage {
  id: string;
  channelId: string;
  type: string;
  content: string;
  userId: string | null;
  agentId: string | null;
  threadParentId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  reactions: TalkReactions;
  meetingId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: TalkAttachment[];
  user: { id: string; displayName: string; avatarUrl?: string | null; email: string } | null;
  agent: { id: string; name: string; emoji: string; color: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduledStart?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  notetakerAgentId?: string | null;
  notetakerAgent: { id: string; name: string; emoji: string; color: string } | null;
  notetakerStatus: string;
  transcript?: string | null;
  summary?: string | null;
  decisions?: string[] | null;
  createdBy: { id: string; displayName: string } | null;
  participantsCount: number;
  actionItemsCount: number;
  createdAt: string;
  participants?: any[];
  actionItems?: any[];
}

export interface ActionItem {
  id: string;
  title: string;
  description?: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string | null;
  completedAt?: string | null;
  assignee: { id: string; displayName: string; avatarUrl?: string | null } | null;
  agentAssignee: { id: string; name: string; emoji: string } | null;
  createdBy: { id: string; displayName: string };
  meeting?: { id: string; title: string } | null;
  channel?: { id: string; name: string } | null;
  createdAt: string;
}

export const talkApi = {
  listChannels: (params?: { q?: string; type?: "DM" | "CHANNEL"; page?: number; perPage?: number }) =>
    api.get<{ items: TalkChannel[]; pagination: any }>("/talk/channels", params),
  createChannel: (input: {
    type: "DM" | "CHANNEL";
    name?: string;
    topic?: string;
    access?: "PUBLIC" | "PRIVATE";
    peerUserId?: string;
    memberUserIds?: string[];
    memberAgentIds?: string[];
  }) => api.post<TalkChannel>("/talk/channels", input),
  getChannel: (id: string) => api.get<TalkChannel>(`/talk/channels/${id}`),
  updateChannel: (id: string, input: any) => api.patch<TalkChannel>(`/talk/channels/${id}`, input),
  archiveChannel: (id: string) => api.del<void>(`/talk/channels/${id}`),
  addMembers: (id: string, userIds: string[] = [], agentIds: string[] = []) =>
    api.post<void>(`/talk/channels/${id}/members`, { userIds, agentIds }),
  removeMember: (id: string, memberId: string) => api.del<void>(`/talk/channels/${id}/members/${memberId}`),

  listMessages: (channelId: string, params?: { threadParentId?: string; page?: number; perPage?: number }) =>
    api.get<{ items: TalkMessage[]; pagination: any }>(`/talk/channels/${channelId}/messages`, params),
  sendMessage: (channelId: string, input: { content: string; threadParentId?: string; attachmentIds?: string[] }) =>
    api.post<TalkMessage>(`/talk/channels/${channelId}/messages`, input),
  editMessage: (id: string, content: string) => api.patch<TalkMessage>(`/talk/messages/${id}`, { content }),
  deleteMessage: (id: string) => api.del<void>(`/talk/messages/${id}`),
  toggleReaction: (id: string, emoji: string) =>
    api.post<TalkReactions>(`/talk/messages/${id}/reactions`, { emoji }),

  listMeetings: (params?: { status?: string; channelId?: string; page?: number; perPage?: number }) =>
    api.get<{ items: Meeting[]; pagination: any }>("/talk/meetings", params),
  createMeeting: (input: {
    title: string;
    description?: string;
    channelId?: string;
    scheduledStart?: string;
    notetakerAgentId?: string;
    participantIds?: string[];
    agentParticipantIds?: string[];
  }) => api.post<Meeting>("/talk/meetings", input),
  getMeeting: (id: string) => api.get<Meeting>(`/talk/meetings/${id}`),
  updateMeeting: (id: string, input: any) => api.patch<Meeting>(`/talk/meetings/${id}`, input),
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
  }) => api.get<{ items: ActionItem[]; pagination: any }>("/talk/action-items", params),
  createActionItem: (input: any) => api.post<ActionItem>("/talk/action-items", input),
  updateActionItem: (id: string, input: any) => api.patch<ActionItem>(`/talk/action-items/${id}`, input),
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
