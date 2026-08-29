/**
 * WINDELS AI OS — Benchmark Center console.
 *
 * The benchmark centre is a *result registry*: it records evaluations
 * performed elsewhere, it never grades or invents scores. Mirrors that honesty
 * here — a fresh org shows zero runs, and recording a run requires an
 * evaluator + evidence (provenance), never a fabricated number.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trophy, Plus, X, Gauge, Target, Activity } from "lucide-react";
import type { BmDashboard, BmRun, BmMetric, BmArea } from "@windels/shared";
import { BM_AREAS } from "@windels/shared";
import { benchmarksApi } from "@/lib/benchmarks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function PassBadge({ passed, status }: { passed: boolean; status?: string }) {
  if (status && status !== "completed") return <Badge variant="outline">{status}</Badge>;
  return passed ? <Badge variant="emerald">Pass</Badge> : <Badge variant="crimson">Fail</Badge>;
}

function areaLabel(a: string) { return a.replace(/_/g, " "); }

export function BenchmarksPage() {
  const [data, setData] = useState<BmDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // record-run form
  const [area, setArea] = useState<BmArea>("ai_models");
  const [targetName, setTargetName] = useState("");
  const [metricLabel, setMetricLabel] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [overallScore, setOverallScore] = useState("0");
  const [passed, setPassed] = useState(true);
  const [evaluator, setEvaluator] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setData(await benchmarksApi.dashboard()); }
    catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function record() {
    setErr(null); setSaved(false);
    const metrics: BmMetric[] = metricLabel
      ? [{ key: metricLabel.toLowerCase().replace(/\s+/g, "_"), label: metricLabel, value: Number(metricValue || 0), unit: "", higherIsBetter: true }]
      : [];
    try {
      await benchmarksApi.record({
        area, targetName: targetName.trim() || "default", metrics,
        overallScore: Number(overallScore || 0), passed,
        evaluator: evaluator.trim() || "console", evidence: evidence.trim() || "recorded via console",
      });
      setSaved(true);
      setMetricLabel(""); setMetricValue(""); setOverallScore("0"); setPassed(true); setEvaluator(""); setEvidence("");
      await load();
    } catch (e: any) { setErr(e?.message ?? "Record failed"); }
  }

  if (!data) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading benchmarks…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Gauge className="h-6 w-6 text-azure" /> Benchmark Center</h1>
          <p className="text-sm text-text-muted">A result registry — it records real evaluations, it never invents scores.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}
      {saved && <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300">Benchmark result recorded.</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{data.totalRuns}</div><div className="text-sm text-text-muted">Total runs</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{data.completed24h}</div><div className="text-sm text-text-muted">Completed (24h)</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-azure">{data.avgScore}</div><div className="text-sm text-text-muted">Avg score</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-emerald-500">{Math.round(data.passRate * 100)}%</div><div className="text-sm text-text-muted">Pass rate</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Area scores</CardTitle><CardDescription>Mean score per evaluation area (0 when no runs recorded).</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {BM_AREAS.map((a) => (
            <div key={a} className="rounded border border-border/40 p-3">
              <div className="text-xs text-text-muted">{areaLabel(a)}</div>
              <div className="text-2xl font-semibold">{data.areaScores[a] ?? 0}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-400"/>Leaderboard</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.leaderboard.length === 0 ? (
              <div className="text-sm text-text-muted">No results recorded yet.</div>
            ) : data.leaderboard.map((l, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span><span className="text-text-muted mr-2">#{i + 1}</span>{areaLabel(l.area)} — {l.targetName}</span>
                <span className="font-semibold">{l.overallScore}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-azure"/>Record a result</CardTitle>
          <CardDescription>A real evaluator and evidence reference are required.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select value={area} onChange={(e) => setArea(e.target.value as BmArea)}>
                {BM_AREAS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
              </Select>
              <Input placeholder="Target name" value={targetName} onChange={(e) => setTargetName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Metric label (optional)" value={metricLabel} onChange={(e) => setMetricLabel(e.target.value)} />
              <Input placeholder="Metric value" type="number" value={metricValue} onChange={(e) => setMetricValue(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Overall score (0–100)" type="number" value={overallScore} onChange={(e) => setOverallScore(e.target.value)} />
              <Select value={passed ? "pass" : "fail"} onChange={(e) => setPassed(e.target.value === "pass")}>
                <option value="pass">Pass</option><option value="fail">Fail</option>
              </Select>
            </div>
            <Input placeholder="Evaluator" value={evaluator} onChange={(e) => setEvaluator(e.target.value)} />
            <Input placeholder="Evidence reference" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            <Button onClick={() => void record()}><Plus className="h-4 w-4 mr-1"/>Record result</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-azure"/>Recent runs</CardTitle>
        <CardDescription>Newest first. {busy ? "Refreshing…" : ""}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {data.recentRuns.length === 0 ? (
            <div className="text-sm text-text-muted">No runs recorded — a fresh org starts empty.</div>
          ) : data.recentRuns.map((r: BmRun) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{areaLabel(r.area)}</span>
                  <span className="text-xs text-text-muted">{r.targetName}</span>
                  <PassBadge passed={r.passed} status={r.status} />
                </div>
                <div className="text-xs text-text-muted truncate">
                  {r.metadata?.evaluator ?? "—"} · {r.metadata?.evidence ?? "no evidence"} · {fmtDate(r.startedAt)}
                </div>
              </div>
              <span className="text-lg font-semibold">{r.overallScore}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default BenchmarksPage;
