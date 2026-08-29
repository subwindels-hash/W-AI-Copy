/**
 * Session 140 — Global Human Knowledge & Everyday Question Intelligence
 * Console (/app/knowledge).
 *
 * Tabs:
 *   Ask          — Ask WINDELS: intent classification, routing, audience level,
 *                  answer sections, sources, confidence and disclaimers.
 *   Knowledge    — the 90 master categories + deterministic search + record detail.
 *   Intent       — live Question Intent Engine demo (13 intents + general).
 *   Compare      — criteria-based comparison of catalog records (no winner).
 *   Dynamic      — org-scoped dynamic records with SOURCE + DATE + VERIFICATION
 *                  STATUS + LAST UPDATED.
 *   Timeline     — the eight history eras and the global timeline engine.
 *
 * Honest UI rules:
 *   - unanswered questions render the explicit "insufficient knowledge" note.
 *   - unverified/self-reported dynamic records are labelled as such, never as
 *     catalog-verified knowledge.
 *   - comparison tables render null scores as "not labeled", never 0.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen, Search, Brain, Scale, Database, History, Send, Trash2,
  RefreshCw, ShieldCheck, AlertTriangle, FileQuestion, Lightbulb, ExternalLink,
} from "lucide-react";
import type {
  AudienceLevel,
  IntentClassification,
  KnowledgeAnswerMatch,
  KnowledgeComparisonResult,
  KnowledgeKind,
  KnowledgeRecord,
  TimelineEventView,
} from "@windels/shared";
import {
  askKnowledge,
  classifyKnowledgeIntent,
  compareKnowledgeRecords,
  getKnowledgeCatalogMeta,
  getKnowledgeTimeline,
  listHistoryEras,
  listKnowledgeCategories,
  listKnowledgeKinds,
  listKnowledgeRecords,
  addKnowledgeRecord,
  deleteKnowledgeRecord,
  searchKnowledge,
} from "@/lib/knowledge";
import type {
  AskResponse,
  HistoryEraView,
  KnowledgeCategoryView,
  KnowledgeKindView,
} from "@/lib/knowledge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthStore } from "@/store/auth";

const LEVELS: AudienceLevel[] = ["child", "high_school", "undergraduate", "graduate", "research"];

const CONFIDENCE_COLOR: Record<string, string> = {
  verified: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  well_supported: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  disputed: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  uncertain: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  unverified: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <Badge className={CONFIDENCE_COLOR[confidence] ?? ""}>
      {confidence.replace("_", " ")}
    </Badge>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <Badge className={tier === "dynamic" ? "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40" : "bg-slate-500/20 text-slate-300 border-slate-500/40"}>
      {tier === "dynamic" ? "dynamic — verify" : "stable"}
    </Badge>
  );
}

function SectionList({ match }: { match: KnowledgeAnswerMatch }) {
  return (
    <div className="space-y-2">
      {match.sections.map((s) => (
        <div key={s.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-azure/80 mb-1">{s.heading}</div>
          <div className="text-sm text-text-main whitespace-pre-wrap">{s.body}</div>
        </div>
      ))}
      {match.steps.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-azure/80 mb-2">Steps</div>
          <ol className="space-y-1.5">
            {match.steps.map((st) => (
              <li key={st.order} className="text-sm text-text-main flex gap-2">
                <span className="text-azure font-semibold">{st.order}.</span>
                <span>
                  <span className="font-medium">{st.title}</span>
                  {st.requiresProfessional && (
                    <span className="ml-2 text-[11px] text-amber-300">— requires professional/official assistance</span>
                  )}
                  <span className="block text-text-muted">{st.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {match.misconceptions.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-amber-300/90 mb-2">Common misconceptions</div>
          {match.misconceptions.map((m, i) => (
            <div key={i} className="text-sm mb-2 last:mb-0">
              <div className="text-text-muted">✗ {m.misconception}</div>
              <div className="text-text-main">✓ {m.correction}</div>
            </div>
          ))}
        </div>
      )}
      {match.professionalAssistanceNote && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="inline w-4 h-4 mr-1" /> {match.professionalAssistanceNote}
        </div>
      )}
      {match.sources.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-azure/80 mb-1">Sources</div>
          {match.sources.map((s, i) => (
            <div key={i} className="text-xs text-text-muted">
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-azure hover:underline">{s.label} <ExternalLink className="inline w-3 h-3" /></a> : s.label}
              {s.retrievedAt ? ` · retrieved ${s.retrievedAt}` : ""}
            </div>
          ))}
          <div className="text-[11px] text-text-muted mt-1">Last verified into the catalog: {match.lastUpdated.slice(0, 10)}</div>
        </div>
      )}
    </div>
  );
}

function IntentCard({ classification }: { classification: IntentClassification }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">{classification.intent}</Badge>
      <Badge>confidence {Math.round(classification.confidence * 100)}%</Badge>
      <span className="text-xs text-text-muted">{classification.explanation}</span>
    </div>
  );
}

export function KnowledgePage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState("ask");

  // Catalog meta
  const [meta, setMeta] = useState<{ catalogVersion: string; recordCount: number; categoryCount: number; byTier: Record<string, number>; byConfidence: Record<string, number> } | null>(null);
  const [kinds, setKinds] = useState<KnowledgeKindView[]>([]);

  // Ask tab
  const [question, setQuestion] = useState("What is democracy?");
  const [level, setLevel] = useState<AudienceLevel>("high_school");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [asking, setAsking] = useState(false);

  // Knowledge tab
  const [categories, setCategories] = useState<KnowledgeCategoryView[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeAnswerMatch[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeAnswerMatch | null>(null);
  const [searching, setSearching] = useState(false);

  // Intent tab
  const [intentText, setIntentText] = useState("Which cloud platform should I use?");
  const [intent, setIntent] = useState<IntentClassification | null>(null);

  // Compare tab
  const [compareIds, setCompareIds] = useState("cmp.item.python, cmp.item.javascript");
  const [compareResult, setCompareResult] = useState<KnowledgeComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Dynamic tab
  const [dynamicRecords, setDynamicRecords] = useState<KnowledgeRecord[]>([]);
  const [dynTitle, setDynTitle] = useState("");
  const [dynQuestion, setDynQuestion] = useState("");
  const [dynSummary, setDynSummary] = useState("");
  const [dynSource, setDynSource] = useState("");
  const [dynAsOf, setDynAsOf] = useState("");
  const [dynMsg, setDynMsg] = useState<string | null>(null);

  // Timeline tab
  const [eras, setEras] = useState<HistoryEraView[]>([]);
  const [eraFilter, setEraFilter] = useState("");
  const [events, setEvents] = useState<TimelineEventView[]>([]);

  const loadMeta = useCallback(async () => {
    const [m, k] = await Promise.all([
      getKnowledgeCatalogMeta().catch(() => null),
      listKnowledgeKinds().catch(() => [] as KnowledgeKindView[]),
    ]);
    setMeta(m);
    setKinds(k);
  }, []);

  const loadCategories = useCallback(async () => {
    setCategories(await listKnowledgeCategories().catch(() => [] as KnowledgeCategoryView[]));
  }, []);

  const loadTimeline = useCallback(async () => {
    const [e, t] = await Promise.all([
      listHistoryEras().catch(() => [] as HistoryEraView[]),
      getKnowledgeTimeline().catch(() => ({ eras: [] as HistoryEraView[], events: [] as TimelineEventView[] })),
    ]);
    setEras(e);
    setEvents(t.events);
  }, []);

  const loadDynamic = useCallback(async () => {
    const res = await listKnowledgeRecords({ scope: "org", limit: 50 }).catch(() => [] as KnowledgeRecord[]);
    setDynamicRecords(Array.isArray(res) ? res : []);
  }, []);

  useEffect(() => {
    void loadMeta();
    void loadCategories();
    void loadTimeline();
    void loadDynamic();
  }, [loadMeta, loadCategories, loadTimeline, loadDynamic]);

  const runAsk = useCallback(async () => {
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await askKnowledge({ question, audienceLevel: level, limit: 5 }));
    } catch (e: any) {
      setAnswer({ question, intent: { intent: "general", confidence: 0, matchedRules: [], explanation: String(e?.message ?? e) }, routing: { intent: "general", domain: "error", note: "" }, audienceLevel: level, matches: [], count: 0, note: String(e?.message ?? e) });
    } finally {
      setAsking(false);
    }
  }, [question, level]);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setSearchNote(null);
    try {
      const res = await searchKnowledge({ q, scope: "all", audienceLevel: "undergraduate", limit: 25 });
      setSearchResults(res.results);
      setSearchNote(res.note ?? null);
    } catch {
      setSearchResults([]);
      setSearchNote("Search failed — the knowledge layer is unavailable.");
    } finally {
      setSearching(false);
    }
  }, []);

  const openDetail = useCallback((id: string) => {
    const found = searchResults.find((r) => r.id === id) ?? null;
    setDetail(found);
  }, [searchResults]);

  const runIntent = useCallback(async () => {
    setIntent(await classifyKnowledgeIntent(intentText).catch(() => null));
  }, [intentText]);

  const runCompare = useCallback(async () => {
    setCompareError(null);
    setCompareResult(null);
    const ids = compareIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    if (ids.length < 2) {
      setCompareError("Enter at least two record ids, comma-separated.");
      return;
    }
    try {
      setCompareResult(await compareKnowledgeRecords({ recordIds: ids }));
    } catch (e: any) {
      setCompareError(String(e?.message ?? e));
    }
  }, [compareIds]);

  const createDynamic = useCallback(async () => {
    setDynMsg(null);
    if (!dynTitle || !dynQuestion || !dynSummary || !dynSource) {
      setDynMsg("Title, question, summary and at least one SOURCE are required (dynamic records must carry SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED).");
      return;
    }
    try {
      await addKnowledgeRecord({
        title: dynTitle,
        question: dynQuestion,
        kind: "current_information",
        categoryIds: ["cat-11"],
        summary: dynSummary,
        sources: [{ label: dynSource }],
        confidence: "unverified",
        asOfDate: dynAsOf || undefined,
      });
      setDynMsg("Dynamic record created as UNVERIFIED (self-reported provenance). It is visible only to this organization.");
      setDynTitle(""); setDynQuestion(""); setDynSummary(""); setDynSource(""); setDynAsOf("");
      await loadDynamic();
    } catch (e: any) {
      setDynMsg(String(e?.message ?? e));
    }
  }, [dynTitle, dynQuestion, dynSummary, dynSource, dynAsOf, loadDynamic]);

  const removeDynamic = useCallback(async (id: string) => {
    await deleteKnowledgeRecord(id).catch(() => null);
    await loadDynamic();
  }, [loadDynamic]);

  const changeEra = useCallback(async (era: string) => {
    setEraFilter(era);
    const t = await getKnowledgeTimeline(era || undefined).catch(() => ({ events: [] as TimelineEventView[] }));
    setEvents(t.events);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-azure" /> Global Knowledge & Everyday Questions
        </h1>
        <p className="text-text-muted text-sm mt-1">
          WINDELS' human-knowledge layer: {meta?.recordCount ?? "—"} curated records across {meta?.categoryCount ?? "—"} master categories.
          {meta ? <> Catalog <code className="text-azure">{meta.catalogVersion}</code>. Stable knowledge lives in the catalog; current facts are dynamic and must carry source + date + verification.</> : ""}
        </p>
        <div className="flex gap-2 flex-wrap mt-2">
          <Badge>stable: {meta?.byTier?.stable ?? "—"}</Badge>
          <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40">dynamic: {meta?.byTier?.dynamic ?? 0}</Badge>
          {meta ? Object.entries(meta.byConfidence).map(([c, n]) => (
            <ConfidenceBadge key={c} confidence={c} />
          )) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ask"><Send className="w-3.5 h-3.5 inline mr-1" /> Ask</TabsTrigger>
          <TabsTrigger value="kb"><Search className="w-3.5 h-3.5 inline mr-1" /> Knowledge</TabsTrigger>
          <TabsTrigger value="intent"><Brain className="w-3.5 h-3.5 inline mr-1" /> Intent Engine</TabsTrigger>
          <TabsTrigger value="compare"><Scale className="w-3.5 h-3.5 inline mr-1" /> Compare</TabsTrigger>
          <TabsTrigger value="dynamic"><Database className="w-3.5 h-3.5 inline mr-1" /> Dynamic</TabsTrigger>
          <TabsTrigger value="timeline"><History className="w-3.5 h-3.5 inline mr-1" /> Timeline</TabsTrigger>
        </TabsList>

        {/* ── Ask ─────────────────────────────────────────────────────── */}
        <TabsContent value="ask">
          <Card>
            <CardHeader>
              <CardTitle>Ask WINDELS anything</CardTitle>
              <CardDescription>
                The Question Intent Engine classifies your question (definition, explanation, history, comparison, instruction, recommendation, calculation, current information, research, education, creative, troubleshooting or personal guidance) and routes it to the right knowledge domain. Answers render at the chosen audience level — the underlying knowledge stays the same.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask anything…" onKeyDown={(e) => e.key === "Enter" && runAsk()} />
                <Select value={level} onChange={(e) => setLevel(e.target.value as AudienceLevel)} className="w-44 shrink-0">
                  {LEVELS.map((l) => <option key={l} value={l}>{l.replace("_", " ")}</option>)}
                </Select>
                <Button onClick={runAsk} disabled={asking || !question.trim()} className="shrink-0">
                  <Send className="w-4 h-4 mr-1" /> {asking ? "Asking…" : "Ask"}
                </Button>
              </div>
              {answer && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center gap-2 flex-wrap">
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">intent: {answer.intent.intent}</Badge>
                    <Badge>confidence {Math.round(answer.intent.confidence * 100)}%</Badge>
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40">{answer.routing.domain}</Badge>
                    <span className="text-xs text-text-muted">{answer.routing.note}</span>
                  </div>
                  {answer.matches.length === 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                      <FileQuestion className="inline w-4 h-4 mr-1" /> {answer.note}
                    </div>
                  ) : (
                    answer.matches.map((m) => (
                      <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-text-bright">{m.title}</span>
                          <Badge>{m.kind}</Badge>
                          <ConfidenceBadge confidence={m.confidence} />
                          <TierBadge tier={m.tier} />
                          {m.provenance === "self_reported" && <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40">self-reported</Badge>}
                          {m.asOfDate && <Badge>as of {m.asOfDate}</Badge>}
                        </div>
                        <p className="text-sm text-text-muted">{m.summary}</p>
                        <SectionList match={m} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Knowledge base ───────────────────────────────────────────── */}
        <TabsContent value="kb">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Master categories ({categories.length})</CardTitle>
                <CardDescription>Browse the 90 master categories of human knowledge.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[480px] overflow-y-auto space-y-1">
                {categories.slice(0, 90).map((c) => (
                  <button key={c.id} onClick={() => runSearch(c.name)} className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 text-sm flex justify-between gap-2">
                    <span className="text-text-main">{c.name}</span>
                    <span className="text-text-muted text-xs shrink-0">{c.recordCount}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="pt-4 flex gap-2">
                  <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search the knowledge catalog…" onKeyDown={(e) => e.key === "Enter" && runSearch(searchQ)} />
                  <Button onClick={() => runSearch(searchQ)} disabled={searching}>
                    <Search className="w-4 h-4 mr-1" /> {searching ? "Searching…" : "Search"}
                  </Button>
                </CardContent>
              </Card>
              {searchNote && <div className="text-xs text-text-muted">{searchNote}</div>}
              {searchResults.map((r) => (
                <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-bright">{r.title}</span>
                      <Badge>{r.kind}</Badge>
                      <ConfidenceBadge confidence={r.confidence} />
                      {r.provenance === "self_reported" && <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40">self-reported</Badge>}
                    </div>
                    <p className="text-sm text-text-muted mt-1">{r.summary.slice(0, 160)}…</p>
                    <div className="text-xs text-text-muted mt-1">{r.question}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openDetail(r.id)}>View</Button>
                </div>
              ))}
              {searchResults.length === 0 && !searching && (
                <div className="text-sm text-text-muted">No records match. Use the Ask tab for the full question pipeline, or search a category name.</div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Intent engine ────────────────────────────────────────────── */}
        <TabsContent value="intent">
          <Card>
            <CardHeader>
              <CardTitle>Question Intent Engine</CardTitle>
              <CardDescription>
                Deterministically classifies any question into one of the 13 intents (plus the honest <code>general</code> fallback), so the system routes to the correct knowledge domain instead of treating every question as isolated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={intentText} onChange={(e) => setIntentText(e.target.value)} placeholder="Type a question…" onKeyDown={(e) => e.key === "Enter" && runIntent()} />
                <Button onClick={runIntent} className="shrink-0"><Brain className="w-4 h-4 mr-1" /> Classify</Button>
              </div>
              {intent && <IntentCard classification={intent} />}
              <div className="pt-2">
                <div className="text-xs uppercase tracking-wider text-text-muted mb-2">Examples</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "What is AI?", "How does AI work?", "When did AI begin?", "AI vs traditional software?",
                    "How do I build an AI app?", "Which cloud platform should I use?", "How much will this cost?",
                    "Who is the current president?", "Give me everything about this subject.", "Teach me mathematics.",
                    "Write a business plan.", "Why isn't my application working?", "What should I do?",
                  ].map((ex) => (
                    <button key={ex} onClick={() => { setIntentText(ex); setIntent(null); }} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10 text-text-muted">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Compare ──────────────────────────────────────────────────── */}
        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle>Which is better…?</CardTitle>
              <CardDescription>
                The comparison engine presents criteria instead of declaring a universal winner. Scores shown are curated catalog labels; anything not labeled renders as "not labeled", never as an invented number.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={compareIds} onChange={(e) => setCompareIds(e.target.value)} placeholder="record ids, comma-separated (e.g. cmp.item.python, cmp.item.javascript)" />
                <Button onClick={runCompare} className="shrink-0"><Scale className="w-4 h-4 mr-1" /> Compare</Button>
              </div>
              <div className="text-xs text-text-muted flex flex-wrap gap-1.5">
                Presets:
                {[
                  ["cmp.item.python, cmp.item.javascript", "Python vs JavaScript"],
                  ["cmp.item.degree, cmp.item.apprenticeship", "Degree vs apprenticeship"],
                  ["cmp.item.renting, cmp.item.buying", "Rent vs buy"],
                  ["cmp.item.aws, cmp.item.azure, cmp.item.gcp", "Cloud platforms"],
                ].map(([ids, label]) => (
                  <button key={label} onClick={() => setCompareIds(ids as string)} className="px-2 py-0.5 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10">
                    {label}
                  </button>
                ))}
              </div>
              {compareError && <div className="text-sm text-rose-300">{compareError}</div>}
              {compareResult && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-white/10">
                        <th className="py-2 pr-3">Criterion</th>
                        {compareResult.items.map((it) => (
                          <th key={it.id} className="py-2 px-3">{it.title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compareResult.criteria.map((c) => (
                        <tr key={c.key} className="border-b border-white/5">
                          <td className="py-2 pr-3 text-text-main">
                            {c.label}
                            {c.description ? <div className="text-xs text-text-muted">{c.description}</div> : null}
                          </td>
                          {compareResult.items.map((it) => {
                            const score = it.scores.find((s) => s.criterionKey === c.key);
                            return (
                              <td key={it.id} className="py-2 px-3">
                                {score && score.value !== null ? (
                                  <span>
                                    <span className="font-semibold text-text-bright">{score.value}</span>
                                    <span className="text-xs text-text-muted">/100 · {score.basis}</span>
                                    {score.note ? <div className="text-xs text-text-muted">{score.note}</div> : null}
                                  </span>
                                ) : (
                                  <span className="text-text-muted text-xs">not labeled</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-text-muted mt-2">{compareResult.note}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Dynamic layer ────────────────────────────────────────────── */}
        <TabsContent value="dynamic">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add a dynamic record</CardTitle>
                <CardDescription>
                  Org-scoped, self-reported knowledge. Dynamic records must carry SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED; new records start as UNVERIFIED and are visible only to your organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input value={dynTitle} onChange={(e) => setDynTitle(e.target.value)} placeholder="Title (e.g. ACME branch opening hours)" />
                <Input value={dynQuestion} onChange={(e) => setDynQuestion(e.target.value)} placeholder="Question this answers" />
                <Textarea value={dynSummary} onChange={(e) => setDynSummary(e.target.value)} placeholder="Summary" rows={3} />
                <Input value={dynSource} onChange={(e) => setDynSource(e.target.value)} placeholder="SOURCE (required)" />
                <Input value={dynAsOf} onChange={(e) => setDynAsOf(e.target.value)} placeholder="As-of date (e.g. 2026-08-08)" />
                <Button onClick={createDynamic}><Database className="w-4 h-4 mr-1" /> Add record</Button>
                {dynMsg && <div className="text-xs text-text-muted">{dynMsg}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Organization records ({dynamicRecords.length})</CardTitle>
                <CardDescription>Self-reported dynamic knowledge for {user?.organizationId ? `org ${user.organizationId}` : "your organization"}. Shown as unverified unless the contributor raised the confidence with sources.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
                {dynamicRecords.length === 0 && (
                  <div className="text-sm text-text-muted">No dynamic records yet — add your first verified-sourced record on the left.</div>
                )}
                {dynamicRecords.map((r) => (
                  <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text-bright text-sm">{r.title}</span>
                        <ConfidenceBadge confidence={r.confidence} />
                        <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40">dynamic</Badge>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{r.summary.slice(0, 140)}</p>
                      <p className="text-xs text-text-muted">
                        source: {(r.sources ?? []).map((s) => s.label).join(", ") || "none"}
                        {r.asOfDate ? ` · as of ${r.asOfDate}` : ""} · updated {r.lastUpdated.slice(0, 10)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => removeDynamic(r.id)} title="Delete (correction path)">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Timeline ─────────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Global timeline engine</CardTitle>
              <CardDescription>
                Chronological events from prehistory to the contemporary era. Dates are approximate where precision is impossible — labelled honestly — and the most recent era is dynamic knowledge to verify.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant={eraFilter === "" ? "primary" : "outline"} onClick={() => changeEra("")}>All eras</Button>
                {eras.map((e) => (
                  <Button key={e.id} size="sm" variant={eraFilter === e.id ? "primary" : "outline"} onClick={() => changeEra(e.id)}>
                    {e.name} <span className="text-xs opacity-70 ml-1">({e.eventCount})</span>
                  </Button>
                ))}
              </div>
              <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
                {events.map((ev) => (
                  <div key={ev.id} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="w-32 shrink-0 text-sm text-azure font-medium">{ev.dateLabel}</div>
                    <div>
                      <div className="text-sm font-medium text-text-bright">{ev.title}</div>
                      <div className="text-xs text-text-muted">{ev.summary}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record detail modal-ish panel */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-white/10 bg-bg-deep p-5 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-text-bright">{detail.title}</h3>
              <Badge>{detail.kind}</Badge>
              <ConfidenceBadge confidence={detail.confidence} />
              <TierBadge tier={detail.tier} />
            </div>
            <p className="text-sm text-text-muted">{detail.summary}</p>
            <SectionList match={detail} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setDetail(null)}>Close</Button>
              <Button size="sm" variant="outline" onClick={() => { setTab("compare"); setCompareIds(detail.id + ", "); setDetail(null); }}>
                <Scale className="w-3.5 h-3.5 mr-1" /> Compare this
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
