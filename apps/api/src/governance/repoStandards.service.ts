/**
 * RepoStandardsService — Slice 194.
 *
 * Repository hygiene rules: branching model, commit conventions, PR policy,
 * CI requirements, secret scanning, licensing, documentation, and repo layout.
 * Seeded with WINDELS baseline. Supports CRUD and summary.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { RepoStandard } from "@windels/shared/governance";

const KEY = "gov:repo:standards";

const SEED: Omit<RepoStandard, "id">[] = [
  { area: "branching", title: "Trunk-based on main", description: "main is always deployable; work happens on short-lived feature branches (<3 days).", enforced: true, tooling: "branch-protection" },
  { area: "commits", title: "Conventional commit messages", description: "Commits follow Conventional Commits (feat:/fix:/chore:/docs:/refactor:/test:).", enforced: true, tooling: "commitlint + husky" },
  { area: "prs", title: "All code changes via PR", description: "No direct pushes to main; every change must be reviewed via pull request.", enforced: true, tooling: "branch-protection" },
  { area: "prs", title: "Minimum 1 reviewer on PRs", description: "PRs require at least one approved review before merge; 2 approvals for auth/governance changes.", enforced: true, tooling: "branch-protection" },
  { area: "prs", title: "CI green before merge", description: "Typecheck, build, lint, Playwright E2E, and k6 smoke must pass before PR can merge.", enforced: true, tooling: "github-actions" },
  { area: "ci", title: "CI runs on every PR", description: "Typecheck, build, unit tests, E2E smoke, and dependency-audit run on every PR and push to main.", enforced: true, tooling: "github-actions" },
  { area: "secrets", title: "Secret scanning enabled", description: "Trufflehog/gitleaks runs in CI; committed secrets block merge.", enforced: true, tooling: "gitleaks" },
  { area: "licensing", title: "Apache-2.0 + enterprise addenda", description: "Code is licensed Apache-2.0; enterprise modules under WINDELS commercial license.", enforced: false },
  { area: "documentation", title: "README + PROGRESS + CONVENTIONS", description: "Every session updates PROGRESS.md and CONVENTIONS.md; new modules need README sections.", enforced: true },
  { area: "structure", title: "pnpm workspaces + Turborepo layout", description: "apps/*, packages/*, tests/*; shared code lives in packages/shared.", enforced: true },
  { area: "structure", title: "Vertical-slice services per domain", description: "Backend services live under apps/api/src/<domain>/<slice>.service.ts; routes under apps/api/src/http/routes/<domain>.ts.", enforced: true },
];

async function readAll(): Promise<RepoStandard[]> {
  const raw = await redis.hgetall(KEY);
  return Object.values(raw).map((v) => JSON.parse(v));
}

async function ensureSeeded() {
  if ((await redis.hlen(KEY)) > 0) return;
  for (const s of SEED) {
    const id = randomUUID();
    await redis.hset(KEY, id, JSON.stringify({ id, ...s }));
  }
}

export const RepoStandardsService = {
  async list(): Promise<RepoStandard[]> { await ensureSeeded(); return (await readAll()).sort((a, b) => a.area.localeCompare(b.area)); },
  async create(input: Omit<RepoStandard, "id">): Promise<RepoStandard> {
    await ensureSeeded();
    const s: RepoStandard = { id: randomUUID(), ...input };
    await redis.hset(KEY, s.id, JSON.stringify(s)); return s;
  },
  async update(id: string, patch: Partial<RepoStandard>): Promise<RepoStandard | null> {
    const cur = await redis.hget(KEY, id); if (!cur) return null;
    const next = { ...JSON.parse(cur), ...patch, id };
    await redis.hset(KEY, id, JSON.stringify(next)); return next;
  },
  async remove(id: string): Promise<boolean> { return (await redis.hdel(KEY, id)) > 0; },
  async summary() { const all = await this.list(); return { total: all.length, enforced: all.filter(s => s.enforced).length }; },
};
