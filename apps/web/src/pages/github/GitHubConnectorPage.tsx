import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Github, Shield } from "lucide-react";
import { githubConnectorApi, type GithubConnectorStatus, type GithubRemoteRepo } from "@/lib/githubConnector";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export function GitHubConnectorPage() {
  const [search] = useSearchParams();
  const [status, setStatus] = useState<GithubConnectorStatus | null>(null);
  const [repos, setRepos] = useState<GithubRemoteRepo[] | null>(null);
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    try {
      const next = await githubConnectorApi.status();
      setStatus(next);
      setErr(null);
      if (next.connection.connected) {
        try { setRepos(await githubConnectorApi.repos()); }
        catch { setRepos(null); }
      } else {
        setRepos(null);
      }
    } catch (e) { fail(e); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (search.get("connected") === "1") setNotice("GitHub account connected.");
    const message = search.get("message") || search.get("error");
    if (search.get("error") && message) setErr(message);
  }, [search]);

  async function connectOauth() {
    setBusy(true);
    try {
      const started = await githubConnectorApi.startOauth("/app/github");
      window.location.href = started.url;
    } catch (e) { fail(e); setBusy(false); }
  }

  async function connectPat() {
    setBusy(true);
    try {
      await githubConnectorApi.connectPat(token);
      setToken("");
      setNotice("GitHub token verified and stored encrypted.");
      await load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
          <Github className="h-6 w-6 text-azure" /> GitHub
        </h1>
        <p className="text-sm text-text-muted">
          Connect your GitHub account. WINDELS verifies the credential against GitHub before storing it encrypted.
        </p>
      </div>
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {status ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Connection</CardTitle>
              <CardDescription>{status.connectNote}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.connection.connected ? (
                <div className="flex flex-wrap items-center gap-3">
                  {status.connection.avatarUrl ? <img src={status.connection.avatarUrl} alt="" className="h-12 w-12 rounded-full" /> : null}
                  <div>
                    <div className="font-medium text-text-bright">{status.connection.login}</div>
                    <div className="text-xs text-text-muted">
                      {status.connection.method === "oauth" ? "OAuth App" : "Personal access token"} · token {status.connection.tokenMasked}
                    </div>
                    <div className="text-xs text-text-muted">
                      Orgs: {status.connection.organizations.join(", ") || "—"} · last verified {status.connection.lastVerifiedAt ? new Date(status.connection.lastVerifiedAt).toLocaleString() : "—"}
                    </div>
                  </div>
                  <Badge variant="emerald">Connected</Badge>
                </div>
              ) : (
                <p className="text-sm text-text-muted">Not connected. Use OAuth (if configured) or a personal access token.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {status.connection.connected ? (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await githubConnectorApi.verify(); await load(); setNotice("Token re-checked with GitHub."); } catch (e) { fail(e); } finally { setBusy(false); } }}>Re-verify</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (!window.confirm("Disconnect this GitHub account?")) return; setBusy(true); try { await githubConnectorApi.disconnect(); await load(); setNotice("Disconnected."); } catch (e) { fail(e); } finally { setBusy(false); } }}>Disconnect</Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What you need to connect</CardTitle>
              <CardDescription>OAuth is optional. A personal access token always works.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border border-white/10 p-3">
                <div className="mb-1 flex items-center gap-2 font-medium text-text-bright">
                  Option A — GitHub OAuth App
                  {status.config.oauthReady ? <Badge variant="emerald">Ready</Badge> : <Badge variant="amber">Not configured</Badge>}
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-text-muted">
                  <li>GitHub → Settings → Developer settings → OAuth Apps → New OAuth App</li>
                  <li>Authorization callback URL must be exactly <code className="rounded bg-white/5 px-1">{status.config.redirectUri}</code></li>
                  <li>Copy Client ID and Client Secret into Super Admin → Site control → APIs, or set <code className="rounded bg-white/5 px-1">GITHUB_CLIENT_ID</code>, <code className="rounded bg-white/5 px-1">GITHUB_CLIENT_SECRET</code>, <code className="rounded bg-white/5 px-1">GITHUB_REDIRECT_URI</code></li>
                  <li>Scopes requested: {status.config.scopes.join(", ")}</li>
                </ol>
                {status.config.missing.length ? <p className="mt-2 text-xs text-amber-200">Missing: {status.config.missing.join(", ")}</p> : null}
                <p className="mt-2 text-xs text-text-muted">{status.config.note}</p>
                <Button className="mt-3" disabled={busy || !status.config.oauthReady} onClick={() => void connectOauth()}>
                  {status.config.oauthReady ? "Connect with GitHub" : "OAuth not configured"}
                </Button>
              </div>

              <div className="rounded-lg border border-white/10 p-3">
                <div className="mb-1 font-medium text-text-bright">Option B — Personal access token</div>
                <p className="text-text-muted">
                  GitHub → Settings → Developer settings → Personal access tokens. Classic or fine-grained. Grant at least {status.config.scopes.join(", ")}.
                  The token is verified, then encrypted. It is never shown again.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input className="max-w-md" type="password" placeholder="ghp_… or github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
                  <Button disabled={busy || token.trim().length < 8} onClick={() => void connectPat()}>Connect token</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {status.connection.connected ? (
            <Card>
              <CardHeader><CardTitle>Repositories</CardTitle><CardDescription>Listed from GitHub for the connected account. Empty means GitHub returned none.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {repos === null ? <p className="text-sm text-text-muted">Could not load repositories.</p> : repos.length === 0 ? <p className="text-sm text-text-muted">No repositories returned.</p> : repos.map((r) => (
                  <div key={r.fullName} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                    <a href={r.url} className="text-azure hover:underline" target="_blank" rel="noreferrer">{r.fullName}</a>
                    <span className="text-xs text-text-muted">{r.defaultBranch}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Shield className="h-3.5 w-3.5" />
            Org-scoped workforce GitHub connections remain under AI Engineering. This page is your own account.
          </p>
        </>
      ) : (
        <p className="text-sm text-text-muted">Loading GitHub connector…</p>
      )}
    </div>
  );
}

export default GitHubConnectorPage;
