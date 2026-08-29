/**
 * Session 124 — AI Software Engineering Workforce tests.
 *
 * Drives the real services against FakeKv (Redis stand-in):
 *   - the role catalog (18 specialists + orchestrator);
 *   - the multi-repo workspace (add/list/update/remove, org isolation);
 *   - per-repo engineer assignments;
 *   - the orchestrator pipeline: queued → planning → implementing →
 *     testing → reviewing → pr_ready → done, with advisory-vs-executed step
 *     labels and real test execution when opted in with a localPath;
 *   - task→memory learning (a failed pipeline records a lesson);
 *   - opening a PR through the GitHub client adapter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { WorkforceService } = await import("./workforce.service.js");
const { EngineeringMemoryService } = await import("./memory.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

describe("role catalog", () => {
  it("lists the 18 specialist roles plus the orchestrator", () => {
    const roles = WorkforceService.roles();
    expect(roles).toHaveLength(19);
    const ids = roles.map((r) => r.id);
    for (const expected of [
      "product_manager", "business_analyst", "solution_architect", "system_architect",
      "backend_engineer", "frontend_engineer", "mobile_engineer", "database_engineer",
      "api_engineer", "ui_ux_designer", "devops_engineer", "security_engineer",
      "qa_engineer", "performance_engineer", "code_reviewer", "docs_engineer",
      "deployment_engineer", "monitoring_engineer", "orchestrator",
    ]) {
      expect(ids).toContain(expected);
    }
    const orch = roles.find((r) => r.id === "orchestrator")!;
    expect(orch.category).toBe("orchestration");
  });
});

describe("multi-repo workspace", () => {
  it("adds, lists, updates and removes repositories", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    expect(repo.id.startsWith("aewr-")).toBe(true);
    expect(repo.status).toBe("not_connected");
    expect(repo.team).toEqual({});

    const local = await WorkforceService.addRepo(ORG_A, { name: "acme/local", localPath: "/tmp/fixture", addedBy: "u1" });
    expect(local.status).toBe("ready");

    expect(await WorkforceService.listRepos(ORG_A)).toHaveLength(2);
    expect(await WorkforceService.listRepos(ORG_B)).toHaveLength(0);

    const updated = await WorkforceService.updateRepo(ORG_A, repo.id, { status: "connected", connectionId: "c1" });
    expect(updated!.connectionId).toBe("c1");

    expect(await WorkforceService.removeRepo(ORG_A, repo.id)).toBe(true);
    expect(await WorkforceService.removeRepo(ORG_A, repo.id)).toBe(false);
    expect(await WorkforceService.listRepos(ORG_A)).toHaveLength(1);
  });

  it("keeps repositories org-isolated", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    expect(await WorkforceService.getRepo(ORG_B, repo.id)).toBeNull();
  });
});

describe("engineer assignments", () => {
  it("assigns specialist roles to a repo team and rejects the orchestrator", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    const eng = await WorkforceService.assignEngineer(ORG_A, repo.id, "backend_engineer", "Backend-1", "u1");
    expect(eng.role).toBe("backend_engineer");
    await expect(WorkforceService.assignEngineer(ORG_A, repo.id, "orchestrator", "Orch", "u1"))
      .rejects.toThrow(/orchestrator/i);
    const repo2 = await WorkforceService.getRepo(ORG_A, repo.id);
    expect(repo2!.team.backend_engineer).toBe(eng.id);
    expect(await WorkforceService.listEngineers(ORG_A, repo.id)).toHaveLength(1);
    // Other org cannot see the assignment.
    expect(await WorkforceService.listEngineers(ORG_B, repo.id)).toHaveLength(0);
  });
});

describe("orchestrator pipeline", () => {
  it("walks queued → planning → implementing → testing → reviewing → pr_ready → done", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    const task = await WorkforceService.createTask(ORG_A, {
      repoId: repo.id,
      title: "Add a health endpoint",
      description: "Implement GET /healthz with a status payload and a unit test.",
      createdBy: "u1",
    });
    expect(task.status).toBe("queued");

    const done = await WorkforceService.runTask(ORG_A, task.id);
    expect(done.status).toBe("done");
    expect(done.plan).toBeTruthy();
    expect(done.plan!.steps.length).toBeGreaterThanOrEqual(4);
    expect(done.testResult!.executed).toBe(false); // no localPath → advisory
    const statuses = done.steps.map((s) => s.role);
    expect(statuses).toContain("orchestrator");
    expect(statuses).toContain("qa_engineer");
    expect(statuses).toContain("code_reviewer");
    expect(done.steps.every((s) => s.mode === "advisory" || s.mode === "executed")).toBe(true);
    expect(done.error).toBeNull();
  });

  it("executes the test suite for real when opted in with a localPath", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/local", localPath: "/tmp/ws", addedBy: "u1" });
    const task = await WorkforceService.createTask(ORG_A, { repoId: repo.id, title: "Fix bug", description: "Fix the flaky test.", createdBy: "u1" });
    const executor = vi.fn(async () => ({ code: 0, output: "ok (3 tests)" }));
    const done = await WorkforceService.runTask(ORG_A, task.id, { execute: true, executor });
    expect(executor).toHaveBeenCalled();
    expect(done.testResult!.executed).toBe(true);
    expect(done.testResult!.passed).toBe(1);
    expect(done.testResult!.detail).toContain("ok (3 tests)");
  });

  it("enters the fixing loop when tests fail, then completes", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/local", localPath: "/tmp/ws", addedBy: "u1" });
    const task = await WorkforceService.createTask(ORG_A, { repoId: repo.id, title: "Broken change", description: "Change with failing tests.", createdBy: "u1" });
    const executor = vi.fn(async () => ({ code: 1, output: "1 failed" }));
    const done = await WorkforceService.runTask(ORG_A, task.id, { execute: true, executor });
    expect(done.steps.some((s) => s.role === "code_reviewer" && /fix/i.test(s.output))).toBe(true);
    expect(done.status).toBe("done");
  });

  it("records a lesson in engineering memory when the pipeline fails", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    const task = await WorkforceService.createTask(ORG_A, { repoId: repo.id, title: "Doomed task", description: "Will fail.", createdBy: "u1" });
    // Force a failure by making the repo vanish mid-run (updateRepo on a
    // missing repo returns null, which the pipeline tolerates; instead force
    // via a task whose repo was removed before running).
    await WorkforceService.removeRepo(ORG_A, repo.id);
    const failed = await WorkforceService.runTask(ORG_A, task.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toBeTruthy();
    const learned = await EngineeringMemoryService.learnFromTask(ORG_A, failed, "orchestrator");
    expect(learned).toBeTruthy();
    expect(learned!.kind).toBe("lesson");
    expect(learned!.source).toBe("task");
    expect(learned!.tags).toContain("autonomous");
  });
});

describe("open PR for task", () => {
  it("opens a PR through the github adapter and marks the task pr_open", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    await WorkforceService.updateRepo(ORG_A, repo.id, { connectionId: "c1" });
    const task = await WorkforceService.createTask(ORG_A, { repoId: repo.id, title: "Feature X", description: "Build X.", createdBy: "u1" });
    const github = {
      openPr: vi.fn(async () => ({ number: 42, url: "https://github.com/acme/app/pull/42" })),
    };
    const opened = await WorkforceService.openPrForTask(ORG_A, task.id, github);
    expect(github.openPr).toHaveBeenCalledWith("acme/app", expect.objectContaining({ head: `ai-eng/${task.id}` }));
    expect(opened.status).toBe("pr_open");
    expect(opened.pr).toEqual({ number: 42, url: "https://github.com/acme/app/pull/42", state: "open" });
  });

  it("refuses to open a PR for a repo without a connection", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "acme/app", addedBy: "u1" });
    const task = await WorkforceService.createTask(ORG_A, { repoId: repo.id, title: "Feature X", description: "Build X.", createdBy: "u1" });
    await expect(
      WorkforceService.openPrForTask(ORG_A, task.id, { openPr: async () => ({ number: 1, url: "" }) }),
    ).rejects.toThrow(/no GitHub connection/i);
  });
});
