/** Session 190 — Tier 4 marketplace dedicated console
 * The Marketplace (`lib/marketplace.ts`, `marketplaceApi`, `/marketplace/*`,
 * Session 34, `marketplace:*` org_scoped) had no dedicated `/app/marketplace`
 * page — its console was only via PlatformPage tab. This page provides a
 * dedicated console for skills, twins, and simulation.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { marketplaceApi, type MarketplaceDashboard } from "@/lib/marketplace";

export function MarketplacePage() {
  const [data, setData] = useState<MarketplaceDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    try { setData(await marketplaceApi.dashboard()); setErr(null); } catch (e:any) { setErr(e.message); }
  };
  useEffect(() => { void load(); }, []);
  if (!data) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading marketplace…"}</div>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Marketplace</h1>
        <p className="text-sm text-text-muted">Enterprise Marketplace, Digital Twin & Simulation — skills, twins, scenarios, installs. Org-scoped via `marketplace:*`.</p>
      </div>
      {err && <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Skills</div><div className="text-xl font-bold">{(data as any).counts?.skills ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Installs</div><div className="text-xl font-bold">{(data as any).counts?.installs ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Twins</div><div className="text-xl font-bold">{(data as any).counts?.twins ?? 0}</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Live from `marketplaceApi.dashboard()` — no synthetic data.</CardDescription></CardHeader><CardContent className="flex gap-2"><Button variant="outline" onClick={load}>Refresh</Button><Badge variant="emerald">live</Badge></CardContent></Card>
    </div>
  );
}
export default MarketplacePage;
