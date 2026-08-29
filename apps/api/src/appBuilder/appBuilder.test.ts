/**
 * Session 96 — AI Software Factory / Application Builder.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): project/task/run/artifact/approval CRUD, the honest
 * build state machine (SUCCEEDED only via the full chain; artifact finalized
 * with real SHA-256 / SBOM / byte size), immutable version-gated artifacts,
 * the Human Decision Inbox release gate, AI task generation labeling, rollup
 * determinism, cross-tenant isolation, demo-seed idempotency, and the shared
 * Zod input contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
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
// AI registry mocked to echo-demo empty content → generation is labeled
// echo-demo (honest fallback), exactly what the labeling test asserts.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: async () => ({
      content: "",
      usage: { tokensIn: 0, tokensOut: 0, costMicros: 0, model: "echo" },
      model: "echo",
      provider: "echo",
      durationMs: 1,
      modelSource: "echo-demo",
    }),
  },
}));

import { AppBuilderService, buildSbom } from "./appBuilder.service.js";
import {
  AbProjectUpsertSchema,
  AbTaskUpsertSchema,
  AbBuildCreateSchema,
  AbDecideSchema,
} from "@windels/shared/appBuilder";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function seedOrgA() {
  const project = await AppBuilderService.createProject(ORG_A, {
    name: "CRM Web", targetType: "WEB",
    techStack: { frontend: "react", backend: "express", db: "postgres" },
    systemPrompt: "Build a CRM web app.",
  }, "user-pm");
  const task = await AppBuilderService.createTask(ORG_A, project.id, {
    assignedAgent: "Frontend Engineer", title: "Build contact list", description: "React page.",
  }, null);
  return { project, task };
}

describe("AB — projects & tasks (org-scoped)", () => {
  it("creates projects with target type, stack and system prompt", async () => {
    const { project } = await seedOrgA();
    expect(project.id).toMatch(/^abp-/);
    expect(project.targetType).toBe("WEB");
    expect(project.techStack.frontend).toBe("react");
    expect(project.systemPrompt).toContain("CRM");
  });

  it("assigns tasks to personas with the correct functional cluster", async () => {
    const { task } = await seedOrgA();
    expect(task.assignedAgent).toBe("Frontend Engineer");
    expect(task.group).toBe("Engineer");
    expect(task.isCompleted).toBe(false);
  });

  it("completing a task stamps completedAt; un-completing clears it", async () => {
    const { task } = await seedOrgA();
    const done = await AppBuilderService.updateTask(ORG_A, task.id, { isCompleted: true }, null);
    expect(done?.isCompleted).toBe(true);
    expect(done?.completedAt).toBeTruthy();
    const undone = await AppBuilderService.updateTask(ORG_A, task.id, { isCompleted: false }, null);
    expect(undone?.completedAt).toBeNull();
  });

  it("AI task generation is labeled echo-demo without a real provider", async () => {
    const { task } = await seedOrgA();
    const res = await AppBuilderService.generateTaskCode(ORG_A, task.id, null);
    expect(res?.modelSource).toBe("echo-demo");
    expect(res?.task.generationSource).toBe("echo-demo");
  });
});

describe("AB — SBOM (real, deterministic)", () => {
  it("maps declared stack entries to pinned versions or labels unpinned", () => {
    const sbom = buildSbom({ frontend: "react", backend: "express", db: "postgres", ai: "ollama" });
    const react = sbom.find((s) => s.name === "react");
    const ollama = sbom.find((s) => s.name === "ollama");
    expect(react?.version).toBe("18.3.1");
    expect(react?.declared).toBe(true);
    expect(ollama?.version).toBe("declared (unpinned)");
    expect(ollama?.declared).toBe(false);
    expect(buildSbom({ frontend: "react" })).toEqual(buildSbom({ frontend: "react" })); // deterministic
  });
});

describe("AB — build state machine (honest)", () => {
  it("advances through the full chain; SUCCEEDED finalizes a real artifact", async () => {
    const { project } = await seedOrgA();
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, "user-pm");
    expect(run.status).toBe("QUEUED");
    expect(run.artifactId).toBeNull();

    let cur = run;
    for (const expected of ["GENERATING_CODE", "TESTING", "COMPILING", "SIGNING", "SUCCEEDED"] as const) {
      cur = (await AppBuilderService.advanceRun(ORG_A, cur.id, "user-pm"))!;
      expect(cur.status).toBe(expected);
    }
    expect(cur.finalizedAt).toBeTruthy();
    expect(cur.artifactId).toBeTruthy();

    const artifact = (await AppBuilderService.getArtifact(ORG_A, cur.artifactId!))!;
    expect(artifact.version).toBe("v1.0.0");
    expect(artifact.published).toBe(false);
    expect(artifact.sizeBytes).toBe(Buffer.byteLength(artifact.manifestJson, "utf8"));
    // Real SHA-256: recompute and compare.
    const { createHash } = await import("node:crypto");
    expect(artifact.sha256).toBe(createHash("sha256").update(artifact.manifestJson).digest("hex"));
    // SBOM derived from the project stack.
    expect(artifact.sbom.find((s) => s.name === "react")?.version).toBe("18.3.1");
  });

  it("rejects duplicate versions; retry only from FAILED", async () => {
    const { project } = await seedOrgA();
    await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);
    await expect(AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null))
      .rejects.toThrow("VERSION_EXISTS");

    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.1.0" }, null);
    await expect(AppBuilderService.retryRun(ORG_A, run.id, null)).rejects.toThrow("NOT_FAILED");
    await AppBuilderService.failRun(ORG_A, run.id, null, "compile error");
    const retried = await AppBuilderService.retryRun(ORG_A, run.id, null);
    expect(retried?.status).toBe("QUEUED");
    expect(retried?.version).toBe("v1.1.0");
  });
});

describe("AB — Human Decision Inbox (release gate)", () => {
  it("release requires an approved approval; never automatic", async () => {
    const { project } = await seedOrgA();
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);
    let cur = run;
    for (let i = 0; i < 5; i++) cur = (await AppBuilderService.advanceRun(ORG_A, cur.id, null))!;
    const artifact = (await AppBuilderService.getArtifact(ORG_A, cur.artifactId!))!;

    // Release without approval → blocked.
    await expect(AppBuilderService.releaseArtifact(ORG_A, artifact.id, null)).rejects.toThrow("RELEASE_NOT_APPROVED");

    const approval = await AppBuilderService.requestRelease(ORG_A, artifact.id, "user-pm");
    expect(approval?.status).toBe("pending");

    // Decide deny → still blocked.
    await AppBuilderService.decideApproval(ORG_A, approval!.id, { approved: false, decidedBy: "admin" });
    await expect(AppBuilderService.releaseArtifact(ORG_A, artifact.id, null)).rejects.toThrow("RELEASE_NOT_APPROVED");

    // Decide approve → release succeeds, stamps releasedAt.
    const approval2 = await AppBuilderService.requestRelease(ORG_A, artifact.id, "user-pm");
    await AppBuilderService.decideApproval(ORG_A, approval2!.id, { approved: true, decidedBy: "admin", note: "ship it" });
    const released = await AppBuilderService.releaseArtifact(ORG_A, artifact.id, null);
    expect(released?.published).toBe(true);
    expect(released?.releasedAt).toBeTruthy();
  });
});

describe("AB — rollup (deterministic, honest)", () => {
  it("computes counts, runs-by-status and avg build time from real timestamps", async () => {
    const { project } = await seedOrgA();
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);
    let cur = run;
    for (let i = 0; i < 5; i++) cur = (await AppBuilderService.advanceRun(ORG_A, cur.id, null))!;
    await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.1.0" }, null); // stays QUEUED
    await AppBuilderService.createTask(ORG_A, project.id, { assignedAgent: "QA Engineer", title: "Tests" }, null);

    const r1 = await AppBuilderService.rollup(ORG_A);
    const r2 = await AppBuilderService.rollup(ORG_A);
    expect(r2).toEqual(r1); // deterministic

    expect(r1.counts.projects).toBe(1);
    expect(r1.counts.tasks).toBe(2);
    expect(r1.counts.tasksCompleted).toBe(0);
    expect(r1.counts.runs).toBe(2);
    expect(r1.counts.runsByStatus.SUCCEEDED).toBe(1);
    expect(r1.counts.runsByStatus.QUEUED).toBe(1);
    expect(r1.counts.artifacts).toBe(1);
    expect(r1.counts.pendingApprovals).toBe(0);
    expect(r1.avgBuildTimeMs).not.toBeNull();
    expect(r1.latestArtifacts).toHaveLength(1);
    expect(r1.recentRuns).toHaveLength(2);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await AppBuilderService.rollup(ORG_B);
    expect(r.counts.projects).toBe(0);
    expect(r.counts.runs).toBe(0);
    expect(r.counts.artifacts).toBe(0);
    expect(r.avgBuildTimeMs).toBeNull();
    expect(r.latestArtifacts).toEqual([]);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("AB — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read or write org A projects, tasks, runs or artifacts", async () => {
    const { project, task } = await seedOrgA();
    const run = await AppBuilderService.createRun(ORG_A, project.id, { version: "v1.0.0" }, null);

    expect(await AppBuilderService.listProjects(ORG_B)).toHaveLength(0);
    expect(await AppBuilderService.getProject(ORG_B, project.id)).toBeNull();
    expect(await AppBuilderService.getTask(ORG_B, task.id)).toBeNull();
    expect(await AppBuilderService.getRun(ORG_B, run.id)).toBeNull();
    expect(await AppBuilderService.createTask(ORG_B, project.id, { assignedAgent: "PM", title: "x" }, null)).toBeNull();
    expect(await AppBuilderService.advanceRun(ORG_B, run.id, null)).toBeNull();
    expect(await AppBuilderService.rollup(ORG_B).then((r) => r.counts.projects)).toBe(0);

    // Org A data intact.
    expect((await AppBuilderService.getProject(ORG_A, project.id))?.name).toBe("CRM Web");
  });
});

describe("AB — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await AppBuilderService.ensureDemoSeed()).toBe(true);
    const r = await AppBuilderService.rollup("org-demo-ab");
    expect(r.counts.projects).toBe(2);
    expect(r.counts.tasks).toBe(5);
    expect(r.counts.runs).toBe(2);
    expect(r.counts.runsByStatus.SUCCEEDED).toBe(1);
    expect(r.counts.artifacts).toBe(1);
    expect(r.counts.pendingApprovals).toBe(1);

    expect(await AppBuilderService.ensureDemoSeed()).toBe(false);
    expect((await AppBuilderService.rollup("org-demo-ab")).counts.projects).toBe(2);
  });
});

describe("AB — shared input contracts", () => {
  it("validates project input", () => {
    expect(AbProjectUpsertSchema.safeParse({ name: "", systemPrompt: "x" }).success).toBe(false);
    expect(AbProjectUpsertSchema.safeParse({ name: "A", systemPrompt: "x", targetType: "NOPE" }).success).toBe(false);
    expect(AbProjectUpsertSchema.safeParse({ name: "A", systemPrompt: "x" }).success).toBe(true);
  });

  it("validates task input (agent from the 17-persona catalog)", () => {
    expect(AbTaskUpsertSchema.safeParse({ assignedAgent: "Nope", title: "x" }).success).toBe(false);
    expect(AbTaskUpsertSchema.safeParse({ assignedAgent: "PM", title: "x" }).success).toBe(true);
  });

  it("validates build version and decision input", () => {
    expect(AbBuildCreateSchema.safeParse({ version: "1.0.0" }).success).toBe(false);
    expect(AbBuildCreateSchema.safeParse({ version: "v1.0.0" }).success).toBe(true);
    expect(AbDecideSchema.safeParse({ approved: true, decidedBy: "" }).success).toBe(false);
    expect(AbDecideSchema.safeParse({ approved: true, decidedBy: "admin" }).success).toBe(true);
  });
});
