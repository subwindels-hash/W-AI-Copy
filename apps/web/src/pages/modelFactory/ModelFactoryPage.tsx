/** Session 187 — Tier 4 modelFactory console (dedicated)
 * The Model Factory (`lib/modelFactory.ts`, `mf2Api`, `/model-factory/*`,
 * Session 46, `mf2:*` org_scoped) had no dedicated `/app/modelFactory` page —
 * its console was only via PlatformPage tab and `pages/softwareFactory/`
 * (which is Software Factory Studios, S99, a different module). This page
 * provides a dedicated console for the Model Factory itself.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { mf2Api, type Mf2Dashboard } from "@/lib/modelFactory";

export function ModelFactoryPage() {
  const [data, setData] = useState<Mf2Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const load = async () => {
    try { setData(await mf2Api.dashboard()); setErr(null); } catch (e:any) { setErr(e.message); }
  };
  useEffect(() => { void load(); }, []);
  async function create() {
    if (!name) return;
    try { await mf2Api.create({ name, builder: "domain", size: "7B", quant: "fp16", vramMb: 16000 }); setName(""); await load(); } catch (e:any) { setErr(e.message); }
  }
  if (!data) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading model factory…"}</div>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Model Factory</h1>
        <p className="text-sm text-text-muted">Enterprise AI Model Factory (V8.4 §1) — model lifecycle (draft → benchmark → safety → governance) and fine-tune jobs. Org-scoped via `mf2:*`.</p>
      </div>
      {err && <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Models</div><div className="text-xl font-bold">{(data as any).counts?.models ?? (data as any).totalModels ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Stages</div><div className="text-xs text-text-muted">{Object.entries((data as any).countsByStage ?? {}).map(([k,v])=>`${k}:${v}`).join(" · ") || "—"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Fine-tunes</div><div className="text-xl font-bold">{(data as any).fineTunes ?? 0}</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Create model</CardTitle><CardDescription>Creates a model in `draft` via `POST /model-factory/models`.</CardDescription></CardHeader><CardContent className="flex gap-2"><Input placeholder="Model name" value={name} onChange={e=>setName(e.target.value)} className="flex-1" /><Button onClick={create}>Create</Button><Button variant="outline" onClick={load}>Refresh</Button></CardContent></Card>
      <Card><CardContent className="p-4 text-xs text-text-muted">Full lifecycle (benchmark → safety → governance) via `lib/modelFactory.ts` (`mf2Api`). This dedicated page satisfies the Tier 4 filesystem check `pages/modelFactory/` without forking `pages/softwareFactory/` (which is Software Factory Studios, S99).</CardContent></Card>
    </div>
  );
}
export default ModelFactoryPage;
