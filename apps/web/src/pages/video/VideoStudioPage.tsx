/**
 * WINDELS AI OS — AI Video Studio (§17).
 *
 * Integrates with the existing design system (Card/Button/Select/Badge/Tabs).
 * Create a video from a natural-language prompt, watch async generation
 * progress, inspect the storyboard/timeline, assets and usage, and publish.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  videoApi,
  type Capabilities,
  type VideoProject,
  type VideoJob,
  type VideoDashboard,
  type VideoModification,
} from "@/lib/video";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Clapperboard, Loader2, Plus, Play, Download, Film, Sparkles, Wand2,
  Layers, Image as ImageIcon, Music, Trash2, RefreshCw,
} from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "azure" | "violet"> = {
  draft: "default", planning: "azure", generating: "violet", rendering: "warning",
  qa: "warning", ready: "success", failed: "danger", archived: "default",
};
const JOB_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "azure"> = {
  pending: "default", queued: "default", running: "azure",
  succeeded: "success", failed: "danger", cancelled: "default", rejected: "danger",
};

const QUICK_MODS: Array<{ label: string; mod: VideoModification }> = [
  { label: "Make shorter", mod: { action: "shorten" } },
  { label: "Make longer", mod: { action: "lengthen" } },
  { label: "More professional", mod: { action: "set_tone", value: "professional" } },
  { label: "Female voice", mod: { action: "set_voice_gender", value: "female" } },
  { label: "Male voice", mod: { action: "set_voice_gender", value: "male" } },
  { label: "Zoom product", mod: { action: "zoom_product" } },
  { label: "Add captions", mod: { action: "add_captions" } },
];

export function VideoStudioPage() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [dash, setDash] = useState<VideoDashboard | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [active, setActive] = useState<VideoProject | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [creationType, setCreationType] = useState("advertisement");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(30);
  const [resolution, setResolution] = useState("1080p");

  const refresh = useCallback(async () => {
    try {
      const [c, d, ps, js] = await Promise.all([
        videoApi.capabilities(), videoApi.dashboard(), videoApi.list(), videoApi.jobs(),
      ]);
      setCaps(c); setDash(d); setProjects(ps); setJobs(js);
      if (active) {
        const fresh = ps.find((p) => p.id === active.id);
        if (fresh) setActive(fresh);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [active]);

  useEffect(() => { void refresh(); }, []); // eslint-disable-line

  // Poll while a project is in progress.
  useEffect(() => {
    if (!active || !["planning", "generating", "rendering", "qa"].includes(active.status)) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [active, refresh]);

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr(null);
    try { await fn(); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, [refresh]);

  const create = useCallback(() => run("create", async () => {
    const p = await videoApi.create({
      prompt, name: name || undefined,
      creationType: creationType as VideoProject["creationType"],
      aspectRatio: aspect as VideoProject["aspectRatio"],
      resolution: resolution as VideoProject["resolution"],
      targetDurationSec: duration,
    });
    setActive(p);
  }), [prompt, name, creationType, aspect, resolution, duration, run]);

  const produce = useCallback((id: string) =>
    run("produce", () => videoApi.produce(id)), [run]);

  const plan = useCallback((id: string) => run("plan", () => videoApi.plan(id)), [run]);
  const generate = useCallback((id: string) => run("generate", () => videoApi.generate(id)), [run]);
  const render = useCallback((id: string) => run("render", () => videoApi.render(id)), [run]);

  const modify = useCallback((id: string, mod: VideoModification) =>
    run(`mod-${mod.action}`, () => videoApi.modify(id, mod)), [run]);

  const reformat = useCallback((id: string, ratio: VideoProject["aspectRatio"]) =>
    run(`reformat-${ratio}`, () => videoApi.modify(id, { action: "set_aspect", value: ratio })), [run]);

  const remove = useCallback((id: string) => run("delete", async () => {
    await videoApi.remove(id);
    if (active?.id === id) setActive(null);
  }), [active, run]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.projectId === active?.id),
    [jobs, active],
  );
  const renderAsset = useMemo(() => {
    if (!active) return null;
    const v = active.versions.find((vv) => vv.renderAssetId);
    return v ? active.assets.find((a) => a.id === v.renderAssetId) : null;
  }, [active]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Clapperboard className="w-7 h-7 text-violet" />
        <div>
          <h1 className="text-2xl font-bold text-text-bright">AI Video Studio</h1>
          <p className="text-sm text-text-muted">Idea → plan → generate → edit → render → deliver. AI-native video production.</p>
        </div>
      </div>

      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Projects" value={dash.projects} />
          <Stat label="Ready" value={dash.ready} />
          <Stat label="In progress" value={dash.inProgress} />
          <Stat label="Providers" value={`${dash.providersConfigured}/${dash.providers}`} />
          <Stat label="FFmpeg" value={dash.ffmpegAvailable ? "ready" : "not installed"} />
        </div>
      )}

      {err && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Create Video</CardTitle>
            <CardDescription>Describe it naturally — Windels directs the production.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Project name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea
              rows={4}
              placeholder={'e.g. "Create a 30-second advertisement for my shoe business"'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={creationType} onChange={(e) => setCreationType(e.target.value)}>
                {(caps?.creationTypes ?? []).map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
              <Select value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {(caps?.aspectRatios ?? ["16:9", "9:16", "1:1"]).map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
              <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                {(caps?.resolutions ?? ["720p", "1080p"]).map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Input type="number" min={5} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <Button className="w-full" onClick={create} loading={busy === "create"} disabled={!prompt.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Create project
            </Button>
          </CardContent>
        </Card>

        {/* Active project */}
        <div className="lg:col-span-2 space-y-4">
          {!active ? (
            <Card>
              <CardContent className="py-12 text-center text-text-muted">
                <Film className="w-10 h-10 mx-auto mb-3 opacity-50" />
                Select or create a project to start producing.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {active.name}
                      <Badge variant={STATUS_VARIANT[active.status] ?? "default"}>{active.status}</Badge>
                    </CardTitle>
                    <CardDescription>{active.creationType.replace(/_/g, " ")} · {active.targetDurationSec}s · {active.aspectRatio} · {active.resolution}</CardDescription>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(active.id)} loading={busy === "delete"}><Trash2 className="w-4 h-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-text-muted">{active.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => plan(active.id)} loading={busy === "plan"}><Wand2 className="w-4 h-4 mr-1" />Plan</Button>
                    <Button size="sm" variant="secondary" onClick={() => generate(active.id)} loading={busy === "generate"}><Layers className="w-4 h-4 mr-1" />Generate</Button>
                    <Button size="sm" variant="secondary" onClick={() => render(active.id)} loading={busy === "render"}><Play className="w-4 h-4 mr-1" />Render</Button>
                    <Button size="sm" onClick={() => produce(active.id)} loading={busy === "produce"}><Sparkles className="w-4 h-4 mr-1" />Produce all</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    {QUICK_MODS.map((q) => (
                      <Button key={q.label} size="sm" variant="outline" onClick={() => modify(active.id, q.mod)} loading={busy === `mod-${q.mod.action}`}>{q.label}</Button>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => reformat(active.id, "9:16")} loading={busy === "reformat-9:16"}>TikTok 9:16</Button>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="timeline">
                <TabsList>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="script">Script</TabsTrigger>
                  <TabsTrigger value="assets">Assets</TabsTrigger>
                  <TabsTrigger value="jobs">Jobs</TabsTrigger>
                  <TabsTrigger value="versions">Versions</TabsTrigger>
                  <TabsTrigger value="usage">Usage</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline">
                  <Card>
                    <CardContent className="space-y-2 pt-4">
                      {active.scenes.length === 0 && <p className="text-sm text-text-muted">No scenes yet — click Plan.</p>}
                      {active.scenes.map((s) => (
                        <div key={s.index} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                          <div className="w-8 h-8 rounded-md bg-violet/20 text-violet flex items-center justify-center text-xs font-semibold">{s.index + 1}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-bright">{s.title}</span>
                              <Badge variant={s.status === "ready" ? "success" : s.status === "failed" ? "danger" : "default"}>{s.status}</Badge>
                              <span className="text-xs text-text-muted">{s.durationSec}s · {s.cameraMovement}</span>
                            </div>
                            <p className="text-sm text-text-muted mt-1">{s.visualPrompt}</p>
                            {s.caption && <p className="text-xs text-azure mt-1">🎬 {s.caption}</p>}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="script">
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      {active.script ? (
                        <>
                          <div><b className="text-text-bright">{active.script.title}</b> <span className="text-text-muted text-sm">— {active.script.tone}</span></div>
                          <p className="text-sm text-text-muted">{active.script.summary}</p>
                          {active.script.sections.map((sec, i) => (
                            <div key={i} className="rounded-lg border border-white/5 p-3">
                              <div className="text-xs uppercase tracking-wide text-violet mb-1">{sec.heading} · {sec.durationSec}s</div>
                              <p className="text-sm">{sec.body}</p>
                            </div>
                          ))}
                        </>
                      ) : <p className="text-sm text-text-muted">No script yet — click Plan.</p>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="assets">
                  <Card>
                    <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                      {active.assets.length === 0 && <p className="text-sm text-text-muted col-span-3">No assets yet — click Generate.</p>}
                      {renderAsset && (
                        <div className="col-span-full">
                          <video controls src={renderAsset.url} className="w-full rounded-lg border border-white/10 bg-black" />
                          <a href={renderAsset.url} download className="inline-flex items-center gap-1 text-xs text-azure mt-2"><Download className="w-3 h-3" />Download</a>
                        </div>
                      )}
                      {active.assets.filter((a) => a.kind !== "render").map((a) => (
                        <div key={a.id} className="rounded-lg border border-white/5 p-2 text-xs">
                          <div className="flex items-center gap-1 text-text-bright">
                            {a.kind.startsWith("audio") ? <Music className="w-3 h-3" /> : a.kind === "clip" ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                            {a.kind}
                          </div>
                          <div className="text-text-muted truncate">{a.url.split("/").pop()}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="jobs">
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      {activeJobs.length === 0 && <p className="text-sm text-text-muted">No jobs for this project.</p>}
                      {activeJobs.map((j) => (
                        <div key={j.id} className="flex items-center justify-between rounded-lg border border-white/5 p-2 text-sm">
                          <span className="flex items-center gap-2">
                            {j.status === "running" || j.status === "pending" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            <span className="text-text-bright">{j.kind}</span>
                            {j.providerId && <span className="text-xs text-text-muted">{j.providerId}/{j.modelId}</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            {j.status === "running" && <span className="text-xs text-text-muted">{j.progress}%</span>}
                            <Badge variant={JOB_VARIANT[j.status] ?? "default"}>{j.status}</Badge>
                            {(j.status === "pending" || j.status === "running") && (
                              <Button size="sm" variant="ghost" onClick={() => run(`cancel-${j.id}`, () => videoApi.cancelJob(j.id))}>Cancel</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="versions">
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      {active.versions.length === 0 && <p className="text-sm text-text-muted">No versions yet — render creates one.</p>}
                      {active.versions.map((v) => (
                        <div key={v.id} className="flex items-center justify-between rounded-lg border border-white/5 p-2 text-sm">
                          <span>{v.label} · {v.aspectRatio} · {v.resolution}{v.platform ? ` · ${v.platform}` : ""}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={v.status === "ready" ? "success" : v.status === "failed" ? "danger" : "default"}>{v.status}</Badge>
                            <Button size="sm" variant="outline" onClick={() => reformat(active.id, v.aspectRatio)}><RefreshCw className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="secondary" onClick={() => run("version-9:16", () => videoApi.createVersion(active.id, { aspectRatio: "9:16", platform: "tiktok" }))}>TikTok version</Button>
                        <Button size="sm" variant="secondary" onClick={() => run("version-1:1", () => videoApi.createVersion(active.id, { aspectRatio: "1:1", platform: "instagram" }))}>Instagram square</Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="usage">
                  <Card>
                    <CardContent className="pt-4 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Generation jobs" value={active.usage.generationJobs} />
                      <Stat label="Successful" value={active.usage.successfulGenerations} />
                      <Stat label="Duration (s)" value={active.usage.totalDurationSec} />
                      <Stat label="Voice seconds" value={active.usage.voiceSeconds} />
                      <Stat label="Render time (ms)" value={active.usage.renderMs} />
                      <Stat label="Output bytes" value={active.usage.outputBytes} />
                      <Stat label="Est. cost (µ)" value={active.usage.estimatedCostMicros} />
                      <Stat label="Recorded cost (µ)" value={active.usage.recordedCostMicros} />
                      {active.usage.unpriced && <p className="col-span-2 text-xs text-amber-300">No rates configured — usage tracked but unpriced. Set MEDIA_RATE_* to enable billing.</p>}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>

      {/* Project list */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="w-4 h-4" /> My Projects</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {projects.length === 0 && <p className="text-sm text-text-muted">No projects yet.</p>}
          {projects.map((p) => (
            <button key={p.id} onClick={() => setActive(p)} className="w-full text-left flex items-center justify-between rounded-lg border border-white/5 hover:bg-white/5 p-3">
              <span>
                <span className="text-sm font-medium text-text-bright">{p.name}</span>
                <span className="text-xs text-text-muted ml-2">{p.creationType.replace(/_/g, " ")} · {p.targetDurationSec}s</span>
              </span>
              <Badge variant={STATUS_VARIANT[p.status] ?? "default"}>{p.status}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold text-text-bright">{value}</div>
    </div>
  );
}
