/**
 * Module 66: AI Contract Management Service
 *
 * Provides comprehensive contract lifecycle management including contract creation,
 * SLA definition and tracking, renewal automation, compliance monitoring, and
 * document management for AI vendor agreements.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIContract {
  id: string;
  organizationId: string;
  contractNumber: string;
  vendorId: string;
  vendorName: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  effectiveDate: string;
  expirationDate: string;
  renewalType: RenewalType;
  renewalNoticeDays: number;
  value: ContractValue;
  terms: ContractTerms;
  slas: SLA[];
  documents: ContractDocument[];
  amendments: ContractAmendment[];
  compliance: ContractCompliance;
  performance: ContractPerformance;
  contacts: ContractContact[];
  metadata?: Record<string, any>;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContractType =
  | 'saas'
  | 'paas'
  | 'iaas'
  | 'license'
  | 'services'
  | 'consulting'
  | 'support'
  | 'sla'
  | 'master-agreement'
  | 'other';

export type ContractStatus =
  | 'draft'
  | 'under-review'
  | 'negotiation'
  | 'pending-approval'
  | 'approved'
  | 'active'
  | 'expiring-soon'
  | 'expired'
  | 'terminated'
  | 'renewed';

export type RenewalType = 'auto-renew' | 'manual-renew' | 'no-renewal';

export interface ContractValue {
  totalValue: number;
  currency: string;
  paymentTerms: PaymentTerms;
  billingCycle: BillingCycle;
  priceAdjustments?: PriceAdjustment[];
}

export interface PaymentTerms {
  type: 'net-30' | 'net-60' | 'net-90' | 'prepaid' | 'milestone' | 'custom';
  description: string;
  latePaymentPenalty?: number; // percentage
}

export type BillingCycle = 'monthly' | 'quarterly' | 'annually' | 'one-time' | 'usage-based';

export interface PriceAdjustment {
  effectiveDate: string;
  adjustmentType: 'percentage' | 'fixed';
  adjustmentValue: number;
  reason: string;
}

export interface ContractTerms {
  terminationNoticeDays: number;
  terminationForConvenience: boolean;
  liabilityCap?: number;
  indemnification: boolean;
  confidentiality: boolean;
  dataOwnership: string;
  dataResidency?: string[];
  ipRights: string;
  warranties: Warranty[];
  limitations: string[];
  governingLaw: string;
  disputeResolution: string;
  forceMajeure: boolean;
  customTerms?: CustomTerm[];
}

export interface Warranty {
  type: string;
  duration: string;
  description: string;
}

export interface CustomTerm {
  id: string;
  title: string;
  description: string;
  category: string;
}

export interface SLA {
  id: string;
  name: string;
  description: string;
  metrics: SLAMetric[];
  penalties: SLAPenalty[];
  reportingFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  exclusions: string[];
  status: 'active' | 'suspended' | 'breached';
}

export interface SLAMetric {
  id: string;
  name: string;
  description: string;
  type: 'availability' | 'performance' | 'response-time' | 'resolution-time' | 'quality' | 'custom';
  target: number;
  unit: string;
  measurementMethod: string;
  current?: number;
  compliance?: number; // percentage
  trend?: 'improving' | 'stable' | 'degrading';
}

export interface SLAPenalty {
  id: string;
  metricId: string;
  threshold: number;
  penaltyType: 'credit' | 'refund' | 'service-extension' | 'termination-right';
  penaltyValue: number;
  description: string;
}

export interface ContractDocument {
  id: string;
  name: string;
  type: DocumentType;
  version: string;
  url: string;
  uploadDate: string;
  uploadedBy: string;
  status: 'draft' | 'final' | 'signed' | 'archived';
  signatures?: DocumentSignature[];
}

export type DocumentType =
  | 'master-agreement'
  | 'statement-of-work'
  | 'amendment'
  | 'addendum'
  | 'sla'
  | 'dpa'
  | 'nda'
  | 'certificate'
  | 'invoice'
  | 'other';

export interface DocumentSignature {
  signerName: string;
  signerRole: string;
  signerEmail: string;
  signedAt: string;
  signatureMethod: 'electronic' | 'digital' | 'wet-ink';
}

export interface ContractAmendment {
  id: string;
  amendmentNumber: string;
  title: string;
  description: string;
  effectiveDate: string;
  changes: AmendmentChange[];
  status: 'draft' | 'under-review' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface AmendmentChange {
  section: string;
  oldText: string;
  newText: string;
  reason: string;
}

export interface ContractCompliance {
  overallStatus: 'compliant' | 'non-compliant' | 'at-risk';
  complianceScore: number; // 0-100
  requirements: ComplianceRequirement[];
  audits: ComplianceAudit[];
  issues: ComplianceIssue[];
  lastReviewedAt?: string;
  nextReviewDate?: string;
}

export interface ComplianceRequirement {
  id: string;
  requirement: string;
  category: 'regulatory' | 'security' | 'privacy' | 'quality' | 'operational';
  status: 'compliant' | 'non-compliant' | 'partial' | 'not-applicable';
  evidence?: string;
  lastVerifiedAt?: string;
  nextVerificationDate?: string;
}

export interface ComplianceAudit {
  id: string;
  auditDate: string;
  auditor: string;
  scope: string;
  findings: AuditFinding[];
  overallResult: 'pass' | 'fail' | 'conditional-pass';
  recommendations: string[];
  reportUrl?: string;
}

export interface AuditFinding {
  id: string;
  severity: 'info' | 'minor' | 'major' | 'critical';
  finding: string;
  recommendation: string;
  status: 'open' | 'in-progress' | 'resolved' | 'accepted';
  resolvedAt?: string;
}

export interface ComplianceIssue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  reportedAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface ContractPerformance {
  overallRating: 'excellent' | 'good' | 'satisfactory' | 'poor' | 'unacceptable';
  score: number; // 0-100
  reviews: PerformanceReview[];
  metrics: PerformanceMetric[];
  issues: PerformanceIssue[];
  lastReviewDate?: string;
  nextReviewDate?: string;
}

export interface PerformanceReview {
  id: string;
  reviewDate: string;
  reviewerId: string;
  reviewerName: string;
  period: { start: string; end: string };
  scores: ReviewScore[];
  overallScore: number;
  comments: string;
  recommendations: string[];
}

export interface ReviewScore {
  category: string;
  score: number;
  weight: number;
  weightedScore: number;
  comments?: string;
}

export interface PerformanceMetric {
  id: string;
  name: string;
  target: number;
  actual: number;
  unit: string;
  period: string;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface PerformanceIssue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  reportedAt: string;
  resolvedAt?: string;
  impact: string;
  resolution?: string;
}

export interface ContractContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  organization: 'vendor' | 'internal';
  isPrimary: boolean;
}

export interface RenewalReminder {
  id: string;
  contractId: string;
  contractNumber: string;
  vendorName: string;
  expirationDate: string;
  daysUntilExpiration: number;
  renewalType: RenewalType;
  status: 'pending' | 'sent' | 'acknowledged' | 'completed';
  sentAt?: string;
  acknowledgedAt?: string;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const contracts = new Map<string, AIContract>();
const renewalReminders = new Map<string, RenewalReminder>();
const contractCounter = new Map<string, number>();

// ─── Contract Management ───────────────────────────────────────────────────────

/**
 * Create a new contract
 */
export async function createContract(
  organizationId: string,
  contract: Omit<AIContract, 'id' | 'contractNumber' | 'compliance' | 'performance' | 'amendments' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<AIContract> {
  const id = `contract_${randomUUID()}`;
  const counter = (contractCounter.get(organizationId) || 0) + 1;
  contractCounter.set(organizationId, counter);

  const now = new Date().toISOString();

  const newContract: AIContract = {
    ...contract,
    id,
    organizationId,
    contractNumber: `CTR-${String(counter).padStart(5, '0')}`,
    amendments: [],
    compliance: {
      overallStatus: 'compliant',
      complianceScore: 100,
      requirements: [],
      audits: [],
      issues: [],
    },
    performance: {
      overallRating: 'satisfactory',
      score: 75,
      reviews: [],
      metrics: [],
      issues: [],
    },
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  contracts.set(id, newContract);

  // Create renewal reminder if applicable
  if (contract.renewalType !== 'no-renewal') {
    await createRenewalReminder(newContract);
  }

  return newContract;
}

/**
 * Update contract
 */
export async function updateContract(
  contractId: string,
  updates: Partial<Omit<AIContract, 'id' | 'contractNumber' | 'organizationId' | 'createdAt'>>
): Promise<AIContract | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const updated: AIContract = {
    ...contract,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  contracts.set(contractId, updated);
  return updated;
}

/**
 * Approve contract
 */
export async function approveContract(
  contractId: string,
  approvedBy: string
): Promise<AIContract | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  contract.status = 'approved';
  contract.approvedBy = approvedBy;
  contract.approvedAt = new Date().toISOString();
  contract.updatedAt = contract.approvedAt;

  contracts.set(contractId, contract);
  return contract;
}

/**
 * Activate contract
 */
export async function activateContract(contractId: string): Promise<AIContract | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  contract.status = 'active';
  contract.updatedAt = new Date().toISOString();

  contracts.set(contractId, contract);
  return contract;
}

/**
 * Terminate contract
 */
export async function terminateContract(
  contractId: string,
  reason: string
): Promise<AIContract | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  contract.status = 'terminated';
  contract.updatedAt = new Date().toISOString();
  contract.metadata = {
    ...contract.metadata,
    terminationReason: reason,
    terminatedAt: contract.updatedAt,
  };

  contracts.set(contractId, contract);
  return contract;
}

/**
 * Get contract by ID
 */
export async function getContract(contractId: string): Promise<AIContract | null> {
  return contracts.get(contractId) || null;
}

/**
 * List contracts for an organization
 */
export async function listContracts(
  organizationId: string,
  filters?: { vendorId?: string; status?: ContractStatus; type?: ContractType }
): Promise<AIContract[]> {
  const allContracts = Array.from(contracts.values()).filter(
    (c) => c.organizationId === organizationId
  );

  return allContracts.filter((c) => {
    if (filters?.vendorId && c.vendorId !== filters.vendorId) return false;
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.type && c.type !== filters.type) return false;
    return true;
  });
}

// ─── SLA Management ────────────────────────────────────────────────────────────

/**
 * Add SLA to contract
 */
export async function addSLA(
  contractId: string,
  sla: Omit<SLA, 'id'>
): Promise<SLA | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const newSLA: SLA = {
    ...sla,
    id: `sla_${randomUUID()}`,
  };

  contract.slas.push(newSLA);
  contract.updatedAt = new Date().toISOString();

  contracts.set(contractId, contract);
  return newSLA;
}

/**
 * Update SLA metric
 */
export async function updateSLAMetric(
  contractId: string,
  slaId: string,
  metricId: string,
  currentValue: number
): Promise<SLAMetric | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const sla = contract.slas.find((s) => s.id === slaId);
  if (!sla) return null;

  const metric = sla.metrics.find((m) => m.id === metricId);
  if (!metric) return null;

  metric.current = currentValue;
  metric.compliance = (currentValue / metric.target) * 100;

  // Determine trend
  if (metric.compliance >= 100) {
    metric.trend = 'improving';
  } else if (metric.compliance >= 90) {
    metric.trend = 'stable';
  } else {
    metric.trend = 'degrading';
  }

  // Check for breach
  if (metric.compliance < 90) {
    sla.status = 'breached';
  }

  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  return metric;
}

/**
 * Record SLA penalty
 */
export async function recordSLAPenalty(
  contractId: string,
  slaId: string,
  penaltyId: string,
  amount: number
): Promise<{ penalty: SLAPenalty; amount: number } | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const sla = contract.slas.find((s) => s.id === slaId);
  if (!sla) return null;

  const penalty = sla.penalties.find((p) => p.id === penaltyId);
  if (!penalty) return null;

  // In real implementation, this would create a credit/refund record
  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  return { penalty, amount };
}

// ─── Contract Amendments ───────────────────────────────────────────────────────

/**
 * Create contract amendment
 */
export async function createAmendment(
  contractId: string,
  amendment: Omit<ContractAmendment, 'id' | 'amendmentNumber' | 'createdAt'>
): Promise<ContractAmendment | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const amendmentNumber = `${contract.contractNumber}-A${contract.amendments.length + 1}`;

  const newAmendment: ContractAmendment = {
    ...amendment,
    id: `amendment_${randomUUID()}`,
    amendmentNumber,
    createdAt: new Date().toISOString(),
  };

  contract.amendments.push(newAmendment);
  contract.updatedAt = new Date().toISOString();

  contracts.set(contractId, contract);
  return newAmendment;
}

/**
 * Approve amendment
 */
export async function approveAmendment(
  contractId: string,
  amendmentId: string,
  approvedBy: string
): Promise<ContractAmendment | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const amendment = contract.amendments.find((a) => a.id === amendmentId);
  if (!amendment) return null;

  amendment.status = 'approved';
  amendment.approvedBy = approvedBy;
  amendment.approvedAt = new Date().toISOString();

  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  return amendment;
}

// ─── Compliance Management ─────────────────────────────────────────────────────

/**
 * Add compliance requirement
 */
export async function addComplianceRequirement(
  contractId: string,
  requirement: Omit<ComplianceRequirement, 'id'>
): Promise<ComplianceRequirement | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const newRequirement: ComplianceRequirement = {
    ...requirement,
    id: `req_${randomUUID()}`,
  };

  contract.compliance.requirements.push(newRequirement);
  contract.updatedAt = new Date().toISOString();

  contracts.set(contractId, contract);
  return newRequirement;
}

/**
 * Record compliance audit
 */
export async function recordComplianceAudit(
  contractId: string,
  audit: Omit<ComplianceAudit, 'id'>
): Promise<ComplianceAudit | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const newAudit: ComplianceAudit = {
    ...audit,
    id: `audit_${randomUUID()}`,
  };

  contract.compliance.audits.push(newAudit);
  contract.compliance.lastReviewedAt = audit.auditDate;

  // Update compliance score based on audit results
  const passCount = newAudit.findings.filter((f) => f.status === 'resolved').length;
  const totalFindings = newAudit.findings.length;
  contract.compliance.complianceScore = totalFindings > 0
    ? Math.round((passCount / totalFindings) * 100)
    : 100;

  contract.compliance.overallStatus = contract.compliance.complianceScore >= 90
    ? 'compliant'
    : contract.compliance.complianceScore >= 70
    ? 'at-risk'
    : 'non-compliant';

  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  return newAudit;
}

// ─── Performance Management ────────────────────────────────────────────────────

/**
 * Record performance review
 */
export async function recordPerformanceReview(
  contractId: string,
  review: Omit<PerformanceReview, 'id'>
): Promise<PerformanceReview | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const newReview: PerformanceReview = {
    ...review,
    id: `review_${randomUUID()}`,
  };

  // Calculate weighted scores
  const totalWeight = review.scores.reduce((sum, s) => sum + s.weight, 0);
  newReview.scores = review.scores.map((s) => ({
    ...s,
    weightedScore: s.score * (s.weight / totalWeight),
  }));

  newReview.overallScore = newReview.scores.reduce((sum, s) => sum + s.weightedScore, 0);

  contract.performance.reviews.push(newReview);
  contract.performance.score = newReview.overallScore;
  contract.performance.lastReviewDate = review.reviewDate;

  // Determine overall rating
  if (newReview.overallScore >= 90) {
    contract.performance.overallRating = 'excellent';
  } else if (newReview.overallScore >= 75) {
    contract.performance.overallRating = 'good';
  } else if (newReview.overallScore >= 60) {
    contract.performance.overallRating = 'satisfactory';
  } else if (newReview.overallScore >= 40) {
    contract.performance.overallRating = 'poor';
  } else {
    contract.performance.overallRating = 'unacceptable';
  }

  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  return newReview;
}

// ─── Renewal Management ────────────────────────────────────────────────────────

/**
 * Create renewal reminder
 */
async function createRenewalReminder(contract: AIContract): Promise<void> {
  const expirationDate = new Date(contract.expirationDate);
  const reminderDate = new Date(expirationDate);
  reminderDate.setDate(reminderDate.getDate() - contract.renewalNoticeDays);

  const daysUntilExpiration = Math.ceil(
    (expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const reminder: RenewalReminder = {
    id: `reminder_${randomUUID()}`,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    vendorName: contract.vendorName,
    expirationDate: contract.expirationDate,
    daysUntilExpiration,
    renewalType: contract.renewalType,
    status: 'pending',
  };

  renewalReminders.set(reminder.id, reminder);
}

/**
 * Get upcoming renewals
 */
export async function getUpcomingRenewals(
  organizationId: string,
  daysAhead: number = 90
): Promise<RenewalReminder[]> {
  const allReminders = Array.from(renewalReminders.values());
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  return allReminders
    .filter((r) => {
      const contract = contracts.get(r.contractId);
      return contract?.organizationId === organizationId;
    })
    .filter((r) => {
      const expirationDate = new Date(r.expirationDate);
      return expirationDate <= cutoffDate && r.status === 'pending';
    })
    .sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
}

/**
 * Send renewal reminder
 */
export async function sendRenewalReminder(reminderId: string): Promise<RenewalReminder | null> {
  const reminder = renewalReminders.get(reminderId);
  if (!reminder) return null;

  reminder.status = 'sent';
  reminder.sentAt = new Date().toISOString();

  renewalReminders.set(reminderId, reminder);
  return reminder;
}

// ─── Document Management ───────────────────────────────────────────────────────

/**
 * Add contract document
 */
export async function addContractDocument(
  contractId: string,
  document: Omit<ContractDocument, 'id' | 'uploadDate'>
): Promise<ContractDocument | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const newDocument: ContractDocument = {
    ...document,
    id: `doc_${randomUUID()}`,
    uploadDate: new Date().toISOString(),
  };

  contract.documents.push(newDocument);
  contract.updatedAt = new Date().toISOString();

  contracts.set(contractId, contract);
  return newDocument;
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get contract management statistics
 */
export async function getContractStats(organizationId: string): Promise<{
  totalContracts: number;
  activeContracts: number;
  expiringSoon: number;
  contractsByType: Record<ContractType, number>;
  contractsByStatus: Record<ContractStatus, number>;
  totalContractValue: number;
  averageContractValue: number;
  compliantContracts: number;
  nonCompliantContracts: number;
  averagePerformanceScore: number;
  upcomingRenewals: number;
}> {
  const orgContracts = await listContracts(organizationId);

  const contractsByType: Record<string, number> = {};
  const contractsByStatus: Record<string, number> = {};
  let totalValue = 0;
  let compliantCount = 0;
  let nonCompliantCount = 0;
  let totalPerformanceScore = 0;
  let expiringSoonCount = 0;

  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  for (const contract of orgContracts) {
    contractsByType[contract.type] = (contractsByType[contract.type] || 0) + 1;
    contractsByStatus[contract.status] = (contractsByStatus[contract.status] || 0) + 1;
    totalValue += contract.value.totalValue;

    if (contract.compliance.overallStatus === 'compliant') {
      compliantCount++;
    } else if (contract.compliance.overallStatus === 'non-compliant') {
      nonCompliantCount++;
    }

    totalPerformanceScore += contract.performance.score;

    const expirationDate = new Date(contract.expirationDate);
    if (expirationDate <= ninetyDaysFromNow && contract.status === 'active') {
      expiringSoonCount++;
    }
  }

  return {
    totalContracts: orgContracts.length,
    activeContracts: orgContracts.filter((c) => c.status === 'active').length,
    expiringSoon: expiringSoonCount,
    contractsByType: contractsByType as Record<ContractType, number>,
    contractsByStatus: contractsByStatus as Record<ContractStatus, number>,
    totalContractValue: totalValue,
    averageContractValue: orgContracts.length > 0 ? Math.round(totalValue / orgContracts.length) : 0,
    compliantContracts: compliantCount,
    nonCompliantContracts: nonCompliantCount,
    averagePerformanceScore: orgContracts.length > 0
      ? Math.round((totalPerformanceScore / orgContracts.length) * 100) / 100
      : 0,
    upcomingRenewals: (await getUpcomingRenewals(organizationId)).length,
  };
}
