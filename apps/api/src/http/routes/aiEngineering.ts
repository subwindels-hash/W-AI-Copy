/**
 * Session 124 — AI Software Engineering Workforce.
 *
 * Mounted at `/api/v1/ai-engineering` (additive; the Session 26
 * `/api/v1/engineering` observability module is untouched). The department
 * surface:
 *
 *   Workforce   GET  /roles                     role catalog (18 + orchestrator)
 *               POST /repos                     add a repository to the workspace
 *               GET  /repos | /repos/:id        list / detail
 *               PATCH /repos/:id/team           per-repo team assignments
 *               DELETE /repos/:id               remove from workspace
 *               POST /repos/:id/scan            scan local path → knowledge graph
 *               GET  /repos/:id/intel           knowledge-graph nodes
 *               GET/POST /tasks                 task list / create
 *               GET  /tasks/:id                 task detail
 *               POST /tasks/:id/run             orchestrator pipeline
 *               POST /tasks/:id/pr              open a PR for a done task
 *               GET/POST /memory, DELETE /memory/:id
 *               GET  /command-center            rollup (local + GitHub halves)
 *
 *   GitHub      POST /connections               connect an account (token verified)
 *               GET  /connections | DELETE /connections/:id
 *               GET  /github/:connId/repos      list remote repositories
 *               POST /github/:connId/repos      create a repository
 *               GET  /repos/:id/github/branches | POST (create branch)
 *               POST /repos/:id/github/commits  commit files to a branch
 *               GET/POST /repos/:id/github/pulls
 *               POST /repos/:id/github/pulls/:n/merge | /review
 *               PATCH /repos/:id/github/pulls/:n    (close)
 *               GET/POST /repos/:id/github/issues; PATCH /issues/:n
 *               GET/POST /repos/:id/github/milestones
 *               GET/POST /repos/:id/github/releases; POST .../generate-notes
 *               GET  /repos/:id/github/workflows
 *               POST /repos/:id/github/workflows/:workflow/dispatch
 *               GET  /repos/:id/github/runs
 *               GET  /repos/:id/github/checks?ref=
 *
 * Every handler is org-scoped through the session and refuses a
 * no-organization session with 403. GitHub capabilities answer an honest
 * "no connection" error when the repository has none.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { WorkforceService } from "../../aiEngineering/workforce.service.js";
import { GithubService } from "../../aiEngineering/github.service.js";
import { RepoIntelService } from "../../aiEngineering/repoIntel.service.js";
import { EngineeringMemoryService } from "../../aiEngineering/memory.service.js";
import { CommandCenterService } from "../../aiEngineering/commandCenter.service.js";
import {
  AewAddRepoSchema,
  AewConnectSchema,
  AewIntelQuerySchema,
  AewListQuerySchema,
  AewMemoryCreateSchema,
  AewMemoryQuerySchema,
  AewTaskCreateSchema,
} from "@windels/shared/aiEngineering";

const IdParam = z.object({ id: z.string().min(1).max(64) });
const ConnParam = z.object({ connId: z.string().min(1).max(64) });
const TaskParam = z.object({ id: z.string().min(1).max(64) });
const PrNumberParam = z.object({ id: z.string().min(1).max(64), number: z.coerce.number().int().min(1) });

const BranchBody = z.object({ name: z.string().min(1).max(100), fromSha: z.string().max(64).optional() });
const CommitBody = z.object({
  branch: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  files: z.array(z.object({ path: z.string().min(1).max(300), content: z.string().max(500_000) })).min(1).max(100),
});
const CreateRepoBody = z.object({ name: z.string().min(1).max(100), description: z.string().max(300).optional(), private: z.boolean().optional() });
const PrBody = z.object({ title: z.string().min(1).max(200), head: z.string().min(1).max(100), base: z.string().min(1).max(100), body: z.string().max(20_000).optional() });
const ReviewBody = z.object({ event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]), body: z.string().max(10_000).optional() });
const IssueBody = z.object({ title: z.string().min(1).max(200), body: z.string().max(20_000).optional(), labels: z.array(z.string().max(40)).max(20).optional() });
const IssuePatchBody = z.object({ state: z.enum(["open", "closed"]).optional(), title: z.string().max(200).optional(), body: z.string().max(20_000).optional() });
const MilestoneBody = z.object({ title: z.string().min(1).max(100), dueOn: z.string().max(40).optional() });
const ReleaseBody = z.object({ tagName: z.string().min(1).max(100), name: z.string().max(200).optional(), body: z.string().max(50_000).optional(), draft: z.boolean().optional(), prerelease: z.boolean().optional() });
const ReleaseNotesBody = z.object({ tagName: z.string().min(1).max(100), targetCommitish: z.string().max(100).optional(), previousTagName: z.string().max(100).optional() });
const DispatchBody = z.object({ ref: z.string().min(1).max(100), inputs: z.record(z.string()).optional() });
const CheckQuery = z.object({ ref: z.string().min(1).max(100) });
const TeamBody = z.object({ assignments: z.record(z.string().max(64)).optional() });
const ScanBody = z.object({ path: z.string().min(1).max(500) });
const RunBody = z.object({ execute: z.boolean().optional() });

export function registerAiEngineeringRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) throw AppError.forbidden("The AI engineering workforce is organization-scoped and this session carries no organization.");
    return org;
  };
  const userOf = (req: any): string => req.user!.id;
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Workforce ──────────────────────────────────────────────────── */

  router.get("/roles", async (req, res, next) => {
    try { res.json({ ok: true, data: WorkforceService.roles(), meta: meta(req) }); } catch (e) { next(e); }
  });

  router.post("/repos", validate({ body: AewAddRepoSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.addRepo(oid, { ...req.body, addedBy: userOf(req) });
      // Attach a connection if one was given and exists.
      if (req.body.connectionId) {
        const conn = await GithubService.get(oid, req.body.connectionId as string);
        if (conn) {
          await WorkforceService.updateRepo(oid, repo.id, {
            connectionId: conn.id,
            url: `https://github.com/${req.body.name}`,
            status: "connected",
          });
        }
      }
      res.status(201).json({ ok: true, data: await WorkforceService.getRepo(oid, repo.id), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/repos", validate({ query: AewListQuerySchema }), async (req, res, next) => {
    try {
      const repos = await WorkforceService.listRepos(orgOf(req));
      const limit = Number((req.query as any).limit ?? 100);
      res.json({ ok: true, data: repos.slice(0, limit), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/repos/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const repo = await WorkforceService.getRepo(orgOf(req), req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      res.json({ ok: true, data: repo, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/repos/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const removed = await WorkforceService.removeRepo(orgOf(req), req.params.id);
      if (!removed) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      res.json({ ok: true, data: { id: req.params.id, deleted: true }, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/repos/:id/team", validate({ params: IdParam, body: TeamBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const assignments = (req.body.assignments ?? {}) as Record<string, string>;
      // Assign each listed role ("" removes the assignment).
      for (const [role, engineerId] of Object.entries(assignments)) {
        if (engineerId === "") {
          delete repo.team[role];
          continue;
        }
        // Engineer id must exist and belong to this repo.
        const engineers = await WorkforceService.listEngineers(oid, repo.id);
        const eng = engineers.find((e) => e.id === engineerId);
        if (eng) repo.team[role] = engineerId;
      }
      const updated = await WorkforceService.updateRepo(oid, repo.id, { team: repo.team });
      res.json({ ok: true, data: updated, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/scan", validate({ params: IdParam, body: ScanBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      await WorkforceService.updateRepo(oid, repo.id, { status: "scanning" });
      const result = await RepoIntelService.scanLocal(oid, repo.id, req.body.path);
      res.json({ ok: true, data: result, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/repos/:id/intel", validate({ params: IdParam, query: AewIntelQuerySchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      let nodes = await RepoIntelService.listNodes(oid, repo.id);
      const q = req.query as any;
      if (q.kind) nodes = nodes.filter((n) => n.kind === q.kind);
      if (q.basis) nodes = nodes.filter((n) => n.basis === q.basis);
      nodes = nodes.slice(0, Number(q.limit ?? 200));
      res.json({ ok: true, data: nodes, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Tasks ──────────────────────────────────────────────────────── */

  router.get("/tasks", validate({ query: AewListQuerySchema }), async (req, res, next) => {
    try {
      const tasks = await WorkforceService.listTasks(orgOf(req), (req.query as any).status);
      const limit = Number((req.query as any).limit ?? 100);
      res.json({ ok: true, data: tasks.slice(0, limit), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/tasks", validate({ body: AewTaskCreateSchema }), async (req, res, next) => {
    try {
      const task = await WorkforceService.createTask(orgOf(req), { ...req.body, createdBy: userOf(req) });
      res.status(201).json({ ok: true, data: task, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/tasks/:id", validate({ params: TaskParam }), async (req, res, next) => {
    try {
      const task = await WorkforceService.getTask(orgOf(req), req.params.id);
      if (!task) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, data: task, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/tasks/:id/run", validate({ params: TaskParam, body: RunBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const task = await WorkforceService.runTask(oid, req.params.id, { execute: Boolean(req.body?.execute) });
      // Record a lesson when the pipeline taught us something.
      await EngineeringMemoryService.learnFromTask(oid, task, "orchestrator").catch(() => {});
      res.json({ ok: true, data: task, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/tasks/:id/pr", validate({ params: TaskParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const task = await WorkforceService.openPrForTask(oid, req.params.id, {
        openPr: async (repoName, opts) => {
          const repo = await WorkforceService.getRepo(oid, task.repoId);
          if (!repo?.connectionId) throw AppError.badRequest("Repository has no GitHub connection");
          const { client } = await GithubService.client(oid, repo.connectionId);
          return client.openPullRequest(repoName, opts);
        },
      });
      res.json({ ok: true, data: task, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Memory ─────────────────────────────────────────────────────── */

  router.get("/memory", validate({ query: AewMemoryQuerySchema }), async (req, res, next) => {
    try {
      const q = req.query as any;
      const entries = await EngineeringMemoryService.list(orgOf(req), {
        kind: q.kind, repoId: q.repoId, tag: q.tag, search: q.q, limit: q.limit,
      });
      res.json({ ok: true, data: entries, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/memory", validate({ body: AewMemoryCreateSchema }), async (req, res, next) => {
    try {
      const entry = await EngineeringMemoryService.create(orgOf(req), {
        ...req.body, source: "user", author: userOf(req),
      });
      res.status(201).json({ ok: true, data: entry, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/memory/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const removed = await EngineeringMemoryService.remove(orgOf(req), req.params.id);
      if (!removed) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Memory entry not found" } });
      res.json({ ok: true, data: { id: req.params.id, deleted: true }, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Command center ─────────────────────────────────────────────── */

  router.get("/command-center", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const local = await CommandCenterService.rollup(oid);
      const full = await CommandCenterService.withGithub(oid, local);
      res.json({ ok: true, data: full, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub connections ─────────────────────────────────────────── */

  router.post("/connections", validate({ body: AewConnectSchema }), async (req, res, next) => {
    try {
      const conn = await GithubService.connect(orgOf(req), { ...req.body, addedBy: userOf(req) });
      res.status(201).json({ ok: true, data: conn, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/connections", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GithubService.list(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/connections/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const removed = await GithubService.remove(orgOf(req), req.params.id);
      if (!removed) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Connection not found" } });
      res.json({ ok: true, data: { id: req.params.id, deleted: true }, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub: repositories ───────────────────────────────────────── */

  router.get("/github/:connId/repos", validate({ params: ConnParam }), async (req, res, next) => {
    try {
      const { client } = await GithubService.client(orgOf(req), req.params.connId);
      res.json({ ok: true, data: await client.listRepos((req.query as any).org as string | undefined), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/github/:connId/repos", validate({ params: ConnParam, body: CreateRepoBody }), async (req, res, next) => {
    try {
      const { client } = await GithubService.client(orgOf(req), req.params.connId);
      res.status(201).json({ ok: true, data: await client.createRepo(req.body.name, req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub: branches, commits ──────────────────────────────────── */

  router.get("/repos/:id/github/branches", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listBranches(repo.name), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/branches", validate({ params: IdParam, body: BranchBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.status(201).json({ ok: true, data: await client.createBranch(repo.name, req.body.name, req.body.fromSha), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/commits", validate({ params: IdParam, body: CommitBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.status(201).json({ ok: true, data: await client.commitFiles(repo.name, req.body.branch, req.body.message, req.body.files), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub: pull requests ──────────────────────────────────────── */

  router.get("/repos/:id/github/pulls", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listPullRequests(repo.name, (req.query as any).state ?? "open"), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/pulls", validate({ params: IdParam, body: PrBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.status(201).json({ ok: true, data: await client.openPullRequest(repo.name, req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/pulls/:number/merge", validate({ params: PrNumberParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.mergePullRequest(repo.name, Number(req.params.number)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/pulls/:number/review", validate({ params: PrNumberParam, body: ReviewBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.reviewPullRequest(repo.name, Number(req.params.number), req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/repos/:id/github/pulls/:number", validate({ params: PrNumberParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.closePullRequest(repo.name, Number(req.params.number)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub: issues & milestones ────────────────────────────────── */

  router.get("/repos/:id/github/issues", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listIssues(repo.name, (req.query as any).state ?? "open"), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/issues", validate({ params: IdParam, body: IssueBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.status(201).json({ ok: true, data: await client.createIssue(repo.name, req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/repos/:id/github/issues/:number", validate({ params: PrNumberParam, body: IssuePatchBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.updateIssue(repo.name, Number(req.params.number), req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/repos/:id/github/milestones", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listMilestones(repo.name), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/milestones", validate({ params: IdParam, body: MilestoneBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.status(201).json({ ok: true, data: await client.createMilestone(repo.name, req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub: releases ───────────────────────────────────────────── */

  router.get("/repos/:id/github/releases", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listReleases(repo.name), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/releases", validate({ params: IdParam, body: ReleaseBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.status(201).json({ ok: true, data: await client.createRelease(repo.name, req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/releases/generate-notes", validate({ params: IdParam, body: ReleaseNotesBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.generateReleaseNotes(repo.name, req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── GitHub: actions & checks ───────────────────────────────────── */

  router.get("/repos/:id/github/workflows", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listWorkflows(repo.name), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/repos/:id/github/workflows/:workflow/dispatch", validate({ params: IdParam.extend({ workflow: z.string().min(1).max(200) }), body: DispatchBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.triggerWorkflow(repo.name, req.params.workflow, req.body.ref, req.body.inputs), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/repos/:id/github/runs", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listWorkflowRuns(repo.name, (req.query as any).branch), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/repos/:id/github/checks", validate({ params: IdParam, query: CheckQuery }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const repo = await WorkforceService.getRepo(oid, req.params.id);
      if (!repo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Repository not found" } });
      const { client } = await GithubService.client(oid, repo.connectionId ?? undefined);
      res.json({ ok: true, data: await client.listCheckRuns(repo.name, (req.query as any).ref), meta: meta(req) });
    } catch (e) { next(e); }
  });
}
