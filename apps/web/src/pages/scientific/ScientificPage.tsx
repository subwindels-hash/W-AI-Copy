/**
 * Session 160 — Scientific Research console (/app/scientific).
 *
 * Empty knowledge-graph / collaborator / 30-day simulation cards are "—"
 * not 0. This register is not a live Crossref, PubMed or arXiv index.
 */
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, BookOpen, Lightbulb } from "lucide-react";
import {
  sciApi, RESEARCH_DOMAINS,
  type ScientificDashboard, type Experiment, type LiteratureRef,
  type Hypothesis, type ResearchDomain,
} from "@/lib/scientific";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const STATUSES: Experiment["status"][] = ["planned", "running", "completed", "failed"];

export function ScientificPage() {
  const [dash, setDash] = useState<ScientificDashboard | null>(null);
  const [exps, setExps] = useState<Experiment[]>([]);
  const [papers, setPapers] = useState<LiteratureRef[]>([]);
  const [hyps, setHyps] = useState<Hypothesis[]>([]);
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [domain, setDomain] = useState<ResearchDomain>("biology");
  const [papTitle, setPapTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("2026");
  const [venue, setVenue] = useState("");
  const [papDomain, setPapDomain] = useState<ResearchDomain>("computer_science");
  const [statement, setStatement] = useState("");
  const [hypDomain, setHypDomain] = useState<ResearchDomain>("physics");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, e, p, h] = await Promise.all([
      sciApi.dashboard(), sciApi.listExperiments(), sciApi.papers(), sciApi.listHypotheses(),
    ]);
    setDash(d); setExps(e); setPapers(p); setHyps(h);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Scientific Research</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Experiments, literature and hypotheses you record. There is no live
          Crossref, PubMed or arXiv index and no knowledge graph. Empty
          collaborator, citation and simulation figures stay unmeasured.
        </p>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.papersIndexed ?? "…"}</CardTitle><CardDescription>Literature records</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.experimentsActive ?? "…"}</CardTitle><CardDescription>Active experiments</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.knowledgeGraphNodes == null ? "—" : dash.knowledgeGraphNodes}</CardTitle><CardDescription>KG nodes</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.collaborators == null ? "—" : dash.collaborators}</CardTitle><CardDescription>Collaborators</CardDescription></CardHeader></Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.simulationsRun30d == null ? "—" : dash.simulationsRun30d}</CardTitle><CardDescription>Simulations (30d)</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.citationsTracked == null ? "—" : dash.citationsTracked}</CardTitle><CardDescription>Citations recorded</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.publicationsInProgress ?? "…"}</CardTitle><CardDescription>Publications in progress</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.hypothesesActive ?? "…"}</CardTitle><CardDescription>Active hypotheses</CardDescription></CardHeader></Card>
      </div>
      {dash?.provenance ? <p className="text-xs text-slate-500">{dash.provenance.knowledgeGraph}</p> : null}

      <Tabs defaultValue="experiments">
        <TabsList>
          <TabsTrigger value="experiments"><FlaskConical className="mr-1.5 h-4 w-4" />Experiments</TabsTrigger>
          <TabsTrigger value="literature"><BookOpen className="mr-1.5 h-4 w-4" />Literature</TabsTrigger>
          <TabsTrigger value="hypotheses"><Lightbulb className="mr-1.5 h-4 w-4" />Hypotheses</TabsTrigger>
        </TabsList>
        <TabsContent value="experiments" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Plan an experiment</CardTitle>
              <CardDescription>Starts planned, 0% progress, 0 simulations.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-56" />
              <Input placeholder="Hypothesis" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} className="w-72" />
              <Select value={domain} onChange={(e) => setDomain(e.target.value as ResearchDomain)} className="w-48">
                {RESEARCH_DOMAINS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </Select>
              <Button size="sm" disabled={!title || hypothesis.length < 2} onClick={async () => {
                try {
                  await sciApi.createExperiment({ title, hypothesis, domain });
                  setTitle(""); setHypothesis(""); setMsg("experiment planned"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {exps.length === 0 ? <p className="text-sm text-slate-500">No experiments. Nothing is seeded.</p> : null}
          {exps.map((e) => (
            <Card key={e.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <FlaskConical className="h-3.5 w-3.5 text-teal-400" />
                <span className="font-semibold text-slate-100">{e.title}</span>
                <Badge className="bg-slate-700/40 text-slate-300">{e.domain.replace(/_/g, " ")}</Badge>
                <Badge className="bg-slate-700/40 text-slate-400">{e.status}</Badge>
                <span className="text-slate-500">{e.progressPct}%</span>
                <span className="text-slate-500">{e.simulations} sims</span>
                <Select value={e.status} onChange={async (ev) => {
                  try {
                    await sciApi.updateExperimentStatus(e.id, ev.target.value as Experiment["status"]);
                    setMsg("status updated"); await load();
                  } catch (err: any) { setMsg(err.message); }
                }} className="w-36">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="literature" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Record a paper</CardTitle>
              <CardDescription>{dash?.provenance?.papersIndexed}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Title" value={papTitle} onChange={(e) => setPapTitle(e.target.value)} className="w-56" />
              <Input placeholder="Authors (comma separated)" value={authors} onChange={(e) => setAuthors(e.target.value)} className="w-56" />
              <Input placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} className="w-24" />
              <Input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} className="w-40" />
              <Select value={papDomain} onChange={(e) => setPapDomain(e.target.value as ResearchDomain)} className="w-48">
                {RESEARCH_DOMAINS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </Select>
              <Button size="sm" disabled={!papTitle || !authors || !venue} onClick={async () => {
                try {
                  await sciApi.createPaper({
                    title: papTitle,
                    authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
                    year: Number(year) || 2026,
                    venue,
                    domain: papDomain,
                  });
                  setPapTitle(""); setAuthors(""); setVenue(""); setMsg("paper recorded"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {papers.length === 0 ? <p className="text-sm text-slate-500">No literature records. Citations stay unrecorded.</p> : null}
          {papers.map((p) => (
            <Card key={p.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <BookOpen className="h-3.5 w-3.5 text-sky-400" />
                <span className="font-semibold text-slate-100">{p.title}</span>
                <Badge className="bg-slate-700/40 text-slate-400">{p.year}</Badge>
                <span className="text-slate-500">{p.authors.join(", ")}</span>
                <span className="italic text-slate-500">{p.venue}</span>
                <span className="text-slate-500">{p.citations == null ? "citations unrecorded" : `${p.citations} citations`}</span>
                <span className="text-slate-500">{p.relevanceScore == null ? "unranked" : `rel ${p.relevanceScore}`}</span>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="hypotheses" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Propose a hypothesis</CardTitle>
              <CardDescription>{dash?.provenance?.publications}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Statement" value={statement} onChange={(e) => setStatement(e.target.value)} className="w-96" />
              <Select value={hypDomain} onChange={(e) => setHypDomain(e.target.value as ResearchDomain)} className="w-48">
                {RESEARCH_DOMAINS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </Select>
              <Button size="sm" disabled={statement.length < 2} onClick={async () => {
                try {
                  await sciApi.createHypothesis({ statement, domain: hypDomain });
                  setStatement(""); setMsg("hypothesis proposed"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {hyps.length === 0 ? <p className="text-sm text-slate-500">No hypotheses. Confidence stays unassessed.</p> : null}
          {hyps.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <Lightbulb className="h-3.5 w-3.5 text-violet-400" />
              <span className="font-semibold">{h.statement}</span>
              <Badge className="bg-slate-700/40 text-slate-300">{h.domain.replace(/_/g, " ")}</Badge>
              <Badge className="bg-slate-700/40 text-slate-400">{h.status}</Badge>
              <span className="text-slate-500">{h.confidence == null ? "unassessed" : `${Math.round(h.confidence * 100)}% conf`}</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
