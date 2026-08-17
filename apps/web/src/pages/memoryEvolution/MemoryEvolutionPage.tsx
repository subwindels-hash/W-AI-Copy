/** Session 188 — Tier 4 memoryEvolution dedicated console
 * The Memory Evolution Engine (`lib/memoryEvolution.ts`, `meApi`, `/memory-evolution/*`,
 * Session 47, `me:*` global) had no dedicated `/app/memoryEvolution` page —
 * its console was only a PlatformPage tab. This page provides a dedicated
 * console for the 9 memory types, consolidation, and cross-agent sharing.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { meApi, type MeDashboard, type MeMemory } from "@/lib/memoryEvolution";

export function MemoryEvolutionPage() {
  const [data, setData] = useState<MeDashboard | null>(null);
  const [mems, setMems] = useState<MeMemory[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [type, setType] = useState<MeMemory["type"]>("knowledge");
  const load = async () => {
    try { const [d, m] = await Promise.all([meApi.dashboard(), meApi.recall({ limit: 20 })]); setData(d); setMems(m); setErr(null); } catch (e:any) { setErr(e.message); }
  };
  useEffect(() => { void load(); }, []);
  async function add() {
    if (!content.trim()) return;
    try { await meApi.add({ type, content, scope: "enterprise:windels" }); setContent(""); await load(); } catch (e:any) { setErr(e.message); }
  }
  if (!data) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading memory evolution…"}</div>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Memory Evolution Engine</h1>
        <p className="text-sm text-text-muted">9 memory types (episodic/semantic/procedural/organizational/department/project/user/team/knowledge) — consolidation, aging, deduplication, cross-agent sharing. Extends S37 Fabric.</p>
      </div>
      {err && <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Total memories</div><div className="text-xl font-bold">{data.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Avg confidence</div><div className="text-xl font-bold">{data.avgConfidence}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Consolidations 24h</div><div className="text-xl font-bold">{data.consolidationJobs24h}</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Add memory</CardTitle><CardDescription>Stored via `POST /memory-evolution/memories` — deduped by content hash in same scope.</CardDescription></CardHeader><CardContent className="flex gap-2"><select value={type} onChange={e=>setType(e.target.value as any)} className="rounded border border-white/10 bg-bg-deep px-3 py-2 text-sm"><option value="knowledge">knowledge</option><option value="episodic">episodic</option><option value="semantic">semantic</option><option value="procedural">procedural</option><option value="organizational">organizational</option><option value="department">department</option><option value="project">project</option><option value="user">user</option><option value="team">team</option></select><Textarea rows={2} placeholder="Memory content" value={content} onChange={e=>setContent(e.target.value)} className="flex-1" /><Button onClick={add}>Store</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Recent memories</CardTitle></CardHeader><CardContent className="space-y-2">{mems.map(m=> <div key={m.id} className="rounded border border-white/10 p-3"><div className="flex gap-2"><Badge variant="emerald">{m.type}</Badge><span className="flex-1 text-sm">{m.content}</span><Badge variant="slate">{m.scope}</Badge></div><div className="text-xs text-text-muted">c {(m.confidence*100).toFixed(0)}% · {m.tags.join(", ")}</div></div>)} {mems.length===0 && <p className="py-8 text-center text-sm text-text-muted">No memories — add one above.</p>}</CardContent></Card>
    </div>
  );
}
export default MemoryEvolutionPage;
