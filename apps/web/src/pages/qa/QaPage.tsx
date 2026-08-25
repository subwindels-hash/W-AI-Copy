/**
 * WINDELS AI OS — QA Platform console.
 *
 * Test suites, cases, runs and coverage. Pass rates and failures come from
 * real runs — nothing is fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, FlaskConical, Play, X } from "lucide-react";
import type { QADashboard, TestSuite, TestRun } from "@windels/shared/qa";
import { qaApi } from "@/lib/qa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function runTone(s: string): any {
  return s === "passed" || s === "completed" ? "emerald"
    : s === "running" ? "azure"
    : s === "failed" ? "crimson" : "slate";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function QaPage() {
  const [dash, setDash] = useState<QADashboard | null>(null);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, s, r] = await Promise.all([qaApi.dashboard(), qaApi.listSuites(), qaApi.listRuns(20)]);
      setDash(d); setSuites(s); setRuns(r);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runSuite(id: string) {
    setErr(null); try { await qaApi.runSuite(id); await load(); } catch (e: any) { setErr(e?.message ?? "Run failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading QA…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FlaskConical className="h-6 w-6 text-azure" /> QA Platform</h1>
          <p className="text-sm text-text-muted">Test suites, cases, runs and coverage.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Suites" value={dash.totalSuites} />
        <Stat label="Cases" value={dash.totalCases} />
        <Stat label="Pass rate (7d)" value={`${Math.round(dash.passRate7d * 100)}%`} />
        <Stat label="Open failures" value={dash.openFailures} />
      </div>

      <Card>
        <CardHeader><CardTitle>Coverage by category</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(dash.coverage).map(([k, v]) => (
            <div key={k} className="rounded border border-border/40 p-3">
              <div className="text-xs text-text-muted capitalize">{k}</div>
              <div className="text-2xl font-semibold">{Math.round(v * 100)}%</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="suites">
        <TabsList>
          <TabsTrigger value="suites">Suites ({suites.length})</TabsTrigger>
          <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="suites">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {suites.length === 0 ? (
                <div className="text-sm text-text-muted">No test suites yet.</div>
              ) : suites.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.name}</div>
                    {s.description && <div className="text-xs text-text-muted truncate">{s.description}</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void runSuite(s.id)}><Play className="h-3 w-3 mr-1"/>Run</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardContent className="space-y-1 pt-4">
              {runs.length === 0 ? (
                <div className="text-sm text-text-muted">No runs yet.</div>
              ) : runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                  <span className="truncate">{r.suiteName ?? r.suiteId}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-text-muted text-xs">{r.passed}/{r.total} · {fmtDate(r.startedAt)}</span>
                    <Badge variant={runTone(r.status)}>{r.status}</Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default QaPage;
