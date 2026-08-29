/**
 * Module 96: AI Model Certification Service
 * WINDELS AI OS - Phase 1
 * 
 * Provides multi-standard model certification against regulatory, fairness, safety,
 * and performance standards. Manages certification lifecycle including issuance,
 * renewal, suspension, and revocation with badge management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CertificationStandard {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  category: CertificationCategory;
  version: string;
  status: StandardStatus;
  requirements: CertificationRequirement[];
  scoringConfig: ScoringConfig;
  validityDays: number;
  renewalDaysBefore: number;
  createdAt: string;
  updatedAt: string;
}

export type CertificationCategory =
  | 'regulatory'
  | 'fairness'
  | 'safety'
  | 'performance'
  | 'security'
  | 'privacy'
  | 'ethical'
  | 'industry_specific';

export type StandardStatus = 'draft' | 'active' | 'deprecated' | 'archived';

export interface CertificationRequirement {
  id: string;
  name: string;
  description: string;
  type: RequirementType;
  weight: number;
  threshold: number;
  validationMethod: string;
  evidence?: string[];
  mandatory: boolean;
}

export type RequirementType =
  | 'metric_threshold'
  | 'policy_compliance'
  | 'test_pass'
  | 'documentation'
  | 'audit_trail'
  | 'human_review';

export interface ScoringConfig {
  minPassScore: number;
  maxScore: number;
  weighted: boolean;
  allowPartialPass: boolean;
}

export interface ModelCertification {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  standardId: string;
  standardName: string;
  status: CertificationStatus;
  certificationDate: string;
  expirationDate: string;
  score: CertificationScore;
  requirements: RequirementResult[];
  badges: CertificationBadge[];
  issuedBy: string;
  reviewedBy?: string;
  notes?: string;
  artifacts: CertificationArtifact[];
  history: CertificationEvent[];
  createdAt: string;
  updatedAt: string;
}

export type CertificationStatus =
  | 'pending'
  | 'under_review'
  | 'certified'
  | 'conditionally_certified'
  | 'suspended'
  | 'revoked'
  | 'expired'
  | 'renewed';

export interface CertificationScore {
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: CertificationGrade;
  breakdown: ScoreBreakdown[];
}

export type CertificationGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface ScoreBreakdown {
  category: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
}

export interface RequirementResult {
  requirementId: string;
  requirementName: string;
  passed: boolean;
  score: number;
  maxScore: number;
  evidence?: string;
  notes?: string;
  validatedAt: string;
  validatedBy: string;
}

export interface CertificationBadge {
  id: string;
  name: string;
  icon: string;
  color: string;
  level: BadgeLevel;
  issuedAt: string;
  expiresAt: string;
  metadata: Record<string, any>;
}

export type BadgeLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface CertificationArtifact {
  id: string;
  name: string;
  type: 'report' | 'evidence' | 'test_results' | 'audit_log';
  path: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CertificationEvent {
  id: string;
  type: EventType;
  description: string;
  timestamp: string;
  performedBy: string;
  details?: Record<string, any>;
}

export type EventType =
  | 'certification_issued'
  | 'certification_renewed'
  | 'certification_suspended'
  | 'certification_revoked'
  | 'certification_expired'
  | 'review_requested'
  | 'review_completed'
  | 'badge_issued'
  | 'badge_revoked';

export interface CertificationRequest {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  standardId: string;
  requestedBy: string;
  status: RequestStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  estimatedCompletion?: string;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus =
  | 'submitted'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const certificationStandards = new Map<string, CertificationStandard>();
const modelCertifications = new Map<string, ModelCertification>();
const certificationRequests = new Map<string, CertificationRequest>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateGrade(percentage: number): CertificationGrade {
  if (percentage >= 95) return 'A+';
  if (percentage >= 90) return 'A';
  if (percentage >= 85) return 'B+';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

function determineBadgeLevel(percentage: number): BadgeLevel {
  if (percentage >= 95) return 'platinum';
  if (percentage >= 85) return 'gold';
  if (percentage >= 75) return 'silver';
  return 'bronze';
}

function generateBadge(
  standardName: string,
  level: BadgeLevel,
  expirationDate: string
): CertificationBadge {
  const colorMap: Record<BadgeLevel, string> = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
  };
  
  return {
    id: randomUUID(),
    name: `${standardName} - ${level.charAt(0).toUpperCase() + level.slice(1)}`,
    icon: `badge_${level}_${standardName.toLowerCase().replace(/\s+/g, '_')}`,
    color: colorMap[level],
    level,
    issuedAt: new Date().toISOString(),
    expiresAt: expirationDate,
    metadata: { standard: standardName, level },
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createCertificationStandard(params: {
  organizationId: string;
  name: string;
  description?: string;
  category: CertificationCategory;
  version: string;
  requirements: Omit<CertificationRequirement, 'id'>[];
  scoringConfig: ScoringConfig;
  validityDays: number;
  renewalDaysBefore?: number;
}): CertificationStandard {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const requirements: CertificationRequirement[] = params.requirements.map(req => ({
    id: randomUUID(),
    name: req.name,
    description: req.description,
    type: req.type,
    weight: req.weight,
    threshold: req.threshold,
    validationMethod: req.validationMethod,
    evidence: req.evidence,
    mandatory: req.mandatory ?? true,
  }));
  
  const standard: CertificationStandard = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    category: params.category,
    version: params.version,
    status: 'draft',
    requirements,
    scoringConfig: params.scoringConfig,
    validityDays: params.validityDays,
    renewalDaysBefore: params.renewalDaysBefore || 30,
    createdAt: now,
    updatedAt: now,
  };
  
  certificationStandards.set(id, standard);
  return standard;
}

export function getCertificationStandard(id: string): CertificationStandard | undefined {
  return certificationStandards.get(id);
}

export function listCertificationStandards(organizationId: string): CertificationStandard[] {
  return Array.from(certificationStandards.values()).filter(
    s => s.organizationId === organizationId
  );
}

export function activateStandard(standardId: string): CertificationStandard {
  const standard = certificationStandards.get(standardId);
  if (!standard) {
    throw new Error(`Certification standard ${standardId} not found`);
  }
  
  if (standard.status !== 'draft') {
    throw new Error(`Standard ${standardId} is not in draft state`);
  }
  
  standard.status = 'active';
  standard.updatedAt = new Date().toISOString();
  
  return standard;
}

export function submitCertificationRequest(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  standardId: string;
  requestedBy: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}): CertificationRequest {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const request: CertificationRequest = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    standardId: params.standardId,
    requestedBy: params.requestedBy,
    status: 'submitted',
    priority: params.priority || 'medium',
    createdAt: now,
    updatedAt: now,
  };
  
  certificationRequests.set(id, request);
  return request;
}

export function assignCertificationRequest(
  requestId: string,
  assignedTo: string,
  estimatedCompletion: string
): CertificationRequest {
  const request = certificationRequests.get(requestId);
  if (!request) {
    throw new Error(`Certification request ${requestId} not found`);
  }
  
  if (request.status !== 'submitted') {
    throw new Error(`Request ${requestId} is not in submitted state`);
  }
  
  request.status = 'assigned';
  request.assignedTo = assignedTo;
  request.estimatedCompletion = estimatedCompletion;
  request.updatedAt = new Date().toISOString();
  
  return request;
}

export function performCertificationReview(params: {
  requestId: string;
  reviewedBy: string;
  requirementResults: Array<{
    requirementId: string;
    passed: boolean;
    score: number;
    evidence?: string;
    notes?: string;
  }>;
  notes?: string;
}): ModelCertification {
  const request = certificationRequests.get(params.requestId);
  if (!request) {
    throw new Error(`Certification request ${params.requestId} not found`);
  }
  
  if (request.status !== 'assigned' && request.status !== 'in_progress') {
    throw new Error(`Request ${params.requestId} is not ready for review`);
  }
  
  const standard = certificationStandards.get(request.standardId);
  if (!standard) {
    throw new Error(`Certification standard ${request.standardId} not found`);
  }
  
  const now = new Date().toISOString();
  const certificationId = randomUUID();
  
  // Calculate scores
  const requirementResults: RequirementResult[] = params.requirementResults.map(result => {
    const req = standard.requirements.find(r => r.id === result.requirementId);
    return {
      requirementId: result.requirementId,
      requirementName: req?.name || 'Unknown',
      passed: result.passed,
      score: result.score,
      maxScore: req?.threshold || 100,
      evidence: result.evidence,
      notes: result.notes,
      validatedAt: now,
      validatedBy: params.reviewedBy,
    };
  });
  
  const totalScore = requirementResults.reduce((sum, r) => sum + r.score, 0);
  const maxScore = requirementResults.reduce((sum, r) => sum + r.maxScore, 0);
  const percentage = (totalScore / maxScore) * 100;
  const grade = calculateGrade(percentage);
  
  const score: CertificationScore = {
    totalScore,
    maxScore,
    percentage,
    grade,
    breakdown: standard.requirements.map(req => {
      const result = requirementResults.find(r => r.requirementId === req.id);
      return {
        category: req.name,
        score: result?.score || 0,
        maxScore: req.threshold,
        percentage: result ? (result.score / req.threshold) * 100 : 0,
        passed: result?.passed || false,
      };
    }),
  };
  
  // Determine certification status
  const allMandatoryPassed = requirementResults
    .filter(r => {
      const req = standard.requirements.find(s => s.id === r.requirementId);
      return req?.mandatory;
    })
    .every(r => r.passed);
  
  const status: CertificationStatus = allMandatoryPassed && percentage >= standard.scoringConfig.minPassScore
    ? 'certified'
    : allMandatoryPassed && standard.scoringConfig.allowPartialPass
    ? 'conditionally_certified'
    : 'pending';
  
  // Calculate expiration date
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + standard.validityDays);
  
  // Generate badge if certified
  const badges: CertificationBadge[] = [];
  if (status === 'certified' || status === 'conditionally_certified') {
    const badgeLevel = determineBadgeLevel(percentage);
    badges.push(generateBadge(standard.name, badgeLevel, expirationDate.toISOString()));
  }
  
  const certification: ModelCertification = {
    id: certificationId,
    organizationId: request.organizationId,
    modelId: request.modelId,
    modelVersion: request.modelVersion,
    standardId: request.standardId,
    standardName: standard.name,
    status,
    certificationDate: now,
    expirationDate: expirationDate.toISOString(),
    score,
    requirements: requirementResults,
    badges,
    issuedBy: params.reviewedBy,
    reviewedBy: params.reviewedBy,
    notes: params.notes,
    artifacts: [],
    history: [
      {
        id: randomUUID(),
        type: 'certification_issued',
        description: `Certification issued with status: ${status}`,
        timestamp: now,
        performedBy: params.reviewedBy,
        details: { score: percentage, grade },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  
  modelCertifications.set(certificationId, certification);
  
  // Update request status
  request.status = 'completed';
  request.updatedAt = now;
  
  return certification;
}

export function getModelCertification(id: string): ModelCertification | undefined {
  return modelCertifications.get(id);
}

export function listModelCertifications(organizationId: string): ModelCertification[] {
  return Array.from(modelCertifications.values()).filter(
    c => c.organizationId === organizationId
  );
}

export function renewCertification(certificationId: string, renewedBy: string): ModelCertification {
  const certification = modelCertifications.get(certificationId);
  if (!certification) {
    throw new Error(`Certification ${certificationId} not found`);
  }
  
  if (certification.status !== 'certified' && certification.status !== 'conditionally_certified') {
    throw new Error(`Certification ${certificationId} cannot be renewed`);
  }
  
  const now = new Date().toISOString();
  const standard = certificationStandards.get(certification.standardId);
  if (!standard) {
    throw new Error(`Standard ${certification.standardId} not found`);
  }
  
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + standard.validityDays);
  
  certification.status = 'renewed';
  certification.certificationDate = now;
  certification.expirationDate = expirationDate.toISOString();
  
  // Update badges
  certification.badges.forEach(badge => {
    badge.expiresAt = expirationDate.toISOString();
  });
  
  certification.history.push({
    id: randomUUID(),
    type: 'certification_renewed',
    description: 'Certification renewed',
    timestamp: now,
    performedBy: renewedBy,
  });
  
  certification.updatedAt = now;
  
  return certification;
}

export function suspendCertification(
  certificationId: string,
  suspendedBy: string,
  reason: string
): ModelCertification {
  const certification = modelCertifications.get(certificationId);
  if (!certification) {
    throw new Error(`Certification ${certificationId} not found`);
  }
  
  if (certification.status !== 'certified' && certification.status !== 'conditionally_certified') {
    throw new Error(`Certification ${certificationId} cannot be suspended`);
  }
  
  const now = new Date().toISOString();
  certification.status = 'suspended';
  
  certification.history.push({
    id: randomUUID(),
    type: 'certification_suspended',
    description: `Certification suspended: ${reason}`,
    timestamp: now,
    performedBy: suspendedBy,
    details: { reason },
  });
  
  certification.updatedAt = now;
  
  return certification;
}

export function revokeCertification(
  certificationId: string,
  revokedBy: string,
  reason: string
): ModelCertification {
  const certification = modelCertifications.get(certificationId);
  if (!certification) {
    throw new Error(`Certification ${certificationId} not found`);
  }
  
  const now = new Date().toISOString();
  certification.status = 'revoked';
  
  certification.history.push({
    id: randomUUID(),
    type: 'certification_revoked',
    description: `Certification revoked: ${reason}`,
    timestamp: now,
    performedBy: revokedBy,
    details: { reason },
  });
  
  certification.updatedAt = now;
  
  return certification;
}

export function getCertificationStatus(
  modelId: string,
  modelVersion: string
): {
  certifications: ModelCertification[];
  activeCertifications: number;
  expiredCertifications: number;
  suspendedCertifications: number;
  badges: CertificationBadge[];
} {
  const certifications = Array.from(modelCertifications.values()).filter(
    c => c.modelId === modelId && c.modelVersion === modelVersion
  );
  
  const activeCertifications = certifications.filter(
    c => c.status === 'certified' || c.status === 'conditionally_certified' || c.status === 'renewed'
  ).length;
  
  const expiredCertifications = certifications.filter(c => c.status === 'expired').length;
  const suspendedCertifications = certifications.filter(c => c.status === 'suspended').length;
  
  const badges = certifications.flatMap(c => c.badges);
  
  return {
    certifications,
    activeCertifications,
    expiredCertifications,
    suspendedCertifications,
    badges,
  };
}
