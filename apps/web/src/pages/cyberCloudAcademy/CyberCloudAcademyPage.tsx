/**
 * Session 152 — Cyber & Cloud Academy Console (/app/cyber-cloud-academy).
 *
 * Tabs:
 *   Catalog  — the two teaching tracks (Cybersecurity / Ethical Hacking and
 *              Cloud Computing) with levels and prerequisites.
 *   Path     — the learning path derived from real lecturer mastery: one
 *              next-recommended topic per track, prerequisites status, and
 *              honest null mastery for never-started topics.
 *   Progress — per-topic mastery, completion state and the recommended
 *              level for continuing.
 *   Learn    — start a Lecturer AI session on any topic (honest demo
 *              fallback when no AI provider is configured).
 *
 * Honest UI rules:
 *   - never-started topics show "Not started" (null mastery), never 0%.
 *   - the path marks exactly one next-recommended node per track.
 *   - starting a session surfaces the lecturer's aiAvailable/warning state.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen, Cloud, ShieldCheck, Route, BarChart3, Play, Loader2,
  CheckCircle2, Lock, Sparkles, AlertTriangle,
} from "lucide-react";
import {
  getAcademyCatalog,
  getAcademyPath,
  getAcademyProgress,
  getAcademyTopic,
  startAcademyTopic,
  type AcademyCatalogView,
  type AcademyLevel,
  type AcademyPathNode,
  type AcademyProgressEntry,
  type AcademyTopic,
} from "@/lib/cyberCloudAcademy";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const LEVEL_COLOR: Record<string, string> = {
  beginner: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  intermediate: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  advanced: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  expert: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

const TRACK_LABEL: Record<string, string> = {
  cybersecurity: "Cybersecurity & Ethical Hacking",
  cloud: "Cloud Computing",
};

function TopicRow({ topic, path }: { topic: AcademyTopic; path?: AcademyPathNode }) {
  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-100">{topic.title}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge className={LEVEL_COLOR[topic.level] ?? "bg-slate-700/40 text-slate-300"}>{topic.level}</Badge>
            {path?.nextRecommended ? <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">next recommended</Badge> : null}
            {path?.completed ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">completed</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p className="text-slate-400">{topic.description}</p>
        {topic.prerequisites.length > 0 ? (
          <p className="flex items-center gap-1 text-slate-500">
            <Lock className="h-3 w-3" /> Requires: {topic.prerequisites.join(", ")}
            {path ? (path.prerequisitesMet ? <CheckCircle2 className="ml-1 h-3 w-3 text-emerald-400" /> : null) : null}
          </p>
        ) : null}
        {path ? (
          <p className="text-slate-500">
            Mastery: {path.masteryPct == null ? <span className="italic text-slate-600">not started</span> : `${path.masteryPct}%`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CyberCloudAcademyPage() {
  const [catalog, setCatalog] = useState<AcademyCatalogView | null>(null);
  const [path, setPath] = useState<AcademyPathNode[] | null>(null);
  const [progress, setProgress] = useState<AcademyProgressEntry[] | null>(null);
  const [selected, setSelected] = useState<AcademyTopic | null>(null);
  const [level, setLevel] = useState<AcademyLevel>("beginner");
  const [session, setSession] = useState<{ sessionId: string; stage: string; question?: string; aiAvailable: boolean; warning?: string } | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const [c, p, pr] = await Promise.all([getAcademyCatalog(), getAcademyPath(), getAcademyProgress()]);
    setCatalog(c);
    setPath(p);
    setProgress(pr);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runStart = async (topic: AcademyTopic) => {
    setSelected(topic);
    setStarting(true);
    try {
      const res = await startAcademyTopic(topic.id, level);
      setSession(res.turn);
    } finally {
      setStarting(false);
    }
  };

  const openTopic = async (topic: AcademyTopic) => {
    setSelected(topic);
    setSession(null);
    const res = await getAcademyTopic(topic.id);
    if (res.mastery) {
      void res;
    }
  };

  const allTopics = catalog ? [...catalog.tracks.cybersecurity, ...catalog.tracks.cloud] : [];
  const pathById = new Map((path ?? []).map((n) => [n.topicId, n]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Cyber & Cloud Academy</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Lecturer-AI teaching tracks: {catalog?.total ?? "…"} topics across Cybersecurity / Ethical Hacking
          and Cloud Computing. Progress is derived from real lecturer mastery — never-started topics are
          reported as not started, never as 0%.
        </p>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog"><BookOpen className="mr-1.5 h-4 w-4" />Catalog</TabsTrigger>
          <TabsTrigger value="path"><Route className="mr-1.5 h-4 w-4" />Learning Path</TabsTrigger>
          <TabsTrigger value="progress"><BarChart3 className="mr-1.5 h-4 w-4" />Progress</TabsTrigger>
          <TabsTrigger value="learn"><Play className="mr-1.5 h-4 w-4" />Learn</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-6">
          {catalog
            ? (["cybersecurity", "cloud"] as const).map((track) => (
                <div key={track}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                    {track === "cybersecurity" ? <ShieldCheck className="h-4 w-4 text-violet-400" /> : <Cloud className="h-4 w-4 text-sky-400" />}
                    {TRACK_LABEL[track]} ({catalog.tracks[track].length})
                  </h2>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {catalog.tracks[track].map((t) => (
                      <button key={t.id} type="button" onClick={() => openTopic(t)} className="text-left">
                        <TopicRow topic={t} path={pathById.get(t.id)} />
                      </button>
                    ))}
                  </div>
                </div>
              ))
            : <p className="text-sm text-slate-500">Loading catalog…</p>}
        </TabsContent>

        <TabsContent value="path" className="space-y-4">
          <p className="text-sm text-slate-400">
            One next-recommended topic per track: the first un-completed topic whose prerequisites are all met.
          </p>
          {path ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {path.map((n) => {
                const topic = allTopics.find((t) => t.id === n.topicId);
                if (!topic) return null;
                return <TopicRow key={n.topicId} topic={topic} path={n} />;
              })}
            </div>
          ) : <p className="text-sm text-slate-500">Loading path…</p>}
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          {progress ? (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Topic</th>
                    <th className="px-3 py-2">Track</th>
                    <th className="px-3 py-2">Mastery</th>
                    <th className="px-3 py-2">Recommended level</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {progress.map((p) => (
                    <tr key={p.topicId} className="bg-slate-900/40">
                      <td className="px-3 py-2 text-slate-200">{p.title}</td>
                      <td className="px-3 py-2 text-slate-400">{TRACK_LABEL[p.track]}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {p.masteryPct == null ? <span className="italic text-slate-600">not started</span> : `${p.masteryPct}%`}
                      </td>
                      <td className="px-3 py-2"><Badge className={LEVEL_COLOR[p.recommendedLevel] ?? ""}>{p.recommendedLevel}</Badge></td>
                      <td className="px-3 py-2">
                        {p.completed ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">completed</Badge> : p.started ? <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40">in progress</Badge> : <Badge className="bg-slate-700/40 text-slate-400">not started</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-500">Loading progress…</p>}
        </TabsContent>

        <TabsContent value="learn" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={level} onChange={(e) => setLevel(e.target.value as AcademyLevel)} className="w-44">
              {(["beginner", "intermediate", "advanced", "expert"] as AcademyLevel[]).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
            <span className="text-xs text-slate-500">Starting level (the Lecturer AI adapts as you answer).</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {allTopics.map((t) => (
              <Card key={t.id} className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-slate-100">{t.title}</CardTitle>
                    <Badge className={LEVEL_COLOR[t.level] ?? ""}>{t.level}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-slate-400">{t.description}</p>
                  <Button size="sm" onClick={() => runStart(t)} disabled={starting}>
                    {starting && selected?.id === t.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    Start lesson
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {session ? (
            <Card className="border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-violet-200">
                  <Sparkles className="h-4 w-4" /> Session {session.sessionId}
                </CardTitle>
                <CardDescription className="text-xs">
                  Stage: {session.stage}{session.aiAvailable ? " · live Lecturer AI" : " · structured demo fallback"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {session.question ? <p className="text-slate-200">{session.question}</p> : null}
                {session.warning ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{session.warning}</span>
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">
                  Continue the ASSESS → LESSON → QUESTION → FEEDBACK loop in the Lecturer AI area (answer/ask endpoints).
                </p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
