/**
 * WINDELS AI OS Developer / API Platform page.
 *
 * Single first-class destination for external developers: dashboard metrics,
 * application management, API products (marketplace), an interactive API
 * console and generated-style documentation. Every metric and operation is
 * backed by the real backend services — nothing here is mocked.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity, BarChart3, BookOpen, Code2, Cpu, Globe, KeyRound, LayoutDashboard,
  Package, Plus, RefreshCw, Trash2, Terminal, Layers, ShieldCheck,
} from "lucide-react";
import { developerApi, consoleRequest, type ApiDashboardMetrics, type ApiScope, type DeveloperAppRow, type ApiProductRow, type ApiSubscriptionRow } from "@/lib/developerPlatform";
import { apiKeysApi } from "@/lib/apiKeys";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/lib/toast";
import { ApiKeysPage } from "@/pages/apiKeys/ApiKeysPage";
import type { NativePublicModel } from "@windels/shared/nativeAiApi";

type Tab = "dashboard" | "keys" | "models" | "apps" | "products" | "console" | "docs";

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "dashboard", label: "Usage", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "keys", label: "API Keys", icon: <KeyRound className="h-4 w-4" /> },
  { id: "models", label: "Models", icon: <Cpu className="h-4 w-4" /> },
  { id: "apps", label: "Applications", icon: <Layers className="h-4 w-4" /> },
  { id: "products", label: "API Products", icon: <Package className="h-4 w-4" /> },
  { id: "console", label: "API Console", icon: <Terminal className="h-4 w-4" /> },
  { id: "docs", label: "Documentation", icon: <BookOpen className="h-4 w-4" /> },
];

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-azure/20 bg-azure/10 p-2 text-azure">{icon}</div>
        <div className="min-w-0">
          <div className="text-2xl font-black text-text-bright truncate">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
          {hint && <div className="text-[11px] text-text-muted truncate">{hint}</div>}
        </div>
      </div>
    </CardContent></Card>
  );
}

export function DeveloperPortalPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [metrics, setMetrics] = useState<ApiDashboardMetrics | null>(null);
  const [apps, setApps] = useState<DeveloperAppRow[]>([]);
  const [products, setProducts] = useState<ApiProductRow[]>([]);
  const [subs, setSubs] = useState<ApiSubscriptionRow[]>([]);
  const [models, setModels] = useState<NativePublicModel[]>([]);
  const [days, setDays] = useState(7);
  const [usageModel, setUsageModel] = useState("");
  const [usageEnvironment, setUsageEnvironment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxDaily, setMaxDaily] = useState(1);

  // App form state
  const [appName, setAppName] = useState("");
  const [appEnv, setAppEnv] = useState("development");
  const [appDesc, setAppDesc] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a, p, s, nativeModels] = await Promise.all([
        developerApi.dashboard(days, { model: usageModel || undefined, environment: usageEnvironment || undefined }),
        developerApi.apps(),
        developerApi.products(),
        developerApi.subscriptions(),
        developerApi.nativeModels(),
      ]);
      setMetrics(m);
      setApps(a);
      setProducts(p);
      setSubs(s);
      setModels(nativeModels);
      setMaxDaily(Math.max(1, ...m.daily.map((d) => d.requests)));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load developer platform.");
    } finally {
      setLoading(false);
    }
  }, [days, usageModel, usageEnvironment]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function createApp() {
    if (!appName.trim()) return;
    try {
      await developerApi.createApp({ name: appName.trim(), description: appDesc.trim() || undefined, environment: appEnv as any });
      toast.success("Application created.");
      setAppName(""); setAppDesc("");
      await loadAll();
    } catch (e: any) { toast.error(e?.message ?? "Failed to create application."); }
  }

  async function deleteApp(id: string, name: string) {
    if (!window.confirm(`Delete application "${name}"? Its API keys are detached but preserved.`)) return;
    try { await developerApi.deleteApp(id); toast.success("Application deleted."); await loadAll(); }
    catch (e: any) { toast.error(e?.message ?? "Failed to delete application."); }
  }

  async function subscribe(productId: string, appId?: string) {
    try { await developerApi.subscribe(productId, appId); toast.success("Subscribed."); await loadAll(); }
    catch (e: any) { toast.error(e?.message ?? "Failed to subscribe."); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="h-7 w-7 text-azure" />
            <h1 className="text-2xl font-black text-text-bright">WINDELS AI API Platform</h1>
            <Badge variant="azure">WINDELS AI OS</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Use WINDELS as the intelligence backend for external applications and autonomous agents. Native base URL: https://api.windels.ai/v1
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={usageModel} onChange={(e) => setUsageModel(e.target.value)} className="w-44"><option value="">All models</option>{models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</Select>
          <Select value={usageEnvironment} onChange={(e) => setUsageEnvironment(e.target.value)} className="w-36"><option value="">All environments</option><option value="development">Development</option><option value="test">Test</option><option value="production">Production</option></Select>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-32">
            <option value="1">Last 24h</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void loadAll()} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}</div> : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.icon}<span className="ml-1">{t.label}</span></TabsTrigger>)}
        </TabsList>

      <TabsContent value="dashboard" className="space-y-4"><Dashboard metrics={metrics} maxDaily={maxDaily} loading={loading} /></TabsContent>
      <TabsContent value="keys" className="space-y-4"><ApiKeysPage /></TabsContent>
      <TabsContent value="models" className="space-y-4"><ModelCatalog models={models} /></TabsContent>
      <TabsContent value="apps" className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Create application</CardTitle><CardDescription>Register a new developer application under your organization.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input placeholder="Application name" value={appName} onChange={(e) => setAppName(e.target.value)} className="flex-1 min-w-[200px]" />
            <Input placeholder="Description (optional)" value={appDesc} onChange={(e) => setAppDesc(e.target.value)} className="flex-1 min-w-[200px]" />
            <Select value={appEnv} onChange={(e) => setAppEnv(e.target.value)} className="w-40">
              <option value="development">Development</option>
              <option value="test">Test</option>
              <option value="production">Production</option>
            </Select>
            <Button onClick={() => void createApp()}><Plus className="h-4 w-4" /> Create</Button>
          </CardContent>
        </Card>

        {apps.length === 0 ? (
          <Card><CardContent className="text-sm text-text-muted py-8 text-center">No applications yet. Create one to get started.</CardContent></Card>
        ) : apps.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-bright truncate">{a.name}</span>
                  <Badge variant={a.environment === "production" ? "azure" : "secondary"}>{a.environment}</Badge>
                  {a.productionApproved ? <Badge variant="success">prod approved</Badge> : <Badge variant="slate">not approved</Badge>}
                </div>
                {a.description && <p className="mt-1 text-sm text-text-muted">{a.description}</p>}
                <div className="mt-1 text-[11px] text-text-muted">
                  {a.apiKeyCount} API key(s) · scopes: {(a.allowedScopes ?? []).length ? a.allowedScopes.join(", ") : "none"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(a.id); toast.success("App ID copied."); }}>Copy ID</Button>
                <Button size="sm" variant="danger" onClick={() => void deleteApp(a.id, a.name)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="products" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-bright">{p.name}</span>
                  <Badge variant="azure">{p.category}</Badge>
                </div>
                <div className="text-[11px] text-text-muted uppercase tracking-wide">{p.slug} · {p.version}</div>
                {p.description && <p className="text-xs text-text-muted">{p.description}</p>}
                <div className="text-[11px] text-text-muted">
                  Required scopes: <span className="text-text-main">{(p.requiredScopes ?? []).join(", ") || "none"}</span>
                </div>
                <div className="text-[11px] text-text-muted">Rate limit: {p.rateLimitPerMin}/min</div>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => void subscribe(p.id)}>
                  Subscribe
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle>Your subscriptions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {subs.length === 0 && <p className="text-sm text-text-muted">No subscriptions yet.</p>}
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                <div>
                  <div className="text-sm text-text-bright">{s.product.name}</div>
                  <div className="text-[11px] text-text-muted">{s.status} · used {s.usedThisMonth}/{s.quota || "∞"} this month</div>
                </div>
                <Badge variant={s.status === "active" ? "success" : "slate"}>{s.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="console" className="space-y-4"><ApiConsole apps={apps} /></TabsContent>
      <TabsContent value="docs" className="space-y-4"><Documentation /></TabsContent>
      </Tabs>
    </div>
  );
}

function ModelCatalog({ models }: { models: NativePublicModel[] }) {
  return <div className="space-y-4"><div className="rounded-xl border border-azure/30 bg-azure/10 p-4 text-sm text-azure"><strong>Truthful availability:</strong> only health-verified real providers are represented. Demo echo, hash embeddings, simulator media, and unavailable models are never listed.</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{models.map((model) => <Card key={model.id}><CardHeader><div className="flex items-center justify-between"><Cpu className="h-6 w-6 text-violet" /><Badge variant="emerald">available</Badge></div><CardTitle>{model.id}</CardTitle><CardDescription>Owned by {model.owned_by}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-1">{model.capabilities.map((capability) => <Badge key={capability} variant="azure">{capability}</Badge>)}</div><div className="text-xs text-text-muted">Modalities: {model.modalities.join(", ")}{model.context_window ? ` · context ${model.context_window.toLocaleString()}` : ""}{model.max_output_tokens ? ` · output ${model.max_output_tokens.toLocaleString()}` : ""}</div></CardContent></Card>)}{models.length === 0 && <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-12 text-center text-sm text-text-muted">No real model is currently health-verified. Configure and test an approved provider; no placeholder model is exposed.</CardContent></Card>}</div></div>;
}

function Dashboard({ metrics, maxDaily, loading }: { metrics: ApiDashboardMetrics | null; maxDaily: number; loading: boolean }) {
  if (loading && !metrics) return <Card><CardContent className="py-12 text-center text-sm text-text-muted">Loading metrics…</CardContent></Card>;
  if (!metrics) return <Card><CardContent className="py-12 text-center text-sm text-text-muted">No usage data yet.</CardContent></Card>;
  const pct = metrics.totalRequests ? Math.round((metrics.successfulRequests / metrics.totalRequests) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Activity className="h-5 w-5" />} label="API requests" value={metrics.totalRequests.toLocaleString()} hint={`${metrics.windowDays}d window`} />
        <Stat icon={<ShieldCheck className="h-5 w-5" />} label="Successful" value={`${pct}%`} hint={`${metrics.successfulRequests.toLocaleString()} ok · ${metrics.failedRequests.toLocaleString()} failed`} />
        <Stat icon={<BarChart3 className="h-5 w-5" />} label="Error rate" value={metrics.errorRatePct === null ? "—" : `${metrics.errorRatePct}%`} hint={`avg ${metrics.avgDurationMs ?? 0}ms`} />
        <Stat icon={<Globe className="h-5 w-5" />} label="Est. cost" value={`$${metrics.estimatedCostUsd.toFixed(4)}`} hint={`${metrics.totalTokensIn.toLocaleString()} in · ${metrics.totalTokensOut.toLocaleString()} out`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><Stat icon={<Cpu className="h-5 w-5" />} label="Agent runs" value={metrics.agentRuns.toLocaleString()} /><Stat icon={<Code2 className="h-5 w-5" />} label="Tool calls" value={metrics.toolExecutions.toLocaleString()} /><Stat icon={<Layers className="h-5 w-5" />} label="Workflows" value={metrics.workflowExecutions.toLocaleString()} /><Stat icon={<Globe className="h-5 w-5" />} label="Images" value={metrics.images.toLocaleString()} /><Stat icon={<Activity className="h-5 w-5" />} label="Audio seconds" value={metrics.audioSeconds.toLocaleString()} /><Stat icon={<Package className="h-5 w-5" />} label="Storage" value={`${(metrics.storageBytes / 1024 / 1024).toFixed(2)} MB`} /><Stat icon={<ShieldCheck className="h-5 w-5" />} label="Actual cost" value={metrics.actualCostUsd === null ? "unavailable" : `$${metrics.actualCostUsd.toFixed(4)}`} /></div>

      <Card>
        <CardHeader><CardTitle>Requests over time</CardTitle></CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-1">
            {metrics.daily.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.requests} req`}>
                <div className="w-full rounded-t bg-azure/70" style={{ height: `${(d.requests / maxDaily) * 120}px` }} />
                <span className="text-[10px] text-text-muted">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Requests by endpoint</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {metrics.byEndpoint.length === 0 && <p className="text-sm text-text-muted">No endpoints hit yet.</p>}
            {metrics.byEndpoint.map((e) => (
              <div key={e.endpoint} className="flex items-center justify-between text-sm">
                <code className="text-text-main">{e.endpoint}</code>
                <span className="text-text-muted">{e.count} ({(e.count ? Math.round((e.success / e.count) * 100) : 0)}% ok)</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By key</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {metrics.keyUsage.length === 0 && <p className="text-sm text-text-muted">No key usage yet.</p>}
            {metrics.keyUsage.map((k) => (
              <div key={k.apiKeyId} className="flex items-center justify-between text-sm">
                <span className="text-text-main">{k.name ?? "deleted key"}</span>
                <span className="text-text-muted">{k.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent API activity</CardTitle></CardHeader>
        <CardContent>
          {metrics.recent.length === 0 && <p className="text-sm text-text-muted">No activity yet.</p>}
          <div className="space-y-1">
            {metrics.recent.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-text-main">{r.method} <code>{r.path}</code></span>
                <span className="flex items-center gap-2 text-text-muted">
                  <Badge variant={r.status < 400 ? "success" : "danger"}>{r.status}</Badge>
                  <span>{r.durationMs}ms</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const CONSOLE_ENDPOINTS = [
  { method: "GET", path: "/v1/models", scope: "models:read", label: "Native model registry" },
  { method: "POST", path: "/v1/chat/completions", scope: "ai:execute", label: "Native chat completion", body: { model: "windels-native", messages: [{ role: "user", content: "Explain how WINDELS can power my external agent." }] } },
  { method: "POST", path: "/v1/responses", scope: "ai:execute", label: "Native response", body: { model: "windels-native", input: "Create a concise business automation plan." } },
  { method: "POST", path: "/v1/embeddings", scope: "ai:execute", label: "Native embeddings", body: { model: "windels-embedding", input: "WINDELS knowledge retrieval" } },
  { method: "GET", path: "/v1/agents", scope: "agents:read", label: "Native agent list" },
  { method: "GET", path: "/api/rest/v1/agents", scope: "agents:read", label: "Legacy gateway: list agents" },
  { method: "POST", path: "/api/rest/v1/agents/{{id}}/execute", scope: "agents:execute", label: "Execute agent", body: { message: "Analyze this business data" } },
  { method: "POST", path: "/api/rest/v1/ai/complete", scope: "ai:execute", label: "AI completion", body: { messages: [{ role: "user", content: "Hello" }] } },
  { method: "GET", path: "/api/rest/v1/knowledge/search", scope: "knowledge:read", label: "Search knowledge", params: { q: "growth" } },
  { method: "GET", path: "/api/rest/v1/trading/analysis", scope: "trading:read", label: "Trading analysis", params: { symbol: "BTCUSDT", timeframe: "1d" } },
  { method: "GET", path: "/api/rest/v1/workflows", scope: "workflows:read", label: "List workflows" },
];

function ApiConsole({ apps }: { apps: DeveloperAppRow[] }) {
  const [keys, setKeys] = useState<Array<{ id: string; key: string; name: string; environment: string }>>([]);
  const [keyId, setKeyId] = useState("");
  const [endpointIdx, setEndpointIdx] = useState(0);
  const [agentId, setAgentId] = useState("");
  const [response, setResponse] = useState<{ status: number; data: unknown; tookMs: number; headers: Record<string, string> } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load API keys, masking secrets except for the selected development key.
    apiKeysApi.list().then((rows) => {
      setKeys(rows.map((r) => ({ id: r.id, key: "", name: r.name, environment: r.environment })));
    }).catch(() => {});
  }, []);

  async function send() {
    const ep = CONSOLE_ENDPOINTS[endpointIdx]!;
    setSending(true); setError(null); setResponse(null);
    try {
      // The console uses a development key: create a scoped dev key if none.
      let key = keys.find((k) => k.id === keyId)?.key ?? "";
      if (!key) {
        const created = await apiKeysApi.create({
          name: `console-${Date.now()}`,
          scopes: ["READ"],
          granularScopes: [ep.scope as ApiScope],
          environment: "development",
        });
        key = created.key;
        setKeys((k) => [...k, { id: created.id, key: created.key, name: created.name, environment: "development" }]);
        setKeyId(created.id);
      }
      const path = ep.path.replace("{{id}}", agentId || "invalid");
      const result = await consoleRequest(
        ep.method, path, key, (ep as any).params, (ep as any).body,
      );
      setResponse(result);
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      setResponse(null);
    } finally {
      setSending(false);
    }
  }

  const ep = CONSOLE_ENDPOINTS[endpointIdx]!;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Terminal className="h-4 w-4" /> API Test Console</CardTitle><CardDescription>Runs against the real gateway with your development credentials.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <label className="block">
            <span className="text-[11px] text-text-muted">Endpoint</span>
            <Select value={String(endpointIdx)} onChange={(e) => setEndpointIdx(Number(e.target.value))}>
              {CONSOLE_ENDPOINTS.map((e, i) => <option key={i} value={String(i)}>{e.label} — {e.method} {e.path}</option>)}
            </Select>
          </label>
          {ep.path.includes("{{id}}") && (
            <label className="block">
              <span className="text-[11px] text-text-muted">Agent ID</span>
              <Input placeholder="agent_id" value={agentId} onChange={(e) => setAgentId(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="text-[11px] text-text-muted">API key</span>
            <Select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
              <option value="">(auto-create scoped dev key)</option>
              {keys.map((k) => <option key={k.id} value={k.id}>{k.name} · {k.environment}</option>)}
            </Select>
          </label>
          <div className="rounded-lg border border-white/10 bg-bg-deep/60 p-3 text-xs text-text-muted">
            <div className="mb-1 font-medium text-text-main">{ep.method} {ep.path}</div>
            <div>Requires scope: <code className="text-azure">{ep.scope}</code></div>
            {ep.body && <pre className="mt-1 text-[10px]">{JSON.stringify(ep.body, null, 2)}</pre>}
            {ep.params && <div className="mt-1">Params: {JSON.stringify(ep.params)}</div>}
          </div>
          <Button onClick={() => void send()} loading={sending} className="w-full">Send request</Button>
          {error && <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-2 text-xs text-crimson">{error}</div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Response</CardTitle></CardHeader>
        <CardContent>
          {response ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Badge variant={response.status < 400 ? "success" : "danger"}>HTTP {response.status}</Badge>
                <span>took {response.tookMs}ms</span>
                <button className="ml-auto text-azure hover:underline" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(response.data, null, 2)); toast.success("Copied."); }}>Copy</button>
              </div>
              {Object.keys(response.headers).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(response.headers).map(([k, v]) => (
                    <code key={k} className="rounded bg-bg-deep/60 px-2 py-0.5 text-[10px] text-text-muted">{k}: {String(v)}</code>
                  ))}
                </div>
              )}
              <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-bg-deep/60 p-3 text-[11px] text-text-main">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          ) : <p className="text-sm text-text-muted">Send a request to see the live response.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Documentation() {
  const sections: Array<{ title: string; body: string[] }> = [
    { title: "Overview", body: ["Base URL: https://api.windels.ai/v1", "WINDELS provides health-gated chat, responses, real embeddings, files, image/audio capabilities and tenant-scoped WINDELS agents. Existing /api/rest/v1 remains supported.", "Model/provider internals are routed by WINDELS policy; public responses use WINDELS model aliases."] },
    { title: "Authentication & keys", body: ["Send `Authorization: Bearer WND_...` on every request.", "Secrets are CSPRNG-generated, SHA-256 hashed at rest, shown once, revocable, rotatable, expirable, environment-scoped and optionally IP-restricted.", "Fine-grained scopes are authoritative when present."] },
    { title: "Models, chat and responses", body: ["GET /v1/models lists only real health-verified capabilities.", "POST /v1/chat/completions supports non-streaming and SSE streaming.", "POST /v1/responses provides a unified response object. This is a tested compatibility subset, not a claim of complete OpenAI API compatibility."] },
    { title: "Agents and tool loops", body: ["GET /v1/agents and POST /v1/agents/{agent_id}/execute use organization-scoped WINDELS agents.", "Non-streaming chat and agent calls accept external function schemas. WINDELS may return structured tool calls; your application executes its own tool and submits a tool-result message in the next turn.", "Agent runs are durable, queryable and cancellable, with signed lifecycle webhooks."] },
    { title: "Embeddings, knowledge and files", body: ["POST /v1/embeddings never exposes deterministic hash fallback as a production model.", "POST /v1/files stores approved files in the existing tenant-isolated attachment service.", "Knowledge and search access remains scope- and tenant-bound through existing WINDELS services."] },
    { title: "Vision, images and audio", body: ["Inline data-URL images are accepted only when a real vision model is health-verified.", "POST /v1/images, /v1/audio/speech and /v1/audio/transcriptions fail unavailable rather than invoking simulator or fabricated media services.", "Only MIME types, limits and providers implemented by the live service are exposed."] },
    { title: "Streaming", body: ["Use `stream: true` on /v1/chat/completions for `text/event-stream` chunks ending in `data: [DONE]`.", "Disconnects abort the provider request and are metered with status 499.", "Streaming tool-call emulation is outside the current tested subset and is rejected explicitly."] },
    { title: "Webhooks", body: ["Agent run started/completed/failed/requires-action events use the existing HMAC-signed webhook system.", "Delivery IDs, timestamps, retries and delivery logs are persisted; failed deliveries use the existing failure event path."] },
    { title: "Errors, limits and security", body: ["Native errors use `{ error: { message, type, code, param }, request_id }`.", "Per-IP and per-key rate limits, product quotas, billing status, prompt guard, validation, request IDs, audit and tenant isolation are enforced.", "A key can never cross its organization boundary for agents, runs, files, workflows, memory or knowledge."] },
    { title: "Usage & billing", body: ["Every request records API key, organization, user, endpoint, request ID, model, provider, tokens, duration, tool calls, resources, status, error and cost where available.", "Native API product subscriptions increment the existing monthly usage counter; no separate billing system is created.", "Use dashboard filters for key, model, endpoint, environment, status and date."] },
    { title: "OpenAPI", body: ["Download the production OpenAPI 3.1 document at GET /v1/openapi.json or from the authenticated Developer Platform."] },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-azure" /> WINDELS AI OS API Reference</CardTitle>
        <CardDescription>Generated from the real API contracts. Use the interactive console to try endpoints live.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {sections.map((s) => (
            <div key={s.title}>
              <h3 className="text-sm font-semibold text-text-bright">{s.title}</h3>
              <div className="mt-1 space-y-1">{s.body.map((b, i) => <p key={i} className="text-xs text-text-muted">{b}</p>)}</div>
            </div>
          ))}
          {[
            { lang: "JavaScript / TypeScript", code: `const response = await fetch("https://api.windels.ai/v1/chat/completions", {\n  method: "POST", headers: { Authorization: "Bearer WND_...", "Content-Type": "application/json" },\n  body: JSON.stringify({ model: "windels-native", messages: [{ role: "user", content: "Hello" }] })\n});` },
            { lang: "Python", code: `from openai import OpenAI\nclient = OpenAI(api_key="WND_...", base_url="https://api.windels.ai/v1")\nresult = client.chat.completions.create(model="windels-native", messages=[{"role":"user","content":"Hello"}])` },
            { lang: "cURL", code: `curl https://api.windels.ai/v1/chat/completions -H "Authorization: Bearer WND_..." -H "Content-Type: application/json" -d '{"model":"windels-native","messages":[{"role":"user","content":"Hello"}]}'` },
            { lang: "PHP", code: `$client = new GuzzleHttp\\Client(["base_uri" => "https://api.windels.ai/v1/"]);\n$response = $client->post("chat/completions", ["headers" => ["Authorization" => "Bearer WND_..."], "json" => ["model" => "windels-native", "messages" => [["role" => "user", "content" => "Hello"]]]]);` },
            { lang: "Go", code: `payload := strings.NewReader(\`{"model":"windels-native","messages":[{"role":"user","content":"Hello"}]}\`)\nreq, _ := http.NewRequest("POST", "https://api.windels.ai/v1/chat/completions", payload)\nreq.Header.Set("Authorization", "Bearer WND_...")\nreq.Header.Set("Content-Type", "application/json")` },
          ].map((example) => <div key={example.lang} className="rounded-lg border border-white/10 bg-bg-deep/60 p-3"><div className="mb-1 text-[11px] text-text-muted">{example.lang} integration example</div><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-azure">{example.code}</pre></div>)}
        </CardContent>
      </Card>
    </div>
  );
}

export default DeveloperPortalPage;
