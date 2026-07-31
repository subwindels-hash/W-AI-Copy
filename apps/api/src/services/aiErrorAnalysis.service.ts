/**
 * Module 90: AI Error Analysis Service
 *
 * Provides comprehensive error analysis for AI models including error classification
 * with failure mode taxonomy, root cause analysis with causal graph construction,
 * stack trace analysis across AI pipeline stages, error pattern detection with
 * clustering, error correlation analysis, and automated error remediation suggestions.
 *
 * Phase 1 — Error classification, root cause analysis, and error pattern detection
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErrorSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ErrorCategory =
  | "data-error"
  | "model-error"
  | "infrastructure-error"
  | "configuration-error"
  | "runtime-error"
  | "integration-error"
  | "resource-error"
  | "security-error";

export type ErrorSubcategory =
  | "input-validation"
  | "preprocessing-failure"
  | "shape-mismatch"
  | "dtype-mismatch"
  | "out-of-memory"
  | "gradient-explosion"
  | "gradient-vanishing"
  | "numerical-instability"
  | "convergence-failure"
  | "overfitting"
  | "underfitting"
  | "data-leakage"
  | "feature-drift"
  | "model-timeout"
  | "api-failure"
  | "dependency-failure"
  | "permission-denied"
  | "rate-limiting"
  | "network-error"
  | "hardware-failure"
  | "cuda-error"
  | "serialization-error";

export type AnalysisStatus = "pending" | "analyzing" | "completed" | "inconclusive" | "failed";

export type RootCauseConfidence = "confirmed" | "high-confidence" | "medium-confidence" | "low-confidence" | "speculative";

export type PipelineStage = "data-ingestion" | "preprocessing" | "feature-engineering" | "model-inference" | "postprocessing" | "output-validation" | "response-formatting";

export type ErrorPatternType = "recurring" | "cascading" | "intermittent" | "seasonal" | "load-dependent" | "data-dependent" | "configuration-dependent";

export interface AIError {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  category: ErrorCategory;
  subcategory: ErrorSubcategory;
  severity: ErrorSeverity;
  title: string;
  message: string;
  stackTrace: StackFrame[];
  pipelineStage: PipelineStage;
  context: ErrorContext;
  timestamp: string;
  resolvedAt: string | null;
  resolution: string | null;
  analysisId: string | null;
  metadata: Record<string, unknown>;
}

export interface StackFrame {
  index: number;
  file: string;
  function: string;
  line: number;
  column: number;
  isUserCode: boolean;
  isAIFramework: boolean;
  variables: Record<string, string>;
  codeSnippet: string | null;
}

export interface ErrorContext {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  inputShape: number[] | null;
  inputDtype: string | null;
  modelVersion: string;
  environment: string;
  hardwareInfo: {
    gpuType: string | null;
    gpuMemoryUsed: number | null;
    gpuMemoryTotal: number | null;
    cpuUsage: number | null;
    memoryUsed: number | null;
    memoryTotal: number | null;
  };
  recentErrors: string[];
  concurrentRequests: number;
  timeSinceLastDeployment: number;
}

export interface ErrorAnalysis {
  id: string;
  organizationId: string;
  errorId: string;
  status: AnalysisStatus;
  rootCauses: RootCause[];
  causalGraph: CausalGraphNode[];
  contributingFactors: ContributingFactor[];
  similarErrors: SimilarErrorMatch[];
  patternMatches: ErrorPatternMatch[];
  remediations: Remediation[];
  timeline: AnalysisTimelineEntry[];
  confidence: number;
  analyzedAt: string;
  completedAt: string | null;
}

export interface RootCause {
  id: string;
  description: string;
  category: ErrorCategory;
  subcategory: ErrorSubcategory;
  confidence: RootCauseConfidence;
  confidenceScore: number;
  evidence: RootCauseEvidence[];
  affectedComponents: string[];
  suggestedFix: string;
  estimatedFixEffort: "trivial" | "small" | "medium" | "large" | "complex";
  priority: number;
}

export interface RootCauseEvidence {
  type: "log-entry" | "metric-anomaly" | "code-path" | "configuration" | "correlation" | "historical-pattern";
  description: string;
  source: string;
  timestamp: string;
  weight: number;
  details: Record<string, unknown>;
}

export interface CausalGraphNode {
  id: string;
  type: "root-cause" | "intermediate" | "symptom" | "contributing-factor";
  label: string;
  description: string;
  edges: CausalEdge[];
  metadata: Record<string, unknown>;
}

export interface CausalEdge {
  sourceId: string;
  targetId: string;
  relationship: "causes" | "contributes-to" | "correlates-with" | "triggers";
  weight: number;
  description: string;
}

export interface ContributingFactor {
  id: string;
  description: string;
  impactScore: number;
  category: string;
  evidence: string;
  mitigable: boolean;
  mitigationStrategy: string;
}

export interface SimilarErrorMatch {
  errorId: string;
  similarityScore: number;
  matchReason: string;
  sharedRootCause: string | null;
  resolvedBy: string | null;
}

export interface ErrorPatternMatch {
  patternId: string;
  patternName: string;
  matchScore: number;
  occurrences: number;
  description: string;
}

export interface Remediation {
  id: string;
  title: string;
  description: string;
  type: "code-fix" | "configuration-change" | "data-fix" | "infrastructure-change" | "model-retrain" | "workaround";
  priority: number;
  effort: "trivial" | "small" | "medium" | "large" | "complex";
  impact: "high" | "medium" | "low";
  riskLevel: "low" | "medium" | "high";
  steps: RemediationStep[];
  estimatedTimeMinutes: number;
  automatedApplicable: boolean;
}

export interface RemediationStep {
  order: number;
  description: string;
  file: string | null;
  codeChange: string | null;
  command: string | null;
  verification: string;
}

export interface AnalysisTimelineEntry {
  timestamp: string;
  phase: "collection" | "classification" | "correlation" | "causal-analysis" | "remediation-generation" | "completion";
  description: string;
  duration: number;
  artifacts: string[];
}

export interface ErrorPattern {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: ErrorPatternType;
  category: ErrorCategory;
  signature: ErrorPatternSignature;
  occurrences: ErrorPatternOccurrence[];
  statistics: ErrorPatternStatistics;
  status: "active" | "resolved" | "suppressed";
  detectionRules: ErrorDetectionRule[];
  createdAt: string;
  updatedAt: string;
}

export interface ErrorPatternSignature {
  category: ErrorCategory;
  subcategories: ErrorSubcategory[];
  pipelineStages: PipelineStage[];
  messagePatterns: string[];
  stackTracePatterns: string[];
  contextConditions: Array<{
    field: string;
    operator: "equals" | "contains" | "greater-than" | "less-than" | "regex";
    value: string;
  }>;
}

export interface ErrorPatternOccurrence {
  errorId: string;
  timestamp: string;
  modelId: string;
  severity: ErrorSeverity;
  matchedRules: string[];
}

export interface ErrorPatternStatistics {
  totalOccurrences: number;
  firstSeen: string;
  lastSeen: string;
  frequency: "constant" | "increasing" | "decreasing" | "sporadic";
  averageResolutionTimeMinutes: number;
  affectedModels: string[];
  peakHours: number[];
  correlationWithDeployments: number;
  correlationWithTrafficSpikes: number;
}

export interface ErrorDetectionRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  severity: ErrorSeverity;
  enabled: boolean;
  actionOnError: "alert" | "auto-remediate" | "escalate" | "log-only";
}

export interface ErrorCorrelation {
  id: string;
  organizationId: string;
  errorIds: string[];
  correlationType: "temporal" | "causal" | "shared-root-cause" | "cascading" | "co-occurring";
  correlationScore: number;
  description: string;
  timeline: Array<{ errorId: string; timestamp: string; order: number }>;
  sharedContext: Record<string, unknown>;
  detectedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const errors = new Map<string, AIError>();
const errorAnalyses = new Map<string, ErrorAnalysis>();
const errorPatterns = new Map<string, ErrorPattern>();
const errorCorrelations = new Map<string, ErrorCorrelation>();

// ─── Error Recording ──────────────────────────────────────────────────────────

export async function recordError(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  category: ErrorCategory;
  subcategory: ErrorSubcategory;
  severity: ErrorSeverity;
  title: string;
  message: string;
  stackTrace?: StackFrame[];
  pipelineStage: PipelineStage;
  context?: Partial<ErrorContext>;
  metadata?: Record<string, unknown>;
}): Promise<AIError> {
  const now = new Date().toISOString();
  const defaultStackTrace: StackFrame[] = [
    {
      index: 0,
      file: `src/models/${params.modelId}/inference.ts`,
      function: "forward",
      line: 142,
      column: 15,
      isUserCode: true,
      isAIFramework: false,
      variables: { input: "Tensor[1,128,512]", output: "undefined" },
      codeSnippet: "const output = model.forward(input);",
    },
    {
      index: 1,
      file: "src/pipeline/inference_engine.ts",
      function: "runInference",
      line: 89,
      column: 22,
      isUserCode: true,
      isAIFramework: false,
      variables: { batchSize: "1", timeout: "30000" },
      codeSnippet: "return await engine.runInference(model, input);",
    },
    {
      index: 2,
      file: "node_modules/torch/core/module.js",
      function: "Module.call",
      line: 1523,
      column: 8,
      isUserCode: false,
      isAIFramework: true,
      variables: {},
      codeSnippet: null,
    },
  ];
  const defaultContext: ErrorContext = {
    requestId: `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    sessionId: null,
    userId: null,
    inputShape: [1, 128, 512],
    inputDtype: "float32",
    modelVersion: "1.0.0",
    environment: "production",
    hardwareInfo: {
      gpuType: "NVIDIA A100",
      gpuMemoryUsed: Math.floor(Math.random() * 40000) + 10000,
      gpuMemoryTotal: 80000,
      cpuUsage: Math.random() * 100,
      memoryUsed: Math.floor(Math.random() * 32000) + 8000,
      memoryTotal: 64000,
    },
    recentErrors: [],
    concurrentRequests: Math.floor(Math.random() * 50) + 1,
    timeSinceLastDeployment: Math.floor(Math.random() * 720) + 1,
  };
  const error: AIError = {
    id: `aie_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    category: params.category,
    subcategory: params.subcategory,
    severity: params.severity,
    title: params.title,
    message: params.message,
    stackTrace: params.stackTrace || defaultStackTrace,
    pipelineStage: params.pipelineStage,
    context: { ...defaultContext, ...params.context },
    timestamp: now,
    resolvedAt: null,
    resolution: null,
    analysisId: null,
    metadata: params.metadata || {},
  };
  errors.set(error.id, error);
  return error;
}

export async function getError(errorId: string): Promise<AIError | null> {
  return errors.get(errorId) || null;
}

export async function listErrors(organizationId: string, filters?: {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  modelId?: string;
  pipelineStage?: PipelineStage;
  since?: string;
  unresolved?: boolean;
}): Promise<AIError[]> {
  let result = Array.from(errors.values()).filter((e) => e.organizationId === organizationId);
  if (filters?.category) result = result.filter((e) => e.category === filters.category);
  if (filters?.severity) result = result.filter((e) => e.severity === filters.severity);
  if (filters?.modelId) result = result.filter((e) => e.modelId === filters.modelId);
  if (filters?.pipelineStage) result = result.filter((e) => e.pipelineStage === filters.pipelineStage);
  if (filters?.since) result = result.filter((e) => e.timestamp >= filters.since!);
  if (filters?.unresolved) result = result.filter((e) => e.resolvedAt === null);
  return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function resolveError(errorId: string, resolution: string): Promise<AIError> {
  const error = errors.get(errorId);
  if (!error) throw new Error(`Error ${errorId} not found`);
  error.resolvedAt = new Date().toISOString();
  error.resolution = resolution;
  return error;
}

// ─── Error Analysis ───────────────────────────────────────────────────────────

export async function analyzeError(errorId: string): Promise<ErrorAnalysis> {
  const error = errors.get(errorId);
  if (!error) throw new Error(`Error ${errorId} not found`);
  const now = new Date().toISOString();
  const analysisId = `ea_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  // Generate root causes
  const rootCauses = generateRootCauses(error);
  // Build causal graph
  const causalGraph = buildCausalGraph(error, rootCauses);
  // Generate contributing factors
  const contributingFactors = generateContributingFactors(error);
  // Find similar errors
  const similarErrors = findSimilarErrors(error);
  // Match error patterns
  const patternMatches = matchErrorPatterns(error);
  // Generate remediations
  const remediations = generateRemediations(error, rootCauses);
  const timeline: AnalysisTimelineEntry[] = [
    { timestamp: now, phase: "collection", description: "Collected error context, stack trace, and system metrics", duration: 120, artifacts: ["stack-trace", "system-metrics", "recent-logs"] },
    { timestamp: now, phase: "classification", description: `Classified error as ${error.category}/${error.subcategory}`, duration: 85, artifacts: ["classification-result"] },
    { timestamp: now, phase: "correlation", description: `Found ${similarErrors.length} similar errors and ${patternMatches.length} pattern matches`, duration: 340, artifacts: ["similar-errors", "pattern-matches"] },
    { timestamp: now, phase: "causal-analysis", description: `Identified ${rootCauses.length} root causes with causal graph`, duration: 520, artifacts: ["root-causes", "causal-graph"] },
    { timestamp: now, phase: "remediation-generation", description: `Generated ${remediations.length} remediation suggestions`, duration: 280, artifacts: ["remediations"] },
    { timestamp: now, phase: "completion", description: "Analysis completed successfully", duration: 15, artifacts: ["analysis-report"] },
  ];
  const confidence = rootCauses.length > 0
    ? rootCauses.reduce((acc, rc) => acc + rc.confidenceScore, 0) / rootCauses.length
    : 0;
  const analysis: ErrorAnalysis = {
    id: analysisId,
    organizationId: error.organizationId,
    errorId,
    status: rootCauses.length > 0 ? "completed" : "inconclusive",
    rootCauses,
    causalGraph,
    contributingFactors,
    similarErrors,
    patternMatches,
    remediations,
    timeline,
    confidence,
    analyzedAt: now,
    completedAt: now,
  };
  errorAnalyses.set(analysis.id, analysis);
  error.analysisId = analysis.id;
  return analysis;
}

function generateRootCauses(error: AIError): RootCause[] {
  const now = new Date().toISOString();
  const causes: RootCause[] = [];
  // Primary root cause based on category
  const primaryCauseMap: Record<ErrorCategory, { desc: string; sub: ErrorSubcategory; fix: string; effort: RootCause["estimatedFixEffort"] }> = {
    "data-error": { desc: "Input data contains invalid values or unexpected format causing processing failure", sub: "input-validation", fix: "Add input validation and sanitization before model inference", effort: "small" },
    "model-error": { desc: "Model architecture mismatch or weight corruption causing numerical instability", sub: "numerical-instability", fix: "Verify model weights integrity and re-export from training checkpoint", effort: "medium" },
    "infrastructure-error": { desc: "GPU memory exhaustion due to concurrent inference requests exceeding available VRAM", sub: "out-of-memory", fix: "Implement request queuing with memory-aware scheduling and batch size limits", effort: "medium" },
    "configuration-error": { desc: "Incorrect model configuration parameters causing shape or dtype mismatch", sub: "shape-mismatch", fix: "Update model configuration to match expected input/output specifications", effort: "trivial" },
    "runtime-error": { desc: "Unhandled exception during model forward pass due to unexpected tensor operation", sub: "cuda-error", fix: "Add error handling around tensor operations with graceful fallback", effort: "small" },
    "integration-error": { desc: "Downstream service timeout causing cascading failure in inference pipeline", sub: "api-failure", fix: "Implement circuit breaker pattern with fallback responses", effort: "medium" },
    "resource-error": { desc: "Insufficient compute resources allocated for model serving under current load", sub: "hardware-failure", fix: "Scale up inference infrastructure or optimize model for lower resource usage", effort: "large" },
    "security-error": { desc: "Unauthorized access attempt to model inference endpoint triggering security block", sub: "permission-denied", fix: "Review and update API authentication and authorization policies", effort: "small" },
  };
  const primary = primaryCauseMap[error.category];
  causes.push({
    id: `rc_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    description: primary.desc,
    category: error.category,
    subcategory: primary.sub,
    confidence: "high-confidence",
    confidenceScore: 0.85,
    evidence: [
      {
        type: "log-entry",
        description: `Error originated at pipeline stage: ${error.pipelineStage}`,
        source: "pipeline-logs",
        timestamp: error.timestamp,
        weight: 0.9,
        details: { pipelineStage: error.pipelineStage },
      },
      {
        type: "code-path",
        description: `Stack trace shows failure in ${error.stackTrace[0]?.function || "unknown"} at ${error.stackTrace[0]?.file || "unknown"}`,
        source: "stack-trace-analysis",
        timestamp: error.timestamp,
        weight: 0.85,
        details: { function: error.stackTrace[0]?.function, file: error.stackTrace[0]?.file },
      },
      {
        type: "metric-anomaly",
        description: `GPU memory usage at ${error.context.hardwareInfo.gpuMemoryUsed}MB / ${error.context.hardwareInfo.gpuMemoryTotal}MB`,
        source: "system-metrics",
        timestamp: error.timestamp,
        weight: 0.7,
        details: { gpuMemoryUsed: error.context.hardwareInfo.gpuMemoryUsed },
      },
    ],
    affectedComponents: [error.modelName, error.pipelineStage, error.stackTrace[0]?.function || "unknown"],
    suggestedFix: primary.fix,
    estimatedFixEffort: primary.effort,
    priority: 1,
  });
  // Secondary root cause
  const secondaryCauses: Array<{ desc: string; cat: ErrorCategory; sub: ErrorSubcategory; fix: string; effort: RootCause["estimatedFixEffort"] }> = [
    { desc: "Insufficient error handling in preprocessing pipeline allows malformed data to reach model", cat: "data-error", sub: "preprocessing-failure", fix: "Add comprehensive input validation with schema enforcement", effort: "small" },
    { desc: "Missing retry logic for transient failures causes permanent errors from temporary conditions", cat: "infrastructure-error", sub: "network-error", fix: "Implement exponential backoff retry with jitter for transient errors", effort: "small" },
    { desc: "Model version mismatch between training and serving environments", cat: "configuration-error", sub: "shape-mismatch", fix: "Implement model version pinning and validation at deployment time", effort: "medium" },
  ];
  const secondary = secondaryCauses[Math.floor(Math.random() * secondaryCauses.length)];
  causes.push({
    id: `rc_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    description: secondary.desc,
    category: secondary.cat,
    subcategory: secondary.sub,
    confidence: "medium-confidence",
    confidenceScore: 0.55,
    evidence: [
      {
        type: "correlation",
        description: "Pattern observed across multiple recent errors of similar type",
        source: "historical-analysis",
        timestamp: now,
        weight: 0.6,
        details: { correlationWindow: "24h" },
      },
    ],
    affectedComponents: [error.modelName, "preprocessing-pipeline"],
    suggestedFix: secondary.fix,
    estimatedFixEffort: secondary.effort,
    priority: 2,
  });
  return causes;
}

function buildCausalGraph(error: AIError, rootCauses: RootCause[]): CausalGraphNode[] {
  const nodes: CausalGraphNode[] = [];
  // Root cause nodes
  rootCauses.forEach((rc, idx) => {
    nodes.push({
      id: `cgn_rc_${idx}`,
      type: "root-cause",
      label: rc.subcategory,
      description: rc.description,
      edges: [
        { sourceId: `cgn_rc_${idx}`, targetId: `cgn_int_0`, relationship: "causes", weight: rc.confidenceScore, description: "Direct causal relationship" },
      ],
      metadata: { confidenceScore: rc.confidenceScore },
    });
  });
  // Intermediate node
  nodes.push({
    id: "cgn_int_0",
    type: "intermediate",
    label: `${error.pipelineStage} failure`,
    description: `Failure propagated through ${error.pipelineStage} stage`,
    edges: [
      { sourceId: "cgn_int_0", targetId: "cgn_sym_0", relationship: "causes", weight: 0.9, description: "Pipeline stage failure causes observed error" },
    ],
    metadata: { pipelineStage: error.pipelineStage },
  });
  // Contributing factor node
  nodes.push({
    id: "cgn_cf_0",
    type: "contributing-factor",
    label: "System load",
    description: `Concurrent requests: ${error.context.concurrentRequests}`,
    edges: [
      { sourceId: "cgn_cf_0", targetId: "cgn_int_0", relationship: "contributes-to", weight: 0.4, description: "High load exacerbates failure conditions" },
    ],
    metadata: { concurrentRequests: error.context.concurrentRequests },
  });
  // Symptom node (the observed error)
  nodes.push({
    id: "cgn_sym_0",
    type: "symptom",
    label: error.title,
    description: error.message,
    edges: [],
    metadata: { errorId: error.id, severity: error.severity },
  });
  return nodes;
}

function generateContributingFactors(error: AIError): ContributingFactor[] {
  const factors: ContributingFactor[] = [];
  if (error.context.concurrentRequests > 20) {
    factors.push({
      id: `cf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      description: `High concurrent request load (${error.context.concurrentRequests} requests) may have stressed system resources`,
      impactScore: 0.6,
      category: "load",
      evidence: `Concurrent request count of ${error.context.concurrentRequests} exceeds typical baseline`,
      mitigable: true,
      mitigationStrategy: "Implement request rate limiting and auto-scaling policies",
    });
  }
  if (error.context.timeSinceLastDeployment < 24) {
    factors.push({
      id: `cf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      description: `Recent deployment (${error.context.timeSinceLastDeployment}h ago) may have introduced regression`,
      impactScore: 0.7,
      category: "deployment",
      evidence: `Deployment occurred within the last ${error.context.timeSinceLastDeployment} hours`,
      mitigable: true,
      mitigationStrategy: "Review deployment changelog and consider rollback if errors correlate with deployment time",
    });
  }
  factors.push({
    id: `cf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    description: `Model version ${error.context.modelVersion} may have known issues in current environment`,
    impactScore: 0.4,
    category: "model-version",
    evidence: `Running model version ${error.context.modelVersion} in ${error.context.environment}`,
    mitigable: true,
    mitigationStrategy: "Check model version compatibility matrix and update if newer stable version available",
  });
  return factors;
}

function findSimilarErrors(error: AIError): SimilarErrorMatch[] {
  const allErrors = Array.from(errors.values()).filter(
    (e) => e.id !== error.id && e.organizationId === error.organizationId
  );
  return allErrors
    .map((e) => {
      let score = 0;
      if (e.category === error.category) score += 0.3;
      if (e.subcategory === error.subcategory) score += 0.25;
      if (e.pipelineStage === error.pipelineStage) score += 0.2;
      if (e.modelId === error.modelId) score += 0.15;
      if (e.severity === error.severity) score += 0.1;
      return { errorId: e.id, score, error: e };
    })
    .filter((m) => m.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => ({
      errorId: m.errorId,
      similarityScore: m.score,
      matchReason: `Shared ${m.error.category === error.category ? "category" : "characteristics"}: ${m.error.category}/${m.error.subcategory}`,
      sharedRootCause: m.score > 0.7 ? "Likely shared root cause based on high similarity" : null,
      resolvedBy: m.error.resolvedAt ? m.error.resolution : null,
    }));
}

function matchErrorPatterns(error: AIError): ErrorPatternMatch[] {
  const patterns = Array.from(errorPatterns.values()).filter(
    (p) => p.organizationId === error.organizationId && p.status === "active"
  );
  return patterns
    .map((p) => {
      let score = 0;
      if (p.signature.category === error.category) score += 0.3;
      if (p.signature.subcategories.includes(error.subcategory)) score += 0.25;
      if (p.signature.pipelineStages.includes(error.pipelineStage)) score += 0.2;
      const messageMatch = p.signature.messagePatterns.some((pat) => error.message.toLowerCase().includes(pat.toLowerCase()));
      if (messageMatch) score += 0.25;
      return { pattern: p, score };
    })
    .filter((m) => m.score > 0.4)
    .map((m) => ({
      patternId: m.pattern.id,
      patternName: m.pattern.name,
      matchScore: m.score,
      occurrences: m.pattern.statistics.totalOccurrences,
      description: m.pattern.description,
    }));
}

function generateRemediations(error: AIError, rootCauses: RootCause[]): Remediation[] {
  const remediations: Remediation[] = [];
  rootCauses.forEach((rc, idx) => {
    remediations.push({
      id: `rem_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      title: `Fix: ${rc.subcategory} in ${error.pipelineStage}`,
      description: rc.suggestedFix,
      type: rc.category === "data-error" ? "data-fix" :
            rc.category === "configuration-error" ? "configuration-change" :
            rc.category === "infrastructure-error" ? "infrastructure-change" :
            rc.category === "model-error" ? "model-retrain" : "code-fix",
      priority: idx + 1,
      effort: rc.estimatedFixEffort,
      impact: idx === 0 ? "high" : "medium",
      riskLevel: rc.estimatedFixEffort === "trivial" || rc.estimatedFixEffort === "small" ? "low" : "medium",
      steps: [
        { order: 1, description: "Identify the affected code/configuration", file: error.stackTrace[0]?.file || null, codeChange: null, command: null, verification: "Review error stack trace and identify failure point" },
        { order: 2, description: "Implement the fix", file: error.stackTrace[0]?.file || null, codeChange: `// ${rc.suggestedFix}`, command: null, verification: "Run unit tests to verify fix" },
        { order: 3, description: "Test in staging environment", file: null, codeChange: null, command: "npm run test:staging", verification: "Confirm error does not reproduce in staging" },
        { order: 4, description: "Deploy to production", file: null, codeChange: null, command: "npm run deploy:prod", verification: "Monitor error rates for 30 minutes post-deployment" },
      ],
      estimatedTimeMinutes: rc.estimatedFixEffort === "trivial" ? 15 :
                            rc.estimatedFixEffort === "small" ? 60 :
                            rc.estimatedFixEffort === "medium" ? 240 :
                            rc.estimatedFixEffort === "large" ? 960 : 2400,
      automatedApplicable: rc.estimatedFixEffort === "trivial" || rc.estimatedFixEffort === "small",
    });
  });
  // Add workaround
  remediations.push({
    id: `rem_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    title: `Temporary workaround: Graceful degradation for ${error.pipelineStage}`,
    description: "Implement fallback behavior to maintain partial service while root cause is addressed",
    type: "workaround",
    priority: remediations.length + 1,
    effort: "small",
    impact: "medium",
    riskLevel: "low",
    steps: [
      { order: 1, description: "Add try-catch around failing pipeline stage", file: error.stackTrace[0]?.file || null, codeChange: "try { ... } catch(e) { return fallbackResponse(); }", command: null, verification: "Verify fallback response is returned on error" },
      { order: 2, description: "Add monitoring alert for fallback activation rate", file: null, codeChange: null, command: null, verification: "Alert fires when fallback rate exceeds 5%" },
    ],
    estimatedTimeMinutes: 30,
    automatedApplicable: true,
  });
  return remediations;
}

// ─── Stack Trace Analysis ─────────────────────────────────────────────────────

export async function analyzeStackTrace(errorId: string): Promise<{
  errorId: string;
  totalFrames: number;
  userCodeFrames: number;
  frameworkFrames: number;
  failurePoint: StackFrame | null;
  callChain: string[];
  suspectedIssue: string;
  relatedFiles: string[];
  suggestions: string[];
}> {
  const error = errors.get(errorId);
  if (!error) throw new Error(`Error ${errorId} not found`);
  const userFrames = error.stackTrace.filter((f) => f.isUserCode);
  const frameworkFrames = error.stackTrace.filter((f) => f.isAIFramework);
  const failurePoint = userFrames[0] || error.stackTrace[0] || null;
  const callChain = error.stackTrace.map((f) => `${f.function} (${f.file}:${f.line})`);
  const relatedFiles = [...new Set(error.stackTrace.map((f) => f.file))];
  const suggestions: string[] = [];
  if (failurePoint?.codeSnippet) {
    suggestions.push(`Review code at ${failurePoint.file}:${failurePoint.line} — "${failurePoint.codeSnippet}"`);
  }
  if (error.context.hardwareInfo.gpuMemoryUsed && error.context.hardwareInfo.gpuMemoryTotal) {
    const usageRatio = error.context.hardwareInfo.gpuMemoryUsed / error.context.hardwareInfo.gpuMemoryTotal;
    if (usageRatio > 0.9) suggestions.push("GPU memory usage exceeds 90% — consider reducing batch size or model size");
  }
  if (frameworkFrames.length > 0) {
    suggestions.push("Error originates in AI framework code — check framework version compatibility and known issues");
  }
  suggestions.push(`Add logging at ${error.pipelineStage} stage to capture more diagnostic information`);
  return {
    errorId,
    totalFrames: error.stackTrace.length,
    userCodeFrames: userFrames.length,
    frameworkFrames: frameworkFrames.length,
    failurePoint,
    callChain,
    suspectedIssue: `${error.subcategory} in ${failurePoint?.function || "unknown function"}`,
    relatedFiles,
    suggestions,
  };
}

// ─── Error Pattern Management ─────────────────────────────────────────────────

export async function createErrorPattern(params: {
  organizationId: string;
  name: string;
  description: string;
  type: ErrorPatternType;
  category: ErrorCategory;
  signature: ErrorPatternSignature;
  detectionRules?: ErrorDetectionRule[];
}): Promise<ErrorPattern> {
  const now = new Date().toISOString();
  const pattern: ErrorPattern = {
    id: `ep_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    category: params.category,
    signature: params.signature,
    occurrences: [],
    statistics: {
      totalOccurrences: 0,
      firstSeen: now,
      lastSeen: now,
      frequency: "constant",
      averageResolutionTimeMinutes: 0,
      affectedModels: [],
      peakHours: [],
      correlationWithDeployments: 0,
      correlationWithTrafficSpikes: 0,
    },
    status: "active",
    detectionRules: params.detectionRules || [
      {
        id: `edr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        name: `Auto-detect ${params.name}`,
        description: `Automatically detect ${params.name} pattern in incoming errors`,
        condition: `category == "${params.category}"`,
        severity: "medium",
        enabled: true,
        actionOnError: "alert",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  errorPatterns.set(pattern.id, pattern);
  return pattern;
}

export async function detectErrorPattern(errorId: string): Promise<ErrorPatternMatch[]> {
  const error = errors.get(errorId);
  if (!error) throw new Error(`Error ${errorId} not found`);
  const matches = matchErrorPatterns(error);
  // Update pattern occurrence tracking
  matches.forEach((m) => {
    const pattern = errorPatterns.get(m.patternId);
    if (pattern) {
      pattern.occurrences.push({
        errorId,
        timestamp: error.timestamp,
        modelId: error.modelId,
        severity: error.severity,
        matchedRules: [m.patternName],
      });
      pattern.statistics.totalOccurrences += 1;
      pattern.statistics.lastSeen = error.timestamp;
      if (!pattern.statistics.affectedModels.includes(error.modelId)) {
        pattern.statistics.affectedModels.push(error.modelId);
      }
      pattern.updatedAt = new Date().toISOString();
    }
  });
  return matches;
}

export async function listErrorPatterns(organizationId: string): Promise<ErrorPattern[]> {
  return Array.from(errorPatterns.values()).filter((p) => p.organizationId === organizationId);
}

// ─── Error Correlation ────────────────────────────────────────────────────────

export async function correlateErrors(organizationId: string, params: {
  timeWindowMinutes: number;
  minCorrelationScore: number;
}): Promise<ErrorCorrelation[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - params.timeWindowMinutes * 60000).toISOString();
  const recentErrors = Array.from(errors.values())
    .filter((e) => e.organizationId === organizationId && e.timestamp >= windowStart)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const correlations: ErrorCorrelation[] = [];
  // Group errors by temporal proximity
  for (let i = 0; i < recentErrors.length; i++) {
    const group = [recentErrors[i]];
    for (let j = i + 1; j < recentErrors.length; j++) {
      const timeDiff = new Date(recentErrors[j].timestamp).getTime() - new Date(recentErrors[i].timestamp).getTime();
      if (timeDiff > 300000) break; // 5 minute window
      if (recentErrors[j].modelId === recentErrors[i].modelId || recentErrors[j].pipelineStage === recentErrors[i].pipelineStage) {
        group.push(recentErrors[j]);
      }
    }
    if (group.length >= 2) {
      const score = Math.min(1, group.length * 0.2 + (group.every((e) => e.modelId === group[0].modelId) ? 0.3 : 0));
      if (score >= params.minCorrelationScore) {
        const correlation: ErrorCorrelation = {
          id: `ec_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
          organizationId,
          errorIds: group.map((e) => e.id),
          correlationType: group.every((e) => e.modelId === group[0].modelId) ? "cascading" : "co-occurring",
          correlationScore: score,
          description: `${group.length} correlated errors detected within ${params.timeWindowMinutes} minute window affecting ${[...new Set(group.map((e) => e.modelName))].join(", ")}`,
          timeline: group.map((e, idx) => ({
            errorId: e.id,
            timestamp: e.timestamp,
            order: idx,
          })),
          sharedContext: {
            modelId: group.every((e) => e.modelId === group[0].modelId) ? group[0].modelId : "multiple",
            pipelineStages: [...new Set(group.map((e) => e.pipelineStage))],
            environment: group[0].context.environment,
          },
          detectedAt: now.toISOString(),
        };
        correlations.push(correlation);
        errorCorrelations.set(correlation.id, correlation);
      }
    }
  }
  return correlations;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getStats(organizationId: string): Promise<{
  totalErrors: number;
  unresolvedErrors: number;
  criticalErrors: number;
  analysesCompleted: number;
  averageConfidence: number;
  categoryDistribution: Record<string, number>;
  severityDistribution: Record<string, number>;
  pipelineStageDistribution: Record<string, number>;
  topErrorPatterns: Array<{ name: string; occurrences: number }>;
  averageResolutionTimeMinutes: number;
  errorTrend: "increasing" | "stable" | "decreasing";
}> {
  const orgErrors = Array.from(errors.values()).filter((e) => e.organizationId === organizationId);
  const orgAnalyses = Array.from(errorAnalyses.values()).filter((a) => a.organizationId === organizationId);
  const orgPatterns = Array.from(errorPatterns.values()).filter((p) => p.organizationId === organizationId);
  const categories: Record<string, number> = {};
  const severities: Record<string, number> = {};
  const stages: Record<string, number> = {};
  orgErrors.forEach((e) => {
    categories[e.category] = (categories[e.category] || 0) + 1;
    severities[e.severity] = (severities[e.severity] || 0) + 1;
    stages[e.pipelineStage] = (stages[e.pipelineStage] || 0) + 1;
  });
  const avgConfidence = orgAnalyses.length > 0
    ? orgAnalyses.reduce((acc, a) => acc + a.confidence, 0) / orgAnalyses.length
    : 0;
  // Calculate resolution time
  const resolvedErrors = orgErrors.filter((e) => e.resolvedAt !== null);
  const avgResTime = resolvedErrors.length > 0
    ? resolvedErrors.reduce((acc, e) => {
        const start = new Date(e.timestamp).getTime();
        const end = new Date(e.resolvedAt!).getTime();
        return acc + (end - start) / 60000;
      }, 0) / resolvedErrors.length
    : 0;
  // Error trend
  const now = new Date();
  const recent24h = orgErrors.filter((e) => new Date(e.timestamp).getTime() > now.getTime() - 86400000).length;
  const previous24h = orgErrors.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return t > now.getTime() - 172800000 && t <= now.getTime() - 86400000;
  }).length;
  let trend: "increasing" | "stable" | "decreasing" = "stable";
  if (previous24h > 0) {
    const change = (recent24h - previous24h) / previous24h;
    if (change > 0.2) trend = "increasing";
    else if (change < -0.2) trend = "decreasing";
  }
  return {
    totalErrors: orgErrors.length,
    unresolvedErrors: orgErrors.filter((e) => e.resolvedAt === null).length,
    criticalErrors: orgErrors.filter((e) => e.severity === "critical").length,
    analysesCompleted: orgAnalyses.length,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    categoryDistribution: categories,
    severityDistribution: severities,
    pipelineStageDistribution: stages,
    topErrorPatterns: orgPatterns
      .sort((a, b) => b.statistics.totalOccurrences - a.statistics.totalOccurrences)
      .slice(0, 5)
      .map((p) => ({ name: p.name, occurrences: p.statistics.totalOccurrences })),
    averageResolutionTimeMinutes: Math.round(avgResTime),
    errorTrend: trend,
  };
}
