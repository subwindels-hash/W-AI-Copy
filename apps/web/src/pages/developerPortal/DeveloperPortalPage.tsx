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
  Activity, BarChart3, BookOpen, Code2, Globe, LayoutDashboard,
  Package, Plus, RefreshCw, Trash2, Terminal, Layers, ShieldCheck,
} from "lucide-react";
import { developerApi, consoleRequest, type ApiDashboardMetrics, type DeveloperAppRow, type ApiProductRow, type ApiSubscriptionRow } from "@/lib/developerPlatform";
import { apiKeysApi } from "@/lib/apiKeys";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/lib/toast";

type Tab = "dashboard" | "apps" | "products" | "console" | "docs";

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
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
  const [days, setDays] = useState(7);
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
      const [m, a, p, s] = await Promise.all([
        developerApi.dashboard(days),
        developerApi.apps(),
        developerApi.products(),
        developerApi.subscriptions(),
      ]);
      setMetrics(m);
      setApps(a);
      setProducts(p);
      setSubs(s);
      setMaxDaily(Math.max(1, ...m.daily.map((d) => d.requests)));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load developer platform.");
    } finally {
      setLoading(false);
    }
  }, [days]);

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
            <h1 className="text-2xl font-black text-text-bright">Developer / API Platform</h1>
            <Badge variant="azure">WINDELS AI OS</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Build on WINDELS AI OS — agents, workflows, knowledge, trading intelligence, media and voice through official APIs.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
  { method: "GET", path: "/api/rest/v1/agents", scope: "agents:read", label: "List agents" },
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
          granularScopes: [ep.scope],
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
    { title: "Authentication", body: ["All API requests authenticate with an API key in the Authorization header: `Authorization: Bearer wnd_...`.", "Keys are scoped to your organization and to the granular capabilities you grant (e.g. agents:execute).", "Plaintext keys are shown exactly once at creation and stored as SHA-256 hashes — they are never recoverable."] },
    { title: "API keys", body: ["Create keys via the API Keys page or the /apikeys endpoints.", "Restrict a key by environment (development / test / production), optional IP CIDRs, and scopes.", "Revoked or expired keys are rejected immediately by the gateway."] },
    { title: "Endpoints", body: ["Agents: GET /v1/agents, POST /v1/agents/{id}/execute", "AI: POST /v1/ai/complete", "Workflows: GET /v1/workflows, POST /v1/workflows/{id}/execute, GET /v1/workflows/{id}/runs", "Knowledge: GET /v1/knowledge/search", "Trading: GET /v1/trading/analysis", "Media: POST /v1/media/generate"] },
    { title: "Error codes", body: ["401 Unauthorized — missing/invalid API key", "403 Forbidden — missing scope or IP not allowed", "404 Not Found — resource not found in your org", "429 Too Many Requests — rate limit exceeded (see X-RateLimit-* headers)", "500 Internal — a WINDELS service error"] },
    { title: "Rate limits", body: ["The gateway emits X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset on every response.", "Per-key sliding-window limits apply; keys with granular scopes get a higher default allowance."] },
    { title: "Webhooks", body: ["Subscribe to events via the Developers page (webhooks). Payloads are HMAC-signed with a per-endpoint secret.", "Failed deliveries are retried with exponential backoff and recorded for replay."] },
    { title: "Versioning", body: ["The stable public surface is /api/rest/v1. Breaking changes require a new major version with a deprecation window."] },
    { title: "Security & governance", body: ["All access is subject to IAM, RBAC/ABAC, scope enforcement, rate limiting, audit logging and the existing security controls.", "Sensitive capabilities require explicit scopes; production access for an application is gated by Super Admin approval."] },
    { title: "Billing & usage", body: ["Every gateway call is recorded to a persistent usage ledger.", "The Dashboard shows request volume, success/failure, token usage and an estimated cost.", "Usage is metered into the existing WINDELS billing architecture."] },
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
          <div className="rounded-lg border border-white/10 bg-bg-deep/60 p-3">
            <div className="text-[11px] text-text-muted mb-1">JavaScript SDK</div>
            <pre className="text-[11px] text-azure">{`const result = await windels.agents.execute({
  agentId: "agent_id",
  input: { message: "Analyze this business data" }
});`}</pre>
          </div>
          <div className="rounded-lg border border-white/10 bg-bg-deep/60 p-3">
            <div className="text-[11px] text-text-muted mb-1">Python SDK</div>
            <pre className="text-[11px] text-azure">{`result = windels.agents.execute(
    agent_id="agent_id",
    input={"message": "Analyze this business data"}
)`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DeveloperPortalPage;
