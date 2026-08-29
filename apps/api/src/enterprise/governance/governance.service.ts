/**
 * Enterprise Architecture Governance service (Slice 161).
 *
 * Maintains:
 *  - Architecture Decision Records (ADRs)
 *  - Architecture Standards registry (with categorised rules)
 *  - Review Requests (governance approval workflow)
 *
 * Storage is in-memory with Redis persistence (matches the pattern used by
 * metrics/regions/plugins elsewhere in the codebase) — durable enough for an MVP
 * governance registry and swappable for a DB model in a future enterprise
 * hardening slice.
 */
import { randomUUID } from "node:crypto";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  ArchitectureDecisionRecord,
  ArchitectureStandard,
  ReviewRequest,
  ADRStatus,
} from "@windels/shared/enterprise";

const KEYS = {
  adrs: "enterprise:governance:adrs",
  adrSeq: "enterprise:governance:adr:seq",
  standards: "enterprise:governance:standards",
  reviews: "enterprise:governance:reviews",
};

// ─── In-memory primary store ───────────────────────────────────────────────
const adrs = new Map<string, ArchitectureDecisionRecord>();
const standards = new Map<string, ArchitectureStandard>();
const reviews = new Map<string, ReviewRequest>();

// Seed the baseline architecture standards (12) that this codebase follows.
function seedStandards() {
  const seeds: ArchitectureStandard[] = [
    { id: stdId(), code: "API-001", category: "api", title: "Envelope format", description: "All REST responses use {ok, data, meta, error} envelope.", severity: "must", enforcement: "automated" },
    { id: stdId(), code: "API-002", category: "api", title: "Versioned paths", description: "API paths are prefixed with /api/v<N>; breaking changes require a new version.", severity: "must", enforcement: "automated" },
    { id: stdId(), code: "API-003", category: "api", title: "Validate input", description: "All endpoints validate body/query/params with zod via the validate() middleware.", severity: "must", enforcement: "automated" },
    { id: stdId(), code: "SEC-001", category: "security", title: "Auth on protected routes", description: "Every route under /api/v1 requires `authenticate` middleware unless explicitly public.", severity: "must", enforcement: "automated" },
    { id: stdId(), code: "SEC-002", category: "security", title: "CSRF double-submit", description: "State-changing cookie-session requests require XSRF-TOKEN header.", severity: "must", enforcement: "automated" },
    { id: stdId(), code: "SEC-003", category: "security", title: "Encryption at rest", description: "Credentials/secrets stored via AES-256-GCM envelope encryption.", severity: "must", enforcement: "manual" },
    { id: stdId(), code: "DATA-001", category: "data", title: "Migrations for schema changes", description: "Every Prisma schema change ships with a forward + rollback migration.", severity: "must", enforcement: "manual" },
    { id: stdId(), code: "DATA-002", category: "data", title: "No raw SQL without parameterisation", description: "Use Prisma client or parameterised queries ($queryRaw`sql with ${x}`) — never string concat.", severity: "must", enforcement: "manual" },
    { id: stdId(), code: "OBS-001", category: "infra", title: "Structured logs", description: "Use logger.level(message, meta); never console.log in services.", severity: "should", enforcement: "automated" },
    { id: stdId(), code: "OBS-002", category: "infra", title: "Health + metrics", description: "Every service exposes /health, /health/deep, /metrics (Prometheus).", severity: "must", enforcement: "automated" },
    { id: stdId(), code: "NAME-001", category: "naming", title: "Files kebab-case", description: "Source files use kebab-case. Classes/Types PascalCase. Functions/variables camelCase.", severity: "should", enforcement: "manual" },
    { id: stdId(), code: "TEST-001", category: "testing", title: "Tests per new module", description: "Every new endpoint has at least an integration or e2e test.", severity: "should", enforcement: "manual" },
  ];
  for (const s of seeds) standards.set(s.id, s);
}
function stdId() { return randomUUID(); }

// ─── Redis persistence helpers (opportunistic) ────────────────────────────
async function redisPersist() {
  try {
    const data = JSON.stringify({
      adrs: [...adrs.values()],
      standards: [...standards.values()],
      reviews: [...reviews.values()],
    });
    await redis.set("enterprise:governance:dump", data, "EX", 86400 * 7);
  } catch (e) { logger.warn("governance persist failed", { error: (e as Error).message }); }
}
async function redisRestore() {
  try {
    const raw = await redis.get("enterprise:governance:dump");
    if (!raw) return;
    const data = JSON.parse(raw) as {
      adrs: ArchitectureDecisionRecord[];
      standards: ArchitectureStandard[];
      reviews: ReviewRequest[];
    };
    adrs.clear(); standards.clear(); reviews.clear();
    for (const a of data.adrs) adrs.set(a.id, a);
    for (const s of data.standards) standards.set(s.id, s);
    for (const r of data.reviews) reviews.set(r.id, r);
    logger.info("governance restored from redis", { adrs: adrs.size, standards: standards.size, reviews: reviews.size });
  } catch { /* ignore */ }
}
// Try restore on startup.
setTimeout(redisRestore, 2000);

// ─── Public API ───────────────────────────────────────────────────────────
export const GovernanceService = {
  // ── ADRs ──────────────────────────────────────────────────────────────
  async listADRs(params: { status?: ADRStatus; tag?: string } = {}): Promise<ArchitectureDecisionRecord[]> {
    let list = [...adrs.values()].sort((a, b) => b.number - a.number);
    if (params.status) list = list.filter((a) => a.status === params.status);
    if (params.tag) list = list.filter((a) => a.tags.includes(params.tag!));
    return list;
  },
  async getADR(id: string): Promise<ArchitectureDecisionRecord | null> {
    return adrs.get(id) ?? null;
  },
  async createADR(input: Omit<ArchitectureDecisionRecord, "id" | "number" | "date" | "status"> & { status?: ADRStatus }, authorId: string): Promise<ArchitectureDecisionRecord> {
    const seq = await redis.incr(KEYS.adrSeq).catch(() => adrs.size + 1);
    const adr: ArchitectureDecisionRecord = {
      id: randomUUID(),
      number: Number(seq),
      date: new Date().toISOString(),
      status: input.status ?? "proposed",
      title: input.title,
      context: input.context,
      decision: input.decision,
      consequences: input.consequences,
      authors: [...new Set([authorId, ...(input.authors ?? [])])],
      tags: input.tags ?? [],
    };
    adrs.set(adr.id, adr);
    logger.info("adr created", { id: adr.id, number: adr.number, title: adr.title });
    redisPersist();
    return adr;
  },
  async updateADR(id: string, patch: Partial<Pick<ArchitectureDecisionRecord, "title"|"context"|"decision"|"consequences"|"status"|"tags"|"supersededBy">>): Promise<ArchitectureDecisionRecord | null> {
    const adr = adrs.get(id);
    if (!adr) return null;
    Object.assign(adr, patch);
    adrs.set(id, adr);
    redisPersist();
    return adr;
  },
  async deleteADR(id: string): Promise<boolean> {
    const existed = adrs.delete(id);
    if (existed) redisPersist();
    return existed;
  },

  // ── Standards ─────────────────────────────────────────────────────────
  listStandards(category?: ArchitectureStandard["category"]): ArchitectureStandard[] {
    let list = [...standards.values()];
    if (category) list = list.filter((s) => s.category === category);
    return list.sort((a, b) => a.code.localeCompare(b.code));
  },
  async addStandard(input: Omit<ArchitectureStandard, "id">): Promise<ArchitectureStandard> {
    const s: ArchitectureStandard = { id: randomUUID(), ...input };
    standards.set(s.id, s);
    redisPersist();
    return s;
  },

  // ── Reviews ───────────────────────────────────────────────────────────
  listReviews(params: { status?: ReviewRequest["status"]; kind?: ReviewRequest["kind"] } = {}): ReviewRequest[] {
    let list = [...reviews.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (params.status) list = list.filter((r) => r.status === params.status);
    if (params.kind) list = list.filter((r) => r.kind === params.kind);
    return list;
  },
  async requestReview(input: Omit<ReviewRequest, "id"|"status"|"comments"|"createdAt"|"requestedBy">, requesterId: string): Promise<ReviewRequest> {
    const r: ReviewRequest = {
      id: randomUUID(),
      status: "pending",
      comments: [],
      createdAt: new Date().toISOString(),
      requestedBy: requesterId,
      kind: input.kind,
      targetId: input.targetId,
      reviewers: input.reviewers,
    };
    reviews.set(r.id, r);
    redisPersist();
    return r;
  },
  async addReviewComment(id: string, authorId: string, body: string): Promise<ReviewRequest | null> {
    const r = reviews.get(id);
    if (!r) return null;
    r.comments.push({ id: randomUUID(), author: authorId, body, createdAt: new Date().toISOString() });
    reviews.set(id, r);
    redisPersist();
    return r;
  },
  async decideReview(id: string, decision: Exclude<ReviewRequest["status"], "pending">): Promise<ReviewRequest | null> {
    const r = reviews.get(id);
    if (!r) return null;
    r.status = decision;
    r.decidedAt = new Date().toISOString();
    reviews.set(id, r);
    redisPersist();
    return r;
  },
};

// Seed standards on module load (idempotent).
seedStandards();
