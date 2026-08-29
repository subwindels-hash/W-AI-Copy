/**
 * Session 159 — Education & Learning console (/app/education).
 *
 * Empty mastery is "—" not 0%. Catalog ratings stay unrated until recorded.
 * Lecturer AI lives at /app/learn; this page is the LMS register.
 */
import { useCallback, useEffect, useState } from "react";
import { BookOpen, GraduationCap, Route, ClipboardCheck } from "lucide-react";
import {
  eduApi,
  type EducationDashboard, type LearningContent, type LearningPath,
  type Assessment, type Skill, type TutorSession,
} from "@/lib/education";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const KINDS: LearningContent["kind"][] = ["course", "lesson", "quiz", "project", "path", "assessment", "certification_prep"];
const DIFFS: LearningContent["difficulty"][] = ["beginner", "intermediate", "advanced", "expert"];

export function EducationPage() {
  const [dash, setDash] = useState<EducationDashboard | null>(null);
  const [content, setContent] = useState<LearningContent[]>([]);
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tutors, setTutors] = useState<TutorSession[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LearningContent["kind"]>("lesson");
  const [diff, setDiff] = useState<LearningContent["difficulty"]>("beginner");
  const [mins, setMins] = useState("30");
  const [skillName, setSkillName] = useState("");
  const [skillCat, setSkillCat] = useState("AI Fundamentals");
  const [skillLevel, setSkillLevel] = useState("0");
  const [topic, setTopic] = useState("");
  const [pathTitle, setPathTitle] = useState("");
  const [pathGoal, setPathGoal] = useState("");
  const [pathContent, setPathContent] = useState("");
  const [score, setScore] = useState("80");
  const [assessContent, setAssessContent] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, c, p, a, s, t] = await Promise.all([
      eduApi.dashboard(), eduApi.listContent(), eduApi.listPaths(),
      eduApi.listAssessments(), eduApi.listSkills(), eduApi.listTutorSessions(),
    ]);
    setDash(d); setContent(c); setPaths(p); setAssessments(a); setSkills(s); setTutors(t);
    setAssessContent((prev) => prev || c[0]?.id || "");
    setPathContent((prev) => prev || c[0]?.id || "");
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Learning Platform</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Courses, skills, paths and assessments you record. An empty catalog is
          not 0% mastery. Adaptive tutoring is Lecturer AI at /app/learn — this
          register does not invent enrollments or certificates.
        </p>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.totalContent ?? "…"}</CardTitle><CardDescription>Catalog items</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.avgMasteryPct == null ? "—" : `${dash.avgMasteryPct}%`}</CardTitle><CardDescription>Avg mastery</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.activeLearners ?? "…"}</CardTitle><CardDescription>Recorded learners</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.hoursLearned30d ?? "…"}</CardTitle><CardDescription>Hours (30d assessments)</CardDescription></CardHeader></Card>
      </div>
      {dash?.provenance ? <p className="text-xs text-slate-500">{dash.provenance.avgMasteryPct}</p> : null}

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog"><BookOpen className="mr-1.5 h-4 w-4" />Catalog</TabsTrigger>
          <TabsTrigger value="skills"><GraduationCap className="mr-1.5 h-4 w-4" />Skills</TabsTrigger>
          <TabsTrigger value="paths"><Route className="mr-1.5 h-4 w-4" />Paths & tutors</TabsTrigger>
          <TabsTrigger value="assess"><ClipboardCheck className="mr-1.5 h-4 w-4" />Assessments</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Add catalog item</CardTitle>
              <CardDescription>Starts as draft, unrated, zero enrollments.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-56" />
              <Select value={kind} onChange={(e) => setKind(e.target.value as LearningContent["kind"])} className="w-44">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Select value={diff} onChange={(e) => setDiff(e.target.value as LearningContent["difficulty"])} className="w-36">
                {DIFFS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Input placeholder="Minutes" value={mins} onChange={(e) => setMins(e.target.value)} className="w-24" />
              <Button size="sm" disabled={!title} onClick={async () => {
                try {
                  await eduApi.createContent({ title, kind, durationMin: Number(mins) || 0, difficulty: diff });
                  setTitle(""); setMsg("catalog item created"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {content.length === 0 ? <p className="text-sm text-slate-500">No catalog items. Nothing is seeded.</p> : null}
          {content.map((c) => (
            <Card key={c.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="font-semibold text-slate-100">{c.title}</span>
                <Badge className="bg-slate-700/40 text-slate-300">{c.kind}</Badge>
                <Badge className="bg-slate-700/40 text-slate-400">{c.difficulty}</Badge>
                <Badge className="bg-slate-700/40 text-slate-400">{c.status}</Badge>
                <span className="text-slate-500">{c.durationMin} min</span>
                <span className="text-slate-500">{c.rating == null ? "unrated" : `★ ${c.rating.toFixed(1)}`}</span>
                <span className="text-slate-500">{c.enrollments} enrolled · {c.completions} passed</span>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="skills" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Record a skill</CardTitle>
              <CardDescription>{dash?.provenance?.avgMasteryPct}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Name" value={skillName} onChange={(e) => setSkillName(e.target.value)} className="w-48" />
              <Input placeholder="Category" value={skillCat} onChange={(e) => setSkillCat(e.target.value)} className="w-44" />
              <Input placeholder="Level 0–5" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)} className="w-28" />
              <Button size="sm" disabled={!skillName || !skillCat} onClick={async () => {
                try {
                  await eduApi.createSkill({ name: skillName, category: skillCat, level: Number(skillLevel) || 0 });
                  setSkillName(""); setMsg("skill recorded"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {skills.length === 0 ? <p className="text-sm text-slate-500">No skills recorded. Mastery stays —.</p> : null}
          {skills.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <GraduationCap className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-semibold">{s.name}</span>
              <Badge className="bg-slate-700/40 text-slate-300">{s.category}</Badge>
              <span className="text-slate-500">L{s.level} / {s.target}</span>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="paths" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Start a tutor session</CardTitle>
              <CardDescription>Logs the topic. Adaptive teaching is Lecturer AI.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-64" />
              <Button size="sm" disabled={topic.length < 2} onClick={async () => {
                try { await eduApi.startTutor(topic); setTopic(""); setMsg("tutor logged"); await load(); }
                catch (e: any) { setMsg(e.message); }
              }}>Start</Button>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Create a learning path</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Title" value={pathTitle} onChange={(e) => setPathTitle(e.target.value)} className="w-44" />
              <Input placeholder="Goal" value={pathGoal} onChange={(e) => setPathGoal(e.target.value)} className="w-44" />
              <Select value={pathContent} onChange={(e) => setPathContent(e.target.value)} className="w-56">
                <option value="">— catalog item —</option>
                {content.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
              <Button size="sm" disabled={!pathTitle || !pathGoal || !pathContent} onClick={async () => {
                try {
                  await eduApi.createPath({ title: pathTitle, goal: pathGoal, contentIds: [pathContent] });
                  setPathTitle(""); setPathGoal(""); setMsg("path created"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Create</Button>
            </CardContent>
          </Card>
          {tutors.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <span className="font-semibold">{t.topic}</span>
              <Badge className="bg-slate-700/40 text-slate-400">{t.endedAt ? "ended" : "open"}</Badge>
              <span className="text-slate-500">{t.messages} messages</span>
            </div>
          ))}
          {paths.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <Route className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold">{p.title}</span>
              <span className="text-slate-500">{p.goal}</span>
              <Badge className="bg-slate-700/40 text-slate-400">{p.progressPct}%</Badge>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="assess" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Record an assessment</CardTitle>
              <CardDescription>{dash?.provenance?.hoursLearned30d}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Select value={assessContent} onChange={(e) => setAssessContent(e.target.value)} className="w-56">
                <option value="">— catalog item —</option>
                {content.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
              <Input placeholder="Score %" value={score} onChange={(e) => setScore(e.target.value)} className="w-24" />
              <Button size="sm" disabled={!assessContent} onClick={async () => {
                try {
                  const pct = Number(score) || 0;
                  await eduApi.assess({
                    contentId: assessContent, scorePct: pct,
                    correct: Math.round(pct / 10), questions: 10, timeSpentSec: 600,
                  });
                  setMsg("assessment recorded"); await load();
                } catch (e: any) { setMsg(e.message); }
              }}>Record</Button>
            </CardContent>
          </Card>
          {assessments.length === 0 ? <p className="text-sm text-slate-500">No assessments recorded.</p> : null}
          {assessments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <ClipboardCheck className="h-3.5 w-3.5 text-violet-400" />
              <span className="font-mono text-xs text-slate-500">{a.contentId.slice(0, 12)}</span>
              <Badge className={a.passed ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-rose-500/20 text-rose-300 border-rose-500/40"}>
                {a.scorePct}% {a.passed ? "pass" : "fail"}
              </Badge>
              <span className="text-slate-500">{a.correct}/{a.questions} · {a.timeSpentSec}s</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
