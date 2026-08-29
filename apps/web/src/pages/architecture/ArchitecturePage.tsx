/**
 * Session 193 — Tier 4 architecture console.
 *
 * `architecture` (Session 37) had 10 routes and a 17-LOC client but no
 * console page. The dashboard reported the same global architecture
 * registry for every tenant (S193 closed that leak by per-org keys).
 * This page is the first UI surface, mirroring the S193 honesty
 * discipline: a fresh org sees honest zeros, the ESI signal feed
 * lists only the calling org's own signals, and the cross-portfolio
 * report calls benchmarks / mediaGen / trading with the calling org's
 * id rather than org-windels'.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, RefreshCw, ShieldCheck, Wifi, X } from "lucide-react";
import type {
  ArchitectureModule,
  ArchitectureStatus,
  EsiFeed,
  EsiPortfolioReport,
} from "@windels/shared";
import { architectureApi } from "@/lib/architecture";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

function fmtTimestamp(s: string) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function StatusBadge({ status }: { status: ArchitectureModule["status"] }) {
  if (status === "available") return <Badge variant="emerald"><ShieldCheck className="h-3 w-3 mr-1"/>Available</Badge>;
  if (status === "in-development") return <Badge variant="amber">In development</Badge>;
  return <Badge variant="slate">Stub</Badge>;
}

export function ArchitecturePage() {
  const [status, setStatus] = useState<ArchitectureStatus | null>(null);
  const [esi, setEsi] = useState<EsiFeed | null>(null);
  const [report, setReport] = useState<EsiPortfolioReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [s, e, r] = await Promise.all([
        architectureApi.status(),
        architectureApi.esi(),
        architectureApi.esiReport(),
      ]);
      setStatus(s);
      setEsi(e);
      setReport(r);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!status || !esi || !report) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading architecture…"}</div>;

  const empty = status.modules.length === 0 && esi.signals.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Architecture</h1>
          <p className="text-sm text-text-muted">Per-org module registry, ESI signal feed, and cross-portfolio strategic report. The S193 fix made every section org-scoped — values shown are the calling org's own.</p>
        </div>
        <Button variant="ghost" onClick={load} loading={busy}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {empty && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">No architecture records yet</div>
            <div className="text-text-muted">This organization has not registered any modules, posted any ESI signals, or had the cross-portfolio report built. Counts below are honest zeros.</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>Modules registered</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{status.modules.length}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>ESI signals (this org)</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{esi.signals.length}</div><div className="text-xs text-text-muted">last: {esi.signals[0] ? fmtTimestamp(esi.signals[0].at) : "—"}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Monitored domains</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{report.overview.monitoredDomains}</div><div className="text-xs text-text-muted">healthy: {report.overview.healthyDomains ?? "—"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><Boxes className="h-4 w-4 inline mr-1"/>Module registry</CardTitle>
          <CardDescription>Per-org architecture modules and their dependencies. Status reflects each module's S37 declaration, updated as systems come online.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {status.modules.length === 0 ? (
            <div className="text-sm text-text-muted">No modules registered for this org.</div>
          ) : status.modules.map(m => (
            <div key={m.id} className="border-b border-border/40 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-text-bright">{m.name}</div>
                  <div className="text-xs text-text-muted">{m.description}</div>
                  <div className="text-xs text-text-muted">introduced: S{m.introducedInSession} · APIs: {m.apis.join(", ") || "—"}</div>
                  {m.dependsOn.length > 0 && (
                    <div className="text-xs text-text-muted">depends on: {m.dependsOn.join(", ")}</div>
                  )}
                </div>
                <StatusBadge status={m.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><Wifi className="h-4 w-4 inline mr-1"/>ESI signal feed</CardTitle>
          <CardDescription>Newest first. Signals carry source, content, and a confidence score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {esi.signals.length === 0 ? (
            <div className="text-sm text-text-muted">No ESI signals posted by this org.</div>
          ) : esi.signals.map(s => (
            <div key={s.id} className="border-b border-border/40 pb-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-text-bright">{s.source}</div>
                <Badge variant="azure">{(s.confidence * 100).toFixed(0)}%</Badge>
              </div>
              <div className="text-xs text-text-muted">{fmtTimestamp(s.at)}</div>
              <div className="text-sm">{s.signal}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cross-portfolio ESI report</CardTitle>
          <CardDescription>Aggregated from the calling org's underlying module dashboards. Each section reports real measured values with their provenance; unavailable sections are reported honestly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.sections.map(s => (
            <div key={s.key} className="border border-border/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-text-bright">{s.label}</div>
                {s.available
                  ? <Badge variant="emerald">available</Badge>
                  : <Badge variant="amber">unavailable</Badge>}
              </div>
              {s.available ? (
                <div className="space-y-1">
                  {s.metrics.map(m => (
                    <div key={m.key} className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">{m.label}</span>
                      <span className="font-mono">{m.value === null ? "—" : m.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-text-muted">{s.note ?? "source module unavailable"}</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}
    </div>
  );
}

export default ArchitecturePage;
