/**
 * Session 194 — Tier 4 hybridExec console.
 *
 * `hybridExec` (Session 43) had 11 routes and a 17-LOC client but no
 * console page. The dashboard reported the same hardcoded "hybrid
 * mode active, cost optimization on, vendor-neutral, routed through
 * kernel" for every org regardless of state — S194 closed that by
 * per-org keys, per-org mode/flags, and org-scoped reads. This page
 * is the first UI surface.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cpu, HardDrive, RefreshCw, RotateCcw, Settings, Sparkles, X } from "lucide-react";
import type {
  HxDashboard,
  HxExecutionMode,
  HxGpuNode,
  HxModel,
  HxRouteDecision,
} from "@windels/shared";
import { hxApi } from "@/lib/hybridExec";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function StatusBadge({ status }: { status: HxModel["status"] }) {
  if (status === "deployed") return <Badge variant="emerald">Deployed</Badge>;
  if (status === "canary") return <Badge variant="azure">Canary</Badge>;
  if (status === "registered") return <Badge variant="slate">Registered</Badge>;
  if (status === "benchmarking") return <Badge variant="amber">Benchmarking</Badge>;
  if (status === "deprecated") return <Badge variant="amber">Deprecated</Badge>;
  if (status === "retired") return <Badge variant="crimson">Retired</Badge>;
  return <Badge>{status}</Badge>;
}

function ModeBadge({ mode }: { mode: HxExecutionMode }) {
  if (mode === "self-hosted") return <Badge variant="emerald">Self-hosted</Badge>;
  if (mode === "hybrid") return <Badge variant="azure">Hybrid</Badge>;
  return <Badge variant="violet">Connected-Enterprise</Badge>;
}

export function HybridExecPage() {
  const [dashboard, setDashboard] = useState<HxDashboard | null>(null);
  const [models, setModels] = useState<HxModel[]>([]);
  const [nodes, setNodes] = useState<HxGpuNode[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [flagSaving, setFlagSaving] = useState<string | null>(null);

  // route form
  const [modality, setModality] = useState("text");
  const [vram, setVram] = useState(1000);
  const [routeResult, setRouteResult] = useState<HxRouteDecision | null>(null);

  // register form
  const [regName, setRegName] = useState("");
  const [regSize, setRegSize] = useState("7B");
  const [regQuant, setRegQuant] = useState("q4");
  const [regModality, setRegModality] = useState<HxModel["modality"]>("text");
  const [regVram, setRegVram] = useState(5500);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [d, m, n] = await Promise.all([hxApi.dashboard(), hxApi.models(), hxApi.nodes()]);
      setDashboard(d);
      setModels(m);
      setNodes(n);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setMode(mode: HxExecutionMode) {
    setModeSaving(true);
    try { await hxApi.setMode(mode); await load(); } catch (e: any) { setErr(e?.message ?? "Mode failed"); } finally { setModeSaving(false); }
  }
  async function toggleFlag(key: "costOptimization" | "vendorNeutral" | "routedThroughKernel", enabled: boolean) {
    setFlagSaving(key);
    try { await hxApi.setFlag(key, enabled); await load(); } catch (e: any) { setErr(e?.message ?? "Flag failed"); } finally { setFlagSaving(null); }
  }
  async function registerModel() {
    if (!regName) return;
    try {
      await hxApi.registerModel({ name: regName, modality: regModality, size: regSize, quant: regQuant, vramMb: regVram, provider: "self-hosted" });
      setRegName("");
      await load();
    } catch (e: any) { setErr(e?.message ?? "Register failed"); }
  }
  async function rollback(id: string) {
    try { await hxApi.rollback(id); await load(); } catch (e: any) { setErr(e?.message ?? "Rollback failed"); }
  }
  async function route() {
    try {
      const r = await hxApi.route({ modality, requiredVramMb: vram });
      setRouteResult(r);
      await load();
    } catch (e: any) { setErr(e?.message ?? "Routing failed"); }
  }

  if (!dashboard) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading hybrid execution…"}</div>;

  const empty = dashboard.modelsRegistered === 0 && dashboard.gpuNodes === 0
    && !dashboard.canaryActive && dashboard.rollbacks24h === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Hybrid Execution</h1>
          <p className="text-sm text-text-muted">Self-hosted / hybrid / connected-enterprise routing, model registry, GPU node inventory. Per-org mode + feature flags; the S194 fix made every figure honest.</p>
        </div>
        <Button variant="ghost" onClick={load} loading={busy}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {empty && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">No hybrid execution telemetry yet</div>
            <div className="text-text-muted">This organization has not registered any models, listed any GPU nodes, or selected an active mode. The dashboard defaults to <code>self-hosted</code> until you call <code>PUT /hybrid-execution/mode</code>.</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardDescription>Models registered</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.modelsRegistered}</div><div className="text-xs text-text-muted">{dashboard.modelsDeployed} deployed</div></CardContent></Card>
        <Card><CardHeader><CardDescription>GPU nodes</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.gpuNodes}</div><div className="text-xs text-text-muted">utilization: {dashboard.gpuUtilizationPct}%</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Canary active</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.canaryActive ? "Yes" : "No"}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Rollbacks (24h)</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.rollbacks24h}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><Settings className="h-4 w-4 inline mr-1"/>Active execution mode</CardTitle>
          <CardDescription>Per-org configuration. The S43 default of "hybrid" was a hardcoded lie; the active mode is what you set, defaulting to self-hosted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Currently:</span>
            <ModeBadge mode={dashboard.activeMode} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={dashboard.activeMode === "self-hosted" ? "primary" : "ghost"} loading={modeSaving} onClick={() => setMode("self-hosted")}>Self-hosted</Button>
            <Button size="sm" variant={dashboard.activeMode === "hybrid" ? "primary" : "ghost"} loading={modeSaving} onClick={() => setMode("hybrid")}>Hybrid</Button>
            <Button size="sm" variant={dashboard.activeMode === "connected-enterprise" ? "primary" : "ghost"} loading={modeSaving} onClick={() => setMode("connected-enterprise")}>Connected-Enterprise</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>Per-org toggles. The S43 dashboard asserted all three true; the S194 dashboard reads these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {([
            { key: "costOptimization" as const, label: "Cost optimization" },
            { key: "vendorNeutral" as const, label: "Vendor neutral" },
            { key: "routedThroughKernel" as const, label: "Routed through kernel" },
          ]).map(({ key, label }) => {
            const enabled = (dashboard as any)[key] === true;
            return (
              <div key={key} className="flex items-center justify-between border-b border-border/40 py-2">
                <div className="text-sm text-text-bright">{label}</div>
                <div className="flex items-center gap-2">
                  <Badge variant={enabled ? "emerald" : "slate"}>{enabled ? "On" : "Off"}</Badge>
                  <Button size="sm" variant="ghost" loading={flagSaving === key} onClick={() => toggleFlag(key, !enabled)}>{enabled ? "Disable" : "Enable"}</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><Sparkles className="h-4 w-4 inline mr-1"/>Models</CardTitle>
          <CardDescription>Per-org model registry. Deployments can move through registered → benchmarking → canary → deployed → deprecated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {models.length === 0 ? (
            <div className="text-sm text-text-muted">No models registered for this org.</div>
          ) : models.map(m => (
            <div key={m.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <div className="font-semibold text-text-bright">{m.name}</div>
                <div className="text-xs text-text-muted">{m.modality} · {m.size} · {m.quant} · {m.vramMb} MB{m.benchmarkScore ? ` · score ${m.benchmarkScore}` : ""}{m.canaryPct !== undefined ? ` · canary ${m.canaryPct}%` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                <Button size="sm" variant="ghost" onClick={() => rollback(m.id)}><RotateCcw className="h-3 w-3 mr-1"/>Rollback</Button>
              </div>
            </div>
          ))}
          <div className="pt-3 space-y-2">
            <div className="text-xs font-semibold text-text-muted">Register a new model</div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input placeholder="name (e.g. windels-llm-7b)" value={regName} onChange={e => setRegName(e.target.value)} />
              <select className="rounded bg-bg-deep border border-border px-2 py-1 text-sm" value={regModality} onChange={e => setRegModality(e.target.value as any)}>
                {(["text", "image", "audio", "video", "speech", "multimodal", "embedding", "vision"] as const).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <Input placeholder="size (e.g. 7B)" value={regSize} onChange={e => setRegSize(e.target.value)} />
              <Input placeholder="quant (e.g. q4)" value={regQuant} onChange={e => setRegQuant(e.target.value)} />
              <Input type="number" placeholder="VRAM (MB)" value={regVram} onChange={e => setRegVram(Number(e.target.value))} />
              <Button onClick={registerModel}>Register</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><HardDrive className="h-4 w-4 inline mr-1"/>GPU nodes</CardTitle>
          <CardDescription>Per-org GPU node inventory. The dashboard reports mean utilization over online nodes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {nodes.length === 0 ? (
            <div className="text-sm text-text-muted">No GPU nodes registered for this org.</div>
          ) : nodes.map(n => (
            <div key={n.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <div className="font-semibold text-text-bright">{n.name}</div>
                <div className="text-xs text-text-muted">{(n.vramTotalMb - n.vramUsedMb).toLocaleString()} / {n.vramTotalMb.toLocaleString()} MB free · {n.activeJobs} active jobs</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-mono w-12 text-right">{n.utilPct}%</div>
                <Badge variant={n.online ? "emerald" : "crimson"}>{n.online ? "Online" : "Offline"}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><Cpu className="h-4 w-4 inline mr-1"/>Route a request</CardTitle>
          <CardDescription>Per-org policy routing. Self-hosted preferred when a node has the VRAM; hybrid fallback when GPU is saturated; connected-enterprise when costOptimize=false.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <Input placeholder="modality" value={modality} onChange={e => setModality(e.target.value)} />
            <Input type="number" placeholder="required VRAM (MB)" value={vram} onChange={e => setVram(Number(e.target.value))} />
            <Button onClick={route}>Route</Button>
          </div>
          {routeResult && (
            <div className="rounded border border-border/40 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Mode:</span>
                <ModeBadge mode={routeResult.mode} />
                <span className="text-text-muted">Target model:</span>
                <span className="font-mono">{routeResult.targetModel}</span>
              </div>
              <div className="text-text-muted">{routeResult.reason}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}
    </div>
  );
}

export default HybridExecPage;
