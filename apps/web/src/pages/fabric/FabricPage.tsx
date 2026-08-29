/**
 * WINDELS AI OS — Intelligence Fabric console.
 *
 * Trust center, innovation lab sandboxes, digital twins, package manager and
 * the kernel event bus. Health/accuracy figures are observed, not invented.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Boxes, Cpu, Package, X } from "lucide-react";
import type { FabricDashboard, Sandbox, FabricTwin, InstalledPackage, TrustCenterReport, DataSource } from "@windels/shared";
import { fabricApi } from "@/lib/fabric";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function trustTone(l: string): any {
  return l === "trusted" ? "emerald" : l === "watch" ? "amber" : l === "blocked" ? "crimson" : "slate";
}

export function FabricPage() {
  const [dash, setDash] = useState<FabricDashboard | null>(null);
  const [trust, setTrust] = useState<TrustCenterReport | null>(null);
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [twins, setTwins] = useState<FabricTwin[]>([]);
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, t, s, tw, p] = await Promise.all([
        fabricApi.dashboard(), fabricApi.trust(), fabricApi.listSandboxes(), fabricApi.listTwins(), fabricApi.listPackages(),
      ]);
      setDash(d); setTrust(t); setSandboxes(s); setTwins(tw); setPackages(p);
      setSources(d.sources ?? []);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading fabric…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Cpu className="h-6 w-6 text-azure" /> Intelligence Fabric</h1>
          <p className="text-sm text-text-muted">Trust center, sandboxes, digital twins, packages &amp; the event bus.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <Tabs defaultValue="trust">
        <TabsList>
          <TabsTrigger value="trust">Trust</TabsTrigger>
          <TabsTrigger value="sandboxes">Sandboxes ({sandboxes.length})</TabsTrigger>
          <TabsTrigger value="twins">Twins ({twins.length})</TabsTrigger>
          <TabsTrigger value="packages">Packages ({packages.length})</TabsTrigger>
          <TabsTrigger value="sources">Data fabric ({sources.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="trust">
          {trust && (
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <ShieldCheck className={`h-10 w-10 ${trust.level === "trusted" ? "text-emerald-400" : "text-amber-400"}`} />
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-semibold">{trust.overallScore}</span>
                    <Badge variant={trustTone(trust.level)}>{trust.level}</Badge>
                  </div>
                  <div className="text-xs text-text-muted mt-1">evaluated {fmtDate(trust.lastEvaluatedAt)}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sandboxes">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {sandboxes.length === 0 ? (
                <div className="text-sm text-text-muted">No sandboxes yet.</div>
              ) : sandboxes.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Boxes className="h-4 w-4 text-azure shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{s.name} <span className="text-text-muted">· {s.experiment}</span></div>
                      <div className="text-xs text-text-muted">{s.resources.cpu} cpu · {s.resources.memGb}GB · {s.resources.gpu} gpu</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.promotedToProduction && <Badge variant="emerald">prod</Badge>}
                    <Badge variant={s.status === "running" ? "emerald" : s.status === "paused" ? "amber" : "slate"}>{s.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="twins">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {twins.length === 0 ? (
                <div className="text-sm text-text-muted">No digital twins yet.</div>
              ) : twins.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t.name} <Badge variant="outline">{t.kind}</Badge></div>
                    <div className="text-xs text-text-muted mt-0.5">{t.simulationRuns} simulations · accuracy {Math.round(t.predictionAccuracyPct)}%</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-semibold ${t.healthPct > 80 ? "text-emerald-400" : t.healthPct > 50 ? "text-amber-400" : "text-crimson"}`}>{t.healthPct}%</div>
                    <Badge variant={t.status === "live" ? "emerald" : t.status === "simulating" ? "azure" : "slate"}>{t.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {packages.length === 0 ? (
                <div className="text-sm text-text-muted">No packages installed.</div>
              ) : packages.map((p) => (
                <div key={p.id} className="flex items-center gap-2 border-b border-border/30 py-1.5 text-sm">
                  <Package className="h-4 w-4 text-azure shrink-0" />
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline">{p.kind}</Badge>
                  <span className="text-xs text-text-muted ml-auto">{p.version}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {sources.length === 0 ? (
                <div className="text-sm text-text-muted">No data sources connected.</div>
              ) : sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline">{s.kind}</Badge>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{s.name}</div>
                      <div className="text-xs text-text-muted">{s.latencyMs}ms · {s.rowsPerSec} rows/s · {fmtDate(s.connectedAt)}</div>
                    </div>
                  </div>
                  <Badge variant={s.status === "healthy" ? "emerald" : s.status === "offline" ? "crimson" : s.status === "degraded" ? "amber" : "slate"}>{s.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FabricPage;
