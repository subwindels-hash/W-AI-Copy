/**
 * WINDELS AI OS — Enterprise Foundation console.
 *
 * Data fabric connectors, identity principals, FinOps accounts/cost anomalies
 * and resilience incidents. Global health figures come from the live platform.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Database, Users, Wallet, AlertTriangle, X } from "lucide-react";
import type { EnterpriseFoundationDashboard, FabricConnector, IdentityPrincipal, FinOpsAccount, CostAnomaly, ResilienceIncident } from "@windels/shared";
import { efApi } from "@/lib/enterpriseFoundation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtMoney(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function tone(s?: string): any {
  const st = (s ?? "").toLowerCase();
  return st.includes("healthy") || st.includes("active") || st.includes("online") ? "emerald"
    : st.includes("degraded") || st.includes("warning") ? "amber"
    : st.includes("offline") || st.includes("failed") || st.includes("error") ? "crimson" : "slate";
}

export function EnterpriseFoundationPage() {
  const [dash, setDash] = useState<(EnterpriseFoundationDashboard & Record<string, number>) | null>(null);
  const [connectors, setConnectors] = useState<FabricConnector[]>([]);
  const [principals, setPrincipals] = useState<IdentityPrincipal[]>([]);
  const [finops, setFinops] = useState<FinOpsAccount[]>([]);
  const [anomalies, setAnomalies] = useState<CostAnomaly[]>([]);
  const [incidents, setIncidents] = useState<ResilienceIncident[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, c, p, f, a, inc] = await Promise.all([
        efApi.dashboard(), efApi.listConnectors(), efApi.listPrincipals(),
        efApi.listAccounts(), efApi.listAnomalies(), efApi.listIncidents(),
      ]);
      setDash(d as any); setConnectors(c); setPrincipals(p); setFinops(f); setAnomalies(a); setIncidents(inc);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading enterprise foundation…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Database className="h-6 w-6 text-azure" /> Enterprise Foundation</h1>
          <p className="text-sm text-text-muted">Data fabric, identity, FinOps &amp; resilience.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.connectors}</div><div className="text-sm text-text-muted">Connectors ({dash.connectorsHealthy} healthy)</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.principals}</div><div className="text-sm text-text-muted">Principals</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-azure">{fmtMoney(dash.monthlyCost)}</div><div className="text-sm text-text-muted">Monthly cost</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-emerald-500">{fmtMoney(dash.savingsOpportunity)}</div><div className="text-sm text-text-muted">Savings opportunity</div></CardContent></Card>
      </div>

      <Tabs defaultValue="connectors">
        <TabsList>
          <TabsTrigger value="connectors">Connectors ({connectors.length})</TabsTrigger>
          <TabsTrigger value="identity">Identity ({principals.length})</TabsTrigger>
          <TabsTrigger value="finops">FinOps ({finops.length})</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies ({anomalies.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="connectors">
          <Card><CardContent className="space-y-2 pt-4">
            {connectors.length === 0 ? <div className="text-sm text-text-muted">No connectors.</div> : connectors.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0"><Database className="h-4 w-4 text-azure shrink-0"/><div className="min-w-0"><div className="text-sm truncate">{c.name}</div><div className="text-xs text-text-muted">{c.kind} · {c.region}</div></div></div>
                <Badge variant={tone(c.status)}>{c.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="identity">
          <Card><CardContent className="space-y-2 pt-4">
            {principals.length === 0 ? <div className="text-sm text-text-muted">No principals.</div> : principals.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0"><Users className="h-4 w-4 text-azure shrink-0"/><div className="min-w-0"><div className="text-sm truncate">{p.displayName}</div><div className="text-xs text-text-muted">{p.kind} · {p.provider}</div></div></div>
                <Badge variant={tone(p.status)}>{p.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="finops">
          <Card><CardContent className="space-y-2 pt-4">
            {finops.length === 0 ? <div className="text-sm text-text-muted">No FinOps accounts.</div> : finops.map((f) => (
              <div key={f.id} className="flex items-center justify-between border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0"><Wallet className="h-4 w-4 text-azure shrink-0"/><div className="min-w-0"><div className="text-sm truncate">{f.name}</div><div className="text-xs text-text-muted">{f.provider} · {f.region}</div></div></div>
                <span className="text-azure shrink-0">{fmtMoney(f.monthToDate)}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="anomalies">
          <Card><CardContent className="space-y-2 pt-4">
            {anomalies.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><AlertTriangle className="h-4 w-4"/>No cost anomalies.</div> : anomalies.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0"><AlertTriangle className="h-4 w-4 text-amber-400 shrink-0"/><div className="min-w-0"><div className="text-sm truncate">{a.service}</div><div className="text-xs text-text-muted">{a.provider} · expected {fmtMoney(a.expectedAmount)} vs actual {fmtMoney(a.actualAmount)}</div></div></div>
                <Badge variant={a.deltaPct > 30 ? "crimson" : "amber"}>{a.deltaPct.toFixed(0)}%</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="incidents">
          <Card><CardContent className="space-y-2 pt-4">
            {incidents.length === 0 ? <div className="text-sm text-text-muted">No incidents.</div> : incidents.map((i) => (
              <div key={i.id} className="flex items-center justify-between border-b border-border/40 py-2">
                <div className="min-w-0"><div className="text-sm truncate">{i.title}</div><div className="text-xs text-text-muted">{i.service} · {i.region}</div></div>
                <div className="flex items-center gap-2 shrink-0"><Badge variant={i.severity === "sev1" ? "crimson" : i.severity === "sev2" ? "amber" : "slate"}>{i.severity}</Badge><Badge variant="outline">{i.status}</Badge></div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EnterpriseFoundationPage;
