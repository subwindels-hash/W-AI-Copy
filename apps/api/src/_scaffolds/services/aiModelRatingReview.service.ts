/**
 * Module 82: AI Model Rating & Review Service
 *
 * Provides comprehensive model rating and review functionality including multi-criteria
 * ratings, detailed reviews with text feedback, model quality assessment, model
 * verification and certification, model trust scoring, and rating analytics and trends
 * for AI model quality management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelRating {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  userId: string;
  userName: string;
  overallRating: number; // 1-5
  criteriaRatings: CriteriaRating[];
  review?: ModelReview;
  verified: boolean;
  helpful: number;
  notHelpful: number;
  status: RatingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CriteriaRating {
  criterion: RatingCriterion;
  rating: number; // 1-5
  weight: number; // 0-1
  weightedScore: number;
}

export type RatingCriterion =
  | 'accuracy'
  | 'performance'
  | 'reliability'
  | 'ease-of-use'
  | 'documentation'
  | 'support'
  | 'value-for-money'
  | 'customization'
  | 'integration'
  | 'security';

export interface ModelReview {
  id: string;
  title: string;
  content: string;
  pros: string[];
  cons: string[];
  useCase: string;
  duration: string; // How long user has been using the model
  recommendation: 'highly-recommend' | 'recommend' | 'neutral' | 'not-recommend';
  sentiment: ReviewSentiment;
  attachments: ReviewAttachment[];
  tags: string[];
}

export type ReviewSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface ReviewAttachment {
  id: string;
  type: 'image' | 'video' | 'document' | 'code';
  url: string;
  description?: string;
  size: number; // bytes
}

export type RatingStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'hidden';

export interface ModelQualityAssessment {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  assessmentType: AssessmentType;
  assessor: QualityAssessor;
  criteria: QualityCriterion[];
  overallScore: number; // 0-100
  grade: QualityGrade;
  certification?: ModelCertification;
  recommendations: string[];
  assessedAt: string;
  validUntil?: string;
}

export type AssessmentType = 'automated' | 'manual' | 'hybrid' | 'community' | 'expert';

export interface QualityAssessor {
  assessorId: string;
  assessorName: string;
  assessorType: 'system' | 'expert' | 'community' | 'third-party';
  credentials?: string[];
  reputation?: number;
}

export interface QualityCriterion {
  criterion: string;
  category: QualityCategory;
  score: number; // 0-100
  weight: number; // 0-1
  weightedScore: number;
  evidence: QualityEvidence[];
  findings: string[];
  recommendations: string[];
}

export type QualityCategory =
  | 'performance'
  | 'accuracy'
  | 'reliability'
  | 'security'
  | 'compliance'
  | 'usability'
  | 'documentation'
  | 'support'
  | 'scalability'
  | 'maintainability';

export interface QualityEvidence {
  type: 'benchmark' | 'test-result' | 'metric' | 'review' | 'audit' | 'certification';
  source: string;
  value: any;
  timestamp: string;
  verified: boolean;
}

export type QualityGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export interface ModelCertification {
  id: string;
  certificationType: CertificationType;
  certificationLevel: CertificationLevel;
  issuedBy: string;
  issuedAt: string;
  validUntil: string;
  certificationId: string;
  badge: string;
  verificationUrl?: string;
  criteria: CertificationCriterion[];
}

export type CertificationType =
  | 'quality-certified'
  | 'security-certified'
  | 'compliance-certified'
  | 'performance-certified'
  | 'enterprise-ready'
  | 'production-ready';

export type CertificationLevel = 'basic' | 'standard' | 'advanced' | 'expert' | 'platinum';

export interface CertificationCriterion {
  criterion: string;
  requirement: string;
  met: boolean;
  evidence?: string;
}

export interface ModelTrustScore {
  modelId: string;
  modelName: string;
  overallScore: number; // 0-100
  components: TrustScoreComponent[];
  level: TrustLevel;
  factors: TrustFactor[];
  trends: TrustTrend[];
  lastUpdated: string;
}

export interface TrustScoreComponent {
  component: string;
  score: number; // 0-100
  weight: number; // 0-1
  weightedScore: number;
  trend: 'improving' | 'stable' | 'declining';
}

export type TrustLevel = 'untrusted' | 'low-trust' | 'moderate-trust' | 'high-trust' | 'verified' | 'certified';

export interface TrustFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  weight: number;
}

export interface TrustTrend {
  date: string;
  score: number;
  change: number;
  event?: string;
}

export interface RatingAnalytics {
  modelId: string;
  modelName: string;
  totalRatings: number;
  averageRating: number;
  ratingDistribution: RatingDistribution;
  criteriaAverages: Record<RatingCriterion, number>;
  sentimentDistribution: SentimentDistribution;
  trends: RatingTrend[];
  topPros: string[];
  topCons: string[];
  commonUseCases: string[];
  recommendations: string[];
  lastUpdated: string;
}

export interface RatingDistribution {
  five: number;
  four: number;
  three: number;
  two: number;
  one: number;
}

export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
}

export interface RatingTrend {
  date: string;
  averageRating: number;
  totalRatings: number;
  sentiment: ReviewSentiment;
}

export interface RatingDashboard {
  organizationId: string;
  totalRatings: number;
  averageRating: number;
  totalReviews: number;
  averageSentiment: ReviewSentiment;
  topRatedModels: TopRatedModel[];
  mostReviewedModels: MostReviewedModel[];
  ratingTrends: RatingTrend[];
  qualityDistribution: QualityDistribution;
  certificationStats: CertificationStats;
  trustDistribution: TrustDistribution;
}

export interface TopRatedModel {
  modelId: string;
  modelName: string;
  averageRating: number;
  totalRatings: number;
  trend: 'up' | 'down' | 'stable';
}

export interface MostReviewedModel {
  modelId: string;
  modelName: string;
  totalReviews: number;
  averageRating: number;
  sentiment: ReviewSentiment;
}

export interface QualityDistribution {
  excellent: number; // A+, A, A-
  good: number; // B+, B, B-
  average: number; // C+, C, C-
  poor: number; // D, F
}

export interface CertificationStats {
  totalCertified: number;
  byType: Record<CertificationType, number>;
  byLevel: Record<CertificationLevel, number>;
  expiringSoon: number;
}

export interface TrustDistribution {
  certified: number;
  verified: number;
  highTrust: number;
  moderateTrust: number;
  lowTrust: number;
  untrusted: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const ratings = new Map<string, ModelRating[]>();
const assessments = new Map<string, ModelQualityAssessment[]>();
const trustScores = new Map<string, ModelTrustScore>();

// ─── Rating Management ─────────────────────────────────────────────────────────

/**
 * Submit a model rating
 */
export async function submitModelRating(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    userId: string;
    userName: string;
    overallRating: number;
    criteriaRatings: Omit<CriteriaRating, 'weightedScore'>[];
    review?: Omit<ModelReview, 'id' | 'sentiment'>;
  }
): Promise<ModelRating> {
  const id = `rating_${randomUUID()}`;
  const now = new Date().toISOString();

  // Calculate weighted scores
  const criteriaRatings: CriteriaRating[] = params.criteriaRatings.map((cr) => ({
    ...cr,
    weightedScore: cr.rating * cr.weight,
  }));

  // Analyze sentiment
  const sentiment = params.review ? analyzeSentiment(params.review.content) : 'neutral';

  const rating: ModelRating = {
    id,
    organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    userId: params.userId,
    userName: params.userName,
    overallRating: params.overallRating,
    criteriaRatings,
    review: params.review
      ? {
          ...params.review,
          id: `review_${randomUUID()}`,
          sentiment,
        }
      : undefined,
    verified: false,
    helpful: 0,
    notHelpful: 0,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const modelRatings = ratings.get(params.modelId) || [];
  modelRatings.push(rating);
  ratings.set(params.modelId, modelRatings);

  return rating;
}

/**
 * Approve a rating
 */
export async function approveRating(
  modelId: string,
  ratingId: string
): Promise<ModelRating | null> {
  const modelRatings = ratings.get(modelId) || [];
  const rating = modelRatings.find((r) => r.id === ratingId);

  if (!rating) return null;

  rating.status = 'approved';
  rating.updatedAt = new Date().toISOString();

  ratings.set(modelId, modelRatings);
  return rating;
}

/**
 * Mark rating as helpful
 */
export async function markRatingHelpful(
  modelId: string,
  ratingId: string,
  helpful: boolean
): Promise<ModelRating | null> {
  const modelRatings = ratings.get(modelId) || [];
  const rating = modelRatings.find((r) => r.id === ratingId);

  if (!rating) return null;

  if (helpful) {
    rating.helpful++;
  } else {
    rating.notHelpful++;
  }

  rating.updatedAt = new Date().toISOString();
  ratings.set(modelId, modelRatings);

  return rating;
}

/**
 * Get model ratings
 */
export async function getModelRatings(
  modelId: string,
  filters?: {
    status?: RatingStatus;
    minRating?: number;
    maxRating?: number;
    sortBy?: 'date' | 'rating' | 'helpful';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }
): Promise<ModelRating[]> {
  let modelRatings = ratings.get(modelId) || [];

  // Apply filters
  if (filters?.status) {
    modelRatings = modelRatings.filter((r) => r.status === filters.status);
  }

  if (filters?.minRating) {
    modelRatings = modelRatings.filter((r) => r.overallRating >= filters.minRating!);
  }

  if (filters?.maxRating) {
    modelRatings = modelRatings.filter((r) => r.overallRating <= filters.maxRating!);
  }

  // Sort
  if (filters?.sortBy) {
    modelRatings.sort((a, b) => {
      let aVal: number, bVal: number;

      switch (filters.sortBy) {
        case 'date':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'rating':
          aVal = a.overallRating;
          bVal = b.overallRating;
          break;
        case 'helpful':
          aVal = a.helpful - a.notHelpful;
          bVal = b.helpful - b.notHelpful;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      return filters.sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }

  const offset = filters?.offset || 0;
  const limit = filters?.limit || 20;

  return modelRatings.slice(offset, offset + limit);
}

/**
 * Get rating analytics for a model
 */
export async function getRatingAnalytics(modelId: string, modelName: string): Promise<RatingAnalytics> {
  const modelRatings = ratings.get(modelId) || [];
  const approvedRatings = modelRatings.filter((r) => r.status === 'approved');

  const totalRatings = approvedRatings.length;
  const averageRating = totalRatings > 0
    ? approvedRatings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings
    : 0;

  const ratingDistribution: RatingDistribution = {
    five: approvedRatings.filter((r) => r.overallRating === 5).length,
    four: approvedRatings.filter((r) => r.overallRating === 4).length,
    three: approvedRatings.filter((r) => r.overallRating === 3).length,
    two: approvedRatings.filter((r) => r.overallRating === 2).length,
    one: approvedRatings.filter((r) => r.overallRating === 1).length,
  };

  const criteriaAverages: Record<string, number> = {};
  const criteria: RatingCriterion[] = [
    'accuracy',
    'performance',
    'reliability',
    'ease-of-use',
    'documentation',
    'support',
    'value-for-money',
    'customization',
    'integration',
    'security',
  ];

  for (const criterion of criteria) {
    const criterionRatings = approvedRatings
      .flatMap((r) => r.criteriaRatings)
      .filter((cr) => cr.criterion === criterion);

    criteriaAverages[criterion] = criterionRatings.length > 0
      ? criterionRatings.reduce((sum, cr) => sum + cr.rating, 0) / criterionRatings.length
      : 0;
  }

  const sentimentDistribution: SentimentDistribution = {
    positive: 0,
    neutral: 0,
    negative: 0,
    mixed: 0,
  };

  for (const rating of approvedRatings) {
    if (rating.review) {
      sentimentDistribution[rating.review.sentiment]++;
    }
  }

  const trends: RatingTrend[] = [];
  const ratingsByDate = new Map<string, ModelRating[]>();

  for (const rating of approvedRatings) {
    const date = rating.createdAt.split('T')[0];
    const dateRatings = ratingsByDate.get(date) || [];
    dateRatings.push(rating);
    ratingsByDate.set(date, dateRatings);
  }

  for (const [date, dateRatings] of ratingsByDate.entries()) {
    const avgRating = dateRatings.reduce((sum, r) => sum + r.overallRating, 0) / dateRatings.length;
    const sentiment = dateRatings[0]?.review?.sentiment || 'neutral';

    trends.push({
      date,
      averageRating: avgRating,
      totalRatings: dateRatings.length,
      sentiment,
    });
  }

  trends.sort((a, b) => a.date.localeCompare(b.date));

  const allReviews = approvedRatings.filter((r) => r.review).map((r) => r.review!);
  const allPros = allReviews.flatMap((r) => r.pros);
  const allCons = allReviews.flatMap((r) => r.cons);
  const allUseCases = allReviews.map((r) => r.useCase);

  const prosCount = new Map<string, number>();
  for (const pro of allPros) {
    prosCount.set(pro, (prosCount.get(pro) || 0) + 1);
  }

  const consCount = new Map<string, number>();
  for (const con of allCons) {
    consCount.set(con, (consCount.get(con) || 0) + 1);
  }

  const useCasesCount = new Map<string, number>();
  for (const useCase of allUseCases) {
    useCasesCount.set(useCase, (useCasesCount.get(useCase) || 0) + 1);
  }

  const topPros = Array.from(prosCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pro]) => pro);

  const topCons = Array.from(consCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([con]) => con);

  const commonUseCases = Array.from(useCasesCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([useCase]) => useCase);

  return {
    modelId,
    modelName,
    totalRatings,
    averageRating,
    ratingDistribution,
    criteriaAverages: criteriaAverages as Record<RatingCriterion, number>,
    sentimentDistribution,
    trends,
    topPros,
    topCons,
    commonUseCases,
    recommendations: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Perform quality assessment
 */
export async function performQualityAssessment(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    assessmentType: AssessmentType;
    assessor: Omit<QualityAssessor, 'assessorId'>;
    criteria: Omit<QualityCriterion, 'weightedScore'>[];
  }
): Promise<ModelQualityAssessment> {
  const id = `assessment_${randomUUID()}`;
  const now = new Date().toISOString();

  const criteria: QualityCriterion[] = params.criteria.map((c) => ({
    ...c,
    weightedScore: c.score * c.weight,
  }));

  const overallScore = criteria.reduce((sum, c) => sum + c.weightedScore, 0);
  const grade = calculateGrade(overallScore);

  const assessment: ModelQualityAssessment = {
    id,
    organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    assessmentType: params.assessmentType,
    assessor: {
      ...params.assessor,
      assessorId: `assessor_${randomUUID()}`,
    },
    criteria,
    overallScore,
    grade,
    recommendations: criteria.flatMap((c) => c.recommendations),
    assessedAt: now,
    validUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const modelAssessments = assessments.get(params.modelId) || [];
  modelAssessments.push(assessment);
  assessments.set(params.modelId, modelAssessments);

  return assessment;
}

/**
 * Issue certification
 */
export async function issueCertification(
  assessmentId: string,
  params: {
    certificationType: CertificationType;
    certificationLevel: CertificationLevel;
    issuedBy: string;
    validForDays: number;
    criteria: CertificationCriterion[];
  }
): Promise<ModelCertification | null> {
  const allAssessments = Array.from(assessments.values()).flat();
  const assessment = allAssessments.find((a) => a.id === assessmentId);

  if (!assessment) return null;

  const now = new Date();
  const certification: ModelCertification = {
    id: `cert_${randomUUID()}`,
    certificationType: params.certificationType,
    certificationLevel: params.certificationLevel,
    issuedBy: params.issuedBy,
    issuedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + params.validForDays * 24 * 60 * 60 * 1000).toISOString(),
    certificationId: `CERT-${randomUUID().slice(0, 8).toUpperCase()}`,
    badge: `${params.certificationType}-${params.certificationLevel}`,
    criteria: params.criteria,
  };

  assessment.certification = certification;

  const modelAssessments = assessments.get(assessment.modelId) || [];
  const idx = modelAssessments.findIndex((a) => a.id === assessmentId);
  if (idx >= 0) {
    modelAssessments[idx] = assessment;
    assessments.set(assessment.modelId, modelAssessments);
  }

  return certification;
}

/**
 * Calculate trust score
 */
export async function calculateTrustScore(
  modelId: string,
  modelName: string
): Promise<ModelTrustScore> {
  const modelRatings = ratings.get(modelId) || [];
  const modelAssessments = assessments.get(modelId) || [];
  const approvedRatings = modelRatings.filter((r) => r.status === 'approved');

  const components: TrustScoreComponent[] = [];

  // Rating component
  const avgRating = approvedRatings.length > 0
    ? approvedRatings.reduce((sum, r) => sum + r.overallRating, 0) / approvedRatings.length
    : 0;
  components.push({
    component: 'User Ratings',
    score: (avgRating / 5) * 100,
    weight: 0.3,
    weightedScore: (avgRating / 5) * 100 * 0.3,
    trend: 'stable',
  });

  // Quality assessment component
  const latestAssessment = modelAssessments[modelAssessments.length - 1];
  components.push({
    component: 'Quality Assessment',
    score: latestAssessment?.overallScore || 0,
    weight: 0.3,
    weightedScore: (latestAssessment?.overallScore || 0) * 0.3,
    trend: 'stable',
  });

  // Certification component
  const hasCertification = latestAssessment?.certification ? 100 : 0;
  components.push({
    component: 'Certification',
    score: hasCertification,
    weight: 0.2,
    weightedScore: hasCertification * 0.2,
    trend: 'stable',
  });

  // Verification component
  const verifiedRatings = approvedRatings.filter((r) => r.verified).length;
  const verificationScore = approvedRatings.length > 0 ? (verifiedRatings / approvedRatings.length) * 100 : 0;
  components.push({
    component: 'Verification',
    score: verificationScore,
    weight: 0.2,
    weightedScore: verificationScore * 0.2,
    trend: 'stable',
  });

  const overallScore = components.reduce((sum, c) => sum + c.weightedScore, 0);
  const level = calculateTrustLevel(overallScore, hasCertification > 0);

  const factors: TrustFactor[] = [
    {
      factor: 'High user ratings',
      impact: avgRating >= 4 ? 'positive' : avgRating >= 3 ? 'neutral' : 'negative',
      description: `Average rating of ${avgRating.toFixed(1)} out of 5`,
      weight: 0.3,
    },
    {
      factor: 'Quality assessment',
      impact: latestAssessment && latestAssessment.overallScore >= 80 ? 'positive' : latestAssessment ? 'neutral' : 'negative',
      description: latestAssessment ? `Quality score of ${latestAssessment.overallScore}` : 'No quality assessment',
      weight: 0.3,
    },
  ];

  const trustScore: ModelTrustScore = {
    modelId,
    modelName,
    overallScore,
    components,
    level,
    factors,
    trends: [],
    lastUpdated: new Date().toISOString(),
  };

  trustScores.set(modelId, trustScore);
  return trustScore;
}

/**
 * Get rating dashboard
 */
export async function getRatingDashboard(organizationId: string): Promise<RatingDashboard> {
  const allRatings = Array.from(ratings.values()).flat().filter((r) => r.organizationId === organizationId);
  const approvedRatings = allRatings.filter((r) => r.status === 'approved');

  const totalRatings = approvedRatings.length;
  const averageRating = totalRatings > 0
    ? approvedRatings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings
    : 0;

  const totalReviews = approvedRatings.filter((r) => r.review).length;

  const sentiments = approvedRatings.filter((r) => r.review).map((r) => r.review!.sentiment);
  const sentimentCounts = {
    positive: sentiments.filter((s) => s === 'positive').length,
    neutral: sentiments.filter((s) => s === 'neutral').length,
    negative: sentiments.filter((s) => s === 'negative').length,
    mixed: sentiments.filter((s) => s === 'mixed').length,
  };

  const averageSentiment: ReviewSentiment = sentimentCounts.positive >= sentimentCounts.negative ? 'positive' : 'negative';

  const modelRatingMap = new Map<string, { totalRatings: number; totalRating: number; totalReviews: number; sentiment?: ReviewSentiment }>();
  for (const rating of approvedRatings) {
    const model = modelRatingMap.get(rating.modelId) || { totalRatings: 0, totalRating: 0, totalReviews: 0 };
    model.totalRatings++;
    model.totalRating += rating.overallRating;
    if (rating.review) {
      model.totalReviews++;
      model.sentiment = rating.review.sentiment;
    }
    modelRatingMap.set(rating.modelId, model);
  }

  const topRatedModels = Array.from(modelRatingMap.entries())
    .map(([modelId, data]) => ({
      modelId,
      modelName: approvedRatings.find((r) => r.modelId === modelId)?.modelName || 'Unknown',
      averageRating: data.totalRating / data.totalRatings,
      totalRatings: data.totalRatings,
      trend: 'stable' as const,
    }))
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 10);

  const mostReviewedModels = Array.from(modelRatingMap.entries())
    .map(([modelId, data]) => ({
      modelId,
      modelName: approvedRatings.find((r) => r.modelId === modelId)?.modelName || 'Unknown',
      totalReviews: data.totalReviews,
      averageRating: data.totalRating / data.totalRatings,
      sentiment: data.sentiment || 'neutral',
    }))
    .sort((a, b) => b.totalReviews - a.totalReviews)
    .slice(0, 10);

  const allAssessments = Array.from(assessments.values()).flat().filter((a) => a.organizationId === organizationId);
  const excellent = allAssessments.filter((a) => ['A+', 'A', 'A-'].includes(a.grade)).length;
  const good = allAssessments.filter((a) => ['B+', 'B', 'B-'].includes(a.grade)).length;
  const average = allAssessments.filter((a) => ['C+', 'C', 'C-'].includes(a.grade)).length;
  const poor = allAssessments.filter((a) => ['D', 'F'].includes(a.grade)).length;

  const certified = allAssessments.filter((a) => a.certification).length;
  const certificationByType: Record<string, number> = {};
  const certificationByLevel: Record<string, number> = {};

  for (const assessment of allAssessments) {
    if (assessment.certification) {
      certificationByType[assessment.certification.certificationType] = (certificationByType[assessment.certification.certificationType] || 0) + 1;
      certificationByLevel[assessment.certification.certificationLevel] = (certificationByLevel[assessment.certification.certificationLevel] || 0) + 1;
    }
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringSoon = allAssessments.filter((a) => {
    if (!a.certification) return false;
    const validUntil = new Date(a.certification.validUntil);
    return validUntil >= now && validUntil <= thirtyDaysFromNow;
  }).length;

  const allTrustScores = Array.from(trustScores.values());
  const trustDistribution: TrustDistribution = {
    certified: allTrustScores.filter((t) => t.level === 'certified').length,
    verified: allTrustScores.filter((t) => t.level === 'verified').length,
    highTrust: allTrustScores.filter((t) => t.level === 'high-trust').length,
    moderateTrust: allTrustScores.filter((t) => t.level === 'moderate-trust').length,
    lowTrust: allTrustScores.filter((t) => t.level === 'low-trust').length,
    untrusted: allTrustScores.filter((t) => t.level === 'untrusted').length,
  };

  return {
    organizationId,
    totalRatings,
    averageRating,
    totalReviews,
    averageSentiment,
    topRatedModels,
    mostReviewedModels,
    ratingTrends: [],
    qualityDistribution: { excellent, good, average, poor },
    certificationStats: {
      totalCertified: certified,
      byType: certificationByType as Record<CertificationType, number>,
      byLevel: certificationByLevel as Record<CertificationLevel, number>,
      expiringSoon,
    },
    trustDistribution,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function analyzeSentiment(text: string): ReviewSentiment {
  const positiveWords = ['great', 'excellent', 'amazing', 'good', 'love', 'best', 'perfect', 'wonderful'];
  const negativeWords = ['bad', 'poor', 'terrible', 'worst', 'hate', 'awful', 'horrible', 'disappointed'];

  const lowerText = text.toLowerCase();
  const positiveCount = positiveWords.filter((word) => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter((word) => lowerText.includes(word)).length;

  if (positiveCount > negativeCount * 1.5) return 'positive';
  if (negativeCount > positiveCount * 1.5) return 'negative';
  if (positiveCount > 0 && negativeCount > 0) return 'mixed';
  return 'neutral';
}

function calculateGrade(score: number): QualityGrade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

function calculateTrustLevel(score: number, hasCertification: boolean): TrustLevel {
  if (hasCertification) return 'certified';
  if (score >= 90) return 'verified';
  if (score >= 75) return 'high-trust';
  if (score >= 60) return 'moderate-trust';
  if (score >= 40) return 'low-trust';
  return 'untrusted';
}
