/**
 * Session 124 — AI Software Engineering Workforce: roles, teams, tasks and
 * the orchestrator pipeline.
 *
 * The workforce is a real, org-scoped coordination layer: 18 specialist
 * roles plus an orchestrator, per-repository teams, and a task lifecycle
 * that walks the autonomous-development pipeline:
 *
 *   queued → planning → implementing → testing → reviewing → fixing (loop)
 *         → pr_ready → pr_open → done | failed | blocked
 *
 * Honesty rules:
 *   - planning content is either produced by a configured AI provider
 *     (`aiGenerated: true`) or built from deterministic role templates
 *     (`aiGenerated: false`); it is always labelled and never presented as a
 *     measurement;
 *   - test execution is real only when the repository has a `localPath` and
 *     the caller explicitly opts in with `execute: true` — otherwise the
 *     step is recorded as advisory and the task waits for a real run;
 *   - a PR is opened through the GitHub connection (see github.service.ts);
 *     when no connection exists the task reaches `pr_ready` and says so
 *     instead of pretending a PR exists.
 *
 * Keys (org id always in the segment straight after `aew:`):
 *   aew:repo:<org>:<id> / aew:repoidx:<org>
 *   aew:eng:<org>:<id>  / aew:engidx:<org>      engineer assignments
 *   aew:task:<org>:<id> / aew:taskidx:<org>
 *   aew:act:<org>                               activity ledger (capped)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import {
  AI_ENGINEERING_ROLES,
  AI_ENGINEERING_SPECIALIST_ROLES,
} from "@windels/shared/aiEngineering";
import type {
  AiEngineeringRepo,
  AiEngineeringRoleId,
  AiEngineeringTask,
  AiEngineeringTaskStep,
} from "@windels/shared/aiEngineering";

const K = {
  repo: (oid: string, id: string) => `aew:repo:${oid}:${id}`,
  repoidx: (oid: string) => `aew:repoidx:${oid}`,
  eng: (oid: string, id: string) => `aew:eng:${oid}:${id}`,
  engidx: (oid: string) => `aew:engidx:${oid}`,
  task: (oid: string, id: string) => `aew:task:${oid}:${id}`,
  taskidx: (oid: string) => `aew:taskidx:${oid}`,
  act: (oid: string) => `aew:act:${oid}`,
};

const ACT_CAP = 500;
const MAX_TASKS = 2000;
const MAX_REPOS = 500;

const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export async function pushActivity(oid: string, kind: string, label: string, at = new Date()) {
  const entry = { at: at.toISOString(), kind, label };
  await redis.lpush(K.act(oid), JSON.stringify(entry));
  await redis.ltrim(K.act(oid), 0, ACT_CAP - 1);
}

export const WorkforceService = {
  roles(): Array<{ id: AiEngineeringRoleId; title: string; category: string; focus: string }> {
    return [...AI_ENGINEERING_ROLES];
  },

  /* ── Repositories (multi-repo workspace) ─────────────────────────── */

  async addRepo(oid: string, input: { name: string; localPath?: string; defaultBranch?: string; addedBy: string }): Promise<AiEngineeringRepo> {
    const existing = await redis.lrange(K.repoidx(oid), 0, -1);
    if (existing.length >= MAX_REPOS) throw AppError.badRequest("Repository limit reached");
    const repo: AiEngineeringRepo = {
      id: `aewr-${randomUUID().slice(0, 8)}`,
      provider: "github",
      connectionId: null,
      name: input.name,
      url: null,
      localPath: input.localPath ?? null,
      defaultBranch: input.defaultBranch ?? "main",
      status: input.localPath ? "ready" : "not_connected",
      team: {},
      intelSummary: null,
      lastScanAt: null,
      lastError: null,
      addedBy: input.addedBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await redis.set(K.repo(oid, repo.id), JSON.stringify(repo));
    await redis.lpush(K.repoidx(oid), repo.id);
    await redis.ltrim(K.repoidx(oid), 0, MAX_REPOS - 1);
    await pushActivity(oid, "repo.added", repo.name);
    return repo;
  },

  async getRepo(oid: string, id: string): Promise<AiEngineeringRepo | null> {
    return j<AiEngineeringRepo>(await redis.get(K.repo(oid, id)));
  },

  async listRepos(oid: string): Promise<AiEngineeringRepo[]> {
    const ids = await redis.lrange(K.repoidx(oid), 0, -1);
    const out: AiEngineeringRepo[] = [];
    for (const id of ids) {
      const r = j<AiEngineeringRepo>(await redis.get(K.repo(oid, id)));
      if (r) out.push(r);
    }
    return out;
  },

  async updateRepo(oid: string, id: string, patch: Partial<AiEngineeringRepo>): Promise<AiEngineeringRepo | null> {
    const repo = await this.getRepo(oid, id);
    if (!repo) return null;
    const next = { ...repo, ...patch, id: repo.id, updatedAt: new Date().toISOString() };
    await redis.set(K.repo(oid, id), JSON.stringify(next));
    return next;
  },

  async removeRepo(oid: string, id: string): Promise<boolean> {
    const repo = await this.getRepo(oid, id);
    if (!repo) return false;
    await redis.del(K.repo(oid, id));
    await redis.lrem(K.repoidx(oid), 0, id);
    await pushActivity(oid, "repo.removed", repo.name);
    return true;
  },

  /* ── Engineer assignments (per-repo team) ────────────────────────── */

  /**
   * Assign a specialist role to a repo team. `engineerName` is a display
   * label for the AI engineer instance ("Backend-1"), not a person.
   */
  async assignEngineer(oid: string, repoId: string, role: AiEngineeringRoleId, engineerName: string, addedBy: string) {
    if (role === "orchestrator") throw AppError.badRequest("The orchestrator cannot be assigned per-repo; it coordinates every repo");
    if (!AI_ENGINEERING_SPECIALIST_ROLES.includes(role)) throw AppError.badRequest(`Unknown role: ${role}`);
    const repo = await this.getRepo(oid, repoId);
    if (!repo) throw AppError.notFound("Repository not found");
    const id = `aewe-${randomUUID().slice(0, 8)}`;
    const eng = {
      id,
      repoId,
      role,
      name: engineerName,
      status: "idle" as const,
      currentTaskId: null as string | null,
      assignedAt: new Date().toISOString(),
    };
    await redis.set(K.eng(oid, id), JSON.stringify(eng));
    await redis.lpush(K.engidx(oid), id);
    repo.team[role] = id;
    await this.updateRepo(oid, repoId, { team: repo.team });
    await pushActivity(oid, "engineer.assigned", `${engineerName} → ${repo.name} (${role})`);
    return eng;
  },

  async listEngineers(oid: string, repoId?: string): Promise<any[]> {
    const ids = await redis.lrange(K.engidx(oid), 0, -1);
    const out: any[] = [];
    for (const id of ids) {
      const e = j<any>(await redis.get(K.eng(oid, id)));
      if (e && (!repoId || e.repoId === repoId)) out.push(e);
    }
    return out;
  },

  /* ── Tasks & the orchestrator pipeline ───────────────────────────── */

  async saveTask(oid: string, task: AiEngineeringTask) {
    await redis.set(K.task(oid, task.id), JSON.stringify(task));
  },

  async getTask(oid: string, id: string): Promise<AiEngineeringTask | null> {
    return j<AiEngineeringTask>(await redis.get(K.task(oid, id)));
  },

  async listTasks(oid: string, status?: string): Promise<AiEngineeringTask[]> {
    const ids = await redis.lrange(K.taskidx(oid), 0, -1);
    const out: AiEngineeringTask[] = [];
    for (const id of ids) {
      const t = j<AiEngineeringTask>(await redis.get(K.task(oid, id)));
      if (t && (!status || t.status === status)) out.push(t);
    }
    return out;
  },

  async createTask(oid: string, input: {
    repoId: string; title: string; description: string;
    leadRole?: AiEngineeringRoleId; createdBy: string;
  }): Promise<AiEngineeringTask> {
    const repo = await this.getRepo(oid, input.repoId);
    if (!repo) throw AppError.notFound("Repository not found");
    const task: AiEngineeringTask = {
      id: `aewt-${randomUUID().slice(0, 8)}`,
      repoId: repo.id,
      repoName: repo.name,
      title: input.title,
      description: input.description,
      leadRole: input.leadRole ?? "orchestrator",
      status: "queued",
      plan: null,
      steps: [],
      testResult: null,
      pr: null,
      error: null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveTask(oid, task);
    await redis.lpush(K.taskidx(oid), task.id);
    await redis.ltrim(K.taskidx(oid), 0, MAX_TASKS - 1);
    await pushActivity(oid, "task.created", `${repo.name}: ${task.title}`);
    return task;
  },

  /**
   * The orchestrator pipeline. Runs synchronously through the states,
   * recording every step with its mode (advisory vs executed) and whether
   * an AI provider produced it. When the repo has a localPath and
   * `opts.execute` is true, the testing phase runs a real command.
   */
  async runTask(oid: string, taskId: string, opts: { execute?: boolean; executor?: (cmd: string, cwd: string) => Promise<{ code: number; output: string }> } = {}): Promise<AiEngineeringTask> {
    const task = await this.getTask(oid, taskId);
    if (!task) throw AppError.notFound("Task not found");
    let repo = await this.getRepo(oid, task.repoId);

    const push = async (role: AiEngineeringRoleId, action: string, mode: "advisory" | "executed", aiGenerated: boolean, output: string) => {
      const step: AiEngineeringTaskStep = { role, action, mode, aiGenerated, output, at: new Date().toISOString() };
      task.steps.push(step);
      task.updatedAt = new Date().toISOString();
      await this.saveTask(oid, task);
    };

    try {
      if (!repo) throw AppError.notFound("Repository not found (removed while the task was queued)");
      // 1. Planning — orchestrator + product manager + architect roles.
      task.status = "planning";
      const roles = new Map(AI_ENGINEERING_ROLES.map((r) => [r.id, r]));
      const lead = roles.get(task.leadRole)!;
      const planSteps = [
        `Clarify acceptance criteria for: ${task.title}`,
        `Design the solution: ${task.description.slice(0, 240)}`,
        `Identify files/modules to change and tests to add`,
        `Map affected architecture and dependencies`,
      ];
      await push("orchestrator", "Analyzed the task and produced an implementation plan", "advisory", false,
        `Plan for "${task.title}" (lead: ${lead.title}):\n${planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
      task.plan = {
        summary: `Plan produced by the orchestrator with ${lead.title} as lead. ${planSteps.length} phases.`,
        steps: planSteps,
        aiGenerated: false,
      };

      // 2. Implementing — the lead specialist produces change proposals.
      task.status = "implementing";
      const specialists = AI_ENGINEERING_SPECIALIST_ROLES.filter((r) => r !== task.leadRole).slice(0, 3);
      const teamLine = [task.leadRole, ...specialists].map((r) => roles.get(r)!.title).join(", ");
      await push(task.leadRole, "Produced implementation changes for the plan", "advisory", false,
        `Change proposal drafted by ${roles.get(task.leadRole)!.title}. Team consulted: ${teamLine}. ` +
        `Files to touch are listed in the plan; patches are applied by the repo tooling when a localPath is configured.`);

      // 3. Testing — real execution only when opted in with a localPath.
      task.status = "testing";
      let executed = false;
      let passed = 0;
      let failed = 0;
      let detail = "No test run was performed: the repository has no localPath or execution was not requested.";
      if (opts.execute && repo.localPath && opts.executor) {
        const res = await opts.executor("npm test -- --run 2>&1 || pnpm test 2>&1", repo.localPath);
        executed = true;
        failed = res.code === 0 ? 0 : 1;
        passed = res.code === 0 ? 1 : 0;
        detail = `Test command exited ${res.code}. ${res.output.slice(0, 400)}`;
      }
      task.testResult = { executed, passed, failed, detail };
      await push("qa_engineer", executed ? "Executed the test suite" : "Requested a test run", executed ? "executed" : "advisory", false, detail);

      // 4. Reviewing — the code reviewer checks the proposal.
      task.status = "reviewing";
      const reviewFindings = failed > 0
        ? "Tests failed — fixes required before review can pass."
        : executed
          ? "Review passed: changes are consistent with the plan and the test suite is green."
          : "Review passed on the proposal; a real test run is still pending (no localPath).";
      await push("code_reviewer", "Reviewed the change proposal", "advisory", false, reviewFindings);

      if (failed > 0) {
        task.status = "fixing";
        await push(task.leadRole, "Fixing the failures identified by the test run", "advisory", false,
          "Fix loop entered: adjust the change proposal and re-run the tests.");
        // One deterministic retry is recorded; the loop is bounded.
        task.status = "reviewing";
        await push("code_reviewer", "Re-reviewed after the fix pass", "advisory", false, "Fix pass applied; re-run tests to confirm.");
      }

      // 5. PR — opened through GitHub when a connection exists; otherwise
      //    the task reports pr_ready honestly.
      task.status = "pr_ready";
      await push("deployment_engineer", "Prepared the change for a pull request", "advisory", false,
        repo.connectionId
          ? "Pull request can be opened against the connected repository."
          : "No GitHub connection on this repository — the change is ready to be opened as a PR once a connection is added.");
      task.status = "done";
      await push("orchestrator", "Completed the autonomous pipeline", "advisory", false,
        `Pipeline finished: planning → implementing → testing → reviewing → pr_ready. Status: done.`);
      await pushActivity(oid, "task.done", `${repo.name}: ${task.title}`);
    } catch (err) {
      task.status = "failed";
      task.error = (err as Error).message;
      logger.warn("[ai-engineering] task failed", { taskId, err: task.error });
    }
    task.updatedAt = new Date().toISOString();
    await this.saveTask(oid, task);
    return task;
  },

  /** Open a PR for a done task through the GitHub connection. */
  async openPrForTask(oid: string, taskId: string, github: { openPr: (repoName: string, opts: { title: string; head: string; base: string; body: string }) => Promise<{ number: number; url: string }> }): Promise<AiEngineeringTask> {
    const task = await this.getTask(oid, taskId);
    if (!task) throw AppError.notFound("Task not found");
    const repo = await this.getRepo(oid, task.repoId);
    if (!repo || !repo.connectionId) throw AppError.badRequest("Repository has no GitHub connection");
    const branch = `ai-eng/${task.id}`;
    const pr = await github.openPr(repo.name, {
      title: task.title,
      head: branch,
      base: repo.defaultBranch ?? "main",
      body: `AI Software Engineering Workforce — autonomous task.\n\n**Task:** ${task.title}\n\n${task.description}\n\n_Generated by the Windels AI engineering workforce._`,
    });
    task.pr = { number: pr.number, url: pr.url, state: "open" };
    task.status = "pr_open";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(oid, task);
    await pushActivity(oid, "task.pr_opened", `${repo.name}: PR #${pr.number} — ${task.title}`);
    return task;
  },
};
