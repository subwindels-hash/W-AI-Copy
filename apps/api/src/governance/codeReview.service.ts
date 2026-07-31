/**
 * CodeReviewService — Slice 196.
 *
 * Manages a lightweight code-review register (MVP — not wired to GitHub; data is
 * seeded with synthetic PRs that match the current in-flight sessions and
 * updated via API). Includes the standard checklist (correctness/security/
 * tests/style/performance/docs) and aggregate metrics used on the governance
 * dashboard.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { CodeReview, ReviewChecklistItem, ReviewMetrics, ReviewStatus } from "@windels/shared/governance";

const KEY = "gov:reviews:list";
const CAP = 200;

const DEFAULT_CHECKLIST: Omit<ReviewChecklistItem, "id">[] = [
  { text: "Code compiles and passes typecheck", category: "correctness", required: true },
  { text: "No hardcoded secrets or credentials", category: "security", required: true },
  { text: "New code has unit or E2E tests", category: "tests", required: true },
  { text: "Follows coding standards (naming, file layout)", category: "style", required: false },
  { text: "No obvious performance regressions (N+1, unbounded loops)", category: "performance", required: false },
  { text: "Public APIs documented; PROGRESS.md/CONVENTIONS.md updated if new slice", category: "docs", required: true },
  { text: "Inputs validated; auth/permission checks present", category: "security", required: true },
];

function rid() { return randomUUID(); }

function makeChecklist(): ReviewChecklistItem[] {
  return DEFAULT_CHECKLIST.map((c) => ({ id: rid(), ...c }));
}

const SEED: Array<Omit<CodeReview, "id" | "createdAt" | "updatedAt" | "checklist"> & Partial<Pick<CodeReview, "checklist">>> = [
  { title: "feat(qa): runner registry + 7 test runners", author: "eng@windels.ai", reviewer: "lead@windels.ai", status: "merged", prUrl: "https://github.com/windels-ai/windels-os/pull/220", comments: 4, filesChanged: 12, mergedAt: "2026-07-20T05:17:00.000Z" },
  { title: "feat(qa): PlatformPage QA tab w/ suite explorer + run detail", author: "web@windels.ai", reviewer: "lead@windels.ai", status: "merged", prUrl: "https://github.com/windels-ai/windels-os/pull/221", comments: 3, filesChanged: 3, mergedAt: "2026-07-20T05:21:00.000Z" },
  { title: "fix(qa): accept 422 on Zod validation in input-validation assertion", author: "qa@windels.ai", reviewer: "sec@windels.ai", status: "merged", prUrl: "https://github.com/windels-ai/windels-os/pull/222", comments: 2, filesChanged: 2, mergedAt: "2026-07-20T05:23:00.000Z" },
  { title: "test(qa): playwright qa.spec.ts + k6 qa-runs.js", author: "qa@windels.ai", reviewer: "lead@windels.ai", status: "approved", prUrl: "https://github.com/windels-ai/windels-os/pull/223", comments: 1, filesChanged: 2 },
  { title: "feat(gov): engineering governance submodule", author: "eng@windels.ai", status: "open", comments: 0, filesChanged: 8 },
];

async function ensureSeeded() {
  if ((await redis.exists(KEY)) > 0) return;
  for (const s of SEED) {
    const now = new Date().toISOString();
    const rec: CodeReview = {
      id: rid(),
      checklist: s.checklist ?? makeChecklist(),
      createdAt: now, updatedAt: now,
      ...s,
    } as CodeReview;
    await redis.lpush(KEY, JSON.stringify(rec));
  }
  await redis.ltrim(KEY, 0, CAP - 1);
}

async function readAll(): Promise<CodeReview[]> {
  const raw = await redis.lrange(KEY, 0, -1);
  return raw.map((r) => JSON.parse(r));
}

export const CodeReviewService = {
  async list(status?: ReviewStatus): Promise<CodeReview[]> {
    await ensureSeeded();
    const all = await readAll();
    const sorted = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return status ? sorted.filter((r) => r.status === status) : sorted;
  },
  async get(id: string): Promise<CodeReview | null> { return (await readAll()).find((r) => r.id === id) ?? null; },
  async create(input: { title: string; author: string; prUrl?: string; filesChanged?: number }): Promise<CodeReview> {
    await ensureSeeded();
    const now = new Date().toISOString();
    const rec: CodeReview = { id: rid(), title: input.title, author: input.author, reviewer: undefined, status: "open", prUrl: input.prUrl, checklist: makeChecklist(), comments: 0, filesChanged: input.filesChanged ?? 0, createdAt: now, updatedAt: now };
    await redis.lpush(KEY, JSON.stringify(rec));
    await redis.ltrim(KEY, 0, CAP - 1);
    return rec;
  },
  async setStatus(id: string, status: ReviewStatus, reviewer?: string): Promise<CodeReview | null> {
    const all = await readAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    all[idx].status = status;
    all[idx].reviewer = reviewer ?? all[idx].reviewer;
    all[idx].updatedAt = new Date().toISOString();
    if (status === "merged") all[idx].mergedAt = all[idx].mergedAt ?? all[idx].updatedAt;
    await redis.del(KEY);
    for (const r of all) await redis.rpush(KEY, JSON.stringify(r));
    return all[idx];
  },
  async addComment(id: string): Promise<CodeReview | null> {
    const all = await readAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    all[idx].comments += 1;
    all[idx].updatedAt = new Date().toISOString();
    await redis.del(KEY);
    for (const r of all) await redis.rpush(KEY, JSON.stringify(r));
    return all[idx];
  },
  async metrics(): Promise<ReviewMetrics> {
    const all = await readAll();
    const open = all.filter((r) => r.status === "open").length;
    const merged = all.filter((r) => r.status === "merged");
    const approved = all.filter((r) => r.status === "approved" || r.status === "merged");
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const mergedThisWeek = merged.filter((r) => r.mergedAt && new Date(r.mergedAt).getTime() > oneWeekAgo).length;
    const durations = merged.map((r) => r.mergedAt ? (new Date(r.mergedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000 : 0).filter((x) => x > 0);
    const avgHrs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const totalComments = all.reduce((sum, r) => sum + r.comments, 0);
    return {
      openReviews: open,
      avgReviewHours: Math.round(avgHrs * 10) / 10,
      mergedThisWeek,
      approvalRate: all.length ? approved.length / all.length : 0,
      avgCommentsPerPr: all.length ? Math.round((totalComments / all.length) * 10) / 10 : 0,
    };
  },
  checklist() { return DEFAULT_CHECKLIST.map((c) => ({ id: rid(), ...c })); },
};
