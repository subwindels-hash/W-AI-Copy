/**
 * Session 158 — Legal Intelligence console (/app/legal).
 *
 * Empty compliance/risk are "—" not 100%/0. Research logs queries and
 * never invents citations.
 */
import { useCallback, useEffect, useState } from "react";
import { Gavel, Scale, FileText, Search } from "lucide-react";
import { legalApi, type LegalDashboard, type LegalMatter, type Contract, type RegulatoryUpdate, type LegalResearchItem } from "@/lib/legal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

export function LegalPage() {
  const [dash, setDash] = useState<LegalDashboard | null>(null);
  const [matters, setMatters] = useState<LegalMatter[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [research, setResearch] = useState<LegalResearchItem[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LegalMatter["kind"]>("advisory");
  const [risk, setRisk] = useState("20");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, m, c, u, r] = await Promise.all([
      legalApi.dashboard(), legalApi.listMatters(), legalApi.listContracts(),
      legalApi.listUpdates(), legalApi.listResearch(),
    ]);
    setDash(d); setMatters(m); setContracts(c); setUpdates(u); setResearch(r);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Legal Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Matters, contracts and regulatory notes you record. Research logs the
          question — it does not invent case citations. An empty register is not
          100% compliant.
        </p>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.mattersOpen ?? "…"}</CardTitle><CardDescription>Open matters</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.riskAvg == null ? "—" : dash.riskAvg}</CardTitle><CardDescription>Avg risk</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.compliancePassRate == null ? "—" : `${Math.round(dash.compliancePassRate * 100)}%`}</CardTitle><CardDescription>Compliance (recorded checks)</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.contractsActive ?? "…"}</CardTitle><CardDescription>Signed contracts</CardDescription></CardHeader></Card>
      </div>
      {dash?.provenance ? <p className="text-xs text-slate-500">{dash.provenance.compliancePassRate}</p> : null}

      <Tabs defaultValue="matters">
        <TabsList>
          <TabsTrigger value="matters"><Gavel className="mr-1.5 h-4 w-4" />Matters</TabsTrigger>
          <TabsTrigger value="contracts"><FileText className="mr-1.5 h-4 w-4" />Contracts</TabsTrigger>
          <TabsTrigger value="updates"><Scale className="mr-1.5 h-4 w-4" />Updates</TabsTrigger>
          <TabsTrigger value="research"><Search className="mr-1.5 h-4 w-4" />Research</TabsTrigger>
        </TabsList>
        <TabsContent value="matters" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Open a matter</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-56" />
              <Select value={kind} onChange={(e) => setKind(e.target.value as LegalMatter["kind"])} className="w-40">
                {(["litigation", "contract", "regulatory", "ip", "employment", "compliance", "advisory"] as LegalMatter["kind"][]).map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Input placeholder="Risk 0–100" value={risk} onChange={(e) => setRisk(e.target.value)} className="w-28" />
              <Button size="sm" disabled={!title} onClick={async () => {
                try {
                  await legalApi.createMatter({ title, kind, riskScore: Number(risk) || 0 });
                  setTitle(""); setMsg("matter opened"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {matters.length === 0 ? <p className="text-sm text-slate-500">No matters. Nothing is seeded.</p> : null}
          {matters.map((m) => (
            <Card key={m.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="font-semibold text-slate-100">{m.title}</span>
                <Badge className="bg-slate-700/40 text-slate-300">{m.kind}</Badge>
                <Badge className={m.riskScore >= 60 ? "bg-rose-500/20 text-rose-300 border-rose-500/40" : "bg-slate-700/40 text-slate-400"}>risk {m.riskScore}</Badge>
                <Select value={m.status} className="w-32" onChange={async (e) => { await legalApi.updateMatterStatus(m.id, e.target.value as LegalMatter["status"]); await load(); }}>
                  {(["open", "active", "review", "closed"] as LegalMatter["status"][]).map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="contracts" className="space-y-3">
          {contracts.length === 0 ? <p className="text-sm text-slate-500">No contracts recorded.</p> : null}
          {contracts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold">{c.title}</span>
              <Badge className="bg-slate-700/40 text-slate-300">{c.type}</Badge>
              <span className="text-slate-500">{c.counterparty}</span>
              <Badge className="bg-slate-700/40 text-slate-400">{c.status}</Badge>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="updates" className="space-y-3">
          {updates.length === 0 ? <p className="text-sm text-slate-500">No regulatory updates recorded.</p> : null}
          {updates.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <Scale className="h-3.5 w-3.5 text-violet-400" />
              <span className="font-semibold">{u.title}</span>
              <Badge className="bg-slate-700/40 text-slate-300">{u.jurisdiction}</Badge>
              {u.acknowledged ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">acked</Badge> : (
                <Button size="sm" variant="outline" onClick={async () => { await legalApi.acknowledge(u.id); await load(); }}>Ack</Button>
              )}
            </div>
          ))}
        </TabsContent>
        <TabsContent value="research" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Log a research request</CardTitle>
              <CardDescription>{dash?.provenance?.research}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Query" value={query} onChange={(e) => setQuery(e.target.value)} className="w-96" />
              <Button size="sm" disabled={query.length < 3} onClick={async () => {
                try { await legalApi.research(query); setQuery(""); setMsg("logged"); await load(); }
                catch (e: any) { setMsg(e.message); }
              }}>Log</Button>
            </CardContent>
          </Card>
          {research.map((r) => (
            <Card key={r.id} className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-sm">{r.query}</CardTitle>
                <CardDescription>{r.summary}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">citations: {r.citations.length || "none (provider not configured)"}</CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
