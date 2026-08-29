/**
 * Session 205 — Engineering Observability console (/app/engineering)
 *
 * Dedicated page for the Session 26 engineering module (previously
 * PlatformPage-tab only): SLO/service metrics, deployment analytics, tech-debt
 * ledger, pipeline runs and developer productivity — all from the real
 * `engApi` surface, honestly empty until data is recorded.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity, Bug, Gauge, Plus, RefreshCw, Rocket, TrendingUp,
} from "lucide-react";
import { engApi, type ServiceMetric, type DeploymentRecord, type DebtItem, type PipelineRun } from "@/lib/engineering";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

type Dash = Awaited<ReturnType<typeof engApi.dashboard>>;

function tierVariant(t: string): any { return t === "tier1" ? "crimson" : t === "tier2" ? "amber" : "slate"; }
function deployVariant(s: string): any { return s === "success" ? "emerald" : s === "in_progress" ? "azure" : "crimson"; }
function debtVariant(s: string): any { return s === "open" ? "crimson" : s === "in_progress" ? "amber" : "emerald"; }
const nOr = (v: number | null | undefined, suffix = "") => (v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}${suffix}`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900/40">
      <CardHeader className="pb-2"><CardDescription className="text-xs text-slate-400">{label}</CardDescription><CardTitle className="text-2xl text-slate-100">{value}</CardTitle></CardHeader>
      {sub ? <CardContent className="text-xs text-slate-500">{sub}</CardContent> : null}
    </Card>
  );
}

export function EngineeringPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [services, setServices] = useState<ServiceMetric[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [debt, setDebt] = useState<DebtItem[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  // forms
  const [depService, setDepService] = useState(""); const [depVersion, setDepVersion] = useState(""); const [depEnv, setDepEnv] = useState("staging");
  const [debtTitle, setDebtTitle] = useState(""); const [debtSeverity, setDebtSeverity] = useState("medium");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [d, s, dep, dbt, p] = await Promise.all([
        engApi.dashboard(), engApi.listServices(), engApi.listDeployments(25),
        engApi.listDebt(), engApi.listPipelines(25),
      ]);
      setDash(d); setServices(s); setDeployments(dep); setDebt(dbt); setPipelines(p);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to load engineering data", type: "error" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recordDeployment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await engApi.recordDeployment({ service: depService, version: depVersion, environment: depEnv as any, status: "in_progress", triggeredBy: "console" } as any);
      setDepService(""); setDepVersion("");
      setMsg({ text: "Deployment recorded", type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Failed to record deployment", type: "error" }); }
  };

  const createDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await engApi.createDebt({ title: debtTitle, severity: debtSeverity as any, status: "open" } as any);
      setDebtTitle("");
      setMsg({ text: "Tech-debt item created", type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Failed to create debt item", type: "error" }); }
  };

  const setDebtStatus = async (id: string, status: string) => {
    try {
      await engApi.setDebtStatus(id, status as DebtItem["status"]);
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Status update failed", type: "error" }); }
  };

  const t = (v: string) => `data-[state=active]:border-b-2 data-[state=active]:border-sky-500 ${v}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Engineering Observability</h1>
            <Badge variant="azure" className="text-xs">Session 26</Badge>
            <Badge variant="outline" className="text-xs">DORA · SLOs · tech debt</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Service-level objectives, deployment frequency and change-fail rate, the tech-debt ledger, CI pipelines
            and developer productivity — one console for engineering health.
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
          <Stat label="Deploy frequency" value={nOr(dash.deployments.deployFrequencyPerWeek, "/wk")} sub={`${dash.deployments.deploysLast7d} last 7d`} />
          <Stat label="Change-fail rate" value={nOr(dash.deployments.changeFailRatePct, "%")} sub={`MTTR ${nOr(dash.deployments.mttrHours, "h")}`} />
          <Stat label="Open tech debt" value={String(dash.debt.byStatus?.open ?? debt.filter((d) => d.status === "open").length)} sub={`${dash.debt.totalItems} items · trend ${dash.debt.trend30d}`} />
          <Stat label="Pipeline pass rate" value={nOr(dash.pipelines.passRatePct, "%")} sub={`${dash.pipelines.totalRuns7d ?? pipelines.length} runs 7d`} />
        </div>
      )}

      <Tabs defaultValue="services" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent">
          <TabsTrigger value="services" className={t("")}>Services &amp; SLOs ({services.length})</TabsTrigger>
          <TabsTrigger value="deployments" className={t("")}>Deployments ({deployments.length})</TabsTrigger>
          <TabsTrigger value="debt" className={t("")}>Tech Debt ({debt.length})</TabsTrigger>
          <TabsTrigger value="pipelines" className={t("")}>Pipelines ({pipelines.length})</TabsTrigger>
          <TabsTrigger value="productivity" className={t("")}>Productivity</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Gauge className="h-4 w-4 text-sky-400" />Service metrics &amp; error budgets</CardTitle>
              <CardDescription className="text-xs text-slate-400">p95 latency vs SLO, availability and remaining error budget per service.</CardDescription></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {loading ? <p className="text-sm text-slate-500">Loading…</p>
                : services.length === 0 ? <p className="text-sm text-slate-500">No services reporting metrics yet.</p>
                  : services.map((s) => (
                    <div key={s.serviceId} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="w-48 truncate text-sm text-slate-200">{s.name}</span>
                      <Badge variant={tierVariant(s.tier)} className="text-[10px]">{s.tier}</Badge>
                      <span className="font-mono text-xs text-slate-400">p95 {Math.round(s.p95LatencyMs)}ms / SLO {Math.round(s.sloLatencyMs)}ms</span>
                      <span className="font-mono text-xs text-slate-400">{s.availabilityPct.toFixed(2)}% avail</span>
                      <Badge variant={s.errorBudgetRemainingPct > 50 ? "emerald" : s.errorBudgetRemainingPct > 20 ? "amber" : "crimson"} className="text-[10px]">budget {Math.round(s.errorBudgetRemainingPct)}%</Badge>
                      <span className="ml-auto text-[10px] text-slate-500">{s.owner}</span>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployments" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="text-slate-100">Record a deployment</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={recordDeployment} className="flex flex-wrap items-center gap-3">
                <Input value={depService} onChange={(e) => setDepService(e.target.value)} placeholder="service" className="w-40" />
                <Input value={depVersion} onChange={(e) => setDepVersion(e.target.value)} placeholder="version" className="w-32" />
                <Select value={depEnv} onChange={(e) => setDepEnv(e.target.value)} className="w-36">
                  <option value="dev">dev</option><option value="staging">staging</option><option value="canary">canary</option><option value="production">production</option>
                </Select>
                <Button type="submit" disabled={!depService || !depVersion}><Plus className="mr-1 h-4 w-4" />Record</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Rocket className="h-4 w-4 text-emerald-400" />Recent deployments</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {deployments.length === 0 ? <p className="text-sm text-slate-500">No deployments recorded.</p> : deployments.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-200">{d.service} <span className="font-mono text-xs text-slate-400">v{d.version}</span></span>
                  <Badge variant="outline" className="text-[10px]">{d.environment}</Badge>
                  <Badge variant={deployVariant(d.status)} className="text-[10px]">{d.status.replace("_", " ")}</Badge>
                  <span className="text-[10px] text-slate-500">{new Date(d.startedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="text-slate-100">Log tech debt</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createDebt} className="flex flex-wrap items-center gap-3">
                <Input value={debtTitle} onChange={(e) => setDebtTitle(e.target.value)} placeholder="title" className="w-72" />
                <Select value={debtSeverity} onChange={(e) => setDebtSeverity(e.target.value)} className="w-32">
                  <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
                </Select>
                <Button type="submit" disabled={!debtTitle}><Plus className="mr-1 h-4 w-4" />Add</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Bug className="h-4 w-4 text-amber-400" />Tech-debt ledger</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {debt.length === 0 ? <p className="text-sm text-slate-500">No tech-debt items.</p> : debt.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 truncate text-sm text-slate-200">{d.title}</span>
                  <Badge variant={d.severity === "critical" || d.severity === "high" ? "crimson" : "slate"} className="text-[10px]">{d.severity}</Badge>
                  <Badge variant={debtVariant(d.status)} className="text-[10px]">{d.status.replace("_", " ")}</Badge>
                  {d.status !== "resolved" && (
                    <>
                      {d.status === "open" && <Button size="sm" variant="ghost" onClick={() => void setDebtStatus(d.id, "in_progress")}>start</Button>}
                      <Button size="sm" variant="ghost" onClick={() => void setDebtStatus(d.id, "resolved")}>resolve</Button>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipelines" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Activity className="h-4 w-4 text-violet-400" />Pipeline runs</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-1 overflow-y-auto">
              {pipelines.length === 0 ? <p className="text-sm text-slate-500">No pipeline runs recorded.</p> : pipelines.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-200">{p.pipeline} <span className="font-mono text-[10px] text-slate-500">{p.branch}</span>{p.flaky && <Badge variant="amber" className="ml-1 text-[10px]">flaky</Badge>}</span>
                  <Badge variant={p.status === "passed" ? "emerald" : p.status === "running" ? "azure" : "crimson"} className="text-[10px]">{p.status}</Badge>
                  <span className="text-[10px] text-slate-500">{new Date(p.startedAt).toLocaleString()} · {Math.round(p.durationMs / 1000)}s</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productivity" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><TrendingUp className="h-4 w-4 text-emerald-400" />Developer productivity</CardTitle>
              <CardDescription className="text-xs text-slate-400">Loaded live from the productivity service.</CardDescription></CardHeader>
            <CardContent>
              <ProductivitySection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductivitySection() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof engApi.productivitySummary>> | null>(null);
  const [developers, setDevelopers] = useState<Awaited<ReturnType<typeof engApi.listDevelopers>> | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const [s, d] = await Promise.all([engApi.productivitySummary(), engApi.listDevelopers()]);
        setSummary(s); setDevelopers(d);
      } catch { /* leave empty state */ }
    })();
  }, []);
  if (!summary) return <p className="text-sm text-slate-500">No productivity data recorded yet.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active developers" value={String(summary.activeDevelopers)} sub={`${developers?.length ?? 0} with stats`} />
        <Stat label="PRs merged (7d)" value={String(summary.prsMerged7d)} sub={`${summary.prsOpened7d} opened`} />
        <Stat label="Avg time to merge" value={nOr(summary.avgTimeToMergeHours, "h")} sub={`focus ${nOr(summary.focusScorePct, "%")}`} />
      </div>
      {developers && developers.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {developers.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
              <span className="flex-1 text-sm text-slate-200">{d.displayName}</span>
              <span className="text-[10px] text-slate-500">{d.prsMerged} merged · {d.prsReviewed} reviewed · merge {nOr(d.avgTimeToMergeHours, "h")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
