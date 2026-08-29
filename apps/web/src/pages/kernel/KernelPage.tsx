/**
 * Session 205 — Enterprise AI Kernel console (/app/kernel)
 *
 * Dedicated page for the Session 39 Kernel (previously PlatformPage-tab only):
 * live status dashboard, component health, the recent event stream, and safe
 * operational actions (dispatch a test event, run diagnostics, model select).
 * Read-heavy by design — destructive operations stay in the admin consoles.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Cpu, HeartPulse, Radio, RefreshCw, Send, Sparkles,
} from "lucide-react";
import { krApi, type KernelDashboard, type KernelComponent, type KernelEvent } from "@/lib/kernel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function statusVariant(s: string): any {
  return s === "online" ? "emerald" : s === "degraded" ? "amber" : s === "booting" ? "azure" : s === "stub" ? "slate" : "crimson";
}
const fmtUptime = (s: number) => {
  if (!s) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

export function KernelPage() {
  const [dash, setDash] = useState<KernelDashboard | null>(null);
  const [components, setComponents] = useState<KernelComponent[]>([]);
  const [events, setEvents] = useState<KernelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  // dispatch form
  const [dkind, setDkind] = useState("console.test");
  const [dsource, setDsource] = useState("kernel-console");
  const [dtarget, setDtarget] = useState("");
  const [diag, setDiag] = useState<{ healthy: boolean; degraded: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [d, c, e] = await Promise.all([krApi.dashboard(), krApi.components(), krApi.events()]);
      setDash(d); setComponents(c); setEvents(e);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to load kernel status", type: "error" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ev = await krApi.dispatch({ kind: dkind, source: dsource, target: dtarget || undefined });
      setMsg({ text: `Event dispatched (id ${String((ev as any).id ?? "ok")})`, type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Dispatch failed", type: "error" }); }
  };

  const runDiagnostics = async () => {
    try {
      const r = await krApi.runDiagnostics();
      setDiag(r);
      setMsg({ text: r.healthy ? "Diagnostics: kernel healthy" : `Diagnostics: degraded — ${r.degraded.join(", ")}`, type: r.healthy ? "success" : "error" });
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Diagnostics failed", type: "error" }); }
  };

  const online = components.filter((c) => c.status === "online").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Enterprise AI Kernel</h1>
            <Badge variant="violet" className="text-xs">Session 39</Badge>
            <Badge variant="outline" className="text-xs">Event bus core</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            The Kernel every module communicates through — component health, event flow, policy evaluation and
            resource arbitration in one console.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>

      {msg && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-sm ${msg.type === "success" ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300" : "border border-rose-900/50 bg-rose-950/40 text-rose-300"}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {loading && !dash ? <p className="text-sm text-slate-500">Loading kernel status…</p> : dash && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Components online", v: `${online}/${components.length}`, i: <Cpu className="h-4 w-4 text-violet-400" />, s: `uptime ${fmtUptime(dash.uptimeSeconds)}` },
              { l: "Events (24h)", v: String(dash.events24h), i: <Activity className="h-4 w-4 text-sky-400" />, s: `avg dispatch ${Math.round(dash.avgDispatchLatencyMs)} ms` },
              { l: "Policies evaluated (24h)", v: String(dash.policiesEvaluated24h), i: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, s: `${dash.policiesBlocked24h} blocked` },
              { l: "Self-heals (24h)", v: String(dash.selfHealed24h), i: <HeartPulse className="h-4 w-4 text-crimson" />, s: `${dash.modelSelections24h} model selections` },
            ].map((x) => (
              <Card key={x.l} className="border-slate-800 bg-slate-900/40">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between text-xs text-slate-400">{x.l}{x.i}</CardDescription>
                  <CardTitle className="text-2xl text-slate-100">{x.v}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-slate-500">{x.s}</CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100"><Cpu className="h-4 w-4 text-violet-400" />Components</CardTitle>
                <CardDescription className="text-xs text-slate-400">Registered kernel components and their health.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-96 space-y-1 overflow-y-auto">
                {components.length === 0 ? <p className="text-sm text-slate-500">No components registered.</p> : components.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="flex-1 text-sm text-slate-200">{c.name} <span className="font-mono text-[10px] text-slate-500">{c.key}</span></span>
                    <span className="text-[10px] text-slate-500">{Math.round(c.messageRate)}/s · {c.errorRate.toFixed(2)}% err</span>
                    <Badge variant={statusVariant(c.status)} className="text-[10px]">{c.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100"><Radio className="h-4 w-4 text-sky-400" />Recent events</CardTitle>
                <CardDescription className="text-xs text-slate-400">Newest first, live from the kernel event stream.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-96 space-y-1 overflow-y-auto">
                {events.length === 0 ? <p className="text-sm text-slate-500">No events yet — dispatch one below.</p> : events.map((e) => (
                  <div key={e.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-300">{e.kind}</span>
                      <span className="flex-1 text-[10px] text-slate-500">{e.source}{e.target ? ` → ${e.target}` : ""}</span>
                      <span className="text-[10px] text-slate-500">{new Date(e.at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100"><Send className="h-4 w-4 text-emerald-400" />Dispatch test event</CardTitle>
                <CardDescription className="text-xs text-slate-400">Publish one event through the kernel bus to verify routing.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={dispatch} className="flex flex-wrap items-center gap-3">
                  <Input value={dkind} onChange={(e) => setDkind(e.target.value)} placeholder="kind" className="w-40" />
                  <Input value={dsource} onChange={(e) => setDsource(e.target.value)} placeholder="source" className="w-40" />
                  <Input value={dtarget} onChange={(e) => setDtarget(e.target.value)} placeholder="target (optional)" className="w-44" />
                  <Button type="submit"><Send className="mr-1 h-4 w-4" />Dispatch</Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100"><Sparkles className="h-4 w-4 text-amber-400" />Diagnostics</CardTitle>
                <CardDescription className="text-xs text-slate-400">Probe kernel health and list degraded subsystems.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" onClick={() => void runDiagnostics()}>Run diagnostics</Button>
                {diag && (
                  <div className={`rounded border p-2 text-xs ${diag.healthy ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-300" : "border-amber-900/50 bg-amber-950/30 text-amber-200"}`}>
                    <div className="flex items-center gap-1 font-medium">
                      {diag.healthy ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {diag.healthy ? "All subsystems healthy" : "Degraded subsystems:"}
                    </div>
                    {!diag.healthy && <ul className="mt-1 list-inside list-disc">{diag.degraded.map((d) => <li key={d}>{d}</li>)}</ul>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
