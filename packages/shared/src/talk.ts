/**
 * Session 5–6 — Windels Talk: channels, DMs, messages, reactions, meetings
 * and action items (completed by Session 122).
 *
 * This is the module's first shared contract: the API declared its Zod
 * schemas inside the two service files and the web client redeclared every
 * shape by hand, so the sides could drift without a compiler noticing.
 * Session 122 moves the schemas here (the services re-export them under
 * their old names, so every route keeps compiling unchanged), fixes the
 * honesty of the channel unread count, and surfaces AI-generated action
 * items.
 *
 * Honesty rules encoded here:
 *   - `unreadCount` is `number | null` — null when the caller has no
 *     membership row in the channel (e.g. a public channel they have not
 *     joined), never a fabricated 0;
 *   - `aiGenerated` on an action item states that the item was extracted by
 *     the meeting notetaker (heuristic or model) rather than typed by a
 *     person.
 */

import { z } from "zod";

/* ── Limits ─────────────────────────────────────────────────────────────── */

export const TALK_MAX_CHANNEL_NAME = 80;
export const TALK_MAX_CHANNEL_TOPIC = 300;
export const TALK_MAX_MESSAGE_LENGTH = 10000;
export const TALK_MAX_REACTION_LENGTH = 16;
export const TALK_MAX_MEETING_TITLE = 200;
export const TALK_MAX_MEETING_DESCRIPTION = 2000;
export const TALK_MAX_ACTION_TITLE = 200;
export const TALK_MAX_ACTION_DESCRIPTION = 2000;
export const TALK_MAX_TRANSCRIPT_LENGTH = 20000;

/* ── Channel types ──────────────────────────────────────────────────────── */

export type TalkChannelType = "dm" | "channel";
export type TalkChannelAccess = "public" | "private";

export interface TalkPeer {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface TalkMemberUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  email: string;
}

export interface TalkMemberAgent {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface TalkMember {
  id: string;
  userId: string | null;
  agentId: string | null;
  isMuted: boolean;
  isPinned: boolean;
  lastReadAt?: string | null;
  user: TalkMemberUser | null;
  agent: TalkMemberAgent | null;
}

export interface TalkChannel {
  id: string;
  type: TalkChannelType;
  access: TalkChannelAccess;
  name: string;
  displayName: string;
  topic: string | null;
  workspaceId: string | null;
  isArchived: boolean;
  lastMessageAt: string;
  membersCount: number;
  messagesCount: number;
  /** Messages after the caller's `lastReadAt` (excluding their own), or
   *  `null` when the caller has no membership row in this channel. */
  unreadCount: number | null;
  peer: TalkPeer | null;
  members: TalkMember[];
  createdAt: string;
  updatedAt: string;
}

/* ── Messages ───────────────────────────────────────────────────────────── */

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
  user: TalkMemberUser | null;
  agent: TalkMemberAgent | null;
  createdAt: string;
  updatedAt: string;
}

/* ── Meetings ───────────────────────────────────────────────────────────── */

export type TalkMeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface TalkMeetingSummary {
  id: string;
  title: string;
  description: string | null;
  status: TalkMeetingStatus;
  scheduledStart: string | null;
  startedAt: string | null;
  endedAt: string | null;
  channelId: string | null;
  channelName: string | null;
  notetakerAgentId: string | null;
  notetakerAgent: TalkMemberAgent | null;
  notetakerStatus: string;
  createdBy: { id: string; displayName: string };
  participantsCount: number;
  actionItemsCount: number;
  createdAt: string;
}

export interface TalkMeetingParticipant {
  id: string;
  role: string;
  isNotetaker: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  user: { id: string; displayName: string; avatarUrl?: string | null } | null;
  agent: TalkMemberAgent | null;
}

export interface TalkActionItem {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  completedAt: string | null;
  /** True when the meeting notetaker extracted this item from a transcript
   *  (heuristic or model) rather than a person typing it. */
  aiGenerated: boolean;
  assignee: { id: string; displayName: string; avatarUrl?: string | null } | null;
  agentAssignee: { id: string; name: string; emoji: string } | null;
  createdBy: { id: string; displayName: string };
  meeting: { id: string; title: string } | null;
  channel: { id: string; name: string } | null;
  createdAt: string;
}

export interface TalkMeetingDetail {
  id: string;
  title: string;
  description: string | null;
  status: TalkMeetingStatus;
  scheduledStart: string | null;
  startedAt: string | null;
  endedAt: string | null;
  channelId: string | null;
  channelName: string | null;
  notetakerAgentId: string | null;
  notetakerAgent: TalkMemberAgent | null;
  notetakerStatus: string;
  transcript: string | null;
  summary: string | null;
  decisions: string[] | null;
  createdBy: { id: string; displayName: string } | null;
  participants: TalkMeetingParticipant[];
  actionItems: TalkActionItem[];
  createdAt: string;
  updatedAt: string;
}

/* ── Pagination ─────────────────────────────────────────────────────────── */

export interface TalkPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface TalkChannelList {
  items: TalkChannel[];
  pagination: TalkPagination;
}

export interface TalkMessageList {
  items: TalkMessage[];
  pagination: TalkPagination;
}

export interface TalkMeetingList {
  items: TalkMeetingSummary[];
  pagination: TalkPagination;
}

export interface TalkActionItemList {
  items: TalkActionItem[];
  pagination: TalkPagination;
}

/* ── Zod schemas (moved from the service files; API + web share them) ───── */

export const TalkCreateChannelSchema = z.object({
  type: z.enum(["DM", "CHANNEL"]),
  name: z.string().min(1).max(TALK_MAX_CHANNEL_NAME).optional(),
  topic: z.string().max(TALK_MAX_CHANNEL_TOPIC).optional(),
  access: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  workspaceId: z.string().cuid().optional(),
  peerUserId: z.string().cuid().optional(), // DM target
  memberUserIds: z.array(z.string().cuid()).optional(),
  memberAgentIds: z.array(z.string().cuid()).optional(),
});

export const TalkUpdateChannelSchema = z.object({
  name: z.string().min(1).max(TALK_MAX_CHANNEL_NAME).optional(),
  topic: z.string().max(TALK_MAX_CHANNEL_TOPIC).optional(),
  access: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  isArchived: z.boolean().optional(),
});

export const TalkCreateMessageSchema = z.object({
  content: z.string().min(1).max(TALK_MAX_MESSAGE_LENGTH),
  threadParentId: z.string().cuid().optional(),
  attachmentIds: z.array(z.string().cuid()).optional(),
});

export const TalkUpdateMessageSchema = z.object({
  content: z.string().min(1).max(TALK_MAX_MESSAGE_LENGTH),
});

export const TalkAddReactionSchema = z.object({
  emoji: z.string().min(1).max(TALK_MAX_REACTION_LENGTH),
});

export const TalkCreateMeetingSchema = z.object({
  title: z.string().min(1).max(TALK_MAX_MEETING_TITLE),
  description: z.string().max(TALK_MAX_MEETING_DESCRIPTION).optional(),
  channelId: z.string().cuid().optional(),
  scheduledStart: z.string().datetime().optional(),
  notetakerAgentId: z.string().cuid().optional(),
  participantIds: z.array(z.string().cuid()).optional(),
  agentParticipantIds: z.array(z.string().cuid()).optional(),
});

export const TalkUpdateMeetingSchema = z.object({
  title: z.string().min(1).max(TALK_MAX_MEETING_TITLE).optional(),
  description: z.string().max(TALK_MAX_MEETING_DESCRIPTION).optional(),
  status: z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]).optional(),
  scheduledStart: z.string().datetime().optional(),
  notetakerAgentId: z.string().cuid().nullable().optional(),
});

export const TalkCreateActionItemSchema = z.object({
  title: z.string().min(1).max(TALK_MAX_ACTION_TITLE),
  description: z.string().max(TALK_MAX_ACTION_DESCRIPTION).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().cuid().optional(),
  agentAssigneeId: z.string().cuid().optional(),
  channelId: z.string().cuid().optional(),
  meetingId: z.string().cuid().optional(),
  sourceMessageId: z.string().cuid().optional(),
});

export const TalkUpdateActionItemSchema = z.object({
  title: z.string().min(1).max(TALK_MAX_ACTION_TITLE).optional(),
  description: z.string().max(TALK_MAX_ACTION_DESCRIPTION).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  agentAssigneeId: z.string().cuid().nullable().optional(),
});

export const TalkAddTranscriptSchema = z.object({
  text: z.string().min(1).max(TALK_MAX_TRANSCRIPT_LENGTH),
  final: z.boolean().default(false),
});

export const TalkChannelMembersSchema = z.object({
  userIds: z.array(z.string().cuid()).optional(),
  agentIds: z.array(z.string().cuid()).optional(),
});

/* ── Meeting status lifecycle (Session 122) ─────────────────────────────── */

/** Allowed status transitions for meetings. Re-sending the current status is
 *  always allowed (idempotent); ENDED and CANCELLED are terminal. */
export const TALK_MEETING_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ["SCHEDULED", "LIVE", "ENDED", "CANCELLED"],
  LIVE: ["LIVE", "ENDED"],
  ENDED: ["ENDED"],
  CANCELLED: ["CANCELLED"],
};

// `z.input` (not `z.infer`) for caller-facing input types: schemas with
// `.default()` fields (channel access, action-item priority, transcript
// final) accept those fields as optional on input, which is what callers and
// the pre-default routes actually pass.
export type TalkCreateChannelInput = z.input<typeof TalkCreateChannelSchema>;
export type TalkUpdateChannelInput = z.input<typeof TalkUpdateChannelSchema>;
export type TalkCreateMessageInput = z.input<typeof TalkCreateMessageSchema>;
export type TalkUpdateMessageInput = z.input<typeof TalkUpdateMessageSchema>;
export type TalkAddReactionInput = z.input<typeof TalkAddReactionSchema>;
export type TalkCreateMeetingInput = z.input<typeof TalkCreateMeetingSchema>;
export type TalkUpdateMeetingInput = z.input<typeof TalkUpdateMeetingSchema>;
export type TalkCreateActionItemInput = z.input<typeof TalkCreateActionItemSchema>;
export type TalkUpdateActionItemInput = z.input<typeof TalkUpdateActionItemSchema>;
export type TalkAddTranscriptInput = z.input<typeof TalkAddTranscriptSchema>;
