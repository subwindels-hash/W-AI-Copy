/**
 * WINDELS AI OS — Release Management console.
 *
 * Releases, DORA metrics, validation and approval gates. Metrics are computed
 * from real release history.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Rocket, CheckCircle2, RotateCcw, X, TrendingUp } from "lucide-react";
import type { ReleaseMetrics, DoraMetrics, PipelineRelease } from "@windels/shared";
import { releaseApi } from "@/lib/release";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

function statusTone(s?: string): any {
  return s === "deployed" || s === "completed" || s === "live" ? "emerald"
    : s === "deploying" || s === "staging" || s === "validating" ? "azure"
    : s === "failed" || s === "rolled_back" ? "crimson"
    : s === "pending" || s === "approved" ? "amber" : "slate";
}

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function ReleasePage() {
  const [metrics, setMetrics] = useState<ReleaseMetrics | null>(null);
  const [releases, setReleases] = useState<PipelineRelease[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [m, r] = await Promise.all([releaseApi.metrics(), releaseApi.list(50)]);
      setMetrics(m); setReleases(r);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, kind: "validate" | "staging" | "promote" | "rollback") {
    setErr(null);
    try {
      if (kind === "validate") await releaseApi.runValidation(id);
      else if (kind === "staging") await releaseApi.deployStaging(id);
      else if (kind === "promote") await releaseApi.promote(id);
      else await releaseApi.rollback(id);
      await load();
    } catch (e: any) { setErr(e?.message ?? `Action failed (${kind})`); }
  }

  if (!metrics) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading releases…"}</div>;
  }

  const dora: DoraMetrics = metrics.dora;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Rocket className="h-6 w-6 text-azure" /> Release Management</h1>
          <p className="text-sm text-text-muted">Releases, approvals, deployment &amp; DORA metrics.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total releases" value={metrics.total} />
        <Stat label="Success rate" value={`${Math.round(metrics.successRate * 100)}%`} />
        <Stat label="Avg lead time" value={`${metrics.avgLeadTimeHours}h`} />
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold flex items-center gap-1"><TrendingUp className="h-6 w-6 text-azure"/>{dora.deploymentFrequency}</div>
          <div className="text-sm text-text-muted">Deployments ({dora.periodDays}d)</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>DORA metrics</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">Deployment frequency</div><div className="text-2xl font-semibold">{dora.deploymentFrequency}</div></div>
          <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">Lead time</div><div className="text-2xl font-semibold">{dora.leadTimeHours}h</div></div>
          <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">Change fail rate</div><div className="text-2xl font-semibold">{Math.round(dora.changeFailRate * 100)}%</div></div>
          <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">MTTR</div><div className="text-2xl font-semibold">{dora.mttrHours}h</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Releases ({releases.length})</CardTitle><CardDescription>{busy ? "Refreshing…" : ""}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {releases.length === 0 ? (
            <div className="text-sm text-text-muted">No releases yet.</div>
          ) : releases.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.title}</span>
                  <Badge variant="outline">v{r.version}</Badge>
                  <Badge variant="outline">{r.environment}</Badge>
                  <Badge variant="outline">{r.strategy}</Badge>
                  <Badge variant={statusTone(r.status)}>{r.status}</Badge>
                </div>
                <div className="text-xs text-text-muted mt-0.5">{r.service}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                {r.status !== "deployed" && <Button size="sm" variant="outline" onClick={() => void act(r.id, "validate")}>Validate</Button>}
                {r.status !== "deployed" && <Button size="sm" variant="outline" onClick={() => void act(r.id, "staging")}>Staging</Button>}
                {r.status !== "deployed" && <Button size="sm" variant="outline" onClick={() => void act(r.id, "promote")}><CheckCircle2 className="h-3 w-3 mr-1"/>Promote</Button>}
                {r.status === "deployed" && <Button size="sm" variant="outline" onClick={() => void act(r.id, "rollback")}><RotateCcw className="h-3 w-3 mr-1"/>Rollback</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default ReleasePage;
