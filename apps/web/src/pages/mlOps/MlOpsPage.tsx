/**
 * WINDELS AI OS — ML Ops console.
 *
 * Model registry, lifecycle, deployments, monitoring and RAG/embedding
 * infrastructure. Telemetry fields (latency, qps, error rate) are `undefined`
 * until actually observed — nothing here is invented at render time.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Boxes, Rocket, Radar, ShieldCheck, X } from "lucide-react";
import type {
  MlOpsDashboard, ModelArtifact, ModelDeployment, ModelMonitor, ModelPolicy,
} from "@windels/shared";
import { mlApi } from "@/lib/mlOps";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function StageBadge({ stage }: { stage?: string }) {
  const tone =
    stage === "production" ? "emerald" :
    stage === "staging" || stage === "approval" ? "amber" :
    stage === "draft" ? "slate" : "azure";
  return <Badge variant={tone as any}>{stage ?? "—"}</Badge>;
}

function StatusBadge({ status }: { status?: string }) {
  const tone = status === "healthy" || status === "active" || status === "published" ? "emerald"
    : status === "quarantined" || status === "failed" || status === "degraded" ? "crimson"
    : "slate";
  return <Badge variant={tone as any}>{status ?? "—"}</Badge>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className={`text-3xl font-semibold ${tone ?? ""}`}>{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function MlOpsPage() {
  const [data, setData] = useState<MlOpsDashboard | null>(null);
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [deployments, setDeployments] = useState<ModelDeployment[]>([]);
  const [monitors, setMonitors] = useState<ModelMonitor[]>([]);
  const [policies, setPolicies] = useState<ModelPolicy[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, m, dep, mon, pol] = await Promise.all([
        mlApi.dashboard(),
        mlApi.listModels(),
        mlApi.listDeployments(),
        mlApi.listMonitors(),
        mlApi.listModelPolicies(),
      ]);
      setData(d); setModels(m); setDeployments(dep); setMonitors(mon); setPolicies(pol);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading ML Ops…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Boxes className="h-6 w-6 text-azure" /> ML Ops</h1>
          <p className="text-sm text-text-muted">Model registry, lifecycle, deployments, monitoring &amp; RAG infrastructure.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Models" value={data.models} />
        <Stat label="In production" value={data.modelsInProduction} tone="text-emerald-500" />
        <Stat label="Deployments" value={data.deployments} />
        <Stat label="Healthy" value={data.deploymentsHealthy} tone="text-emerald-500" />
        <Stat label="Active monitors" value={data.activeMonitors} />
        <Stat label="Open alerts" value={data.alertsOpen} tone={data.alertsOpen > 0 ? "text-crimson" : ""} />
        <Stat label="Policies enforced" value={data.policiesEnforced} />
        <Stat label="Vectors indexed" value={data.vectorsIndexed} />
      </div>

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">Models ({models.length})</TabsTrigger>
          <TabsTrigger value="deployments">Deployments ({deployments.length})</TabsTrigger>
          <TabsTrigger value="monitors">Monitoring ({monitors.length})</TabsTrigger>
          <TabsTrigger value="policies">Policies ({policies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="models">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {models.length === 0 ? (
                <div className="text-sm text-text-muted">No models registered yet.</div>
              ) : models.slice(0, 12).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{m.name}</span>
                      <Badge variant="outline">{m.kind}</Badge>
                      <Badge variant="outline">{m.provider}</Badge>
                      <StageBadge stage={m.currentStage} />
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">
                      {m.description}
                      {m.avgLatencyMs !== undefined && <> · {m.avgLatencyMs}ms</>}
                      {m.errorRatePct !== undefined && <> · err {m.errorRatePct}%</>}
                    </div>
                  </div>
                  <span className="text-xs text-text-muted shrink-0">v{m.currentVersion ?? "—"}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployments">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {deployments.length === 0 ? (
                <div className="text-sm text-text-muted">No deployments yet.</div>
              ) : deployments.slice(0, 12).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Rocket className="h-4 w-4 text-azure" />
                      <span className="font-medium">{d.name}</span>
                      <Badge variant="outline">{d.environment}</Badge>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">
                      {d.region} · {d.replicas} replicas · {d.cpu} / {d.memory}
                      {d.qps !== undefined && <> · {d.qps} qps</>}
                      {d.p95Ms !== undefined && <> · p95 {d.p95Ms}ms</>}
                    </div>
                  </div>
                  <span className="text-xs text-text-muted shrink-0">{d.trafficPct}% traffic</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitors">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {monitors.length === 0 ? (
                <div className="text-sm text-text-muted">No monitors configured yet.</div>
              ) : monitors.slice(0, 12).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Radar className="h-4 w-4 text-azure" />
                      <span className="font-medium">{m.name}</span>
                      <Badge variant="outline">{m.type}</Badge>
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">
                      {m.metric} threshold {m.threshold} · current {m.currentValue} · {m.window}
                    </div>
                  </div>
                  {m.firing
                    ? <Badge variant="crimson">FIRING</Badge>
                    : <Badge variant={m.enabled ? "emerald" : "slate"}>{m.enabled ? "OK" : "disabled"}</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {policies.length === 0 ? (
                <div className="text-sm text-text-muted">No model policies defined.</div>
              ) : policies.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="font-medium text-sm">{p.name}</span>
                  </div>
                  <Badge variant={(p as any).enforced ? "emerald" : "slate"}>{(p as any).enforced ? "enforced" : "draft"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MlOpsPage;
