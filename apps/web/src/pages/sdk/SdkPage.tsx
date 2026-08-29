/**
 * WINDELS AI OS — Enterprise SDK console.
 *
 * SDK packages, CLI command reference, code templates and emulator instances.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Code2, Terminal, BookOpen, Rocket, X } from "lucide-react";
import type { SdkDashboard } from "@windels/shared";
import { sdkApi } from "@/lib/sdk";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function SdkPage() {
  const [dash, setDash] = useState<SdkDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setDash(await sdkApi.dashboard()); } catch (e: any) { setErr(e?.message ?? "Failed to load"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading SDK…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Code2 className="h-6 w-6 text-azure" /> Enterprise SDK</h1>
          <p className="text-sm text-text-muted">Client packages, CLI, templates &amp; emulators.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total downloads" value={dash.totalDownloads.toLocaleString()} />
        <Stat label="Emulators running" value={dash.emulatorsRunning} />
        <Stat label="Debug sessions" value={dash.debugSessionsActive} />
        <Stat label="Profile runs (30d)" value={dash.profileRuns30d} />
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold">{dash.latestCliVersion}</div>
          <div className="text-sm text-text-muted">Latest CLI</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold">{dash.docsCoveragePct}%</div>
          <div className="text-sm text-text-muted">Docs coverage</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="packages">
        <TabsList>
          <TabsTrigger value="packages">Packages ({dash.packages.length})</TabsTrigger>
          <TabsTrigger value="cli">CLI ({dash.commands.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({dash.templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="packages">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {dash.packages.length === 0 ? (
                <div className="text-sm text-text-muted">No SDK packages published.</div>
              ) : dash.packages.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline">{p.language}</Badge>
                      <Badge variant="outline">v{p.version}</Badge>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{p.downloads.toLocaleString()} downloads</div>
                  </div>
                  <span className="text-xs text-text-muted shrink-0">{(p.sizeBytes / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cli">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {dash.commands.length === 0 ? (
                <div className="text-sm text-text-muted">No CLI commands documented.</div>
              ) : dash.commands.map((c) => (
                <div key={c.name} className="border-b border-border/30 py-1.5 text-sm">
                  <div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-azure"/><code className="font-mono text-azure">{c.name}</code><Badge variant="outline">{c.group}</Badge></div>
                  <div className="text-xs text-text-muted mt-0.5">{c.description}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {dash.templates.length === 0 ? (
                <div className="text-sm text-text-muted">No code templates yet.</div>
              ) : dash.templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/30 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="h-4 w-4 text-azure shrink-0"/>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.name} <Badge variant="outline">{t.language}</Badge></div>
                      <div className="text-xs text-text-muted truncate">{t.description}</div>
                    </div>
                  </div>
                  <span className="text-xs text-text-muted shrink-0">★ {t.stars} · {t.fileCount} files</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SdkPage;
