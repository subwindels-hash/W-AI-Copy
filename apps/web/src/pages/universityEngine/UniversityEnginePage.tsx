/**
 * Session 154 — WINDELS Universal University & Higher Education Engine
 * Console (/app/education-engine).
 *
 * Tabs:
 *   Explore  — the global academic catalog: domains → fields with career
 *              pathways, plus education-level groups and search.
 *   Advisor  — AI University Advisor: a career goal → matched fields,
 *              recommended pathway and career outcomes.
 *   Program  — deterministic program + course generation for a field at a
 *              degree level, and a semester-by-semester study plan.
 *   Universities — the global university directory + country education
 *              profiles.
 *   Learn    — teach any field or course through the real Lecturer AI
 *              (honest fallback surfaced when no AI provider is configured).
 *   Research — research & thesis guidance for a field, plus academic
 *              intelligence answers.
 *
 * Honest UI rules:
 *   - programs/courses/plans are deterministic generation from curated
 *     field data, framed as guidance, not official curricula.
 *   - teaching sessions surface modelSource/warnings honestly.
 *   - the advisor's rationale is shown alongside the pathway.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Compass, GraduationCap, BookOpen, Globe2, Sparkles, FlaskConical,
  Search, Play, Loader2, AlertTriangle, Landmark, Building2, ListOrdered, Brain,
} from "lucide-react";
import {
  adviseEngine,
  createEngineStudyPlan,
  engineInsight,
  getEngineEducationLevels,
  getEngineField,
  getEngineProgram,
  getEngineProgramCourses,
  getEngineResearch,
  getEngineUniversity,
  listEngineCountries,
  listEngineDomains,
  listEngineUniversities,
  searchEngineCatalog,
  teachEngine,
  type AcademicDomain,
  type AdvisorRecommendation,
  type EducationLevel,
  type EducationLevelGroup,
  type ResearchGuidance,
  type StudyPlan,
  type TeachTurn,
  type UniversityRecord,
} from "@/lib/universityEngine";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";

const LEVEL_COLOR: Record<string, string> = {
  undergraduate_certificate: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  undergraduate_diploma: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  associate_degree: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  bachelor: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  postgraduate_diploma: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  master: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  professional_master: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  phd: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  professional_doctorate: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  doctor_of_education: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  doctor_of_business_administration: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  other_doctoral: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  postdoctoral: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  professional_certification: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  continuing_education: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  executive_education: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

const LEVEL_LABEL: Record<string, string> = {
  undergraduate_certificate: "Undergrad Cert.", undergraduate_diploma: "Undergrad Dip.", associate_degree: "Associate",
  bachelor: "Bachelor", postgraduate_diploma: "PG Diploma", master: "Master", professional_master: "Prof. Master",
  phd: "PhD", professional_doctorate: "Prof. Doctorate", doctor_of_education: "Ed.D", doctor_of_business_administration: "D.B.A",
  other_doctoral: "Doctoral", postdoctoral: "Postdoc", professional_certification: "Certification", continuing_education: "Continuing Ed", executive_education: "Exec. Ed",
};

export function UniversityEnginePage() {
  const [domains, setDomains] = useState<AcademicDomain[]>([]);
  const [levels, setLevels] = useState<EducationLevelGroup[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchEngineCatalog>>>([]);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  // Advisor
  const [goal, setGoal] = useState("");
  const [advice, setAdvice] = useState<AdvisorRecommendation | null>(null);
  const [advising, setAdvising] = useState(false);

  // Program / study plan
  const [programField, setProgramField] = useState("computer-science");
  const [programLevel, setProgramLevel] = useState<EducationLevel>("bachelor");
  const [program, setProgram] = useState<Awaited<ReturnType<typeof getEngineProgram>> | null>(null);
  const [courses, setCourses] = useState<Awaited<ReturnType<typeof getEngineProgramCourses>>>([]);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [planYears, setPlanYears] = useState(4);

  // Universities
  const [unis, setUnis] = useState<UniversityRecord[]>([]);
  const [countries, setCountries] = useState<Awaited<ReturnType<typeof listEngineCountries>>>([]);
  const [countryFilter, setCountryFilter] = useState("");

  // Learn
  const [teachField, setTeachField] = useState("computer-science");
  const [teachLevel, setTeachLevel] = useState<EducationLevel>("bachelor");
  const [teachTitle, setTeachTitle] = useState("");
  const [session, setSession] = useState<TeachTurn | null>(null);
  const [teaching, setTeaching] = useState(false);

  // Research / insight
  const [researchField, setResearchField] = useState("computer-science");
  const [research, setResearch] = useState<ResearchGuidance | null>(null);
  const [insightQ, setInsightQ] = useState("");
  const [insight, setInsight] = useState<Awaited<ReturnType<typeof engineInsight>> | null>(null);

  const load = useCallback(async () => {
    const [d, l, u, c] = await Promise.all([listEngineDomains(), getEngineEducationLevels(), listEngineUniversities(), listEngineCountries()]);
    setDomains(d);
    setLevels(l);
    setUnis(u);
    setCountries(c);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setHits([]); return; }
    setHits(await searchEngineCatalog(q));
  }, []);

  useEffect(() => {
    void runSearch(searchQ);
  }, [searchQ, runSearch]);

  const loadProgram = useCallback(async (field: string, level: EducationLevel) => {
    const [p, cs] = await Promise.all([getEngineProgram(field, level), getEngineProgramCourses(field, level)]);
    setProgram(p);
    setCourses(cs);
  }, []);

  useEffect(() => {
    void loadProgram(programField, programLevel);
  }, [programField, programLevel, loadProgram]);

  const loadPlan = useCallback(async (field: string, level: EducationLevel, years: number) => {
    setPlan(await createEngineStudyPlan(field, level, years));
  }, []);

  const runAdvise = async () => {
    if (!goal.trim()) return;
    setAdvising(true);
    try {
      setAdvice(await adviseEngine(goal));
    } finally {
      setAdvising(false);
    }
  };

  const runTeach = async () => {
    setTeaching(true);
    try {
      const input = teachTitle.trim() ? { title: teachTitle.trim(), level: teachLevel } : { field: teachField, level: teachLevel };
      setSession(await teachEngine(input));
    } finally {
      setTeaching(false);
    }
  };

  const runResearch = useCallback(async (field: string) => {
    setResearch(await getEngineResearch(field));
  }, []);

  useEffect(() => {
    void runResearch(researchField);
  }, [researchField, runResearch]);

  const runInsight = async () => {
    if (!insightQ.trim()) return;
    setInsight(await engineInsight(insightQ));
  };

  const openField = async (fieldId: string) => {
    const f = await getEngineField(fieldId);
    setProgramField(f.id);
  };

  const levelOptions = levels.flatMap((g) => g.levels);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Universal University & Higher Education Engine</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {domains.length} academic domains · {levelOptions.length} education levels · {unis.length} universities worldwide.
          Understand → Choose → Learn → Research → Graduate. Programs and plans are deterministic generation from curated
          field data — guidance, not official curricula.
        </p>
      </div>

      <Tabs defaultValue="explore">
        <TabsList>
          <TabsTrigger value="explore"><Compass className="mr-1.5 h-4 w-4" />Explore</TabsTrigger>
          <TabsTrigger value="advisor"><Brain className="mr-1.5 h-4 w-4" />Advisor</TabsTrigger>
          <TabsTrigger value="program"><GraduationCap className="mr-1.5 h-4 w-4" />Program & Plan</TabsTrigger>
          <TabsTrigger value="universities"><Globe2 className="mr-1.5 h-4 w-4" />Universities</TabsTrigger>
          <TabsTrigger value="learn"><BookOpen className="mr-1.5 h-4 w-4" />Learn</TabsTrigger>
          <TabsTrigger value="research"><FlaskConical className="mr-1.5 h-4 w-4" />Research</TabsTrigger>
        </TabsList>

        <TabsContent value="explore" className="space-y-4">
          <div className="flex items-center gap-3">
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search domains, fields, careers… e.g. robotics, data scientist" className="w-96" />
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          {hits.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {hits.map((h) => (
                <button key={h.kind + h.id} type="button" onClick={() => h.kind === "field" ? openField(h.id) : setExpandedDomain(h.id)} className="text-left">
                  <Card className="border-slate-800 bg-slate-900/60 hover:border-violet-500/50">
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{h.name}</p>
                        <p className="text-xs text-slate-500">{h.domainName}</p>
                      </div>
                      <Badge className="bg-slate-700/40 text-slate-300">{h.kind}</Badge>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {domains.map((d) => (
                <Card key={d.id} className="border-slate-800 bg-slate-900/60">
                  <CardHeader className="pb-2">
                    <button type="button" onClick={() => setExpandedDomain(expandedDomain === d.id ? null : d.id)} className="flex w-full items-center justify-between text-left">
                      <CardTitle className="text-sm font-semibold text-slate-100">{d.name}</CardTitle>
                      <Badge className="bg-slate-700/40 text-slate-300">{d.fields.length} fields</Badge>
                    </button>
                  </CardHeader>
                  {expandedDomain === d.id ? (
                    <CardContent className="grid gap-2 lg:grid-cols-2">
                      {d.fields.map((f) => (
                        <button key={f.id} type="button" onClick={() => openField(f.id)} className="text-left">
                          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-2.5 hover:border-violet-500/50">
                            <p className="text-sm font-medium text-slate-200">{f.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{f.description}</p>
                            <p className="mt-1 text-[10px] text-slate-600">Careers: {f.careers.slice(0, 3).join(" · ")}</p>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {levels.map((g) => (
              <span key={g.group} className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
                {g.label} ({g.levels.length})
              </span>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="advisor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI University Advisor</CardTitle>
              <CardDescription>
                Tell WINDELS your career goal and it will match the closest academic fields and build a recommended
                degree pathway — with the matching rationale shown, not hidden.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. I want to become an AI engineer and build machine learning systems" rows={2} />
              <Button onClick={() => void runAdvise()} disabled={advising || !goal.trim()}>
                {advising ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                Get my pathway
              </Button>
            </CardContent>
          </Card>
          {advice ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm">Recommended pathway</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {advice.recommendedPathway.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">{i + 1}</span>
                      <div>
                        <p className="text-slate-200"><Badge className={LEVEL_COLOR[p.degreeLevel] ?? ""}>{LEVEL_LABEL[p.degreeLevel] ?? p.degreeLevel}</Badge> {p.programTitle}</p>
                        <p className="text-slate-500">Award: {p.award}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <div className="space-y-3">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Matched fields</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {advice.matchedFields.map((m) => (
                      <p key={m.fieldId} className="text-xs text-slate-300">{m.fieldName} <span className="text-slate-600">({m.domainName} · score {m.score})</span></p>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">Career outcomes</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {advice.careerOutcomes.map((c) => <Badge key={c} className="bg-slate-700/40 text-slate-300">{c}</Badge>)}
                  </CardContent>
                </Card>
                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">{advice.rationale}</div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="program" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={programField} onChange={(e) => setProgramField(e.target.value)} className="w-64">
              {domains.flatMap((d) => d.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>))}
            </Select>
            <Select value={programLevel} onChange={(e) => setProgramLevel(e.target.value as EducationLevel)} className="w-44">
              {levelOptions.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadPlan(programField, programLevel, planYears)}>
              <ListOrdered className="mr-1.5 h-3.5 w-3.5" />Generate {planYears}-year plan
            </Button>
            <Select value={String(planYears)} onChange={(e) => setPlanYears(Number(e.target.value))} className="w-28">
              {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y} years</option>)}
            </Select>
          </div>
          {program ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-slate-100"><GraduationCap className="h-4 w-4 text-violet-400" />{program.title}</CardTitle>
                  <CardDescription className="text-xs">Award: {program.award} · Total credits: {program.totalCredits || "research"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {program.coreModules.map((m, i) => {
                    const c = courses[i];
                    return (
                      <div key={i} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs">
                        <span className="text-slate-200">{m}</span>
                        {c ? <span className="font-mono text-violet-300">{c.code}</span> : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              {plan ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">{plan.goal} · {plan.years} years · {plan.totalCredits} credits</p>
                  {plan.semesters.map((s) => (
                    <Card key={s.semester} className="border-slate-800 bg-slate-900/60">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-xs text-slate-200">{s.label} · {s.totalCredits} credits</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-1.5">
                        {s.courses.map((c, i) => (
                          <span key={i} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
                            <span className="font-mono text-violet-300">{c.code}</span> {c.title}
                          </span>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
          ) : <p className="text-sm text-slate-500">Loading program…</p>}
        </TabsContent>

        <TabsContent value="universities" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={countryFilter} onChange={(e) => {
              setCountryFilter(e.target.value);
              void listEngineUniversities(e.target.value || undefined).then(setUnis);
            }} className="w-44">
              <option value="">All countries</option>
              {countries.map((c) => <option key={c.country} value={c.country}>{c.country} — {c.name}</option>)}
            </Select>
            <span className="text-xs text-slate-500">{unis.length} universities</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {unis.slice(0, 60).map((u) => (
              <Card key={u.id} className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-1">
                  <CardTitle className="flex items-center gap-2 text-sm text-slate-100"><Landmark className="h-4 w-4 text-sky-400" />{u.name}</CardTitle>
                  <CardDescription className="text-xs">{u.city}, {u.country}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-slate-400">
                  <p>{u.type.replace(/_/g, " ")} · {u.founded ? `Founded ${u.founded}` : "Founded year n/a"}</p>
                  {u.notes?.[0] ? <p className="mt-1 text-slate-500">{u.notes[0]}</p> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="learn" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Teach me — Lecturer AI</CardTitle>
              <CardDescription>
                Pick a field (at any level) or type a course title, and the real Lecturer AI starts an adaptive
                tutoring session. Without an AI provider key the structured fallback is used and disclosed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={teachField} onChange={(e) => setTeachField(e.target.value)} className="w-64">
                  {domains.flatMap((d) => d.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>))}
                </Select>
                <Select value={teachLevel} onChange={(e) => setTeachLevel(e.target.value as EducationLevel)} className="w-44">
                  {levelOptions.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </Select>
              </div>
              <Input value={teachTitle} onChange={(e) => setTeachTitle(e.target.value)} placeholder="…or type any course title to teach" className="w-96" />
              <Button onClick={() => void runTeach()} disabled={teaching}>
                {teaching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                Start teaching session
              </Button>
            </CardContent>
          </Card>
          {session ? (
            <Card className="border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-violet-200"><Sparkles className="h-4 w-4" /> {session.topic}</CardTitle>
                <CardDescription className="text-xs">
                  Session {session.turn.sessionId} · {session.turn.stage} · {session.turn.modelSource === "real" ? "live Lecturer AI" : "structured demo fallback"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {session.turn.question ? <p className="text-slate-200">{session.turn.question}</p> : null}
                {session.turn.warnings?.length ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{session.turn.warnings[0]}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="research" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={researchField} onChange={(e) => setResearchField(e.target.value)} className="w-64">
              {domains.flatMap((d) => d.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>))}
            </Select>
            <Input value={insightQ} onChange={(e) => setInsightQ(e.target.value)} placeholder="Ask: what courses do I need to study computer science?" className="w-96" onKeyDown={(e) => e.key === "Enter" && runInsight()} />
            <Button variant="outline" size="sm" onClick={() => void runInsight()}><Search className="mr-1.5 h-3.5 w-3.5" />Ask</Button>
          </div>
          {insight ? (
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-100"><Brain className="h-4 w-4 text-violet-400" />{insight.question}</CardTitle>
                <CardDescription className="text-xs">Category: {insight.category}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-slate-300">{insight.answer}</p>
                {insight.related.length ? <div className="flex flex-wrap gap-1.5">{insight.related.map((r) => <Badge key={r} className="bg-slate-700/40 text-slate-300">{r}</Badge>)}</div> : null}
              </CardContent>
            </Card>
          ) : null}
          {research ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm">Suggested research topics</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  {research.suggestedTopics.map((t, i) => <p key={i} className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300">{t}</p>)}
                </CardContent>
              </Card>
              <div className="space-y-3">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Methodologies</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {research.methodologies.map((m) => (
                      <div key={m.name} className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs">
                        <p className="font-semibold text-slate-200">{m.name}</p>
                        <p className="text-slate-400">{m.description}</p>
                        <p className="text-slate-600">Use when: {m.when}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">Thesis stages</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {research.thesisStages.map((s, i) => <Badge key={i} className="bg-slate-700/40 text-slate-300">{i + 1}. {s}</Badge>)}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : <p className="text-sm text-slate-500">Loading research guidance…</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
