/**
 * WINDELS AI OS — Music Video Generator (Media Studio integration).
 *
 * A dedicated page in the Media Studio. Users provide images (uploaded or
 * AI-generated) + audio (uploaded or from the AI Music Generator); the engine
 * analyzes the audio (BPM/beats/energy), builds a cinematic scene plan, and
 * renders an MP4 (honest `requires_config` when ffmpeg is absent).
 *
 * Not a slideshow: each scene gets camera motion, effects and transitions
 * driven by the real audio analysis.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { musicVideoApi, MV_MODES, MV_STYLES, MV_ASPECTS, type MvMode, type MvStyle, type MvAspect, type MvRenderJob } from "@/lib/musicVideo";
import { musicApi, type MusicTrackRecord } from "@/lib/musicGen";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Clapperboard, Loader2, Plus, Trash2, Play, Download, Image as ImageIcon, Music, Sparkles, Film, Gauge,
} from "lucide-react";

const statusColor: Record<string, string> = {
  queued: "bg-slate-500/15 text-slate-300",
  analyzing: "bg-amber-500/15 text-amber-300",
  storyboarding: "bg-violet-500/15 text-violet-300",
  rendering: "bg-azure-500/15 text-azure-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-rose-500/15 text-rose-300",
  cancelled: "bg-slate-500/15 text-slate-300",
  requires_config: "bg-amber-500/15 text-amber-300",
};

export function MusicVideoPage() {
  const [jobs, setJobs] = useState<MvRenderJob[]>([]);
  const [tracks, setTracks] = useState<MusicTrackRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<MvMode>("single_image");
  const [style, setStyle] = useState<MvStyle>("cinematic");
  const [aspect, setAspect] = useState<MvAspect>("16:9");
  const [customStyle, setCustomStyle] = useState("");
  const [prompt, setPrompt] = useState("");
  // images: allow one "sample" entry to represent an upload/AI image
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState("");
  // audio: pick from generated music tracks or an audio URL
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [audioTrackId, setAudioTrackId] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const [j, t] = await Promise.all([musicVideoApi.jobs(), musicApi.tracks()]);
      setJobs(j); setTracks(t);
    } catch { /* degrades before server config */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const res = await fn();
      if (res) setNotice(res as string);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, [refresh]);

  const addImage = useCallback(() => {
    const v = imageInput.trim();
    if (!v) return;
    setImageUrls((u) => [...u, v]);
    setImageInput("");
  }, [imageInput]);

  const pickTrack = useCallback((t: MusicTrackRecord) => {
    setAudioUrl(t.url ?? "");
    setAudioName(`${t.title} (${t.genre})`);
    setAudioTrackId(t.id);
  }, []);

  const createJob = useCallback(async () => {
    if (!title.trim()) { setErr("Give your music video a title."); return; }
    if (imageUrls.length === 0) { setErr("Add at least one image (or an image URL)."); return; }
    if (!audioUrl.trim()) { setErr("Choose audio — upload a URL or pick a generated track."); return; }
    await run("create", async () => {
      const job = await musicVideoApi.create({
        title: title.trim(),
        mode,
        style: style === "custom" && customStyle ? "custom" : style,
        aspect,
        images: imageUrls.map((url, i) => ({ url, name: `image-${i + 1}`, sortOrder: i })),
        audioUrl: audioUrl.trim(),
        audioName: audioName || "audio",
        audioTrackId,
        customStyle: style === "custom" ? customStyle : undefined,
        prompt: mode === "full_ai" ? prompt : undefined,
      });
      setCreating(false);
      setTitle(""); setImageUrls([]); setAudioUrl(""); setAudioName(""); setAudioTrackId(undefined); setPrompt("");
      return `Music video job created (${job.status}). ${job.status === "requires_config" ? "Install ffmpeg to render the MP4 — the scene plan is ready." : ""}`;
    });
  }, [title, mode, style, customStyle, aspect, imageUrls, audioUrl, audioName, audioTrackId, prompt, run]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Clapperboard className="h-6 w-6 text-azure-400" /> Music Video Generator
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Images + Music → animated, music-synced cinematic video. Part of the Media Studio.
          </p>
        </div>
        <Button onClick={() => { setCreating((c) => !c); setErr(null); }}>
          {creating ? <span className="mr-2">←</span> : <Plus className="h-4 w-4 mr-2" />}
          {creating ? "Back to jobs" : "New Music Video"}
        </Button>
      </div>

      {err && <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</div>}

      {creating ? (
        <Creator
          title={title} setTitle={setTitle} mode={mode} setMode={setMode} style={style} setStyle={setStyle}
          aspect={aspect} setAspect={setAspect} customStyle={customStyle} setCustomStyle={setCustomStyle}
          prompt={prompt} setPrompt={setPrompt} imageUrls={imageUrls} setImageUrls={setImageUrls}
          imageInput={imageInput} setImageInput={setImageInput} addImage={addImage}
          audioUrl={audioUrl} setAudioUrl={setAudioUrl} audioName={audioName} setAudioName={setAudioName}
          audioTrackId={audioTrackId} tracks={tracks} pickTrack={pickTrack} busy={busy} onCreate={createJob}
        />
      ) : (
        <JobsList jobs={jobs} busy={busy} run={run} onRefresh={refresh} />
      )}
    </div>
  );
}

function Creator(props: {
  title: string; setTitle: (s: string) => void; mode: MvMode; setMode: (m: MvMode) => void;
  style: MvStyle; setStyle: (s: MvStyle) => void; aspect: MvAspect; setAspect: (a: MvAspect) => void;
  customStyle: string; setCustomStyle: (s: string) => void; prompt: string; setPrompt: (s: string) => void;
  imageUrls: string[]; setImageUrls: (u: string[]) => void; imageInput: string; setImageInput: (s: string) => void; addImage: () => void;
  audioUrl: string; setAudioUrl: (s: string) => void; audioName: string; setAudioName: (s: string) => void;
  audioTrackId?: string; tracks: MusicTrackRecord[]; pickTrack: (t: MusicTrackRecord) => void; busy: string | null; onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Create a music video</CardTitle>
          <CardDescription>Images + music → AI-animated, beat-synced cinematic video.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Title</label>
            <Input value={props.title} onChange={(e) => props.setTitle(e.target.value)} placeholder="e.g. My Summer Anthem" />
          </div>

          {/* Mode selector */}
          <div>
            <div className="text-sm font-medium text-text-bright mb-2">Video generation mode</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {MV_MODES.map((m) => (
                <button key={m.value} onClick={() => props.setMode(m.value)}
                  className={`rounded-xl border p-3 text-left ${props.mode === m.value ? "border-azure-500 bg-azure-500/10" : "border-border bg-bg-elevated"}`}>
                  <div className="font-medium text-text-bright text-sm">{m.label}</div>
                  <div className="text-xs text-text-muted mt-1">{m.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Visual style</label>
              <Select value={props.style} onChange={(e) => props.setStyle(e.target.value as MvStyle)}>
                {MV_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Export aspect</label>
              <Select value={props.aspect} onChange={(e) => props.setAspect(e.target.value as MvAspect)}>
                {MV_ASPECTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </Select>
            </div>
          </div>

          {props.style === "custom" && (
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Custom brand style</label>
              <Input value={props.customStyle} onChange={(e) => props.setCustomStyle(e.target.value)} placeholder="e.g. warm gold + deep teal, luxury feel" />
            </div>
          )}

          {props.mode === "full_ai" && (
            <div className="space-y-1">
              <label className="text-xs text-text-muted">AI prompt (full AI mode)</label>
              <Input value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} placeholder="Describe the music video you want" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Images</CardTitle>
          <CardDescription>Uploaded, AI-generated or image URLs. Add one or many (scenes in order).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-text-muted">Image URL (JPG/PNG/WEBP/SVG)</label>
              <Input value={props.imageInput} onChange={(e) => props.setImageInput(e.target.value)} placeholder="https://…/image.png" />
            </div>
            <Button size="sm" variant="outline" onClick={props.addImage}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          {props.imageUrls.length === 0 ? (
            <p className="text-sm text-text-muted">No images yet. Add at least one.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {props.imageUrls.map((u, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs">
                  <ImageIcon className="h-3 w-3 text-azure-300" /> #{i + 1}
                  <span className="text-text-muted max-w-[160px] truncate">{u}</span>
                  <button onClick={() => props.setImageUrls(props.imageUrls.filter((_, x) => x !== i))}><Trash2 className="h-3 w-3 text-rose-300" /></button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Music className="h-4 w-4" /> Audio</CardTitle>
          <CardDescription>Uploaded audio, or pick a track from the AI Music Generator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Audio URL (MP3/WAV/OGG…) or use generated music below</label>
            <Input value={props.audioUrl} onChange={(e) => props.setAudioUrl(e.target.value)} placeholder="https://…/audio.wav" />
          </div>
          {props.tracks.length > 0 && (
            <div>
              <div className="text-xs text-text-muted mb-1">From your Music Studio library:</div>
              <div className="flex flex-wrap gap-2">
                {props.tracks.slice(0, 6).map((t) => (
                  <button key={t.id} onClick={() => props.pickTrack(t)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${props.audioTrackId === t.id ? "border-azure-500 bg-azure-500/10 text-azure-200" : "border-border text-text-muted"}`}>
                    <Music className="h-3 w-3 inline mr-1" /> {t.title} ({t.genre})
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={props.onCreate} disabled={props.busy === "create"}>
          {props.busy === "create" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate music video
        </Button>
      </div>
    </div>
  );
}

function JobsList({ jobs, busy, run, onRefresh }: {
  jobs: MvRenderJob[]; busy: string | null; run: (a: string, fn: () => Promise<unknown>) => void; onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Render jobs</CardTitle>
            <CardDescription>Music videos you've created. Progress, status and output.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void onRefresh()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-sm text-text-muted py-8 text-center">
            No music videos yet. Click <span className="text-azure-300">New Music Video</span> to create one.
          </div>
        ) : (
          <div className="grid gap-3">
            {jobs.map((j) => {
              const analysis = j.analysis;
              return (
                <div key={j.id} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-text-bright">{j.title}</div>
                      <div className="text-xs text-text-muted mt-0.5 flex flex-wrap items-center gap-1">
                        <span>{j.mode.replace(/_/g, " ")}</span> · <span>{j.style.replace(/_/g, " ")}</span> · <span>{j.aspect}</span> · <span>{j.images.length} img</span>
                        {analysis?.bpm && <span className="text-azure-300">· ♪ {analysis.bpm} BPM · {analysis.beatTimesSec.length} beats</span>}
                        {analysis?.tempoLabel && <span>· {analysis.tempoLabel}</span>}
                      </div>
                      {j.storyboard && (
                        <div className="text-xs text-text-muted mt-1">
                          {j.storyboard.scenes.length} scenes · total {j.storyboard.totalDurationSec}s
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColor[j.status] ?? ""}>{j.status}</Badge>
                      {j.status === "requires_config" || j.status === "failed" ? (
                        <Button size="sm" variant="outline" onClick={() => void run(`rerun-${j.id}`, async () => { await musicVideoApi.run(j.id); })}>
                          <Gauge className="h-3 w-3 mr-1" /> Retry
                        </Button>
                      ) : null}
                      {(j.status === "queued" || j.status === "analyzing" || j.status === "storyboarding" || j.status === "rendering") && (
                        <Button size="sm" variant="outline" onClick={() => void run(`cancel-${j.id}`, async () => { await musicVideoApi.cancel(j.id); })}>Cancel</Button>
                      )}
                      {j.status === "completed" && j.outputUrl && (
                        <>
                          <video src={j.outputUrl} className="h-16 w-24 rounded object-cover" controls preload="none" />
                          <a href={j.outputUrl} download><Button size="sm" variant="outline"><Download className="h-3 w-3" /></Button></a>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => void run(`del-${j.id}`, async () => { await musicVideoApi.remove(j.id); })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  {(j.status === "analyzing" || j.status === "storyboarding" || j.status === "rendering") && (
                    <div className="mt-2 h-1.5 rounded-full bg-bg-deep/60 overflow-hidden">
                      <div className="h-full bg-azure-500" style={{ width: `${j.progressPct}%` }} />
                    </div>
                  )}
                  {j.error && <div className="mt-2 text-xs text-rose-300">{j.error}</div>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
