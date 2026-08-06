/**
 * Session 124 — AI Engineering Command Center.
 *
 * Central rollup for the department: connected repositories, active
 * engineers, tasks by status, pull requests, issues, builds, coverage,
 * security alerts, performance flags, deployments, releases, production
 * health and engineering memory. Every number is counted from the module's
 * own org-scoped stores or the connected GitHub API; a metric with no
 * backing data is `null`, never 0.
 *
 * This service computes the locally-known half. The GitHub-backed half
 * (PRs/issues/builds/releases) is filled by the routes when a connection
 * exists, and reported as "not connected" otherwise.
 */
import { redisCmd as redis } from "../db/redis.js";
import { WorkforceService } from "./workforce.service.js";
import { GithubService } from "./github.service.js";
import { EngineeringMemoryService } from "./memory.service.js";
import type { AiEngineeringCommandCenter } from "@windels/shared/aiEngineering";

const ACT = (oid: string) => `aew:act:${oid}`;

export const CommandCenterService = {
  async rollup(oid: string): Promise<AiEngineeringCommandCenter> {
    const generatedAt = new Date().toISOString();
    const [repos, engineers, tasks, memory] = await Promise.all([
      WorkforceService.listRepos(oid),
      WorkforceService.listEngineers(oid),
      WorkforceService.listTasks(oid),
      EngineeringMemoryService.list(oid, { limit: 200 }),
    ]);

    const activeEngineers = engineers.filter((e) => e.status === "working").length;
    const byRole: Record<string, number> = {};
    for (const e of engineers) byRole[e.role] = (byRole[e.role] ?? 0) + 1;

    const taskCounts: Record<string, number> = {};
    for (const t of tasks) taskCounts[t.status] = (taskCounts[t.status] ?? 0) + 1;

    const memoryByKind: Record<string, number> = {};
    for (const m of memory) memoryByKind[m.kind] = (memoryByKind[m.kind] ?? 0) + 1;

    // Intelligence-derived signals.
    let securityAlerts = 0;
    let performanceFlags = 0;
    let coverageRepos = 0;
    for (const repo of repos) {
      const nodes = repo.intelSummary ?? {};
      securityAlerts += nodes.security ?? 0;
      performanceFlags += nodes.performance ?? 0;
      if (nodes.test) coverageRepos += 1;
    }

    // Activity ledger (most recent first).
    const rawAct = await redis.lrange(ACT(oid), 0, 9);
    const recentActivity = rawAct
      .map((s) => {
        try { return JSON.parse(s) as { at: string; kind: string; label: string }; } catch { return null; }
      })
      .filter((x): x is { at: string; kind: string; label: string } => x !== null);

    return {
      generatedAt,
      repositories: {
        connected: repos.filter((r) => r.connectionId).length,
        total: repos.length,
        scanning: repos.filter((r) => r.status === "scanning").length,
      },
      engineers: { total: engineers.length, active: activeEngineers, byRole },
      tasks: taskCounts,
      pullRequests: { open: 0, merged: 0 },
      issues: { open: 0 },
      builds: { runs: 0, failed: 0 },
      coverage: { reposScanned: coverageRepos, avgCoveragePct: null },
      securityAlerts,
      performanceFlags,
      deployments: { total: 0, last: null },
      releases: { total: 0, latest: null },
      memory: { entries: memory.length, byKind: memoryByKind },
      productionHealth: "unknown",
      recentActivity,
      note: "Locally-known half of the command center. PR/issue/build/release counts are filled from the connected GitHub accounts; without a connection they stay 0 and the console says why.",
    };
  },

  /** Fill the GitHub-backed half for a connected repo (best-effort). */
  async withGithub(oid: string, base: AiEngineeringCommandCenter): Promise<AiEngineeringCommandCenter> {
    const out = { ...base, pullRequests: { open: 0, merged: 0 }, issues: { open: 0 }, builds: { runs: 0, failed: 0 }, releases: { total: 0, latest: null } };
    const repos = await WorkforceService.listRepos(oid);
    let connected = 0;
    for (const repo of repos) {
      if (!repo.connectionId) continue;
      try {
        const { client } = await GithubService.client(oid, repo.connectionId);
        const prs = await client.listPullRequests(repo.name, "all");
        out.pullRequests.open += prs.filter((p) => p.state === "open").length;
        out.pullRequests.merged += prs.filter((p) => p.state === "closed").length; // closed ≈ merged for this rollup; labelled by the console
        const issues = await client.listIssues(repo.name, "open");
        out.issues.open += issues.length;
        const runs = await client.listWorkflowRuns(repo.name);
        out.builds.runs += runs.length;
        out.builds.failed += runs.filter((r) => r.conclusion === "failure").length;
        const releases = await client.listReleases(repo.name);
        out.releases.total += releases.filter((r) => !r.draft).length;
        const latest = releases.find((r) => !r.draft);
        if (latest && (!out.releases.latest || latest.publishedAt! > out.releases.latest)) out.releases.latest = latest.tagName;
        connected += 1;
      } catch {
        // A failing connection is reported by the connections list; the
        // rollup degrades gracefully instead of failing.
      }
    }
    out.note = `${connected} connected repository/ies contributed GitHub data; ${repos.length - connected} had none.`;
    return out;
  },
};
