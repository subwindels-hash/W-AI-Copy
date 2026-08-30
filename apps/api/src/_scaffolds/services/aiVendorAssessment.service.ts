/**
 * Module 66: AI Vendor Assessment Service
 *
 * Provides comprehensive vendor evaluation and selection capabilities including
 * vendor scoring frameworks, RFP/RFI management, due diligence workflows,
 * vendor comparison tools, and selection recommendations for AI providers.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiVendorAssessment');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIVendor {
  id: string;
  organizationId: string;
  name: string;
  legalName: string;
  vendorType: VendorType;
  category: VendorCategory;
  status: VendorStatus;
  overallScore: number; // 0-100
  riskLevel: VendorRiskLevel;
  relationshipManager?: string;
  primaryContact?: VendorContact;
  contacts: VendorContact[];
  capabilities: VendorCapability[];
  certifications: VendorCertification[];
  assessments: VendorAssessment[];
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type VendorType =
  | 'ai-platform'
  | 'cloud-provider'
  | 'model-provider'
  | 'data-provider'
  | 'tooling-provider'
  | 'consulting'
  | 'hardware'
  | 'other';

export type VendorCategory =
  | 'llm-provider'
  | 'computer-vision'
  | 'speech-recognition'
  | 'nlp'
  | 'mlops'
  | 'infrastructure'
  | 'security'
  | 'compliance'
  | 'analytics'
  | 'other';

export type VendorStatus =
  | 'prospect'
  | 'under-evaluation'
  | 'approved'
  | 'active'
  | 'preferred'
  | 'restricted'
  | 'blacklisted'
  | 'inactive';

export type VendorRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface VendorContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  isPrimary: boolean;
  notes?: string;
}

export interface VendorCapability {
  id: string;
  name: string;
  description: string;
  category: string;
  maturityLevel: 'basic' | 'intermediate' | 'advanced' | 'expert';
  verified: boolean;
  verifiedDate?: string;
}

export interface VendorCertification {
  id: string;
  name: string;
  issuer: string;
  certificationDate: string;
  expirationDate?: string;
  status: 'active' | 'expired' | 'pending';
  documentUrl?: string;
}

export interface VendorAssessment {
  id: string;
  assessmentDate: string;
  assessorId: string;
  assessorName: string;
  type: AssessmentType;
  scores: AssessmentScore[];
  overallScore: number;
  recommendation: 'approve' | 'conditional' | 'reject' | 'reassess';
  findings: AssessmentFinding[];
  status: 'draft' | 'submitted' | 'reviewed' | 'approved';
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssessmentType =
  | 'initial-evaluation'
  | 'periodic-review'
  | 'security-assessment'
  | 'compliance-review'
  | 'performance-review'
  | 'due-diligence'
  | 'incident-review';

export interface AssessmentScore {
  category: AssessmentCategory;
  score: number; // 0-100
  weight: number; // 0-1
  weightedScore: number;
  comments?: string;
}

export type AssessmentCategory =
  | 'technical-capability'
  | 'security'
  | 'compliance'
  | 'performance'
  | 'reliability'
  | 'support'
  | 'pricing'
  | 'innovation'
  | 'scalability'
  | 'data-privacy'
  | 'ethical-ai'
  | 'financial-stability';

export interface AssessmentFinding {
  id: string;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence?: string;
  recommendation: string;
  status: 'open' | 'addressed' | 'accepted' | 'deferred';
}

export interface RFP {
  id: string;
  organizationId: string;
  rfpNumber: string;
  title: string;
  description: string;
  category: VendorCategory;
  status: RFPStatus;
  requirements: RFPRequirement[];
  evaluationCriteria: EvaluationCriterion[];
  vendors: RFPVendor[];
  timeline: RFPTimeline;
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export type RFPStatus =
  | 'draft'
  | 'published'
  | 'responses-received'
  | 'under-evaluation'
  | 'shortlisted'
  | 'awarded'
  | 'cancelled';

export interface RFPRequirement {
  id: string;
  category: string;
  requirement: string;
  priority: 'must-have' | 'should-have' | 'nice-to-have';
  description?: string;
}

export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1
  scoringGuide: string;
}

export interface RFPVendor {
  vendorId: string;
  vendorName: string;
  status: 'invited' | 'responded' | 'shortlisted' | 'rejected' | 'awarded';
  responseDate?: string;
  proposal?: VendorProposal;
  scores?: VendorRFPScore[];
  totalScore?: number;
  notes?: string;
}

export interface VendorProposal {
  summary: string;
  technicalApproach: string;
  pricing: ProposalPricing;
  timeline: string;
  team?: string;
  references?: string[];
  attachments?: string[];
  submittedAt: string;
}

export interface ProposalPricing {
  model: 'subscription' | 'usage-based' | 'fixed' | 'hybrid';
  totalCost: number;
  currency: string;
  breakdown?: PricingBreakdown[];
  paymentTerms: string;
  validUntil: string;
}

export interface PricingBreakdown {
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface VendorRFPScore {
  criterionId: string;
  criterionName: string;
  score: number; // 0-100
  weight: number;
  weightedScore: number;
  comments?: string;
}

export interface RFPTimeline {
  publishDate: string;
  questionDeadline?: string;
  responseDeadline: string;
  evaluationPeriod: { start: string; end: string };
  shortlistDate?: string;
  awardDate?: string;
}

export interface VendorComparison {
  id: string;
  organizationId: string;
  name: string;
  vendorIds: string[];
  criteria: ComparisonCriterion[];
  results: ComparisonResult[];
  recommendation?: string;
  createdBy: string;
  createdAt: string;
}

export interface ComparisonCriterion {
  id: string;
  name: string;
  weight: number;
  description?: string;
}

export interface ComparisonResult {
  vendorId: string;
  vendorName: string;
  scores: CriterionScore[];
  totalScore: number;
  rank: number;
}

export interface CriterionScore {
  criterionId: string;
  score: number;
  weightedScore: number;
  notes?: string;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const vendors = new Map<string, AIVendor>();
const rfps = new Map<string, RFP>();
const comparisons = new Map<string, VendorComparison>();
const rfpCounter = new Map<string, number>();

// ─── Vendor Management ─────────────────────────────────────────────────────────

/**
 * Create a new vendor
 */
export async function createVendor(
  organizationId: string,
  vendor: Omit<AIVendor, 'id' | 'overallScore' | 'assessments' | 'createdAt' | 'updatedAt'>
): Promise<AIVendor> {
  const id = `vendor_${randomUUID()}`;
  const now = new Date().toISOString();

  const newVendor: AIVendor = {
    ...vendor,
    id,
    organizationId,
    overallScore: 0,
    assessments: [],
    createdAt: now,
    updatedAt: now,
  };

  vendors.set(id, newVendor);
  return newVendor;
}

/**
 * Update vendor
 */
export async function updateVendor(
  vendorId: string,
  updates: Partial<Omit<AIVendor, 'id' | 'organizationId' | 'createdAt'>>
): Promise<AIVendor | null> {
  const vendor = vendors.get(vendorId);
  if (!vendor) return null;

  const updated: AIVendor = {
    ...vendor,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  vendors.set(vendorId, updated);
  return updated;
}

/**
 * Get vendor by ID
 */
export async function getVendor(vendorId: string): Promise<AIVendor | null> {
  return vendors.get(vendorId) || null;
}

/**
 * List vendors for an organization
 */
export async function listVendors(
  organizationId: string,
  filters?: { status?: VendorStatus; category?: VendorCategory; riskLevel?: VendorRiskLevel }
): Promise<AIVendor[]> {
  const allVendors = Array.from(vendors.values()).filter(
    (v) => v.organizationId === organizationId
  );

  return allVendors.filter((v) => {
    if (filters?.status && v.status !== filters.status) return false;
    if (filters?.category && v.category !== filters.category) return false;
    if (filters?.riskLevel && v.riskLevel !== filters.riskLevel) return false;
    return true;
  });
}

/**
 * Add vendor contact
 */
export async function addVendorContact(
  vendorId: string,
  contact: Omit<VendorContact, 'id'>
): Promise<VendorContact | null> {
  const vendor = vendors.get(vendorId);
  if (!vendor) return null;

  const newContact: VendorContact = {
    ...contact,
    id: `contact_${randomUUID()}`,
  };

  vendor.contacts.push(newContact);

  if (contact.isPrimary) {
    vendor.contacts.forEach((c) => {
      if (c.id !== newContact.id) c.isPrimary = false;
    });
    vendor.primaryContact = newContact;
  }

  vendor.updatedAt = new Date().toISOString();
  vendors.set(vendorId, vendor);

  return newContact;
}

/**
 * Add vendor capability
 */
export async function addVendorCapability(
  vendorId: string,
  capability: Omit<VendorCapability, 'id'>
): Promise<VendorCapability | null> {
  const vendor = vendors.get(vendorId);
  if (!vendor) return null;

  const newCapability: VendorCapability = {
    ...capability,
    id: `cap_${randomUUID()}`,
  };

  vendor.capabilities.push(newCapability);
  vendor.updatedAt = new Date().toISOString();
  vendors.set(vendorId, vendor);

  return newCapability;
}

/**
 * Add vendor certification
 */
export async function addVendorCertification(
  vendorId: string,
  certification: Omit<VendorCertification, 'id'>
): Promise<VendorCertification | null> {
  const vendor = vendors.get(vendorId);
  if (!vendor) return null;

  const newCert: VendorCertification = {
    ...certification,
    id: `cert_${randomUUID()}`,
  };

  vendor.certifications.push(newCert);
  vendor.updatedAt = new Date().toISOString();
  vendors.set(vendorId, vendor);

  return newCert;
}

// ─── Vendor Assessment ─────────────────────────────────────────────────────────

/**
 * Create vendor assessment
 */
export async function createVendorAssessment(
  vendorId: string,
  assessment: Omit<VendorAssessment, 'id' | 'overallScore' | 'createdAt' | 'updatedAt'>
): Promise<VendorAssessment | null> {
  const vendor = vendors.get(vendorId);
  if (!vendor) return null;

  const id = `assessment_${randomUUID()}`;
  const now = new Date().toISOString();

  // Calculate overall score
  const totalWeight = assessment.scores.reduce((sum, s) => sum + s.weight, 0);
  const overallScore = assessment.scores.reduce((sum, s) => {
    const weightedScore = s.score * (s.weight / totalWeight);
    return sum + weightedScore;
  }, 0);

  // Update weighted scores
  const scores = assessment.scores.map((s) => ({
    ...s,
    weightedScore: s.score * (s.weight / totalWeight),
  }));

  const newAssessment: VendorAssessment = {
    ...assessment,
    id,
    scores,
    overallScore: Math.round(overallScore * 100) / 100,
    createdAt: now,
    updatedAt: now,
  };

  vendor.assessments.push(newAssessment);
  vendor.overallScore = newAssessment.overallScore;
  vendor.updatedAt = now;

  vendors.set(vendorId, vendor);
  return newAssessment;
}

/**
 * Update vendor assessment
 */
export async function updateVendorAssessment(
  vendorId: string,
  assessmentId: string,
  updates: Partial<Omit<VendorAssessment, 'id' | 'createdAt'>>
): Promise<VendorAssessment | null> {
  const vendor = vendors.get(vendorId);
  if (!vendor) return null;

  const assessmentIndex = vendor.assessments.findIndex((a) => a.id === assessmentId);
  if (assessmentIndex === -1) return null;

  const assessment = vendor.assessments[assessmentIndex];
  const updated: VendorAssessment = {
    ...assessment,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Recalculate overall score if scores changed
  if (updates.scores) {
    const totalWeight = updated.scores.reduce((sum, s) => sum + s.weight, 0);
    updated.overallScore = updated.scores.reduce((sum, s) => {
      const weightedScore = s.score * (s.weight / totalWeight);
      return sum + weightedScore;
    }, 0);
    updated.scores = updated.scores.map((s) => ({
      ...s,
      weightedScore: s.score * (s.weight / totalWeight),
    }));
  }

  vendor.assessments[assessmentIndex] = updated;
  vendor.overallScore = updated.overallScore;
  vendor.updatedAt = updated.updatedAt;

  vendors.set(vendorId, vendor);
  return updated;
}

/**
 * Get vendor assessments
 */
export async function getVendorAssessments(vendorId: string): Promise<VendorAssessment[]> {
  const vendor = vendors.get(vendorId);
  return vendor?.assessments || [];
}

// ─── RFP Management ────────────────────────────────────────────────────────────

/**
 * Create RFP
 */
export async function createRFP(
  organizationId: string,
  rfp: Omit<RFP, 'id' | 'rfpNumber' | 'vendors' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<RFP> {
  const id = `rfp_${randomUUID()}`;
  const counter = (rfpCounter.get(organizationId) || 0) + 1;
  rfpCounter.set(organizationId, counter);

  const now = new Date().toISOString();

  const newRFP: RFP = {
    ...rfp,
    id,
    organizationId,
    rfpNumber: `RFP-${String(counter).padStart(4, '0')}`,
    vendors: [],
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  rfps.set(id, newRFP);
  return newRFP;
}

/**
 * Update RFP
 */
export async function updateRFP(
  rfpId: string,
  updates: Partial<Omit<RFP, 'id' | 'rfpNumber' | 'organizationId' | 'createdAt'>>
): Promise<RFP | null> {
  const rfp = rfps.get(rfpId);
  if (!rfp) return null;

  const updated: RFP = {
    ...rfp,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  rfps.set(rfpId, updated);
  return updated;
}

/**
 * Invite vendor to RFP
 */
export async function inviteVendorToRFP(
  rfpId: string,
  vendorId: string,
  vendorName: string
): Promise<RFPVendor | null> {
  const rfp = rfps.get(rfpId);
  if (!rfp) return null;

  const vendor: RFPVendor = {
    vendorId,
    vendorName,
    status: 'invited',
  };

  rfp.vendors.push(vendor);
  rfp.updatedAt = new Date().toISOString();

  rfps.set(rfpId, rfp);
  return vendor;
}

/**
 * Submit vendor proposal
 */
export async function submitVendorProposal(
  rfpId: string,
  vendorId: string,
  proposal: VendorProposal
): Promise<RFP | null> {
  const rfp = rfps.get(rfpId);
  if (!rfp) return null;

  const vendor = rfp.vendors.find((v) => v.vendorId === vendorId);
  if (!vendor) return null;

  vendor.status = 'responded';
  vendor.responseDate = new Date().toISOString();
  vendor.proposal = proposal;

  rfp.updatedAt = new Date().toISOString();
  rfps.set(rfpId, rfp);

  return rfp;
}

/**
 * Score vendor proposal
 */
export async function scoreVendorProposal(
  rfpId: string,
  vendorId: string,
  scores: VendorRFPScore[]
): Promise<RFP | null> {
  const rfp = rfps.get(rfpId);
  if (!rfp) return null;

  const vendor = rfp.vendors.find((v) => v.vendorId === vendorId);
  if (!vendor) return null;

  vendor.scores = scores;
  vendor.totalScore = scores.reduce((sum, s) => sum + s.weightedScore, 0);

  rfp.updatedAt = new Date().toISOString();
  rfps.set(rfpId, rfp);

  return rfp;
}

/**
 * Get RFP by ID
 */
export async function getRFP(rfpId: string): Promise<RFP | null> {
  return rfps.get(rfpId) || null;
}

/**
 * List RFPs for an organization
 */
export async function listRFPs(
  organizationId: string,
  filters?: { status?: RFPStatus; category?: VendorCategory }
): Promise<RFP[]> {
  const allRFPs = Array.from(rfps.values()).filter(
    (r) => r.organizationId === organizationId
  );

  return allRFPs.filter((r) => {
    if (filters?.status && r.status !== filters.status) return false;
    if (filters?.category && r.category !== filters.category) return false;
    return true;
  });
}

// ─── Vendor Comparison ─────────────────────────────────────────────────────────

/**
 * Create vendor comparison
 */
export async function createVendorComparison(
  organizationId: string,
  comparison: Omit<VendorComparison, 'id' | 'results' | 'createdAt'>
): Promise<VendorComparison> {
  const id = `comparison_${randomUUID()}`;
  const now = new Date().toISOString();

  // Calculate results
  const results: ComparisonResult[] = comparison.vendorIds.map((vendorId) => {
    const vendor = vendors.get(vendorId);
    if (!vendor) {
      return {
        vendorId,
        vendorName: 'Unknown',
        scores: [],
        totalScore: 0,
        rank: 0,
      };
    }

    const scores: CriterionScore[] = comparison.criteria.map((criterion) => {
      // In real implementation, this would be based on actual vendor data
      const score = _rng.next() * 100;
      return {
        criterionId: criterion.id,
        score,
        weightedScore: score * criterion.weight,
      };
    });

    const totalScore = scores.reduce((sum, s) => sum + s.weightedScore, 0);

    return {
      vendorId,
      vendorName: vendor.name,
      scores,
      totalScore,
      rank: 0,
    };
  });

  // Sort and assign ranks
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, index) => {
    r.rank = index + 1;
  });

  const newComparison: VendorComparison = {
    ...comparison,
    id,
    organizationId,
    results,
    createdAt: now,
  };

  comparisons.set(id, newComparison);
  return newComparison;
}

/**
 * Get vendor comparison
 */
export async function getVendorComparison(comparisonId: string): Promise<VendorComparison | null> {
  return comparisons.get(comparisonId) || null;
}

/**
 * List vendor comparisons
 */
export async function listVendorComparisons(organizationId: string): Promise<VendorComparison[]> {
  return Array.from(comparisons.values()).filter(
    (c) => c.organizationId === organizationId
  );
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get vendor management statistics
 */
export async function getVendorStats(organizationId: string): Promise<{
  totalVendors: number;
  activeVendors: number;
  vendorsByCategory: Record<VendorCategory, number>;
  vendorsByStatus: Record<VendorStatus, number>;
  vendorsByRiskLevel: Record<VendorRiskLevel, number>;
  averageVendorScore: number;
  totalRFPs: number;
  activeRFPs: number;
  totalComparisons: number;
}> {
  const orgVendors = await listVendors(organizationId);
  const orgRFPs = await listRFPs(organizationId);
  const orgComparisons = await listVendorComparisons(organizationId);

  const vendorsByCategory: Record<string, number> = {};
  const vendorsByStatus: Record<string, number> = {};
  const vendorsByRiskLevel: Record<string, number> = {};
  let totalScore = 0;

  for (const vendor of orgVendors) {
    vendorsByCategory[vendor.category] = (vendorsByCategory[vendor.category] || 0) + 1;
    vendorsByStatus[vendor.status] = (vendorsByStatus[vendor.status] || 0) + 1;
    vendorsByRiskLevel[vendor.riskLevel] = (vendorsByRiskLevel[vendor.riskLevel] || 0) + 1;
    totalScore += vendor.overallScore;
  }

  return {
    totalVendors: orgVendors.length,
    activeVendors: orgVendors.filter((v) => ['active', 'preferred'].includes(v.status)).length,
    vendorsByCategory: vendorsByCategory as Record<VendorCategory, number>,
    vendorsByStatus: vendorsByStatus as Record<VendorStatus, number>,
    vendorsByRiskLevel: vendorsByRiskLevel as Record<VendorRiskLevel, number>,
    averageVendorScore: orgVendors.length > 0 ? Math.round((totalScore / orgVendors.length) * 100) / 100 : 0,
    totalRFPs: orgRFPs.length,
    activeRFPs: orgRFPs.filter((r) => !['awarded', 'cancelled'].includes(r.status)).length,
    totalComparisons: orgComparisons.length,
  };
}
