/**
 * ReasoningService — Slice 174.
 *
 * Agents share structured reasoning artifacts (hypothesis, evidence, steps,
 * conclusion, confidence) tied by a chainId. Other agents can add
 * critiques with approve/revise/reject verdicts — forming a lightweight
 * peer-verification protocol.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  ReasoningArtifact, ReasoningEvidence, ReasoningStatus, EvidenceStrength,
} from "@windels/shared/agentComm";

const ARTIFACT_PREFIX = "agentComm:reasoning:";
const CHAIN_PREFIX = "agentComm:reasoning:chain:";
const INDEX_KEY = "agentComm:reasoning";

function aKey(id: string) { return ARTIFACT_PREFIX + id; }
function cKey(cid: string) { return CHAIN_PREFIX + cid; }
function now() { return new Date().toISOString(); }

export const ReasoningService = {
  async create(input: {
    authorAgentId: string;
    subject: string;
    hypothesis: string;
    chainId?: string;
    evidence?: Array<Omit<ReasoningEvidence, "id" | "retrievedAt">>;
    steps?: Array<Omit<ReasoningArtifact["steps"][number], "id">>;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }): Promise<ReasoningArtifact> {
    const id = randomUUID();
    const chainId = input.chainId ?? randomUUID();
    const artifact: ReasoningArtifact = {
      id, chainId,
      authorAgentId: input.authorAgentId,
      subject: input.subject,
      hypothesis: input.hypothesis,
      evidence: (input.evidence ?? []).map((e) => ({ ...e, id: randomUUID(), retrievedAt: now() })),
      steps: (input.steps ?? []).map((s) => ({ ...s, id: randomUUID() })),
      conclusion: undefined,
      confidence: input.confidence ?? 0.5,
      status: "proposed",
      critiques: [],
      createdAt: now(), updatedAt: now(),
      metadata: input.metadata ?? {},
    };
    try {
      const pipeline = redisCmd.multi();
      pipeline.set(aKey(id), JSON.stringify(artifact));
      pipeline.sadd(INDEX_KEY, id);
      pipeline.rpush(cKey(chainId), id);
      await pipeline.exec();
    } catch (e) { logger.warn("reasoning save failed", { error: (e as Error).message }); }
    return artifact;
  },

  async get(id: string): Promise<ReasoningArtifact | null> {
    try { const r = await redisCmd.get(aKey(id)); return r ? JSON.parse(r) as ReasoningArtifact : null; }
    catch { return null; }
  },

  async listChain(chainId: string): Promise<ReasoningArtifact[]> {
    try {
      const ids = await redisCmd.lrange(cKey(chainId), 0, -1);
      const out: ReasoningArtifact[] = [];
      for (const id of ids) { const a = await this.get(id); if (a) out.push(a); }
      return out;
    } catch { return []; }
  },

  async list(filter?: { status?: ReasoningStatus; authorAgentId?: string; limit?: number }): Promise<ReasoningArtifact[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(INDEX_KEY); } catch { return []; }
    const limit = filter?.limit ?? 50;
    const out: ReasoningArtifact[] = [];
    for (const id of ids) {
      const a = await this.get(id); if (!a) continue;
      if (filter?.status && a.status !== filter.status) continue;
      if (filter?.authorAgentId && a.authorAgentId !== filter.authorAgentId) continue;
      out.push(a);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addEvidence(id: string, ev: Omit<ReasoningEvidence, "id" | "retrievedAt">): Promise<ReasoningArtifact | null> {
    const a = await this.get(id); if (!a) return null;
    a.evidence.push({ ...ev, id: randomUUID(), retrievedAt: now() });
    a.updatedAt = now();
    try { await redisCmd.set(aKey(id), JSON.stringify(a)); } catch {}
    return a;
  },

  async addStep(id: string, step: Omit<ReasoningArtifact["steps"][number], "id">): Promise<ReasoningArtifact | null> {
    const a = await this.get(id); if (!a) return null;
    a.steps.push({ ...step, id: randomUUID() });
    a.updatedAt = now();
    try { await redisCmd.set(aKey(id), JSON.stringify(a)); } catch {}
    return a;
  },

  async conclude(id: string, conclusion: string, confidence?: number, status: ReasoningStatus = "reviewed"): Promise<ReasoningArtifact | null> {
    const a = await this.get(id); if (!a) return null;
    a.conclusion = conclusion;
    if (typeof confidence === "number") a.confidence = Math.max(0, Math.min(1, confidence));
    a.status = status;
    a.updatedAt = now();
    try { await redisCmd.set(aKey(id), JSON.stringify(a)); } catch {}
    return a;
  },

  async critique(id: string, reviewerAgentId: string, note: string, verdict: "approve" | "revise" | "reject"): Promise<ReasoningArtifact | null> {
    const a = await this.get(id); if (!a) return null;
    a.critiques.push({ id: randomUUID(), reviewerAgentId, note, verdict, createdAt: now() });
    // Auto-promote status based on votes
    const approvals = a.critiques.filter((c) => c.verdict === "approve").length;
    const rejects = a.critiques.filter((c) => c.verdict === "reject").length;
    if (rejects > 0) a.status = "rejected";
    else if (approvals >= 2) a.status = "verified";
    else a.status = "reviewed";
    a.updatedAt = now();
    try { await redisCmd.set(aKey(id), JSON.stringify(a)); } catch {}
    return a;
  },

  async count(): Promise<number> {
    try { return await redisCmd.scard(INDEX_KEY); } catch { return 0; }
  },
};
