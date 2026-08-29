/**
 * Module 151: AI Model Collaboration Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive model collaboration capabilities including team collaboration,
 * real-time editing, collaborative model development, and team management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CollaborationWorkspace {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: WorkspaceStatus;
  modelId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type WorkspaceStatus =
  | 'active'
  | 'paused'
  | 'archived';

export interface WorkspaceMember {
  id: string;
  userId: string;
  userName: string;
  role: MemberRole;
  joinedAt: string;
  lastActiveAt?: string;
  permissions: MemberPermission[];
}

export type MemberRole =
  | 'owner'
  | 'admin'
  | 'editor'
  | 'viewer'
  | 'commenter';

export interface MemberPermission {
  resource: string;
  actions: string[];
}

export interface WorkspaceSettings {
  visibility: 'private' | 'team' | 'organization';
  allowExternalMembers: boolean;
  requireApproval: boolean;
  notifications: boolean;
  realTimeEditing: boolean;
}

export interface CollaborationSession {
  id: string;
  workspaceId: string;
  type: SessionType;
  status: SessionStatus;
  participants: SessionParticipant[];
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, any>;
}

export type SessionType =
  | 'editing'
  | 'review'
  | 'debugging'
  | 'training'
  | 'testing';

export type SessionStatus =
  | 'active'
  | 'paused'
  | 'completed';

export interface SessionParticipant {
  userId: string;
  userName: string;
  joinedAt: string;
  leftAt?: string;
  cursor?: CursorPosition;
  selection?: Selection;
}

export interface CursorPosition {
  line: number;
  column: number;
  timestamp: string;
}

export interface Selection {
  start: { line: number; column: number };
  end: { line: number; column: number };
  timestamp: string;
}

export interface CollaborationEvent {
  id: string;
  workspaceId: string;
  sessionId?: string;
  type: EventType;
  userId: string;
  userName: string;
  timestamp: string;
  data: Record<string, any>;
}

export type EventType =
  | 'edit'
  | 'cursor_move'
  | 'selection'
  | 'comment'
  | 'save'
  | 'join'
  | 'leave';

export interface CollaborationReport {
  id: string;
  workspaceId: string;
  type: 'summary' | 'detailed' | 'activity';
  title: string;
  executiveSummary: string;
  members: WorkspaceMember[];
  sessions: CollaborationSession[];
  events: CollaborationEvent[];
  metrics: CollaborationMetrics;
  recommendations: CollaborationRecommendation[];
  generatedAt: string;
  generatedBy: string;
}

export interface CollaborationMetrics {
  totalMembers: number;
  activeMembers: number;
  totalSessions: number;
  averageSessionDuration: number; // minutes
  totalEdits: number;
  totalComments: number;
  collaborationScore: number;
}

export interface CollaborationRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'collaboration' | 'process' | 'team';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const collaborationWorkspaces = new Map<string, CollaborationWorkspace>();
const collaborationSessions = new Map<string, CollaborationSession[]>();
const collaborationEvents = new Map<string, CollaborationEvent[]>();
const collaborationReports = new Map<string, CollaborationReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createCollaborationWorkspace(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  settings?: WorkspaceSettings;
  createdBy: string;
}): CollaborationWorkspace {
  const now = new Date().toISOString();
  const id = randomUUID();

  const workspace: CollaborationWorkspace = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    modelId: params.modelId,
    members: [
      {
        id: randomUUID(),
        userId: params.createdBy,
        userName: 'Creator',
        role: 'owner',
        joinedAt: now,
        lastActiveAt: now,
        permissions: [
          { resource: '*', actions: ['*'] },
        ],
      },
    ],
    settings: params.settings || {
      visibility: 'private',
      allowExternalMembers: false,
      requireApproval: false,
      notifications: true,
      realTimeEditing: true,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  collaborationWorkspaces.set(id, workspace);
  collaborationSessions.set(id, []);
  collaborationEvents.set(id, []);

  return workspace;
}

export function getCollaborationWorkspace(id: string): CollaborationWorkspace | undefined {
  return collaborationWorkspaces.get(id);
}

export function listCollaborationWorkspaces(
  organizationId: string,
  filters?: { status?: WorkspaceStatus; modelId?: string }
): CollaborationWorkspace[] {
  let result = Array.from(collaborationWorkspaces.values()).filter(
    w => w.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(w => w.status === filters.status);
  if (filters?.modelId) result = result.filter(w => w.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  userName: string,
  role: MemberRole
): WorkspaceMember {
  const workspace = collaborationWorkspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const now = new Date().toISOString();
  const member: WorkspaceMember = {
    id: randomUUID(),
    userId,
    userName,
    role,
    joinedAt: now,
    lastActiveAt: now,
    permissions: getPermissionsForRole(role),
  };

  workspace.members.push(member);
  workspace.updatedAt = now;

  // Create join event
  createCollaborationEvent({
    workspaceId,
    type: 'join',
    userId,
    userName,
    data: { role },
  });

  return member;
}

function getPermissionsForRole(role: MemberRole): MemberPermission[] {
  switch (role) {
    case 'owner':
    case 'admin':
      return [{ resource: '*', actions: ['*'] }];
    case 'editor':
      return [
        { resource: 'model', actions: ['read', 'write'] },
        { resource: 'comment', actions: ['read', 'write'] },
      ];
    case 'commenter':
      return [
        { resource: 'model', actions: ['read'] },
        { resource: 'comment', actions: ['read', 'write'] },
      ];
    case 'viewer':
    default:
      return [
        { resource: 'model', actions: ['read'] },
        { resource: 'comment', actions: ['read'] },
      ];
  }
}

export function removeWorkspaceMember(workspaceId: string, memberId: string): void {
  const workspace = collaborationWorkspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const memberIndex = workspace.members.findIndex(m => m.id === memberId);
  if (memberIndex === -1) throw new Error(`Member ${memberId} not found`);

  const member = workspace.members[memberIndex];
  workspace.members.splice(memberIndex, 1);
  workspace.updatedAt = new Date().toISOString();

  // Create leave event
  createCollaborationEvent({
    workspaceId,
    type: 'leave',
    userId: member.userId,
    userName: member.userName,
    data: {},
  });
}

export function updateMemberRole(
  workspaceId: string,
  memberId: string,
  newRole: MemberRole
): WorkspaceMember {
  const workspace = collaborationWorkspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const member = workspace.members.find(m => m.id === memberId);
  if (!member) throw new Error(`Member ${memberId} not found`);

  member.role = newRole;
  member.permissions = getPermissionsForRole(newRole);
  workspace.updatedAt = new Date().toISOString();

  return member;
}

export function startCollaborationSession(
  workspaceId: string,
  type: SessionType,
  userId: string,
  userName: string
): CollaborationSession {
  const workspace = collaborationWorkspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const now = new Date().toISOString();
  const session: CollaborationSession = {
    id: randomUUID(),
    workspaceId,
    type,
    status: 'active',
    participants: [
      {
        userId,
        userName,
        joinedAt: now,
      },
    ],
    startedAt: now,
  };

  const sessions = collaborationSessions.get(workspaceId) || [];
  sessions.push(session);
  collaborationSessions.set(workspaceId, sessions);

  // Create join event
  createCollaborationEvent({
    workspaceId,
    sessionId: session.id,
    type: 'join',
    userId,
    userName,
    data: { sessionType: type },
  });

  return session;
}

export function joinCollaborationSession(
  workspaceId: string,
  sessionId: string,
  userId: string,
  userName: string
): CollaborationSession {
  const sessions = collaborationSessions.get(workspaceId) || [];
  const session = sessions.find(s => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const now = new Date().toISOString();
  session.participants.push({
    userId,
    userName,
    joinedAt: now,
  });

  // Create join event
  createCollaborationEvent({
    workspaceId,
    sessionId,
    type: 'join',
    userId,
    userName,
    data: {},
  });

  return session;
}

export function leaveCollaborationSession(
  workspaceId: string,
  sessionId: string,
  userId: string
): CollaborationSession {
  const sessions = collaborationSessions.get(workspaceId) || [];
  const session = sessions.find(s => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const now = new Date().toISOString();
  const participant = session.participants.find(p => p.userId === userId);
  if (participant) {
    participant.leftAt = now;
  }

  // Check if all participants have left
  const activeParticipants = session.participants.filter(p => !p.leftAt);
  if (activeParticipants.length === 0) {
    session.status = 'completed';
    session.endedAt = now;
  }

  // Create leave event
  createCollaborationEvent({
    workspaceId,
    sessionId,
    type: 'leave',
    userId: participant?.userId || '',
    userName: participant?.userName || '',
    data: {},
  });

  return session;
}

export function updateCursorPosition(
  workspaceId: string,
  sessionId: string,
  userId: string,
  position: CursorPosition
): void {
  const sessions = collaborationSessions.get(workspaceId) || [];
  const session = sessions.find(s => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const participant = session.participants.find(p => p.userId === userId && !p.leftAt);
  if (participant) {
    participant.cursor = position;
  }

  // Create cursor move event
  createCollaborationEvent({
    workspaceId,
    sessionId,
    type: 'cursor_move',
    userId,
    userName: participant?.userName || '',
    data: { position },
  });
}

export function updateSelection(
  workspaceId: string,
  sessionId: string,
  userId: string,
  selection: Selection
): void {
  const sessions = collaborationSessions.get(workspaceId) || [];
  const session = sessions.find(s => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const participant = session.participants.find(p => p.userId === userId && !p.leftAt);
  if (participant) {
    participant.selection = selection;
  }

  // Create selection event
  createCollaborationEvent({
    workspaceId,
    sessionId,
    type: 'selection',
    userId,
    userName: participant?.userName || '',
    data: { selection },
  });
}

function createCollaborationEvent(params: {
  workspaceId: string;
  sessionId?: string;
  type: EventType;
  userId: string;
  userName: string;
  data: Record<string, any>;
}): CollaborationEvent {
  const now = new Date().toISOString();
  const event: CollaborationEvent = {
    id: randomUUID(),
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    type: params.type,
    userId: params.userId,
    userName: params.userName,
    timestamp: now,
    data: params.data,
  };

  const events = collaborationEvents.get(params.workspaceId) || [];
  events.push(event);

  // Keep only last 1000 events
  if (events.length > 1000) {
    collaborationEvents.set(params.workspaceId, events.slice(-1000));
  } else {
    collaborationEvents.set(params.workspaceId, events);
  }

  return event;
}

export function getCollaborationEvents(
  workspaceId: string,
  filters?: { sessionId?: string; type?: EventType; limit?: number }
): CollaborationEvent[] {
  let result = collaborationEvents.get(workspaceId) || [];

  if (filters?.sessionId) result = result.filter(e => e.sessionId === filters.sessionId);
  if (filters?.type) result = result.filter(e => e.type === filters.type);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function generateCollaborationReport(
  workspaceId: string,
  type: 'summary' | 'detailed' | 'activity',
  generatedBy: string
): CollaborationReport {
  const workspace = collaborationWorkspaces.get(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const sessions = collaborationSessions.get(workspaceId) || [];
  const events = collaborationEvents.get(workspaceId) || [];

  const executiveSummary = `Collaboration report for workspace "${workspace.name}" with ${workspace.members.length} members and ${sessions.length} sessions.`;

  const totalEdits = events.filter(e => e.type === 'edit').length;
  const totalComments = events.filter(e => e.type === 'comment').length;

  const metrics: CollaborationMetrics = {
    totalMembers: workspace.members.length,
    activeMembers: workspace.members.filter(m => {
      if (!m.lastActiveAt) return false;
      const daysAgo = (Date.now() - new Date(m.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    }).length,
    totalSessions: sessions.length,
    averageSessionDuration: sessions.length > 0
      ? sessions.reduce((sum, s) => {
          if (!s.endedAt) return sum;
          return sum + (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / (1000 * 60);
        }, 0) / sessions.length
      : 0,
    totalEdits,
    totalComments,
    collaborationScore: 85, // Simulated
  };

  const recommendations: CollaborationRecommendation[] = [];

  if (metrics.activeMembers < metrics.totalMembers * 0.5) {
    recommendations.push({
      id: randomUUID(),
      priority: 'medium',
      category: 'collaboration',
      title: 'Increase member engagement',
      description: 'Less than 50% of members are active',
      impact: 'Improved collaboration and productivity',
      effort: 'medium',
      actionItems: ['Encourage regular participation', 'Schedule regular meetings'],
    });
  }

  const report: CollaborationReport = {
    id,
    workspaceId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Collaboration Report`,
    executiveSummary,
    members: workspace.members,
    sessions,
    events: events.slice(-100),
    metrics,
    recommendations,
    generatedAt: now,
    generatedBy,
  };

  collaborationReports.set(id, report);
  return report;
}

export function getCollaborationReport(id: string): CollaborationReport | undefined {
  return collaborationReports.get(id);
}

export function listCollaborationReports(
  organizationId: string,
  filters?: { type?: string; workspaceId?: string }
): CollaborationReport[] {
  const workspaces = Array.from(collaborationWorkspaces.values()).filter(
    w => w.organizationId === organizationId
  );
  const workspaceIds = workspaces.map(w => w.id);

  let result = Array.from(collaborationReports.values()).filter(
    r => workspaceIds.includes(r.workspaceId)
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);
  if (filters?.workspaceId) result = result.filter(r => r.workspaceId === filters.workspaceId);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function getCollaborationDashboard(organizationId: string): {
  totalWorkspaces: number;
  activeWorkspaces: number;
  totalMembers: number;
  activeSessions: number;
  collaborationScore: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
} {
  const workspaces = Array.from(collaborationWorkspaces.values()).filter(
    w => w.organizationId === organizationId
  );

  const activeWorkspaces = workspaces.filter(w => w.status === 'active').length;
  const totalMembers = workspaces.reduce((sum, w) => sum + w.members.length, 0);

  const allSessions = workspaces.flatMap(w => collaborationSessions.get(w.id) || []);
  const activeSessions = allSessions.filter(s => s.status === 'active').length;

  const overallHealth = activeWorkspaces < workspaces.length * 0.5 ? 'warning'
    : activeWorkspaces === 0 ? 'critical'
    : 'healthy';

  return {
    totalWorkspaces: workspaces.length,
    activeWorkspaces,
    totalMembers,
    activeSessions,
    collaborationScore: 85, // Simulated
    overallHealth,
  };
}
