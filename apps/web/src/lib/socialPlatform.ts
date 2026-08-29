/** Session 94 — Social Platform client. */
import { api } from "./api";

export type SpPostKind = "post" | "announcement" | "update";
export type SpPostStatus = "draft" | "published" | "archived";

export interface SpPost {
  id: string;
  organizationId: string;
  authorId: string | null;
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

export interface SpPostCreateInput {
  authorName: string;
  content: string;
  kind?: SpPostKind;
  status?: SpPostStatus;
}

export const socialPlatformApi = {
  rollup: () => api<SpRollup>("/social-platform/dashboard/rollup"),
  feed: (params?: { hashtag?: string; kind?: SpPostKind; q?: string }) =>
    api<SpFeedItem[]>("/social-platform/feed", { params }),
  topHashtags: () => api<Array<{ tag: string; count: number }>>("/social-platform/hashtags"),

  listPosts: (params?: { status?: SpPostStatus; kind?: SpPostKind; hashtag?: string; q?: string }) =>
    api<SpPost[]>("/social-platform/posts", { params }),
  createPost: (input: SpPostCreateInput) => api<SpPost>("/social-platform/posts", { method: "POST", json: input }),
  getPost: (id: string) => api<SpPostDetail>(`/social-platform/posts/${id}`),
  updatePost: (id: string, patch: Partial<SpPostCreateInput>) =>
    api<SpPost>(`/social-platform/posts/${id}`, { method: "PATCH", json: patch }),
  deletePost: (id: string) => api<{ deleted: boolean; id: string }>(`/social-platform/posts/${id}`, { method: "DELETE" }),
  publishPost: (id: string) => api<SpPost>(`/social-platform/posts/${id}/publish`, { method: "POST" }),
  archivePost: (id: string) => api<SpPost>(`/social-platform/posts/${id}/archive`, { method: "POST" }),

  listComments: (postId: string) => api<SpComment[]>(`/social-platform/posts/${postId}/comments`),
  createComment: (postId: string, input: { authorName: string; content: string }) =>
    api<SpComment>(`/social-platform/posts/${postId}/comments`, { method: "POST", json: input }),
  deleteComment: (id: string) => api<{ deleted: boolean; id: string }>(`/social-platform/comments/${id}`, { method: "DELETE" }),

  toggleReaction: (postId: string, emoji: string) =>
    api<{ added: boolean; reactions: SpReactionGroup[] }>(`/social-platform/posts/${postId}/reactions`, { method: "POST", json: { emoji } }),
  postReactions: (postId: string) => api<SpReactionGroup[]>(`/social-platform/posts/${postId}/reactions`),
};
