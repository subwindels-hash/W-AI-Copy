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

const { GithubConnectorService, githubOauthStatus } = await import("./githubConnector.service.js");

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
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          json: async () => res.json,
          text: async () => res.text ?? "",
        } as any;
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "unexpected" } as any;
  };
  return { fn, calls };
}

beforeEach(() => {
  db.reset();
  kv.strings.clear(); kv.hashes.clear(); kv.lists.clear(); kv.sets.clear(); kv.zsets.clear();
});

describe("GitHub connector config", () => {
  it("reports OAuth readiness without returning the secret", () => {
    const status = githubOauthStatus();
    expect(status.oauthReady).toBe(true);
    expect(status.clientIdMasked).toContain("…");
    expect(status.clientSecretPresent).toBe(true);
    expect(JSON.stringify(status)).not.toContain("github-oauth-client-secret");
    expect(status.redirectUri).toContain("/api/v1/github/callback");
    expect(status.scopes).toContain("repo");
  });
});

describe("GitHub PAT connect", () => {
  it("verifies the token, encrypts it, and never returns the secret", async () => {
    const { fn } = mockFetch([
      { match: /\/user\/orgs/, respond: () => ({ status: 200, json: [{ login: "acme" }] }) },
      { match: /\/user$/, respond: () => ({ status: 200, json: { login: "octocat", html_url: "https://github.com/octocat", avatar_url: "https://avatars.example/o" } }) },
    ]);
    const conn = await GithubConnectorService.connectPat(ORG, USER, "ghp_userpatsecret1234567890", fn);
    expect(conn.connected).toBe(true);
    expect(conn.login).toBe("octocat");
    expect(conn.tokenMasked).not.toContain("userpatsecret");
    expect(JSON.stringify(conn)).not.toContain("ghp_userpatsecret1234567890");
    const raw = await kv.hget(`ghc:conn:${ORG}:${USER}`, "doc");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("ghp_userpatsecret1234567890");
    expect(JSON.parse(raw!).tokenEnc.v).toBe("enc.v1");
  });

  it("rejects a credential GitHub does not accept", async () => {
    const { fn } = mockFetch([{ match: /\/user/, respond: () => ({ status: 401, text: "Bad credentials" }) }]);
    await expect(GithubConnectorService.connectPat(ORG, USER, "ghp_badtokenbadtokenbad", fn)).rejects.toMatchObject({ status: 401 });
    const status = await GithubConnectorService.getStatus(ORG, USER);
    expect(status.connection.connected).toBe(false);
  });
});

describe("GitHub OAuth", () => {
  it("starts OAuth with CSRF state and exchanges the code", async () => {
    const started = await GithubConnectorService.startOauth(ORG, USER, "/app/github");
    expect(started.url).toContain("https://github.com/login/oauth/authorize");
    expect(started.url).toContain("client_id=Iv1.testclientid");
    expect(started.state.length).toBeGreaterThan(10);

    const { fn } = mockFetch([
      { match: /login\/oauth\/access_token/, method: "POST", respond: () => ({ status: 200, json: { access_token: "gho_oauthsecretabcdefghijklmnop", scope: "read:user,user:email,repo" } }) },
      { match: /\/user\/orgs/, respond: () => ({ status: 200, json: [] }) },
      { match: /\/user$/, respond: () => ({ status: 200, json: { login: "octo", html_url: "https://github.com/octo" } }) },
    ]);
    const result = await GithubConnectorService.handleOauthCallback({ code: "abc", state: started.state }, fn);
    expect(result.returnTo).toBe("/app/github");
    const status = await GithubConnectorService.getStatus(ORG, USER);
    expect(status.connection.login).toBe("octo");
    expect(status.connection.method).toBe("oauth");
    expect(JSON.stringify(status)).not.toContain("gho_oauthsecret");
  });

  it("refuses a missing or expired OAuth state", async () => {
    await expect(GithubConnectorService.handleOauthCallback({ code: "x", state: "nope" })).rejects.toThrow(/state/i);
  });
});
