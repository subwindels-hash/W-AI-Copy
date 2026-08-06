// Session 94 — Social Platform (Enterprise Collaboration Feed).
//
// The master spec's Phase-3 Enterprise Applications list includes Social
// Platform; after Sessions 90–93 it is the last named application still
// missing. This module ships an org-scoped feed: posts with an honest
// lifecycle, comments, a real reactions ledger from which engagement is
// computed per read (never stored as a counter), deterministic hashtag
// extraction, and a deterministic rollup.
//
// Types are prefixed `Sp`. Single source of truth shared by the API service,
// the HTTP routes and the web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const SP_POST_KINDS = ["post", "announcement", "update"] as const;
export type SpPostKind = (typeof SP_POST_KINDS)[number];

export const SP_POST_STATUSES = ["draft", "published", "archived"] as const;
export type SpPostStatus = (typeof SP_POST_STATUSES)[number];

/** Small emoji allowlist — reactions are first-class, not free-form text. */
export const SP_REACTION_EMOJIS = ["👍", "❤️", "🎉", "🚀", "👏", "🤝", "💡", "🔥"] as const;
export type SpReactionEmoji = (typeof SP_REACTION_EMOJIS)[number];

// ─── Records ────────────────────────────────────────────────────────────

export interface SpPost {
  id: string;
  organizationId: string;
  authorId: string | null;
  /** Display name captured at write time — stable attribution. */
  authorName: string;
  content: string;
  hashtags: string[];
  kind: SpPostKind;
  status: SpPostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpComment {
  id: string;
  organizationId: string;
  postId: string;
  authorId: string | null;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface SpReaction {
  id: string;
  organizationId: string;
  postId: string;
  authorId: string;
  emoji: string;
  createdAt: string;
}

export interface SpReactionGroup {
  emoji: string;
  count: number;
}

export interface SpPostDetail extends SpPost {
  comments: SpComment[];
  reactions: SpReactionGroup[];
  reactionsTotal: number;
  commentsCount: number;
}

export interface SpFeedItem {
  post: SpPost;
  reactions: SpReactionGroup[];
  reactionsTotal: number;
  commentsCount: number;
  commentPreview: string | null;
}

export interface SpRollup {
  counts: {
    posts: number;
    publishedPosts: number;
    draftPosts: number;
    archivedPosts: number;
    comments: number;
    reactions: number;
    posters: number;
  };
  topHashtags: Array<{ tag: string; count: number }>;
  topAuthors: Array<{ authorName: string; postCount: number }>;
  recentPosts: SpFeedItem[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const SpPostUpsertSchema = z.object({
  authorName: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  kind: z.enum(SP_POST_KINDS).default("post"),
  status: z.enum(SP_POST_STATUSES).default("published"),
});
export type SpPostUpsertInput = z.infer<typeof SpPostUpsertSchema>;
export type SpPostCreateInput = z.input<typeof SpPostUpsertSchema>;

export const SpCommentCreateSchema = z.object({
  authorName: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
});
export type SpCommentCreateInput = z.infer<typeof SpCommentCreateSchema>;

export const SpReactionToggleSchema = z.object({
  emoji: z.enum(SP_REACTION_EMOJIS),
});
export type SpReactionToggleInput = z.infer<typeof SpReactionToggleSchema>;
