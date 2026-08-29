/**
 * AI Trust, Explainability & Verification singleton (Slice 290).
 */
import { randomUUID } from "node:crypto";
import type {
  TrustScore, Evidence, ExplainabilityReport, AlternativeViewpoint,
  UncertaintySignal, ComplianceCheck, AiReviewStatus, VerificationStatus,
  SourceQuality,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";

const KEYS = { scores: "ae:trust:scores", queue: "ae:trust:queue", reports: "ae:trust:reports" };

function parseScore(raw: string): TrustScore { return JSON.parse(raw); }

type LoggerT = any;
export const TrustExplainabilityService = {
  logger: null as LoggerT | null,
  init(logger: LoggerT) { this.logger = logger; },

  async listReports(): Promise<Array<{ id: string; responseId: string; modelId: string; reasoningSummary: string; createdAt: string }>> {
    const raw = await redis.zrange(KEYS.reports, 0, -1, "REV");
    return raw.map((s) => JSON.parse(s)).slice(0, 50);
  },
  async createReport(r: {
    responseId: string; modelId: string; reasoningSummary: string; dataFreshnessAt?: string;
    tokenUsage?: { input: number; output: number }; processingLatencyMs?: number;
    steps?: Array<{ step: number; description: string; tool?: string; input?: string; output?: string }>;
    guardrailsTriggered?: string[];
  }) {
    const id = "rep-" + randomUUID().slice(0, 8);
    const report = { id, ...r, createdAt: new Date().toISOString() };
    await redis.zadd(KEYS.reports, Date.now(), JSON.stringify(report));
    return report;
  },

  async listScores(filter?: { humanReview?: string; verification?: VerificationStatus }): Promise<TrustScore[]> {
    const raw = await redis.zrange(KEYS.scores, 0, -1, "REV");
    let scores = raw.map(parseScore);
    if (filter?.humanReview === "queued") {
      const q = new Set(await redis.zrange(KEYS.queue, 0, -1));
      scores = scores.filter((s) => q.has(s.id));
    }
    if (filter?.verification) scores = scores.filter((s) => s.verificationStatus === filter!.verification);
    return scores.slice(0, 100);
  },
  async getScore(id: string): Promise<TrustScore | null> {
    const all = await this.listScores();
    return all.find((s) => s.id === id) ?? null;
  },

  async scoreResponse(input: {
    responseId: string; overallConfidence?: number; verification?: VerificationStatus; verifiedBy?: string;
    evidence?: Omit<Evidence, "id">[]; report?: ExplainabilityReport;
    alternatives?: Omit<AlternativeViewpoint, "id">[]; uncertainty?: UncertaintySignal[]; compliance?: ComplianceCheck[];
  }): Promise<TrustScore> {
    const evidenceArr: Evidence[] = (input.evidence ?? []).map((e) => ({
      id: "ev-" + randomUUID().slice(0, 8), source: (e as any).source ?? (e as any).sourceLabel ?? "unknown",
      sourceType: e.sourceType ?? "document",
      sourceQuality: e.sourceQuality ?? "unknown",
      dataFreshness: e.dataFreshness ?? "unknown",
      excerpt: e.excerpt ?? (e as any).snippet,
      url: e.url ?? (e as any).sourceUri,
      lastVerifiedAt: e.lastVerifiedAt ?? (e as any).freshnessDays ? new Date().toISOString() : undefined,
      supportsClaim: e.supportsClaim ?? ((e as any).supports === "supports"),
    }));
    const alternatives: AlternativeViewpoint[] = (input.alternatives ?? []).map((a) => ({
      id: "alt-" + randomUUID().slice(0, 8), perspective: a.perspective ?? (a as any).label ?? "alternative",
      summary: a.summary, confidence: a.confidence ?? (a as any).plausibility ?? 0.5,
      supportingSources: a.supportingSources ?? (a as any).evidenceRefs ?? [],
    }));
    const compliance: ComplianceCheck[] = (input.compliance ?? []).map((c: any) => ({
      policyId: c.policyId ?? c.ruleId ?? c.policy ?? "unknown",
      policyName: c.policyName ?? c.policy ?? "Policy",
      passed: c.passed ?? (c.status === "pass" || c.status === "warn"),
      violations: c.violations ?? (c.detail ? [c.detail] : []),
      riskLevel: c.riskLevel ?? (c.status === "fail" ? "high" : c.status === "warn" ? "medium" : "none"),
    }));
    const uncertainty: UncertaintySignal[] = (input.uncertainty ?? []).map((u: any) => ({
      type: u.type ?? u.kind ?? "low-evidence",
      severity: (u.severity === "critical" ? "high" : u.severity === "warn" ? "medium" : u.severity === "info" ? "low" : (u.severity ?? "low")),
      description: u.description ?? u.detail ?? "",
    }));
    const hiQ = new Set(["high", "gold", "peer-reviewed", "trusted-publisher"]);
    const highQ = evidenceArr.filter((e) => hiQ.has(e.sourceQuality)).length;
    const corrPct = evidenceArr.length ? Math.round((evidenceArr.filter((e) => e.supportsClaim).length / evidenceArr.length) * 100) : 0;
    const freshPct = evidenceArr.length === 0 ? 0.5 : evidenceArr.filter((e) => e.dataFreshness === "fresh" || e.dataFreshness === "recent").length / evidenceArr.length;
    const qualityAvg = evidenceArr.length === 0 ? 0.4 : evidenceArr.reduce((s, e) => {
      const m: Record<string, number> = { high: 1, gold: 1, "peer-reviewed": 0.95, "trusted-publisher": 0.85, medium: 0.6, low: 0.3, "user-content": 0.4, "llm-synthetic": 0.35, unknown: 0.2 };
      return s + (m[e.sourceQuality] ?? 0.4);
    }, 0) / evidenceArr.length;
    const baseConf = input.overallConfidence ?? Math.max(0.35, Math.min(0.98, 0.5 + highQ * 0.08 + qualityAvg * 0.3 - uncertainty.length * 0.05));
    const policyCompliant = compliance.every((c) => c.passed);
    const highUncertainty = uncertainty.some((u) => (u.severity as string) === "high" || (u.severity as string) === "critical");
    let verificationStatus: VerificationStatus = input.verification ?? "unverified";
    if (!input.verification) {
      if (corrPct >= 80 && highQ >= 2 && freshPct >= 0.7) verificationStatus = "verified";
      else if (corrPct >= 50) verificationStatus = "partially-verified";
      if (!policyCompliant) verificationStatus = "disputed";
    }
    let recommended: AiReviewStatus = "auto-published";
    if (baseConf < 0.6 || highUncertainty || evidenceArr.length === 0) recommended = "requires-human-review";
    else if (baseConf < 0.8 || corrPct < 70) recommended = "show-with-disclaimer";
    if (!policyCompliant) recommended = "blocked";
    const sev = (s: any) => (s === "high" || s === "critical") ? "high" : (s === "medium" || s === "warn") ? "medium" : "low";
    const uncLevel: TrustScore["uncertaintyLevel"] =
      uncertainty.some((u) => sev(u.severity) === "high") ? "high" :
      uncertainty.some((u) => sev(u.severity) === "medium") ? "medium" : "low";
    const score: TrustScore = {
      id: "tr-" + randomUUID().slice(0, 8),
      responseId: input.responseId, confidence: Number(baseConf.toFixed(2)),
      verificationStatus, evidenceCount: evidenceArr.length, corroboratingEvidencePct: corrPct,
      freshnessScore: Number(freshPct.toFixed(2)), sourceQualityAvg: Number(qualityAvg.toFixed(2)),
      policyCompliant, uncertaintyLevel: uncLevel, recommendedAction: recommended,
      explainabilityReport: input.report ?? {
        reasoningSummary: "Auto-generated explainability report",
        keySteps: ["Receive request", "Retrieve evidence", "Compose response"],
        dataSourcesUsed: evidenceArr.map((e) => e.source),
        assumptions: [], limitations: ["May not reflect real-time changes"],
        uncertaintySources: uncertainty.map((u) => u.description),
        modelVersion: "windels-core-v2",
      },
      evidence: evidenceArr, alternativeViewpoints: alternatives,
      uncertaintySignals: uncertainty, complianceChecks: compliance,
      createdAt: new Date().toISOString(),
    };
    await redis.zadd(KEYS.scores, Date.now(), JSON.stringify(score));
    if (recommended === "requires-human-review") await redis.zadd(KEYS.queue, Date.now(), score.id);
    return score;
  },

  async setHumanReview(id: string, state: string, by?: string): Promise<TrustScore | null> {
    const all = await redis.zrange(KEYS.scores, 0, -1);
    let updated: TrustScore | null = null;
    const multi = redis.multi();
    multi.del(KEYS.scores);
    for (const s of all) {
      const t: TrustScore = JSON.parse(s);
      if (t.id === id) {
        t.humanReviewedBy = by ?? "admin";
        t.humanReviewedAt = new Date().toISOString();
        if (state === "approved") { t.humanReviewOutcome = "approved"; t.verificationStatus = "verified"; }
        else if (state === "rejected") { t.humanReviewOutcome = "rejected"; t.verificationStatus = "disputed"; }
        else if (state === "in-review") { t.humanReviewOutcome = undefined; }
        else if (state === "not-needed") { /* noop */ }
        updated = t;
      }
      multi.zadd(KEYS.scores, Date.parse(t.createdAt), JSON.stringify(t));
    }
    await multi.exec();
    if (state !== "queued" && state !== "in-review") await redis.zrem(KEYS.queue, id);
    return updated;
  },

  async listEvidence(rid: string): Promise<Evidence[]> {
    // Find score whose report/responseId matches; return evidence
    const all = await this.listScores();
    for (const s of all) if (s.id === rid || s.responseId === rid) return s.evidence;
    return [];
  },
  async addEvidence(rid: string, e: any): Promise<Evidence> {
    const ev: Evidence = {
      id: "ev-" + randomUUID().slice(0, 8),
      source: e.source ?? e.sourceLabel ?? e.sourceId ?? "unknown",
      sourceType: e.sourceType ?? "document",
      sourceQuality: (e.sourceQuality as SourceQuality) ?? "medium",
      dataFreshness: e.dataFreshness ?? "recent",
      excerpt: e.excerpt ?? e.snippet,
      url: e.url,
      supportsClaim: e.supportsClaim ?? (e.supports === "supports"),
    };
    const all = await redis.zrange(KEYS.scores, 0, -1);
    const multi = redis.multi(); multi.del(KEYS.scores);
    for (const s of all) {
      const t: TrustScore = JSON.parse(s);
      if (t.id === rid || t.responseId === rid) t.evidence.push(ev);
      multi.zadd(KEYS.scores, Date.parse(t.createdAt), JSON.stringify(t));
    }
    await multi.exec();
    return ev;
  },
  async listViewpoints(rid: string): Promise<AlternativeViewpoint[]> {
    const all = await this.listScores();
    for (const s of all) if (s.id === rid || s.responseId === rid) return s.alternativeViewpoints;
    return [];
  },
  async addViewpoint(rid: string, v: any): Promise<AlternativeViewpoint> {
    const av: AlternativeViewpoint = {
      id: "alt-" + randomUUID().slice(0, 8),
      perspective: v.perspective ?? v.label ?? "alternative",
      summary: v.summary,
      confidence: v.confidence ?? v.plausibility ?? 0.5,
      supportingSources: v.supportingSources ?? v.evidenceRefs ?? [],
    };
    const all = await redis.zrange(KEYS.scores, 0, -1);
    const multi = redis.multi(); multi.del(KEYS.scores);
    for (const s of all) {
      const t: TrustScore = JSON.parse(s);
      if (t.id === rid || t.responseId === rid) t.alternativeViewpoints.push(av);
      multi.zadd(KEYS.scores, Date.parse(t.createdAt), JSON.stringify(t));
    }
    await multi.exec();
    return av;
  },
  async listUncertainty(rid: string): Promise<UncertaintySignal[]> {
    const all = await this.listScores();
    for (const s of all) if (s.id === rid || s.responseId === rid) return s.uncertaintySignals;
    return [];
  },
  async addUncertainty(rid: string, u: any): Promise<UncertaintySignal> {
    const sig: UncertaintySignal = {
      type: (u.type ?? u.kind ?? "low-evidence"),
      severity: (u.severity === "critical" ? "high" : u.severity === "warn" ? "medium" : u.severity === "info" ? "low" : (u.severity ?? "medium")),
      description: u.description ?? u.detail ?? "",
    };
    const all = await redis.zrange(KEYS.scores, 0, -1);
    const multi = redis.multi(); multi.del(KEYS.scores);
    for (const s of all) {
      const t: TrustScore = JSON.parse(s);
      if (t.id === rid || t.responseId === rid) t.uncertaintySignals.push(sig);
      multi.zadd(KEYS.scores, Date.parse(t.createdAt), JSON.stringify(t));
    }
    await multi.exec();
    return sig;
  },
  async listCompliance(rid: string): Promise<ComplianceCheck[]> {
    const all = await this.listScores();
    for (const s of all) if (s.id === rid || s.responseId === rid) return s.complianceChecks;
    return [];
  },
  async addCompliance(rid: string, c: any): Promise<ComplianceCheck> {
    const comp: ComplianceCheck = {
      policyId: c.policyId ?? c.ruleId ?? c.policy ?? "policy-" + randomUUID().slice(0, 6),
      policyName: c.policyName ?? c.policy ?? "Policy",
      passed: c.passed ?? (c.status === "pass" || c.status === "warn"),
      violations: c.violations ?? (c.detail ? [c.detail] : []),
      riskLevel: c.riskLevel ?? (c.status === "fail" ? "high" : c.status === "warn" ? "medium" : "none"),
    };
    const all = await redis.zrange(KEYS.scores, 0, -1);
    const multi = redis.multi(); multi.del(KEYS.scores);
    for (const s of all) {
      const t: TrustScore = JSON.parse(s);
      if (t.id === rid || t.responseId === rid) t.complianceChecks.push(comp);
      multi.zadd(KEYS.scores, Date.parse(t.createdAt), JSON.stringify(t));
    }
    await multi.exec();
    return comp;
  },

  async summary() {
    const scores = await this.listScores();
    const last24h = scores; // treat seeded as last-24h for MVP dashboards
    const verified = last24h.filter((s) => s.verificationStatus === "verified").length;
    const blocked = last24h.filter((s) => s.recommendedAction === "blocked").length;
    const failures = last24h.filter((s) => !s.policyCompliant).length;
    const avgConf = last24h.length ? Number((last24h.reduce((s, x) => s + x.confidence, 0) / last24h.length).toFixed(2)) : 0;
    const queue = await redis.zrange(KEYS.queue, 0, -1);
    return {
      trustScoredResponses24h: last24h.length,
      verifiedResponses24h: verified,
      humanReviewQueue: queue.length,
      blockedResponses24h: blocked,
      avgConfidence: avgConf,
      policyFailures24h: failures,
    };
  },
};
