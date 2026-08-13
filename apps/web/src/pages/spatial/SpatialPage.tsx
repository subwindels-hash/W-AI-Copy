/**
 * Session 156 — Spatial console (/app/spatial).
 *
 * Honesty: the dashboard no longer seeds a fake campus. devicesOnline is
 * heartbeats in the last 2 minutes, not a live WebXR probe.
 */
import { useCallback, useEffect, useState } from "react";
import { Box, Play, Radio, Map as MapIcon, Sparkles } from "lucide-react";
import { spatialApi, type SpatialSession, type SpatialDashboard, type SpatialMode } from "@/lib/spatial";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

export function SpatialPage() {
  const [dash, setDash] = useState<SpatialDashboard | null>(null);
  const [sessions, setSessions] = useState<SpatialSession[]>([]);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<SpatialMode>("ar");
  const [device, setDevice] = useState<SpatialSession["deviceTarget"]>("hololens");
  const [fp, setFp] = useState("headset-01");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([spatialApi.dashboard(), spatialApi.listSessions()]);
    setDash(d); setSessions(s);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Spatial Computing</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Register AR/VR/MR/XR sessions and the headsets that heartbeat in.
          This is not a live WebXR runtime — devices online means a fingerprint
          reported in the last two minutes. An empty org stays empty.
        </p>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.totalSessions ?? "…"}</CardTitle><CardDescription>Sessions</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.activeSessions ?? "…"}</CardTitle><CardDescription>Active</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.devicesOnline ?? "…"}</CardTitle><CardDescription>Devices online (heartbeat)</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.devicesSeen ?? "…"}</CardTitle><CardDescription>Devices ever seen</CardDescription></CardHeader></Card>
      </div>
      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions"><Box className="mr-1.5 h-4 w-4" />Sessions</TabsTrigger>
          <TabsTrigger value="devices"><Radio className="mr-1.5 h-4 w-4" />Devices</TabsTrigger>
          <TabsTrigger value="maps"><MapIcon className="mr-1.5 h-4 w-4" />Maps</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Launch a session</CardTitle>
              <CardDescription>Creates a register row and a device heartbeat. No headset stream is opened.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-56" />
              <Select value={mode} onChange={(e) => setMode(e.target.value as SpatialMode)} className="w-28">
                {(["ar", "vr", "mr", "xr"] as SpatialMode[]).map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </Select>
              <Select value={device} onChange={(e) => setDevice(e.target.value as SpatialSession["deviceTarget"])} className="w-40">
                {(["vision_pro", "hololens", "quest", "desktop", "mobile", "smart_glasses"] as SpatialSession["deviceTarget"][]).map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </Select>
              <Button size="sm" disabled={!title} onClick={async () => {
                try { await spatialApi.createSession({ title, mode, deviceTarget: device }); setTitle(""); setMsg("session registered"); await load(); }
                catch (e: any) { setMsg(e.message); }
              }}><Play className="mr-1 h-3.5 w-3.5" />Launch</Button>
            </CardContent>
          </Card>
          {sessions.length === 0 ? <p className="text-sm text-slate-500">No sessions. Nothing is seeded.</p> : null}
          {sessions.map((s) => (
            <Card key={s.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className={`h-2 w-2 rounded-full ${s.status === "streaming" ? "bg-emerald-400" : "bg-slate-500"}`} />
                <span className="font-semibold text-slate-100">{s.title}</span>
                <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40">{s.mode.toUpperCase()}</Badge>
                <Badge className="bg-slate-700/40 text-slate-300">{s.deviceTarget.replace(/_/g, " ")}</Badge>
                <Badge className={s.status === "streaming" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-slate-700/40 text-slate-400"}>{s.status}</Badge>
                {s.status !== "idle" ? <Button size="sm" variant="outline" onClick={async () => { await spatialApi.endSession(s.id); await load(); }}>End</Button> : null}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="devices" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Device heartbeat</CardTitle>
              <CardDescription>{dash?.provenance?.devicesOnline}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Fingerprint" value={fp} onChange={(e) => setFp(e.target.value)} className="w-48" />
              <Button size="sm" onClick={async () => {
                try { await spatialApi.heartbeat({ fingerprint: fp, deviceTarget: device }); setMsg("heartbeat recorded"); await load(); }
                catch (e: any) { setMsg(e.message); }
              }}><Radio className="mr-1 h-3.5 w-3.5" />Beat</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="maps" className="space-y-3">
          <p className="text-sm text-slate-400">
            Maps, waypoints and holographic dashboards exist only when recorded.
            With demo data off this org has {dash?.indoorMaps ?? 0} maps and {dash?.waypoints ?? 0} waypoints.
          </p>
          <p className="text-xs text-slate-500">{dash?.provenance?.twinsVisualized}</p>
          <Sparkles className="h-4 w-4 text-fuchsia-400" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
