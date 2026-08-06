/**
 * Session 99 — Software Factory: Five Studios & Build Farm Compilation
 * Targets. Implements AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0 §3–§4.
 *
 * - The five enterprise studios are a real static catalog (with their
 *   defined deliverables from the spec).
 * - Studio plans are org-scoped, project-linked work items with an honest
 *   status lifecycle (planned → in_progress → completed; completedAt stamped
 *   only on the real transition) and deliverables validated against the
 *   studio catalog.
 * - Compilation targets are a PURE PROJECTION of a run's real state —
 *   never stored, never fabricated: targetType → declared targets (real
 *   mapping), deterministic file names + real SHA-256 manifests, status
 *   derived from the run (pending → compiling → built | failed), and
 *   `binaryEmitted` always honestly false with a requiresToolchain note
 *   (real binaries need the external build farm host).
 *
 * Honesty rules:
 *   - No Math.random; ids from CSPRNG; sha256 is a real node:crypto hash.
 *   - Identical run state ⇒ identical targets.
 *
 * Keys: sf:*
 */
import { randomUUID, createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  SfStudio,
  SfStudioPlan,
  SfCompileTarget,
  SfStudioCoverage,
  SfRollup,
  SfStudioPlanCreateInput,
  SfStudioPlanUpsertInput,
  SfStudioKey,
  SfTargetStatus,
} from "@windels/shared/softwareFactory";
import {
  SF_STUDIOS,
  SF_STUDIO_DELIVERABLES,
  SF_TARGET_MAP,
} from "@windels/shared/softwareFactory";

const K = {
  plan: (org: string, id: string) => `sf:plan:i:${org}:${id}`,
  plans: (org: string) => `sf:plan:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

async function readPlan(org: string, id: string): Promise<SfStudioPlan | null> {
  const raw = await redis.hget(K.plan(org, id), "_doc");
  if (!raw) return null;
  const rec = j<SfStudioPlan>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writePlan(org: string, rec: SfStudioPlan): Promise<void> {
  await redis.hset(K.plan(org, rec.id), "_doc", s2(rec));
  await redis.zadd(K.plans(org), Date.now(), rec.id);
}

async function deletePlan(org: string, id: string): Promise<boolean> {
  const existed = await readPlan(org, id);
  if (!existed) return false;
  await redis.del(K.plan(org, id));
  await redis.zrem(K.plans(org), id);
  return true;
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "software-factory", payload });
  } catch {
    /* best effort */
  }
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";

export const SoftwareFactoryService = {
  // ── Studios (static catalog) ──────────────────────────────────────
  studios(): SfStudio[] {
    return SF_STUDIOS.map((s) => ({ ...s }));
  },

  // ── Studio plans ──────────────────────────────────────────────────
  async listPlans(org: string, filter?: { projectId?: string; studio?: SfStudioKey; status?: string }): Promise<SfStudioPlan[]> {
    const ids = await redis.zrange(K.plans(org), 0, -1);
    const out: SfStudioPlan[] = [];
    for (const id of ids) {
      const p = await readPlan(org, id);
      if (!p) continue;
      if (filter?.projectId && p.projectId !== filter.projectId) continue;
      if (filter?.studio && p.studio !== filter.studio) continue;
      if (filter?.status && p.status !== filter.status) continue;
      out.push(p);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getPlan(org: string, id: string): Promise<SfStudioPlan | null> {
    return readPlan(org, id);
  },

  async createPlan(org: string, input: SfStudioPlanCreateInput, _userId: string | null): Promise<SfStudioPlan> {
    // Validate deliverables against the studio catalog — no invented items.
    const allowed = SF_STUDIO_DELIVERABLES[input.studio];
    for (const d of input.deliverables) {
      if (!allowed.includes(d)) throw new Error(`UNKNOWN_DELIVERABLE: ${d}`);
    }
    // Project must exist (real project from the S96 app-builder module).
    const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
    const project = await AppBuilderService.getProject(org, input.projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const now = new Date().toISOString();
    const rec: SfStudioPlan = {
      id: uid("sfp-"),
      organizationId: org,
      projectId: input.projectId,
      studio: input.studio,
      deliverables: input.deliverables,
      status: input.status ?? "planned",
      completedAt: (input.status ?? "planned") === "completed" ? now : null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writePlan(org, rec);
    void emitKernel("sf.plan.created", { id: rec.id, projectId: rec.projectId, organizationId: org, studio: rec.studio });
    return rec;
  },

  async updatePlan(org: string, id: string, patch: Partial<SfStudioPlanUpsertInput>, _userId: string | null): Promise<SfStudioPlan | null> {
    const cur = await readPlan(org, id);
    if (!cur) return null;
    if (patch.deliverables) {
      const allowed = SF_STUDIO_DELIVERABLES[patch.studio ?? cur.studio];
      for (const d of patch.deliverables) {
        if (!allowed.includes(d)) throw new Error(`UNKNOWN_DELIVERABLE: ${d}`);
      }
    }
    const now = new Date().toISOString();
    const nextStatus = patch.status ?? cur.status;
    const next: SfStudioPlan = {
      ...cur,
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.studio !== undefined ? { studio: patch.studio } : {}),
      ...(patch.deliverables !== undefined ? { deliverables: patch.deliverables } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      status: nextStatus,
      // completedAt stamped only on entering completed; cleared when leaving.
      completedAt: nextStatus === "completed" ? (cur.completedAt ?? now) : null,
      updatedAt: now,
    };
    await writePlan(org, next);
    void emitKernel("sf.plan.updated", { id, organizationId: org, status: next.status });
    return next;
  },

  async deletePlan(org: string, id: string): Promise<boolean> {
    const ok = await deletePlan(org, id);
    if (ok) void emitKernel("sf.plan.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Project studio coverage (computed per read) ───────────────────
  async studioCoverage(org: string, projectId: string): Promise<SfStudioCoverage | null> {
    const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
    const project = await AppBuilderService.getProject(org, projectId);
    if (!project) return null;
    const plans = await this.listPlans(org, { projectId });
    const coverage = SF_STUDIOS.map((studio) => {
      const studioPlans = plans.filter((p) => p.studio === studio.key);
      const completed = studioPlans.filter((p) => p.status === "completed");
      return {
        studio: studio.key,
        name: studio.name,
        plans: studioPlans.length,
        completed: completed.length,
        deliverables: completed.flatMap((p) => p.deliverables),
      };
    });
    return {
      projectId,
      plans: plans.length,
      completedPlans: plans.filter((p) => p.status === "completed").length,
      coverage,
      allStudiosCovered: coverage.every((c) => c.completed > 0),
      totalDeliverables: plans.reduce((s, p) => s + p.deliverables.length, 0),
      completedDeliverables: coverage.reduce((s, c) => s + c.deliverables.length, 0),
    };
  },

  // ── Build farm compilation targets (pure projection — never stored) ─
  async compileTargets(org: string, runId: string): Promise<SfCompileTarget[] | null> {
    const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
    const run = await AppBuilderService.getRun(org, runId);
    if (!run) return null;
    const project = await AppBuilderService.getProject(org, run.projectId);
    if (!project) return null;
    const defs = SF_TARGET_MAP[project.targetType] ?? SF_TARGET_MAP.WEB;

    // Honest status derived from the run's real state.
    let status: SfTargetStatus = "pending";
    if (run.status === "COMPILING" || run.status === "SIGNING") status = "compiling";
    else if (run.status === "SUCCEEDED") status = "built";
    else if (run.status === "FAILED") status = "failed";

    return defs.map((def) => {
      const fileName = `${slug(project.name)}-${run.version}-${def.platform}.${def.extension}`;
      const manifestJson = JSON.stringify(
        {
          schema: "windels.ai/app-builder/compile-target/v1",
          project: { id: project.id, name: project.name, targetType: project.targetType },
          run: { id: run.id, version: run.version, status: run.status },
          target: { platform: def.platform, format: def.format, extension: def.extension, fileName },
          declaredAt: run.createdAt,
        },
        null,
        2
      );
      return {
        id: `${run.id}:${def.platform}:${def.extension}`,
        runId: run.id,
        projectId: project.id,
        platform: def.platform,
        format: def.format,
        extension: def.extension,
        fileName,
        manifestJson,
        sha256: createHash("sha256").update(manifestJson).digest("hex"),
        status,
        binaryEmitted: false,
        requiresToolchain: def.requiresToolchain,
      } satisfies SfCompileTarget;
    });
  },

  // ── Rollup (computed per read) ────────────────────────────────────
  async rollup(org: string): Promise<SfRollup> {
    const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
    const [plans, projects, runs] = await Promise.all([
      this.listPlans(org),
      AppBuilderService.listProjects(org),
      AppBuilderService.listRuns(org),
    ]);

    const plansByStatus: SfRollup["counts"]["plansByStatus"] = { planned: 0, in_progress: 0, completed: 0 };
    for (const p of plans) plansByStatus[p.status]++;

    let runsWithTargets = 0;
    const targetsByStatus: SfRollup["counts"]["targetsByStatus"] = { pending: 0, compiling: 0, built: 0, failed: 0 };
    for (const run of runs) {
      const targets = await this.compileTargets(org, run.id);
      if (!targets) continue;
      runsWithTargets++;
      for (const t of targets) targetsByStatus[t.status]++;
    }

    let studiosCovered = 0;
    for (const project of projects) {
      const cov = await this.studioCoverage(org, project.id);
      if (cov?.allStudiosCovered) studiosCovered++;
    }

    const stamps = plans[0]?.createdAt ?? null;
    return {
      counts: {
        plans: plans.length,
        plansByStatus,
        runsWithTargets,
        targetsByStatus,
      },
      studiosCovered,
      recentPlans: plans.slice(0, 6),
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-sf";
    const existing = await this.listPlans(demoOrg);
    if (existing.length > 0) return false;

    const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
    const project = await AppBuilderService.createProject(demoOrg, {
      name: "Customer Portal",
      description: "Demo project for studio coverage",
      targetType: "WEB",
      techStack: { frontend: "react", backend: "express", db: "postgres" },
      systemPrompt: "Build a customer portal.",
    }, "user-pm");

    const productPlan = await this.createPlan(demoOrg, {
      projectId: project.id, studio: "product",
      deliverables: ["Business Requirements", "PRDs", "User Stories"],
      status: "completed",
    }, null);
    await this.createPlan(demoOrg, {
      projectId: project.id, studio: "engineering",
      deliverables: ["Web Applications", "APIs"],
      status: "completed",
    }, null);
    await this.createPlan(demoOrg, {
      projectId: project.id, studio: "quality",
      deliverables: ["Unit Testing", "E2E Testing"],
      status: "in_progress",
    }, null);
    await this.createPlan(demoOrg, {
      projectId: project.id, studio: "devops",
      deliverables: ["CI/CD Pipelines", "Artifact Registries"],
    }, null);
    await this.createPlan(demoOrg, {
      projectId: project.id, studio: "operations",
      deliverables: ["Monitoring & Metrics"],
    }, null);

    const run1 = await AppBuilderService.createRun(demoOrg, project.id, { version: "v1.0.0" }, "user-pm");
    let cur = run1;
    for (let i = 0; i < 5; i++) cur = (await AppBuilderService.advanceRun(demoOrg, cur.id, "user-pm"))!;
    await AppBuilderService.createRun(demoOrg, project.id, { version: "v1.1.0" }, "user-pm"); // stays QUEUED

    void productPlan;
    logger?.info?.("[software-factory] demo seed complete (org-demo-sf): 5 studio plans, 2 runs with compile targets");
    return true;
  },
};
