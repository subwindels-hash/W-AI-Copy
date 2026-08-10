/**
 * Admin API Control Center (Super Admin).
 *
 * Platform-wide control over the Developer / API Platform: enable/disable API
 * products, adjust pricing & rate limits, approve/suspend developer
 * applications, and view aggregated usage across all organizations.
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Package, Users, Activity, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react";
import { adminApiControl, type AdminAppRow, type AdminUsageSummary } from "@/lib/adminApiControl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import type { ApiProductRow } from "@windels/shared/developerPlatform";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </CardContent></Card>
  );
}

export function AdminApiControlPage() {
  const [products, setProducts] = useState<Array<ApiProductRow & { organizationSlug: string | null }>>([]);
  const [apps, setApps] = useState<AdminAppRow[]>([]);
  const [usage, setUsage] = useState<AdminUsageSummary | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pricing edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, u] = await Promise.all([
        adminApiControl.products(),
        adminApiControl.apps(),
        adminApiControl.usage(days),
      ]);
      setProducts(p); setApps(a); setUsage(u); setError(null);
    } catch (e: any) { setError(e?.message ?? "Failed to load API platform."); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  async function toggleProduct(p: ApiProductRow, enabled: boolean) {
    try { await adminApiControl.setProductEnabled(p.id, enabled); toast.success(`${p.name} ${enabled ? "enabled" : "disabled"}.`); await load(); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function saveProduct(p: ApiProductRow) {
    try {
      await adminApiControl.updateProduct(p.id, {
        rateLimitPerMin: editRate ? Number(editRate) : undefined,
        basePriceUsd: editPrice ? Number(editPrice) : undefined,
      });
      toast.success(`${p.name} updated.`); setEditId(null); await load();
    } catch (e: any) { toast.error(e?.message); }
  }
  async function toggleAppApprove(a: AdminAppRow, approved: boolean) {
    try { await adminApiControl.setAppApproved(a.id, approved); toast.success(`"${a.name}" ${approved ? "approved" : "unapproved"} for production.`); await load(); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function toggleAppActive(a: AdminAppRow, active: boolean) {
    try { await adminApiControl.setAppActive(a.id, active); toast.success(`"${a.name}" ${active ? "activated" : "suspended"}.`); await load(); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-azure" />
            <h1 className="text-2xl font-black text-text-bright">API Platform Control Center</h1>
            <Badge variant="azure">Super Admin</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">Manage the WINDELS AI OS developer ecosystem — products, applications and platform-wide usage.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-32">
            <option value="1">Last 24h</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}</div> : null}

      {usage && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Platform requests" value={usage.totalRequests.toLocaleString()} hint={`${usage.windowDays}d`} />
          <Stat label="Error rate" value={usage.errorRatePct === null ? "—" : `${usage.errorRatePct}%`} hint={`${usage.successfulRequests} ok · ${usage.failedRequests} failed`} />
          <Stat label="Avg latency" value={usage.avgDurationMs === null ? "—" : `${usage.avgDurationMs}ms`} />
          <Stat label="Est. cost" value={`$${usage.estimatedCostUsd.toFixed(4)}`} hint={`${usage.totalTokensIn.toLocaleString()} in · ${usage.totalTokensOut.toLocaleString()} out`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Products */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" />API products</CardTitle><CardDescription>Enable/disable and configure marketplace products platform-wide.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {products.length === 0 && <p className="text-sm text-text-muted">No products.</p>}
            {products.map((p) => (
              <div key={p.id} className="rounded-lg border border-white/10 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-text-bright">{p.name}</span>
                    <span className="ml-2 text-[11px] text-text-muted">{p.slug} · {p.category} · ${p.basePriceUsd}/1k · {p.rateLimitPerMin}/min</span>
                  </div>
                  <button onClick={() => void toggleProduct(p, !p.enabled)} aria-label={`Toggle ${p.name}`}
                    className={p.enabled ? "text-emerald" : "text-text-muted"}>
                    {p.enabled ? <ToggleRight className="h-5 w-5"/> : <ToggleLeft className="h-5 w-5"/>}
                  </button>
                </div>
                {editId === p.id ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input placeholder="rate/min" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="w-32 h-8 text-xs" />
                    <Input placeholder="$/1k" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-32 h-8 text-xs" />
                    <Button size="sm" onClick={() => void saveProduct(p)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <button onClick={() => { setEditId(p.id); setEditRate(String(p.rateLimitPerMin)); setEditPrice(String(p.basePriceUsd)); }}
                    className="text-[11px] text-azure hover:underline">edit pricing / rate limit</button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Applications */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Developer applications</CardTitle><CardDescription>Approve production access or suspend applications across the platform.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {apps.length === 0 && <p className="text-sm text-text-muted">No developer applications yet.</p>}
            {apps.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-text-bright">{a.name}</span>
                    <div className="text-[11px] text-text-muted">
                      {a.organizationName} · {a.environment} · {a.apiKeyCount} key(s) · {a.ownerName ?? "unknown"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.active ? "success" : "danger"}>{a.active ? "active" : "suspended"}</Badge>
                    <Badge variant={a.productionApproved ? "azure" : "slate"}>{a.productionApproved ? "prod approved" : "not approved"}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void toggleAppApprove(a, !a.productionApproved)}>
                    {a.productionApproved ? "Unapprove" : "Approve prod"}
                  </Button>
                  <Button size="sm" variant={a.active ? "danger" : "secondary"} onClick={() => void toggleAppActive(a, !a.active)}>
                    {a.active ? "Suspend" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Usage by org/channel */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Usage by organization</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!usage || usage.byOrg.length === 0 ? <p className="text-sm text-text-muted">No usage yet.</p> :
              usage.byOrg.map((o) => (
                <div key={o.organizationId} className="flex items-center justify-between text-sm">
                  <span className="text-text-main">{o.organizationName ?? o.organizationId}</span>
                  <span className="text-text-muted">{o.count}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Usage by channel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!usage || usage.byChannel.length === 0 ? <p className="text-sm text-text-muted">No usage yet.</p> :
              usage.byChannel.map((c) => (
                <div key={c.channel} className="flex items-center justify-between text-sm">
                  <span className="text-text-main">{c.channel}</span>
                  <span className="text-text-muted">{c.count}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdminApiControlPage;
