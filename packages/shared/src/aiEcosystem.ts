/**
 * Shared types — AI Ecosystem (Phase 32 / Session 33)
 *
 * Slices covered:
 *   288 — AI Provider Abstraction (vendor-agnostic)
 *   289 — AI Personality Studio
 *   290 — AI Trust, Explainability & Verification
 *
 * Vendor-neutrality rule: provider names here are EXAMPLES of adapters
 * that may be registered. The system itself never ships a hard-coded
 * provider list. All routing flows through ProviderAbstractionService.
 */

// ---------------------------------------------------------------------------
// Slice 288 — Provider Abstraction
// ---------------------------------------------------------------------------

export type ProviderTier = "cloud" | "self-hosted" | "hybrid" | "private";
export type ProviderStatus = "healthy" | "degraded" | "down" | "maintenance";
export type Residency = "global" | "eu" | "us" | "apac" | "on-prem";
export type ModelModality = "text" | "image" | "audio" | "video" | "multimodal" | "embedding";
export type ModelCapability =
  | "chat"
  | "completion"
  | "function-calling"
  | "vision"
  | "code"
  | "reasoning"
  | "long-context"
  | "safety-guardrails";

export interface AiProviderAdapter {
  id: string;
  name: string;
  vendor: string; // e.g. "openai" — example, not exhaustive
  tier: ProviderTier;
  residency: Residency[];
  status: ProviderStatus;
  baseUrl?: string;
  apiKeyConfigured: boolean;
  costPer1kInputUsd?: number;
  costPer1kOutputUsd?: number;
  avgLatencyMs?: number;
  p95LatencyMs?: number;
  supportsStreaming: boolean;
  supportsFineTuning: boolean;
  createdAt: string;
  labels: string[];
}

export interface AiModel {
  id: string;
  providerId: string;
  modelId: string; // e.g. "gpt-4o"
  displayName: string;
  version: string;
  modalities: ModelModality[];
  capabilities: ModelCapability[];
  contextWindowTokens: number;
  maxOutputTokens: number;
  enabled: boolean;
  costPer1kInputUsd: number;
  costPer1kOutputUsd: number;
  avgLatencyMs: number;
  benchmarks: { benchmarkId: string; score: number; runAt: string }[];
}

export type RoutingStrategy =
  | "balanced"
  | "lowest-cost"
  | "lowest-latency"
  | "highest-quality"
  | "residency"
  | "fallback-only";

export interface RoutingPolicy {
  id: string;
  name: string;
  description: string;
  strategy: RoutingStrategy;
  requiredResidency?: Residency;
  requiredCapabilities?: ModelCapability[];
  allowedProviderTiers?: ProviderTier[];
  fallbackProviderIds: string[];
  enabled: boolean;
  costWeight: number; // 0..1
  latencyWeight: number;
  qualityWeight: number;
  createdAt: string;
}

export interface RouteRequest {
  taskType: "chat" | "completion" | "embedding" | "image" | "code" | "reasoning";
  inputTokens?: number;
  outputTokens?: number;
  requiredResidency?: Residency;
  requiredCapabilities?: ModelCapability[];
  policyId?: string;
  preferStreaming?: boolean;
}

export interface RouteDecision {
  selectedProviderId: string;
  selectedModelId: string;
  reason: string;
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  fallbackChain: string[];
}

export interface ProviderHealthEvent {
  id: string;
  providerId: string;
  status: ProviderStatus;
  latencyMs?: number;
  errorRatePct?: number;
  recordedAt: string;
  note?: string;
}

export interface BenchmarkRun {
  id: string;
  benchmarkId: string;
  name: string;
  providerId: string;
  modelId: string;
  score: number; // 0..1
  latencyMs: number;
  costUsd: number;
  runAt: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Slice 289 — Personality Studio
// ---------------------------------------------------------------------------

export type VoiceGender = "feminine" | "masculine" | "neutral";
export type PersonaDepartment =
  | "executive"
  | "support"
  | "engineering"
  | "sales"
  | "legal"
  | "marketing"
  | "hr"
  | "finance";

export interface VoicePersona {
  id: string;
  name: string;
  gender: VoiceGender;
  language: string; // BCP-47
  accent?: string;
  paceWpm: number;
  pitch: number; // -10..10
  warmth: number; // 0..1
  clarity: number; // 0..1
  sampleText?: string;
  createdAt: string;
}

export interface AvatarConfig {
  id: string;
  name: string;
  style: "realistic" | "illustrated" | "abstract" | "3d";
  accentColor: string;
  imageUrl?: string;
  createdAt: string;
}

export interface RegionalPersonaOverride {
  region: string; // e.g. "jp", "de"
  formality?: number;
  empathy?: number;
  humor?: number;
  verbosity?: number;
  assertiveness?: number;
  greeting?: string;
  signoff?: string;
}

export interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  tone: string; // free-text e.g. "warm-professional"
  formality: number; // 0..1
  empathy: number;
  humor: number;
  verbosity: number;
  assertiveness: number;
  brandAlignment: number; // 0..100
  voicePersonaId?: string;
  avatarId?: string;
  useCases: string[];
  regionalOverrides: RegionalPersonaOverride[];
  createdAt: string;
}

export interface DepartmentPersonality {
  id: string;
  department: PersonaDepartment;
  profileId: string;
  voicePersonaId?: string;
  avatarId?: string;
  inheritedByWorkforces: string[];
  enabled: boolean;
}

export interface ResolvedPersona {
  department: PersonaDepartment;
  region?: string;
  profile: PersonalityProfile;
  voice?: VoicePersona;
  avatar?: AvatarConfig;
  effectiveTraits: {
    formality: number;
    empathy: number;
    humor: number;
    verbosity: number;
    assertiveness: number;
  };
}

// ---------------------------------------------------------------------------
// Slice 290 — Trust, Explainability & Verification
// ---------------------------------------------------------------------------

export type VerificationStatus =
  | "unverified"
  | "verified"
  | "partially-verified"
  | "disputed"
  | "retracted";
export type AiReviewStatus = "auto-published" | "show-with-disclaimer" | "requires-human-review" | "blocked";
export type SourceQuality = "high" | "medium" | "low" | "unknown";

export interface Evidence {
  id: string;
  source: string;
  sourceType: "document" | "api" | "knowledge-base" | "web" | "user-input" | "model-knowledge";
  sourceQuality: SourceQuality;
  dataFreshness: "fresh" | "recent" | "stale" | "unknown";
  excerpt?: string;
  url?: string;
  lastVerifiedAt?: string;
  supportsClaim: boolean;
}

export interface ExplainabilityReport {
  reasoningSummary: string;
  keySteps: string[];
  dataSourcesUsed: string[];
  assumptions: string[];
  limitations: string[];
  uncertaintySources: string[];
  modelVersion: string;
  traceId?: string;
}

export interface AlternativeViewpoint {
  id: string;
  perspective: string;
  summary: string;
  confidence: number;
  supportingSources: string[];
}

export interface UncertaintySignal {
  type: "ambiguous-input" | "conflicting-sources" | "low-evidence" | "out-of-distribution" | "stale-data";
  severity: "low" | "medium" | "high";
  description: string;
}

export interface ComplianceCheck {
  policyId: string;
  policyName: string;
  passed: boolean;
  violations: string[];
  riskLevel: "none" | "low" | "medium" | "high";
}

export interface TrustScore {
  id: string;
  responseId: string;
  confidence: number; // 0..1
  verificationStatus: VerificationStatus;
  evidenceCount: number;
  corroboratingEvidencePct: number;
  freshnessScore: number; // 0..1
  sourceQualityAvg: number; // 0..1
  policyCompliant: boolean;
  uncertaintyLevel: "low" | "medium" | "high";
  recommendedAction: AiReviewStatus;
  explainabilityReport: ExplainabilityReport;
  evidence: Evidence[];
  alternativeViewpoints: AlternativeViewpoint[];
  uncertaintySignals: UncertaintySignal[];
  complianceChecks: ComplianceCheck[];
  humanReviewedBy?: string;
  humanReviewedAt?: string;
  humanReviewOutcome?: "approved" | "rejected" | "escalated";
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Dashboard rollup
// ---------------------------------------------------------------------------

export interface AiEcosystemDashboard {
  providers: number;
  providersHealthy: number;
  providersSelfHosted: number;
  models: number;
  modelsEnabled: number;
  routingPolicies: number;
  requests24h: number;
  tokens24h: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  cost24hUsd: number;
  fallbackInvocations24h: number;
  errorRatePct: number;
  activeBenchmarks: number;

  personalityProfiles: number;
  activePersonas: number;
  voicePersonas: number;
  avatars: number;
  departmentsCovered: number;
  avgBrandAlignment: number;

  trustScoredResponses24h: number;
  verifiedResponses24h: number;
  humanReviewQueue: number;
  blockedResponses24h: number;
  avgConfidence: number;
  policyFailures24h: number;
}
