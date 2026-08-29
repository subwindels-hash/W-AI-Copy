/**
 * Session 99 — Software Factory: Five Studios & Build Farm.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): the five-studio catalog, studio plan CRUD with
 * honest lifecycle + deliverable validation, project studio coverage
 * (computed), and per-run build farm compilation targets as a pure
 * projection of the run's real state (real SHA-256 manifests, honest
 * status derivation, binaryEmitted always false). Includes cross-tenant
 * isolation, demo-seed idempotency, and the shared Zod contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string | number>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async incr(key: string) {
      const cur = (this.store.get(key) as number) ?? 0;
      this.store.set(key, cur + 1);
      return cur + 1;
    }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
      return slice.map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));

// AppBuilderService shares the fake store (projects/runs live there).
const appBuilder = async () => {
  const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
  return AppBuilderService;
};

import { SoftwareFactoryService } from "./softwareFactory.service.js";
import { SF_STUDIOS, SF_TARGET_MAP, SfStudioPlanUpsertSchema } from "@windels/shared/softwareFactory";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function seedOrgA() {
  const AppBuilderService = await appBuilder();
  const project = await AppBuilderService.createProject(ORG_A, {
    name: "Customer Portal", targetType: "WEB",
    techStack: { frontend: "react" }, systemPrompt: "Build it.",
  }, "user-pm");
  return { AppBuilderService, project };
}

describe("SF — the five studios (real static catalog)", () => {
  it("exposes exactly 5 studios with the spec's purposes and non-empty deliverables", () => {
    expect(SF_STUDIOS).toHaveLength(5);
    expect(SoftwareFactoryService.studios()).toHaveLength(5);
    const keys = SF_STUDIOS.map((s) => s.key).sort();
    expect(keys).toEqual(["devops", "engineering", "operations", "product", "quality"]);
    for (const studio of SF_STUDIOS) {
      expect(studio.deliverables.length).toBeGreaterThan(0);
      expect(studio.purpose.length).toBeGreaterThan(10);
    }
    // Every studio covers the spec's described deliverables.
    expect(SF_STUDIOS.find((s) => s.key === "product")?.deliverables).toContain("PRDs");
    expect(SF_STUDIOS.find((s) => s.key === "quality")?.deliverables).toContain("Security Audits");
  });
});

describe("SF — studio plans (honest lifecycle, deliverable validation)", () => {
  it("creates plans and validates deliverables against the studio catalog", async () => {
    const { project } = await seedOrgA();
    const plan = await SoftwareFactoryService.createPlan(ORG_A, {
      projectId: project.id, studio: "quality", deliverables: ["Unit Testing", "E2E Testing"],
    }, null);
    expect(plan.id).toMatch(/^sfp-/);
    expect(plan.status).toBe("planned");
    expect(plan.completedAt).toBeNull();

    await expect(SoftwareFactoryService.createPlan(ORG_A, {
      projectId: project.id, studio: "quality", deliverables: ["Flying Cars"],
    }, null)).rejects.toThrow("UNKNOWN_DELIVERABLE");
  });

  it("rejects plans for a non-existent project", async () => {
    await expect(SoftwareFactoryService.createPlan(ORG_A, {
      projectId: "nope", studio: "product", deliverables: ["PRDs"],
    }, null)).rejects.toThrow("PROJECT_NOT_FOUND");
  });

  it("stamps completedAt only on the real transition; clears it when reopened", async () => {
    const { project } = await seedOrgA();
    const plan = await SoftwareFactoryService.createPlan(ORG_A, {
      projectId: project.id, studio: "product", deliverables: ["PRDs"], status: "in_progress",
    }, null);
    expect(plan.completedAt).toBeNull();

    const completed = await SoftwareFactoryService.updatePlan(ORG_A, plan.id, { status: "completed" }, null);
    expect(completed?.completedAt).toBeTruthy();

    const reopened = await SoftwareFactoryService.updatePlan(ORG_A, plan.id, { status: "in_progress" }, null);
    expect(reopened?.completedAt).toBeNull();
  });
});

describe("SF — project studio coverage (computed, honest)", () => {
  it("computes per-studio plan/deliverable counts and allStudiosCovered", async () => {
    const { project } = await seedOrgA();
    for (const [studio, deliverables] of [
      ["product", ["PRDs", "User Stories"]],
      ["engineering", ["Web Applications"]],
      ["quality", ["Unit Testing"]],
      ["devops", ["CI/CD Pipelines"]],
      ["operations", ["Monitoring & Metrics"]],
    ] as const) {
      await SoftwareFactoryService.createPlan(ORG_A, { projectId: project.id, studio, deliverables: [...deliverables], status: "completed" }, null);
    }
    await SoftwareFactoryService.createPlan(ORG_A, { projectId: project.id, studio: "quality", deliverables: ["E2E Testing"] }, null);

    const cov = await SoftwareFactoryService.studioCoverage(ORG_A, project.id);
    expect(cov).not.toBeNull();
    expect(cov!.plans).toBe(6);
    expect(cov!.completedPlans).toBe(5);
    expect(cov!.allStudiosCovered).toBe(true);
    expect(cov!.coverage.find((c) => c.studio === "product")?.deliverables).toEqual(["PRDs", "User Stories"]);
    expect(cov!.coverage.find((c) => c.studio === "quality")?.completed).toBe(1);
    expect(cov!.totalDeliverables).toBe(7); // 2 (product) + 1×4 + 1 (extra quality)
    expect(cov!.completedDeliverables).toBe(6);
  });
});

describe("SF — build farm compilation targets (pure projection)", () => {
  it("derives targets for a WEB run with honest status + real SHA-256, binaryEmitted false", async () => {
    const { AppBuilderService, project } = await seedOrgA();
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, "user-pm");
    const targets = await SoftwareFactoryService.compileTargets(ORG_A, run.id);
    expect(targets).not.toBeNull();
    expect(targets!.length).toBeGreaterThan(0);
    for (const t of targets!) {
      expect(t.binaryEmitted).toBe(false);
      expect(t.status).toBe("pending"); // run QUEUED
      expect(t.fileName).toContain("v1.0.0");
      expect(t.requiresToolchain.length).toBeGreaterThan(0);
      // Real SHA-256 of the manifest.
      const { createHash } = await import("node:crypto");
      expect(t.sha256).toBe(createHash("sha256").update(t.manifestJson).digest("hex"));
    }
    // Deterministic: identical run state ⇒ identical targets.
    const again = await SoftwareFactoryService.compileTargets(ORG_A, run.id);
    expect(again!.map((t) => ({ ...t, manifestJson: undefined })))
      .toEqual(targets!.map((t) => ({ ...t, manifestJson: undefined })));
  });

  it("derives status from the run's real state (pending → compiling → built; failed)", async () => {
    const { AppBuilderService, project } = await seedOrgA();
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);

    // Advance QUEUED → GENERATING_CODE → TESTING → COMPILING (3 steps).
    await AppBuilderService.advanceRun(ORG_A, run.id, null);
    await AppBuilderService.advanceRun(ORG_A, run.id, null);
    await AppBuilderService.advanceRun(ORG_A, run.id, null);
    let t = await SoftwareFactoryService.compileTargets(ORG_A, run.id);
    expect(t![0]!.status).toBe("compiling");

    // Advance to SUCCEEDED → targets "built".
    for (let i = 0; i < 3; i++) await AppBuilderService.advanceRun(ORG_A, run.id, null);
    t = await SoftwareFactoryService.compileTargets(ORG_A, run.id);
    expect(t![0]!.status).toBe("built");

    // A FAILED run → targets "failed".
    const run2 = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.1.0" }, null);
    await AppBuilderService.advanceRun(ORG_A, run2.id, null);
    await AppBuilderService.failRun(ORG_A, run2.id, null, "compile error");
    t = await SoftwareFactoryService.compileTargets(ORG_A, run2.id);
    expect(t![0]!.status).toBe("failed");
  });

  it("declares the spec's target families per targetType", () => {
    expect(SF_TARGET_MAP.DESKTOP.some((d) => d.extension === "exe")).toBe(true);
    expect(SF_TARGET_MAP.DESKTOP.some((d) => d.extension === "dmg")).toBe(true);
    expect(SF_TARGET_MAP.DESKTOP.some((d) => d.extension === "deb")).toBe(true);
    expect(SF_TARGET_MAP.MOBILE.some((d) => d.extension === "apk")).toBe(true);
    expect(SF_TARGET_MAP.MOBILE.some((d) => d.extension === "ipa")).toBe(true);
    expect(SF_TARGET_MAP.API.some((d) => d.format === "docker-image")).toBe(true);
    expect(SF_TARGET_MAP.CLI.some((d) => d.platform === "linux-amd64")).toBe(true);
  });
});

describe("SF — rollup (deterministic, honest)", () => {
  it("computes plan/target counts and studios covered", async () => {
    const { AppBuilderService, project } = await seedOrgA();
    await SoftwareFactoryService.createPlan(ORG_A, { projectId: project.id, studio: "product", deliverables: ["PRDs"], status: "completed" }, null);
    await SoftwareFactoryService.createPlan(ORG_A, { projectId: project.id, studio: "engineering", deliverables: ["Web Applications"] }, null);
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);
    for (let i = 0; i < 5; i++) await AppBuilderService.advanceRun(ORG_A, run.id, null);

    const r1 = await SoftwareFactoryService.rollup(ORG_A);
    const r2 = await SoftwareFactoryService.rollup(ORG_A);
    expect(r2!.counts).toEqual(r1!.counts); // deterministic counts

    expect(r1.counts.plans).toBe(2);
    expect(r1.counts.plansByStatus.completed).toBe(1);
    expect(r1.counts.plansByStatus.planned).toBe(1);
    expect(r1.counts.runsWithTargets).toBe(1);
    expect(r1.counts.targetsByStatus.built).toBeGreaterThan(0);
    expect(r1.studiosCovered).toBe(0); // only 2/5 studios completed
    expect(r1.recentPlans).toHaveLength(2);
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await SoftwareFactoryService.rollup(ORG_B);
    expect(r.counts.plans).toBe(0);
    expect(r.counts.runsWithTargets).toBe(0);
    expect(r.studiosCovered).toBe(0);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("SF — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read org A plans, coverage or targets", async () => {
    const { AppBuilderService, project } = await seedOrgA();
    const plan = await SoftwareFactoryService.createPlan(ORG_A, { projectId: project.id, studio: "product", deliverables: ["PRDs"] }, null);
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);

    expect(await SoftwareFactoryService.listPlans(ORG_B)).toHaveLength(0);
    expect(await SoftwareFactoryService.getPlan(ORG_B, plan.id)).toBeNull();
    expect(await SoftwareFactoryService.studioCoverage(ORG_B, project.id)).toBeNull();
    expect(await SoftwareFactoryService.compileTargets(ORG_B, run.id)).toBeNull();
    expect(await SoftwareFactoryService.updatePlan(ORG_B, plan.id, { status: "completed" }, null)).toBeNull();
    expect(await SoftwareFactoryService.deletePlan(ORG_B, plan.id)).toBe(false);
  });
});

describe("SF — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await SoftwareFactoryService.ensureDemoSeed()).toBe(true);
    const r = await SoftwareFactoryService.rollup("org-demo-sf");
    expect(r.counts.plans).toBe(5);
    expect(r.counts.runsWithTargets).toBe(2);
    expect(r.counts.targetsByStatus.built).toBeGreaterThan(0);
    expect(r.counts.targetsByStatus.pending).toBeGreaterThan(0);

    expect(await SoftwareFactoryService.ensureDemoSeed()).toBe(false);
    expect((await SoftwareFactoryService.rollup("org-demo-sf")).counts.plans).toBe(5);
  });
});

describe("SF — shared input contracts", () => {
  it("validates studio plan input", () => {
    expect(SfStudioPlanUpsertSchema.safeParse({ projectId: "p", studio: "product", deliverables: [] }).success).toBe(false);
    expect(SfStudioPlanUpsertSchema.safeParse({ projectId: "p", studio: "nope", deliverables: ["PRDs"] }).success).toBe(false);
    expect(SfStudioPlanUpsertSchema.safeParse({ projectId: "p", studio: "product", deliverables: ["PRDs"] }).success).toBe(true);
  });
});
