/**
 * WINDELS AI VIDEO STUDIO (AI VIDEO TRANSFORMER).
 *
 * Upload a source video, describe the edit in natural language, see the
 * interpreted plan (targets + preserve flags + estimated credits), generate a
 * preview or full video, and watch real backend job progress over SSE.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { vtxApi, type UploadedSource } from "@/lib/videoTransformer";
import type { VtxEditPlan, VtxJob, VtxStage } from "@windels/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Upload, Sparkles, Play, Download, Loader2, Wand2, Cloud } from "lucide-react";

const STAGES: Record<VtxStage, number> = {
  QUEUED: 4, ANALYZING: 14, SEGMENTING: 27, TRACKING: 37, GENERATING: 58,
  COMPOSITING: 76, AUDIO_PROCESSING: 86, QUALITY_CHECK: 92, RENDERING: 97,
  COMPLETED: 100, FAILED: 100, CANCELLED: 100,
};

export default function VideoTransformerPage() {
  const [source, setSource] = useState<UploadedSource | null>(null);
  const [prompt, setPrompt] = useState("Put me on top of the clouds, keep my movement exactly the same.");
  const [plan, setPlan] = useState<VtxEditPlan | null>(null);
  const [estimate, setEstimate] = useState<{ credits: number; runtimeSec: number; model: string; multiStage: boolean } | null>(null);
  const [job, setJob] = useState<VtxJob | null>(null);
  const [progress, setProgress] = useState<{ stage: VtxStage; percent: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preserveAudio, setPreserveAudio] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const evtRef = useRef<EventSource | null>(null);

  // Re-parse + estimate when prompt/source changes.
  useEffect(() => {
    if (!prompt.trim()) { setPlan(null); setEstimate(null); return; }
    const parsed = vtxApi.parse(prompt);
    parsed.then(setPlan).catch(() => {});
    if (source) {
      vtxApi.estimate({ prompt, durationSec: source.meta.durationSec, resolution: "1080p" }).then(setEstimate).catch(() => {});
    }
  }, [prompt, source]);

  // SSE progress subscription.
  useEffect(() => {
    if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return;
    const es = new EventSource(vtxApi.eventsUrl(job.id));
    evtRef.current = es;
    es.onmessage = (e) => { try { const p = JSON.parse(e.data); setProgress(p); } catch { /* ignore */ } };
    const poll = setInterval(async () => {
      const j = await vtxApi.job(job.id); setJob(j);
      if (["succeeded", "failed", "cancelled"].includes(j.status)) { clearInterval(poll); es.close(); }
    }, 1500);
    return () => { clearInterval(poll); es.close(); };
  }, [job?.id]); // eslint-disable-line

  const onUpload = useCallback(async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const src = await vtxApi.upload(file);
      setSource(src);
      // Kick off analysis.
      vtxApi.analyze(src.assetId, prompt).catch(() => {});
    } catch (e: any) { setErr(e?.message ?? "Upload failed"); }
    finally { setBusy(false); }
  }, [prompt]);

  const generate = useCallback(async (preview: boolean) => {
    if (!source) return;
    setBusy(true); setErr(null);
    try {
      const j = await vtxApi.transform({
        sourceAssetId: source.assetId, prompt, resolution: "1080p", preview, previewSeconds: preview ? 5 : undefined,
        projectId: source.projectId,
      });
      setJob(j);
      setProgress({ stage: j.stage, percent: STAGES[j.stage], message: j.message });
    } catch (e: any) { setErr(e?.message ?? "Could not start"); }
    finally { setBusy(false); }
  }, [source, prompt]);

  const resultUrl = job?.resultAssetId ?? job?.previewAssetId;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Wand2 className="w-7 h-7 text-violet" />
        <div>
          <h1 className="text-2xl font-bold text-text-bright">AI Video Transformer</h1>
          <p className="text-sm text-text-muted">Upload a video and tell WINDELS what to change. Motion, timing and identity are preserved.</p>
        </div>
      </div>

      {err && <div className="rounded-lg border border-crimson/40 bg-crimson/10 px-4 py-2 text-sm text-crimson">{err}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Source video</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
            <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} loading={busy}>
              <Upload className="w-4 h-4 mr-1" /> {source ? "Replace video" : "Upload / drop video"}
            </Button>
            {source && (
              <div className="space-y-2 text-xs text-text-muted">
                <video src={source.url} controls className="w-full rounded-lg border border-white/10" />
                <div className="grid grid-cols-2 gap-1">
                  <span>Resolution</span><span className="text-right text-text-main">{source.meta.width}×{source.meta.height}</span>
                  <span>Duration</span><span className="text-right text-text-main">{source.meta.durationSec.toFixed(1)}s</span>
                  <span>FPS</span><span className="text-right text-text-main">{source.meta.fps.toFixed(1)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle>What would you like to change?</CardTitle>
              <CardDescription>Try "Change my shirt to a black suit and put me on clouds."</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Put me on top of the clouds..." />
              {plan && (
                <div className="rounded-lg border border-white/10 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-text-muted">Windels understood</div>
                  <div className="flex flex-wrap gap-2">
                    {plan.edits.map((e) => (
                      <Badge key={e.id} variant="violet">{e.target.replace(/_/g, " ")} → {e.value}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-text-muted pt-1">
                    <span>Preserve:</span>
                    <span>☑ identity</span><span>☑ motion</span><span>☑ camera</span>
                    <label className="flex items-center gap-1 ml-auto"><Switch checked={preserveAudio} onChange={setPreserveAudio} /> audio</label>
                  </div>
                  {estimate && (
                    <div className="text-xs text-text-muted pt-1">
                      Model: <b className="text-text-main">{estimate.model}</b> · est. <b className="text-text-main">{estimate.credits}</b> credits · ~{estimate.runtimeSec}s
                      {estimate.multiStage && <Badge variant="amber" className="ml-2">multi-stage</Badge>}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" disabled={!source || busy} onClick={() => generate(true)}><Play className="w-4 h-4 mr-1" /> 5s preview</Button>
                <Button disabled={!source || busy || !plan?.edits.length} onClick={() => generate(false)}><Sparkles className="w-4 h-4 mr-1" /> Generate full video</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Cloud className="w-4 h-4" /> Result</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {job && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {job.status === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {progress?.message ?? job.message}
                    </span>
                    <Badge variant={job.status === "succeeded" ? "emerald" : job.status === "failed" ? "crimson" : "azure"}>{job.status}</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-violet transition-all" style={{ width: `${progress?.percent ?? STAGES[job.stage] ?? 0}%` }} />
                  </div>
                  {job.status === "failed" && <p className="text-xs text-crimson">{job.error}</p>}
                </div>
              )}
              {resultUrl ? (
                <div className="space-y-2">
                  <video src={resultUrl} controls className="w-full rounded-lg border border-white/10" />
                  <a href={resultUrl} download className="inline-flex items-center gap-1 text-xs text-azure hover:underline"><Download className="w-3 h-3" />Download</a>
                </div>
              ) : <div className="aspect-video rounded-lg border border-dashed border-white/10 flex items-center justify-center text-text-muted text-sm">No result yet</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
