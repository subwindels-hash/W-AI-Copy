/**
 * Session 75 / Session 175 — Health, Wellness & Digital Healthcare Ecosystem Console (/app/health-ecosystem)
 *
 * Record-only honesty:
 * - Dashboard is a pure read; empty org/user shows hasData:false with zeroed DailyHealth and empty lists.
 * - All scores below stay at zero until real data exists — the azure banner explains the empty state.
 * - Fifth Standing Rule three-bucket labels enforced: manual/phone cannot upgrade to clinically_validated.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  HeartPulse,
  ShieldAlert,
  Dumbbell,
  Pill,
  Siren,
  Watch,
  Syringe,
  ClipboardList,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { hecApi, type HealthDashboard, type HealthMetric } from "@/lib/healthEcosystem";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function labelVariant(l: string): any {
  return l === "clinically_validated" ? "emerald" : l === "medical_decision_support" ? "crimson" : "slate";
}

export function HealthEcosystemPage() {
  const [dash, setDash] = useState<HealthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // metric form
  const [metricKind, setMetricKind] = useState("steps");
  const [metricValue, setMetricValue] = useState("8000");
  const [metricUnit, setMetricUnit] = useState("steps");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await hecApi.dashboard();
      setDash(d);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to load health dashboard", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAddMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await hecApi.addMetric({ kind: metricKind as any, value: parseFloat(metricValue), unit: metricUnit, source: "wearable" as any });
      setMsg({ text: `Recorded ${metricKind} ${metricValue} ${metricUnit}`, type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Failed to record metric", type: "error" }); }
  };

  const t = dash?.today;
  const lb = dash?.labelBreakdown as any;
  const noData = dash?.hasData === false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Health, Wellness & Digital Healthcare</h1>
            <Badge variant="outline" className="text-xs">Record-only</Badge>
            <Badge variant="outline" className="text-xs border-crimson/30 text-crimson">Fifth Standing Rule</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Wellness estimation, medical device integration, fitness, medications, preventive care and emergency alerts — three-bucket labels enforced. No synthetic vitals are ever generated.
          </p>
        </div>
        {dash && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
            <ShieldAlert className="h-4 w-4 text-crimson" />
            <span>hasData: {String(dash.hasData)} · {dash.recentMetrics.length} metrics · {dash.insights.length} insights</span>
          </div>
        )}
      </div>

      {noData && (
        <div className="p-3 rounded-md border border-sky-500/40 bg-sky-500/10 text-xs flex items-start gap-2">
          <Activity className="h-4 w-4 mt-0.5 text-sky-400 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sky-400">No health data recorded yet</div>
            <div className="opacity-90 mt-0.5 text-slate-400">
              This module reports only measurements you record or that a connected device submits — it does not generate sample vitals. Add a metric, log a session, or connect a device via the Metrics / Fitness / Devices tabs.
              All scores below stay at zero until real data exists.
            </div>
          </div>
        </div>
      )}

      <div className="p-3 rounded-md border border-crimson/40 bg-crimson/10 text-crimson-100 text-xs flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 text-crimson shrink-0" />
        <div className="flex-1">
          <div className="font-semibold text-crimson">Fifth Standing Rule — Three-Bucket Health Labels Enforced</div>
          <div className="opacity-90 mt-0.5 text-slate-300">{dash?.disclaimer || "For informational wellness use only — not medical advice."}</div>
          {dash && (
            <div className="mt-1 flex gap-2 text-[11px]">
              <Badge variant="slate">wellness_estimate × {lb?.wellness_estimate ?? 0}</Badge>
              <Badge variant="emerald">clinically_validated × {lb?.clinically_validated ?? 0}</Badge>
              <Badge variant="crimson">medical_decision_support × {lb?.medical_decision_support ?? 0}</Badge>
              <Badge variant={dash.consentStatus === "full" ? "emerald" : "crimson"}>consent: {dash.consentStatus}</Badge>
              <Badge variant="azure">{dash.privacyMode || "hipaa"}</Badge>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-sm ${msg.type === "success" ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300" : "border border-rose-900/50 bg-rose-950/40 text-rose-300"}`}>
          <div className="flex items-center gap-2">{msg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>{msg.text}</span></div>
          <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {dash && t && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/40"><CardHeader className="pb-2"><CardDescription className="flex items-center justify-between text-xs text-slate-400"><span>Today Score</span><Activity className="h-4 w-4 text-emerald-400" /></CardDescription><CardTitle className="text-2xl text-slate-100">{t.score}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Readiness {t.readiness}% · Recovery {t.recovery}%</CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/40"><CardHeader className="pb-2"><CardDescription className="flex items-center justify-between text-xs text-slate-400"><span>Sleep Quality</span><Activity className="h-4 w-4 text-indigo-400" /></CardDescription><CardTitle className="text-2xl text-slate-100">{t.sleepQuality}%</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Fitness {t.fitness}% · Stress {t.stressLevel}%</CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/40"><CardHeader className="pb-2"><CardDescription className="flex items-center justify-between text-xs text-slate-400"><span>Active Alerts</span><Siren className="h-4 w-4 text-rose-400" /></CardDescription><CardTitle className="text-2xl text-slate-100">{dash.emergencyAlerts30d.filter((a) => !a.acknowledged).length}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">{dash.emergencyAlerts30d.length} in 30d · Vacc due {dash.vaccinationUpcoming}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/40"><CardHeader className="pb-2"><CardDescription className="flex items-center justify-between text-xs text-slate-400"><span>Wearable Battery</span><Watch className="h-4 w-4 text-sky-400" /></CardDescription><CardTitle className="text-2xl text-slate-100">{dash.wearableBatteryPct ?? "—"}{dash.wearableBatteryPct != null ? "%" : ""}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">{dash.wearables.length} wearables · {dash.medicalDevices.length} med devices</CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent">
          <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Overview</TabsTrigger>
          <TabsTrigger value="metrics" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Metrics ({dash?.recentMetrics.length ?? 0})</TabsTrigger>
          <TabsTrigger value="fitness" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Fitness ({dash?.recentSessions.length ?? 0})</TabsTrigger>
          <TabsTrigger value="medications" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Medications ({dash?.medications.length ?? 0})</TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Alerts ({dash?.emergencyAlerts30d.length ?? 0})</TabsTrigger>
          <TabsTrigger value="devices" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Devices</TabsTrigger>
          <TabsTrigger value="preventive" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Preventive</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : dash ? (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Activity className="h-4 w-4 text-crimson" />Recent Metrics</CardTitle></CardHeader><CardContent className="space-y-1 max-h-80 overflow-y-auto">
                  {dash.recentMetrics.length === 0 ? <p className="text-sm text-slate-500">No metrics recorded.</p> : dash.recentMetrics.slice(0, 12).map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="flex-1 text-sm text-slate-200">{m.kind.replace(/_/g, " ")} <span className="font-mono text-xs text-slate-400">{m.value} {m.unit}</span></span>
                      <Badge variant={labelVariant(m.label)} className="text-[10px]">{m.label.replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                </CardContent></Card>
                <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Dumbbell className="h-4 w-4 text-emerald-400" />Fitness Sessions</CardTitle></CardHeader><CardContent className="space-y-1 max-h-80 overflow-y-auto">
                  {dash.recentSessions.length === 0 ? <p className="text-sm text-slate-500">No sessions logged.</p> : dash.recentSessions.map((s) => (
                    <div key={s.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <div className="flex items-center gap-2"><span className="flex-1 text-sm font-medium text-slate-200">{s.kind.replace(/_/g, " ")}</span><Badge variant="slate">{s.avgHr} bpm</Badge><Badge variant={labelVariant(s.label)}>{s.label.replace(/_/g, " ")}</Badge></div>
                      <div className="text-xs text-slate-500">{s.durationMin} min · {s.calories} kcal {s.distanceKm ? `· ${s.distanceKm} km` : ""}</div>
                    </div>
                  ))}
                </CardContent></Card>
                <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Pill className="h-4 w-4 text-violet-400" />Medications</CardTitle></CardHeader><CardContent className="space-y-1 max-h-80 overflow-y-auto">
                  {dash.medications.length === 0 ? <p className="text-sm text-slate-500">No medications.</p> : dash.medications.map((m) => (
                    <div key={m.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <div className="flex items-center gap-2"><span className="flex-1 text-sm font-medium text-slate-200">{m.name}</span><Badge variant={m.adherencePct > 90 ? "emerald" : m.adherencePct > 75 ? "amber" : "crimson"}>{m.adherencePct}%</Badge><Badge variant={labelVariant(m.label)}>{m.label.replace(/_/g, " ")}</Badge></div>
                      <div className="text-xs text-slate-500">{m.dose} · {m.frequency}{m.prescriber ? ` · ${m.prescriber}` : ""}</div>
                    </div>
                  ))}
                </CardContent></Card>
              </div>
              <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Sparkles className="h-4 w-4 text-sky-400" />AI Insights (labeled — Fifth Standing Rule)</CardTitle><CardDescription className="text-xs text-slate-400">Derived from recorded metrics only, always <code>wellness_estimate</code>.</CardDescription></CardHeader><CardContent className="space-y-2">
                {dash.insights.length === 0 ? <p className="text-sm text-slate-500">No insights — record sleep or vitals to derive trends.</p> : dash.insights.map((ins) => (
                  <div key={ins.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <div className="flex items-center gap-2"><Sparkles className="h-3 w-3 text-sky-400" /><span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{ins.category} · {ins.kind}</span><Badge variant={labelVariant(ins.label)}>{ins.label.replace(/_/g, " ")}</Badge><span className="text-xs text-slate-500">c {Math.round((ins.confidence || 0) * 100)}%</span></div>
                    <p className="mt-1 text-sm text-slate-300">{ins.text}</p>
                  </div>
                ))}
              </CardContent></Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="text-slate-100">Record a metric</CardTitle><CardDescription className="text-xs text-slate-400">Manual/phone entries are always <code>wellness_estimate</code> — clinical labels require a device source (bp_monitor/cgm/etc.).</CardDescription></CardHeader><CardContent>
            <form onSubmit={handleAddMetric} className="flex flex-wrap gap-3">
              <Input value={metricKind} onChange={(e) => setMetricKind(e.target.value)} placeholder="kind e.g. steps" className="w-40" />
              <Input value={metricValue} onChange={(e) => setMetricValue(e.target.value)} placeholder="value" className="w-32" />
              <Input value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} placeholder="unit" className="w-32" />
              <Button type="submit"><Plus className="mr-1 h-4 w-4" />Record</Button>
            </form>
          </CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="text-slate-100">Recent metrics</CardTitle></CardHeader><CardContent>
            {dash?.recentMetrics.length ? (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {dash.recentMetrics.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="flex-1 text-sm text-slate-200">{m.kind} <span className="font-mono text-xs text-slate-400">{m.value} {m.unit}</span> <span className="text-[10px] text-slate-500">{m.source}</span></span>
                    <Badge variant={labelVariant(m.label)}>{m.label.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-slate-500">{new Date(m.at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">No metrics.</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="fitness" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30"><CardContent className="p-6 text-center text-sm text-slate-500">Log sessions via <code>POST /health-ecosystem/fitness-sessions</code> — they appear here as <code>wellness_estimate</code>.</CardContent></Card>
        </TabsContent>

        <TabsContent value="medications" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30"><CardContent className="p-6 text-center text-sm text-slate-500">Manage medications via API — adherence starts at 0% and accrues from dose logging.</CardContent></Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="text-slate-100">Emergency alerts (30d)</CardTitle></CardHeader><CardContent>
            {dash?.emergencyAlerts30d.length ? (
              <div className="space-y-2">
                {dash.emergencyAlerts30d.map((a) => (
                  <div key={a.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <div className="flex items-center gap-2"><Siren className="h-4 w-4 text-rose-400" /><span className="flex-1 text-sm font-medium text-slate-200">{a.kind.replace(/_/g, " ")}</span><Badge variant={a.severity === "critical" || a.severity === "emergency" ? "crimson" : a.severity === "warn" ? "amber" : "slate"}>{a.severity}</Badge><Badge variant={a.acknowledged ? "emerald" : "crimson"}>{a.acknowledged ? "ack" : "unack"}</Badge><Badge variant={labelVariant(a.label)}>{a.label.replace(/_/g, " ")}</Badge></div>
                    <p className="mt-1 text-sm text-slate-400">{a.message}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">No alerts in the last 30 days.</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="devices" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="text-slate-100">Wearables</CardTitle><CardDescription className="text-xs text-slate-400">Explicitly linked — never assumed.</CardDescription></CardHeader><CardContent>
              {dash?.wearables.length ? dash.wearables.map((w) => (
                <div key={w.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2 mb-2">
                  <Watch className="h-4 w-4 text-sky-400" /><span className="flex-1 text-sm text-slate-200">{w.vendor} {w.model}</span><Badge variant={w.connected ? "emerald" : "crimson"}>{w.connected ? "connected" : "offline"}</Badge><Badge variant={labelVariant(w.label)}>{w.label.replace(/_/g, " ")}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">No wearables linked. Link via <code>POST /health-ecosystem/wearables</code>.</p>}
            </CardContent></Card>
            <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="text-slate-100">Medical devices</CardTitle></CardHeader><CardContent>
              {dash?.medicalDevices.length ? dash.medicalDevices.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2 mb-2">
                  <Stethoscope className="h-4 w-4 text-emerald-400" /><span className="flex-1 text-sm text-slate-200">{d.kind.replace(/_/g, " ")} {d.vendor}</span><Badge variant={d.connected ? "emerald" : "crimson"}>{d.connected ? "live" : "offline"}</Badge><Badge variant={d.calibrationStatus === "ok" ? "emerald" : "amber"}>cal {d.calibrationStatus}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">No medical devices.</p>}
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="preventive" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Syringe className="h-4 w-4" />Vaccinations</CardTitle></CardHeader><CardContent>
              {dash?.vaccinations.length ? dash.vaccinations.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2 mb-2"><span className="flex-1 text-sm text-slate-200">{v.name}</span><Badge variant={v.status === "up_to_date" ? "emerald" : v.status === "overdue" ? "crimson" : "amber"}>{v.status.replace(/_/g, " ")}</Badge></div>
              )) : <p className="text-sm text-slate-500">No vaccination records.</p>}
            </CardContent></Card>
            <Card className="border-slate-800 bg-slate-900/30"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><ClipboardList className="h-4 w-4" />Screenings</CardTitle></CardHeader><CardContent>
              {dash?.screenings.length ? dash.screenings.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2 mb-2"><span className="flex-1 text-sm text-slate-200">{s.name}</span><Badge variant={s.status === "up_to_date" ? "emerald" : s.status === "overdue" ? "crimson" : "amber"}>{s.status.replace(/_/g, " ")}</Badge></div>
              )) : <p className="text-sm text-slate-500">No screening records.</p>}
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
