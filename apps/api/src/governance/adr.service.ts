/**
 * ADRService — Slice 195.
 *
 * Architecture Decision Records: immutable log of significant architectural
 * decisions (context, decision, consequences, status, supersede links).
 * Pre-seeded with 13 ADRs mirroring the sessions already shipped, so the
 * registry is useful on first boot rather than empty.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ADR, ADRStatus } from "@windels/shared/governance";

const KEY = "gov:adr:list";
const COUNTER = "gov:adr:counter";

const SEED: Array<Omit<ADR, "id" | "number" | "date">> = [
  { title: "Adopt monorepo with pnpm workspaces + Turborepo", status: "accepted", context: "Need single repository to share types and build tooling across api/web/desktop/shared packages.", decision: "Use pnpm workspaces at repo root with packages/ apps/ tests/; Turborepo for task orchestration.", consequences: "Single lockfile; atomic cross-package changes; CI must understand workspace graph.", authors: ["WINDELS Eng"], tags: ["repo","build"], supersededBy: undefined },
  { title: "React 19 + Vite + Tailwind v4 for web frontend", status: "accepted", context: "Need modern, fast dev server with first-class TypeScript.", decision: "React 19 with Vite HMR, Tailwind CSS v4 for styling, Framer Motion for animation, Zustand for state.", consequences: "Consistent fast HMR; utility-first styling; small dependency surface.", authors: ["WINDELS Eng"], tags: ["frontend","react"], supersededBy: undefined },
  { title: "Node 20 + Express + Prisma for API", status: "accepted", context: "Need mature, type-safe backend with strong PostgreSQL tooling.", decision: "Node 20 LTS + Express 4, Prisma ORM, Zod validation, JWT auth.", consequences: "Large ecosystem; careful typing required on Request/Response objects.", authors: ["WINDELS Eng"], tags: ["backend","api"], supersededBy: undefined },
  { title: "Dark-mode glassmorphism design system", status: "accepted", context: "Brand calls for deep calm + bioluminescent accent aesthetic.", decision: "Bg-Deep #0A0F1A base, glass cards bg-white/5 + backdrop-blur, Geist font, semantic palette tokens (azure/violet/emerald/crimson/amber/fuchsia/teal).", consequences: "Consistent look; designers must compose within token set.", authors: ["WINDELS Design"], tags: ["design","ui"], supersededBy: undefined },
  { title: "{ok,data} response envelope", status: "accepted", context: "Need predictable response shape across all APIs.", decision: "All responses return {ok:boolean,data?:T,error?:{code,message},meta:{requestId,tookMs}}.", consequences: "Clients can unwrap uniformly; error paths standardized.", authors: ["WINDELS Eng"], tags: ["api","conventions"], supersededBy: undefined },
  { title: "Vertical-slice architecture per session", status: "accepted", context: "Layer-by-layer building left the system un-testable for many sessions.", decision: "Every slice ships FE+BE+DB+auth integrated; no slice is done until it's deployed and confirmed working.", consequences: "Early detection of integration issues; slightly slower individual slices.", authors: ["WINDELS Eng"], tags: ["process","architecture"], supersededBy: undefined },
  { title: "PostgreSQL + Redis as persistence layer", status: "accepted", context: "Need relational data + fast cache/pubsub.", decision: "PostgreSQL 17 (Prisma-migrated) for durable state; Redis 7 for cache, queues, pub/sub ephemeral lists.", consequences: "Two datastores to operate; Redis data is considered disposable.", authors: ["WINDELS Ops"], tags: ["database","infra"], supersededBy: undefined },
  { title: "First registered user = SUPER_ADMIN", status: "accepted", context: "Bootstrapping admin without a separate seed pipeline.", decision: "On first /auth/register when user count is 0, the user is created as super_admin; bootstrap email/password configurable via env.", consequences: "No separate seed script needed; deployments must register their admin before opening registration.", authors: ["WINDELS Eng"], tags: ["auth","bootstrap"], supersededBy: undefined },
  { title: "Zod validation returns HTTP 422 not 400", status: "accepted", context: "Zod's validate() middleware issues 422 for schema failures.", decision: "Security + input-validation tests accept any 4xx (400/422) as a safe rejection.", consequences: "Avoids tight coupling to one status code; callers check for 4xx family.", authors: ["WINDELS QA"], tags: ["api","validation"], supersededBy: undefined },
  { title: "Redis dual-client: redis (subscriber) + redisCmd (commands)", status: "accepted", context: "ioredis enters subscriber mode after SUBSCRIBE and rejects normal commands.", decision: "Export both `redis` (EventBus subscriber) and `redisCmd` (command client) from db/redis.ts; post-boot writes MUST use redisCmd.", consequences: "Avoids 'Connection in subscriber mode' errors; new services must import the right client.", authors: ["WINDELS Eng"], tags: ["redis","conventions"], supersededBy: undefined },
  { title: "Electron 33 for desktop shell", status: "accepted", context: "Cross-platform desktop companion.", decision: "Electron 33 wrapping the web build with native integrations (file system, notifications, auto-updates).", consequences: "Desktop ships as a thin shell; no duplicate UI code.", authors: ["WINDELS Desktop"], tags: ["desktop","electron"], supersededBy: undefined },
  { title: "QA runner registry with pluggable test kinds", status: "accepted", context: "Session 22 needs to run API/AI/workflow/security/chaos/DR/digital-twin tests through one scheduler.", decision: "TestRunnerService.registerRunner(kind, fn); suite/case/run storage in Redis capped at 200 runs; one scheduler tick per minute.", consequences: "Adding new test kinds is a register call away; bounded run history.", authors: ["WINDELS QA"], tags: ["qa","architecture"], supersededBy: undefined },
  { title: "Engineering governance layer under /api/v1/governance/engineering", status: "accepted", context: "Session 23 adds standards/ADR/reviews/dependencies/security-baseline endpoints.", decision: "Mount engineering-governance sub-router on existing governanceRouter; ORG_ADMIN read/write, authenticated users can read standards and ADRs.", consequences: "Consolidates engineering ops endpoints with existing RBAC/audit surfaces.", authors: ["WINDELS Eng"], tags: ["governance","api"], supersededBy: undefined },
];

async function ensureSeeded() {
  if ((await redis.exists(KEY)) > 0) return;
  let n = 1;
  for (const a of SEED) {
    const id = randomUUID();
    const date = new Date(Date.UTC(2026, 0, n * 2)).toISOString(); // spread dates
    const rec: ADR = { id, number: n, date, ...a };
    await redis.rpush(KEY, JSON.stringify(rec));
    n++;
  }
  await redis.set(COUNTER, String(SEED.length));
}

export const ADRService = {
  async list(): Promise<ADR[]> {
    await ensureSeeded();
    const raw = await redis.lrange(KEY, 0, -1);
    return raw.map((r) => JSON.parse(r)).sort((a, b) => a.number - b.number);
  },
  async get(id: string): Promise<ADR | null> { return (await this.list()).find((a) => a.id === id) ?? null; },
  async create(input: { title: string; context: string; decision: string; consequences: string; authors?: string[]; tags?: string[]; status?: ADRStatus }): Promise<ADR> {
    await ensureSeeded();
    const num = await redis.incr(COUNTER);
    const a: ADR = { id: randomUUID(), number: num, title: input.title, status: input.status ?? "proposed", context: input.context, decision: input.decision, consequences: input.consequences, authors: input.authors ?? [], date: new Date().toISOString(), tags: input.tags ?? [] };
    await redis.rpush(KEY, JSON.stringify(a));
    return a;
  },
  async updateStatus(id: string, status: ADRStatus, supersededBy?: string): Promise<ADR | null> {
    const all = await this.list();
    const idx = all.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    all[idx].status = status;
    if (supersededBy) all[idx].supersededBy = supersededBy;
    await redis.del(KEY);
    for (const a of all) await redis.rpush(KEY, JSON.stringify(a));
    return all[idx];
  },
  async summary() {
    const all = await this.list();
    return {
      total: all.length,
      accepted: all.filter((a) => a.status === "accepted").length,
      proposed: all.filter((a) => a.status === "proposed").length,
      superseded: all.filter((a) => a.status === "superseded").length,
    };
  },
};
