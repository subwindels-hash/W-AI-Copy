/**
 * Module 70: AI Ethics Review Board Service
 *
 * Provides ethics review board governance including board management, member
 * management with expertise tracking, review session scheduling and coordination,
 * voting and decision tracking, appeals process management, board performance
 * metrics, and review documentation with audit trails.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EthicsReviewBoard {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: BoardType;
  status: BoardStatus;
  charter: BoardCharter;
  members: BoardMember[];
  chairperson?: string; // member ID
  sessions: ReviewSession[];
  decisions: EthicalDecision[];
  appeals: EthicalAppeal[];
  performance: BoardPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type BoardType =
  | 'internal'
  | 'external'
  | 'mixed'
  | 'institutional'
  | 'regulatory'
  | 'advisory';

export type BoardStatus = 'active' | 'inactive' | 'suspended' | 'dissolved';

export interface BoardCharter {
  mission: string;
  scope: string[];
  authority: string;
  jurisdiction: string[];
  meetingFrequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'as-needed';
  quorumRequirement: number; // percentage of members
  votingRules: VotingRules;
  conflictOfInterestPolicy: string;
  confidentialityPolicy: string;
  termLength?: number; // months
  reviewCycle?: number; // months
}

export interface VotingRules {
  approvalThreshold: number; // percentage
  votingMethod: 'simple-majority' | 'supermajority' | 'unanimous' | 'consensus';
  tieBreaker?: string; // chairperson, external arbiter, etc.
  abstainAllowed: boolean;
  proxyVotingAllowed: boolean;
  secretBallot: boolean;
}

export interface BoardMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  expertise: ExpertiseArea[];
  affiliation?: string;
  appointmentDate: string;
  termEndDate?: string;
  status: MemberStatus;
  conflictOfInterest: ConflictOfInterest[];
  attendance: AttendanceRecord;
  votingHistory: VotingRecord[];
  bio?: string;
  qualifications?: string[];
}

export type MemberRole =
  | 'chairperson'
  | 'vice-chair'
  | 'member'
  | 'expert-advisor'
  | 'community-representative'
  | 'legal-advisor'
  | 'ethicist'
  | 'technical-expert'
  | 'observer';

export type ExpertiseArea =
  | 'ai-ethics'
  | 'machine-learning'
  | 'data-science'
  | 'law'
  | 'philosophy'
  | 'sociology'
  | 'psychology'
  | 'medicine'
  | 'business'
  | 'policy'
  | 'community-advocacy'
  | 'human-rights'
  | 'privacy'
  | 'security'
  | 'fairness';

export type MemberStatus = 'active' | 'inactive' | 'recused' | 'term-expired' | 'resigned';

export interface ConflictOfInterest {
  id: string;
  description: string;
  disclosedAt: string;
  status: 'disclosed' | 'managed' | 'resolved';
  managementPlan?: string;
  relatedReviews?: string[]; // review session IDs
}

export interface AttendanceRecord {
  totalSessions: number;
  attendedSessions: number;
  attendanceRate: number; // percentage
  lastAttended?: string;
  absences: Array<{
    sessionId: string;
    reason?: string;
    excused: boolean;
  }>;
}

export interface VotingRecord {
  sessionId: string;
  decisionId: string;
  vote: Vote;
  rationale?: string;
  timestamp: string;
}

export interface ReviewSession {
  id: string;
  boardId: string;
  sessionNumber: string;
  type: SessionType;
  status: SessionStatus;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  attendees: string[]; // member IDs
  quorumMet: boolean;
  agenda: AgendaItem[];
  reviews: EthicalReview[];
  minutes?: string;
  recordings?: string[];
  documents: string[];
  decisions: string[]; // decision IDs
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type SessionType =
  | 'regular'
  | 'emergency'
  | 'special'
  | 'appeal'
  | 'training'
  | 'closed';

export type SessionStatus =
  | 'scheduled'
  | 'in-progress'
  | 'adjourned'
  | 'completed'
  | 'cancelled';

export interface AgendaItem {
  id: string;
  order: number;
  title: string;
  description: string;
  type: 'review' | 'discussion' | 'vote' | 'announcement' | 'other';
  duration?: number; // minutes
  presenter?: string;
  documents?: string[];
  reviewId?: string;
}

export interface EthicalReview {
  id: string;
  sessionId: string;
  type: ReviewType;
  subject: ReviewSubject;
  status: ReviewStatus;
  assignedTo: string[]; // member IDs
  materials: ReviewMaterial[];
  assessment?: EthicalAssessment;
  discussion: DiscussionPoint[];
  recommendation?: EthicalRecommendation;
  decision?: string; // decision ID
  timeline: ReviewTimeline;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewType =
  | 'initial-review'
  | 'continuing-review'
  | 'modification-review'
  | 'expedited-review'
  | 'full-board-review'
  | 'appeal-review'
  | 'complaint-review'
  | 'incident-review';

export interface ReviewSubject {
  type: 'model' | 'system' | 'project' | 'policy' | 'incident' | 'complaint';
  id: string;
  name: string;
  version?: string;
  description: string;
  submittedBy: string;
  submittedAt: string;
}

export type ReviewStatus =
  | 'submitted'
  | 'assigned'
  | 'under-review'
  | 'discussion'
  | 'voting'
  | 'decided'
  | 'appealed'
  | 'closed';

export interface ReviewMaterial {
  id: string;
  type: 'document' | 'presentation' | 'data' | 'code' | 'assessment' | 'other';
  title: string;
  description?: string;
  location: string;
  uploadedBy: string;
  uploadedAt: string;
  confidential: boolean;
}

export interface EthicalAssessment {
  principles: PrincipleAssessment[];
  stakeholders: StakeholderImpact[];
  risks: EthicalRisk[];
  benefits: EthicalBenefit[];
  overallAssessment: string;
  recommendation: 'approve' | 'conditional-approve' | 'revise' | 'reject' | 'defer';
}

export interface PrincipleAssessment {
  principle: string;
  compliance: 'compliant' | 'partially-compliant' | 'non-compliant' | 'not-applicable';
  score: number; // 0-100
  findings: string[];
  recommendations: string[];
}

export interface StakeholderImpact {
  stakeholder: string;
  impact: 'positive' | 'negative' | 'neutral' | 'mixed';
  severity: 'low' | 'medium' | 'high';
  description: string;
  mitigation?: string;
}

export interface EthicalRisk {
  id: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
  residualRisk: 'low' | 'medium' | 'high';
}

export interface EthicalBenefit {
  description: string;
  stakeholders: string[];
  magnitude: 'low' | 'medium' | 'high';
  likelihood: 'low' | 'medium' | 'high';
}

export interface DiscussionPoint {
  id: string;
  raisedBy: string; // member ID
  topic: string;
  description: string;
  responses: DiscussionResponse[];
  resolved: boolean;
  resolution?: string;
  timestamp: string;
}

export interface DiscussionResponse {
  id: string;
  respondentId: string; // member ID
  response: string;
  timestamp: string;
}

export interface EthicalRecommendation {
  type: 'approve' | 'conditional-approve' | 'revise' | 'reject' | 'defer';
  conditions?: string[];
  rationale: string;
  requiredActions?: string[];
  timeline?: string;
}

export interface ReviewTimeline {
  submittedAt: string;
  assignedAt?: string;
  reviewStartedAt?: string;
  discussionCompletedAt?: string;
  votingCompletedAt?: string;
  decidedAt?: string;
  appealedAt?: string;
  closedAt?: string;
}

export interface EthicalDecision {
  id: string;
  boardId: string;
  sessionId: string;
  reviewId: string;
  type: DecisionType;
  outcome: DecisionOutcome;
  votes: Vote[];
  voteSummary: VoteSummary;
  rationale: string;
  conditions?: string[];
  effectiveDate: string;
  expirationDate?: string;
  status: DecisionStatus;
  appealed: boolean;
  appealId?: string;
  precedents?: string[]; // previous decision IDs
  documentation: DecisionDocumentation;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DecisionType =
  | 'approval'
  | 'conditional-approval'
  | 'revision-required'
  | 'rejection'
  | 'deferral'
  | 'suspension'
  | 'termination'
  | 'appeal-decision';

export type DecisionOutcome =
  | 'approved'
  | 'conditionally-approved'
  | 'revision-required'
  | 'rejected'
  | 'deferred'
  | 'suspended'
  | 'terminated'
  | 'appeal-upheld'
  | 'appeal-overturned';

export interface Vote {
  memberId: string;
  memberName: string;
  vote: 'approve' | 'reject' | 'abstain' | 'recuse';
  rationale?: string;
  timestamp: string;
  conflictOfInterest: boolean;
}

export interface VoteSummary {
  totalVotes: number;
  approve: number;
  reject: number;
  abstain: number;
  recuse: number;
  approvalPercentage: number;
  passed: boolean;
  quorumMet: boolean;
}

export type DecisionStatus =
  | 'draft'
  | 'finalized'
  | 'effective'
  | 'expired'
  | 'appealed'
  | 'overturned'
  | 'superseded';

export interface DecisionDocumentation {
  summary: string;
  fullText: string;
  supportingDocuments: string[];
  dissentingOpinions?: DissentingOpinion[];
  publicStatement?: string;
}

export interface DissentingOpinion {
  memberId: string;
  memberName: string;
  opinion: string;
  timestamp: string;
}

export interface EthicalAppeal {
  id: string;
  boardId: string;
  originalDecisionId: string;
  appellant: string;
  appellantType: 'submitter' | 'stakeholder' | 'third-party';
  grounds: AppealGrounds[];
  status: AppealStatus;
  submittedAt: string;
  reviewSessionId?: string;
  decision?: string; // decision ID
  timeline: AppealTimeline;
  documentation: AppealDocumentation;
}

export interface AppealGrounds {
  ground: 'procedural-error' | 'new-evidence' | 'bias' | 'excessive' | 'insufficient' | 'other';
  description: string;
  evidence?: string[];
}

export type AppealStatus =
  | 'submitted'
  | 'under-review'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'decided';

export interface AppealTimeline {
  submittedAt: string;
  acceptedAt?: string;
  reviewStartedAt?: string;
  hearingDate?: string;
  decidedAt?: string;
  closedAt?: string;
}

export interface AppealDocumentation {
  appealBrief: string;
  supportingDocuments: string[];
  responseBrief?: string;
  hearingTranscript?: string;
  decision?: string;
}

export interface BoardPerformance {
  totalReviews: number;
  averageReviewTime: number; // days
  approvalRate: number; // percentage
  appealRate: number; // percentage
  overturnRate: number; // percentage
  memberParticipation: number; // percentage
  stakeholderSatisfaction?: number; // 1-5
  metrics: PerformanceMetric[];
  trends: PerformanceTrend[];
}

export interface PerformanceMetric {
  name: string;
  value: number;
  target?: number;
  unit: string;
  period: string;
}

export interface PerformanceTrend {
  metric: string;
  dataPoints: Array<{
    date: string;
    value: number;
  }>;
  trend: 'improving' | 'stable' | 'declining';
}

export interface EthicsBoardDashboard {
  organizationId: string;
  totalBoards: number;
  activeBoards: number;
  totalMembers: number;
  upcomingSessions: ReviewSession[];
  pendingReviews: number;
  recentDecisions: EthicalDecision[];
  activeAppeals: number;
  boardPerformance: BoardPerformance;
  reviewBacklog: number;
  averageReviewTime: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const boards = new Map<string, EthicsReviewBoard>();

// ─── Board Management ──────────────────────────────────────────────────────────

/**
 * Create ethics review board
 */
export async function createEthicsReviewBoard(
  organizationId: string,
  board: Omit<EthicsReviewBoard, 'id' | 'sessions' | 'decisions' | 'appeals' | 'performance' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<EthicsReviewBoard> {
  const id = `board_${randomUUID()}`;
  const now = new Date().toISOString();

  const newBoard: EthicsReviewBoard = {
    ...board,
    id,
    organizationId,
    sessions: [],
    decisions: [],
    appeals: [],
    performance: {
      totalReviews: 0,
      averageReviewTime: 0,
      approvalRate: 0,
      appealRate: 0,
      overturnRate: 0,
      memberParticipation: 0,
      metrics: [],
      trends: [],
    },
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  boards.set(id, newBoard);
  return newBoard;
}

/**
 * Update ethics review board
 */
export async function updateEthicsReviewBoard(
  boardId: string,
  updates: Partial<Omit<EthicsReviewBoard, 'id' | 'organizationId' | 'createdAt'>>
): Promise<EthicsReviewBoard | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const updated: EthicsReviewBoard = {
    ...board,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  boards.set(boardId, updated);
  return updated;
}

/**
 * Add board member
 */
export async function addBoardMember(
  boardId: string,
  member: Omit<BoardMember, 'id' | 'attendance' | 'votingHistory'>
): Promise<BoardMember | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const newMember: BoardMember = {
    ...member,
    id: `member_${randomUUID()}`,
    attendance: {
      totalSessions: 0,
      attendedSessions: 0,
      attendanceRate: 0,
      absences: [],
    },
    votingHistory: [],
  };

  board.members.push(newMember);

  if (member.role === 'chairperson') {
    board.chairperson = newMember.id;
  }

  board.updatedAt = new Date().toISOString();
  boards.set(boardId, board);

  return newMember;
}

/**
 * Remove board member
 */
export async function removeBoardMember(
  boardId: string,
  memberId: string,
  reason: string
): Promise<boolean> {
  const board = boards.get(boardId);
  if (!board) return false;

  const memberIndex = board.members.findIndex((m) => m.id === memberId);
  if (memberIndex === -1) return false;

  board.members[memberIndex].status = 'inactive';
  board.updatedAt = new Date().toISOString();

  if (board.chairperson === memberId) {
    board.chairperson = undefined;
  }

  boards.set(boardId, board);
  return true;
}

/**
 * Get ethics review board by ID
 */
export async function getEthicsReviewBoard(boardId: string): Promise<EthicsReviewBoard | null> {
  return boards.get(boardId) || null;
}

/**
 * List ethics review boards for an organization
 */
export async function listEthicsReviewBoards(
  organizationId: string,
  filters?: { status?: BoardStatus; type?: BoardType }
): Promise<EthicsReviewBoard[]> {
  const allBoards = Array.from(boards.values()).filter(
    (b) => b.organizationId === organizationId
  );

  return allBoards.filter((b) => {
    if (filters?.status && b.status !== filters.status) return false;
    if (filters?.type && b.type !== filters.type) return false;
    return true;
  });
}

// ─── Review Session Management ─────────────────────────────────────────────────

/**
 * Create review session
 */
export async function createReviewSession(
  boardId: string,
  session: Omit<ReviewSession, 'id' | 'boardId' | 'reviews' | 'decisions' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<ReviewSession | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const sessionNumber = `${board.name.slice(0, 3).toUpperCase()}-${board.sessions.length + 1}`;

  const newSession: ReviewSession = {
    ...session,
    id: `session_${randomUUID()}`,
    boardId,
    sessionNumber,
    reviews: [],
    decisions: [],
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  board.sessions.push(newSession);
  board.updatedAt = newSession.createdAt;

  boards.set(boardId, board);
  return newSession;
}

/**
 * Add review to session
 */
export async function addReviewToSession(
  boardId: string,
  sessionId: string,
  review: Omit<EthicalReview, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>
): Promise<EthicalReview | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const session = board.sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  const newReview: EthicalReview = {
    ...review,
    id: `review_${randomUUID()}`,
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  session.reviews.push(newReview);
  session.updatedAt = newReview.createdAt;

  boards.set(boardId, board);
  return newReview;
}

/**
 * Record vote
 */
export async function recordVote(
  boardId: string,
  sessionId: string,
  decisionId: string,
  vote: Omit<Vote, 'timestamp'>
): Promise<Vote | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const decision = board.decisions.find((d) => d.id === decisionId);
  if (!decision) return null;

  const newVote: Vote = {
    ...vote,
    timestamp: new Date().toISOString(),
  };

  decision.votes.push(newVote);

  // Update vote summary
  const approve = decision.votes.filter((v) => v.vote === 'approve').length;
  const reject = decision.votes.filter((v) => v.vote === 'reject').length;
  const abstain = decision.votes.filter((v) => v.vote === 'abstain').length;
  const recuse = decision.votes.filter((v) => v.vote === 'recuse').length;
  const totalVotes = approve + reject + abstain;

  decision.voteSummary = {
    totalVotes,
    approve,
    reject,
    abstain,
    recuse,
    approvalPercentage: totalVotes > 0 ? (approve / totalVotes) * 100 : 0,
    passed: (approve / totalVotes) * 100 >= board.charter.votingRules.approvalThreshold,
    quorumMet: totalVotes >= board.members.length * (board.charter.quorumRequirement / 100),
  };

  // Update member voting history
  const member = board.members.find((m) => m.id === vote.memberId);
  if (member) {
    member.votingHistory.push({
      sessionId,
      decisionId,
      vote: vote.vote,
      rationale: vote.rationale,
      timestamp: newVote.timestamp,
    });
  }

  decision.updatedAt = newVote.timestamp;
  board.updatedAt = newVote.timestamp;

  boards.set(boardId, board);
  return newVote;
}

/**
 * Create ethical decision
 */
export async function createEthicalDecision(
  boardId: string,
  decision: Omit<EthicalDecision, 'id' | 'boardId' | 'votes' | 'voteSummary' | 'createdAt' | 'updatedAt'>
): Promise<EthicalDecision | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const newDecision: EthicalDecision = {
    ...decision,
    id: `decision_${randomUUID()}`,
    boardId,
    votes: [],
    voteSummary: {
      totalVotes: 0,
      approve: 0,
      reject: 0,
      abstain: 0,
      recuse: 0,
      approvalPercentage: 0,
      passed: false,
      quorumMet: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  board.decisions.push(newDecision);

  const session = board.sessions.find((s) => s.id === decision.sessionId);
  if (session) {
    session.decisions.push(newDecision.id);
  }

  board.updatedAt = newDecision.createdAt;
  boards.set(boardId, board);

  return newDecision;
}

/**
 * Submit appeal
 */
export async function submitAppeal(
  boardId: string,
  appeal: Omit<EthicalAppeal, 'id' | 'boardId' | 'status' | 'timeline' | 'documentation'>
): Promise<EthicalAppeal | null> {
  const board = boards.get(boardId);
  if (!board) return null;

  const newAppeal: EthicalAppeal = {
    ...appeal,
    id: `appeal_${randomUUID()}`,
    boardId,
    status: 'submitted',
    timeline: {
      submittedAt: new Date().toISOString(),
    },
    documentation: {
      appealBrief: '',
      supportingDocuments: [],
    },
  };

  board.appeals.push(newAppeal);

  const decision = board.decisions.find((d) => d.id === appeal.originalDecisionId);
  if (decision) {
    decision.appealed = true;
    decision.appealId = newAppeal.id;
    decision.status = 'appealed';
  }

  board.updatedAt = newAppeal.timeline.submittedAt;
  boards.set(boardId, board);

  return newAppeal;
}

// ─── Board Dashboard ───────────────────────────────────────────────────────────

/**
 * Get ethics board dashboard
 */
export async function getEthicsBoardDashboard(organizationId: string): Promise<EthicsBoardDashboard> {
  const allBoards = await listEthicsReviewBoards(organizationId);
  const activeBoards = allBoards.filter((b) => b.status === 'active');

  const totalMembers = activeBoards.reduce((sum, b) => sum + b.members.filter((m) => m.status === 'active').length, 0);

  const allSessions = activeBoards.flatMap((b) => b.sessions);
  const upcomingSessions = allSessions
    .filter((s) => s.status === 'scheduled' && new Date(s.scheduledDate) > new Date())
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 5);

  const allReviews = allSessions.flatMap((s) => s.reviews);
  const pendingReviews = allReviews.filter((r) => !['decided', 'closed'].includes(r.status)).length;

  const allDecisions = activeBoards.flatMap((b) => b.decisions);
  const recentDecisions = allDecisions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const allAppeals = activeBoards.flatMap((b) => b.appeals);
  const activeAppeals = allAppeals.filter((a) => !['decided', 'withdrawn', 'rejected'].includes(a.status)).length;

  // Aggregate performance metrics
  const totalReviews = allBoards.reduce((sum, b) => sum + b.performance.totalReviews, 0);
  const avgReviewTime = allBoards.length > 0
    ? allBoards.reduce((sum, b) => sum + b.performance.averageReviewTime, 0) / allBoards.length
    : 0;

  const approvedDecisions = allDecisions.filter((d) => ['approved', 'conditionally-approved'].includes(d.outcome)).length;
  const approvalRate = allDecisions.length > 0 ? (approvedDecisions / allDecisions.length) * 100 : 0;

  const appealedDecisions = allDecisions.filter((d) => d.appealed).length;
  const appealRate = allDecisions.length > 0 ? (appealedDecisions / allDecisions.length) * 100 : 0;

  const overturnedAppeals = allAppeals.filter((a) => a.status === 'decided').length;
  const overturnRate = appealedDecisions > 0 ? (overturnedAppeals / appealedDecisions) * 100 : 0;

  const totalParticipation = activeBoards.reduce((sum, b) => {
    return sum + b.members.reduce((mSum, m) => mSum + m.attendance.attendanceRate, 0);
  }, 0);
  const memberParticipation = totalMembers > 0 ? totalParticipation / totalMembers : 0;

  const boardPerformance: BoardPerformance = {
    totalReviews,
    averageReviewTime: Math.round(avgReviewTime),
    approvalRate: Math.round(approvalRate),
    appealRate: Math.round(appealRate),
    overturnRate: Math.round(overturnRate),
    memberParticipation: Math.round(memberParticipation),
    metrics: [],
    trends: [],
  };

  return {
    organizationId,
    totalBoards: allBoards.length,
    activeBoards: activeBoards.length,
    totalMembers,
    upcomingSessions,
    pendingReviews,
    recentDecisions,
    activeAppeals,
    boardPerformance,
    reviewBacklog: pendingReviews,
    averageReviewTime: Math.round(avgReviewTime),
  };
}
