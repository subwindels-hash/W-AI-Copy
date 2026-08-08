/**
 * Session 141 — Global Religion, Belief & Spirituality Knowledge Console
 * (/app/religions).
 *
 * Tabs:
 *   Ask        — religion question engine: definitions, comparisons,
 *                history, practice and the neutrality answer for
 *                truth-claim questions.
 *   Explore    — the 12 families, deterministic search and record detail
 *                with indigenous names preserved.
 *   Compare    — the 18-category comparison table (no winner; values come
 *                only from each tradition's own record).
 *   Learn      — educational levels beginner → research for any record.
 *   Expand     — the ten-step expansion pipeline with duplicate detection
 *                and (for the Super Admin) approve/reject.
 *
 * Honest UI rules:
 *   - truth-claim questions render the neutrality policy answer.
 *   - comparison tables present each tradition's own text; no winner column.
 *   - submissions render the automated check report and their unverified
 *     confidence; approvals are Super Admin-only.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen, Search, Scale, GraduationCap, Database, Send, Trash2,
  ShieldCheck, AlertTriangle, FileQuestion, Sparkles, ExternalLink,
  Plug, MemoryStick, Bot, Cpu, MessagesSquare, Download,
} from "lucide-react";
import type {
  ReligionFamily,
  ReligionLevel,
  ReligionQuestionClassification,
  ReligionRecord,
  ReligionSubmission,
} from "@windels/shared";
import {
  askReligion,
  attachReligionKnowledgeToAgent,
  chatReligion,
  compareReligionsByIds,
  createReligionTrainingDataset,
  deleteReligionSubmission,
  getAgentReligionStatus,
  getReligionCatalogMeta,
  getReligionEducationCatalog,
  getReligionsIntegrationsOverview,
  getReligionsMemoryStatus,
  listReligionSubmissions,
  religionTrainingExportUrl,
  reviewReligionSubmission,
  searchReligions,
  startReligionLesson,
  submitReligion,
  syncReligionsMemory,
  teachReligion,
} from "@/lib/religions";
import type { ReligionChatTurn } from "@/lib/religions";
import type {
  ReligionAskResponse,
  ReligionCatalogMeta,
  ReligionTeachResponse,
} from "@/lib/religions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthStore } from "@/store/auth";

const LEVELS: ReligionLevel[] = ["beginner", "intermediate", "advanced", "research"];

const CONFIDENCE_COLOR: Record<string, string> = {
  verified: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  well_supported: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  disputed: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  uncertain: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  unverified: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return <Badge className={CONFIDENCE_COLOR[confidence] ?? ""}>{confidence.replace("_", " ")}</Badge>;
}

function Sections({ sections }: { sections: Array<{ key: string; heading: string; body: string }> }) {
  return (
    <div className="space-y-2">
      {sections.map((s) => (
        <div key={s.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-azure/80 mb-1">{s.heading}</div>
          <div className="text-sm text-text-main whitespace-pre-wrap">{s.body}</div>
        </div>
      ))}
    </div>
  );
}

export function ReligionsPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState("ask");
  const isSuperAdmin = user?.role === "super_admin";

  const [meta, setMeta] = useState<ReligionCatalogMeta | null>(null);

  // Ask
  const [question, setQuestion] = useState("What is the difference between Christianity and Islam?");
  const [level, setLevel] = useState<ReligionLevel>("intermediate");
  const [answer, setAnswer] = useState<ReligionAskResponse | null>(null);
  const [asking, setAsking] = useState(false);

  // Explore
  const [searchQ, setSearchQ] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [results, setResults] = useState<ReligionRecord[]>([]);
  const [detail, setDetail] = useState<ReligionRecord | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  // Compare
  const [compareIds, setCompareIds] = useState("rel.christianity, rel.islam");
  const [compare, setCompare] = useState<Awaited<ReturnType<typeof compareReligionsByIds>> | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Learn
  const [learnId, setLearnId] = useState("rel.buddhism");
  const [learnLevel, setLearnLevel] = useState<ReligionLevel>("beginner");
  const [taught, setTaught] = useState<ReligionTeachResponse | null>(null);

  // Expand
  const [subs, setSubs] = useState<ReligionSubmission[]>([]);
  const [subName, setSubName] = useState("");
  const [subFamily, setSubFamily] = useState<ReligionFamily>("other");
  const [subRegion, setSubRegion] = useState("");
  const [subOrigin, setSubOrigin] = useState("");
  const [subTeachings, setSubTeachings] = useState("");
  const [subDeity, setSubDeity] = useState("");
  const [subHistory, setSubHistory] = useState("");
  const [subSummary, setSubSummary] = useState("");
  const [subSimple, setSubSimple] = useState("");
  const [subSource, setSubSource] = useState("");
  const [subMsg, setSubMsg] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setMeta(await getReligionCatalogMeta().catch(() => null));
  }, []);

  const loadSubs = useCallback(async () => {
    setSubs(await listReligionSubmissions().catch(() => [] as ReligionSubmission[]));
  }, []);

  useEffect(() => {
    void loadMeta();
    void loadSubs();
  }, [loadMeta, loadSubs]);

  const runAsk = useCallback(async () => {
    setAsking(true);
    try {
      setAnswer(await askReligion({ question, level, limit: 5 }));
    } catch (e: any) {
      setAnswer({
        question, level, mode: "teach", matches: [], count: 0,
        intent: { intent: "general", confidence: 0, matchedRules: [], explanation: String(e?.message ?? e) },
        note: String(e?.message ?? e),
      });
    } finally {
      setAsking(false);
    }
  }, [question, level]);

  const runSearch = useCallback(async (q: string) => {
    try {
      const res = await searchReligions({ q, family: (familyFilter || undefined) as ReligionFamily | undefined, limit: 30 });
      setResults(res.results);
      setSearchNote(res.note ?? null);
    } catch {
      setResults([]);
      setSearchNote("Search failed — the religion knowledge layer is unavailable.");
    }
  }, [familyFilter]);

  const runCompare = useCallback(async () => {
    setCompareError(null);
    setCompare(null);
    const ids = compareIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    if (ids.length < 2) {
      setCompareError("Enter at least two record ids, comma-separated.");
      return;
    }
    try {
      setCompare(await compareReligionsByIds(ids));
    } catch (e: any) {
      setCompareError(String(e?.message ?? e));
    }
  }, [compareIds]);

  const runTeach = useCallback(async () => {
    setTaught(await teachReligion(learnId, learnLevel).catch(() => null));
  }, [learnId, learnLevel]);

  const runSubmit = useCallback(async () => {
    setSubMsg(null);
    if (!subName || !subRegion || !subOrigin || !subTeachings || !subDeity || !subHistory || !subSummary || !subSimple || !subSource) {
      setSubMsg("Name, region, origin, teachings, deity concept, history, summary, beginner explanation and at least one SOURCE are required.");
      return;
    }
    try {
      const sub = await submitReligion({
        name: subName,
        family: subFamily,
        category: "new_religious_movement",
        region: [subRegion],
        originLabel: subOrigin,
        centralTeachings: subTeachings,
        deityConcept: subDeity,
        historicalDevelopment: subHistory,
        summary: subSummary,
        simple: subSimple,
        sources: [{ label: subSource, type: "community" }],
      });
      const passed = sub.checks.filter((c) => c.passed).length;
      setSubMsg(`Submission ${sub.id} created as ${sub.status}. Automated checks: ${passed}/${sub.checks.length} passed. Duplicate detection and the Super Admin approval gate are included.`);
      setSubName(""); setSubRegion(""); setSubOrigin(""); setSubTeachings(""); setSubDeity(""); setSubHistory(""); setSubSummary(""); setSubSimple(""); setSubSource("");
      await loadSubs();
    } catch (e: any) {
      setSubMsg(String(e?.message ?? e));
    }
  }, [subName, subFamily, subRegion, subOrigin, subTeachings, subDeity, subHistory, subSummary, subSimple, subSource, loadSubs]);

  const runReview = useCallback(async (id: string, status: "approved" | "rejected") => {
    try {
      await reviewReligionSubmission(id, status, status === "approved" ? "Approved via the knowledge-base expansion gate." : "Rejected after review.");
      await loadSubs();
    } catch (e: any) {
      setSubMsg(String(e?.message ?? e));
    }
  }, [loadSubs]);

  const removeSub = useCallback(async (id: string) => {
    await deleteReligionSubmission(id).catch(() => null);
    await loadSubs();
  }, [loadSubs]);

  // ── Integrations (Session 142) ─────────────────────────────────────
  const [integrationOverview, setIntegrationOverview] = useState<any>(null);
  const [memSyncMsg, setMemSyncMsg] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [agentMsg, setAgentMsg] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<{ attachedCount: number; attachedTitles: string[] } | null>(null);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);
  const [eduMsg, setEduMsg] = useState<string | null>(null);
  const [eduLesson, setEduLesson] = useState<any>(null);
  const [chatQ, setChatQ] = useState("What do different religions teach about the afterlife?");
  const [chatTurn, setChatTurn] = useState<ReligionChatTurn | null>(null);

  const loadIntegrations = useCallback(async () => {
    setIntegrationOverview(await getReligionsIntegrationsOverview().catch(() => null));
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  const runMemSync = useCallback(async () => {
    setMemSyncMsg(null);
    try {
      const res = await syncReligionsMemory();
      setMemSyncMsg(`Memory Fabric sync: ${res.succeeded}/${res.attempted} records synced (${res.failed} failed). ${res.skippedDuplicateNote}`);
      await loadIntegrations();
    } catch (e: any) {
      setMemSyncMsg(String(e?.message ?? e));
    }
  }, [loadIntegrations]);

  const runAttach = useCallback(async () => {
    setAgentMsg(null);
    setAgentStatus(null);
    if (!agentId.trim()) {
      setAgentMsg("Enter an agent id first.");
      return;
    }
    try {
      const res = await attachReligionKnowledgeToAgent(agentId.trim());
      setAgentMsg(`Attached ${res.attached} records to agent ${res.agentId} (${res.alreadyPresent} already present). ${res.note}`);
      const st = await getAgentReligionStatus(agentId.trim());
      setAgentStatus({ attachedCount: st.attachedCount, attachedTitles: st.attachedTitles });
    } catch (e: any) {
      setAgentMsg(String(e?.message ?? e));
    }
  }, [agentId]);

  const runTraining = useCallback(async () => {
    setTrainMsg(null);
    try {
      const res = await createReligionTrainingDataset();
      setTrainMsg(`Dataset "${res.dataset.name}" created (id ${res.dataset.id}): ${res.rows} rows, ${(res.sizeBytes / 1024).toFixed(1)} KB, syntheticPct ${res.syntheticPct}. ${res.exportNote}`);
      await loadIntegrations();
    } catch (e: any) {
      setTrainMsg(String(e?.message ?? e));
    }
  }, [loadIntegrations]);

  const runLesson = useCallback(async () => {
    setEduMsg(null);
    setEduLesson(null);
    if (!learnId.trim()) {
      setEduMsg("Enter a record id (e.g. rel.buddhism) in the Learn tab field first, or type one here.");
      return;
    }
    try {
      setEduLesson(await startReligionLesson(learnId.trim(), learnLevel));
    } catch (e: any) {
      setEduMsg(String(e?.message ?? e));
    }
  }, [learnId, learnLevel]);

  const runChat = useCallback(async () => {
    setChatTurn(await chatReligion({ question: chatQ, level }).catch(() => null));
  }, [chatQ, level]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-azure" /> World Religions & Belief Systems
        </h1>
        <p className="text-text-muted text-sm mt-1">
          {meta?.recordCount ?? "—"} documented traditions across {meta?.familyCount ?? "—"} families — world religions, denominations, schools, indigenous traditions, ancient religions and new movements. Catalog <code className="text-azure">{meta?.catalogVersion}</code>.
        </p>
        <div className="flex gap-2 flex-wrap mt-2">
          {meta?.families.slice(0, 12).map((f) => (
            <button key={f.family} onClick={() => { setFamilyFilter(f.family as string); setTab("explore"); }} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10 text-text-muted">
              {f.label} <span className="text-azure">({f.recordCount})</span>
            </button>
          ))}
        </div>
        {meta && (
          <p className="text-[11px] text-text-muted mt-2">
            <ShieldCheck className="inline w-3 h-3 mr-1" /> {meta.neutralityNote}
          </p>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ask"><Send className="w-3.5 h-3.5 inline mr-1" /> Ask</TabsTrigger>
          <TabsTrigger value="explore"><Search className="w-3.5 h-3.5 inline mr-1" /> Explore</TabsTrigger>
          <TabsTrigger value="compare"><Scale className="w-3.5 h-3.5 inline mr-1" /> Compare</TabsTrigger>
          <TabsTrigger value="learn"><GraduationCap className="w-3.5 h-3.5 inline mr-1" /> Learn</TabsTrigger>
          <TabsTrigger value="expand"><Database className="w-3.5 h-3.5 inline mr-1" /> Expand</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="w-3.5 h-3.5 inline mr-1" /> Integrations</TabsTrigger>
        </TabsList>

        {/* ── Ask ─────────────────────────────────────────────────────── */}
        <TabsContent value="ask">
          <Card>
            <CardHeader>
              <CardTitle>Ask about any religion</CardTitle>
              <CardDescription>
                The religion question engine distinguishes definitions, comparisons, history, practice and truth claims. "Which religion is true?" receives the neutrality answer: truth claims are matters of faith, theology, philosophy and personal belief — WINDELS does not claim to have chosen a religion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about religions…" onKeyDown={(e) => e.key === "Enter" && runAsk()} />
                <Select value={level} onChange={(e) => setLevel(e.target.value as ReligionLevel)} className="w-40 shrink-0">
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
                <Button onClick={runAsk} disabled={asking || !question.trim()} className="shrink-0">
                  <Send className="w-4 h-4 mr-1" /> {asking ? "Asking…" : "Ask"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "What is Christianity?", "What is Islam?", "What is the difference between Christianity and Islam?",
                  "Which religion is true?", "What do Yoruba traditional beliefs teach?", "When did Buddhism begin?",
                  "How do Muslims pray?", "What are the Abrahamic religions?",
                ].map((ex) => (
                  <button key={ex} onClick={() => setQuestion(ex)} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10 text-text-muted">
                    {ex}
                  </button>
                ))}
              </div>
              {answer && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center gap-2 flex-wrap">
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">intent: {answer.intent.intent}</Badge>
                    <Badge>{answer.mode}</Badge>
                    <span className="text-xs text-text-muted">{answer.intent.explanation}</span>
                  </div>
                  {answer.mode === "neutrality" && (
                    <div className="rounded-lg border border-azure/30 bg-azure/10 p-4 text-sm text-azure-100">
                      <ShieldCheck className="inline w-4 h-4 mr-1" /> {answer.note}
                    </div>
                  )}
                  {answer.matches.length === 0 && answer.note && !answer.comparison && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                      <FileQuestion className="inline w-4 h-4 mr-1" /> {answer.note}
                    </div>
                  )}
                  {answer.matches.map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-text-bright">{m.name}</span>
                        <Badge>{m.family.replace("_", " ")}</Badge>
                        <ConfidenceBadge confidence={m.confidence} />
                      </div>
                      <Sections sections={m.sections} />
                      {m.controversialNote && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                          <AlertTriangle className="inline w-3 h-3 mr-1" /> {m.controversialNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Explore ─────────────────────────────────────────────────── */}
        <TabsContent value="explore">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              <Card>
                <CardContent className="pt-4 flex gap-2">
                  <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search traditions, indigenous names, holy books…" onKeyDown={(e) => e.key === "Enter" && runSearch(searchQ)} />
                  <Select value={familyFilter} onChange={(e) => { setFamilyFilter(e.target.value as string); }} className="w-52 shrink-0">
                    <option value="">All families</option>
                    {meta?.families.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
                  </Select>
                  <Button onClick={() => runSearch(searchQ)} className="shrink-0"><Search className="w-4 h-4 mr-1" /> Search</Button>
                </CardContent>
              </Card>
              {searchNote && <div className="text-xs text-text-muted">{searchNote}</div>}
              {results.map((r) => (
                <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-bright">{r.name}</span>
                      <Badge>{r.category.replace("_", " ")}</Badge>
                      <Badge>{r.family.replace("_", " ")}</Badge>
                      <ConfidenceBadge confidence={r.confidence} />
                      {r.indigenousNames.length > 0 && (
                        <span className="text-[11px] text-text-muted">{r.indigenousNames[0]!.name}</span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted mt-1">{r.summary}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDetail(r)}>View</Button>
                </div>
              ))}
              {results.length === 0 && !searchNote && (
                <div className="text-sm text-text-muted">Search the catalog or pick a family above.</div>
              )}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Record detail</CardTitle>
                <CardDescription>Select a record to see its full standardized entry.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[560px] overflow-y-auto">
                {detail ? (
                  <>
                    <h3 className="font-semibold text-text-bright">{detail.name}</h3>
                    <ConfidenceBadge confidence={detail.confidence} />
                    <p className="text-xs text-text-muted">Last reviewed: {detail.lastReviewed}</p>
                    {detail.indigenousNames.map((n, i) => (
                      <div key={i} className="text-xs text-azure">{n.name} <span className="text-text-muted">({n.script ?? n.lang})</span></div>
                    ))}
                    <p className="text-sm text-text-main">{detail.summary}</p>
                    <div className="text-xs text-text-muted space-y-1">
                      <div><span className="text-azure">Origin:</span> {detail.originLabel}</div>
                      <div><span className="text-azure">Region:</span> {detail.region.join(", ")}</div>
                      <div><span className="text-azure">Theism:</span> {detail.theism}</div>
                      {detail.founder.length > 0 && <div><span className="text-azure">Founder(s):</span> {detail.founder.join(", ")}</div>}
                      {detail.festivals.length > 0 && <div><span className="text-azure">Festivals:</span> {detail.festivals.join(", ")}</div>}
                      {detail.sacredTexts.length > 0 && <div><span className="text-azure">Sacred texts:</span> {detail.sacredTexts.join("; ")}</div>}
                      {detail.sacredPlaces.length > 0 && <div><span className="text-azure">Sacred places:</span> {detail.sacredPlaces.join(", ")}</div>}
                      {detail.symbols.length > 0 && <div><span className="text-azure">Symbols:</span> {detail.symbols.join(", ")}</div>}
                    </div>
                    <div className="text-xs text-text-muted space-y-1 pt-2 border-t border-white/10">
                      <div className="text-azure uppercase tracking-wider text-[10px]">Central teachings</div>
                      <div className="text-text-main text-sm">{detail.centralTeachings}</div>
                      <div className="text-azure uppercase tracking-wider text-[10px] pt-2">Deity concept</div>
                      <div className="text-text-main text-sm">{detail.deityConcept}</div>
                    </div>
                    {detail.controversialNote && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">{detail.controversialNote}</div>
                    )}
                    <div className="text-xs text-text-muted">Sources: {detail.sources.map((s) => s.label).join(", ")}</div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => { setTab("learn"); setLearnId(detail.id); }}><GraduationCap className="w-3.5 h-3.5 mr-1" /> Learn this</Button>
                      <Button size="sm" variant="outline" onClick={() => { setTab("compare"); setCompareIds(compareIds.includes(detail.id) ? compareIds : `${compareIds}, ${detail.id}`); }}><Scale className="w-3.5 h-3.5 mr-1" /> Compare</Button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-text-muted">No record selected.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Compare ─────────────────────────────────────────────────── */}
        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle>Religion comparison engine</CardTitle>
              <CardDescription>
                18 comparison categories — origin, founder, scriptures, god/divinity, creation, humanity, morality, worship, prayer, festivals, afterlife, salvation, authority, branches, history, distribution, similarities, differences. Values come only from each tradition's own record; WINDELS does not rank religions or judge which is true.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={compareIds} onChange={(e) => setCompareIds(e.target.value)} placeholder="record ids, comma-separated" />
                <Button onClick={runCompare} className="shrink-0"><Scale className="w-4 h-4 mr-1" /> Compare</Button>
              </div>
              <div className="text-xs text-text-muted flex flex-wrap gap-1.5">
                Presets:
                {[
                  ["rel.christianity, rel.islam", "Christianity vs Islam"],
                  ["rel.christianity, rel.judaism", "Christianity vs Judaism"],
                  ["rel.islam, rel.judaism", "Islam vs Judaism"],
                  ["rel.hinduism, rel.buddhism", "Hinduism vs Buddhism"],
                  ["rel.buddhism, rel.jainism", "Buddhism vs Jainism"],
                  ["ind.yoruba, rel.christianity", "Yoruba tradition vs Christianity"],
                  ["anc.egyptian, rel.christianity", "Ancient Egyptian vs Christianity"],
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
                        <th className="py-2 pr-3">Category</th>
                        {compare.items.map((it) => (
                          <th key={it.id} className="py-2 px-3">{it.name} <span className="block text-[10px] font-normal">{it.status}</span></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compare.rows.map((row) => (
                        <tr key={row.category} className="border-b border-white/5 align-top">
                          <td className="py-2 pr-3 text-azure font-medium whitespace-nowrap">{row.label}</td>
                          {row.values.map((v) => (
                            <td key={v.id} className="py-2 px-3 text-text-main">{v.text}</td>
                          ))}
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

        {/* ── Learn ───────────────────────────────────────────────────── */}
        <TabsContent value="learn">
          <Card>
            <CardHeader>
              <CardTitle>Learn at your level</CardTitle>
              <CardDescription>
                The same tradition rendered at four levels: beginner (simple explanations), intermediate, advanced (academic-level comparative religion) and research (sources, debates and open questions). The underlying knowledge never changes — only the presentation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={learnId} onChange={(e) => setLearnId(e.target.value)} placeholder="record id (e.g. rel.buddhism, ind.yoruba)" />
                <Select value={learnLevel} onChange={(e) => setLearnLevel(e.target.value as ReligionLevel)} className="w-40 shrink-0">
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
                <Button onClick={runTeach} className="shrink-0"><GraduationCap className="w-4 h-4 mr-1" /> Teach</Button>
              </div>
              {taught && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text-bright">{taught.name}</span>
                    <Badge>{taught.level}</Badge>
                    <ConfidenceBadge confidence={taught.confidence} />
                    {taught.names.indigenousNames.map((n, i) => (
                      <span key={i} className="text-xs text-azure">{n.name}</span>
                    ))}
                  </div>
                  <Sections sections={taught.sections} />
                  {taught.festivals.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <span className="text-[11px] uppercase tracking-wider text-azure/80 block mb-1">Festivals</span>
                      {taught.festivals.join(" · ")}
                    </div>
                  )}
                  {taught.researchNote && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-text-muted">
                      <Sparkles className="inline w-3.5 h-3.5 mr-1 text-azure" /> {taught.researchNote}
                    </div>
                  )}
                  <div className="text-xs text-text-muted">Sources: {taught.sources.map((s) => s.label).join(", ")} · last reviewed {taught.lastReviewed}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Expand ──────────────────────────────────────────────────── */}
        <TabsContent value="expand">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Ten-step expansion pipeline</CardTitle>
                <CardDescription>
                  Propose a documented tradition: identity and classification checks, source verification, duplicate detection against the catalog and pending submissions, related/branch mapping, confidence scoring (unverified by default) and the Super Admin approval gate. Aliases are mapped, never duplicated.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Name" />
                <div className="flex gap-2">
                  <Select value={subFamily} onChange={(e) => setSubFamily(e.target.value as ReligionFamily)}>
                    {meta?.families.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
                  </Select>
                  <Input value={subRegion} onChange={(e) => setSubRegion(e.target.value)} placeholder="Region" />
                </div>
                <Input value={subOrigin} onChange={(e) => setSubOrigin(e.target.value)} placeholder="Origin period (e.g. c. 1800)" />
                <Textarea value={subTeachings} onChange={(e) => setSubTeachings(e.target.value)} placeholder="Central teachings" rows={2} />
                <Textarea value={subDeity} onChange={(e) => setSubDeity(e.target.value)} placeholder="Concept of God/divinity" rows={2} />
                <Textarea value={subHistory} onChange={(e) => setSubHistory(e.target.value)} placeholder="Historical development" rows={2} />
                <Textarea value={subSummary} onChange={(e) => setSubSummary(e.target.value)} placeholder="Summary" rows={2} />
                <Textarea value={subSimple} onChange={(e) => setSubSimple(e.target.value)} placeholder="Simple explanation (beginner)" rows={2} />
                <Input value={subSource} onChange={(e) => setSubSource(e.target.value)} placeholder="SOURCE (required)" />
                <Button onClick={runSubmit}><Database className="w-4 h-4 mr-1" /> Submit for review</Button>
                {subMsg && <div className="text-xs text-text-muted">{subMsg}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Submissions ({subs.length})</CardTitle>
                <CardDescription>
                  Organization-scoped submissions with their automated check reports. Approval is Super Admin-only; approved records enter the shared knowledge base.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[520px] overflow-y-auto">
                {subs.length === 0 && <div className="text-sm text-text-muted">No submissions yet — propose a documented tradition on the left.</div>}
                {subs.map((s) => (
                  <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text-bright text-sm">{s.record.name}</span>
                        <Badge>{s.status.replace("_", " ")}</Badge>
                        <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40">{s.record.confidence}</Badge>
                      </div>
                      <div className="flex gap-1">
                        {isSuperAdmin && s.status === "pending_review" && (
                          <>
                            <Button size="sm" variant="success" onClick={() => runReview(s.id, "approved")}>Approve</Button>
                            <Button size="sm" variant="danger" onClick={() => runReview(s.id, "rejected")}>Reject</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeSub(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted">{s.record.region.join(", ")} · {s.record.originLabel} · {s.record.family}</p>
                    <div className="flex flex-wrap gap-1">
                      {s.checks.map((c) => (
                        <span key={c.step} title={c.note} className={`text-[10px] px-1.5 py-0.5 rounded ${c.passed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                          {c.passed ? "✓" : "✗"} {c.step.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                    {s.reviewNote && <div className="text-xs text-text-muted">{s.reviewNote}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Integrations (Session 142) ─────────────────────────────── */}
        <TabsContent value="integrations">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>§20 integration overview</CardTitle>
                <CardDescription>
                  The religion knowledge system is wired into the five remaining channels of WINDELS AI OS: Memory Fabric, AI agents, AI Training Center, Lecturer AI education and conversational teaching.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {integrationOverview ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge>catalog {integrationOverview.catalogVersion}</Badge>
                      <Badge>{integrationOverview.recordCount} records</Badge>
                      <Badge>{integrationOverview.extensionCount} extensions</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <MemoryStick className="w-4 h-4 text-azure" />
                      <span className="text-text-main">Memory Fabric: {integrationOverview.memory.synced ? `synced at ${integrationOverview.memory.lastSyncAt?.slice(0, 19).replace("T", " ")}` : "not synced yet"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-azure" />
                      <span className="text-text-main">Training Center dataset: {integrationOverview.trainingDataset.created ? `${integrationOverview.trainingDataset.datasetId} (${integrationOverview.trainingDataset.rows} rows)` : "not created yet"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-azure" />
                      <span className="text-text-main">Education courses: {integrationOverview.educationCourseCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessagesSquare className="w-4 h-4 text-azure" />
                      <span className="text-text-main">Chat surface: {integrationOverview.chatSurface}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-text-muted">Overview unavailable.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Memory Fabric</CardTitle>
                <CardDescription>Sync the curated catalog into the Enterprise Memory Fabric. The fabric deduplicates by content+scope, so re-syncs never create duplicates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={runMemSync}><MemoryStick className="w-4 h-4 mr-1" /> Sync religion knowledge to memory</Button>
                {memSyncMsg && <div className="text-xs text-text-muted">{memSyncMsg}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI agents</CardTitle>
                <CardDescription>Attach the religion catalog to an AI workforce agent as version-labelled SNIPPET knowledge. Re-attaching skips titles already present.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent id" />
                  <Button onClick={runAttach} className="shrink-0"><Bot className="w-4 h-4 mr-1" /> Attach</Button>
                </div>
                {agentMsg && <div className="text-xs text-text-muted">{agentMsg}</div>}
                {agentStatus && (
                  <div className="text-xs text-text-muted">
                    Attached: {agentStatus.attachedCount} records — {agentStatus.attachedTitles.slice(0, 6).join(", ")}{agentStatus.attachedTitles.length > 6 ? "…" : ""}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI Training Center</CardTitle>
                <CardDescription>Create a zero-synthetic, curated RAG dataset (JSONL) in the Session 60 training module — every row labelled with the catalog version as its source.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={runTraining}><Cpu className="w-4 h-4 mr-1" /> Create training dataset</Button>
                  <a href={religionTrainingExportUrl()} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-2 text-sm rounded-lg border border-white/20 text-slate-200 hover:bg-white/5">
                    <Download className="w-4 h-4 mr-1" /> Export JSONL
                  </a>
                </div>
                {trainMsg && <div className="text-xs text-text-muted">{trainMsg}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Education — Lecturer AI</CardTitle>
                <CardDescription>Hand any record to the real Lecturer AI: the curated record is the source material; the tutor adapts the lesson and grades practice questions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input value={learnId} onChange={(e) => setLearnId(e.target.value)} placeholder="record id (e.g. rel.buddhism)" />
                  <Select value={learnLevel} onChange={(e) => setLearnLevel(e.target.value as ReligionLevel)} className="w-36 shrink-0">
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                  <Button onClick={runLesson} className="shrink-0"><GraduationCap className="w-4 h-4 mr-1" /> Start lesson</Button>
                </div>
                {eduMsg && <div className="text-xs text-rose-300">{eduMsg}</div>}
                {eduLesson && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm space-y-1">
                    <div className="font-medium text-text-bright">{eduLesson.course?.name} — Lecturer session {eduLesson.lecturer.sessionId}</div>
                    <div className="text-text-main">{eduLesson.lecturer.text}</div>
                    {eduLesson.lecturer.question && (
                      <div className="text-xs text-text-muted">Q: {eduLesson.lecturer.question.stem}</div>
                    )}
                    <div className="text-xs text-text-muted">{eduLesson.note}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversational teaching</CardTitle>
                <CardDescription>A chat-ready teaching turn: intent classification, rendered sections, sources, the neutrality answer for truth claims, and follow-up suggestions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input value={chatQ} onChange={(e) => setChatQ(e.target.value)} placeholder="Ask about religions…" onKeyDown={(e) => e.key === "Enter" && runChat()} />
                  <Button onClick={runChat} className="shrink-0"><MessagesSquare className="w-4 h-4 mr-1" /> Ask</Button>
                </div>
                {chatTurn && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">intent: {chatTurn.intent.intent}</Badge>
                      <Badge>{chatTurn.mode}</Badge>
                      {chatTurn.confidence && <Badge>{chatTurn.confidence}</Badge>}
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-text-main whitespace-pre-wrap">{chatTurn.answer}</div>
                    {chatTurn.controversialNote && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">{chatTurn.controversialNote}</div>
                    )}
                    <div className="text-xs text-text-muted">
                      Sources: {chatTurn.sources.map((s) => s.label).join(", ") || "—"}
                      {chatTurn.followUp.length > 0 && <div className="mt-1">Try next: {chatTurn.followUp.join(" · ")}</div>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
