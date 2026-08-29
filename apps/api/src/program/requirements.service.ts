/**
 * RequirementsService - Slice 207: Requirements Intelligence.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { FeedbackCluster, Requirement, RequirementIntel, ReqPriority, ReqStatus } from "@windels/shared";

const LIST_KEY = "pgm:requirements";
const DETAIL = (id: string) => `pgm:req:${id}`;
const COUNTER = "pgm:req:counter";

function iso() { return new Date().toISOString(); }
const ser = <T>(v: T) => JSON.stringify(v);

const SEED_FEEDBACK: FeedbackCluster[] = [
  { id: "fb-1", theme: "Faster onboarding", count: 42, sentiment: "negative", sampleQuote: "Setup took over an hour for my team." },
  { id: "fb-2", theme: "Mobile offline support", count: 28, sentiment: "neutral", sampleQuote: "Need offline editing for field reps." },
  { id: "fb-3", theme: "Better search across modules", count: 61, sentiment: "positive", sampleQuote: "Search is great but needs cross-workspace scope." },
  { id: "fb-4", theme: "SSO/SCIM enterprise provisioning", count: 19, sentiment: "negative", sampleQuote: "Enterprise deals blocked on SCIM." },
  { id: "fb-5", theme: "AI agent reliability", count: 35, sentiment: "neutral", sampleQuote: "Occasional hallucinations on long docs." },
];

const GAP_TEMPLATES = [
  "Missing acceptance criteria on several P1 stories",
  "Customer feedback theme not linked to any initiative",
  "Security review not scheduled for epic",
  "Design system coverage below 80% for this module",
];

export const RequirementsService = {
  async list(): Promise<Requirement[]> {
    const ids = await redis.zrange(LIST_KEY, 0, -1);
    const out: Requirement[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as Requirement);
    }
    return out;
  },
  async create(input: Partial<Requirement>): Promise<Requirement> {
    const n = await redis.incr(COUNTER);
    const id = randomUUID();
    const req: Requirement = {
      id,
      key: `REQ-${n}`,
      title: input.title ?? `Requirement ${n}`,
      description: input.description ?? "",
      priority: (input.priority as ReqPriority) ?? "should_have",
      status: (input.status as ReqStatus) ?? "captured",
      source: input.source ?? "internal",
      epic: input.epic,
      tags: input.tags ?? [],
      coverage: input.coverage ?? { hasTests: false, hasDesign: false, hasAcceptance: false, linkedStories: 0 },
      aiGaps: input.aiGaps ?? [],
      createdAt: iso(),
    };
    await redis.set(DETAIL(id), ser(req));
    await redis.zadd(LIST_KEY, n, id);
    return req;
  },
  async intel(): Promise<RequirementIntel> {
    const reqs = await this.list();
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const r of reqs) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
    }
    let coverage = 0;
    let n = 0;
    for (const r of reqs) {
      const s = r.coverage;
      const score = (s.hasTests ? 25 : 0) + (s.hasDesign ? 25 : 0) + (s.hasAcceptance ? 25 : 0) + Math.min(25, s.linkedStories * 10);
      coverage += score;
      n++;
    }
    const coverageScore = n ? Math.round(coverage / n) : 0;
    const topGaps = [...GAP_TEMPLATES];
    return {
      totalRequirements: reqs.length,
      byStatus,
      byPriority,
      coverageScore,
      feedbackClusters: SEED_FEEDBACK,
      topGaps,
    };
  },
};
