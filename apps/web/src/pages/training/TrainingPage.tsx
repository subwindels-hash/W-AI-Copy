/**
 * WINDELS AI OS — Training & Fine-Tuning console.
 *
 * Datasets, fine-tuning jobs, canary promotion and rollback. Progress and eval
 * scores are observed from the training run — nothing is fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, BookOpen, Rocket, RotateCcw, X } from "lucide-react";
import type { TrainingDashboard, TrainingDataset, TrainingJob } from "@windels/shared";
import { trainingApi } from "@/lib/training";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function statusTone(s: string): any {
  return s === "deployed" || s === "canary" ? "emerald"
    : s === "training" || s === "preparing" || s === "evaluating" || s === "queued" ? "azure"
    : s === "failed" ? "crimson"
    : s === "governance_review" || s === "paused" || s === "rolled_back" ? "amber" : "slate";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function TrainingPage() {
  const [dash, setDash] = useState<TrainingDashboard | null>(null);
  const [datasets, setDatasets] = useState<TrainingDataset[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, ds, j] = await Promise.all([trainingApi.dashboard(), trainingApi.listDatasets(), trainingApi.listJobs()]);
      setDash(d); setDatasets(ds); setJobs(j);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function promote(id: string, pct: number) {
    setErr(null); try { await trainingApi.promoteCanary(id, pct); await load(); } catch (e: any) { setErr(e?.message ?? "Promote failed"); }
  }
  async function rollback(id: string) {
    setErr(null); try { await trainingApi.rollback(id); await load(); } catch (e: any) { setErr(e?.message ?? "Rollback failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading training…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><BookOpen className="h-6 w-6 text-azure" /> Training &amp; Fine-Tuning</h1>
          <p className="text-sm text-text-muted">Datasets, training jobs, canary promotion and rollback.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Datasets" value={dash.datasets} />
        <Stat label="Running" value={dash.jobsRunning} />
        <Stat label="Queued" value={dash.jobsQueued} />
        <Stat label="Completed (30d)" value={dash.jobsCompleted30d} />
        <Stat label="Failed (30d)" value={dash.jobsFailed30d} />
        <Stat label="Safety pass rate" value={`${Math.round(dash.safetyChecksPassRate * 100)}%`} />
        <Stat label="GPU hours (30d)" value={dash.gpuHoursUsed30d} />
        <Stat label="Cost (30d)" value={`$${dash.costUsd30d.toLocaleString()}`} />
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="datasets">Datasets ({datasets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {jobs.length === 0 ? (
                <div className="text-sm text-text-muted">No training jobs yet.</div>
              ) : jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{j.name}</span>
                      <Badge variant="outline">{j.baseModel}</Badge>
                      <Badge variant="outline">{j.strategy}</Badge>
                      <Badge variant={statusTone(j.status)}>{j.status}</Badge>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      progress {j.progressPct}%
                      {j.evalScore !== undefined && <> · eval {j.evalScore}</>}
                      {j.safetyPassed !== undefined && <> · safety {j.safetyPassed ? "passed" : "failed"}</>}
                      {j.gpuHours > 0 && <> · {j.gpuHours} GPU hrs</>}
                    </div>
                    {j.progressPct > 0 && j.progressPct < 100 && (
                      <div className="h-1.5 rounded bg-white/5 mt-1 overflow-hidden">
                        <div className="h-full rounded bg-azure/70" style={{ width: `${j.progressPct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {j.canaryPct > 0 && j.canaryPct < 100 && (
                      <Button size="sm" variant="outline" onClick={() => void promote(j.id, 100)}><Rocket className="h-3 w-3 mr-1"/>Promote</Button>
                    )}
                    {j.status === "deployed" && (
                      <Button size="sm" variant="outline" onClick={() => void rollback(j.id)}><RotateCcw className="h-3 w-3 mr-1"/>Rollback</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="datasets">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {datasets.length === 0 ? (
                <div className="text-sm text-text-muted">No datasets yet.</div>
              ) : datasets.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Badge variant="outline">{d.format}</Badge>
                      {d.cleaned && <Badge variant="emerald">cleaned</Badge>}
                      {d.governanceApproved ? <Badge variant="emerald">approved</Badge> : <Badge variant="amber">pending</Badge>}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{d.rows.toLocaleString()} rows · {(d.sizeBytes / 1048576).toFixed(1)} MB · {d.syntheticPct}% synthetic</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TrainingPage;
