/**
 * WINDELS AI OS — Wake Intelligence console.
 *
 * Wake-word / clap activation, device states, MFA policies and emergency
 * config. Event counts come from the live module.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Mic, Hand, Smartphone, ShieldCheck, Siren, X } from "lucide-react";
import type { WakeDashboard, ActivationEvent, ClapPattern, DeviceActivationState, MfaPolicy, EmergencyEvent } from "@windels/shared";
import { wiApi } from "@/lib/wakeIntel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{value}</div><div className="text-sm text-text-muted">{label}</div></CardContent></Card>
  );
}

export function WakeIntelPage() {
  const [dash, setDash] = useState<WakeDashboard | null>(null);
  const [activations, setActivations] = useState<ActivationEvent[]>([]);
  const [patterns, setPatterns] = useState<ClapPattern[]>([]);
  const [devices, setDevices] = useState<DeviceActivationState[]>([]);
  const [mfa, setMfa] = useState<MfaPolicy[]>([]);
  const [emergency, setEmergency] = useState<EmergencyEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, a, p, dev, m, e] = await Promise.all([
        wiApi.dashboard(), wiApi.activations(), wiApi.clapPatterns(), wiApi.devices(), wiApi.mfaPolicies(), wiApi.emergencyEvents(),
      ]);
      setDash(d); setActivations(a); setPatterns(p); setDevices(dev); setMfa(m); setEmergency(e);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading wake intelligence…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Mic className="h-6 w-6 text-azure" /> Wake Intelligence</h1>
          <p className="text-sm text-text-muted">Wake-word &amp; clap activation, devices, MFA and emergency.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Activation events" value={dash.activations24h ?? 0} />
        <Stat label="Clap patterns" value={patterns.length} />
        <Stat label="Devices" value={devices.length} />
        <Stat label="MFA policies" value={mfa.length} />
      </div>

      <Tabs defaultValue="activations">
        <TabsList>
          <TabsTrigger value="activations">Activations ({activations.length})</TabsTrigger>
          <TabsTrigger value="patterns">Clap patterns ({patterns.length})</TabsTrigger>
          <TabsTrigger value="devices">Devices ({devices.length})</TabsTrigger>
          <TabsTrigger value="mfa">MFA ({mfa.length})</TabsTrigger>
          <TabsTrigger value="emergency">Emergency ({emergency.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="activations">
          <Card><CardContent className="space-y-1 pt-4">
            {activations.length === 0 ? <div className="text-sm text-text-muted">No activations yet.</div> : activations.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="flex items-center gap-2"><Mic className="h-4 w-4 text-azure"/>{a.method} <span className="text-text-muted text-xs">· {a.deviceId}</span></span>
                <span className="text-text-muted text-xs">{fmtDate(a.timestamp)}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="patterns">
          <Card><CardContent className="space-y-1 pt-4">
            {patterns.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><Hand className="h-4 w-4"/>No clap patterns.</div> : patterns.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="font-medium">{p.name}</span>
                <Badge variant={p.enabled ? "emerald" : "amber"}>{p.enabled ? "enabled" : "disabled"}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card><CardContent className="space-y-1 pt-4">
            {devices.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><Smartphone className="h-4 w-4"/>No devices.</div> : devices.map((d) => (
              <div key={d.deviceId} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-azure"/>{d.deviceId} <span className="text-text-muted text-xs">· {d.deviceKind}</span></span>
                <span className="flex items-center gap-2">
                  <span className="text-text-muted text-xs">{d.offlineQueueDepth} queued</span>
                  <Badge variant={d.online ? "emerald" : "amber"}>{d.online ? "online" : "offline"}</Badge>
                </span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="mfa">
          <Card><CardContent className="space-y-1 pt-4">
            {mfa.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><ShieldCheck className="h-4 w-4"/>No MFA policies.</div> : mfa.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="font-medium">{m.name}</span>
                <Badge variant="outline">{m.requiredFactors.join(", ")}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="emergency">
          <Card><CardContent className="space-y-1 pt-4">
            {emergency.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><Siren className="h-4 w-4"/>No emergency events.</div> : emergency.slice(0, 20).map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="flex items-center gap-2"><Siren className="h-4 w-4 text-crimson"/>{e.triggerMethod} <span className="text-text-muted text-xs">· {e.respondersNotified} notified</span></span>
                <span className="text-text-muted text-xs">{fmtDate(e.timestamp)}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default WakeIntelPage;
