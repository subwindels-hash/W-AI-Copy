/**
 * Module 110: AI Model Team Collaboration Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides team collaboration capabilities for AI model development including
 * workspaces, collaborative editing, comments, reviews, activity tracking,
 * and real-time collaboration features.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: WorkspaceType;
  status: WorkspaceStatus;
  members: WorkspaceMember[];
  models: string[];
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type WorkspaceType = 'project' | 'team' | 'personal' | 'shared';

export type WorkspaceStatus = 'active' | 'archived' | 'deleted';

export interface WorkspaceMember {
  userId: string;
  userName: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
  lastActiveAt?: string;
  permissions: Permission[];
}

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';

export interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'share' | 'admin')[];
}

export interface WorkspaceSettings {
  visibility: 'private' | 'organization' | 'public';
  allowExternalMembers: boolean;
  requireApprovalForModels: boolean;
  defaultMemberRole: WorkspaceRole;
  notificationPreferences: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  slack: boolean;
  inApp: boolean;
  events: string[];
}

export interface Comment {
  id: string;
  workspaceId: string;
  modelId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  content: string;
  type: CommentType;
  status: CommentStatus;
  mentions: string[];
  reactions: Reaction[];
  attachments: Attachment[];
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CommentType = 'general' | 'review' | 'question' | 'suggestion' | 'issue';

export type CommentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Reaction {
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Review {
  id: string;
  workspaceId: string;
  modelId: string;
  modelVersion: string;
  reviewerId: string;
  reviewerName: string;
  status: ReviewStatus;
  checklist: ReviewChecklistItem[];
  comments: string[];
  approval: 'approved' | 'changes_requested' | 'pending';
  submittedAt: string;
  completedAt?: string;
}

export type ReviewStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface ReviewChecklistItem {
  id: string;
  category: string;
  description: string;
  checked: boolean;
  notes?: string;
  checkedBy?: string;
  checkedAt?: string;
}

export interface Activity {
  id: string;
  workspaceId: string;
  modelId?: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  description: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export type ActivityAction =
  | 'model_created'
  | 'model_updated'
  | 'model_deleted'
  | 'model_shared'
  | 'comment_added'
  | 'comment_resolved'
  | 'review_started'
  | 'review_completed'
  | 'member_added'
  | 'member_removed'
  | 'workspace_created'
  | 'workspace_updated';

export interface RealTimeSession {
  id: string;
  workspaceId: string;
  modelId: string;
  participants: SessionParticipant[];
  cursors: CursorPosition[];
  locks: ResourceLock[];
  startedAt: string;
  lastActivityAt: string;
}

export interface SessionParticipant {
  userId: string;
  userName: string;
  joinedAt: string;
  isActive: boolean;
  color: string;
}

export interface CursorPosition {
  userId: string;
  userName: string;
  position: { line: number; column: number };
  selection?: { start: { line: number; column: number }; end: { line: number; column: number } };
  updatedAt: string;
}

export interface ResourceLock {
  resourceType: 'model' | 'config' | 'dataset' | 'notebook';
  resourceId: string;
  lockedBy: string;
  lockedAt: string;
  expiresAt: string;
}

export interface Notification {
  id: string;
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

export type NotificationType =
  | 'mention'
  | 'comment'
  | 'review_request'
  | 'review_completed'
  | 'model_shared'
  | 'member_joined'
  | 'model_updated';

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const workspaces = new Map<string, Workspace>();
const comments = new Map<string, Comment[]>();
const reviews = new Map<string, Review[]>();
const activities = new Map<string, Activity[]>();
const realTimeSessions = new Map<string, RealTimeSession>();
const notifications = new Map<string, Notification[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createWorkspace(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: WorkspaceType;
  settings?: Partial<WorkspaceSettings>;
  createdBy: string;
}): Workspace {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultSettings: WorkspaceSettings = {
    visibility: 'private',
    allowExternalMembers: false,
    requireApprovalForModels: false,
    defaultMemberRole: 'viewer',
    notificationPreferences: {
      email: true,
      slack: false,
      inApp: true,
      events: ['mention', 'review_request', 'model_shared'],
    },
  };

  const workspace: Workspace = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    status: 'active',
    members: [
      {
        userId: params.createdBy,
        userName: 'Creator',
        email: '',
        role: 'owner',
        joinedAt: now,
        permissions: [
          { resource: '*', actions: ['read', 'write', 'delete', 'share', 'admin'] },
        ],
      },
    ],
    models: [],
    settings: { ...defaultSettings, ...params.settings },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  workspaces.set(id, workspace);
  comments.set(id, []);
  reviews.set(id, []);
  activities.set(id, []);
  notifications.set(id, []);

  // Log activity
  logActivity({
    workspaceId: id,
    userId: params.createdBy,
    userName: 'Creator',
    action: 'workspace_created',
    description: `Workspace "${params.name}" created`,
    metadata: { workspaceType: params.type },
  });

  return workspace;
}

export function getWorkspace(id: string): Workspace | undefined {
  return workspaces.get(id);
}

export function listWorkspaces(
  organizationId: string,
  filters?: { type?: WorkspaceType; status?: WorkspaceStatus; userId?: string }
): Workspace[] {
  let result = Array.from(workspaces.values()).filter(
    w => w.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(w => w.type === filters.type);
  if (filters?.status) result = result.filter(w => w.status === filters.status);
  if (filters?.userId) result = result.filter(w => w.members.some(m => m.userId === filters.userId));

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateWorkspace(
  workspaceId: string,
  updates: Partial<Workspace>
): Workspace {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  Object.assign(workspace, updates, { updatedAt: new Date().toISOString() });

  logActivity({
    workspaceId,
    userId: workspace.createdBy,
    userName: 'System',
    action: 'workspace_updated',
    description: `Workspace "${workspace.name}" updated`,
    metadata: { updates: Object.keys(updates) },
  });

  return workspace;
}

export function addWorkspaceMember(
  workspaceId: string,
  member: Omit<WorkspaceMember, 'joinedAt' | 'permissions'>,
  addedBy: string
): Workspace {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const existingMember = workspace.members.find(m => m.userId === member.userId);
  if (existingMember) throw new Error('Member already exists in workspace');

  const defaultPermissions: Permission[] = [
    { resource: 'model', actions: ['read'] },
    { resource: 'comment', actions: ['read', 'write'] },
  ];

  if (member.role === 'editor' || member.role === 'admin') {
    defaultPermissions.push({ resource: 'model', actions: ['write'] });
  }

  if (member.role === 'admin' || member.role === 'owner') {
    defaultPermissions.push(
      { resource: 'member', actions: ['read', 'write', 'delete'] },
      { resource: 'workspace', actions: ['write', 'admin'] }
    );
  }

  workspace.members.push({
    ...member,
    joinedAt: new Date().toISOString(),
    permissions: defaultPermissions,
  });

  workspace.updatedAt = new Date().toISOString();

  logActivity({
    workspaceId,
    userId: addedBy,
    userName: 'System',
    action: 'member_added',
    description: `${member.userName} added to workspace`,
    metadata: { memberRole: member.role },
  });

  // Send notification
  createNotification({
    workspaceId,
    userId: member.userId,
    type: 'member_joined',
    title: 'Welcome to the workspace',
    message: `You have been added to workspace "${workspace.name}"`,
  });

  return workspace;
}

export function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
  removedBy: string
): Workspace {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const memberIndex = workspace.members.findIndex(m => m.userId === userId);
  if (memberIndex === -1) throw new Error('Member not found in workspace');

  const member = workspace.members[memberIndex];
  if (member.role === 'owner') throw new Error('Cannot remove workspace owner');

  workspace.members.splice(memberIndex, 1);
  workspace.updatedAt = new Date().toISOString();

  logActivity({
    workspaceId,
    userId: removedBy,
    userName: 'System',
    action: 'member_removed',
    description: `${member.userName} removed from workspace`,
    metadata: {},
  });

  return workspace;
}

export function addModelToWorkspace(workspaceId: string, modelId: string): Workspace {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  if (!workspace.models.includes(modelId)) {
    workspace.models.push(modelId);
    workspace.updatedAt = new Date().toISOString();
  }

  return workspace;
}

export function removeModelFromWorkspace(workspaceId: string, modelId: string): Workspace {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  workspace.models = workspace.models.filter(id => id !== modelId);
  workspace.updatedAt = new Date().toISOString();

  return workspace;
}

export function addComment(params: {
  workspaceId: string;
  modelId: string;
  authorId: string;
  authorName: string;
  content: string;
  type?: CommentType;
  parentId?: string;
  mentions?: string[];
  attachments?: Omit<Attachment, 'id' | 'uploadedAt'>[];
}): Comment {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const comment: Comment = {
    id,
    workspaceId: params.workspaceId,
    modelId: params.modelId,
    parentId: params.parentId,
    authorId: params.authorId,
    authorName: params.authorName,
    content: params.content,
    type: params.type || 'general',
    status: 'open',
    mentions: params.mentions || [],
    reactions: [],
    attachments: params.attachments?.map(a => ({
      ...a,
      id: randomUUID(),
      uploadedAt: now,
    })) || [],
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };

  const workspaceComments = comments.get(workspaceId) || [];
  workspaceComments.push(comment);
  comments.set(workspaceId, workspaceComments);

  logActivity({
    workspaceId,
    modelId: params.modelId,
    userId: params.authorId,
    userName: params.authorName,
    action: 'comment_added',
    description: `Comment added to model`,
    metadata: { commentType: params.type, commentId: id },
  });

  // Notify mentions
  for (const mentionedUserId of params.mentions || []) {
    createNotification({
      workspaceId,
      userId: mentionedUserId,
      type: 'mention',
      title: 'You were mentioned',
      message: `${params.authorName} mentioned you in a comment`,
    });
  }

  return comment;
}

export function getComments(
  workspaceId: string,
  filters?: { modelId?: string; parentId?: string; status?: CommentStatus }
): Comment[] {
  let result = comments.get(workspaceId) || [];

  if (filters?.modelId) result = result.filter(c => c.modelId === filters.modelId);
  if (filters?.parentId !== undefined) result = result.filter(c => c.parentId === filters.parentId);
  if (filters?.status) result = result.filter(c => c.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resolveComment(
  workspaceId: string,
  commentId: string,
  resolvedBy: string
): Comment {
  const workspaceComments = comments.get(workspaceId) || [];
  const comment = workspaceComments.find(c => c.id === commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);

  const now = new Date().toISOString();
  comment.resolved = true;
  comment.resolvedBy = resolvedBy;
  comment.resolvedAt = now;
  comment.status = 'resolved';
  comment.updatedAt = now;

  logActivity({
    workspaceId,
    modelId: comment.modelId,
    userId: resolvedBy,
    userName: 'System',
    action: 'comment_resolved',
    description: `Comment resolved`,
    metadata: { commentId },
  });

  return comment;
}

export function addReaction(
  workspaceId: string,
  commentId: string,
  userId: string,
  userName: string,
  emoji: string
): Comment {
  const workspaceComments = comments.get(workspaceId) || [];
  const comment = workspaceComments.find(c => c.id === commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);

  const existingReaction = comment.reactions.find(r => r.userId === userId && r.emoji === emoji);
  if (existingReaction) {
    comment.reactions = comment.reactions.filter(r => r !== existingReaction);
  } else {
    comment.reactions.push({
      userId,
      userName,
      emoji,
      createdAt: new Date().toISOString(),
    });
  }

  comment.updatedAt = new Date().toISOString();
  return comment;
}

export function createReview(params: {
  workspaceId: string;
  modelId: string;
  modelVersion: string;
  reviewerId: string;
  reviewerName: string;
  checklist?: Omit<ReviewChecklistItem, 'id' | 'checked' | 'checkedBy' | 'checkedAt'>[];
}): Review {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultChecklist: ReviewChecklistItem[] = [
    { id: randomUUID(), category: 'Code Quality', description: 'Code follows style guidelines', checked: false },
    { id: randomUUID(), category: 'Testing', description: 'Unit tests added and passing', checked: false },
    { id: randomUUID(), category: 'Documentation', description: 'Documentation updated', checked: false },
    { id: randomUUID(), category: 'Performance', description: 'Performance benchmarks run', checked: false },
    { id: randomUUID(), category: 'Security', description: 'Security review completed', checked: false },
  ];

  const review: Review = {
    id,
    workspaceId: params.workspaceId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    reviewerId: params.reviewerId,
    reviewerName: params.reviewerName,
    status: 'pending',
    checklist: params.checklist?.map(c => ({
      ...c,
      id: randomUUID(),
      checked: false,
    })) || defaultChecklist,
    comments: [],
    approval: 'pending',
    submittedAt: now,
  };

  const workspaceReviews = reviews.get(workspaceId) || [];
  workspaceReviews.push(review);
  reviews.set(workspaceId, workspaceReviews);

  logActivity({
    workspaceId,
    modelId: params.modelId,
    userId: params.reviewerId,
    userName: params.reviewerName,
    action: 'review_started',
    description: `Review started for model version ${params.modelVersion}`,
    metadata: { reviewId: id },
  });

  return review;
}

export function getReviews(
  workspaceId: string,
  filters?: { modelId?: string; status?: ReviewStatus; reviewerId?: string }
): Review[] {
  let result = reviews.get(workspaceId) || [];

  if (filters?.modelId) result = result.filter(r => r.modelId === filters.modelId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  if (filters?.reviewerId) result = result.filter(r => r.reviewerId === filters.reviewerId);

  return result.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function updateReviewChecklist(
  workspaceId: string,
  reviewId: string,
  itemId: string,
  checked: boolean,
  checkedBy: string,
  notes?: string
): Review {
  const workspaceReviews = reviews.get(workspaceId) || [];
  const review = workspaceReviews.find(r => r.id === reviewId);
  if (!review) throw new Error(`Review ${reviewId} not found`);

  const item = review.checklist.find(i => i.id === itemId);
  if (!item) throw new Error(`Checklist item ${itemId} not found`);

  item.checked = checked;
  item.checkedBy = checkedBy;
  item.checkedAt = new Date().toISOString();
  item.notes = notes;

  return review;
}

export function completeReview(
  workspaceId: string,
  reviewId: string,
  approval: 'approved' | 'changes_requested',
  comments: string[]
): Review {
  const workspaceReviews = reviews.get(workspaceId) || [];
  const review = workspaceReviews.find(r => r.id === reviewId);
  if (!review) throw new Error(`Review ${reviewId} not found`);

  const now = new Date().toISOString();
  review.status = 'completed';
  review.approval = approval;
  review.comments = comments;
  review.completedAt = now;

  logActivity({
    workspaceId,
    modelId: review.modelId,
    userId: review.reviewerId,
    userName: review.reviewerName,
    action: 'review_completed',
    description: `Review ${approval} for model version ${review.modelVersion}`,
    metadata: { reviewId, approval },
  });

  return review;
}

function logActivity(params: {
  workspaceId: string;
  modelId?: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  description: string;
  metadata: Record<string, any>;
}): void {
  const now = new Date().toISOString();
  const id = randomUUID();

  const activity: Activity = {
    id,
    workspaceId: params.workspaceId,
    modelId: params.modelId,
    userId: params.userId,
    userName: params.userName,
    action: params.action,
    description: params.description,
    metadata: params.metadata,
    timestamp: now,
  };

  const workspaceActivities = activities.get(params.workspaceId) || [];
  workspaceActivities.push(activity);
  activities.set(params.workspaceId, workspaceActivities);
}

export function getActivities(
  workspaceId: string,
  filters?: { modelId?: string; userId?: string; action?: ActivityAction; limit?: number }
): Activity[] {
  let result = activities.get(workspaceId) || [];

  if (filters?.modelId) result = result.filter(a => a.modelId === filters.modelId);
  if (filters?.userId) result = result.filter(a => a.userId === filters.userId);
  if (filters?.action) result = result.filter(a => a.action === filters.action);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

function createNotification(params: {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}): Notification {
  const id = randomUUID();

  const notification: Notification = {
    id,
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    read: false,
    link: params.link,
    createdAt: new Date().toISOString(),
  };

  const workspaceNotifications = notifications.get(params.workspaceId) || [];
  workspaceNotifications.push(notification);
  notifications.set(params.workspaceId, workspaceNotifications);

  return notification;
}

export function getNotifications(
  workspaceId: string,
  userId: string,
  filters?: { read?: boolean; type?: NotificationType }
): Notification[] {
  let result = (notifications.get(workspaceId) || []).filter(n => n.userId === userId);

  if (filters?.read !== undefined) result = result.filter(n => n.read === filters.read);
  if (filters?.type) result = result.filter(n => n.type === filters.type);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markNotificationAsRead(
  workspaceId: string,
  notificationId: string
): Notification {
  const workspaceNotifications = notifications.get(workspaceId) || [];
  const notification = workspaceNotifications.find(n => n.id === notificationId);
  if (!notification) throw new Error(`Notification ${notificationId} not found`);

  notification.read = true;
  return notification;
}

export function startRealTimeSession(
  workspaceId: string,
  modelId: string,
  userId: string,
  userName: string
): RealTimeSession {
  const existingSession = Array.from(realTimeSessions.values()).find(
    s => s.workspaceId === workspaceId && s.modelId === modelId
  );

  if (existingSession) {
    const existingParticipant = existingSession.participants.find(p => p.userId === userId);
    if (!existingParticipant) {
      existingSession.participants.push({
        userId,
        userName,
        joinedAt: new Date().toISOString(),
        isActive: true,
        color: generateColor(),
      });
    } else {
      existingParticipant.isActive = true;
    }
    existingSession.lastActivityAt = new Date().toISOString();
    return existingSession;
  }

  const session: RealTimeSession = {
    id: randomUUID(),
    workspaceId,
    modelId,
    participants: [
      {
        userId,
        userName,
        joinedAt: new Date().toISOString(),
        isActive: true,
        color: generateColor(),
      },
    ],
    cursors: [],
    locks: [],
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  realTimeSessions.set(session.id, session);
  return session;
}

function generateColor(): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function updateCursorPosition(
  sessionId: string,
  userId: string,
  userName: string,
  position: { line: number; column: number },
  selection?: { start: { line: number; column: number }; end: { line: number; column: number } }
): RealTimeSession {
  const session = realTimeSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const existingCursor = session.cursors.find(c => c.userId === userId);
  const now = new Date().toISOString();

  if (existingCursor) {
    existingCursor.position = position;
    existingCursor.selection = selection;
    existingCursor.updatedAt = now;
  } else {
    session.cursors.push({
      userId,
      userName,
      position,
      selection,
      updatedAt: now,
    });
  }

  session.lastActivityAt = now;
  return session;
}

export function lockResource(
  sessionId: string,
  resourceType: 'model' | 'config' | 'dataset' | 'notebook',
  resourceId: string,
  userId: string,
  durationMinutes: number = 30
): RealTimeSession {
  const session = realTimeSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const existingLock = session.locks.find(
    l => l.resourceType === resourceType && l.resourceId === resourceId
  );

  if (existingLock && existingLock.lockedBy !== userId) {
    throw new Error('Resource is locked by another user');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  if (existingLock) {
    existingLock.expiresAt = expiresAt.toISOString();
  } else {
    session.locks.push({
      resourceType,
      resourceId,
      lockedBy: userId,
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  session.lastActivityAt = now.toISOString();
  return session;
}

export function unlockResource(
  sessionId: string,
  resourceType: string,
  resourceId: string,
  userId: string
): RealTimeSession {
  const session = realTimeSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const lockIndex = session.locks.findIndex(
    l => l.resourceType === resourceType && l.resourceId === resourceId && l.lockedBy === userId
  );

  if (lockIndex !== -1) {
    session.locks.splice(lockIndex, 1);
  }

  session.lastActivityAt = new Date().toISOString();
  return session;
}

export function endRealTimeSession(sessionId: string, userId: string): void {
  const session = realTimeSessions.get(sessionId);
  if (!session) return;

  const participant = session.participants.find(p => p.userId === userId);
  if (participant) {
    participant.isActive = false;
  }

  session.cursors = session.cursors.filter(c => c.userId !== userId);

  // Remove locks held by user
  session.locks = session.locks.filter(l => l.lockedBy !== userId);

  // If no active participants, end session
  const activeParticipants = session.participants.filter(p => p.isActive);
  if (activeParticipants.length === 0) {
    realTimeSessions.delete(sessionId);
  }
}
