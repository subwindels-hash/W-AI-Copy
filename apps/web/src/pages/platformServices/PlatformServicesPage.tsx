/**
 * Session 205 — Enterprise Platform Services console (/app/platform-services)
 *
 * Dedicated page for the Session 29 platform-services module (previously
 * PlatformPage-tab only): the rollup dashboard plus config registry, feature
 * flags (toggle/evaluate), policies, tenants, capabilities, licensing and
 * billing — all from the real `psvcApi` surface. Read-heavy; flag toggles and
 * license verification are the write actions exposed here.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Building2, CreditCard, Flag, KeyRound, Layers, Puzzle, RefreshCw, ScrollText, Settings2, ShieldCheck,
} from "lucide-react";
import {
  psvcApi,
  type PlatformServicesDashboard, type ConfigEntry, type FeatureFlag, type Policy,
  type Tenant, type CapabilityRecord, type License, type BillingAccount, type Blueprint,
} from "@/lib/platformServices";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900/40">
      <CardHeader className="pb-2"><CardDescription className="text-xs text-slate-400">{label}</CardDescription><CardTitle className="text-2xl text-slate-100">{value}</CardTitle></CardHeader>
      {sub ? <CardContent className="text-xs text-slate-500">{sub}</CardContent> : null}
    </Card>
  );
}
const nOr = (v: number | null | undefined, suffix = "") => (v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}${suffix}`);
const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `$${Math.round(v).toLocaleString()}`);

export function PlatformServicesPage() {
  const [dash, setDash] = useState<PlatformServicesDashboard | null>(null);
  const [config, setConfig] = useState<ConfigEntry[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [caps, setCaps] = useState<CapabilityRecord[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [billing, setBilling] = useState<BillingAccount[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [verifyKey, setVerifyKey] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [d, c, f, p, t, cap, l, b, bp] = await Promise.all([
        psvcApi.dashboard(), psvcApi.listConfig(), psvcApi.listFlags(), psvcApi.listPolicies(),
        psvcApi.listTenants(), psvcApi.listCapabilities(), psvcApi.listLicenses(), psvcApi.listBilling(),
        psvcApi.listBlueprints(),
      ]);
      setDash(d); setConfig(c); setFlags(f); setPolicies(p);
      setTenants(t); setCaps(cap); setLicenses(l); setBilling(b); setBlueprints(bp);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to load platform services", type: "error" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleFlag = async (id: string) => {
    try { await psvcApi.toggleFlag(id); await load(); } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Toggle failed", type: "error" }); }
  };
  const doVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await psvcApi.verifyLicense(verifyKey);
      setMsg({ text: r.valid ? `License valid — ${r.license?.holder ?? "holder"} (${r.license?.tier ?? "?"})` : `Invalid license: ${r.reason ?? "unknown reason"}`, type: r.valid ? "success" : "error" });
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Verification failed", type: "error" }); }
  };

  const t = (v: string) => `data-[state=active]:border-b-2 data-[state=active]:border-sky-500 ${v}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Platform Services</h1>
            <Badge variant="teal" className="text-xs">Session 29</Badge>
            <Badge variant="outline" className="text-xs">Config · Flags · Policies · Tenants</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            The platform substrate — configuration registry with hot-reload, feature flags, policy engine,
            tenant isolation, capability catalog, licensing and billing in one console.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>

      {msg && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-sm ${msg.type === "success" ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300" : "border border-rose-900/50 bg-rose-950/40 text-rose-300"}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {dash && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Config entries" value={String(dash.configEntries)} sub={`${dash.hotReloadable} hot-reloadable · ${dash.runtimeOverrides} runtime overrides`} />
          <Stat label="Feature flags" value={String(dash.featureFlags)} sub={`${dash.flagsActive} active`} />
          <Stat label="Policies" value={String(dash.policies)} sub={`${dash.policiesActive} active · ${dash.violations24h} violations 24h`} />
          <Stat label="Tenants" value={String(dash.tenants)} sub={`${dash.tenantsActive} active · ${dash.isolatedTenants} isolated`} />
          <Stat label="Licenses" value={String(dash.licenses)} sub={`${dash.licensesActive} active · ${dash.expiringLicenses30d} expiring 30d`} />
          <Stat label="MRR / ARR" value={`${money(dash.totalMrr)} / ${money(dash.totalArr)}`} sub={`${dash.accounts} accounts · ${dash.delinquentAccounts} delinquent`} />
          <Stat label="Capabilities" value={String(dash.capabilities)} sub="registered platform capabilities" />
          <Stat label="Policy evaluations 24h" value={String(dash.evaluations24h)} sub="policy engine throughput" />
        </div>
      )}

      <Tabs defaultValue="flags" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent flex-wrap">
          <TabsTrigger value="flags" className={t("")}>Flags ({flags.length})</TabsTrigger>
          <TabsTrigger value="config" className={t("")}>Config ({config.length})</TabsTrigger>
          <TabsTrigger value="policies" className={t("")}>Policies ({policies.length})</TabsTrigger>
          <TabsTrigger value="tenants" className={t("")}>Tenants ({tenants.length})</TabsTrigger>
          <TabsTrigger value="capabilities" className={t("")}>Capabilities ({caps.length})</TabsTrigger>
          <TabsTrigger value="licenses" className={t("")}>Licenses ({licenses.length})</TabsTrigger>
          <TabsTrigger value="billing" className={t("")}>Billing ({billing.length})</TabsTrigger>
          <TabsTrigger value="blueprints" className={t("")}>Blueprints ({blueprints.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Flag className="h-4 w-4 text-amber-400" />Feature flags</CardTitle>
              <CardDescription className="text-xs text-slate-400">Toggle flips a flag for 100% of its current rollout; evaluation honors segments/overrides server-side.</CardDescription></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {loading ? <p className="text-sm text-slate-500">Loading…</p>
                : flags.length === 0 ? <p className="text-sm text-slate-500">No feature flags defined.</p>
                  : flags.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="flex-1 truncate text-sm text-slate-200">{f.name} <span className="font-mono text-[10px] text-slate-500">{f.key}</span></span>
                      <Badge variant="outline" className="text-[10px]">{f.rolloutPct}%</Badge>
                      <Badge variant={f.status === "active" ? "emerald" : "slate"} className="text-[10px]">{f.status}</Badge>
                      <Button size="sm" variant={f.enabled ? "outline" : "primary"} onClick={() => void toggleFlag(f.id)}>{f.enabled ? "Disable" : "Enable"}</Button>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Settings2 className="h-4 w-4 text-sky-400" />Configuration registry</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {config.length === 0 ? <p className="text-sm text-slate-500">No config entries.</p> : config.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="font-mono text-xs text-slate-300">{c.key}</span>
                  <Badge variant="outline" className="text-[10px]">{c.scope}</Badge>
                  {c.hotReload && <Badge variant="azure" className="text-[10px]">hot-reload</Badge>}
                  {c.encrypted && <Badge variant="crimson" className="text-[10px]">encrypted</Badge>}
                  <span className="ml-auto text-[10px] text-slate-500">{c.updatedBy} · {new Date(c.updatedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><ScrollText className="h-4 w-4 text-violet-400" />Policy engine</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {policies.length === 0 ? <p className="text-sm text-slate-500">No policies defined.</p> : policies.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 truncate text-sm text-slate-200">{p.name} <span className="font-mono text-[10px] text-slate-500">{p.key}</span></span>
                  <Badge variant={p.effect === "deny" ? "crimson" : "emerald"} className="text-[10px]">{p.effect}</Badge>
                  <Badge variant={p.status === "active" ? "emerald" : "slate"} className="text-[10px]">{p.status}</Badge>
                  <span className="text-[10px] text-slate-500">prio {p.priority} · {p.violations30d} violations 30d</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Building2 className="h-4 w-4 text-teal-400" />Tenants &amp; isolation</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {tenants.length === 0 ? <p className="text-sm text-slate-500">No tenants provisioned.</p> : tenants.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-200">{t.displayName} <span className="font-mono text-[10px] text-slate-500">{t.slug}</span></span>
                  <Badge variant="outline" className="text-[10px]">{t.plan}</Badge>
                  <Badge variant={t.status === "active" ? "emerald" : "slate"} className="text-[10px]">{t.status}</Badge>
                  <span className="text-[10px] text-slate-500">{t.seatsUsed}/{t.seats} seats · {t.region}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Puzzle className="h-4 w-4 text-fuchsia-400" />Capability catalog</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {caps.length === 0 ? <p className="text-sm text-slate-500">No capabilities registered.</p> : caps.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-200">{c.name} <span className="font-mono text-[10px] text-slate-500">v{c.version} · {c.producer}</span></span>
                  <Badge variant={c.health === "healthy" ? "emerald" : c.health === "degraded" ? "amber" : "crimson"} className="text-[10px]">{c.health}</Badge>
                  {c.deprecated && <Badge variant="crimson" className="text-[10px]">deprecated</Badge>}
                  <span className="text-[10px] text-slate-500">p95 {Math.round(c.p95Ms)}ms · {c.requestsPerMin}/min</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licenses" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><KeyRound className="h-4 w-4 text-amber-400" />Licenses</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={doVerify} className="flex flex-wrap items-center gap-3">
                <Input value={verifyKey} onChange={(e) => setVerifyKey(e.target.value)} placeholder="license key to verify" className="w-72" />
                <Button type="submit" disabled={!verifyKey}><ShieldCheck className="mr-1 h-4 w-4" />Verify</Button>
              </form>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {licenses.length === 0 ? <p className="text-sm text-slate-500">No licenses issued.</p> : licenses.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="flex-1 text-sm text-slate-200">{l.holder} <span className="font-mono text-[10px] text-slate-500">{l.key.slice(0, 14)}…</span></span>
                    <Badge variant="outline" className="text-[10px]">{l.tier}</Badge>
                    <Badge variant={l.status === "active" ? "emerald" : "crimson"} className="text-[10px]">{l.status}</Badge>
                    <span className="text-[10px] text-slate-500">{l.seatsUsed}/{l.seats} seats · exp {new Date(l.expiresAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><CreditCard className="h-4 w-4 text-emerald-400" />Billing accounts</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {billing.length === 0 ? <p className="text-sm text-slate-500">No billing accounts.</p> : billing.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 font-mono text-xs text-slate-300">{b.tenantId}</span>
                  <Badge variant="outline" className="text-[10px]">{b.plan}</Badge>
                  <Badge variant={b.status === "current" ? "emerald" : b.status === "trial" ? "azure" : "crimson"} className="text-[10px]">{b.status.replace("_", " ")}</Badge>
                  <span className="text-[10px] text-slate-500">{money(b.mrr)}/mo · next {new Date(b.nextBillAt).toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blueprints" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Layers className="h-4 w-4 text-sky-400" />Industry blueprints</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {blueprints.length === 0 ? <p className="text-sm text-slate-500">No blueprints defined.</p> : blueprints.map((bp) => (
                <div key={bp.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-200">{bp.name}</span>
                  <Badge variant="outline" className="text-[10px]">{bp.category}</Badge>
                  {bp.industry && <Badge variant="outline" className="text-[10px]">{bp.industry}</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
