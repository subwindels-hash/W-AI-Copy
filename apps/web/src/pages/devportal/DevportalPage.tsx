/**
 * WINDELS AI OS — Developer Portal console.
 *
 * SDK registry, CLI reference, dev environments and the deployment/toolkit
 * test runner. Downloads/stars are undefined until a real registry reports
 * them — nothing is invented.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Code2, Terminal, Play, FlaskConical, Rocket, X } from "lucide-react";
import type { DevPortalDashboard, SDKPackage, DevEnvironment, CLICommand, TestSuiteRun, DeploymentKitRun } from "@windels/shared";
import { devApi } from "@/lib/devPortal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

function envTone(s?: string): any {
  return s === "running" ? "emerald" : s === "starting" ? "azure" : s === "stopped" ? "slate" : "crimson";
}

export function DevportalPage() {
  const [dash, setDash] = useState<DevPortalDashboard | null>(null);
  const [sdks, setSdks] = useState<SDKPackage[]>([]);
  const [cli, setCli] = useState<CLICommand[]>([]);
  const [envs, setEnvs] = useState<DevEnvironment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, s, c, e] = await Promise.all([devApi.dashboard(), devApi.listSdks(), devApi.listCli(), devApi.listEnvs()]);
      setDash(d); setSdks(s); setCli(c); setEnvs(e);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleEnv(id: string, start: boolean) {
    setErr(null);
    try { if (start) await devApi.startEnv(id); else await devApi.stopEnv(id); await load(); }
    catch (e: any) { setErr(e?.message ?? "Env action failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading developer portal…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Code2 className="h-6 w-6 text-azure" /> Developer Portal</h1>
          <p className="text-sm text-text-muted">SDK registry, CLI reference, environments &amp; deployment toolkit.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="SDKs" value={dash.totalSdks} />
        <Stat label="GA / beta / preview" value={`${dash.gaCount}/${dash.betaCount}/${dash.previewCount}`} />
        <Stat label="CLI commands" value={dash.totalCliCommands} />
        <Stat label="Running environments" value={dash.runningEnvironments} />
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.latestSdkVersion}</div><div className="text-sm text-text-muted">Latest SDK</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.weeklyDownloadsTotal.toLocaleString()}</div><div className="text-sm text-text-muted">Downloads (7d)</div></CardContent></Card>
      </div>

      <Tabs defaultValue="sdk">
        <TabsList>
          <TabsTrigger value="sdk">SDK registry ({sdks.length})</TabsTrigger>
          <TabsTrigger value="cli">CLI ({cli.length})</TabsTrigger>
          <TabsTrigger value="envs">Environments ({envs.length})</TabsTrigger>
          <TabsTrigger value="runs">Toolkit runs</TabsTrigger>
        </TabsList>

        <TabsContent value="sdk">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {sdks.length === 0 ? (
                <div className="text-sm text-text-muted">No SDK packages in the registry.</div>
              ) : sdks.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.name}</span>
                      <Badge variant="outline">{s.language}</Badge>
                      <Badge variant="outline">v{s.version}</Badge>
                      <Badge variant={s.status === "ga" ? "emerald" : s.status === "beta" ? "amber" : "slate"}>{s.status}</Badge>
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">{s.description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {s.stars !== undefined && <div className="text-xs text-text-muted">★ {s.stars.toLocaleString()}</div>}
                    <code className="text-[11px] text-azure">{s.installSnippet}</code>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cli">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {cli.length === 0 ? (
                <div className="text-sm text-text-muted">No CLI commands documented.</div>
              ) : cli.map((c) => (
                <div key={c.id} className="border-b border-border/30 py-1.5 text-sm">
                  <div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-azure"/><code className="font-mono text-azure">{c.name}</code><Badge variant="outline">{c.group}</Badge></div>
                  <div className="text-xs text-text-muted mt-0.5">{c.summary}</div>
                  <code className="text-[11px] text-text-muted">{c.usage}</code>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="envs">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {envs.length === 0 ? (
                <div className="text-sm text-text-muted">No dev environments.</div>
              ) : envs.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Play className="h-4 w-4 text-azure shrink-0"/>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{e.name} <Badge variant="outline">{e.kind}</Badge></div>
                      <div className="text-xs text-text-muted truncate">{e.services.join(", ")} · {e.ports.map((p) => `${p.name}:${p.port}`).join(", ")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={envTone(e.status)}>{e.status}</Badge>
                    {e.status === "stopped" ? (
                      <Button size="sm" variant="outline" onClick={() => void toggleEnv(e.id, true)}>Start</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void toggleEnv(e.id, false)}>Stop</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-azure"/>Test runs</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {dash.recentRuns.length === 0 ? <div className="text-sm text-text-muted">No test runs.</div> : dash.recentRuns.map((r: TestSuiteRun) => (
                  <div key={r.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                    <span className="truncate">{r.name} <span className="text-text-muted text-xs">· {r.target}</span></span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-text-muted text-xs">{r.passed}/{r.passed + r.failed}</span>
                      <Badge variant={r.status === "passed" ? "emerald" : r.status === "failed" ? "crimson" : "azure"}>{r.status}</Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-azure"/>Deployments</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {dash.recentDeploys.length === 0 ? <div className="text-sm text-text-muted">No deployments.</div> : dash.recentDeploys.map((d: DeploymentKitRun) => (
                  <div key={d.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                    <span className="truncate">{d.service} <Badge variant="outline">{d.target}</Badge></span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-text-muted text-xs">{fmtDate(d.startedAt)}</span>
                      <Badge variant={d.status === "passed" ? "emerald" : d.status === "failed" ? "crimson" : "azure"}>{d.status}</Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DevportalPage;
