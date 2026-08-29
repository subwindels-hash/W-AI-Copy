/**
 * Module 108: AI Model Privacy Controls Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive privacy controls for AI models including data anonymization,
 * consent management, privacy impact assessments, data retention policies, and
 * privacy compliance tracking (GDPR, CCPA, etc.).
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PrivacyPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  version: string;
  status: PolicyStatus;
  regulations: PrivacyRegulation[];
  dataCategories: DataCategory[];
  retentionPolicies: RetentionPolicy[];
  consentRequirements: ConsentRequirement[];
  effectiveDate: string;
  expiryDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type PolicyStatus = 'draft' | 'active' | 'deprecated' | 'archived';

export type PrivacyRegulation = 'GDPR' | 'CCPA' | 'HIPAA' | 'PIPEDA' | 'LGPD' | 'PDPA' | 'custom';

export interface DataCategory {
  id: string;
  name: string;
  type: DataType;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted' | 'pii' | 'phi';
  description: string;
  examples: string[];
  legalBasis: string[];
  retentionPeriod: number; // days
  anonymizationRequired: boolean;
  anonymizationMethod?: AnonymizationMethod;
}

export type DataType =
  | 'personal_data'
  | 'sensitive_data'
  | 'health_data'
  | 'financial_data'
  | 'biometric_data'
  | 'location_data'
  | 'behavioral_data'
  | 'inferred_data';

export type AnonymizationMethod =
  | 'k_anonymity'
  | 'l_diversity'
  | 'differential_privacy'
  | 'data_masking'
  | 'pseudonymization'
  | 'aggregation'
  | 'generalization';

export interface RetentionPolicy {
  id: string;
  dataCategory: string;
  retentionPeriod: number; // days
  action: 'delete' | 'anonymize' | 'archive';
  legalBasis: string;
  exceptions: string[];
}

export interface ConsentRequirement {
  id: string;
  purpose: string;
  dataCategories: string[];
  consentType: 'explicit' | 'implicit' | 'opt_out';
  withdrawalAllowed: boolean;
  granularity: 'broad' | 'specific' | 'granular';
  expiryPeriod?: number; // days
}

export interface ConsentRecord {
  id: string;
  organizationId: string;
  userId: string;
  policyId: string;
  policyVersion: string;
  consents: Consent[];
  status: 'active' | 'withdrawn' | 'expired';
  grantedAt: string;
  withdrawnAt?: string;
  expiresAt?: string;
  metadata: Record<string, any>;
}

export interface Consent {
  purposeId: string;
  granted: boolean;
  grantedAt?: string;
  withdrawnAt?: string;
  dataCategories: string[];
}

export interface DataSubjectRequest {
  id: string;
  organizationId: string;
  userId: string;
  requestType: DSARType;
  status: DSARStatus;
  description: string;
  submittedAt: string;
  deadline: string;
  completedAt?: string;
  processedBy?: string;
  response?: DSARResponse;
}

export type DSARType = 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';

export type DSARStatus = 'received' | 'in_progress' | 'completed' | 'rejected' | 'expired';

export interface DSARResponse {
  dataProvided?: any;
  actionsTaken: string[];
  reasons?: string;
  completedAt: string;
}

export interface PrivacyImpactAssessment {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  status: PIAStatus;
  assessment: PIAAssessment;
  risks: PIARisk[];
  mitigations: PIAMitigation[];
  recommendations: string[];
  completedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type PIAStatus = 'draft' | 'in_progress' | 'completed' | 'approved' | 'rejected';

export interface PIAAssessment {
  dataProcessing: DataProcessingDescription;
  necessityProportionality: NecessityAssessment;
  riskAssessment: RiskAssessment;
  stakeholderConsultation: StakeholderConsultation;
}

export interface DataProcessingDescription {
  purpose: string;
  dataCategories: string[];
  dataSubjects: string[];
  dataSources: string[];
  recipients: string[];
  transfers: DataTransfer[];
  retentionPeriod: number;
}

export interface DataTransfer {
  recipient: string;
  country: string;
  legalBasis: string;
  safeguards: string[];
}

export interface NecessityAssessment {
  necessity: boolean;
  proportionality: boolean;
  alternativeMethods: string[];
  justification: string;
}

export interface RiskAssessment {
  risks: PIARisk[];
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  likelihood: 'unlikely' | 'possible' | 'likely' | 'almost_certain';
  impact: 'negligible' | 'minor' | 'moderate' | 'major' | 'severe';
}

export interface PIARisk {
  id: string;
  category: string;
  description: string;
  likelihood: 'unlikely' | 'possible' | 'likely' | 'almost_certain';
  impact: 'negligible' | 'minor' | 'moderate' | 'major' | 'severe';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedRights: string[];
}

export interface PIAMitigation {
  riskId: string;
  measure: string;
  effectiveness: 'low' | 'medium' | 'high';
  implementationStatus: 'planned' | 'in_progress' | 'completed';
  responsibleParty: string;
  deadline?: string;
}

export interface StakeholderConsultation {
  consulted: boolean;
  stakeholders: string[];
  feedback: string[];
  concerns: string[];
}

export interface DataAnonymization {
  id: string;
  organizationId: string;
  modelId: string;
  dataCategory: string;
  method: AnonymizationMethod;
  configuration: AnonymizationConfig;
  status: 'active' | 'inactive' | 'testing';
  effectiveness: number; // 0-100
  lastApplied?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnonymizationConfig {
  k?: number; // for k-anonymity
  l?: number; // for l-diversity
  epsilon?: number; // for differential privacy
  maskingPattern?: string; // for data masking
  generalizationLevel?: 'low' | 'medium' | 'high';
}

export interface PrivacyCompliance {
  id: string;
  organizationId: string;
  regulation: PrivacyRegulation;
  status: 'compliant' | 'partial' | 'non_compliant';
  score: number; // 0-100
  requirements: ComplianceRequirement[];
  gaps: ComplianceGap[];
  lastAssessment: string;
  nextAssessment: string;
}

export interface ComplianceRequirement {
  id: string;
  article: string;
  title: string;
  description: string;
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_applicable';
  evidence?: string;
  lastVerified?: string;
}

export interface ComplianceGap {
  id: string;
  requirementId: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  remediation: string;
  deadline?: string;
  status: 'open' | 'in_progress' | 'closed';
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const privacyPolicies = new Map<string, PrivacyPolicy>();
const consentRecords = new Map<string, ConsentRecord[]>();
const dataSubjectRequests = new Map<string, DataSubjectRequest>();
const privacyImpactAssessments = new Map<string, PrivacyImpactAssessment>();
const dataAnonymizations = new Map<string, DataAnonymization>();
const privacyComplianceRecords = new Map<string, PrivacyCompliance>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createPrivacyPolicy(params: {
  organizationId: string;
  name: string;
  description: string;
  version: string;
  regulations: PrivacyRegulation[];
  dataCategories: Omit<DataCategory, 'id'>[];
  retentionPolicies: Omit<RetentionPolicy, 'id'>[];
  consentRequirements: Omit<ConsentRequirement, 'id'>[];
  effectiveDate: string;
  expiryDate?: string;
}): PrivacyPolicy {
  const now = new Date().toISOString();
  const id = randomUUID();

  const policy: PrivacyPolicy = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    version: params.version,
    status: 'draft',
    regulations: params.regulations,
    dataCategories: params.dataCategories.map(dc => ({ ...dc, id: randomUUID() })),
    retentionPolicies: params.retentionPolicies.map(rp => ({ ...rp, id: randomUUID() })),
    consentRequirements: params.consentRequirements.map(cr => ({ ...cr, id: randomUUID() })),
    effectiveDate: params.effectiveDate,
    expiryDate: params.expiryDate,
    createdAt: now,
    updatedAt: now,
  };

  privacyPolicies.set(id, policy);
  return policy;
}

export function getPrivacyPolicy(id: string): PrivacyPolicy | undefined {
  return privacyPolicies.get(id);
}

export function listPrivacyPolicies(
  organizationId: string,
  filters?: { status?: PolicyStatus; regulation?: PrivacyRegulation }
): PrivacyPolicy[] {
  let result = Array.from(privacyPolicies.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.regulation) result = result.filter(p => p.regulations.includes(filters.regulation!));

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function activatePrivacyPolicy(policyId: string): PrivacyPolicy {
  const policy = privacyPolicies.get(policyId);
  if (!policy) throw new Error(`Privacy policy ${policyId} not found`);

  policy.status = 'active';
  policy.updatedAt = new Date().toISOString();
  return policy;
}

export function recordConsent(params: {
  organizationId: string;
  userId: string;
  policyId: string;
  consents: Omit<Consent, 'grantedAt' | 'withdrawnAt'>[];
  metadata?: Record<string, any>;
}): ConsentRecord {
  const policy = privacyPolicies.get(params.policyId);
  if (!policy) throw new Error(`Privacy policy ${params.policyId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const consents: Consent[] = params.consents.map(c => ({
    ...c,
    grantedAt: c.granted ? now : undefined,
  }));

  const record: ConsentRecord = {
    id,
    organizationId: params.organizationId,
    userId: params.userId,
    policyId: params.policyId,
    policyVersion: policy.version,
    consents,
    status: 'active',
    grantedAt: now,
    metadata: params.metadata || {},
  };

  const records = consentRecords.get(params.organizationId) || [];
  records.push(record);
  consentRecords.set(params.organizationId, records);

  return record;
}

export function withdrawConsent(
  organizationId: string,
  consentId: string,
  purposeIds?: string[]
): ConsentRecord {
  const records = consentRecords.get(organizationId) || [];
  const record = records.find(r => r.id === consentId);
  if (!record) throw new Error(`Consent record ${consentId} not found`);

  const now = new Date().toISOString();

  if (purposeIds) {
    // Withdraw specific purposes
    for (const consent of record.consents) {
      if (purposeIds.includes(consent.purposeId) && consent.granted) {
        consent.granted = false;
        consent.withdrawnAt = now;
      }
    }
    
    // Check if all consents withdrawn
    if (record.consents.every(c => !c.granted)) {
      record.status = 'withdrawn';
      record.withdrawnAt = now;
    }
  } else {
    // Withdraw all consents
    for (const consent of record.consents) {
      if (consent.granted) {
        consent.granted = false;
        consent.withdrawnAt = now;
      }
    }
    record.status = 'withdrawn';
    record.withdrawnAt = now;
  }

  return record;
}

export function getUserConsents(
  organizationId: string,
  userId: string
): ConsentRecord[] {
  const records = consentRecords.get(organizationId) || [];
  return records.filter(r => r.userId === userId && r.status === 'active');
}

export function createDataSubjectRequest(params: {
  organizationId: string;
  userId: string;
  requestType: DSARType;
  description: string;
}): DataSubjectRequest {
  const now = new Date().toISOString();
  const id = randomUUID();

  // Calculate deadline based on regulation (GDPR: 30 days, CCPA: 45 days)
  const deadlineDays = 30;
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + deadlineDays);

  const request: DataSubjectRequest = {
    id,
    organizationId: params.organizationId,
    userId: params.userId,
    requestType: params.requestType,
    status: 'received',
    description: params.description,
    submittedAt: now,
    deadline: deadline.toISOString(),
  };

  dataSubjectRequests.set(id, request);
  return request;
}

export function getDataSubjectRequest(id: string): DataSubjectRequest | undefined {
  return dataSubjectRequests.get(id);
}

export function listDataSubjectRequests(
  organizationId: string,
  filters?: { userId?: string; status?: DSARStatus; requestType?: DSARType }
): DataSubjectRequest[] {
  let result = Array.from(dataSubjectRequests.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.userId) result = result.filter(r => r.userId === filters.userId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  if (filters?.requestType) result = result.filter(r => r.requestType === filters.requestType);

  return result.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function processDataSubjectRequest(
  requestId: string,
  processedBy: string,
  response: DSARResponse
): DataSubjectRequest {
  const request = dataSubjectRequests.get(requestId);
  if (!request) throw new Error(`Data subject request ${requestId} not found`);

  request.status = 'completed';
  request.processedBy = processedBy;
  request.response = response;
  request.completedAt = new Date().toISOString();

  return request;
}

export function createPrivacyImpactAssessment(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  assessment: PIAAssessment;
}): PrivacyImpactAssessment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const pia: PrivacyImpactAssessment = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    status: 'draft',
    assessment: params.assessment,
    risks: params.assessment.riskAssessment.risks,
    mitigations: [],
    recommendations: [],
    createdAt: now,
    updatedAt: now,
  };

  privacyImpactAssessments.set(id, pia);
  return pia;
}

export function getPrivacyImpactAssessment(id: string): PrivacyImpactAssessment | undefined {
  return privacyImpactAssessments.get(id);
}

export function listPrivacyImpactAssessments(
  organizationId: string,
  filters?: { modelId?: string; status?: PIAStatus }
): PrivacyImpactAssessment[] {
  let result = Array.from(privacyImpactAssessments.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(p => p.modelId === filters.modelId);
  if (filters?.status) result = result.filter(p => p.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addPIAMitigation(
  piaId: string,
  mitigation: Omit<PIAMitigation, 'riskId'> & { riskId: string }
): PrivacyImpactAssessment {
  const pia = privacyImpactAssessments.get(piaId);
  if (!pia) throw new Error(`PIA ${piaId} not found`);

  pia.mitigations.push(mitigation);
  pia.updatedAt = new Date().toISOString();

  return pia;
}

export function completePIA(
  piaId: string,
  reviewedBy: string,
  recommendations: string[]
): PrivacyImpactAssessment {
  const pia = privacyImpactAssessments.get(piaId);
  if (!pia) throw new Error(`PIA ${piaId} not found`);

  pia.status = 'completed';
  pia.reviewedBy = reviewedBy;
  pia.recommendations = recommendations;
  pia.completedAt = new Date().toISOString();
  pia.updatedAt = new Date().toISOString();

  return pia;
}

export function createDataAnonymization(params: {
  organizationId: string;
  modelId: string;
  dataCategory: string;
  method: AnonymizationMethod;
  configuration: AnonymizationConfig;
}): DataAnonymization {
  const now = new Date().toISOString();
  const id = randomUUID();

  const anonymization: DataAnonymization = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    dataCategory: params.dataCategory,
    method: params.method,
    configuration: params.configuration,
    status: 'active',
    effectiveness: 0,
    createdAt: now,
    updatedAt: now,
  };

  dataAnonymizations.set(id, anonymization);
  return anonymization;
}

export function getDataAnonymization(id: string): DataAnonymization | undefined {
  return dataAnonymizations.get(id);
}

export function listDataAnonymizations(
  organizationId: string,
  filters?: { modelId?: string; method?: AnonymizationMethod }
): DataAnonymization[] {
  let result = Array.from(dataAnonymizations.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(a => a.modelId === filters.modelId);
  if (filters?.method) result = result.filter(a => a.method === filters.method);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateAnonymizationEffectiveness(
  anonymizationId: string,
  effectiveness: number
): DataAnonymization {
  const anonymization = dataAnonymizations.get(anonymizationId);
  if (!anonymization) throw new Error(`Data anonymization ${anonymizationId} not found`);

  anonymization.effectiveness = effectiveness;
  anonymization.lastApplied = new Date().toISOString();
  anonymization.updatedAt = new Date().toISOString();

  return anonymization;
}

export function assessPrivacyCompliance(
  organizationId: string,
  regulation: PrivacyRegulation
): PrivacyCompliance {
  const now = new Date().toISOString();
  const id = randomUUID();

  // Generate requirements based on regulation
  const requirements: ComplianceRequirement[] = [];
  
  if (regulation === 'GDPR') {
    requirements.push(
      {
        id: randomUUID(),
        article: 'Article 6',
        title: 'Lawfulness of processing',
        description: 'Processing must have a lawful basis',
        status: 'compliant',
        lastVerified: now,
      },
      {
        id: randomUUID(),
        article: 'Article 7',
        title: 'Conditions for consent',
        description: 'Consent must be freely given, specific, informed, and unambiguous',
        status: 'compliant',
        lastVerified: now,
      },
      {
        id: randomUUID(),
        article: 'Article 17',
        title: 'Right to erasure',
        description: 'Data subjects have the right to have their data erased',
        status: 'partial',
        lastVerified: now,
      }
    );
  }

  const compliantCount = requirements.filter(r => r.status === 'compliant').length;
  const score = requirements.length > 0 ? (compliantCount / requirements.length) * 100 : 0;

  const compliance: PrivacyCompliance = {
    id,
    organizationId,
    regulation,
    status: score >= 90 ? 'compliant' : score >= 70 ? 'partial' : 'non_compliant',
    score,
    requirements,
    gaps: [],
    lastAssessment: now,
    nextAssessment: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };

  privacyComplianceRecords.set(id, compliance);
  return compliance;
}

export function getPrivacyCompliance(id: string): PrivacyCompliance | undefined {
  return privacyComplianceRecords.get(id);
}

export function listPrivacyComplianceRecords(
  organizationId: string,
  filters?: { regulation?: PrivacyRegulation; status?: PrivacyCompliance['status'] }
): PrivacyCompliance[] {
  let result = Array.from(privacyComplianceRecords.values()).filter(
    c => c.organizationId === organizationId
  );

  if (filters?.regulation) result = result.filter(c => c.regulation === filters.regulation);
  if (filters?.status) result = result.filter(c => c.status === filters.status);

  return result.sort((a, b) => b.lastAssessment.localeCompare(a.lastAssessment));
}

export function addComplianceGap(
  complianceId: string,
  gap: Omit<ComplianceGap, 'id' | 'status'>
): PrivacyCompliance {
  const compliance = privacyComplianceRecords.get(complianceId);
  if (!compliance) throw new Error(`Privacy compliance ${complianceId} not found`);

  compliance.gaps.push({
    ...gap,
    id: randomUUID(),
    status: 'open',
  });

  return compliance;
}
