/**
 * Session 155 — Robotics console (/app/robotics).
 *
 * Tabs: Fleet · Telemetry · Alerts · Maintenance · Connectors
 *
 * Honesty:
 *   - empty-fleet averages render "—" (null), never 0%.
 *   - operator-entered robots are labelled until a device reports.
 *   - MQTT is never shown as connected.
 *   - commands are local_state_only unless a live dispatch exists.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Bot, Activity, AlertTriangle, Wrench, Radio, Play, Pause, StopCircle,
  Plus, Loader2, Thermometer, Battery, Cpu,
} from "lucide-react";
import {
  roboticsApi, ROBOT_KINDS, MAINTENANCE_KINDS,
  type Robot, type RoboticsDashboard, type PredictiveMaintAlert,
  type FleetTelemetry, type MaintenanceWindow, type RoboticsConnector,
} from "@/lib/robotics";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmt(n: number | null | undefined, suffix = "") {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

function statusTone(s: string) {
  if (s === "active") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (s === "error") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
  if (s === "maintenance") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (s === "offline") return "bg-slate-700/40 text-slate-400";
  return "bg-sky-500/20 text-sky-300 border-sky-500/40";
}

export function RoboticsPage() {
  const [dash, setDash] = useState<RoboticsDashboard | null>(null);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [alerts, setAlerts] = useState<PredictiveMaintAlert[]>([]);
  const [maint, setMaint] = useState<MaintenanceWindow[]>([]);
  const [connectors, setConnectors] = useState<RoboticsConnector[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [history, setHistory] = useState<FleetTelemetry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [kind, setKind] = useState<Robot["kind"]>("warehouse_amr");
  const [bat, setBat] = useState("72");
  const [cpu, setCpu] = useState("18");
  const [temp, setTemp] = useState("");
  const [mwWhen, setMwWhen] = useState("");
  const [mwMins, setMwMins] = useState("60");
  const [mwKind, setMwKind] = useState<(typeof MAINTENANCE_KINDS)[number]>("preventive");

  const load = useCallback(async () => {
    const [d, rs, al, mw, cs] = await Promise.all([
      roboticsApi.dashboard(), roboticsApi.list(), roboticsApi.alerts(),
      roboticsApi.maintenance(), roboticsApi.connectors(),
    ]);
    setDash(d); setRobots(rs); setAlerts(al); setMaint(mw); setConnectors(cs);
    if (!selected && rs[0]) setSelected(rs[0].id);
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    void roboticsApi.telemetry(selected).then(setHistory).catch(() => setHistory([]));
  }, [selected]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await load(); } catch (e: any) { setMsg(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Robotics & Physical Automation</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Register machines, ingest the readings they report, and raise maintenance
          alerts from those readings. Averages are null until a device reports.
          Commands update the local register only — MQTT is never shown as connected.
        </p>
      </div>

      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.totalRobots ?? "…"}</CardTitle><CardDescription>Robots</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.measuredRobots ?? "…"}</CardTitle><CardDescription>With live telemetry</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{fmt(dash?.avgBatteryPct, "%")}</CardTitle><CardDescription>Avg battery (device-reported)</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{fmt(dash?.avgCpuPct, "%")}</CardTitle><CardDescription>Avg CPU (device-reported)</CardDescription></CardHeader></Card>
      </div>

      <Tabs defaultValue="fleet">
        <TabsList>
          <TabsTrigger value="fleet"><Bot className="mr-1.5 h-4 w-4" />Fleet</TabsTrigger>
          <TabsTrigger value="telemetry"><Activity className="mr-1.5 h-4 w-4" />Telemetry</TabsTrigger>
          <TabsTrigger value="alerts"><AlertTriangle className="mr-1.5 h-4 w-4" />Alerts</TabsTrigger>
          <TabsTrigger value="maintenance"><Wrench className="mr-1.5 h-4 w-4" />Maintenance</TabsTrigger>
          <TabsTrigger value="connectors"><Radio className="mr-1.5 h-4 w-4" />Connectors</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Register a robot</CardTitle>
              <CardDescription>Operator-entered until the machine posts telemetry.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
              <Input placeholder="Site" value={site} onChange={(e) => setSite(e.target.value)} className="w-40" />
              <Select value={kind} onChange={(e) => setKind(e.target.value as Robot["kind"])} className="w-52">
                {ROBOT_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
              </Select>
              <Button size="sm" disabled={busy || !name || !site} onClick={() => run(async () => {
                await roboticsApi.create({ name, site, kind }); setName(""); setSite("");
              }, "registered")}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}Provision
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {robots.length === 0 ? <p className="text-sm text-slate-500">No robots registered. The fleet is empty — not a simulated shop floor.</p> : null}
            {robots.map((r) => (
              <Card key={r.id} className="border-slate-800 bg-slate-900/60">
                <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                  <span className={`h-2 w-2 rounded-full ${r.status === "active" ? "bg-emerald-400" : r.status === "error" ? "bg-rose-400" : "bg-slate-500"}`} />
                  <span className="font-semibold text-slate-100">{r.name}</span>
                  <Badge className={statusTone(r.status)}>{r.status}</Badge>
                  <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">{r.kind.replace(/_/g, " ")}</Badge>
                  <span className="text-slate-500">{r.site}</span>
                  <Badge className={r.telemetrySource === "device_reported" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-slate-700/40 text-slate-400"}>
                    {r.telemetrySource ?? "unknown"}{r.telemetryStale ? " · stale" : ""}
                  </Badge>
                  {r.batteryPct != null ? <span className="text-slate-400"><Battery className="mr-0.5 inline h-3 w-3" />{r.batteryPct}%</span> : null}
                  <span className="text-slate-400"><Cpu className="mr-0.5 inline h-3 w-3" />{r.cpuPct}%</span>
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => run(() => roboticsApi.command(r.id, "start"))}><Play className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => roboticsApi.command(r.id, "pause"))}><Pause className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => roboticsApi.command(r.id, "stop"))}><StopCircle className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => roboticsApi.command(r.id, "maintenance"))}><Wrench className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => roboticsApi.remove(r.id), "removed")}>Remove</Button>
                  </div>
                  {r.lastCommandDispatch ? <span className="w-full text-[11px] text-slate-500">Last command: {r.lastCommandDispatch}</span> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="telemetry" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Ingest a device reading</CardTitle>
              <CardDescription>This is the live HTTP connector. Readings become the source of dashboard averages.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-64">
                <option value="">Select robot…</option>
                {robots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Input placeholder="Battery %" value={bat} onChange={(e) => setBat(e.target.value)} className="w-28" />
              <Input placeholder="CPU %" value={cpu} onChange={(e) => setCpu(e.target.value)} className="w-28" />
              <Input placeholder="Temp °C (opt)" value={temp} onChange={(e) => setTemp(e.target.value)} className="w-32" />
              <Button size="sm" disabled={busy || !selected} onClick={() => run(async () => {
                await roboticsApi.ingest(selected, {
                  batteryPct: bat === "" ? undefined : Number(bat),
                  cpuPct: cpu === "" ? undefined : Number(cpu),
                  tempC: temp === "" ? undefined : Number(temp),
                });
                setHistory(await roboticsApi.telemetry(selected));
              }, "reading stored")}>Record reading</Button>
            </CardContent>
          </Card>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Battery</th><th className="px-3 py-2">CPU</th><th className="px-3 py-2">Temp</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {history.map((h, i) => (
                  <tr key={h.ts + i} className="bg-slate-900/40">
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{h.ts}</td>
                    <td className="px-3 py-2">{h.source}</td>
                    <td className="px-3 py-2">{fmt(h.batteryPct, "%")}</td>
                    <td className="px-3 py-2">{fmt(h.cpuPct, "%")}</td>
                    <td className="px-3 py-2">{h.tempC == null ? "—" : `${h.tempC}°C`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 ? <p className="p-3 text-sm text-slate-500">No readings yet for this robot.</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => roboticsApi.predictiveScan(), "scan complete")}>
              <Thermometer className="mr-1 h-3.5 w-3.5" />Scan live telemetry
            </Button>
            <span className="text-xs text-slate-500">Alerts fire only on device-reported thresholds (temp ≥ 70°C, battery ≤ 15%, CPU ≥ 95%).</span>
          </div>
          {alerts.length === 0 ? <p className="text-sm text-slate-500">No alerts. A quiet board is an empty register, not a healthy-fleet claim.</p> : null}
          {alerts.map((a) => (
            <Card key={a.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <AlertTriangle className={`h-4 w-4 ${a.riskPct > 80 ? "text-rose-400" : "text-amber-400"}`} />
                <span className="font-semibold text-slate-100">{a.component}</span>
                <Badge className={a.status === "acknowledged" ? "bg-slate-700/40 text-slate-400" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}>{a.status ?? "open"}</Badge>
                <span className="text-slate-400 flex-1">{a.recommendation}</span>
                <span className="font-mono text-xs text-slate-500">risk {a.riskPct}%</span>
                {a.status !== "acknowledged" ? <Button size="sm" variant="outline" onClick={() => run(() => roboticsApi.ackAlert(a.id))}>Ack</Button> : null}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Schedule a window</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-64">
                <option value="">Select robot…</option>
                {robots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Input type="datetime-local" value={mwWhen} onChange={(e) => setMwWhen(e.target.value)} className="w-56" />
              <Input placeholder="Minutes" value={mwMins} onChange={(e) => setMwMins(e.target.value)} className="w-24" />
              <Select value={mwKind} onChange={(e) => setMwKind(e.target.value as typeof mwKind)} className="w-40">
                {MAINTENANCE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Button size="sm" disabled={busy || !selected || !mwWhen} onClick={() => run(() => roboticsApi.scheduleMaintenance({
                robotId: selected, scheduledAt: new Date(mwWhen).toISOString(), durationMin: Number(mwMins) || 60, kind: mwKind,
              }), "scheduled")}>Schedule</Button>
            </CardContent>
          </Card>
          {maint.length === 0 ? <p className="text-sm text-slate-500">No windows scheduled.</p> : null}
          {maint.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <Wrench className="h-3.5 w-3.5 text-amber-300" />
              <span className="font-mono text-xs text-slate-500">{m.robotId.slice(0, 12)}…</span>
              <Badge className="bg-slate-700/40 text-slate-300">{m.kind}</Badge>
              <span className="text-slate-300">{m.scheduledAt}</span>
              <span className="text-slate-500">{m.durationMin} min</span>
              <Badge className={statusTone(m.status)}>{m.status}</Badge>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="connectors" className="space-y-4">
          {(connectors.length ? connectors : dash?.connectors ?? []).map((c) => (
            <Card key={c.id} className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Radio className="h-4 w-4 text-sky-400" />{c.name}
                  <Badge className={c.status === "ready" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}>
                    {c.status.replace(/_/g, " ")}
                  </Badge>
                </CardTitle>
                <CardDescription>{c.note}</CardDescription>
              </CardHeader>
            </Card>
          ))}
          {dash?.provenance ? (
            <p className="text-xs text-slate-500">{dash.provenance.mqtt}</p>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
