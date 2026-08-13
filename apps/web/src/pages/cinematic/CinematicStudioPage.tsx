/**
 * WINDELS AI Video Studio (Cinematic) — §60 UI.
 * Prompt → references/character → model/duration/resolution/audio → generate →
 * player + timeline (shots) + generations/versions + real SSE progress.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cinematicApi, type CharacterProfile, type CinematicJob, type CinematicProject, type VideoModelDescriptor } from "@/lib/cinematic";
import { filesApi } from "@/lib/files";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Clapperboard, Sparkles, Upload, Play, Pause, Download, RefreshCw, Loader2,
  Film, Users, Camera, Lightbulb, Music, Wand2, Trash2, Plus,
} from "lucide-react";

const STAGES: Record<string, number> = {
  QUEUED: 5, ANALYZING: 10, PLANNING: 20, GENERATING: 45, PROCESSING: 60,
  AUDIO_GENERATION: 72, LIP_SYNC: 80, QUALITY_CHECK: 88, RENDERING: 96, COMPLETED: 100,
};

export default function CinematicStudioPage() {
  const [models, setModels] = useState<VideoModelDescriptor[]>([]);
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [projects, setProjects] = useState<CinematicProject[]>([]);
  const [project, setProject] = useState<CinematicProject | null>(null);
  const [job, setJob] = useState<CinematicJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ stage: string; percent: number; message: string } | null>(null);
  const [playing, setPlaying] = useState(false);

  const [prompt, setPrompt] = useState("A cinematic shot of a woman walking through a futuristic Lagos at night, neon lights, realistic lighting, slow camera dolly.");
  const [negative, setNegative] = useState("distorted hands, extra fingers, blurry, watermark, text, deformed face");
  const [duration, setDuration] = useState(10);
  const [resolution, setResolution] = useState("1080p");
  const [aspect, setAspect] = useState("16:9");
  const [style, setStyle] = useState("cinematic");
  const [audio, setAudio] = useState(true);
  const [music, setMusic] = useState(true);
  const [dialogue, setDialogue] = useState(false);
  const [preview, setPreview] = useState(false);
  const [est, setEst] = useState<{ credits: number; runtimeSec: number; multiShot: boolean; model: string } | null>(null);
  const [charIds, setCharIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const evtRef = useRef<EventSource | null>(null);

  useEffect(() => { void (async () => { setModels(await cinematicApi.models()); setCharacters(await cinematicApi.characters()); setProjects(await cinematicApi.listProjects()); })(); }, []);

  useEffect(() => {
    if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) { evtRef.current?.close(); return; }
    const es = new EventSource(cinematicApi.eventsUrl(job.id));
    evtRef.current = es;
    es.onmessage = (e) => { try { const p = JSON.parse(e.data); setProgress(p); } catch { /* ignore */ } };
    const poll = setInterval(async () => {
      const j = await cinematicApi.job(job.id); setJob(j);
      if (j.status === "succeeded") { const p = await cinematicApi.getProject(j.projectId); setProject(p); setProjects(await cinematicApi.listProjects()); }
      if (["succeeded", "failed", "cancelled"].includes(j.status)) clearInterval(poll);
    }, 1500);
    return () => { clearInterval(poll); es.close(); };
  }, [job?.id]); // eslint-disable-line

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, []);

  const create = useCallback(async () => {
    await run("create", async () => {
      const p = await cinematicApi.createProject({
        prompt, negativePrompt: negative, durationSec: duration, resolution, aspectRatio: aspect,
        style, audioEnabled: audio, musicEnabled: music, dialogueEnabled: dialogue,
        characterIds: charIds, quality: preview ? "draft" : "high",
      });
      setProject(p); setProjects(await cinematicApi.listProjects());
      setEst(await cinematicApi.estimate(p.id));
    });
  }, [prompt, negative, duration, resolution, aspect, style, audio, music, dialogue, charIds, preview, run]);

  const generate = useCallback(async () => {
    if (!project) return;
    await run("generate", async () => {
      const j = await cinematicApi.generate(project.id, { preview });
      setJob(j); setProgress({ stage: j.stage, percent: STAGES[j.stage] ?? 5, message: j.message });
    });
  }, [project, preview, run]);

  const onUploadRef = useCallback(async (file: File) => {
    await run("upload-ref", async () => {
      const att = await filesApi.upload(file);
      // Attach as an image reference to the current project.
      if (project) {
        const refs = [...(project.references ?? []), { id: "ref-" + Math.random().toString(36).slice(2, 8), role: "character" as const, assetId: att.id, url: filesApi.downloadUrl(att.id), strength: "high" as const }];
        const updated = await cinematicApi.updateProject(project.id, { references: refs as any });
        setProject(updated);
      }
    });
  }, [project, run]);

  const finalUrl = project?.finalAssetId ? `/api/v1/cinematic/assets/${project.organizationId}/shots/${project.finalAssetId}.mp4` : null;
  const shots = project?.storyboard?.shots ?? [];
  const pct = progress?.percent ?? (job?.status === "succeeded" ? 100 : job ? STAGES[job.stage] ?? 0 : 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Clapperboard className="w-7 h-7 text-violet" />
        <div>
          <h1 className="text-2xl font-bold text-text-bright">AI Video Studio</h1>
          <p className="text-sm text-text-muted">Idea → cinematic video with characters, camera, lighting, audio and quality control.</p>
        </div>
      </div>

      {err && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Prompt</CardTitle>
            <CardDescription>Describe your video naturally — the Director handles camera, lighting and motion.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A cinematic shot of..." />
            <Input placeholder="Negative prompt" value={negative} onChange={(e) => setNegative(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">Style
                <Select value={style} onChange={(e) => setStyle(e.target.value)}>
                  {["cinematic", "photorealistic", "anime", "documentary", "commercial", "scifi", "fantasy", "horror", "corporate"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </label>
              <label className="text-xs">Resolution
                <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  {["480p", "720p", "1080p", "1440p", "4k"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </label>
              <label className="text-xs">Aspect
                <Select value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {["16:9", "9:16", "1:1", "4:3", "21:9"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </label>
              <label className="text-xs">Duration (s)
                <Input type="number" min={3} max={60} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </label>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <Toggle label="Audio" on={audio} set={setAudio} />
              <Toggle label="Music" on={music} set={setMusic} />
              <Toggle label="Dialogue" on={dialogue} set={setDialogue} />
              <Toggle label="5s preview" on={preview} set={setPreview} />
            </div>
            {characters.length > 0 && (
              <div>
                <div className="text-xs text-text-muted mb-1">Characters</div>
                <div className="flex flex-wrap gap-1">
                  {characters.map((c) => (
                    <button key={c.id} onClick={() => setCharIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}
                      className={`px-2 py-1 rounded-full text-xs border ${charIds.includes(c.id) ? "bg-violet-500/20 border-violet-500/40 text-violet-200" : "border-white/10 text-text-muted"}`}>{c.name}</button>
                  ))}
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadRef(f); }} />
            <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} loading={busy === "upload-ref"}><Upload className="w-4 h-4 mr-1" /> Add reference image/video</Button>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={create} loading={busy === "create"} disabled={!prompt.trim()}><Plus className="w-4 h-4 mr-1" /> Create project</Button>
              <Button className="flex-1" onClick={generate} disabled={!project || busy === "generate"} loading={busy === "generate"}><Sparkles className="w-4 h-4 mr-1" /> Generate</Button>
            </div>
            {est && <div className="text-xs text-text-muted rounded-lg border border-white/10 p-2">Model: <b className="text-text-main">{est.model}</b> · ~{est.credits} credits · ~{est.runtimeSec}s{est.multiShot ? " · multi-shot" : ""}</div>}
          </CardContent>
        </Card>

        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-black flex items-center justify-center">
                {finalUrl ? <video src={finalUrl} controls autoPlay={playing} className="max-h-full max-w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
                  : <div className="text-text-muted text-sm flex flex-col items-center gap-2"><Film className="w-10 h-10 opacity-40" />{job?.status === "running" ? "Generating…" : "No video yet"}</div>}
              </div>
              {job && (
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">{job.status === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{progress?.message ?? job.message}</span>
                    <Badge variant={job.status === "succeeded" ? "success" : job.status === "failed" ? "danger" : "azure"}>{job.status}</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  <div className="flex gap-2">
                    {["succeeded", "failed", "cancelled"].includes(job.status) || (
                      <Button size="sm" variant="outline" onClick={() => cinematicApi.cancelJob(job.id)}>Cancel</Button>
                    )}
                    {finalUrl && <a href={finalUrl} download className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><Download className="w-3 h-3" />Download</a>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="shots">
            <TabsList>
              <TabsTrigger value="shots">Storyboard / Shots</TabsTrigger>
              <TabsTrigger value="generations">Generations</TabsTrigger>
              <TabsTrigger value="audio">Audio</TabsTrigger>
              <TabsTrigger value="controls">Cinematic controls</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
            </TabsList>
            <TabsContent value="shots">
              <Card><CardContent className="pt-4 grid gap-2 md:grid-cols-2">
                {shots.length === 0 && <p className="text-sm text-text-muted">Generate a project to see shots.</p>}
                {shots.map((s) => (
                  <div key={s.id} className="rounded-lg border border-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-bright">{s.title} · {s.durationSec}s</span>
                      <Badge variant={s.status === "ready" ? "success" : s.status === "failed" ? "danger" : "default"}>{s.status}</Badge>
                    </div>
                    <p className="text-xs text-text-muted mt-1">{s.description}</p>
                    <div className="text-[11px] text-violet-200 mt-1 flex gap-2"><Camera className="w-3 h-3" />{s.camera.type} · {s.camera.angle} · <Lightbulb className="w-3 h-3" />{s.lighting.preset}</div>
                    {project && s.status !== "ready" && <Button size="sm" variant="outline" className="mt-2" onClick={() => cinematicApi.regenerateShot(project.id, s.id)}>Regenerate shot</Button>}
                  </div>
                ))}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="generations">
              <Card><CardContent className="pt-4 space-y-2">
                {project?.generations.length === 0 && <p className="text-sm text-text-muted">No generations yet.</p>}
                {project?.generations.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-lg border border-white/5 p-2 text-sm">
                    <span>{g.modelId} · v{g.variation} · seed {g.seed}{g.qualityScore ? ` · ${(g.qualityScore * 100).toFixed(0)}%` : ""}</span>
                    <div className="flex gap-1">
                      <Badge variant={g.favorite ? "amber" : "secondary"}>{g.favorite ? "★" : ""}</Badge>
                      {g.url && <a href={g.url} target="_blank" rel="noreferrer" className="text-xs text-azure">view</a>}
                    </div>
                  </div>
                ))}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="audio">
              <Card><CardContent className="pt-4 space-y-1">
                {project?.audioTracks.length === 0 && <p className="text-sm text-text-muted">No audio tracks yet.</p>}
                {project?.audioTracks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded border border-white/5 p-2 text-sm">
                    <span className="flex items-center gap-2"><Music className="w-3 h-3" />{t.label} <span className="text-xs text-text-muted">{t.kind} · {t.durationSec.toFixed(1)}s</span></span>
                    {t.url && <audio src={t.url} controls className="h-7" />}
                  </div>
                ))}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="controls">
              <Card><CardContent className="pt-4 grid grid-cols-2 gap-3 text-sm">
                <Control icon={Camera} label="Camera" value={project?.camera?.type ?? "dolly_in"} />
                <Control icon={Lightbulb} label="Lighting" value={project?.lighting?.preset ?? "cinematic"} />
                <Control icon={Users} label="Characters" value={`${project?.characterIds.length ?? 0} locked`} />
                <Control icon={Film} label="Shots" value={`${shots.length}`} />
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="projects">
              <Card><CardContent className="pt-4 space-y-1">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => setProject(p)} className="w-full text-left flex items-center justify-between rounded-lg border border-white/5 p-2 hover:bg-white/5">
                    <span className="text-sm truncate">{p.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === "ready" ? "success" : p.status === "failed" ? "danger" : "default"}>{p.status}</Badge>
                      <Trash2 className="w-3 h-3 text-text-muted hover:text-rose-300" onClick={(e) => { e.stopPropagation(); void cinematicApi.deleteProject(p.id).then(() => setProjects((ps) => ps.filter((x) => x.id !== p.id))); }} />
                    </div>
                  </button>
                ))}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return <button onClick={() => set(!on)} className={`px-2 py-1 rounded-full border text-xs ${on ? "bg-violet-500/20 border-violet-500/40 text-violet-200" : "border-white/10 text-text-muted"}`}>{label}</button>;
}
function Control({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 p-2 flex items-center gap-2"><Icon className="w-4 h-4 text-violet" /><div><div className="text-[11px] text-text-muted">{label}</div><div className="text-text-bright capitalize">{value.replace(/_/g, " ")}</div></div></div>;
}
