/**
 * Session 191 — Tier 4 disasterRecovery console.
 *
 * `disasterRecovery` (Session 53) had 13 routes and a 17-LOC web client but
 * no console page; the inventory reported `pages: []`. The dashboard was
 * rebuilt honestly in S179 (activeRegion is null until configured; no
 * synthetic na-east topology, no failed drill at three days ago). This
 * page mirrors that honesty: a fresh org sees "no topology" everywhere
 * instead of fabricated drill history.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert, ShieldCheck, Activity, Plus, X } from "lucide-react";
import type {
  DrDashboard,
  DrDrill,
  DrFailoverEvent,
  DrStatus,
  DrComponent,
} from "@windels/shared";
import { DR_COMPONENTS } from "@windels/shared";
import { drApi } from "@/lib/disasterRecovery";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/store/auth";

function fmtDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function StatusBadge({ healthy }: { healthy: boolean }) {
  if (healthy) return <Badge variant="emerald"><ShieldCheck className="h-3 w-3 mr-1"/>Healthy</Badge>;
  return <Badge variant="amber"><ShieldAlert className="h-3 w-3 mr-1"/>Unverified</Badge>;
}

function ProvenanceNote({ p }: { p: DrDashboard["provenance"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provenance</CardTitle>
        <CardDescription>How this dashboard was derived (Session 179 honesty discipline).</CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-text-muted space-y-1">
        <div><strong>Topology:</strong> {p?.topology ?? "unknown"}{p?.topology === "unconfigured" ? " — no activeRegion is set; this org has not configured a topology." : ""}</div>
        <div>{p?.note ?? "—"}</div>
        <div className="pt-2 text-text-muted">No failover event, drill, or status field is invented. Components start <code>healthy: false</code> and become true only after a real drill records a passing result.</div>
      </CardContent>
    </Card>
  );
}

export function DisasterRecoveryPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user && (user.role === "admin" || user.role === "super_admin");
  const [data, setData] = useState<DrDashboard | null>(null);
  const [status, setStatus] = useState<DrStatus[]>([]);
  const [events, setEvents] = useState<DrFailoverEvent[]>([]);
  const [drills, setDrills] = useState<DrDrill[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // failover form
  const [component, setComponent] = useState<DrComponent>("ai_cluster");
  const [toRegion, setToRegion] = useState("eu-west");
  const [reason, setReason] = useState("");
  const [emergency, setEmergency] = useState(false);

  // schedule drill form
  const [drillComponent, setDrillComponent] = useState<DrComponent>("ai_cluster");
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 86400_000).toISOString().slice(0, 16));

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [d, s, e, ds] = await Promise.all([
        drApi.dashboard(), drApi.status(), drApi.events(), drApi.drills(),
      ]);
      setData(d); setStatus(s); setEvents(e); setDrills(ds);
      setEmergency(d.emergencyModeActive);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function failover() {
    if (!reason) { setErr("Reason is required for a manual failover."); return; }
    try {
      await drApi.failover({ component, toRegion, reason });
      setReason("");
      await load();
    } catch (e: any) { setErr(e?.message ?? "Failover failed"); }
  }

  async function scheduleDrill() {
    try {
      await drApi.scheduleDrill({ component: drillComponent, scheduledAt: new Date(scheduledAt).toISOString() });
      await load();
    } catch (e: any) { setErr(e?.message ?? "Schedule failed"); }
  }

  async function runDrill(id: string) {
    try { await drApi.runDrill(id); await load(); } catch (e: any) { setErr(e?.message ?? "Run failed"); }
  }

  async function toggleEmergency() {
    try { await drApi.setEmergency(!emergency); setEmergency(!emergency); } catch (e: any) { setErr(e?.message ?? "Toggle failed"); }
  }

  if (!data) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading disaster recovery…"}</div>;

  const noTopology = !data.activeRegion;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Disaster Recovery</h1>
          <p className="text-sm text-text-muted">Multi-region failover, BCP drills, and emergency mode. Status reflects real probe/drill results — no synthetic topology or fabricated drill history.</p>
        </div>
        <Button variant="ghost" onClick={load} loading={busy}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {noTopology && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">No topology configured</div>
            <div className="text-text-muted">The dashboard's <code>activeRegion</code> is null and every component is unverified. Trigger a failover or schedule a drill to configure the topology.</div>
          </div>
        </div>
      )}

      {data.emergencyModeActive && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">Emergency mode is ACTIVE</div>
            <div className="text-text-muted">The platform is running in offline-only mode. Restore only when the primary region is verified.</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardDescription>Active Region</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{data.activeRegion ?? "—"}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Components</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{status.length}</div><div className="text-xs text-text-muted">{status.filter(s=>s.healthy).length} verified healthy</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Failovers (30d)</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{data.failovers30d}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Replication lag (max)</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{data.replicationLagMs === null || data.replicationLagMs === undefined ? "—" : `${data.replicationLagMs} ms`}</div><div className="text-xs text-text-muted">{data.replicationLagMs === null ? "no probe has reported" : "highest across components"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
          <CardDescription>Each component starts unverified and only becomes healthy after a passing drill.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {status.length === 0 ? (
            <div className="text-sm text-text-muted">No components registered.</div>
          ) : status.map(s => (
            <div key={s.component} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <div className="font-semibold text-text-bright">{s.component}</div>
                <div className="text-xs text-text-muted">active: {s.activeRegion} · standbys: {s.standbyRegions.join(", ") || "—"}</div>
              </div>
              <div className="text-right">
                <StatusBadge healthy={s.healthy} />
                <div className="text-xs text-text-muted mt-1">last test: {fmtDate(s.lastTestAt)}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle><Activity className="h-4 w-4 inline mr-1"/>Drills</CardTitle>
            <CardDescription>Schedule, run, and record results for a BCP drill. Components become healthy only on a passed result.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {drills.length === 0 ? (
              <div className="text-sm text-text-muted">No drills scheduled or recorded.</div>
            ) : drills.map(d => (
              <div key={d.id} className="flex items-center justify-between border-b border-border/40 pb-2">
                <div>
                  <div className="font-semibold text-text-bright">{d.component}</div>
                  <div className="text-xs text-text-muted">scheduled: {fmtDate(d.scheduledAt)}</div>
                  <div className="text-xs text-text-muted">status: {d.status}{d.results ? ` · RTO ${d.results.rtoAchievedMs}ms / RPO ${d.results.rpoAchievedMs}ms` : ""}</div>
                </div>
                {d.status === "scheduled" && isAdmin && <Button size="sm" onClick={() => runDrill(d.id)}>Start</Button>}
              </div>
            ))}
            {isAdmin && (
              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-text-muted">Schedule a new drill</div>
                <div className="flex gap-2">
                  <select className="rounded bg-bg-deep border border-border px-2 py-1 text-sm" value={drillComponent} onChange={e => setDrillComponent(e.target.value as DrComponent)}>
                    {DR_COMPONENTS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                  <Button onClick={scheduleDrill} size="sm"><Plus className="h-4 w-4 mr-1"/>Schedule</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failover events</CardTitle>
            <CardDescription>Newest first. Each event records from/to region, trigger reason, and the operator who started it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.length === 0 ? (
              <div className="text-sm text-text-muted">No failover events yet.</div>
            ) : events.map(e => (
              <div key={e.id} className="border-b border-border/40 pb-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-text-bright">{e.component}: {e.fromRegion} → {e.toRegion}</div>
                  <Badge variant={e.status === "completed" ? "emerald" : "amber"}>{e.status}</Badge>
                </div>
                <div className="text-xs text-text-muted">{fmtDate(e.startedAt)} · {e.reason}</div>
                {e.durationMs !== undefined && <div className="text-xs text-text-muted">duration: {e.durationMs}ms</div>}
              </div>
            ))}
            {isAdmin && (
              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-text-muted">Trigger a failover</div>
                <div className="flex gap-2 flex-wrap">
                  <select className="rounded bg-bg-deep border border-border px-2 py-1 text-sm" value={component} onChange={e => setComponent(e.target.value as DrComponent)}>
                    {DR_COMPONENTS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Input placeholder="to region (e.g. eu-west)" value={toRegion} onChange={e => setToRegion(e.target.value)} />
                </div>
                <Input placeholder="reason (required)" value={reason} onChange={e => setReason(e.target.value)} />
                <Button onClick={failover}>Trigger failover</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><ShieldAlert className="h-4 w-4 inline mr-1"/>Emergency mode</CardTitle>
          <CardDescription>Offline-only operation when the primary region is degraded or unreachable.</CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <div className="flex items-center gap-3">
              <Button onClick={toggleEmergency} variant={emergency ? "primary" : "ghost"}>
                {emergency ? "Restore from emergency" : "Enable emergency mode"}
              </Button>
              <div className="text-xs text-text-muted">{emergency ? "Platform is offline-only." : "Platform is online."}</div>
            </div>
          ) : (
            <div className="text-sm text-text-muted">Admins can toggle emergency mode. Currently {emergency ? "ACTIVE" : "inactive"}.</div>
          )}
        </CardContent>
      </Card>

      <ProvenanceNote p={data.provenance} />

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}
    </div>
  );
}

export default DisasterRecoveryPage;
