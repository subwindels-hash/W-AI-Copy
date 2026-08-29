/**
 * Session 124 — GitHub Engineering Module tests.
 *
 * The GitHub client is the real REST API over an injectable fetch, so this
 * suite drives every capability against a mocked transport and pins:
 *   - connect verifies the token (GET /user + /user/orgs) and stores it only
 *     in the org-scoped store (reads return the masked form, never the
 *     token);
 *   - repositories: list/create; branches: list/create; commits via
 *     blobs→tree→commit→refs;
 *   - pull requests: open/list/merge/review/close; issues: list/create/
 *     update; milestones; releases + generate-notes; workflows/runs/checks;
 *   - upstream errors surface with their status; a missing connection is an
 *     honest "no connection" error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
process.env.WINDELS_ENCRYPTION_KEY = "1".repeat(64);
process.env.WINDELS_ENCRYPTION_KEY_ID = "test-k1";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { GithubClient, GithubService } = await import("./github.service.js");
const credentialCrypto = await import("../security/encryption.js");

const ORG_A = "org-alpha";

/** A fetch stub that routes by method+path to canned JSON responses. */
function mockFetch(routes: Array<{ match: RegExp; method?: string; respond: (url: string, init?: any) => { status: number; json?: unknown; text?: string } }>) {
  const calls: Array<{ method: string; url: string }> = [];
  const fn = async (url: string, init?: any) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    for (const r of routes) {
      if ((!r.method || r.method === method) && r.match.test(url)) {
        const res = r.respond(url, init);
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          statusText: res.status === 404 ? "Not Found" : "OK",
          json: async () => res.json,
          text: async () => (res.text ?? ""),
        } as any;
      }
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}), text: async () => "unexpected route" } as any;
  };
  return { fn, calls };
}

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

describe("connections", () => {
  it("verifies the token, stores it org-scoped and returns only the masked form", async () => {
    const { fn } = mockFetch([
      { match: /\/user\/orgs/, respond: () => ({ status: 200, json: [{ login: "acme" }, { login: "windels" }] }) },
      { match: /\/user$/, respond: () => ({ status: 200, json: { login: "gh-bot" } }) },
    ]);
    const conn = await GithubService.connect(ORG_A, { accountLabel: "Acme", token: "ghp_0123456789abcdefghijklmnopqrstuvwxyz", addedBy: "u1" }, fn);
    expect(conn.status).toBe("connected");
    expect(conn.organizations).toEqual(["acme", "windels"]);
    expect(conn.tokenMasked).toBe("ghp***yz");
    expect(JSON.stringify(conn)).not.toContain("ghp_0123456789");
    const raw = await kv.hget(`aew:conn:${ORG_A}:${conn.id}`, "doc");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("ghp_0123456789abcdefghijklmnopqrstuvwxyz");
    expect(JSON.parse(raw!).tokenEnc).toMatchObject({ v: "enc.v1", kid: "test-k1" });
    const stored = await GithubService.get(ORG_A, conn.id);
    expect((stored as any).token).toBeUndefined();
    expect((stored as any).tokenEnc).toBeUndefined();
  });

  it("rejects a credential that GitHub does not verify and stores nothing", async () => {
    const { fn } = mockFetch([
      { match: /\/user/, respond: () => ({ status: 401, text: "Bad credentials" }) },
    ]);
    await expect(GithubService.connect(ORG_A, { accountLabel: "Bad", token: "ghp_badbadbadbadbadbadbadbadbad", addedBy: "u1" }, fn)).rejects.toMatchObject({ status: 401 });
    expect(await GithubService.list(ORG_A)).toHaveLength(0);
  });

  it("adopts and erases a legacy plaintext token on first read", async () => {
    const id = "aewc-legacy";
    const token = "ghp_legacyplaintexttoken123456789";
    await kv.hset(`aew:conn:${ORG_A}:${id}`, "doc", JSON.stringify({
      id, provider: "github", accountLabel: "Legacy", organizations: [], tokenMasked: "old",
      status: "connected", addedBy: "u1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", token,
    }));
    await kv.lpush(`aew:connidx:${ORG_A}`, id);
    const list = await GithubService.list(ORG_A);
    expect(list[0]?.tokenMasked).toBe("ghp***89");
    const migrated = await kv.hget(`aew:conn:${ORG_A}:${id}`, "doc");
    expect(migrated).not.toContain(token);
    expect(JSON.parse(migrated!).token).toBeUndefined();
    expect(JSON.parse(migrated!).tokenEnc.v).toBe("enc.v1");
  });

  it("verifies a replacement token before atomic credential rotation", async () => {
    const good = mockFetch([
      { match: /\/user\/orgs/, respond: () => ({ status: 200, json: [{ login: "acme" }] }) },
      { match: /\/user$/, respond: () => ({ status: 200, json: { login: "bot" } }) },
    ]).fn;
    const conn = await GithubService.connect(ORG_A, { accountLabel: "Rotate", token: "ghp_firstcredential123456789", addedBy: "u1" }, good);
    const rotated = await GithubService.rotateCredential(ORG_A, conn.id, "github_pat_replacementcredential987654321", "u2", good);
    expect(rotated.credentialVersion).toBe(2);
    expect(rotated.credentialsRotatedBy).toBe("u2");
    expect(rotated.tokenMasked).toBe("git***21");
    const raw = await kv.hget(`aew:conn:${ORG_A}:${conn.id}`, "doc");
    expect(raw).not.toContain("replacementcredential");

    const bad = mockFetch([{ match: /\/user/, respond: () => ({ status: 401, text: "bad" }) }]).fn;
    await expect(GithubService.rotateCredential(ORG_A, conn.id, "github_pat_rejectedcredential", "u3", bad)).rejects.toMatchObject({ status: 401 });
    const afterRejected = await GithubService.client(ORG_A, conn.id);
    expect(afterRejected.client.token).toBe("github_pat_replacementcredential987654321");
  });

  it("re-encrypts an existing token when the master key id rotates", async () => {
    const good = mockFetch([
      { match: /\/user\/orgs/, respond: () => ({ status: 200, json: [] }) },
      { match: /\/user$/, respond: () => ({ status: 200, json: { login: "bot" } }) },
    ]).fn;
    const conn = await GithubService.connect(ORG_A, { accountLabel: "Key rotation", token: "ghp_masterkeyrotation123456789", addedBy: "u1" }, good);
    credentialCrypto.registerKey("test-k2", "2".repeat(64));
    credentialCrypto.setPrimaryKey("test-k2");
    await GithubService.get(ORG_A, conn.id);
    const raw = await kv.hget(`aew:conn:${ORG_A}:${conn.id}`, "doc");
    expect(JSON.parse(raw!).tokenEnc.kid).toBe("test-k2");
  });

  it("refuses capabilities on a missing connection honestly", async () => {
    await expect(GithubService.client(ORG_A)).rejects.toThrow(/no GitHub connection/i);
    await expect(GithubService.client(ORG_A, "nope")).rejects.toThrow(/not found/i);
  });
});

describe("repositories and branches", () => {
  it("lists remote repositories and creates one", async () => {
    const { fn, calls } = mockFetch([
      { match: /\/orgs\/acme\/repos/, respond: () => ({ status: 200, json: [{ full_name: "acme/app", html_url: "https://github.com/acme/app", default_branch: "main", updated_at: "2026-08-01T00:00:00Z" }] }) },
      { match: /\/user\/repos$/, method: "POST", respond: () => ({ status: 201, json: { full_name: "acme/new", html_url: "https://github.com/acme/new" } }) },
    ]);
    const c = new GithubClient("tok", fn);
    const repos = await c.listRepos("acme");
    expect(repos[0]!.fullName).toBe("acme/app");
    const created = await c.createRepo("new", { description: "x", private: true });
    expect(created.fullName).toBe("acme/new");
    expect(calls.some((x) => x.method === "POST" && x.url.includes("/user/repos"))).toBe(true);
  });

  it("lists and creates branches", async () => {
    const { fn } = mockFetch([
      { match: /\/branches\?/, respond: () => ({ status: 200, json: [{ name: "main" }, { name: "dev" }] }) },
      { match: /\/git\/ref\/heads\/main/, respond: () => ({ status: 200, json: { object: { sha: "abc123" } } }) },
      { match: /\/git\/refs$/, method: "POST", respond: () => ({ status: 201, json: { object: { sha: "def456" } } }) },
      { match: /\/repos\/acme%2Fapp$/, respond: () => ({ status: 200, json: { default_branch: "main" } }) },
    ]);
    const c = new GithubClient("tok", fn);
    expect(await c.listBranches("acme/app")).toEqual(["main", "dev"]);
    const b = await c.createBranch("acme/app", "feature/x");
    expect(b.sha).toBe("def456");
  });

  it("commits files through blobs → tree → commit → ref update", async () => {
    const { fn, calls } = mockFetch([
      { match: /\/repos\/acme%2Fapp$/, respond: () => ({ status: 200, json: { default_branch: "main" } }) },
      { match: /\/git\/ref\/heads\/feature/, respond: () => ({ status: 200, json: { object: { sha: "base" } } }) },
      { match: /\/git\/blobs/, method: "POST", respond: () => ({ status: 201, json: { sha: "blob1" } }) },
      { match: /\/git\/trees$/, method: "POST", respond: () => ({ status: 201, json: { sha: "tree1" } }) },
      { match: /\/git\/commits$/, method: "POST", respond: () => ({ status: 201, json: { sha: "commit1" } }) },
      { match: /\/git\/refs\/heads\/feature/, method: "PATCH", respond: () => ({ status: 200, json: { object: { sha: "commit1" } } }) },
    ]);
    const c = new GithubClient("tok", fn);
    const res = await c.commitFiles("acme/app", "feature", "feat: add file", [{ path: "a.txt", content: "hi" }]);
    expect(res.sha).toBe("commit1");
    const methods = calls.map((x) => `${x.method} ${x.url.split("?")[0]}`);
    expect(methods).toContain("POST https://api.github.com/repos/acme%2Fapp/git/blobs");
    expect(methods).toContain("POST https://api.github.com/repos/acme%2Fapp/git/trees");
    expect(methods).toContain("POST https://api.github.com/repos/acme%2Fapp/git/commits");
    expect(methods).toContain("PATCH https://api.github.com/repos/acme%2Fapp/git/refs/heads/feature");
  });
});

describe("pull requests", () => {
  it("opens, lists, merges, reviews and closes PRs", async () => {
    const { fn } = mockFetch([
      { match: /\/pulls\?state=open/, respond: () => ({ status: 200, json: [{ number: 1, title: "PR 1", state: "open", html_url: "u/1", head: { ref: "f" }, base: { ref: "main" }, user: { login: "bot" }, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" }] }) },
      { match: /\/pulls$/, method: "POST", respond: () => ({ status: 201, json: { number: 2, html_url: "u/2" } }) },
      { match: /\/pulls\/2\/merge/, method: "PUT", respond: () => ({ status: 200, json: { merged: true, sha: "s" } }) },
      { match: /\/pulls\/2\/reviews/, method: "POST", respond: () => ({ status: 200, json: { id: 9 } }) },
      { match: /\/pulls\/2$/, method: "PATCH", respond: () => ({ status: 200, json: { state: "closed" } }) },
    ]);
    const c = new GithubClient("tok", fn);
    const open = await c.openPullRequest("acme%2Fapp", { title: "T", head: "f", base: "main" });
    expect(open.number).toBe(2);
    const prs = await c.listPullRequests("acme%2Fapp", "open");
    expect(prs[0]!.title).toBe("PR 1");
    expect(prs[0]!.author).toBe("bot");
    expect((await c.mergePullRequest("acme%2Fapp", 2)).merged).toBe(true);
    expect((await c.reviewPullRequest("acme%2Fapp", 2, { event: "APPROVE" })).id).toBe(9);
    expect((await c.closePullRequest("acme%2Fapp", 2)).state).toBe("closed");
  });
});

describe("issues, milestones, releases", () => {
  it("lists and creates issues; patches state", async () => {
    const { fn } = mockFetch([
      { match: /\/issues\?state=open/, respond: () => ({ status: 200, json: [{ number: 3, title: "Bug", state: "open", html_url: "u/3", labels: [{ name: "bug" }], created_at: "", updated_at: "" }] }) },
      { match: /\/issues$/, method: "POST", respond: () => ({ status: 201, json: { number: 4, html_url: "u/4" } }) },
      { match: /\/issues\/4$/, method: "PATCH", respond: () => ({ status: 200, json: { number: 4, state: "closed" } }) },
    ]);
    const c = new GithubClient("tok", fn);
    const issues = await c.listIssues("acme%2Fapp", "open");
    expect(issues[0]!.labels).toEqual(["bug"]);
    expect(issues[0]!.number).toBe(3);
    expect((await c.createIssue("acme%2Fapp", { title: "New" })).number).toBe(4);
    expect((await c.updateIssue("acme%2Fapp", 4, { state: "closed" })).state).toBe("closed");
  });

  it("manages milestones and releases, including generated notes", async () => {
    const { fn, calls } = mockFetch([
      { match: /\/milestones\?state=all/, respond: () => ({ status: 200, json: [{ number: 1, title: "M1", state: "open", due_on: null, open_issues: 2, closed_issues: 1, html_url: "u/m" }] }) },
      { match: /\/milestones$/, method: "POST", respond: () => ({ status: 201, json: { number: 2, title: "M2" } }) },
      { match: /\/releases\?per_page/, respond: () => ({ status: 200, json: [{ id: 1, tag_name: "v1.0.0", name: "V1", draft: false, prerelease: false, published_at: "2026-08-01T00:00:00Z", html_url: "u/r" }] }) },
      { match: /\/releases$/, method: "POST", respond: () => ({ status: 201, json: { id: 2, html_url: "u/r2" } }) },
      { match: /\/releases\/generate-notes/, method: "POST", respond: () => ({ status: 200, json: { name: "v1.1.0", body: "## What's Changed" } }) },
    ]);
    const c = new GithubClient("tok", fn);
    const ms = await c.listMilestones("acme%2Fapp");
    expect(ms[0]!.openIssues).toBe(2);
    expect((await c.createMilestone("acme%2Fapp", { title: "M2" })).number).toBe(2);
    const releases = await c.listReleases("acme%2Fapp");
    expect(releases[0]!.tagName).toBe("v1.0.0");
    expect((await c.createRelease("acme%2Fapp", { tagName: "v1.1.0" })).id).toBe(2);
    const notes = await c.generateReleaseNotes("acme%2Fapp", { tagName: "v1.1.0" });
    expect(notes.body).toContain("What's Changed");
    expect(calls.some((x) => x.url.includes("/releases/generate-notes"))).toBe(true);
  });
});

describe("actions and checks", () => {
  it("lists workflows, dispatches, lists runs and checks", async () => {
    const { fn } = mockFetch([
      { match: /\/actions\/workflows\?/, respond: () => ({ status: 200, json: { workflows: [{ id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" }] } }) },
      { match: /\/dispatches/, method: "POST", respond: () => ({ status: 204 }) },
      { match: /\/actions\/runs\?/, respond: () => ({ status: 200, json: { workflow_runs: [{ id: 7, name: "CI", status: "completed", conclusion: "success", head_branch: "main", created_at: "", html_url: "u/run" }] } }) },
      { match: /\/check-runs/, respond: () => ({ status: 200, json: { check_runs: [{ id: 5, name: "lint", status: "completed", conclusion: "success", html_url: "u/c" }] } }) },
    ]);
    const c = new GithubClient("tok", fn);
    const wf = await c.listWorkflows("acme%2Fapp");
    expect(wf[0]!.name).toBe("CI");
    expect((await c.triggerWorkflow("acme%2Fapp", 1, "main", { env: "prod" })).accepted).toBe(true);
    const runs = await c.listWorkflowRuns("acme%2Fapp", "main");
    expect(runs[0]!.conclusion).toBe("success");
    const checks = await c.listCheckRuns("acme%2Fapp", "main");
    expect(checks[0]!.name).toBe("lint");
  });
});

describe("error surfacing", () => {
  it("maps an upstream 404 to an AppError with the upstream status", async () => {
    const { fn } = mockFetch([
      { match: /\/repos\/acme%2Fnope/, respond: () => ({ status: 404, text: '{"message":"Not Found"}' }) },
    ]);
    const c = new GithubClient("tok", fn);
    await expect(c.listBranches("acme/nope")).rejects.toMatchObject({ status: 404 });
  });
});
