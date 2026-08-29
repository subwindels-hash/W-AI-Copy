/**
 * Session 200 — deeper App Builder guard-rail coverage.
 *
 * The Session-93 suite covers the build chain, retry/fail, the release-gate
 * deny+approve path and the rollup. This suite hardens the guard rails and the
 * task surfaces left unverified:
 *   - requestRelease refuses a second pending approval (APPROVAL_PENDING)
 *   - decideApproval refuses to re-decide (ALREADY_DECIDED)
 *   - releaseArtifact is idempotent once published
 *   - advanceRun / failRun are no-ops on a terminal run
 *   - task completion filter + isCompleted toggle stamping/clearing
 *   - generateTaskCode is honestly labeled echo-demo when no real provider
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | string>();
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
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: async () => ({
      content: "", usage: { tokensIn: 0, tokensOut: 0, costMicros: 0, model: "echo" },
      model: "echo", provider: "echo", durationMs: 1, modelSource: "echo-demo",
    }),
  },
}));

import { AppBuilderService as AB } from "./appBuilder.service.js";

const ORG = "org-guards";
beforeEach(() => { fake.store.clear(); });

async function project() {
  return AB.createProject(ORG, {
    name: "App", targetType: "WEB",
    techStack: { frontend: "react", backend: "express", db: "postgres" },
    systemPrompt: "Build it.",
  }, "pm");
}
async function succeededArtifact() {
  const p = await project();
  let run = await AB.createRun(ORG, p.id, { version: "v1.0.0" }, null);
  for (let i = 0; i < 5; i++) run = (await AB.advanceRun(ORG, run.id, null))!;
  return { project: p, run, artifact: (await AB.getArtifact(ORG, run.artifactId!))! };
}

describe("release-gate guards", () => {
  it("refuses a second pending approval for the same artifact", async () => {
    const { artifact } = await succeededArtifact();
    await AB.requestRelease(ORG, artifact.id, "pm");
    await expect(AB.requestRelease(ORG, artifact.id, "pm")).rejects.toThrow("APPROVAL_PENDING");
  });

  it("refuses to re-decide an already-decided approval", async () => {
    const { artifact } = await succeededArtifact();
    const appr = await AB.requestRelease(ORG, artifact.id, "pm");
    await AB.decideApproval(ORG, appr!.id, { approved: true, decidedBy: "admin" });
    await expect(AB.decideApproval(ORG, appr!.id, { approved: false, decidedBy: "admin" }))
      .rejects.toThrow("ALREADY_DECIDED");
  });

  it("is idempotent once the artifact is published", async () => {
    const { artifact } = await succeededArtifact();
    const appr = await AB.requestRelease(ORG, artifact.id, "pm");
    await AB.decideApproval(ORG, appr!.id, { approved: true, decidedBy: "admin" });
    const first = await AB.releaseArtifact(ORG, artifact.id, null);
    expect(first?.published).toBe(true);
    const releasedAt = first!.releasedAt;
    const second = await AB.releaseArtifact(ORG, artifact.id, null);
    expect(second?.published).toBe(true);
    expect(second?.releasedAt).toBe(releasedAt); // unchanged — no re-stamp
  });

  it("requestRelease returns null for an unknown artifact", async () => {
    expect(await AB.requestRelease(ORG, "nope", "pm")).toBeNull();
  });
});

describe("build run terminal guards", () => {
  it("advanceRun is a no-op on a SUCCEEDED run", async () => {
    const { run } = await succeededArtifact();
    const again = await AB.advanceRun(ORG, run.id, null);
    expect(again?.status).toBe("SUCCEEDED");
  });

  it("failRun is a no-op on a terminal (SUCCEEDED) run", async () => {
    const { run } = await succeededArtifact();
    const failed = await AB.failRun(ORG, run.id, null, "too late");
    expect(failed?.status).toBe("SUCCEEDED"); // not overwritten
    expect(failed?.errorLog).toEqual([]);
  });

  it("advanceRun/failRun return null for an unknown run", async () => {
    expect(await AB.advanceRun(ORG, "nope", null)).toBeNull();
    expect(await AB.failRun(ORG, "nope", null, "x")).toBeNull();
  });
});

describe("tasks", () => {
  it("filters by completion and toggles completedAt on/off", async () => {
    const p = await project();
    const t = await AB.createTask(ORG, p.id, { assignedAgent: "Frontend Engineer", title: "UI" }, null);
    expect(t!.isCompleted).toBe(false);
    expect(t!.completedAt).toBeNull();

    const done = await AB.updateTask(ORG, t!.id, { isCompleted: true }, null);
    expect(done!.isCompleted).toBe(true);
    expect(done!.completedAt).toBeTruthy();

    expect((await AB.listTasks(ORG, { completed: true })).map((x) => x.id)).toContain(t!.id);
    expect((await AB.listTasks(ORG, { completed: false })).map((x) => x.id)).not.toContain(t!.id);

    const reopened = await AB.updateTask(ORG, t!.id, { isCompleted: false }, null);
    expect(reopened!.completedAt).toBeNull();
  });

  it("createTask returns null for an unknown project", async () => {
    expect(await AB.createTask(ORG, "nope", { assignedAgent: "QA Engineer", title: "x" }, null)).toBeNull();
  });

  it("generateTaskCode is honestly labeled echo-demo without a real provider", async () => {
    const p = await project();
    const t = await AB.createTask(ORG, p.id, { assignedAgent: "Backend Engineer", title: "API" }, null);
    const res = await AB.generateTaskCode(ORG, t!.id, null);
    expect(res?.modelSource).toBe("echo-demo");
    // empty content from the demo provider → outputCode stays null (no fake code)
    expect(res?.task.outputCode).toBeNull();
  });

  it("generateTaskCode returns null for an unknown task", async () => {
    expect(await AB.generateTaskCode(ORG, "nope", null)).toBeNull();
  });
});
