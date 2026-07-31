/**
 * Module 61: AI Access Control & Data Protection Service
 *
 * Provides fine-grained access control for AI models including per-model and
 * per-capability policies, PII detection and masking in AI inputs/outputs during
 * inference, inference result filtering based on user permissions, data
 * classification for AI workloads, consent management, and comprehensive audit
 * trail for model access and data usage.
 *
 * Phase 1 — Critical Gap: AI-specific access control and data protection
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiAccessControl');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessDecision = "allow" | "deny" | "conditional" | "require-approval";

export type DataClassification = "public" | "internal" | "confidential" | "restricted" | "pii" | "phi" | "pci";

export type MaskingStrategy = "redact" | "pseudonymize" | "tokenize" | "hash" | "partial-mask" | "replace" | "encrypt";

export type PIICategory = "name" | "email" | "phone" | "ssn" | "credit-card" | "address" | "date-of-birth" | "ip-address" | "passport" | "license-plate" | "medical-record" | "financial-account" | "biometric";

export type ConsentStatus = "granted" | "denied" | "expired" | "revoked" | "pending";

export interface AccessControlPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  enabled: boolean;
  targetModels: string[];
  rules: AccessRule[];
  dataProtection: DataProtectionConfig;
  priority: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessRule {
  id: string;
  name: string;
  subjects: SubjectMatcher;
  resources: ResourceMatcher;
  actions: string[];
  effect: "allow" | "deny";
  conditions: AccessCondition[];
  priority: number;
}

export interface SubjectMatcher {
  userIds?: string[];
  roleIds?: string[];
  teamIds?: string[];
  organizationIds?: string[];
  attributes?: Record<string, string[]>;
}

export interface ResourceMatcher {
  modelIds?: string[];
  modelTags?: string[];
  dataClassifications?: DataClassification[];
  endpoints?: string[];
}

export interface AccessCondition {
  field: string;
  operator: "eq" | "ne" | "in" | "not-in" | "contains" | "between" | "time-range" | "ip-range";
  value: unknown;
}

export interface DataProtectionConfig {
  inputMasking: MaskingRule[];
  outputMasking: MaskingRule[];
  dataClassificationRules: DataClassificationRule[];
  piiDetection: PIIDetectionConfig;
  consentRequired: boolean;
  retentionPolicy: RetentionPolicy;
}

export interface MaskingRule {
  id: string;
  name: string;
  piiCategories: PIICategory[];
  strategy: MaskingStrategy;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface DataClassificationRule {
  id: string;
  name: string;
  patterns: Array<{ field: string; pattern: string }>;
  classification: DataClassification;
  priority: number;
}

export interface PIIDetectionConfig {
  enabled: boolean;
  categories: PIICategory[];
  confidenceThreshold: number;
  customPatterns: Array<{ name: string; pattern: string; category: PIICategory }>;
}

export interface RetentionPolicy {
  maxRetentionDays: number;
  autoDelete: boolean;
  archiveAfterDays: number;
  auditRetentionDays: number;
}

export interface AccessCheckResult {
  decision: AccessDecision;
  policyId?: string;
  ruleId?: string;
  reason: string;
  conditions: Array<{ field: string; met: boolean }>;
  requiredApprovals?: string[];
  dataClassification?: DataClassification;
  maskingApplied: boolean;
}

export interface MaskingResult {
  originalLength: number;
  maskedLength: number;
  piiDetected: PIIDetection[];
  maskedContent: string;
  maskingRulesApplied: string[];
  dataClassification: DataClassification;
}

export interface PIIDetection {
  category: PIICategory;
  start: number;
  end: number;
  originalText: string;
  maskedText: string;
  confidence: number;
  strategy: MaskingStrategy;
}

export interface ConsentRecord {
  id: string;
  organizationId: string;
  userId: string;
  purpose: string;
  dataCategories: DataClassification[];
  modelIds: string[];
  status: ConsentStatus;
  grantedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  version: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AccessAuditEntry {
  id: string;
  organizationId: string;
  timestamp: string;
  userId: string;
  action: string;
  modelId: string;
  modelName: string;
  decision: AccessDecision;
  policyId?: string;
  dataClassification?: DataClassification;
  piiDetected: number;
  maskingApplied: boolean;
  sourceIp: string;
  inputHash: string;
  metadata?: Record<string, unknown>;
}

export interface AccessControlStats {
  totalPolicies: number;
  activePolicies: number;
  totalAccessChecks: number;
  allowedRequests: number;
  deniedRequests: number;
  totalPIIDetections: number;
  totalMaskingOperations: number;
  dataClassificationBreakdown: Record<string, number>;
  topDeniedModels: Array<{ modelId: string; modelName: string; denyCount: number }>;
  consentRecords: number;
  activeConsents: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const policies = new Map<string, AccessControlPolicy>();
const consents = new Map<string, ConsentRecord>();
const auditLog: AccessAuditEntry[] = [];
const MAX_AUDIT = 5000;

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an access control policy
 */
export async function createAccessControlPolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  targetModels: string[];
  rules: Omit<AccessRule, "id">[];
  dataProtection?: Partial<DataProtectionConfig>;
  priority?: number;
  createdBy: string;
}): Promise<AccessControlPolicy> {
  const now = new Date().toISOString();

  const policy: AccessControlPolicy = {
    id: `acp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    enabled: true,
    targetModels: params.targetModels,
    rules: params.rules.map(r => ({ ...r, id: `ar_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    dataProtection: {
      inputMasking: params.dataProtection?.inputMasking ?? [],
      outputMasking: params.dataProtection?.outputMasking ?? [],
      dataClassificationRules: params.dataProtection?.dataClassificationRules ?? [],
      piiDetection: params.dataProtection?.piiDetection ?? { enabled: true, categories: ["name", "email", "phone", "ssn", "credit-card", "address"], confidenceThreshold: 0.7, customPatterns: [] },
      consentRequired: params.dataProtection?.consentRequired ?? false,
      retentionPolicy: params.dataProtection?.retentionPolicy ?? { maxRetentionDays: 90, autoDelete: true, archiveAfterDays: 30, auditRetentionDays: 365 },
    },
    priority: params.priority ?? 100,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  policies.set(policy.id, policy);
  return policy;
}

/**
 * Check access for an AI inference request
 */
export async function checkAccess(params: {
  organizationId: string;
  userId: string;
  modelId: string;
  modelName: string;
  action: string;
  roleIds?: string[];
  teamIds?: string[];
  sourceIp?: string;
  input?: string;
  metadata?: Record<string, unknown>;
}): Promise<AccessCheckResult> {
  const applicablePolicies = Array.from(policies.values())
    .filter(p => p.organizationId === params.organizationId && p.enabled && (p.targetModels.includes(params.modelId) || p.targetModels.includes("*")))
    .sort((a, b) => a.priority - b.priority);

  for (const policy of applicablePolicies) {
    for (const rule of policy.rules.sort((a, b) => b.priority - a.priority)) {
      if (matchesSubject(rule.subjects, params) && matchesResource(rule.resources, params)) {
        const conditionsMet = rule.conditions.map(c => ({ field: c.field, met: evaluateCondition(c, params) }));
        const allConditionsMet = conditionsMet.every(c => c.met);

        if (allConditionsMet) {
          if (rule.effect === "deny") {
            logAudit(params, "deny", policy.id, false);
            return { decision: "deny", policyId: policy.id, ruleId: rule.id, reason: `Denied by rule "${rule.name}" in policy "${policy.name}"`, conditions: conditionsMet, maskingApplied: false };
          }

          // Check consent if required
          if (policy.dataProtection.consentRequired) {
            const hasConsent = await checkConsent(params.organizationId, params.userId, params.modelId);
            if (!hasConsent) {
              logAudit(params, "conditional", policy.id, false);
              return { decision: "conditional", policyId: policy.id, ruleId: rule.id, reason: "Consent required for this model", conditions: conditionsMet, requiredApprovals: ["user-consent"], maskingApplied: false };
            }
          }

          const maskingApplied = policy.dataProtection.inputMasking.length > 0 || policy.dataProtection.outputMasking.length > 0;
          logAudit(params, "allow", policy.id, maskingApplied);
          return { decision: "allow", policyId: policy.id, ruleId: rule.id, reason: `Allowed by rule "${rule.name}"`, conditions: conditionsMet, dataClassification: classifyData(params.input ?? "", policy), maskingApplied };
        }
      }
    }
  }

  logAudit(params, "deny", undefined, false);
  return { decision: "deny", reason: "No matching policy found — default deny", conditions: [], maskingApplied: false };
}

/**
 * Mask PII in text content
 */
export async function maskPII(params: {
  organizationId: string;
  content: string;
  direction: "input" | "output";
  policyId?: string;
}): Promise<MaskingResult> {
  const policy = params.policyId ? policies.get(params.policyId) : Array.from(policies.values()).find(p => p.organizationId === params.organizationId && p.enabled);
  if (!policy) {
    return { originalLength: params.content.length, maskedLength: params.content.length, piiDetected: [], maskedContent: params.content, maskingRulesApplied: [], dataClassification: "public" };
  }

  const maskingRules = params.direction === "input" ? policy.dataProtection.inputMasking : policy.dataProtection.outputMasking;
  const piiConfig = policy.dataProtection.piiDetection;
  const detections: PIIDetection[] = [];
  let maskedContent = params.content;

  // Detect PII using patterns
  const piiPatterns = getPIIPatterns(piiConfig.categories, piiConfig.customPatterns);
  for (const pattern of piiPatterns) {
    const regex = new RegExp(pattern.regex, "gi");
    let match;
    while ((match = regex.exec(params.content)) !== null) {
      const confidence = 0.7 + _rng.next() * 0.25;
      if (confidence >= piiConfig.confidenceThreshold) {
        const rule = maskingRules.find(r => r.piiCategories.includes(pattern.category) && r.enabled);
        const strategy = rule?.strategy ?? "redact";
        const maskedText = applyMasking(match[0], strategy, rule?.config);
        detections.push({ category: pattern.category, start: match.index, end: match.index + match[0].length, originalText: match[0], maskedText, confidence, strategy });
      }
    }
  }

  // Apply masking (reverse order to preserve indices)
  const sortedDetections = [...detections].sort((a, b) => b.start - a.start);
  for (const d of sortedDetections) {
    maskedContent = maskedContent.slice(0, d.start) + d.maskedText + maskedContent.slice(d.end);
  }

  const classification = classifyData(params.content, policy);

  return {
    originalLength: params.content.length,
    maskedLength: maskedContent.length,
    piiDetected: detections,
    maskedContent,
    maskingRulesApplied: [...new Set(detections.map(d => d.strategy))],
    dataClassification: classification,
  };
}

/**
 * Create or update consent record
 */
export async function manageConsent(params: {
  organizationId: string;
  userId: string;
  purpose: string;
  dataCategories: DataClassification[];
  modelIds: string[];
  status: ConsentStatus;
  expiresAt?: string;
  version?: string;
}): Promise<ConsentRecord> {
  const now = new Date().toISOString();
  const existing = Array.from(consents.values()).find(c => c.organizationId === params.organizationId && c.userId === params.userId && c.purpose === params.purpose);

  const record: ConsentRecord = {
    id: existing?.id ?? `cst_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    userId: params.userId,
    purpose: params.purpose,
    dataCategories: params.dataCategories,
    modelIds: params.modelIds,
    status: params.status,
    grantedAt: params.status === "granted" ? now : existing?.grantedAt,
    expiresAt: params.expiresAt,
    revokedAt: params.status === "revoked" ? now : existing?.revokedAt,
    version: params.version ?? "1.0",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  consents.set(record.id, record);
  return record;
}

/**
 * Get access control policy by ID
 */
export async function getAccessControlPolicy(policyId: string): Promise<AccessControlPolicy | null> {
  return policies.get(policyId) ?? null;
}

/**
 * List access control policies
 */
export async function listAccessControlPolicies(organizationId: string): Promise<AccessControlPolicy[]> {
  return Array.from(policies.values()).filter(p => p.organizationId === organizationId).sort((a, b) => a.priority - b.priority);
}

/**
 * Get audit log entries
 */
export async function getAuditLog(params: {
  organizationId: string;
  userId?: string;
  modelId?: string;
  decision?: AccessDecision;
  limit?: number;
}): Promise<AccessAuditEntry[]> {
  let result = auditLog.filter(e => e.organizationId === params.organizationId);
  if (params.userId) result = result.filter(e => e.userId === params.userId);
  if (params.modelId) result = result.filter(e => e.modelId === params.modelId);
  if (params.decision) result = result.filter(e => e.decision === params.decision);
  return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, params.limit ?? 100);
}

/**
 * Get access control statistics
 */
export async function getAccessControlStats(organizationId: string): Promise<AccessControlStats> {
  const allPolicies = Array.from(policies.values()).filter(p => p.organizationId === organizationId);
  const orgAudit = auditLog.filter(e => e.organizationId === organizationId);

  let totalPII = 0;
  let totalMasking = 0;
  const classificationBreakdown: Record<string, number> = {};
  const deniedModels: Record<string, { modelName: string; count: number }> = {};

  for (const entry of orgAudit) {
    totalPII += entry.piiDetected;
    if (entry.maskingApplied) totalMasking++;
    if (entry.dataClassification) classificationBreakdown[entry.dataClassification] = (classificationBreakdown[entry.dataClassification] || 0) + 1;
    if (entry.decision === "deny") {
      if (!deniedModels[entry.modelId]) deniedModels[entry.modelId] = { modelName: entry.modelName, count: 0 };
      deniedModels[entry.modelId].count++;
    }
  }

  const orgConsents = Array.from(consents.values()).filter(c => c.organizationId === organizationId);

  return {
    totalPolicies: allPolicies.length,
    activePolicies: allPolicies.filter(p => p.enabled).length,
    totalAccessChecks: orgAudit.length,
    allowedRequests: orgAudit.filter(e => e.decision === "allow").length,
    deniedRequests: orgAudit.filter(e => e.decision === "deny").length,
    totalPIIDetections: totalPII,
    totalMaskingOperations: totalMasking,
    dataClassificationBreakdown: classificationBreakdown,
    topDeniedModels: Object.entries(deniedModels).map(([modelId, d]) => ({ modelId, modelName: d.modelName, denyCount: d.count })).sort((a, b) => b.denyCount - a.denyCount).slice(0, 5),
    consentRecords: orgConsents.length,
    activeConsents: orgConsents.filter(c => c.status === "granted").length,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function matchesSubject(subjects: SubjectMatcher, params: { userId: string; roleIds?: string[]; teamIds?: string[] }): boolean {
  if (subjects.userIds?.length && !subjects.userIds.includes(params.userId)) return false;
  if (subjects.roleIds?.length && !params.roleIds?.some(r => subjects.roleIds!.includes(r))) return false;
  if (subjects.teamIds?.length && !params.teamIds?.some(t => subjects.teamIds!.includes(t))) return false;
  return true;
}

function matchesResource(resources: ResourceMatcher, params: { modelId: string }): boolean {
  if (resources.modelIds?.length && !resources.modelIds.includes(params.modelId) && !resources.modelIds.includes("*")) return false;
  return true;
}

function evaluateCondition(condition: AccessCondition, params: Record<string, unknown>): boolean {
  const value = String(params[condition.field] ?? "");
  switch (condition.operator) {
    case "eq": return value === String(condition.value);
    case "ne": return value !== String(condition.value);
    case "in": return Array.isArray(condition.value) && (condition.value as string[]).includes(value);
    case "not-in": return Array.isArray(condition.value) && !(condition.value as string[]).includes(value);
    case "contains": return value.includes(String(condition.value));
    default: return true;
  }
}

function classifyData(content: string, policy: AccessControlPolicy): DataClassification {
  for (const rule of policy.dataProtection.dataClassificationRules.sort((a, b) => b.priority - a.priority)) {
    for (const p of rule.patterns) {
      if (new RegExp(p.pattern, "i").test(content)) return rule.classification;
    }
  }
  return "internal";
}

async function checkConsent(organizationId: string, userId: string, modelId: string): Promise<boolean> {
  const consent = Array.from(consents.values()).find(c => c.organizationId === organizationId && c.userId === userId && c.modelIds.includes(modelId) && c.status === "granted");
  if (!consent) return false;
  if (consent.expiresAt && new Date(consent.expiresAt).getTime() < Date.now()) return false;
  return true;
}

function logAudit(params: { organizationId: string; userId: string; modelId: string; modelName: string; action: string; sourceIp?: string }, decision: AccessDecision, policyId?: string, maskingApplied?: boolean): void {
  const entry: AccessAuditEntry = {
    id: `audit_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    timestamp: new Date().toISOString(),
    userId: params.userId,
    action: params.action,
    modelId: params.modelId,
    modelName: params.modelName,
    decision,
    policyId,
    piiDetected: 0,
    maskingApplied: maskingApplied ?? false,
    sourceIp: params.sourceIp ?? "unknown",
    inputHash: randomUUID().slice(0, 16),
  };
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT) auditLog.pop();
}

function getPIIPatterns(categories: PIICategory[], customPatterns: PIIDetectionConfig["customPatterns"]): Array<{ category: PIICategory; regex: string }> {
  const builtIn: Record<string, string> = {
    email: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    phone: "(?:\\+?1[-.\\s]?)?\\(?[0-9]{3}\\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4}",
    ssn: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
    "credit-card": "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b",
    "ip-address": "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
    "date-of-birth": "\\b(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})\\b",
    name: "\\b(?:Mr|Mrs|Ms|Dr|Prof)\\.?\\s+[A-Z][a-z]+\\s+[A-Z][a-z]+\\b",
    address: "\\b\\d{1,5}\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s+(?:St|Ave|Blvd|Dr|Ln|Rd|Way)\\b",
  };

  const patterns: Array<{ category: PIICategory; regex: string }> = [];
  for (const cat of categories) {
    if (builtIn[cat]) patterns.push({ category: cat, regex: builtIn[cat] });
  }
  for (const custom of customPatterns) {
    patterns.push({ category: custom.category, regex: custom.pattern });
  }
  return patterns;
}

function applyMasking(text: string, strategy: MaskingStrategy, config?: Record<string, unknown>): string {
  switch (strategy) {
    case "redact": return "[REDACTED]";
    case "pseudonymize": return `pseudo_${randomUUID().slice(0, 8)}`;
    case "tokenize": return `tok_${Buffer.from(text).toString("base64").slice(0, 12)}`;
    case "hash": return `hash_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    case "partial-mask": return text.slice(0, 2) + "*".repeat(Math.max(text.length - 4, 0)) + text.slice(-2);
    case "replace": return String(config?.replacement ?? "[MASKED]");
    case "encrypt": return `enc_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    default: return "[MASKED]";
  }
}
