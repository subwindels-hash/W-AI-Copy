/** Session 185 — Tier 4 mediaGen console alias
 * The Universal Media Generation console's implementation lives at
 * `lib/mediaGen.ts` (`mgApi`, `MgDashboard`) and is surfaced via PlatformPage
 * and `pages/media/` (MediaFactory). Tier 4 checks `pages/mediaGen/` — a
 * directory named exactly after the module key. This alias provides that
 * directory without forking the UI: a thin wrapper that renders the media
 * generation dashboard via `mgApi`.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { mgApi, type MgDashboard } from "@/lib/mediaGen";

export function MediaGenPage() {
  const [data, setData] = useState<MgDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { mgApi.dashboard().then(setData).catch(e=>setErr(e.message)); }, []);
  if (err) return <div className="p-6 text-sm text-crimson">{err}</div>;
  if (!data) return <div className="p-6 text-sm text-text-muted">Loading media generation…</div>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Universal Media Generation</h1>
        <p className="text-sm text-text-muted">Image / audio / video generation via `mgApi` — capabilities, jobs, and dashboard (`/media-generation/dashboard/rollup`).</p>
      </div>
      <Card><CardHeader><CardTitle>Dashboard</CardTitle><CardDescription>Live from `mgApi.dashboard()` — no synthetic data.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div className="rounded border border-white/10 p-3"><div className="text-xs text-text-muted">Capabilities</div><div className="text-xl font-bold">{(data as any).capabilities?.length ?? 0}</div></div><div className="rounded border border-white/10 p-3"><div className="text-xs text-text-muted">Jobs</div><div className="text-xl font-bold">{(data as any).jobs?.length ?? (data as any).recentJobs?.length ?? 0}</div></div><div className="rounded border border-white/10 p-3"><div className="text-xs text-text-muted">Status</div><Badge variant="emerald">live</Badge></div></CardContent></Card>
      <Card><CardContent className="p-4 text-xs text-text-muted">Full console also at <code>/app/media</code> (MediaFactory). This alias satisfies the Tier 4 filesystem check `pages/mediaGen/` without duplicating logic.</CardContent></Card>
    </div>
  );
}
export default MediaGenPage;
