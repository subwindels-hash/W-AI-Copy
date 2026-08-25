/**
 * WINDELS AI OS — Self-Hosted AI Infrastructure console.
 *
 * GPU nodes, registered models, inference jobs and vector stores. Utilization
 * and latency figures are observed from the fleet — not fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Server, Cpu, Database, Activity, X } from "lucide-react";
import type { SelfHostedDashboard, GpuNode, RegisteredModel, InferenceJob, VectorStore } from "@windels/shared";
import { shApi } from "@/lib/selfHosted";
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

export function SelfHostedPage() {
  const [dash, setDash] = useState<SelfHostedDashboard | null>(null);
  const [nodes, setNodes] = useState<GpuNode[]>([]);
  const [models, setModels] = useState<RegisteredModel[]>([]);
  const [jobs, setJobs] = useState<InferenceJob[]>([]);
  const [stores, setStores] = useState<VectorStore[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, n, m, j, s] = await Promise.all([shApi.dashboard(), shApi.nodes(), shApi.models(), shApi.jobs(), shApi.vectorStores()]);
      setDash(d); setNodes(n); setModels(m); setJobs(j); setStores(s);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading self-hosted…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Server className="h-6 w-6 text-azure" /> Self-Hosted AI</h1>
          <p className="text-sm text-text-muted">GPU nodes, models, inference &amp; vector stores on your own infra.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Nodes" value={dash.nodes} />
        <Stat label="Online" value={dash.nodesOnline} />
        <Stat label="Models" value={dash.models} />
        <Stat label="Loaded" value={dash.modelsLoaded} />
        <Stat label="Inference jobs (24h)" value={dash.inferenceJobs24h} />
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{Math.round(dash.avgInferenceLatencyMs)}ms</div><div className="text-sm text-text-muted">Avg latency</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{Math.round(dash.gpuUtilizationPct)}%</div><div className="text-sm text-text-muted">GPU utilization</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-emerald-500">{dash.haClusterHealthy ? "Healthy" : "Degraded"}</div><div className="text-sm text-text-muted">HA cluster</div></CardContent></Card>
      </div>

      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">Nodes ({nodes.length})</TabsTrigger>
          <TabsTrigger value="models">Models ({models.length})</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="stores">Vector stores ({stores.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="nodes">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {nodes.length === 0 ? (
                <div className="text-sm text-text-muted">No GPU nodes registered.</div>
              ) : nodes.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Cpu className="h-4 w-4 text-azure shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{n.name} <span className="text-text-muted">· {n.gpuType}</span></div>
                      <div className="text-xs text-text-muted">{(n.vramGb - n.vramUsedGb).toFixed(0)}/{n.vramGb} GB free · {n.temperatureC}°C</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{Math.round(n.utilizationPct)}%</div>
                    <Badge variant={n.status === "online" ? "emerald" : n.status === "offline" ? "crimson" : "amber"}>{n.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {models.length === 0 ? (
                <div className="text-sm text-text-muted">No models registered.</div>
              ) : models.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.name}</span>
                      <Badge variant="outline">v{m.version}</Badge>
                      <Badge variant="outline">{m.format}</Badge>
                      <Badge variant="outline">{m.quant}</Badge>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{m.sizeGb} GB · ctx {m.contextWindow}</div>
                  </div>
                  <Badge variant={m.state === "ready" ? "emerald" : m.state === "loaded" ? "azure" : "slate"}>{m.state}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="space-y-1 pt-4">
              {jobs.length === 0 ? (
                <div className="text-sm text-text-muted">No inference jobs yet.</div>
              ) : jobs.slice(0, 20).map((j) => (
                <div key={j.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                  <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-azure"/>{j.modelId} <span className="text-text-muted text-xs">· {j.nodeId}</span></span>
                  <span className="flex items-center gap-2">
                    {j.latencyMs !== undefined && <span className="text-text-muted text-xs">{j.latencyMs}ms</span>}
                    <Badge variant={j.status === "completed" ? "emerald" : j.status === "running" ? "azure" : j.status === "failed" ? "crimson" : "slate"}>{j.status}</Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stores">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {stores.length === 0 ? (
                <div className="text-sm text-text-muted">No vector stores yet.</div>
              ) : stores.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/30 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className="h-4 w-4 text-azure shrink-0"/>
                    <div className="min-w-0">
                      <div className="font-medium">{s.name} <Badge variant="outline">{s.backend}</Badge></div>
                      <div className="text-xs text-text-muted">{s.vectorCount.toLocaleString()} vectors · {s.dimensions} dims · {s.sizeGb} GB</div>
                    </div>
                  </div>
                  <Badge variant={s.status === "online" ? "emerald" : s.status === "offline" ? "crimson" : "amber"}>{s.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SelfHostedPage;
