/**
 * WINDELS AI OS — Core Integration console.
 *
 * The Session 45 checkpoint: how many of the S1–S45 systems are wired into
 * the kernel event bus, vs stubbed/missing, plus the dispatch roundtrip and a
 * go/no-go for the next phase. All figures come from the live checkpoint.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Link2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import type { CeilCheckpointReport } from "@windels/shared";
import { ceiApi } from "@/lib/coreIntegration";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function CoreIntegrationPage() {
  const [report, setReport] = useState<CeilCheckpointReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setReport(await ceiApi.checkpoint()); } catch (e: any) { setErr(e?.message ?? "Failed to load"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!report) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading core integration checkpoint…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Link2 className="h-6 w-6 text-azure" /> Core Integration</h1>
          <p className="text-sm text-text-muted">Session 45 checkpoint — kernel bus wiring across S1–S45 systems.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-emerald-500">{report.wired}</div><div className="text-sm text-text-muted">Wired</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-amber-500">{report.stubs}</div><div className="text-sm text-text-muted">Stubs</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-crimson">{report.missing}</div><div className="text-sm text-text-muted">Missing</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{report.kernelDispatchRoundtripMs}ms</div><div className="text-sm text-text-muted">Kernel dispatch</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {report.criticalPassed ? <CheckCircle2 className="h-5 w-5 text-emerald-400"/> : <AlertTriangle className="h-5 w-5 text-amber-400"/>}
            {report.criticalPassed ? "Critical path passing" : "Critical path blocked"}
          </CardTitle>
          <CardDescription>canProceedToSession46: <Badge variant={report.canProceedToSession46 ? "emerald" : "crimson"}>{String(report.canProceedToSession46)}</Badge></CardDescription>
        </CardHeader>
        <CardContent>
          {report.blockers.length > 0 ? (
            <div className="space-y-1">
              <div className="text-sm text-text-muted mb-1">Blockers:</div>
              {report.blockers.map((b, i) => (
                <div key={i} className="text-sm text-red-300 flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> {b}</div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-emerald-300">No blockers.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>System links ({report.links.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {report.links.length === 0 ? (
            <div className="text-sm text-text-muted">No links recorded.</div>
          ) : report.links.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 border-b border-border/30 py-1 text-sm">
              <div className="min-w-0">
                <div className="truncate">{l.name}</div>
                <div className="text-xs text-text-muted truncate">{l.routesThrough.join(" → ")}</div>
              </div>
              <Badge variant={l.status === "wired" ? "emerald" : l.status === "stub" ? "amber" : "crimson"}>{l.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default CoreIntegrationPage;
