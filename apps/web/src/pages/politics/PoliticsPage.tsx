/**
 * Session 144 — Global Politics, Government & Political History Console
 * (/app/politics).
 *
 * Tabs:
 *   Ask        — the question engine (§26's examples work here).
 *   Countries  — country profiles, timelines (§18) and leader timelines (§19).
 *   Compare    — neutral country comparison (no ranking).
 *   Fact/Opinion — the §23 engine.
 *   Learn      — education mode with deterministic quizzes (§31).
 *   Updates    — the never-overwrite-history update engine (§28/§29).
 *
 * Honest UI rules: current records show their Last Verified timestamp and
 * current_as_of badge; comparisons carry the neutrality note; claims show
 * their fact-vs-opinion classification.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Landmark, Search, Scale, Scale as ScaleIcon, GraduationCap, Database,
  Send, ShieldCheck, AlertTriangle, FileQuestion, ScrollText, Users, Vote,
} from "lucide-react";
import type { PoliticsLevel, FactOpinionClassification } from "@windels/shared";
import {
  askPolitics,
  classifyPoliticalClaim,
  compareCountriesByIds,
  createPoliticsQuiz,
  getCountryTimeline,
  getLeaderTimeline,
  getPoliticsCatalogMeta,
  getPoliticsRecord,
  listPoliticsUpdates,
  reviewPoliticsUpdate,
  searchPolitics,
  submitPoliticsUpdate,
} from "@/lib/politics";
import type { LeaderTimelineEntry, PoliticsQuiz } from "@/lib/politics";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthStore } from "@/store/auth";

const LEVELS: PoliticsLevel[] = ["beginner", "intermediate", "advanced", "research"];

function VerificationBadge({ verification }: { verification: string }) {
  if (verification === "current_as_of") {
    return <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40">current — verify</Badge>;
  }
  return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">{verification.replace(/_/g, " ")}</Badge>;
}

export function PoliticsPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState("ask");
  const isSuperAdmin = user?.role === "super_admin";

  const [meta, setMeta] = useState<any>(null);

  // Ask
  const [question, setQuestion] = useState("Tell me the history of Nigeria.");
  const [level, setLevel] = useState<PoliticsLevel>("intermediate");
  const [answer, setAnswer] = useState<any>(null);
  const [asking, setAsking] = useState(false);

  // Countries
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [countryId, setCountryId] = useState("pol.country.nigeria");
  const [timeline, setTimeline] = useState<any>(null);
  const [leaders, setLeaders] = useState<LeaderTimelineEntry[]>([]);
  const [detail, setDetail] = useState<any>(null);

  // Compare
  const [compareIds, setCompareIds] = useState("pol.country.nigeria, pol.country.united-states");
  const [compare, setCompare] = useState<any>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Fact/Opinion
  const [claimText, setClaimText] = useState("Person X was the greatest president.");
  const [claim, setClaim] = useState<FactOpinionClassification | null>(null);

  // Learn
  const [quizTopic, setQuizTopic] = useState("pol.country.nigeria");
  const [quizLevel, setQuizLevel] = useState<PoliticsLevel>("intermediate");
  const [quiz, setQuiz] = useState<PoliticsQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);

  // Updates
  const [updates, setUpdates] = useState<any[]>([]);
  const [updEntity, setUpdEntity] = useState("pol.country.nigeria");
  const [updField, setUpdField] = useState("currentSituation");
  const [updTitle, setUpdTitle] = useState("");
  const [updSummary, setUpdSummary] = useState("");
  const [updNew, setUpdNew] = useState("");
  const [updEffective, setUpdEffective] = useState("");
  const [updSource, setUpdSource] = useState("");
  const [updMsg, setUpdMsg] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setMeta(await getPoliticsCatalogMeta().catch(() => null));
  }, []);

  const loadUpdates = useCallback(async () => {
    setUpdates(await listPoliticsUpdates().catch(() => []));
  }, []);

  useEffect(() => {
    void loadMeta();
    void loadUpdates();
  }, [loadMeta, loadUpdates]);

  const runAsk = useCallback(async () => {
    setAsking(true);
    try {
      setAnswer(await askPolitics({ question, level, limit: 6 }));
    } catch (e: any) {
      setAnswer({ question, mode: "teach", level, matches: [], note: String(e?.message ?? e) });
    } finally {
      setAsking(false);
    }
  }, [question, level]);

  const runSearch = useCallback(async (q: string) => {
    setResults((await searchPolitics({ q, level: "intermediate", limit: 20 }).catch(() => ({ results: [] }))).results);
  }, []);

  const loadTimeline = useCallback(async (cid: string) => {
    setCountryId(cid);
    const [t, l] = await Promise.all([
      getCountryTimeline(cid).catch(() => null),
      getLeaderTimeline(cid).catch(() => [] as LeaderTimelineEntry[]),
    ]);
    setTimeline(t);
    setLeaders(l);
  }, []);

  useEffect(() => {
    void loadTimeline(countryId);
  }, [loadTimeline, countryId]);

  const openDetail = useCallback(async (id: string) => {
    setDetail(await getPoliticsRecord(id).catch(() => null));
  }, []);

  const runCompare = useCallback(async () => {
    setCompareError(null);
    setCompare(null);
    const ids = compareIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
    if (ids.length < 2) {
      setCompareError("Enter at least two country ids.");
      return;
    }
    try {
      setCompare(await compareCountriesByIds(ids));
    } catch (e: any) {
      setCompareError(String(e?.message ?? e));
    }
  }, [compareIds]);

  const runClaim = useCallback(async () => {
    setClaim(await classifyPoliticalClaim(claimText).catch(() => null));
  }, [claimText]);

  const runQuiz = useCallback(async () => {
    setQuiz(await createPoliticsQuiz(quizTopic, quizLevel, 5).catch(() => null));
    setQuizAnswers({});
    setQuizScore(null);
  }, [quizTopic, quizLevel]);

  const answerQuiz = useCallback((qid: string, idx: number) => {
    setQuizAnswers((prev) => ({ ...prev, [qid]: idx }));
  }, []);

  const gradeQuiz = useCallback(() => {
    if (!quiz) return;
    let correct = 0;
    for (const q of quiz.questions) {
      if (quizAnswers[q.id] === q.correctIndex) correct += 1;
    }
    setQuizScore(correct);
  }, [quiz, quizAnswers]);

  const runSubmit = useCallback(async () => {
    setUpdMsg(null);
    if (!updTitle || !updSummary || !updNew || !updEffective || !updSource) {
      setUpdMsg("Title, summary, new value, effective date and a SOURCE are required (§22).");
      return;
    }
    try {
      const u = await submitPoliticsUpdate({
        kind: "leadership_change",
        entityId: updEntity,
        entityKind: "country",
        title: updTitle,
        changeSummary: updSummary,
        field: updField,
        newValue: updNew,
        effectiveDate: updEffective,
        sources: [{ label: updSource, type: "journalism" }],
        verification: "unverified",
      });
      setUpdMsg(`Update ${u.id} submitted as ${u.status}. Applying it requires the Super Admin and creates a change-log entry — history is never overwritten (§28/§29).`);
      setUpdTitle(""); setUpdSummary(""); setUpdNew(""); setUpdEffective(""); setUpdSource("");
      await loadUpdates();
    } catch (e: any) {
      setUpdMsg(String(e?.message ?? e));
    }
  }, [updEntity, updField, updTitle, updSummary, updNew, updEffective, updSource, loadUpdates]);

  const runReview = useCallback(async (id: string, status: "applied" | "rejected") => {
    try {
      await reviewPoliticsUpdate(id, status, status === "applied" ? "Applied via the knowledge update gate." : "Rejected after review.");
      await loadUpdates();
    } catch (e: any) {
      setUpdMsg(String(e?.message ?? e));
    }
  }, [loadUpdates]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6 text-azure" /> World Politics & Government
        </h1>
        <p className="text-text-muted text-sm mt-1">
          {meta?.recordCount ?? "—"} political records across {meta?.countryCount ?? "—"} country profiles — leaders, parties, elections, constitutions, ideologies, movements and international organizations. Catalog <code className="text-azure">{meta?.catalogVersion}</code>.
        </p>
        {meta && (
          <div className="flex gap-2 flex-wrap mt-2 text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-azure" /> {meta.neutralityNote}</span>
            <span className="inline-flex items-center gap-1"><ScrollText className="w-3 h-3 text-azure" /> {meta.currentInfoNote}</span>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ask"><Send className="w-3.5 h-3.5 inline mr-1" /> Ask</TabsTrigger>
          <TabsTrigger value="countries"><Search className="w-3.5 h-3.5 inline mr-1" /> Countries</TabsTrigger>
          <TabsTrigger value="compare"><Scale className="w-3.5 h-3.5 inline mr-1" /> Compare</TabsTrigger>
          <TabsTrigger value="claim"><ScaleIcon className="w-3.5 h-3.5 inline mr-1" /> Fact vs Opinion</TabsTrigger>
          <TabsTrigger value="learn"><GraduationCap className="w-3.5 h-3.5 inline mr-1" /> Learn</TabsTrigger>
          <TabsTrigger value="updates"><Database className="w-3.5 h-3.5 inline mr-1" /> Updates</TabsTrigger>
        </TabsList>

        {/* ── Ask ─────────────────────────────────────────────────────── */}
        <TabsContent value="ask">
          <Card>
            <CardHeader>
              <CardTitle>Ask about any country's politics</CardTitle>
              <CardDescription>
                "Tell me the history of Nigeria", "Who was Nigeria's first president?", "List all presidents of Nigeria", "Who are the current ministers?", "How does Nigeria's federal government work?", "Compare Nigeria's government with the United States" — and the same questions for countries worldwide.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about politics…" onKeyDown={(e) => e.key === "Enter" && runAsk()} />
                <Select value={level} onChange={(e) => setLevel(e.target.value as PoliticsLevel)} className="w-40 shrink-0">
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
                <Button onClick={runAsk} disabled={asking || !question.trim()} className="shrink-0">
                  <Send className="w-4 h-4 mr-1" /> {asking ? "Asking…" : "Ask"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Tell me the history of Nigeria.",
                  "Who was Nigeria's first president?",
                  "List all presidents of Nigeria",
                  "Who is the current president of Nigeria?",
                  "Explain every Nigerian presidential election",
                  "Who were the governors of Lagos State?",
                  "How does Nigeria's federal government work?",
                  "What happened during Nigeria's transition to democracy?",
                  "Compare Nigeria's government with the United States.",
                  "What does ECOWAS do?",
                  "What is social democracy?",
                  "Quiz me on Nigeria.",
                ].map((ex) => (
                  <button key={ex} onClick={() => setQuestion(ex)} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10 text-text-muted">
                    {ex}
                  </button>
                ))}
              </div>
              {answer && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center gap-2 flex-wrap">
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">intent: {answer.intent?.intent ?? "general"}</Badge>
                    <Badge>{answer.mode}</Badge>
                    <span className="text-xs text-text-muted">{answer.intent?.explanation}</span>
                  </div>
                  {answer.mode === "leader_list" && (
                    <div className="space-y-1">
                      <div className="text-sm text-text-muted">Heads of state &amp; government of <span className="text-azure">{answer.country?.name}</span>:</div>
                      {answer.leaders?.map((l: any, i: number) => (
                        <div key={l.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm flex items-center gap-2">
                          <span className="text-text-muted w-6 shrink-0">{i + 1}.</span>
                          <span className="font-medium text-text-bright">{l.name}</span>
                          <span className="text-text-muted text-xs">{l.title.split(";")[0]}</span>
                          <span className="text-text-muted text-xs ml-auto">{l.officeStart} – {l.officeEnd || "present"}</span>
                          {l.meta?.verification === "current_as_of" && <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40">current</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                  {answer.matches?.map((m: any) => (
                    <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-text-bright">{m.name}</span>
                        <Badge>{m.kind}</Badge>
                        <VerificationBadge verification={m.meta?.verification} />
                        {m.meta?.lastVerified && <span className="text-[11px] text-text-muted">Last verified {m.meta.lastVerified}</span>}
                      </div>
                      {m.sections?.map((s: any) => (
                        <div key={s.key} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                          <div className="text-[11px] uppercase tracking-wider text-azure/80 mb-1">{s.heading}</div>
                          <div className="text-sm text-text-main whitespace-pre-wrap">{s.body}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {answer.note && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                      <FileQuestion className="inline w-4 h-4 mr-1" /> {answer.note}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Countries ───────────────────────────────────────────────── */}
        <TabsContent value="countries">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Country profiles</CardTitle>
                <CardDescription>Search any political record, then open a country for its timeline and leaders.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search politics…" onKeyDown={(e) => e.key === "Enter" && runSearch(searchQ)} />
                  <Button onClick={() => runSearch(searchQ)} className="shrink-0"><Search className="w-4 h-4 mr-1" /></Button>
                </div>
                <Select value={countryId} onChange={(e) => loadTimeline(e.target.value)}>
                  {meta?.countryIds ? null : null}
                  {results.filter((r) => r.kind === "country").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  {results.filter((r) => r.kind === "country").length === 0 && <option value="pol.country.nigeria">Nigeria</option>}
                </Select>
                <div className="max-h-[380px] overflow-y-auto space-y-1">
                  {results.map((r) => (
                    <button key={r.id} onClick={() => openDetail(r.id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 text-sm flex justify-between gap-2">
                      <span className="text-text-main">{r.name}</span>
                      <span className="text-text-muted text-xs">{r.kind}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="lg:col-span-2 space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Political timeline — {timeline?.country?.name ?? countryId}</CardTitle>
                  <CardDescription>Periods from the beginning (§3) plus key events (§18).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[280px] overflow-y-auto">
                  {timeline?.periods?.map((p: any) => (
                    <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                      <div className="text-sm font-medium text-azure">{p.dateLabel}</div>
                      <div className="text-xs text-text-muted">{p.text}</div>
                    </div>
                  ))}
                  {timeline?.events?.map((e: any) => (
                    <div key={e.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                      <div className="text-sm font-medium text-text-bright">{e.title} <span className="text-azure text-xs">({e.dateLabel})</span></div>
                      <div className="text-xs text-text-muted">{e.summary}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Leader timeline (§19)</CardTitle>
                  <CardDescription>Heads of state &amp; government in order.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[280px] overflow-y-auto">
                  {leaders.map((l, i) => (
                    <div key={l.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm flex items-center gap-2">
                      <span className="text-text-muted w-6 shrink-0">{i + 1}.</span>
                      <div className="min-w-0">
                        <span className="font-medium text-text-bright">{l.name}</span>
                        <span className="text-text-muted text-xs block truncate">{l.title} · {l.party ?? "no party"}</span>
                      </div>
                      <span className="text-text-muted text-xs ml-auto shrink-0">{l.officeStart} – {l.officeEnd || "present"}</span>
                    </div>
                  ))}
                  {leaders.length === 0 && <div className="text-sm text-text-muted">No leader records for this country yet.</div>}
                </CardContent>
              </Card>
              {detail && (
                <Card>
                  <CardHeader>
                    <CardTitle>{detail.name}</CardTitle>
                    <CardDescription>Full record · <VerificationBadge verification={detail.meta?.verification} /></CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm max-h-[360px] overflow-y-auto">
                    <p className="text-text-main">{detail.summary}</p>
                    {detail.capital && <div><span className="text-azure">Capital:</span> {detail.capital}</div>}
                    {detail.governmentForm && <div><span className="text-azure">Government:</span> {detail.governmentForm.replace(/_/g, " ")}</div>}
                    {detail.independence && <div><span className="text-azure">Independence:</span> {detail.independence}</div>}
                    {detail.legislature && <div><span className="text-azure">Legislature:</span> {detail.legislature}</div>}
                    {detail.electoralSystem && <div><span className="text-azure">Electoral system:</span> {detail.electoralSystem}</div>}
                    {detail.currentSituation && <div><span className="text-azure">Current situation:</span> {detail.currentSituation}</div>}
                    {detail.meta?.lastVerified && <div className="text-xs text-text-muted">Last verified: {detail.meta.lastVerified}</div>}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Compare ─────────────────────────────────────────────────── */}
        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle>Country comparison</CardTitle>
              <CardDescription>Neutral comparison across government form, federal structure, executives, legislatures, electoral systems, constitutions, independence, party systems and current situations. WINDELS does not rank political systems or countries (§24).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={compareIds} onChange={(e) => setCompareIds(e.target.value)} placeholder="country ids, comma-separated" />
                <Button onClick={runCompare} className="shrink-0"><Scale className="w-4 h-4 mr-1" /> Compare</Button>
              </div>
              <div className="text-xs text-text-muted flex flex-wrap gap-1.5">
                Presets:
                {[
                  ["pol.country.nigeria, pol.country.united-states", "Nigeria vs USA"],
                  ["pol.country.nigeria, pol.country.united-kingdom", "Nigeria vs UK"],
                  ["pol.country.france, pol.country.russia", "France vs Russia"],
                  ["pol.country.kenya, pol.country.ghana", "Kenya vs Ghana"],
                  ["pol.country.germany, pol.country.india", "Germany vs India"],
                ].map(([ids, label]) => (
                  <button key={label} onClick={() => setCompareIds(ids as string)} className="px-2 py-0.5 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10">{label}</button>
                ))}
              </div>
              {compareError && <div className="text-sm text-rose-300">{compareError}</div>}
              {compare && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-white/10">
                        <th className="py-2 pr-3">Dimension</th>
                        {compare.items.map((it: any) => <th key={it.id} className="py-2 px-3">{it.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {compare.rows.map((row: any) => (
                        <tr key={row.category} className="border-b border-white/5 align-top">
                          <td className="py-2 pr-3 text-azure font-medium whitespace-nowrap">{row.label}</td>
                          {row.values.map((v: any) => <td key={v.id} className="py-2 px-3 text-text-main">{v.text}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-text-muted mt-2">{compare.note}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fact vs opinion ─────────────────────────────────────────── */}
        <TabsContent value="claim">
          <Card>
            <CardHeader>
              <CardTitle>Fact vs opinion engine (§23)</CardTitle>
              <CardDescription>
                "Person X served as president from year A to year B" is a fact if sourced. "Person X was the greatest president" is an opinion. "Person X destroyed the economy" needs evidence. WINDELS distinguishes verified fact, historical interpretation, political analysis, opinion, allegation, disputed claim and propaganda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={claimText} onChange={(e) => setClaimText(e.target.value)} placeholder="Enter a political claim…" onKeyDown={(e) => e.key === "Enter" && runClaim()} />
                <Button onClick={runClaim} className="shrink-0"><ScaleIcon className="w-4 h-4 mr-1" /> Classify</Button>
              </div>
              {claim && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  <div className="font-medium">{claim.category.replace(/_/g, " ")}</div>
                  <div className="text-xs mt-1">{claim.explanation}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Person X served as president from year A to year B.",
                  "Person X was the greatest president.",
                  "Person X destroyed the economy.",
                  "Person X is accused of corruption.",
                  "The election result is disputed by the opposition.",
                  "The regime is a puppet of traitors and enemies of the people.",
                ].map((ex) => (
                  <button key={ex} onClick={() => setClaimText(ex as string)} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10 text-text-muted">{ex.slice(0, 46)}…</button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Learn ───────────────────────────────────────────────────── */}
        <TabsContent value="learn">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quiz me (§31)</CardTitle>
                <CardDescription>Deterministic questions generated from the record's own content — to teach, not to score.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input value={quizTopic} onChange={(e) => setQuizTopic(e.target.value)} placeholder="country id (e.g. pol.country.nigeria)" />
                  <Select value={quizLevel} onChange={(e) => setQuizLevel(e.target.value as PoliticsLevel)} className="w-36 shrink-0">
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                  <Button onClick={runQuiz} className="shrink-0"><GraduationCap className="w-4 h-4 mr-1" /> Start</Button>
                </div>
                {quiz && (
                  <div className="space-y-2">
                    {quiz.questions.map((q, i) => (
                      <div key={q.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-sm font-medium text-text-bright">{i + 1}. {q.question}</div>
                        <div className="grid gap-1 mt-2">
                          {q.choices.map((c, ci) => (
                            <button key={ci} onClick={() => answerQuiz(q.id, ci)} className={`text-left text-xs px-2 py-1 rounded border ${quizAnswers[q.id] === ci ? "border-azure/60 bg-azure/10 text-azure" : "border-white/10 bg-white/[0.03] text-text-muted"}`}>
                              {c}
                            </button>
                          ))}
                        </div>
                        {quizScore !== null && (
                          <div className="text-xs text-text-muted mt-1">
                            {quizAnswers[q.id] === q.correctIndex ? "✓ Correct. " : "✗ Wrong. "}{q.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                    {quizScore === null ? (
                      <Button size="sm" onClick={gradeQuiz}>Grade quiz</Button>
                    ) : (
                      <div className="text-sm text-azure">Score: {quizScore}/{quiz.questions.length}</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>How government works</CardTitle>
                <CardDescription>Educational records on the §12 forms of government and the §13 ideologies.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 max-h-[420px] overflow-y-auto">
                {["pol.form.presidential-republic", "pol.form.parliamentary-republic", "pol.form.semi-presidential", "pol.form.constitutional-monarchy", "pol.form.federal-republic", "pol.form.unitary-republic", "pol.ideo.liberalism", "pol.ideo.socialism", "pol.ideo.social-democracy", "pol.ideo.fascism", "pol.ideo.pan-africanism", "pol.ideo.populism"].map((id) => (
                  <button key={id} onClick={() => openDetail(id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 text-sm text-text-main">
                    {id.replace("pol.form.", "").replace("pol.ideo.", "").replace(/-/g, " ")}
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Updates ─────────────────────────────────────────────────── */}
        <TabsContent value="updates">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Submit a political update (§28)</CardTitle>
                <CardDescription>
                  Detect a leadership change, appointment, election result or event? Submit it with a source (§22 ladder). The Super Admin applies it — the change-log entry records previous value, new value, effective date and source. History is never overwritten (§29).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input value={updEntity} onChange={(e) => setUpdEntity(e.target.value)} placeholder="entity id (e.g. pol.country.nigeria)" />
                <Input value={updField} onChange={(e) => setUpdField(e.target.value)} placeholder="field (e.g. currentSituation)" />
                <Input value={updTitle} onChange={(e) => setUpdTitle(e.target.value)} placeholder="Title (e.g. New president inaugurated)" />
                <Textarea value={updSummary} onChange={(e) => setUpdSummary(e.target.value)} placeholder="Change summary" rows={2} />
                <Textarea value={updNew} onChange={(e) => setUpdNew(e.target.value)} placeholder="New value" rows={2} />
                <Input value={updEffective} onChange={(e) => setUpdEffective(e.target.value)} placeholder="Effective date (e.g. 2027-05-29)" />
                <Input value={updSource} onChange={(e) => setUpdSource(e.target.value)} placeholder="SOURCE (required)" />
                <Button onClick={runSubmit}><Database className="w-4 h-4 mr-1" /> Submit</Button>
                {updMsg && <div className="text-xs text-text-muted">{updMsg}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Updates ({updates.length})</CardTitle>
                <CardDescription>Organization-scoped change requests; applying is Super Admin-only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[520px] overflow-y-auto">
                {updates.length === 0 && <div className="text-sm text-text-muted">No updates yet — submit a change on the left.</div>}
                {updates.map((u) => (
                  <div key={u.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text-bright text-sm">{u.title}</span>
                        <Badge>{u.status.replace(/_/g, " ")}</Badge>
                        <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">{u.kind.replace(/_/g, " ")}</Badge>
                      </div>
                      {isSuperAdmin && u.status === "pending_review" && (
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="success" onClick={() => runReview(u.id, "applied")}>Apply</Button>
                          <Button size="sm" variant="danger" onClick={() => runReview(u.id, "rejected")}>Reject</Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-text-muted">{u.changeSummary} · effective {u.effectiveDate}</p>
                    {u.previousValue && <div className="text-xs text-text-muted"><span className="text-rose-300 line-through">{u.previousValue.slice(0, 80)}</span></div>}
                    <div className="text-xs text-emerald-300">{u.newValue.slice(0, 120)}</div>
                    {u.changeLog && (
                      <div className="text-[10px] text-text-muted">
                        Change log: applied {u.changeLog.appliedAt?.slice(0, 19).replace("T", " ")} by {u.changeLog.appliedBy} · source: {u.changeLog.source.label}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
