/**
 * Session 150 — Life Operating Principles Engine Console (/app/life-principles).
 *
 * Tabs:
 *   Today    — Daily Rules Mode: TODAY'S RULE / WHY IT MATTERS / HOW TO
 *              APPLY IT / TODAY'S ACTION / REFLECTION QUESTION, with a date
 *              picker (deterministic per date).
 *   Ask      — the Life Coaching Engine: "What are the rules of life?"
 *              returns the 13-area menu; any specific question is classified
 *              into an area and the most relevant principles are returned.
 *   Rules    — the 115-rule catalog grouped by the 10 parts, with
 *              deterministic search and rule detail.
 *   Decision — the Decision Mode framework: 10 questions + mapped
 *              principles. WINDELS never decides for the user.
 *   Philosophy — the 12 "X without Y" balance pairs and the 10-step WINDELS
 *              Principle.
 *
 * Honest UI rules:
 *   - every rule is framed as a practical principle, not an absolute law;
 *   - considerations notes render alongside rules that carry them;
 *   - the decision tab presents a thinking framework, never a verdict.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, Compass, ScrollText, Scale, Sparkles, Search, Send,
  Lightbulb, Quote, CheckCircle2, AlertTriangle, ListOrdered, BookOpen, RefreshCw,
} from "lucide-react";
import {
  askLifePrinciples,
  getLifeDailyRule,
  getLifePhilosophy,
  getLifePrinciple,
  getLifePrinciplesCatalogMeta,
  getLifePrinciplesIntegrity,
  listLifeAreas,
  listLifeRuleParts,
  listLifeRules,
  runLifeDecision,
  searchLifeRules,
  type LifeAskResponse,
  type LifeCoachingAreaView,
  type LifeDailyRuleView,
  type LifeDecisionView,
  type LifePhilosophyPair,
  type LifePrinciplesCatalogMeta,
  type LifeRulePartView,
  type LifeRuleView,
} from "@/lib/lifePrinciples";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";

const PART_BADGE_COLOR: Record<string, string> = {
  mindset_self_control: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  discipline_daily_life: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  knowledge_skills: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  money_financial_freedom: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  privacy_strategy_boundaries: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  unstoppable: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  relationships: "bg-pink-500/20 text-pink-300 border-pink-500/40",
  business_work: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  digital_life: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  character: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
};

function RuleCard({ rule }: { rule: LifeRuleView }) {
  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-100">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-300">{rule.number}</span>
            {rule.title}
          </CardTitle>
          <Badge className={PART_BADGE_COLOR[rule.part] ?? "bg-slate-700/40 text-slate-300 border-slate-600/50"}>{rule.part.replace(/_/g, " ")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="italic text-slate-200">“{rule.principle}”</p>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</p>
          <p className="text-slate-300">{rule.whyItMatters}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">How to apply</p>
          <p className="text-slate-300">{rule.howToApply}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reflection</p>
          <p className="text-slate-300">{rule.reflectionQuestion}</p>
        </div>
        {rule.considerations ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{rule.considerations}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LifePrinciplesPage() {
  const [meta, setMeta] = useState<LifePrinciplesCatalogMeta | null>(null);
  const [parts, setParts] = useState<LifeRulePartView[]>([]);
  const [areas, setAreas] = useState<LifeCoachingAreaView[]>([]);
  const [integrity, setIntegrity] = useState<{ ok: boolean; issues: string[] } | null>(null);

  // Daily mode
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daily, setDaily] = useState<LifeDailyRuleView | null>(null);

  // Ask (coaching)
  const [question, setQuestion] = useState("");
  const [askResult, setAskResult] = useState<LifeAskResponse | null>(null);
  const [asking, setAsking] = useState(false);

  // Rules catalog
  const [rulePart, setRulePart] = useState("all");
  const [rules, setRules] = useState<LifeRuleView[]>([]);
  const [ruleQuery, setRuleQuery] = useState("");

  // Decision mode
  const [situation, setSituation] = useState("");
  const [decision, setDecision] = useState<LifeDecisionView | null>(null);

  // Philosophy
  const [philosophy, setPhilosophy] = useState<LifePhilosophyPair[]>([]);
  const [principle, setPrinciple] = useState<{ steps: string[]; note: string } | null>(null);

  const loadMeta = useCallback(async () => {
    const [m, p, a, i] = await Promise.all([
      getLifePrinciplesCatalogMeta(),
      listLifeRuleParts(),
      listLifeAreas(),
      getLifePrinciplesIntegrity(),
    ]);
    setMeta(m);
    setParts(p);
    setAreas(a);
    setIntegrity(i);
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const loadDaily = useCallback(async (date: string) => {
    const d = await getLifeDailyRule({ date });
    setDaily(d);
  }, []);

  useEffect(() => {
    void loadDaily(dailyDate);
  }, [dailyDate, loadDaily]);

  const loadRules = useCallback(async (part: string, q: string) => {
    if (q.trim().length > 0) {
      const found = await searchLifeRules(q, part === "all" ? undefined : { part });
      setRules(found);
    } else {
      const all = await listLifeRules(part === "all" ? { limit: 115 } : { part, limit: 115 });
      setRules(all);
    }
  }, []);

  useEffect(() => {
    void loadRules(rulePart, ruleQuery);
  }, [rulePart, ruleQuery, loadRules]);

  const runAsk = async () => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      setAskResult(await askLifePrinciples(question));
    } finally {
      setAsking(false);
    }
  };

  const runDecision = async () => {
    if (!situation.trim()) return;
    setDecision(await runLifeDecision(situation));
  };

  const loadPhilosophy = useCallback(async () => {
    const [ph, pr] = await Promise.all([getLifePhilosophy(), getLifePrinciple()]);
    setPhilosophy(ph);
    setPrinciple(pr);
  }, []);

  useEffect(() => {
    void loadPhilosophy();
  }, [loadPhilosophy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Rules of Life</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Life Operating Principles Engine — {meta?.ruleCount ?? 115} practical life principles across{" "}
          {meta?.partCount ?? 10} parts, a Life Coaching Engine over {meta?.areaCount ?? 13} areas,
          Daily Rules Mode, Decision Mode and the balance philosophy.
          {integrity?.ok === false ? (
            <span className="ml-2 text-rose-400">integrity: {integrity.issues.length} issues</span>
          ) : null}
        </p>
        {meta ? (
          <p className="mt-2 max-w-3xl rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">{meta.note}</p>
        ) : null}
      </div>

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today"><CalendarDays className="mr-1.5 h-4 w-4" />Today's Rule</TabsTrigger>
          <TabsTrigger value="ask"><Sparkles className="mr-1.5 h-4 w-4" />Ask</TabsTrigger>
          <TabsTrigger value="rules"><BookOpen className="mr-1.5 h-4 w-4" />All 115 Rules</TabsTrigger>
          <TabsTrigger value="decision"><Scale className="mr-1.5 h-4 w-4" />Decision Mode</TabsTrigger>
          <TabsTrigger value="philosophy"><Compass className="mr-1.5 h-4 w-4" />Philosophy</TabsTrigger>
        </TabsList>

        {/* ── Daily Rules Mode ─────────────────────────────────────────── */}
        <TabsContent value="today" className="space-y-4">
          <div className="flex items-center gap-3">
            <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-44" />
            <Button variant="outline" size="sm" onClick={() => void loadDaily(dailyDate)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh
            </Button>
          </div>
          {daily ? (
            <div className="space-y-3">
              <Card className="border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-violet-200">
                    <Lightbulb className="h-4 w-4" /> TODAY'S RULE — Rule {daily.ruleNumber}: {daily.rule.title}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">for {daily.date}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p className="text-lg font-medium italic text-slate-100">“{daily.todayRule}”</p>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</p>
                    <p className="text-slate-300">{daily.whyItMatters}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">How to apply it</p>
                    <p className="text-slate-300">{daily.howToApply}</p>
                  </div>
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">Today's action</p>
                    <p className="text-emerald-100">{daily.todayAction}</p>
                  </div>
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-300">Reflection question</p>
                    <p className="italic text-sky-100">{daily.reflectionQuestion}</p>
                  </div>
                  <p className="text-xs text-slate-500">{daily.note}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading today's rule…</p>
          )}
        </TabsContent>

        {/* ── Life Coaching Engine ─────────────────────────────────────── */}
        <TabsContent value="ask" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ask WINDELS about life principles</CardTitle>
              <CardDescription>
                Ask "What are the rules of life?" for the area menu, or ask a specific question
                (money, relationships, discipline, career, health, decisions…) and the coaching
                engine will bring the most relevant principles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. How do I save money? · My marriage is going through a hard time · How do I stay focused?"
                rows={2}
              />
              <Button onClick={() => void runAsk()} disabled={asking || !question.trim()}>
                <Send className="mr-1.5 h-4 w-4" />{asking ? "Thinking…" : "Ask"}
              </Button>
            </CardContent>
          </Card>

          {askResult?.general ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">{askResult.note}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {askResult.areas?.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setQuestion(`Give me principles about ${a.label.toLowerCase()}`); void askLifePrinciples(`Give me principles about ${a.label.toLowerCase()}`).then(setAskResult); }}
                    className="rounded-md border border-slate-700 bg-slate-900/60 p-3 text-left hover:border-violet-500/50"
                  >
                    <p className="text-sm font-semibold text-slate-200">{a.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{a.description}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{a.ruleCount} principles</p>
                  </button>
                ))}
              </div>
            </div>
          ) : askResult?.rules ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40">{askResult.area?.label}</Badge>
                {askResult.classification?.matchedKeywords.length ? (
                  <span className="text-xs text-slate-500">matched: {askResult.classification.matchedKeywords.join(", ")}</span>
                ) : null}
              </div>
              {askResult.rules.map((r) => <RuleCard key={r.number} rule={r} />)}
              <p className="text-xs text-slate-500">{askResult.note}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setQuestion(`Give me principles about ${a.label.toLowerCase()}`); void askLifePrinciples(`Give me principles about ${a.label.toLowerCase()}`).then(setAskResult); }}
                className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300 hover:border-violet-500/50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </TabsContent>

        {/* ── The 115 rules ────────────────────────────────────────────── */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={rulePart} onChange={(e) => setRulePart(e.target.value)} className="w-64">
              <option value="all">All parts</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.ruleCount})</option>
              ))}
            </Select>
            <Input
              value={ruleQuery}
              onChange={(e) => setRuleQuery(e.target.value)}
              placeholder="Search principles… e.g. password, trust, debt"
              className="w-72"
            />
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {rules.map((r) => <RuleCard key={r.number} rule={r} />)}
          </div>
          {rules.length === 0 ? <p className="text-sm text-slate-500">No rules match.</p> : null}
        </TabsContent>

        {/* ── Decision Mode ────────────────────────────────────────────── */}
        <TabsContent value="decision" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decision Mode</CardTitle>
              <CardDescription>
                Facing a difficult decision? WINDELS does not decide for you — it walks you through
                the ten questions of the framework and maps the relevant principles so you can
                think better and decide with your own judgment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="e.g. Should I leave my job to start a business?"
                rows={2}
              />
              <Button onClick={() => void runDecision()} disabled={!situation.trim()}>
                <ListOrdered className="mr-1.5 h-4 w-4" />Build the framework
              </Button>
            </CardContent>
          </Card>

          {decision ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">The ten questions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {decision.framework.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-sm text-slate-200">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{i + 1}. {q}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <div className="space-y-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Principles that apply</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {decision.relevantPrinciples.map((p) => (
                      <div key={p.number} className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-slate-300">
                        <span className="mr-1.5 font-semibold text-violet-300">Rule {p.number}: {p.title}</span>
                        <span className="text-slate-400">— {p.principle}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{decision.note}</span>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* ── Philosophy ───────────────────────────────────────────────── */}
        <TabsContent value="philosophy" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {philosophy.map((p) => (
              <Card key={p.id} className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                    <Quote className="h-4 w-4 text-violet-400" />{p.phrase}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p className="text-slate-400">{p.meaning}</p>
                  <p className="italic text-slate-300">{p.guidance}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {principle ? (
            <Card className="border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-violet-200">
                  <ScrollText className="h-4 w-4" /> The WINDELS Principle
                </CardTitle>
                <CardDescription className="text-xs">{principle.note}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-2 sm:grid-cols-2">
                  {principle.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs text-violet-300">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
