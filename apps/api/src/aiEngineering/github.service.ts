/**
 * Session 124 — GitHub Engineering Module.
 *
 * GitHub is one capability of the AI Software Engineering Workforce, not the
 * whole department. This service owns:
 *
 *   - connections: multiple accounts/orgs per organization, token verified
 *     against the GitHub API at connect time and stored as an AES-256-GCM
 *     envelope in the org-scoped store (every read returns `tokenMasked`);
 *   - repositories: list/create, structure reading (recursive contents),
 *     branches (list/create), commits;
 *   - pull requests: list/get/create/merge/review (approve)/close;
 *   - issues: list/create/update; milestones: list/create;
 *   - releases: list/create/generate-notes;
 *   - actions: list workflows, trigger workflow_dispatch, list runs;
 *   - checks: check-runs for a ref.
 *
 * The client is the real GitHub REST API over fetch. When a connection is
 * missing, every capability answers an explicit "not connected" error — the
 * workforce never fabricates a remote result. Unauthenticated/rate-limited
 * upstream answers are surfaced with their status, not swallowed.
 *
 * Keys (org id in the segment straight after `aew:`):
 *   aew:conn:<org>:<id> / aew:connidx:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { currentEncryptionKeyId, decryptString, encryptString, isEncryptedBlob, maskSecret, type EncryptedBlob } from "../security/encryption.js";
import type {
  AiEngineeringCheckRun,
  AiEngineeringConnection,
  AiEngineeringIssue,
  AiEngineeringMilestone,
  AiEngineeringPullRequest,
  AiEngineeringRelease,
  AiEngineeringWorkflowRun,
} from "@windels/shared/aiEngineering";

const K = {
  conn: (oid: string, id: string) => `aew:conn:${oid}:${id}`,
  connidx: (oid: string) => `aew:connidx:${oid}`,
};

const API = "https://api.github.com";
const MAX_CONNECTIONS = 20;

interface GhJson { [k: string]: any }

/** Small typed wrapper over the GitHub REST API. */
export class GithubClient {
  constructor(
    public readonly token: string,
    public readonly fetchFn: typeof fetch = fetch,
    public readonly apiBase: string = API,
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AppError("UPSTREAM_ERROR", `GitHub API ${res.status}: ${text.slice(0, 200) || res.statusText}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async verify(): Promise<{ login: string; orgs: string[] }> {
    const user = await this.req<GhJson>("GET", "/user");
    const orgs = await this.req<GhJson[]>("GET", "/user/orgs?per_page=100");
    return { login: String(user.login ?? "unknown"), orgs: orgs.map((o) => String(o.login)) };
  }

  async listRepos(org?: string): Promise<Array<{ fullName: string; url: string; defaultBranch: string; updatedAt: string }>> {
    const path = org ? `/orgs/${encodeURIComponent(org)}/repos?per_page=100` : "/user/repos?per_page=100&affiliation=owner,collaborator";
    const repos = await this.req<GhJson[]>("GET", path);
    return repos.map((r) => ({
      fullName: String(r.full_name),
      url: String(r.html_url),
      defaultBranch: String(r.default_branch ?? "main"),
      updatedAt: String(r.updated_at ?? ""),
    }));
  }

  async createRepo(name: string, opts: { description?: string; private?: boolean } = {}): Promise<{ fullName: string; url: string }> {
    const repo = await this.req<GhJson>("POST", "/user/repos", { name, description: opts.description, private: opts.private ?? false });
    return { fullName: String(repo.full_name), url: String(repo.html_url) };
  }

  /** Recursive structure of a repository's default branch (tree API). */
  async readStructure(fullName: string): Promise<Array<{ path: string; type: "blob" | "tree"; size: number }>> {
    const meta = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}`);
    const branch = String(meta.default_branch ?? "main");
    const tree = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    return (tree.tree as GhJson[]).map((t) => ({
      path: String(t.path),
      type: t.type === "tree" ? "tree" as const : "blob" as const,
      size: Number(t.size ?? 0),
    }));
  }

  async getFile(fullName: string, path: string): Promise<{ content: string; encoding: string } | null> {
    try {
      const f = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/contents/${encodeURIComponent(path)}`);
      return { content: String(f.content ?? ""), encoding: String(f.encoding ?? "base64") };
    } catch (e) {
      if ((e as AppError).status === 404) return null;
      throw e;
    }
  }

  async listBranches(fullName: string): Promise<string[]> {
    const branches = await this.req<GhJson[]>("GET", `/repos/${encodeURIComponent(fullName)}/branches?per_page=100`);
    return branches.map((b) => String(b.name));
  }

  async createBranch(fullName: string, name: string, fromSha?: string): Promise<{ sha: string }> {
    let base = fromSha;
    if (!base) {
      const repo = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}`);
      const branch = String(repo.default_branch ?? "main");
      const head = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/git/ref/heads/${encodeURIComponent(branch)}`);
      base = String(head.object.sha);
    }
    const ref = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/git/refs`, { ref: `refs/heads/${name}`, sha: base });
    return { sha: String(ref.object.sha) };
  }

  /** Create a commit on a branch from a set of file writes (blobs/tree/commit/update-ref). */
  async commitFiles(fullName: string, branch: string, message: string, files: Array<{ path: string; content: string }>): Promise<{ sha: string }> {
    const repo = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}`);
    const defaultBranch = String(repo.default_branch ?? "main");
    const head = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/git/ref/heads/${encodeURIComponent(branch)}`);
    const baseSha = String(head.object.sha);
    const blobs: GhJson[] = [];
    for (const f of files) {
      const b = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/git/blobs`, { content: f.content, encoding: "utf-8" });
      blobs.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha });
    }
    const tree = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/git/trees`, { base_tree: baseSha, tree: blobs });
    const commit = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [baseSha],
    });
    await this.req<GhJson>("PATCH", `/repos/${encodeURIComponent(fullName)}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false });
    // Mirror the repository's branch-defaulting behaviour when the branch is
    // the default (the API used by `pull` consumers).
    if (branch === defaultBranch) {
      await this.req<GhJson>("PATCH", `/repos/${encodeURIComponent(fullName)}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
    }
    return { sha: String(commit.sha) };
  }

  /* ── Pull requests ──────────────────────────────────────────────── */

  async listPullRequests(fullName: string, state: "open" | "closed" | "all" = "open"): Promise<AiEngineeringPullRequest[]> {
    const prs = await this.req<GhJson[]>("GET", `/repos/${encodeURIComponent(fullName)}/pulls?state=${state}&per_page=100`);
    return prs.map((p) => ({
      number: Number(p.number),
      title: String(p.title),
      state: String(p.state),
      url: String(p.html_url),
      headBranch: String(p.head?.ref ?? ""),
      baseBranch: String(p.base?.ref ?? ""),
      author: p.user?.login ? String(p.user.login) : null,
      createdAt: String(p.created_at ?? ""),
      updatedAt: String(p.updated_at ?? ""),
    }));
  }

  async openPullRequest(fullName: string, opts: { title: string; head: string; base: string; body?: string }): Promise<{ number: number; url: string }> {
    const pr = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/pulls`, { ...opts });
    return { number: Number(pr.number), url: String(pr.html_url) };
  }

  async mergePullRequest(fullName: string, number: number): Promise<{ merged: boolean; sha: string | null }> {
    const res = await this.req<GhJson>("PUT", `/repos/${encodeURIComponent(fullName)}/pulls/${number}/merge`);
    return { merged: Boolean(res.merged), sha: res.sha ? String(res.sha) : null };
  }

  async reviewPullRequest(fullName: string, number: number, opts: { event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; body?: string }): Promise<{ id: number }> {
    const r = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/pulls/${number}/reviews`, opts);
    return { id: Number(r.id) };
  }

  async closePullRequest(fullName: string, number: number): Promise<{ state: string }> {
    const r = await this.req<GhJson>("PATCH", `/repos/${encodeURIComponent(fullName)}/pulls/${number}`, { state: "closed" });
    return { state: String(r.state) };
  }

  /* ── Issues & milestones ────────────────────────────────────────── */

  async listIssues(fullName: string, state: "open" | "closed" | "all" = "open"): Promise<AiEngineeringIssue[]> {
    const issues = await this.req<GhJson[]>("GET", `/repos/${encodeURIComponent(fullName)}/issues?state=${state}&per_page=100`);
    return issues.filter((i) => !i.pull_request).map((i) => ({
      number: Number(i.number),
      title: String(i.title),
      state: String(i.state),
      url: String(i.html_url),
      labels: (i.labels as GhJson[]).map((l) => String(l.name ?? l)),
      createdAt: String(i.created_at ?? ""),
      updatedAt: String(i.updated_at ?? ""),
    }));
  }

  async createIssue(fullName: string, opts: { title: string; body?: string; labels?: string[] }): Promise<{ number: number; url: string }> {
    const i = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/issues`, opts);
    return { number: Number(i.number), url: String(i.html_url) };
  }

  async updateIssue(fullName: string, number: number, opts: { state?: "open" | "closed"; title?: string; body?: string }): Promise<{ number: number; state: string }> {
    const i = await this.req<GhJson>("PATCH", `/repos/${encodeURIComponent(fullName)}/issues/${number}`, opts);
    return { number: Number(i.number), state: String(i.state) };
  }

  async listMilestones(fullName: string): Promise<AiEngineeringMilestone[]> {
    const ms = await this.req<GhJson[]>("GET", `/repos/${encodeURIComponent(fullName)}/milestones?state=all&per_page=100`);
    return ms.map((m) => ({
      number: Number(m.number),
      title: String(m.title),
      state: String(m.state),
      dueOn: m.due_on ? String(m.due_on) : null,
      openIssues: Number(m.open_issues ?? 0),
      closedIssues: Number(m.closed_issues ?? 0),
      url: String(m.html_url),
    }));
  }

  async createMilestone(fullName: string, opts: { title: string; dueOn?: string }): Promise<{ number: number; title: string }> {
    const m = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/milestones`, { title: opts.title, due_on: opts.dueOn });
    return { number: Number(m.number), title: String(m.title) };
  }

  /* ── Releases ───────────────────────────────────────────────────── */

  async listReleases(fullName: string): Promise<AiEngineeringRelease[]> {
    const rs = await this.req<GhJson[]>("GET", `/repos/${encodeURIComponent(fullName)}/releases?per_page=100`);
    return rs.map((r) => ({
      id: Number(r.id),
      tagName: String(r.tag_name),
      name: r.name ? String(r.name) : null,
      draft: Boolean(r.draft),
      prerelease: Boolean(r.prerelease),
      publishedAt: r.published_at ? String(r.published_at) : null,
      url: String(r.html_url),
    }));
  }

  async createRelease(fullName: string, opts: { tagName: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean }): Promise<{ id: number; url: string }> {
    const r = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/releases`, opts);
    return { id: Number(r.id), url: String(r.html_url) };
  }

  /** GitHub's own release-notes generator. */
  async generateReleaseNotes(fullName: string, opts: { tagName: string; targetCommitish?: string; previousTagName?: string }): Promise<{ name: string; body: string }> {
    const r = await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/releases/generate-notes`, opts);
    return { name: String(r.name ?? ""), body: String(r.body ?? "") };
  }

  /* ── Actions & checks ───────────────────────────────────────────── */

  async listWorkflows(fullName: string): Promise<Array<{ id: number; name: string; path: string; state: string }>> {
    const w = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/actions/workflows?per_page=100`);
    return (w.workflows as GhJson[]).map((x) => ({ id: Number(x.id), name: String(x.name), path: String(x.path), state: String(x.state) }));
  }

  async triggerWorkflow(fullName: string, workflowIdOrFile: string | number, ref: string, inputs?: Record<string, string>): Promise<{ accepted: true }> {
    await this.req<GhJson>("POST", `/repos/${encodeURIComponent(fullName)}/actions/workflows/${workflowIdOrFile}/dispatches`, { ref, inputs: inputs ?? {} });
    return { accepted: true };
  }

  async listWorkflowRuns(fullName: string, branch?: string): Promise<AiEngineeringWorkflowRun[]> {
    const q = branch ? `?branch=${encodeURIComponent(branch)}&per_page=50` : "?per_page=50";
    const r = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/actions/runs${q}`);
    return (r.workflow_runs as GhJson[]).map((x) => ({
      id: Number(x.id),
      name: x.name ? String(x.name) : null,
      status: String(x.status),
      conclusion: x.conclusion ? String(x.conclusion) : null,
      headBranch: String(x.head_branch ?? ""),
      createdAt: String(x.created_at ?? ""),
      url: String(x.html_url),
    }));
  }

  async listCheckRuns(fullName: string, ref: string): Promise<AiEngineeringCheckRun[]> {
    const r = await this.req<GhJson>("GET", `/repos/${encodeURIComponent(fullName)}/commits/${encodeURIComponent(ref)}/check-runs`);
    return (r.check_runs as GhJson[]).map((x) => ({
      id: Number(x.id),
      name: String(x.name),
      status: String(x.status),
      conclusion: x.conclusion ? String(x.conclusion) : null,
      url: String(x.html_url),
    }));
  }
}

interface StoredGithubConnection extends AiEngineeringConnection {
  tokenEnc?: EncryptedBlob;
  /** Legacy plaintext field. Adopted and removed on the next read. */
  token?: string;
}

function publicConnection(record: StoredGithubConnection): AiEngineeringConnection {
  const { token: _legacy, tokenEnc: _encrypted, ...safe } = record;
  return safe;
}

async function loadStoredConnection(oid: string, id: string): Promise<{ connection: AiEngineeringConnection; token: string } | null> {
  const raw = await redis.hget(K.conn(oid, id), "doc");
  if (!raw) return null;
  let record: StoredGithubConnection;
  try { record = JSON.parse(raw) as StoredGithubConnection; }
  catch { throw AppError.internal("Stored GitHub connection is invalid"); }

  let token: string | null = null;
  if (record.tokenEnc && isEncryptedBlob(record.tokenEnc)) {
    token = decryptString(record.tokenEnc);
    if (token && record.tokenEnc.kid !== currentEncryptionKeyId()) {
      record = { ...publicConnection(record), tokenEnc: encryptString(token), updatedAt: new Date().toISOString() };
      await redis.hset(K.conn(oid, id), "doc", JSON.stringify(record));
    }
  } else if (typeof record.token === "string" && record.token) {
    // One-shot adoption of records created before encrypted credential storage.
    token = record.token;
    const migrated: StoredGithubConnection = {
      ...publicConnection(record),
      tokenEnc: encryptString(token),
      tokenMasked: maskSecret(token),
      credentialVersion: Math.max(1, record.credentialVersion ?? 1),
      credentialsUpdatedAt: record.credentialsUpdatedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await redis.hset(K.conn(oid, id), "doc", JSON.stringify(migrated));
    record = migrated;
  }
  if (!token) throw AppError.internal("GitHub credential cannot be decrypted; reconnect this account");
  return { connection: publicConnection(record), token };
}

export const GithubService = {
  async connect(oid: string, input: { accountLabel: string; token: string; addedBy: string }, fetchFn: typeof fetch = fetch): Promise<AiEngineeringConnection> {
    const existing = await redis.lrange(K.connidx(oid), 0, -1);
    if (existing.length >= MAX_CONNECTIONS) throw AppError.badRequest("Connection limit reached");
    let verified: { login: string; orgs: string[] };
    try { verified = await new GithubClient(input.token, fetchFn).verify(); }
    catch (error) {
      logger.warn("[ai-engineering] GitHub credential verification failed", { status: (error as AppError).status });
      if ((error as AppError).status === 401) throw AppError.unauthorized("GitHub rejected the supplied credential");
      throw error;
    }
    const timestamp = new Date().toISOString();
    const connection: AiEngineeringConnection = {
      id: `aewc-${randomUUID().slice(0, 8)}`,
      provider: "github",
      accountLabel: input.accountLabel,
      organizations: verified.orgs,
      tokenMasked: maskSecret(input.token),
      status: "connected",
      addedBy: input.addedBy,
      credentialVersion: 1,
      credentialsUpdatedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const stored: StoredGithubConnection = { ...connection, tokenEnc: encryptString(input.token) };
    await redis.hset(K.conn(oid, connection.id), "doc", JSON.stringify(stored));
    await redis.lpush(K.connidx(oid), connection.id);
    await redis.ltrim(K.connidx(oid), 0, MAX_CONNECTIONS - 1);
    logger.info("[ai-engineering] GitHub credential connected", { organizationId: oid, connectionId: connection.id, addedBy: input.addedBy, credentialVersion: 1 });
    return connection;
  },

  async list(oid: string): Promise<AiEngineeringConnection[]> {
    const ids = await redis.lrange(K.connidx(oid), 0, -1);
    const out: AiEngineeringConnection[] = [];
    for (const id of ids) {
      const loaded = await loadStoredConnection(oid, id);
      if (loaded) out.push(loaded.connection);
    }
    return out;
  },

  /** Public connection metadata only; decrypted credentials never leave this module. */
  async get(oid: string, id: string): Promise<AiEngineeringConnection | null> {
    return (await loadStoredConnection(oid, id))?.connection ?? null;
  },

  async rotateCredential(oid: string, id: string, token: string, actorId: string, fetchFn: typeof fetch = fetch): Promise<AiEngineeringConnection> {
    const current = await loadStoredConnection(oid, id);
    if (!current) throw AppError.notFound("GitHub connection not found");
    let verified: { login: string; orgs: string[] };
    try { verified = await new GithubClient(token, fetchFn).verify(); }
    catch (error) {
      logger.warn("[ai-engineering] GitHub credential rotation verification failed", { connectionId: id, status: (error as AppError).status });
      if ((error as AppError).status === 401) throw AppError.unauthorized("GitHub rejected the replacement credential");
      throw error;
    }
    const timestamp = new Date().toISOString();
    const next: StoredGithubConnection = {
      ...current.connection,
      organizations: verified.orgs,
      tokenMasked: maskSecret(token),
      status: "connected",
      credentialVersion: (current.connection.credentialVersion ?? 1) + 1,
      credentialsUpdatedAt: timestamp,
      credentialsRotatedBy: actorId,
      updatedAt: timestamp,
      tokenEnc: encryptString(token),
    };
    await redis.hset(K.conn(oid, id), "doc", JSON.stringify(next));
    logger.info("[ai-engineering] GitHub credential rotated", { organizationId: oid, connectionId: id, actorId, credentialVersion: next.credentialVersion });
    return publicConnection(next);
  },

  async remove(oid: string, id: string): Promise<boolean> {
    if (!(await redis.hget(K.conn(oid, id), "doc"))) return false;
    await redis.del(K.conn(oid, id));
    await redis.lrem(K.connidx(oid), 0, id);
    logger.info("[ai-engineering] GitHub credential revoked", { organizationId: oid, connectionId: id });
    return true;
  },

  /** Resolve a connection to a client without exposing its token to callers. */
  async client(oid: string, connectionId?: string): Promise<{ client: GithubClient; conn: AiEngineeringConnection }> {
    if (!connectionId) throw AppError.badRequest("This repository has no GitHub connection configured");
    const loaded = await loadStoredConnection(oid, connectionId);
    if (!loaded) throw AppError.badRequest("GitHub connection not found");
    return { client: new GithubClient(loaded.token), conn: loaded.connection };
  },
};
