/**
 * Session 200 — deeper GitHub Connector coverage.
 *
 * The base suite covers config, PAT connect and OAuth start/exchange. This
 * suite hardens the remaining connected-state operations that were unverified:
 *   - getStatus reflects connected vs disconnected
 *   - verify refreshes profile/orgs and errors when not connected
 *   - disconnect returns true/false and clears the stored connection
 *   - listRepos maps the GitHub payload and errors when not connected
 *   - OAuth callback returnTo is sanitized to an in-app path
 *   - token-exchange failures surface as bad-request
 *   - cross-tenant / cross-user isolation of a stored connection
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

process.env.WINDELS_ENCRYPTION_KEY = "1".repeat(64);
process.env.WINDELS_ENCRYPTION_KEY_ID = "test-k1";
process.env.GITHUB_CLIENT_ID = "Iv1.testclientid";
process.env.GITHUB_CLIENT_SECRET = "github-oauth-client-secret";
process.env.GITHUB_REDIRECT_URI = "http://localhost:4000/api/v1/github/callback";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { GithubConnectorService } = await import("./githubConnector.service.js");

const ORG = "org-alpha";
const USER = "user-ada";

function mockFetch(routes: Array<{ match: RegExp; method?: string; respond: () => { status: number; json?: unknown; text?: string } }>) {
  const calls: Array<{ method: string; url: string }> = [];
  const fn = async (url: string, init?: any) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    for (const r of routes) {
      if ((!r.method || r.method === method) && r.match.test(url)) {
        const res = r.respond();
        return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.json, text: async () => res.text ?? "" } as any;
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "unexpected" } as any;
  };
  return { fn, calls };
}

const userRoutes = (login = "octocat", orgs: string[] = ["acme"]) => [
  { match: /\/user\/orgs/, respond: () => ({ status: 200, json: orgs.map((o) => ({ login: o })) }) },
  { match: /\/user$/, respond: () => ({ status: 200, json: { login, html_url: `https://github.com/${login}`, avatar_url: "https://avatars.example/o" } }) },
];

async function connectPat(org = ORG, user = USER, token = "ghp_userpatsecret1234567890", login = "octocat") {
  const { fn } = mockFetch(userRoutes(login));
  return GithubConnectorService.connectPat(org, user, token, fn);
}

beforeEach(() => {
  db.reset();
  kv.strings.clear(); kv.hashes.clear(); kv.lists.clear(); kv.sets.clear(); kv.zsets.clear();
});

describe("getStatus", () => {
  it("reports disconnected before any connection", async () => {
    const s = await GithubConnectorService.getStatus(ORG, USER);
    expect(s.connection.connected).toBe(false);
    expect(s.config.oauthReady).toBe(true);
    expect(s.connectNote).toBeTruthy();
  });

  it("reports connected after a PAT connect (without leaking the token)", async () => {
    await connectPat();
    const s = await GithubConnectorService.getStatus(ORG, USER);
    expect(s.connection.connected).toBe(true);
    expect(s.connection.login).toBe("octocat");
    expect(JSON.stringify(s)).not.toContain("ghp_userpatsecret1234567890");
  });
});

describe("verify", () => {
  it("re-verifies a connected account and refreshes login/orgs", async () => {
    await connectPat(ORG, USER, "ghp_userpatsecret1234567890", "octocat");
    const { fn } = mockFetch(userRoutes("octocat-renamed", ["acme", "globex"]));
    const refreshed = await GithubConnectorService.verify(ORG, USER, fn);
    expect(refreshed.login).toBe("octocat-renamed");
    expect(refreshed.organizations).toContain("globex");
    expect(refreshed.connected).toBe(true);
  });

  it("errors when verifying an account that is not connected", async () => {
    await expect(GithubConnectorService.verify(ORG, USER)).rejects.toThrow(/not connected/i);
  });
});

describe("disconnect", () => {
  it("returns true and clears the connection, then false on a second call", async () => {
    await connectPat();
    expect(await GithubConnectorService.disconnect(ORG, USER)).toBe(true);
    expect((await GithubConnectorService.getStatus(ORG, USER)).connection.connected).toBe(false);
    expect(await GithubConnectorService.disconnect(ORG, USER)).toBe(false);
  });
});

describe("listRepos", () => {
  it("maps the GitHub repos payload to the public shape", async () => {
    await connectPat();
    const { fn } = mockFetch([
      { match: /\/user\/repos/, respond: () => ({ status: 200, json: [
        { full_name: "octocat/hello", html_url: "https://github.com/octocat/hello", default_branch: "main", updated_at: "2026-01-01T00:00:00Z" },
        { full_name: "octocat/world", html_url: "https://github.com/octocat/world", default_branch: "dev", updated_at: "2026-02-01T00:00:00Z" },
      ] }) },
    ]);
    const repos = await GithubConnectorService.listRepos(ORG, USER, fn);
    expect(repos).toHaveLength(2);
    expect(repos[0]).toMatchObject({ fullName: "octocat/hello", defaultBranch: "main" });
    expect(repos[1].defaultBranch).toBe("dev");
  });

  it("errors when listing repos while not connected", async () => {
    await expect(GithubConnectorService.listRepos(ORG, USER)).rejects.toThrow(/not connected/i);
  });
});

describe("OAuth callback hardening", () => {
  it("sanitizes an off-site returnTo to the in-app default", async () => {
    const started = await GithubConnectorService.startOauth(ORG, USER, "https://evil.example/steal");
    const { fn } = mockFetch([
      { match: /login\/oauth\/access_token/, method: "POST", respond: () => ({ status: 200, json: { access_token: "gho_secretabcdefghijklmnop", scope: "repo" } }) },
      ...userRoutes("octo", []),
    ]);
    const result = await GithubConnectorService.handleOauthCallback({ code: "abc", state: started.state }, fn);
    expect(result.returnTo).toBe("/app/github"); // not the off-site URL
  });

  it("surfaces a token-exchange HTTP failure as bad request", async () => {
    const started = await GithubConnectorService.startOauth(ORG, USER, "/app/github");
    const { fn } = mockFetch([
      { match: /login\/oauth\/access_token/, method: "POST", respond: () => ({ status: 400, text: "bad_verification_code" }) },
    ]);
    await expect(GithubConnectorService.handleOauthCallback({ code: "abc", state: started.state }, fn)).rejects.toThrow(/token exchange failed/i);
  });

  it("rejects when GitHub returns no access_token", async () => {
    const started = await GithubConnectorService.startOauth(ORG, USER, "/app/github");
    const { fn } = mockFetch([
      { match: /login\/oauth\/access_token/, method: "POST", respond: () => ({ status: 200, json: { error: "bad_verification_code", error_description: "The code is incorrect" } }) },
    ]);
    await expect(GithubConnectorService.handleOauthCallback({ code: "abc", state: started.state }, fn)).rejects.toThrow(/incorrect/i);
  });
});

describe("connection isolation", () => {
  it("does not surface one user's connection to another user or org", async () => {
    await connectPat(ORG, USER, "ghp_userpatsecret1234567890", "octocat");
    expect((await GithubConnectorService.getStatus(ORG, "other-user")).connection.connected).toBe(false);
    expect((await GithubConnectorService.getStatus("other-org", USER)).connection.connected).toBe(false);
  });
});
