/**
 * Module 129: AI Collaborative Training Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides collaborative training capabilities including multi-user training sessions,
 * real-time collaboration, shared experiments, collaborative debugging, and team-based
 * model development workflows.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TrainingSession {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: SessionStatus;
  modelId: string;
  modelVersion: string;
  participants: Participant[];
  configuration: SessionConfiguration;
  sharedResources: SharedResource[];
  activities: SessionActivity[];
  checkpoints: SessionCheckpoint[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type SessionStatus =
  | 'initializing'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Participant {
  id: string;
  userId: string;
  userName: string;
  role: ParticipantRole;
  status: 'online' | 'offline' | 'away';
  joinedAt: string;
  lastActiveAt: string;
  permissions: ParticipantPermission[];
  contributions: ParticipantContribution;
}

export type ParticipantRole = 'owner' | 'admin' | 'contributor' | 'viewer';

export interface ParticipantPermission {
  resource: string;
  actions: ('read' | 'write' | 'execute' | 'delete')[];
}

export interface ParticipantContribution {
  codeCommits: number;
  experimentsRun: number;
  reviewsCompleted: number;
  commentsAdded: number;
  trainingHours: number;
}

export interface SessionConfiguration {
  maxParticipants: number;
  enableRealTimeCollaboration: boolean;
  enableCodeSharing: boolean;
  enableExperimentSharing: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // seconds
  conflictResolution: 'manual' | 'automatic' | 'last_write_wins';
  versionControl: boolean;
}

export interface SharedResource {
  id: string;
  type: 'code' | 'notebook' | 'dataset' | 'model' | 'config' | 'experiment';
  name: string;
  owner: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
  version: number;
  locked: boolean;
  lockedBy?: string;
  uri: string;
}

export interface SessionActivity {
  id: string;
  timestamp: string;
  participantId: string;
  participantName: string;
  action: ActivityAction;
  resource?: string;
  details?: Record<string, any>;
}

export type ActivityAction =
  | 'joined'
  | 'left'
  | 'code_edit'
  | 'code_commit'
  | 'experiment_started'
  | 'experiment_completed'
  | 'checkpoint_created'
  | 'comment_added'
  | 'review_submitted'
  | 'resource_shared'
  | 'conflict_detected'
  | 'conflict_resolved';

export interface SessionCheckpoint {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  modelState: ModelState;
  metrics: CheckpointMetrics;
  tags: string[];
}

export interface ModelState {
  weights: string; // URI to weights
  optimizer: string;
  epoch: number;
  step: number;
  configuration: Record<string, any>;
}

export interface CheckpointMetrics {
  trainLoss: number;
  validationLoss: number;
  accuracy: number;
  customMetrics?: Record<string, number>;
}

export interface CollaborativeExperiment {
  id: string;
  sessionId: string;
  name: string;
  owner: string;
  collaborators: string[];
  status: ExperimentStatus;
  configuration: ExperimentConfiguration;
  results?: ExperimentResults;
  comments: ExperimentComment[];
  versions: ExperimentVersion[];
  createdAt: string;
  updatedAt: string;
}

export type ExperimentStatus =
  | 'draft'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ExperimentConfiguration {
  hyperparameters: Record<string, any>;
  dataset: string;
  model: string;
  trainingConfig: Record<string, any>;
}

export interface ExperimentResults {
  metrics: Record<string, number>;
  artifacts: string[];
  duration: number;
  completedAt: string;
}

export interface ExperimentComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  parentId?: string;
}

export interface ExperimentVersion {
  version: number;
  configuration: ExperimentConfiguration;
  createdBy: string;
  createdAt: string;
  changelog: string;
}

export interface CodeCollaboration {
  id: string;
  sessionId: string;
  filePath: string;
  language: string;
  content: string;
  version: number;
  cursors: CursorPosition[];
  selections: Selection[];
  conflicts: CodeConflict[];
  history: CodeHistoryEntry[];
}

export interface CursorPosition {
  userId: string;
  userName: string;
  line: number;
  column: number;
  color: string;
  lastUpdate: string;
}

export interface Selection {
  userId: string;
  userName: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  color: string;
}

export interface CodeConflict {
  id: string;
  type: 'edit_conflict' | 'merge_conflict';
  location: { line: number; column: number };
  participants: string[];
  versions: CodeVersion[];
  resolved: boolean;
  resolvedBy?: string;
  resolution?: string;
  detectedAt: string;
}

export interface CodeVersion {
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
}

export interface CodeHistoryEntry {
  timestamp: string;
  userId: string;
  userName: string;
  action: 'insert' | 'delete' | 'replace';
  line: number;
  column: number;
  content: string;
}

export interface TeamWorkspace {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  members: TeamMember[];
  projects: TeamProject[];
  resources: WorkspaceResource[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  userName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

export interface TeamProject {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'completed';
  sessions: string[];
  experiments: string[];
  models: string[];
}

export interface WorkspaceResource {
  id: string;
  type: 'dataset' | 'model' | 'notebook' | 'compute';
  name: string;
  shared: boolean;
  owner: string;
}

export interface CollaborationMetrics {
  sessionId: string;
  totalParticipants: number;
  activeParticipants: number;
  totalActivities: number;
  codeCommits: number;
  experimentsRun: number;
  conflictsResolved: number;
  averageSessionDuration: number;
  collaborationScore: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const trainingSessions = new Map<string, TrainingSession>();
const collaborativeExperiments = new Map<string, CollaborativeExperiment[]>();
const codeCollaborations = new Map<string, CodeCollaboration[]>();
const teamWorkspaces = new Map<string, TeamWorkspace>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createTrainingSession(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelVersion: string;
  configuration?: Partial<SessionConfiguration>;
  createdBy: string;
}): TrainingSession {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: SessionConfiguration = {
    maxParticipants: 10,
    enableRealTimeCollaboration: true,
    enableCodeSharing: true,
    enableExperimentSharing: true,
    autoSave: true,
    autoSaveInterval: 300,
    conflictResolution: 'manual',
    versionControl: true,
  };

  const session: TrainingSession = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'initializing',
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    participants: [],
    configuration: { ...defaultConfig, ...params.configuration },
    sharedResources: [],
    activities: [],
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  trainingSessions.set(id, session);
  collaborativeExperiments.set(id, []);
  codeCollaborations.set(id, []);

  return session;
}

export function getTrainingSession(id: string): TrainingSession | undefined {
  return trainingSessions.get(id);
}

export function listTrainingSessions(
  organizationId: string,
  filters?: { status?: SessionStatus; modelId?: string }
): TrainingSession[] {
  let result = Array.from(trainingSessions.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(s => s.status === filters.status);
  if (filters?.modelId) result = result.filter(s => s.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function joinSession(
  sessionId: string,
  userId: string,
  userName: string,
  role: ParticipantRole = 'contributor'
): Participant {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  if (session.participants.length >= session.configuration.maxParticipants) {
    throw new Error('Session has reached maximum participants');
  }

  const now = new Date().toISOString();
  const participant: Participant = {
    id: randomUUID(),
    userId,
    userName,
    role,
    status: 'online',
    joinedAt: now,
    lastActiveAt: now,
    permissions: getDefaultPermissions(role),
    contributions: {
      codeCommits: 0,
      experimentsRun: 0,
      reviewsCompleted: 0,
      commentsAdded: 0,
      trainingHours: 0,
    },
  };

  session.participants.push(participant);

  logActivity(sessionId, participant.id, userName, 'joined');

  session.status = 'active';
  session.updatedAt = now;

  return participant;
}

function getDefaultPermissions(role: ParticipantRole): ParticipantPermission[] {
  const permissions: ParticipantPermission[] = [];

  if (role === 'owner' || role === 'admin') {
    permissions.push({ resource: '*', actions: ['read', 'write', 'execute', 'delete'] });
  } else if (role === 'contributor') {
    permissions.push({ resource: 'code', actions: ['read', 'write'] });
    permissions.push({ resource: 'experiment', actions: ['read', 'write', 'execute'] });
    permissions.push({ resource: 'checkpoint', actions: ['read', 'write'] });
  } else {
    permissions.push({ resource: '*', actions: ['read'] });
  }

  return permissions;
}

export function leaveSession(sessionId: string, userId: string): void {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  const participant = session.participants.find(p => p.userId === userId);
  if (!participant) throw new Error('Participant not found');

  logActivity(sessionId, participant.id, participant.userName, 'left');

  session.participants = session.participants.filter(p => p.userId !== userId);
  session.updatedAt = new Date().toISOString();
}

function logActivity(
  sessionId: string,
  participantId: string,
  participantName: string,
  action: ActivityAction,
  resource?: string,
  details?: Record<string, any>
): void {
  const session = trainingSessions.get(sessionId);
  if (!session) return;

  const activity: SessionActivity = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    participantId,
    participantName,
    action,
    resource,
    details,
  };

  session.activities.push(activity);

  // Keep only last 1000 activities
  if (session.activities.length > 1000) {
    session.activities = session.activities.slice(-1000);
  }
}

export function shareResource(
  sessionId: string,
  userId: string,
  resource: Omit<SharedResource, 'id' | 'lastModifiedAt' | 'version' | 'locked'>
): SharedResource {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  const now = new Date().toISOString();
  const sharedResource: SharedResource = {
    ...resource,
    id: randomUUID(),
    lastModifiedAt: now,
    version: 1,
    locked: false,
  };

  session.sharedResources.push(sharedResource);

  const participant = session.participants.find(p => p.userId === userId);
  if (participant) {
    logActivity(sessionId, participant.id, participant.userName, 'resource_shared', resource.name);
  }

  session.updatedAt = now;
  return sharedResource;
}

export function lockResource(
  sessionId: string,
  resourceId: string,
  userId: string
): SharedResource {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  const resource = session.sharedResources.find(r => r.id === resourceId);
  if (!resource) throw new Error('Resource not found');

  if (resource.locked && resource.lockedBy !== userId) {
    throw new Error('Resource is locked by another user');
  }

  resource.locked = true;
  resource.lockedBy = userId;
  session.updatedAt = new Date().toISOString();

  return resource;
}

export function unlockResource(
  sessionId: string,
  resourceId: string,
  userId: string
): SharedResource {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  const resource = session.sharedResources.find(r => r.id === resourceId);
  if (!resource) throw new Error('Resource not found');

  if (resource.lockedBy !== userId) {
    throw new Error('Only the user who locked the resource can unlock it');
  }

  resource.locked = false;
  resource.lockedBy = undefined;
  session.updatedAt = new Date().toISOString();

  return resource;
}

export function createCheckpoint(
  sessionId: string,
  userId: string,
  checkpoint: Omit<SessionCheckpoint, 'id' | 'createdAt'>
): SessionCheckpoint {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  const now = new Date().toISOString();
  const newCheckpoint: SessionCheckpoint = {
    ...checkpoint,
    id: randomUUID(),
    createdAt: now,
  };

  session.checkpoints.push(newCheckpoint);

  const participant = session.participants.find(p => p.userId === userId);
  if (participant) {
    logActivity(sessionId, participant.id, participant.userName, 'checkpoint_created', checkpoint.name);
  }

  session.updatedAt = now;
  return newCheckpoint;
}

export function createCollaborativeExperiment(params: {
  sessionId: string;
  name: string;
  owner: string;
  collaborators: string[];
  configuration: ExperimentConfiguration;
}): CollaborativeExperiment {
  const session = trainingSessions.get(params.sessionId);
  if (!session) throw new Error(`Training session ${params.sessionId} not found`);

  const now = new Date().toISOString();
  const experiment: CollaborativeExperiment = {
    id: randomUUID(),
    sessionId: params.sessionId,
    name: params.name,
    owner: params.owner,
    collaborators: params.collaborators,
    status: 'draft',
    configuration: params.configuration,
    comments: [],
    versions: [{
      version: 1,
      configuration: params.configuration,
      createdBy: params.owner,
      createdAt: now,
      changelog: 'Initial version',
    }],
    createdAt: now,
    updatedAt: now,
  };

  const experiments = collaborativeExperiments.get(params.sessionId) || [];
  experiments.push(experiment);
  collaborativeExperiments.set(params.sessionId, experiments);

  const participant = session.participants.find(p => p.userId === params.owner);
  if (participant) {
    participant.contributions.experimentsRun++;
    logActivity(params.sessionId, participant.id, participant.userName, 'experiment_started', params.name);
  }

  return experiment;
}

export function getCollaborativeExperiments(sessionId: string): CollaborativeExperiment[] {
  return collaborativeExperiments.get(sessionId) || [];
}

export function addExperimentComment(
  sessionId: string,
  experimentId: string,
  userId: string,
  userName: string,
  content: string,
  parentId?: string
): ExperimentComment {
  const experiments = collaborativeExperiments.get(sessionId) || [];
  const experiment = experiments.find(e => e.id === experimentId);
  if (!experiment) throw new Error('Experiment not found');

  const comment: ExperimentComment = {
    id: randomUUID(),
    userId,
    userName,
    content,
    timestamp: new Date().toISOString(),
    parentId,
  };

  experiment.comments.push(comment);
  experiment.updatedAt = new Date().toISOString();

  const session = trainingSessions.get(sessionId);
  if (session) {
    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      participant.contributions.commentsAdded++;
      logActivity(sessionId, participant.id, userName, 'comment_added', experiment.name);
    }
  }

  return comment;
}

export function updateCursor(
  sessionId: string,
  filePath: string,
  userId: string,
  userName: string,
  line: number,
  column: number
): void {
  const collaborations = codeCollaborations.get(sessionId) || [];
  let collaboration = collaborations.find(c => c.filePath === filePath);

  if (!collaboration) {
    collaboration = {
      id: randomUUID(),
      sessionId,
      filePath,
      language: 'python',
      content: '',
      version: 1,
      cursors: [],
      selections: [],
      conflicts: [],
      history: [],
    };
    collaborations.push(collaboration);
    codeCollaborations.set(sessionId, collaborations);
  }

  const now = new Date().toISOString();
  const existingCursor = collaboration.cursors.find(c => c.userId === userId);

  if (existingCursor) {
    existingCursor.line = line;
    existingCursor.column = column;
    existingCursor.lastUpdate = now;
  } else {
    collaboration.cursors.push({
      userId,
      userName,
      line,
      column,
      color: generateColor(userId),
      lastUpdate: now,
    });
  }
}

function generateColor(userId: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
  const index = userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export function getCollaborationMetrics(sessionId: string): CollaborationMetrics {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  const experiments = collaborativeExperiments.get(sessionId) || [];
  const conflicts = (codeCollaborations.get(sessionId) || [])
    .flatMap(c => c.conflicts)
    .filter(c => c.resolved);

  const totalCommits = session.participants.reduce((sum, p) => sum + p.contributions.codeCommits, 0);
  const totalExperiments = experiments.length;
  const totalActivities = session.activities.length;

  const collaborationScore = Math.min(100, (
    (session.participants.length * 10) +
    (totalCommits * 5) +
    (totalExperiments * 10) +
    (conflicts.length * 2)
  ));

  return {
    sessionId,
    totalParticipants: session.participants.length,
    activeParticipants: session.participants.filter(p => p.status === 'online').length,
    totalActivities,
    codeCommits: totalCommits,
    experimentsRun: totalExperiments,
    conflictsResolved: conflicts.length,
    averageSessionDuration: 0,
    collaborationScore,
  };
}

export function pauseSession(sessionId: string): TrainingSession {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  session.status = 'paused';
  session.updatedAt = new Date().toISOString();

  return session;
}

export function completeSession(sessionId: string): TrainingSession {
  const session = trainingSessions.get(sessionId);
  if (!session) throw new Error(`Training session ${sessionId} not found`);

  session.status = 'completed';
  session.updatedAt = new Date().toISOString();

  return session;
}
