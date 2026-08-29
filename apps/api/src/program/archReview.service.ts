/**
 * ArchReviewService - Slice 208: Architecture Review Agent.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ArchFinding, ArchHotspot, ArchReview, ArchReviewStatus } from "@windels/shared";

const LIST_KEY = "pgm:archReviews";
const DETAIL = (id: string) => `pgm:arch:${id}`;
const COUNTER = "pgm:arch:counter";

function iso() { return new Date().toISOString(); }
const ser = <T>(v: T) => JSON.stringify(v);

const HOTSPOTS: ArchHotspot[] = [
  { area: "Agent runtime event loop", churnScore: 78, debtHours: 36, recommendation: "Split long-running poller into worker threads" },
  { area: "Redis dual-client usage", churnScore: 54, debtHours: 16, recommendation: "Consolidate command client access in a repository helper" },
  { area: "Platform tab monolith", churnScore: 88, debtHours: 64, recommendation: "Split PlatformPage tabs into per-session components in features/" },
  { area: "Auth middleware chains", churnScore: 41, debtHours: 12, recommendation: "Compose ORG_ADMIN guard with higher-order wrapper" },
];

export const ArchReviewService = {
  async list(): Promise<ArchReview[]> {
    const ids = await redis.lrange(LIST_KEY, 0, -1);
    const out: ArchReview[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as ArchReview);
    }
    return out;
  },
  async get(id: string): Promise<ArchReview | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as ArchReview) : null;
  },
  async create(input: Partial<ArchReview>): Promise<ArchReview> {
    const n = await redis.incr(COUNTER);
    const id = randomUUID();
    const review: ArchReview = {
      id,
      title: input.title ?? `Architecture Review ${n}`,
      scope: input.scope ?? "platform",
      requestedBy: input.requestedBy ?? "system",
      status: (input.status as ArchReviewStatus) ?? "in_review",
      findings: (input.findings as ArchFinding[]) ?? [],
      adrsConsulted: input.adrsConsulted ?? ["ADR-001", "ADR-004", "ADR-012"],
      // Unscored until a review actually runs.
      createdAt: iso(),
    };
    await redis.set(DETAIL(id), ser(review));
    await redis.lpush(LIST_KEY, id);
    return review;
  },
  /**
   * Record the outcome of an architecture review.
   *
   * This previously manufactured the whole thing: five boilerplate findings
   * ("scalability posture reviewed") with severities assigned by array index,
   * and a random 70-95 aiScore — no analysis of any kind. Findings and score
   * must now come from whoever (or whatever) actually performed the review.
   */
  async runAiReview(
    id: string,
    result?: { findings: ArchFinding[]; aiScore?: number; status?: ArchReviewStatus },
  ): Promise<ArchReview | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (!result) return existing; // nothing measured: leave the review untouched
    existing.findings = result.findings.map((f) => ({ ...f, reviewId: id }));
    existing.aiScore = result.aiScore;
    existing.status = result.status ?? (result.findings.some((f) => f.severity === "critical" || f.severity === "high")
      ? "needs_changes"
      : "approved");
    await redis.set(DETAIL(id), ser(existing));
    return existing;
  },
  hotspots(): ArchHotspot[] { return HOTSPOTS; },
};
