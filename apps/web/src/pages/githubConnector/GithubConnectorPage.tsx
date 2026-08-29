/**
 * WINDELS AI OS — GitHub Connector console.
 *
 * Connect via OAuth or PAT, verify the connection, and browse accessible
 * remote repositories. Connection state comes from the real connector.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Github, Link2, Unplug, KeyRound, CheckCircle2, X } from "lucide-react";
import type { GithubConnectorStatus, GithubConnectionPublic, GithubRemoteRepo } from "@windels/shared/githubConnector";
import { githubConnectorApi } from "@/lib/githubConnector";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function statusTone(s?: string): any {
  return s === "connected" ? "emerald" : s === "disconnected" ? "slate" : s === "error" ? "crimson" : "amber";
}

export function GithubConnectorPage() {
  const [status, setStatus] = useState<GithubConnectorStatus | null>(null);
  const [repos, setRepos] = useState<GithubRemoteRepo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // PAT form
  const [pat, setPat] = useState("");
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const s = await githubConnectorApi.status();
      setStatus(s);
      setRepos(s.connection.connected ? await githubConnectorApi.repos() : []);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connectPat() {
    if (!pat.trim()) { setErr("Enter a personal access token."); return; }
    setErr(null);
    try { await githubConnectorApi.connectPat(pat.trim(), label.trim() || undefined); setPat(""); setLabel(""); await load(); }
    catch (e: any) { setErr(e?.message ?? "Connect failed"); }
  }

  async function startOauth() {
    setErr(null);
    try { const { url } = await githubConnectorApi.startOauth(); window.location.href = url; }
    catch (e: any) { setErr(e?.message ?? "OAuth start failed"); }
  }

  async function disconnect() {
    setErr(null);
    try { await githubConnectorApi.disconnect(); await load(); } catch (e: any) { setErr(e?.message ?? "Disconnect failed"); }
  }

  const conn: GithubConnectionPublic | null = status?.connection ?? null;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Github className="h-6 w-6 text-azure" /> GitHub Connector</h1>
          <p className="text-sm text-text-muted">Connect your GitHub account to the engineering agent.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}
      {status?.connectNote && <div className="text-xs text-text-muted">{status.connectNote}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-azure" />
            Connection
            {conn && <Badge variant={statusTone(conn.status)}>{conn.status}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conn?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {conn.avatarUrl ? <img src={conn.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : <Github className="h-10 w-10 text-text-muted"/>}
                <div>
                  <div className="font-medium">{conn.login}</div>
                  <a href={conn.profileUrl ?? undefined} className="text-xs text-azure" target="_blank" rel="noreferrer">view profile</a>
                </div>
                <div className="ml-auto text-right text-xs text-text-muted">
                  <div>token {conn.tokenMasked ?? "—"}</div>
                  <div>method {conn.method ?? "—"}</div>
                </div>
              </div>
              {conn.scopes.length > 0 && <div className="flex flex-wrap gap-1">{conn.scopes.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>}
              <Button variant="outline" onClick={() => void disconnect()}><Unplug className="h-4 w-4 mr-1"/>Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={() => void startOauth()}><Github className="h-4 w-4 mr-1"/>Connect with GitHub</Button>
              </div>
              <div className="text-xs text-text-muted">or connect with a personal access token (fine-grained, `repo` scope):</div>
              <div className="flex flex-col md:flex-row gap-2">
                <Input placeholder="GitHub PAT" value={pat} onChange={(e) => setPat(e.target.value)} type="password" className="flex-1" />
                <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
                <Button variant="outline" onClick={() => void connectPat()}><KeyRound className="h-4 w-4 mr-1"/>Connect PAT</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Accessible repositories ({repos.length})</CardTitle><CardDescription>{busy ? "Refreshing…" : "Repos the connector can read."}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {repos.length === 0 ? (
            <div className="text-sm text-text-muted flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400"/> {conn?.connected ? "No repos found." : "Connect a GitHub account to list repos."}</div>
          ) : repos.map((r) => (
            <div key={r.fullName} className="flex items-center justify-between border-b border-border/30 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0"><Github className="h-4 w-4 text-azure shrink-0"/><span className="truncate">{r.fullName}</span></div>
              <Badge variant="outline">{r.defaultBranch}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default GithubConnectorPage;
