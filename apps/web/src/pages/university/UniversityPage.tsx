/**
 * Session 153 — University Education Console (/app/university).
 *
 * Tabs:
 *   Overview — faculties, degree levels (Bachelor/Master/Doctorate),
 *              research areas and course counts.
 *   Courses  — the full course catalog with per-faculty filtering, degree
 *              level filter and keyword search.
 *   Degree Plan — the per-faculty degree roadmap: courses ordered by
 *              degree level → term, with prerequisite status, honest
 *              mastery, and exactly one next-recommended course.
 *   Progress — per-course mastery across the university.
 *   Learn    — start a Lecturer AI session on any course (honest fallback
 *              surfaced when no AI provider is configured).
 *
 * Honest UI rules:
 *   - never-started courses show "Not started" (null mastery), never 0%.
 *   - the degree plan marks exactly one next-recommended course.
 *   - session starts surface modelSource/warnings honestly.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  GraduationCap, BookOpen, Route, BarChart3, Play, Loader2, Search,
  Landmark, CheckCircle2, Lock, Sparkles, AlertTriangle, Building2,
} from "lucide-react";
import {
  getFacultyCourses,
  getUniversityCatalog,
  getUniversityCourse,
  getUniversityDegreePlan,
  getUniversityOverview,
  getUniversityProgress,
  listUniversityFaculties,
  searchUniversityCourses,
  startUniversityCourse,
  type UniversityCatalogView,
  type UniversityCourse,
  type UniversityDegreeLevel,
  type UniversityDegreePlan,
  type UniversityFaculty,
  type UniversityOverview,
} from "@/lib/university";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const LEVEL_COLOR: Record<string, string> = {
  bachelor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  master: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  doctor: "bg-violet-500/20 text-violet-300 border-violet-500/40",
};

const LEVEL_LABEL: Record<string, string> = {
  bachelor: "Bachelor",
  master: "Master",
  doctor: "Doctorate",
};

export function UniversityPage() {
  const [overview, setOverview] = useState<UniversityOverview | null>(null);
  const [catalog, setCatalog] = useState<UniversityCatalogView | null>(null);
  const [faculties, setFaculties] = useState<UniversityFaculty[]>([]);
  const [facultyFilter, setFacultyFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [courses, setCourses] = useState<UniversityCourse[]>([]);
  const [plan, setPlan] = useState<UniversityDegreePlan | null>(null);
  const [planFaculty, setPlanFaculty] = useState("");
  const [progress, setProgress] = useState<Array<{ courseId: string; code: string; title: string; level: UniversityDegreeLevel; masteryPct: number | null; started: boolean; completed: boolean }>>([]);
  const [session, setSession] = useState<{ courseId: string; sessionId: string; stage: string; question?: string; modelSource: string; warnings?: string[] } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ov, cat, fac] = await Promise.all([getUniversityOverview(), getUniversityCatalog(), listUniversityFaculties()]);
    setOverview(ov);
    setCatalog(cat);
    setFaculties(fac);
    setPlanFaculty(fac[0]?.id ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCourses = useCallback(async (faculty: string, level: string, q: string) => {
    if (q.trim()) {
      setCourses(await searchUniversityCourses(q));
      return;
    }
    if (faculty !== "all") {
      setCourses(await getFacultyCourses(faculty, level === "all" ? undefined : (level as UniversityDegreeLevel)));
    } else if (catalog) {
      setCourses(level === "all" ? catalog.courses : catalog.courses.filter((c) => c.level === level));
    }
  }, [catalog]);

  useEffect(() => {
    void loadCourses(facultyFilter, levelFilter, searchQ);
  }, [facultyFilter, levelFilter, searchQ, loadCourses]);

  const loadPlan = useCallback(async (facultyId: string) => {
    if (!facultyId) return;
    setPlan(await getUniversityDegreePlan(facultyId));
  }, []);

  useEffect(() => {
    void loadPlan(planFaculty);
  }, [planFaculty, loadPlan]);

  useEffect(() => {
    void getUniversityProgress().then((p) => setProgress(p));
  }, []);

  const runStart = async (course: UniversityCourse) => {
    setStarting(course.id);
    try {
      const res = await startUniversityCourse(course.id);
      setSession({ courseId: course.id, sessionId: res.turn.sessionId, stage: res.turn.stage, question: res.turn.question, modelSource: res.turn.modelSource, warnings: res.turn.warnings });
    } finally {
      setStarting(null);
    }
  };

  const openCourse = async (courseId: string) => {
    const c = await getUniversityCourse(courseId);
    setSession({ courseId: c.id, sessionId: "", stage: "catalog", question: c.description, modelSource: "catalog" });
  };

  const progressByCourse = new Map(progress.map((p) => [p.courseId, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">University Education</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {overview?.coursesCount ?? "…"} courses across {overview?.facultiesCount ?? "…"} faculties,
          taught by the Lecturer AI at Bachelor, Master and Doctorate level. Progress derives from real
          lecturer mastery — never-started courses are reported as not started, never as 0%.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><Building2 className="mr-1.5 h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="courses"><BookOpen className="mr-1.5 h-4 w-4" />Courses</TabsTrigger>
          <TabsTrigger value="plan"><Route className="mr-1.5 h-4 w-4" />Degree Plan</TabsTrigger>
          <TabsTrigger value="progress"><BarChart3 className="mr-1.5 h-4 w-4" />Progress</TabsTrigger>
          <TabsTrigger value="learn"><Play className="mr-1.5 h-4 w-4" />Learn</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {overview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-2xl">{overview.facultiesCount}</CardTitle><CardDescription>Faculties</CardDescription></CardHeader></Card>
                <Card><CardHeader><CardTitle className="text-2xl">{overview.coursesCount}</CardTitle><CardDescription>Courses</CardDescription></CardHeader></Card>
                <Card><CardHeader><CardTitle className="text-2xl">{overview.researchAreasCount}</CardTitle><CardDescription>Research areas</CardDescription></CardHeader></Card>
              </div>
              <div className="flex gap-2">
                {overview.degreesOffered.map((l) => <Badge key={l} className={LEVEL_COLOR[l] ?? ""}>{LEVEL_LABEL[l]}</Badge>)}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {overview.faculties.map((f) => (
                  <Card key={f.id} className="border-slate-800 bg-slate-900/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                        <Landmark className="h-4 w-4 text-violet-400" /> {f.name}
                      </CardTitle>
                      <CardDescription className="text-xs">Awards: {Object.values(f.awards).join(" · ")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <p className="text-slate-400">{f.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {f.researchAreas.slice(0, 6).map((r) => (
                          <span key={r} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">{r}</span>
                        ))}
                        {f.researchAreas.length > 6 ? <span className="text-[10px] text-slate-600">+{f.researchAreas.length - 6} more</span> : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-slate-500">Loading overview…</p>}
        </TabsContent>

        <TabsContent value="courses" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)} className="w-72">
              <option value="all">All faculties</option>
              {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="w-40">
              <option value="all">All levels</option>
              <option value="bachelor">Bachelor</option>
              <option value="master">Master</option>
              <option value="doctor">Doctorate</option>
            </Select>
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search title, code, department…" className="w-64" />
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Faculty</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Credits</th>
                  <th className="px-3 py-2">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {courses.map((c) => (
                  <tr key={c.id} className="bg-slate-900/40 hover:bg-slate-900/70">
                    <td className="px-3 py-2 font-mono text-xs text-violet-300">{c.code}</td>
                    <td className="px-3 py-2 text-slate-200">{c.title}</td>
                    <td className="px-3 py-2 text-slate-400">{faculties.find((f) => f.id === c.faculty)?.shortName ?? c.faculty}</td>
                    <td className="px-3 py-2"><Badge className={LEVEL_COLOR[c.level] ?? ""}>{LEVEL_LABEL[c.level]}</Badge></td>
                    <td className="px-3 py-2 text-slate-300">{c.credits}</td>
                    <td className="px-3 py-2 text-slate-400">{c.term ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {courses.length === 0 ? <p className="text-sm text-slate-500">No courses match.</p> : null}
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={planFaculty} onChange={(e) => setPlanFaculty(e.target.value)} className="w-72">
              {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <span className="text-xs text-slate-500">Degree roadmap: exactly one next-recommended course.</span>
          </div>
          {plan ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">{plan.facultyName} — {plan.levels.map((l) => LEVEL_LABEL[l]).join(" → ")}</p>
              <div className="grid gap-2 lg:grid-cols-2">
                {plan.courses.map((n) => (
                  <Card key={n.courseId} className="border-slate-800 bg-slate-900/60">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-semibold text-slate-100">
                          <span className="mr-1.5 font-mono text-xs text-violet-300">{n.code}</span>{n.title}
                        </CardTitle>
                        <div className="flex items-center gap-1.5">
                          <Badge className={LEVEL_COLOR[n.level] ?? ""}>{LEVEL_LABEL[n.level]}</Badge>
                          {n.nextRecommended ? <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">next recommended</Badge> : null}
                          {n.completed ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">completed</Badge> : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                      {n.prerequisites.length > 0 ? (
                        <p className="flex items-center gap-1 text-slate-500">
                          <Lock className="h-3 w-3" /> Requires: {n.prerequisites.join(", ")}
                          {n.prerequisitesMet ? <CheckCircle2 className="ml-1 h-3 w-3 text-emerald-400" /> : null}
                        </p>
                      ) : null}
                      <p className="text-slate-500">
                        Mastery: {n.masteryPct == null ? <span className="italic text-slate-600">not started</span> : `${n.masteryPct}%`}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-slate-500">Loading degree plan…</p>}
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Mastery</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {progress.map((p) => (
                  <tr key={p.courseId} className="bg-slate-900/40">
                    <td className="px-3 py-2"><span className="mr-1.5 font-mono text-xs text-violet-300">{p.code}</span><span className="text-slate-200">{p.title}</span></td>
                    <td className="px-3 py-2"><Badge className={LEVEL_COLOR[p.level] ?? ""}>{LEVEL_LABEL[p.level]}</Badge></td>
                    <td className="px-3 py-2 text-slate-300">{p.masteryPct == null ? <span className="italic text-slate-600">not started</span> : `${p.masteryPct}%`}</td>
                    <td className="px-3 py-2">
                      {p.completed ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">completed</Badge> : p.started ? <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40">in progress</Badge> : <Badge className="bg-slate-700/40 text-slate-400">not started</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="learn" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)} className="w-72">
              <option value="all">All faculties</option>
              {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="w-40">
              <option value="all">All levels</option>
              <option value="bachelor">Bachelor</option>
              <option value="master">Master</option>
              <option value="doctor">Doctorate</option>
            </Select>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {courses.slice(0, 30).map((c) => (
              <Card key={c.id} className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-slate-100">
                      <span className="mr-1.5 font-mono text-xs text-violet-300">{c.code}</span>{c.title}
                    </CardTitle>
                    <Badge className={LEVEL_COLOR[c.level] ?? ""}>{LEVEL_LABEL[c.level]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-slate-400">{c.description}</p>
                  <Button size="sm" onClick={() => runStart(c)} disabled={starting === c.id}>
                    {starting === c.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    Start lesson
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {session && session.stage !== "catalog" ? (
            <Card className="border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-violet-200">
                  <Sparkles className="h-4 w-4" /> Session {session.sessionId}
                </CardTitle>
                <CardDescription className="text-xs">
                  Stage: {session.stage} · {session.modelSource === "real" ? "live Lecturer AI" : "structured demo fallback"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {session.question ? <p className="text-slate-200">{session.question}</p> : null}
                {session.warnings?.length ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{session.warnings[0]}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
