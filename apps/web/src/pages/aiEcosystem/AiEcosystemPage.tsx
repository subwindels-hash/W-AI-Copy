/**
 * WINDELS AI OS — AI Ecosystem console.
 *
 * Vendor-agnostic providers, models, routing policies and benchmark runs.
 * Provider/model status reflects the live registry.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Boxes, Server, GitBranch, X } from "lucide-react";
import type { AiEcosystemDashboard, AiProviderAdapter, AiModel, RoutingPolicy } from "@windels/shared";
import { aiEcoApi } from "@/lib/aiEcosystem";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function statusTone(s?: string): any {
  return s === "healthy" || s === "enabled" ? "emerald"
    : s === "degraded" ? "amber"
    : s === "down" || s === "error" ? "crimson" : "slate";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{value}</div><div className="text-sm text-text-muted">{label}</div></CardContent></Card>
  );
}

export function AiEcosystemPage() {
  const [dash, setDash] = useState<AiEcosystemDashboard | null>(null);
  const [providers, setProviders] = useState<AiProviderAdapter[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [policies, setPolicies] = useState<RoutingPolicy[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, p, m, pol] = await Promise.all([aiEcoApi.dashboard(), aiEcoApi.listProviders(), aiEcoApi.listModels(), aiEcoApi.listPolicies()]);
      setDash(d); setProviders(p); setModels(m); setPolicies(pol);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading AI ecosystem…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Boxes className="h-6 w-6 text-azure" /> AI Ecosystem</h1>
          <p className="text-sm text-text-muted">Vendor-agnostic providers, models &amp; routing.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Providers" value={dash.providers} />
        <Stat label="Healthy" value={dash.providersHealthy} />
        <Stat label="Models" value={dash.models} />
        <Stat label="Enabled models" value={dash.modelsEnabled} />
        <Stat label="Routing policies" value={dash.routingPolicies} />
        <Stat label="Requests (24h)" value={dash.requests24h} />
        <Stat label="Tokens (24h)" value={dash.tokens24h} />
        <Stat label="Self-hosted" value={dash.providersSelfHosted} />
      </div>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers ({providers.length})</TabsTrigger>
          <TabsTrigger value="models">Models ({models.length})</TabsTrigger>
          <TabsTrigger value="policies">Routing ({policies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <Card><CardContent className="space-y-2 pt-4">
            {providers.length === 0 ? <div className="text-sm text-text-muted">No providers registered.</div> : providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Server className="h-4 w-4 text-azure shrink-0"/>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.name} <Badge variant="outline">{p.vendor}</Badge> <Badge variant="outline">{p.tier}</Badge></div>
                    <div className="text-xs text-text-muted">{p.apiKeyConfigured ? "api key configured" : "no api key"}</div>
                  </div>
                </div>
                <Badge variant={statusTone(p.status)}>{p.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="models">
          <Card><CardContent className="space-y-2 pt-4">
            {models.length === 0 ? <div className="text-sm text-text-muted">No models registered.</div> : models.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.displayName} <Badge variant="outline">{m.providerId}</Badge></div>
                  <div className="text-xs text-text-muted">{m.modelId} · ctx {m.contextWindowTokens}</div>
                </div>
                <Badge variant={m.enabled ? "emerald" : "slate"}>{m.enabled ? "enabled" : "disabled"}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card><CardContent className="space-y-2 pt-4">
            {policies.length === 0 ? <div className="text-sm text-text-muted">No routing policies.</div> : policies.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <GitBranch className="h-4 w-4 text-azure shrink-0"/>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-text-muted">{p.description}</div>
                  </div>
                </div>
                <Badge variant="outline">{p.strategy}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AiEcosystemPage;
