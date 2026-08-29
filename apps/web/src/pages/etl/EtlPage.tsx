/**
 * WINDELS AI OS — ETL & Data Pipelines console.
 *
 * Define pipelines, trigger runs and inspect row counts / errors. Row counts
 * are real run outcomes, never invented.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Workflow, Play, X } from "lucide-react";
import { etlApi, type EtlPipelineRecord, type EtlRunRecord } from "@/lib/etl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function statusTone(s: string): any {
  return s === "succeeded" || s === "active" ? "emerald"
    : s === "running" || s === "queued" ? "azure"
    : s === "failed" ? "crimson"
    : s === "partial" ? "amber" : "slate";
}

export function EtlPage() {
  const [pipelines, setPipelines] = useState<EtlPipelineRecord[]>([]);
  const [runs, setRuns] = useState<EtlRunRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const p = await etlApi.listPipelines();
      setPipelines(p);
      setRuns(p.length ? await etlApi.listRuns(p[0]!.id) : []);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(id: string) {
    setErr(null); try { await etlApi.triggerRun(id); await load(); } catch (e: any) { setErr(e?.message ?? "Run failed"); }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Workflow className="h-6 w-6 text-azure" /> ETL &amp; Data Pipelines</h1>
          <p className="text-sm text-text-muted">Extract, transform and load pipelines with observable run results.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Pipelines ({pipelines.length})</CardTitle><CardDescription>{busy ? "Refreshing…" : ""}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {pipelines.length === 0 ? (
              <div className="text-sm text-text-muted">No pipelines yet.</div>
            ) : pipelines.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline">{p.sourceFormat}</Badge>
                    <Badge variant={statusTone(p.status)}>{p.status}</Badge>
                  </div>
                  {p.description && <div className="text-xs text-text-muted truncate mt-0.5">{p.description}</div>}
                  <div className="text-xs text-text-muted mt-0.5">{p.mappingSchema.length} mappings{p.cronSchedule ? ` · ${p.cronSchedule}` : ""}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void run(p.id)}><Play className="h-3 w-3 mr-1"/>Run</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Run history ({runs.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {runs.length === 0 ? (
              <div className="text-sm text-text-muted">No runs yet.</div>
            ) : runs.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/30 py-1.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusTone(r.status)}>{r.status}</Badge>
                    <span className="text-xs text-text-muted">{r.pipelineId}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {r.rowsProcessed} rows · {r.rowsSucceeded} ok · {r.rowsFailed} failed
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default EtlPage;
