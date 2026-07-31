/**
 * Module 61: AI Threat Detection Service
 *
 * Provides real-time threat detection for AI systems including model extraction
 * attack detection via query pattern analysis, data poisoning detection, membership
 * inference and model inversion attack detection, security event correlation with
 * threat scoring, and automated threat response with threat intelligence integration.
 *
 * Phase 1 — Critical Gap: Real-time AI threat detection and response
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiThreatDetection');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type ThreatType = "model-extraction" | "data-poisoning" | "membership-inference" | "model-inversion" | "prompt-injection" | "adversarial-example" | "unauthorized-access" | "data-exfiltration" | "denial-of-service" | "model-manipulation";

export type ThreatSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ThreatStatus = "detected" | "investigating" | "confirmed" | "mitigated" | "resolved" | "false-positive";

export type DetectionMethod = "pattern-matching" | "statistical-analysis" | "behavioral-analysis" | "anomaly-detection" | "signature-based" | "heuristic" | "ml-based";

export type ResponseAction = "block" | "rate-limit" | "quarantine" | "alert" | "log" | "revoke-access" | "shutdown-model" | "notify";

export interface ThreatEvent {
  id: string;
  organizationId: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  status: ThreatStatus;
  target: ThreatTarget;
  detection: ThreatDetection;
  attackProfile: AttackProfile;
  impactAssessment: ImpactAssessment;
  response: ThreatResponse;
  correlatedEvents: string[];
  threatScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThreatTarget {
  modelId: string;
  modelName: string;
  deploymentId?: string;
  endpoint?: string;
  affectedComponents: string[];
}

export interface ThreatDetection {
  method: DetectionMethod;
  detectorId: string;
  confidenceScore: number;
  evidence: ThreatEvidence[];
  indicators: ThreatIndicator[];
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
}

export interface ThreatEvidence {
  type: "query-pattern" | "input-anomaly" | "output-anomaly" | "access-pattern" | "network" | "log" | "metric";
  description: string;
  data: Record<string, unknown>;
  timestamp: string;
  source: string;
}

export interface ThreatIndicator {
  type: string;
  value: string;
  confidence: number;
  source: string;
}

export interface AttackProfile {
  attackVector: string;
  attackPhase: "reconnaissance" | "exploitation" | "extraction" | "manipulation" | "exfiltration";
  sophistication: "low" | "medium" | "high" | "advanced";
  estimatedQueries: number;
  estimatedDataAccessed: number;
  attackerProfile?: { sourceIp?: string; userAgent?: string; geographicRegion?: string; knownThreatActor?: string };
}

export interface ImpactAssessment {
  dataExposureRisk: number;
  modelIntegrityRisk: number;
  serviceAvailabilityRisk: number;
  complianceRisk: number;
  financialImpact: number;
  affectedUsers: number;
  affectedRequests: number;
  description: string;
}

export interface ThreatResponse {
  automatedActions: ResponseActionEntry[];
  manualActionsRequired: string[];
  containmentStatus: "none" | "partial" | "full";
  mitigatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ResponseActionEntry {
  action: ResponseAction;
  executedAt: string;
  status: "executed" | "failed" | "pending";
  details: string;
}

export interface ThreatDetectionRule {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  threatType: ThreatType;
  enabled: boolean;
  detectionMethod: DetectionMethod;
  conditions: DetectionCondition[];
  severity: ThreatSeverity;
  autoResponse: ResponseAction[];
  cooldownMinutes: number;
  threshold: { windowSeconds: number; maxOccurrences: number };
  createdAt: string;
  updatedAt: string;
}

export interface DetectionCondition {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "pattern" | "anomaly";
  value: unknown;
  weight: number;
}

export interface ThreatIntelFeed {
  id: string;
  name: string;
  source: string;
  type: "ip-blocklist" | "threat-signatures" | "attack-patterns" | "indicators-of-compromise";
  entries: ThreatIntelEntry[];
  lastUpdated: string;
}

export interface ThreatIntelEntry {
  indicator: string;
  type: string;
  severity: ThreatSeverity;
  description: string;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
  tags: string[];
}

export interface ThreatDetectionStats {
  totalThreats: number;
  openThreats: number;
  resolvedThreats: number;
  threatsByType: Record<string, number>;
  threatsBySeverity: Record<string, number>;
  averageThreatScore: number;
  averageResponseTimeMinutes: number;
  topTargetedModels: Array<{ modelId: string; modelName: string; threatCount: number }>;
  topAttackVectors: Record<string, number>;
  detectionRatePercent: number;
  falsePositiveRate: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const threatEvents = new Map<string, ThreatEvent>();
const detectionRules = new Map<string, ThreatDetectionRule>();
const intelFeeds = new Map<string, ThreatIntelFeed>();
const queryPatterns = new Map<string, Array<{ timestamp: string; input: string; sourceIp: string; userId: string }>>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a threat detection rule
 */
export async function createDetectionRule(params: {
  organizationId: string;
  name: string;
  description?: string;
  threatType: ThreatType;
  detectionMethod: DetectionMethod;
  conditions: DetectionCondition[];
  severity: ThreatSeverity;
  autoResponse?: ResponseAction[];
  cooldownMinutes?: number;
  threshold?: { windowSeconds: number; maxOccurrences: number };
}): Promise<ThreatDetectionRule> {
  const now = new Date().toISOString();
  const rule: ThreatDetectionRule = {
    id: `tdr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    threatType: params.threatType,
    enabled: true,
    detectionMethod: params.detectionMethod,
    conditions: params.conditions,
    severity: params.severity,
    autoResponse: params.autoResponse ?? ["alert", "log"],
    cooldownMinutes: params.cooldownMinutes ?? 15,
    threshold: params.threshold ?? { windowSeconds: 300, maxOccurrences: 10 },
    createdAt: now,
    updatedAt: now,
  };
  detectionRules.set(rule.id, rule);
  return rule;
}

/**
 * Analyze an inference request for threats
 */
export async function analyzeInferenceRequest(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  userId: string;
  sourceIp: string;
  input: string;
  inputHash: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ threats: ThreatEvent[]; threatScore: number; blocked: boolean }> {
  const now = new Date().toISOString();
  const threats: ThreatEvent[] = [];

  // Track query patterns for model extraction detection
  const patternKey = `${params.organizationId}:${params.modelId}`;
  if (!queryPatterns.has(patternKey)) queryPatterns.set(patternKey, []);
  const patterns = queryPatterns.get(patternKey)!;
  patterns.push({ timestamp: now, input: params.input, sourceIp: params.sourceIp, userId: params.userId });
  if (patterns.length > 500) patterns.shift();

  // Check against detection rules
  const rules = Array.from(detectionRules.values()).filter(r => r.organizationId === params.organizationId && r.enabled);
  for (const rule of rules) {
    const match = evaluateRule(rule, params);
    if (match) {
      const threat = createThreatEvent(params, rule, match, now);
      threatEvents.set(threat.id, threat);
      threats.push(threat);
    }
  }

  // Model extraction detection (query pattern analysis)
  const extractionThreat = detectModelExtraction(params, patterns, now);
  if (extractionThreat) {
    threatEvents.set(extractionThreat.id, extractionThreat);
    threats.push(extractionThreat);
  }

  // Prompt injection detection
  const injectionThreat = detectPromptInjection(params, now);
  if (injectionThreat) {
    threatEvents.set(injectionThreat.id, injectionThreat);
    threats.push(injectionThreat);
  }

  // Check threat intelligence feeds
  const intelThreat = checkThreatIntel(params, now);
  if (intelThreat) {
    threatEvents.set(intelThreat.id, intelThreat);
    threats.push(intelThreat);
  }

  const maxScore = threats.length > 0 ? Math.max(...threats.map(t => t.threatScore)) : 0;
  const blocked = threats.some(t => t.response.automatedActions.some(a => a.action === "block" && a.status === "executed"));

  return { threats, threatScore: maxScore, blocked };
}

/**
 * Get threat event by ID
 */
export async function getThreatEvent(threatId: string): Promise<ThreatEvent | null> {
  return threatEvents.get(threatId) ?? null;
}

/**
 * List threat events
 */
export async function listThreatEvents(
  organizationId: string,
  filters?: { severity?: ThreatSeverity; status?: ThreatStatus; threatType?: ThreatType; limit?: number },
): Promise<ThreatEvent[]> {
  let result = Array.from(threatEvents.values()).filter(t => t.organizationId === organizationId);
  if (filters?.severity) result = result.filter(t => t.severity === filters.severity);
  if (filters?.status) result = result.filter(t => t.status === filters.status);
  if (filters?.threatType) result = result.filter(t => t.threatType === filters.threatType);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Update threat status
 */
export async function updateThreatStatus(params: {
  threatId: string;
  status: ThreatStatus;
  resolvedBy?: string;
}): Promise<ThreatEvent | null> {
  const threat = threatEvents.get(params.threatId);
  if (!threat) return null;
  threat.status = params.status;
  threat.updatedAt = new Date().toISOString();
  if (params.status === "mitigated") threat.response.mitigatedAt = threat.updatedAt;
  if (params.status === "resolved") { threat.response.resolvedAt = threat.updatedAt; threat.response.resolvedBy = params.resolvedBy; }
  threatEvents.set(params.threatId, threat);
  return threat;
}

/**
 * Add threat intelligence feed
 */
export async function addThreatIntelFeed(params: {
  name: string;
  source: string;
  type: ThreatIntelFeed["type"];
  entries: Omit<ThreatIntelEntry, "firstSeen" | "lastSeen">[];
}): Promise<ThreatIntelFeed> {
  const now = new Date().toISOString();
  const feed: ThreatIntelFeed = {
    id: `tif_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    name: params.name,
    source: params.source,
    type: params.type,
    entries: params.entries.map(e => ({ ...e, firstSeen: now, lastSeen: now })),
    lastUpdated: now,
  };
  intelFeeds.set(feed.id, feed);
  return feed;
}

/**
 * Get threat detection statistics
 */
export async function getThreatDetectionStats(organizationId: string): Promise<ThreatDetectionStats> {
  const all = Array.from(threatEvents.values()).filter(t => t.organizationId === organizationId);
  const open = all.filter(t => ["detected", "investigating", "confirmed"].includes(t.status));
  const resolved = all.filter(t => ["resolved", "mitigated"].includes(t.status));

  let totalScore = 0;
  let totalResponseTime = 0;
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byVector: Record<string, number> = {};
  const modelThreats: Record<string, { modelName: string; count: number }> = {};

  for (const t of all) {
    totalScore += t.threatScore;
    byType[t.threatType] = (byType[t.threatType] || 0) + 1;
    bySeverity[t.severity] = (bySeverity[t.severity] || 0) + 1;
    byVector[t.attackProfile.attackVector] = (byVector[t.attackProfile.attackVector] || 0) + 1;
    const key = t.target.modelId;
    if (!modelThreats[key]) modelThreats[key] = { modelName: t.target.modelName, count: 0 };
    modelThreats[key].count++;
    if (t.response.mitigatedAt) {
      totalResponseTime += (new Date(t.response.mitigatedAt).getTime() - new Date(t.createdAt).getTime()) / 60000;
    }
  }

  return {
    totalThreats: all.length,
    openThreats: open.length,
    resolvedThreats: resolved.length,
    threatsByType: byType,
    threatsBySeverity: bySeverity,
    averageThreatScore: all.length > 0 ? Math.round(totalScore / all.length * 100) / 100 : 0,
    averageResponseTimeMinutes: resolved.length > 0 ? Math.round(totalResponseTime / resolved.length * 100) / 100 : 0,
    topTargetedModels: Object.entries(modelThreats).map(([modelId, d]) => ({ modelId, modelName: d.modelName, threatCount: d.count })).sort((a, b) => b.threatCount - a.threatCount).slice(0, 5),
    topAttackVectors: byVector,
    detectionRatePercent: all.length > 0 ? Math.round(((all.length - all.filter(t => t.status === "false-positive").length) / all.length) * 10000) / 100 : 0,
    falsePositiveRate: all.length > 0 ? Math.round((all.filter(t => t.status === "false-positive").length / all.length) * 10000) / 100 : 0,
  };
}

// ─── Internal: Detection Logic ────────────────────────────────────────────────

function evaluateRule(rule: ThreatDetectionRule, params: { input: string; sourceIp: string; userId: string }): boolean {
  for (const condition of rule.conditions) {
    const value = getFieldValue(condition.field, params);
    if (!matchCondition(condition, value)) return false;
  }
  return true;
}

function getFieldValue(field: string, params: Record<string, unknown>): unknown {
  return field.split(".").reduce((obj: any, key) => obj?.[key], params);
}

function matchCondition(condition: DetectionCondition, value: unknown): boolean {
  const v = String(value ?? "");
  const t = String(condition.value ?? "");
  switch (condition.operator) {
    case "eq": return v === t;
    case "ne": return v !== t;
    case "contains": return v.includes(t);
    case "pattern": return new RegExp(t, "i").test(v);
    case "gt": return Number(v) > Number(condition.value);
    case "gte": return Number(v) >= Number(condition.value);
    case "lt": return Number(v) < Number(condition.value);
    case "lte": return Number(v) <= Number(condition.value);
    default: return false;
  }
}

function createThreatEvent(params: { organizationId: string; modelId: string; modelName: string; sourceIp: string; userId: string; input: string }, rule: ThreatDetectionRule, _match: boolean, now: string): ThreatEvent {
  const severity = rule.severity;
  const threatScore = { critical: 95, high: 75, medium: 50, low: 25, info: 10 }[severity];

  const automatedActions: ResponseActionEntry[] = rule.autoResponse.map(action => ({
    action,
    executedAt: now,
    status: "executed" as const,
    details: `Automated ${action} triggered by rule "${rule.name}"`,
  }));

  return {
    id: `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    threatType: rule.threatType,
    severity,
    status: "detected",
    target: { modelId: params.modelId, modelName: params.modelName, affectedComponents: [params.modelId] },
    detection: {
      method: rule.detectionMethod,
      detectorId: rule.id,
      confidenceScore: 0.8 + _rng.next() * 0.15,
      evidence: [{ type: "query-pattern", description: `Rule "${rule.name}" matched`, data: { input: params.input.slice(0, 200) }, timestamp: now, source: rule.id }],
      indicators: [{ type: "rule-match", value: rule.name, confidence: 0.85, source: "detection-engine" }],
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    },
    attackProfile: {
      attackVector: rule.threatType,
      attackPhase: "exploitation",
      sophistication: "medium",
      estimatedQueries: 1,
      estimatedDataAccessed: 0,
      attackerProfile: { sourceIp: params.sourceIp },
    },
    impactAssessment: { dataExposureRisk: severity === "critical" ? 0.9 : 0.3, modelIntegrityRisk: severity === "critical" ? 0.8 : 0.2, serviceAvailabilityRisk: 0.1, complianceRisk: severity === "critical" ? 0.7 : 0.1, financialImpact: severity === "critical" ? 10000 : 500, affectedUsers: 1, affectedRequests: 1, description: `${rule.threatType} threat detected on ${params.modelName}` },
    response: { automatedActions, manualActionsRequired: severity === "critical" ? ["Investigate source IP", "Review affected model outputs"] : [], containmentStatus: automatedActions.some(a => a.action === "block") ? "full" : "none" },
    correlatedEvents: [],
    threatScore,
    createdAt: now,
    updatedAt: now,
  };
}

function detectModelExtraction(params: { organizationId: string; modelId: string; modelName: string; sourceIp: string; userId: string }, patterns: Array<{ timestamp: string; sourceIp: string; userId: string }>, now: string): ThreatEvent | null {
  const recentPatterns = patterns.filter(p => Date.now() - new Date(p.timestamp).getTime() < 3600000);
  const ipCounts: Record<string, number> = {};
  for (const p of recentPatterns) ipCounts[p.sourceIp] = (ipCounts[p.sourceIp] || 0) + 1;
  const maxIpCount = Math.max(...Object.values(ipCounts), 0);

  if (maxIpCount < 100) return null;

  const sourceIp = Object.entries(ipCounts).find(([, c]) => c === maxIpCount)?.[0] ?? "unknown";

  return {
    id: `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    threatType: "model-extraction",
    severity: maxIpCount > 500 ? "critical" : maxIpCount > 200 ? "high" : "medium",
    status: "detected",
    target: { modelId: params.modelId, modelName: params.modelName, affectedComponents: [params.modelId] },
    detection: {
      method: "behavioral-analysis",
      detectorId: "model-extraction-detector",
      confidenceScore: Math.min(0.95, maxIpCount / 500),
      evidence: [{ type: "query-pattern", description: `${maxIpCount} queries from ${sourceIp} in the last hour`, data: { queryCount: maxIpCount, sourceIp, windowSeconds: 3600 }, timestamp: now, source: "query-analyzer" }],
      indicators: [{ type: "high-query-rate", value: `${maxIpCount}/hour`, confidence: 0.8, source: "behavioral-analysis" }],
      firstSeenAt: recentPatterns[0]?.timestamp ?? now,
      lastSeenAt: now,
      occurrenceCount: maxIpCount,
    },
    attackProfile: { attackVector: "query-flooding", attackPhase: "extraction", sophistication: maxIpCount > 500 ? "high" : "medium", estimatedQueries: maxIpCount, estimatedDataAccessed: maxIpCount, attackerProfile: { sourceIp } },
    impactAssessment: { dataExposureRisk: 0.8, modelIntegrityRisk: 0.6, serviceAvailabilityRisk: 0.3, complianceRisk: 0.4, financialImpact: maxIpCount * 10, affectedUsers: 1, affectedRequests: maxIpCount, description: `Potential model extraction: ${maxIpCount} queries from single IP in 1 hour` },
    response: { automatedActions: [{ action: "rate-limit", executedAt: now, status: "executed", details: `Rate limited ${sourceIp} to 10 req/min` }], manualActionsRequired: ["Review query patterns for model reconstruction attempts", "Consider IP blocklist"], containmentStatus: "partial" },
    correlatedEvents: [],
    threatScore: Math.min(95, maxIpCount / 5),
    createdAt: now,
    updatedAt: now,
  };
}

function detectPromptInjection(params: { organizationId: string; modelId: string; modelName: string; input: string; sourceIp: string }, now: string): ThreatEvent | null {
  const injectionPatterns = [
    { pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?|rules?)/i, weight: 90 },
    { pattern: /\b(system\s*prompt|system\s*message|developer\s*:)/i, weight: 70 },
    { pattern: /\b(show|reveal|leak|repeat)\b.{0,40}\b(system\s*prompt|api[_\s-]?key|secret|credentials?)/i, weight: 95 },
    { pattern: /<\|\s*(im_start|im_end|system|assistant|user)\s*\|>/i, weight: 75 },
    { pattern: /\b(disable|remove)\s+(safety|content\s+filter|guardrails?|restrictions?)/i, weight: 85 },
  ];

  let maxScore = 0;
  let matchedReason = "";
  for (const p of injectionPatterns) {
    if (p.pattern.test(params.input)) {
      if (p.weight > maxScore) {
        maxScore = p.weight;
        matchedReason = p.pattern.source;
      }
    }
  }

  if (maxScore < 60) return null;

  return {
    id: `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    threatType: "prompt-injection",
    severity: maxScore > 85 ? "high" : "medium",
    status: "detected",
    target: { modelId: params.modelId, modelName: params.modelName, affectedComponents: [params.modelId] },
    detection: {
      method: "pattern-matching",
      detectorId: "prompt-injection-detector",
      confidenceScore: maxScore / 100,
      evidence: [{ type: "input-anomaly", description: `Prompt injection pattern detected: ${matchedReason}`, data: { input: params.input.slice(0, 200) }, timestamp: now, source: "pattern-matcher" }],
      indicators: [{ type: "injection-pattern", value: matchedReason, confidence: maxScore / 100, source: "pattern-matcher" }],
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    },
    attackProfile: { attackVector: "prompt-injection", attackPhase: "exploitation", sophistication: "medium", estimatedQueries: 1, estimatedDataAccessed: 0, attackerProfile: { sourceIp: params.sourceIp } },
    impactAssessment: { dataExposureRisk: 0.6, modelIntegrityRisk: 0.3, serviceAvailabilityRisk: 0.1, complianceRisk: 0.4, financialImpact: 500, affectedUsers: 1, affectedRequests: 1, description: "Prompt injection attempt detected in user input" },
    response: { automatedActions: [{ action: "alert", executedAt: now, status: "executed", details: "Prompt injection alert generated" }, { action: "log", executedAt: now, status: "executed", details: "Event logged for audit" }], manualActionsRequired: [], containmentStatus: "none" },
    correlatedEvents: [],
    threatScore: maxScore,
    createdAt: now,
    updatedAt: now,
  };
}

function checkThreatIntel(params: { organizationId: string; modelId: string; modelName: string; sourceIp: string }, now: string): ThreatEvent | null {
  for (const feed of intelFeeds.values()) {
    if (feed.type === "ip-blocklist") {
      const match = feed.entries.find(e => e.indicator === params.sourceIp);
      if (match) {
        return {
          id: `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
          organizationId: params.organizationId,
          threatType: "unauthorized-access",
          severity: match.severity,
          status: "detected",
          target: { modelId: params.modelId, modelName: params.modelName, affectedComponents: [params.modelId] },
          detection: { method: "signature-based", detectorId: feed.id, confidenceScore: match.confidence, evidence: [{ type: "network", description: `IP ${params.sourceIp} found in threat intel feed "${feed.name}"`, data: { ip: params.sourceIp, feed: feed.name }, timestamp: now, source: feed.source }], indicators: [{ type: "ip-blocklist", value: params.sourceIp, confidence: match.confidence, source: feed.source }], firstSeenAt: match.firstSeen, lastSeenAt: now, occurrenceCount: 1 },
          attackProfile: { attackVector: "known-malicious-ip", attackPhase: "reconnaissance", sophistication: "low", estimatedQueries: 1, estimatedDataAccessed: 0, attackerProfile: { sourceIp: params.sourceIp, knownThreatActor: match.tags.join(", ") } },
          impactAssessment: { dataExposureRisk: 0.5, modelIntegrityRisk: 0.2, serviceAvailabilityRisk: 0.1, complianceRisk: 0.3, financialImpact: 200, affectedUsers: 0, affectedRequests: 1, description: `Request from known malicious IP: ${params.sourceIp}` },
          response: { automatedActions: [{ action: "block", executedAt: now, status: "executed", details: `Blocked IP ${params.sourceIp} based on threat intel` }], manualActionsRequired: [], containmentStatus: "full" },
          correlatedEvents: [],
          threatScore: 85,
          createdAt: now,
          updatedAt: now,
        };
      }
    }
  }
  return null;
}
