/**
 * WINDELS AI OS — Infrastructure console.
 *
 * Cluster status, nodes, workloads and firing alerts. All usage/health figures
 * come from the live platform probes — nothing is fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Server, Box, AlertTriangle, X } from "lucide-react";
import type { InfraOverview, ClusterStatus, ClusterNode, AlertFiring } from "@windels/shared/infrastructure";
import { infraApi } from "@/lib/infrastructure";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function healthTone(s?: string): any {
  return s === "healthy" || s === "ready" ? "emerald"
    : s === "degraded" ? "amber" : s === "down" || s === "unavailable" ? "crimson" : "slate";
}

export function InfrastructurePage() {
  const [overview, setOverview] = useState<InfraOverview | null>(null);
  const [cluster, setCluster] = useState<ClusterStatus | null>(null);
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [alerts, setAlerts] = useState<AlertFiring[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [o, c, n, a] = await Promise.all([infraApi.overview(), infraApi.cluster(), infraApi.nodes(), infraApi.alerts()]);
      setOverview(o); setCluster(c); setNodes(n); setAlerts(a);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!overview) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading infrastructure…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Server className="h-6 w-6 text-azure" /> Infrastructure</h1>
          <p className="text-sm text-text-muted">Clusters, nodes, workloads &amp; alerts.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{overview.regionsOnline}/{overview.regionsTotal}</div><div className="text-sm text-text-muted">Regions online</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{overview.deployments}</div><div className="text-sm text-text-muted">Deployments ({overview.deploymentsReady} ready)</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{cluster?.nodes ?? overview.clusters.length}</div><div className="text-sm text-text-muted">Nodes</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-crimson">{alerts.length}</div><div className="text-sm text-text-muted">Firing alerts</div></CardContent></Card>
      </div>

      {cluster && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">Cluster {cluster.name} <Badge variant={healthTone(cluster.status)}>{cluster.status}</Badge></CardTitle>
          <CardDescription>{cluster.region} · k8s {cluster.version} · {cluster.pods} pods · last probed {cluster.lastProbedAt}</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">CPU</div><div className="text-2xl font-semibold">{Math.round(cluster.cpuPercent)}%</div></div>
            <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">Memory</div><div className="text-2xl font-semibold">{Math.round(cluster.memoryPercent)}%</div></div>
            <div className="rounded border border-border/40 p-3"><div className="text-xs text-text-muted">Pods</div><div className="text-2xl font-semibold">{Math.round(cluster.podPercent)}%</div></div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">Nodes ({nodes.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="nodes">
          <Card><CardContent className="space-y-2 pt-4">
            {nodes.length === 0 ? <div className="text-sm text-text-muted">No nodes.</div> : nodes.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Box className="h-4 w-4 text-azure shrink-0"/>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{n.name} <span className="text-text-muted text-xs">· {n.roles.join(", ")}</span></div>
                    <div className="text-xs text-text-muted">cpu {Math.round(n.usage.cpuPercent)}% · mem {Math.round(n.usage.memoryPercent)}% · {n.podCount} pods</div>
                  </div>
                </div>
                <Badge variant={healthTone(n.status)}>{n.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card><CardContent className="space-y-2 pt-4">
            {alerts.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><AlertTriangle className="h-4 w-4"/>No firing alerts.</div> : alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${a.severity === "crit" ? "text-crimson" : "text-amber-400"}`}/>
                  <div className="min-w-0">
                    <div className="text-sm truncate">{a.name} <span className="text-text-muted text-xs">· {a.target}</span></div>
                    <div className="text-xs text-text-muted truncate">{a.message}</div>
                  </div>
                </div>
                <Badge variant={a.severity === "crit" ? "crimson" : a.severity === "warn" ? "amber" : "azure"}>{a.severity}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InfrastructurePage;
