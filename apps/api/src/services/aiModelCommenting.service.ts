/**
 * Module 153: AI Model Commenting Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive commenting capabilities for AI models including
 * threaded comments, replies, notifications, and moderation.
 */

import { randomUUID } from 'crypto';

export interface Comment {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion?: string;
  parentId?: string;
  userId: string;
  userName: string;
  content: string;
  status: CommentStatus;
  reactions: CommentReaction[];
  replies: Comment[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type CommentStatus = 'active' | 'resolved' | 'deleted' | 'hidden';

export interface CommentReaction {
  userId: string;
  userName: string;
  emoji: string;
  timestamp: string;
}

export interface CommentThread {
  id: string;
  rootComment: Comment;
  totalReplies: number;
  lastActivity: string;
}

export interface CommentNotification {
  id: string;
  commentId: string;
  type: 'new_comment' | 'reply' | 'mention' | 'reaction';
  userId: string;
  timestamp: string;
  read: boolean;
}

const comments = new Map<string, Comment>();
const commentThreads = new Map<string, CommentThread[]>();
const commentNotifications = new Map<string, CommentNotification[]>();

export function createComment(params: {
  organizationId: string;
  modelId: string;
  modelVersion?: string;
  parentId?: string;
  userId: string;
  userName: string;
  content: string;
  metadata?: Record<string, any>;
}): Comment {
  const now = new Date().toISOString();
  const comment: Comment = {
    id: randomUUID(),
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    parentId: params.parentId,
    userId: params.userId,
    userName: params.userName,
    content: params.content,
    status: 'active',
    reactions: [],
    replies: [],
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  };
  comments.set(comment.id, comment);

  // Add to parent's replies if applicable
  if (params.parentId) {
    const parent = comments.get(params.parentId);
    if (parent) {
      parent.replies.push(comment);
      parent.updatedAt = now;
    }
  }

  // Update or create thread
  const modelKey = `${params.organizationId}:${params.modelId}`;
  const threads = commentThreads.get(modelKey) || [];
  
  if (!params.parentId) {
    // Root comment - create new thread
    threads.push({
      id: randomUUID(),
      rootComment: comment,
      totalReplies: 0,
      lastActivity: now,
    });
  } else {
    // Reply - update thread
    const thread = threads.find(t => t.rootComment.id === params.parentId || 
      t.rootComment.replies.some(r => r.id === params.parentId));
    if (thread) {
      thread.totalReplies++;
      thread.lastActivity = now;
    }
  }
  
  commentThreads.set(modelKey, threads);
  return comment;
}

export function getComment(id: string): Comment | undefined {
  return comments.get(id);
}

export function replyToComment(
  commentId: string,
  userId: string,
  userName: string,
  content: string
): Comment {
  const parent = comments.get(commentId);
  if (!parent) throw new Error(`Comment ${commentId} not found`);

  return createComment({
    organizationId: parent.organizationId,
    modelId: parent.modelId,
    modelVersion: parent.modelVersion,
    parentId: commentId,
    userId,
    userName,
    content,
  });
}

export function resolveComment(commentId: string): Comment {
  const comment = comments.get(commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);
  comment.status = 'resolved';
  comment.updatedAt = new Date().toISOString();
  return comment;
}

export function deleteComment(commentId: string): Comment {
  const comment = comments.get(commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);
  comment.status = 'deleted';
  comment.updatedAt = new Date().toISOString();
  return comment;
}

export function addReaction(commentId: string, userId: string, userName: string, emoji: string): CommentReaction {
  const comment = comments.get(commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);

  const reaction: CommentReaction = {
    userId,
    userName,
    emoji,
    timestamp: new Date().toISOString(),
  };

  comment.reactions.push(reaction);
  comment.updatedAt = new Date().toISOString();
  return reaction;
}

export function removeReaction(commentId: string, userId: string, emoji: string): void {
  const comment = comments.get(commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);

  comment.reactions = comment.reactions.filter(
    r => !(r.userId === userId && r.emoji === emoji)
  );
  comment.updatedAt = new Date().toISOString();
}

export function getCommentThread(
  organizationId: string,
  modelId: string,
  filters?: { status?: CommentStatus; limit?: number }
): CommentThread[] {
  const modelKey = `${organizationId}:${modelId}`;
  let threads = commentThreads.get(modelKey) || [];

  if (filters?.status) {
    threads = threads.filter(t => t.rootComment.status === filters.status);
  }

  threads = threads.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  if (filters?.limit) {
    threads = threads.slice(0, filters.limit);
  }

  return threads;
}

export function getCommentReplies(commentId: string): Comment[] {
  const comment = comments.get(commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);
  return comment.replies.filter(r => r.status === 'active');
}

export function getCommentStats(organizationId: string, modelId: string) {
  const modelKey = `${organizationId}:${modelId}`;
  const threads = commentThreads.get(modelKey) || [];
  
  const totalComments = threads.reduce((sum, t) => sum + 1 + t.totalReplies, 0);
  const activeComments = threads.filter(t => t.rootComment.status === 'active').length;
  const resolvedComments = threads.filter(t => t.rootComment.status === 'resolved').length;

  return {
    totalComments,
    activeComments,
    resolvedComments,
    totalThreads: threads.length,
  };
}
