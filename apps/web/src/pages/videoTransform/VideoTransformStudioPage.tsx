/**
 * AI Video Transformation Studio page (§17 / §19–24).
 *
 * Upload a source video, build a typed node workflow (Video Input → Exact Frame
 * → Image Generator → Video Matte → Switch X → Output), watch real-time SSE
 * progress, and compare before/after. Every node executes a real backend
 * operation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vtApi, type VtJob, type VtNodeDef, type VtProviderModel, type VtWorkflow, type VtWorkflowConnection, type VtWorkflowNode, type UploadedSource } from "@/lib/videoTransform";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { NodeCanvas } from "./NodeCanvas";
import { VideoPreview } from "./VideoPreview";
import {
  Clapperboard, Upload, Play, Loader2, Wand2, Scissors, Users, Layers,
  Film, Sparkles, Download, RefreshCw, Save, Trash2, SplitSquareHorizontal,
} from "lucide-react";
import type { VtJobStage } from "@windels/shared";

const STAGE_LABEL: Record<VtJobStage, string> = {
  QUEUED: "Queued", ANALYZING: "Analyzing video", EXTRACTING_FRAME: "Extracting frame",
  GENERATING_REFERENCE: "Generating reference", GENERATING_MATTE: "Creating matte",
  TRANSFORMING_VIDEO: "Transforming video", QUALITY_CHECK: "Quality checking",
  ENCODING: "Finalizing", COMPLETED: "Complete", FAILED: "Failed", CANCELLED: "Cancelled",
};

function uid(p: string) { return p + Math.random().toString(36).slice(2, 10); }

export default function VideoTransformStudioPage() {
  const [defs, setDefs] = useState<VtNodeDef[]>([]);
  const [providers, setProviders] = useState<VtProviderModel[]>([]);
  const [workflow, setWorkflow] = useState<VtWorkflow | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState<UploadedSource | null>(null);
  const [activeJob, setActiveJob] = useState<VtJob | null>(null);
  const [progress, setProgress] = useState<{ stage: VtJobStage; percent: number; message: string } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("Place the person inside a cinematic luxury yacht travelling across the Mediterranean.");
  const [frameNumber, setFrameNumber] = useState(0);
  const [preserve, setPreserve] = useState("high");
  const [transformMode, setTransformMode] = useState("environment_replacement");
  const [resolution, setResolution] = useState("720p");
  const [previewSeconds, setPreviewSeconds] = useState(5);
  const [compareMode, setCompareMode] = useState<"side" | "split" | "original" | "generated">("split");
  const [splitPos, setSplitPos] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const evtRef = useRef<EventSource | null>(null);

  useEffect(() => { void (async () => { setDefs(await vtApi.nodes()); setProviders(await vtApi.providers()); })(); }, []);

  // Subscribe to SSE for the active job.
  useEffect(() => {
    if (!activeJob || ["succeeded", "failed", "cancelled"].includes(activeJob.status)) return;
    const es = new EventSource(vtApi.eventsUrl(activeJob.id));
    evtRef.current = es;
    es.onmessage = (e) => { try { const p = JSON.parse(e.data); setProgress(p); } catch { /* ignore */ } };
    es.addEventListener("snapshot", (e: any) => { try { setProgress(JSON.parse(e.data)); } catch { /* ignore */ } });
    const poll = setInterval(async () => {
      const j = await vtApi.job(activeJob.id); setActiveJob(j);
      if (["succeeded", "failed", "cancelled"].includes(j.status)) {
        clearInterval(poll); es.close();
        if (j.status === "succeeded" && j.resultAssetIds[0]) setResultUrl(j.resultAssetIds[0]);
      }
    }, 1500);
    return () => { clearInterval(poll); es.close(); };
  }, [activeJob?.id]); // eslint-disable-line

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, []);

  const onUpload = useCallback(async (file: File) => {
    await run("upload", async () => {
      const src = await vtApi.uploadSource(file);
      setSource(src); setFrameNumber(Math.floor((src.meta.frameCount || 1) / 2));
      // Auto-build the canonical workflow.
      const wf = await vtApi.createWorkflow({
        name: file.name.replace(/\.[^.]+$/, ""),
        nodes: [
          { id: "n_video", kind: "video_input", x: 40, y: 120, settings: { assetId: src.assetId } },
          { id: "n_frame", kind: "exact_frame", x: 320, y: 60, settings: { frameNumber: Math.floor((src.meta.frameCount || 1) / 2) } },
          { id: "n_img", kind: "image_generator", x: 600, y: 60, settings: { prompt: "", resolution: "1536x1024", quality: "high", aspectRatio: "16:9", quantity: 1, referenceStrength: 0.6 } },
          { id: "n_matte", kind: "video_matte", x: 320, y: 260, settings: { featherPx: 3, expandPx: 2, hairRefinement: true } },
          { id: "n_sx", kind: "switch_x", x: 900, y: 160, settings: { prompt: "", preserveSubject: "high", transformMode: "environment_replacement", resolution: "720p" } },
          { id: "n_out", kind: "output", x: 1200, y: 160, settings: { name: "Final" } },
        ],
        connections: [
          { id: "c1", sourceNode: "n_video", sourcePort: "video", targetNode: "n_frame", targetPort: "video", type: "video" },
          { id: "c2", sourceNode: "n_video", sourcePort: "video", targetNode: "n_matte", targetPort: "video", type: "video" },
          { id: "c3", sourceNode: "n_frame", sourcePort: "image", targetNode: "n_img", targetPort: "ref", type: "reference" },
          { id: "c4", sourceNode: "n_matte", sourcePort: "rgba", targetNode: "n_sx", targetPort: "alpha", type: "rgba" },
          { id: "c5", sourceNode: "n_video", sourcePort: "video", targetNode: "n_sx", targetPort: "source", type: "video" },
          { id: "c6", sourceNode: "n_img", sourcePort: "reference", targetNode: "n_sx", targetPort: "reference", type: "reference" },
          { id: "c7", sourceNode: "n_sx", sourcePort: "video", targetNode: "n_out", targetPort: "video", type: "video" },
        ],
      });
      setWorkflow(wf); setSelected("n_sx");
    });
  }, [run]);

  const selectedNode = useMemo(() => workflow?.nodes.find((n) => n.id === selected) ?? null, [workflow, selected]);

  const updateNode = useCallback((id: string, patch: Partial<VtWorkflowNode>) => {
    setWorkflow((wf) => wf ? { ...wf, nodes: wf.nodes.map((n) => n.id === id ? { ...n, ...patch } : n), version: wf.version + 1 } : wf);
  }, []);

  const mutate = useCallback((nodes: VtWorkflowNode[], connections: VtWorkflowConnection[]) => {
    setWorkflow((wf) => wf ? { ...wf, nodes, connections, version: wf.version + 1 } : wf);
  }, []);

  // Run an individual node (exact frame / image generator / matte / switch X)
  // via a real job.
  const runNode = useCallback(async (node: VtWorkflowNode) => {
    if (!source) return;
    if (node.kind === "exact_frame") {
      const j = await vtApi.createJob({ kind: "exact_frame", sourceAssetId: source.assetId, frameNumber: Number(node.settings.frameNumber ?? frameNumber) });
      setActiveJob(j);
    } else if (node.kind === "image_generator") {
      const j = await vtApi.createJob({
        kind: "image_generate", prompt: String(node.settings.prompt || prompt || "cinematic environment, no people"),
        referenceAssetIds: [], resolution: String(node.settings.resolution ?? "1536x1024"),
        quality: (node.settings.quality as any) ?? "high", aspectRatio: String(node.settings.aspectRatio ?? "16:9"),
        quantity: Number(node.settings.quantity ?? 1), referenceStrength: Number(node.settings.referenceStrength ?? 0.6),
      });
      setActiveJob(j);
    } else if (node.kind === "video_matte") {
      const j = await vtApi.createJob({ kind: "video_matte", sourceAssetId: source.assetId, settings: node.settings as any });
      setActiveJob(j);
    } else if (node.kind === "switch_x" || node.kind === "ai_background_replacement") {
      const ref = workflow?.nodes.find((n) => n.id === "n_img");
      const matte = workflow?.nodes.find((n) => n.id === "n_matte");
      const j = await vtApi.createJob({
        kind: "switch_x", sourceAssetId: source.assetId,
        alphaAssetId: matte?.id ? `rgba-${matte.id}` : undefined,
        prompt: String(node.settings.prompt || prompt),
        referenceAssetId: ref?.id ? `ref-${ref.id}` : undefined,
        preserveSubject: (node.settings.preserveSubject as any) ?? preserve,
        transformMode: (node.settings.transformMode as any) ?? transformMode,
        resolution: (node.settings.resolution as any) ?? resolution,
        previewSeconds: previewSeconds,
      });
      setActiveJob(j);
    }
  }, [source, workflow, frameNumber, prompt, preserve, transformMode, resolution, previewSeconds]);

  const runWorkflow = useCallback(async () => {
    if (!workflow) return;
    await run("workflow", async () => {
      // S210: pre-flight the graph. The server rejects an unrunnable workflow
      // too, but checking here lets us list every problem at once instead of
      // surfacing a single error string.
      setProblems([]);
      const v = await vtApi.validateWorkflow(workflow.id);
      if (!v.valid) { setProblems(v.problems); throw new Error(`Workflow has ${v.problems.length} problem(s) — fix them before running.`); }
      const j = await vtApi.runWorkflow(workflow.id);
      setActiveJob(j);
    });
  }, [workflow, run]);

  const addNode = useCallback((kind: string) => {
    if (!workflow) return;
    const def = defs.find((d) => d.kind === kind); if (!def) return;
    if (def.implemented === false) { setErr(`${def.label} is declared but not implemented — it cannot run in a workflow.`); return; }
    const node: VtWorkflowNode = { id: uid("n_"), kind: kind as any, x: 200 + Math.random() * 200, y: 120 + Math.random() * 120, settings: {} };
    setWorkflow({ ...workflow, nodes: [...workflow.nodes, node], version: workflow.version + 1 });
  }, [workflow, defs]);

  const groupedDefs = useMemo(() => {
    const g: Record<string, VtNodeDef[]> = { input: [], video: [], image: [], ai: [], utility: [] };
    defs.forEach((d) => g[d.category]?.push(d));
    return g;
  }, [defs]);

  const percent = progress?.percent ?? (activeJob?.status === "succeeded" ? 100 : activeJob?.percent ?? 0);
  const stageLabel = progress ? STAGE_LABEL[progress.stage] : activeJob ? STAGE_LABEL[activeJob.stage] : "";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Clapperboard className="w-7 h-7 text-violet" />
        <div>
          <h1 className="text-2xl font-bold text-text-bright">AI Video Transformation Studio</h1>
          <p className="text-sm text-text-muted">Upload a video, extract an exact frame, generate a reference, matte the subject, and run Switch X.</p>
        </div>
      </div>

      {err && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}
      {problems.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <div className="font-semibold mb-1">This workflow cannot run:</div>
          <ul className="list-disc pl-5 space-y-0.5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Left: source + controls */}
        <Card className="xl:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Source video</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
            <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} loading={busy === "upload"}>
              <Upload className="w-4 h-4 mr-1" /> Upload MP4 / MOV / WebM
            </Button>
            {source && (
              <div className="space-y-2 text-xs text-text-muted">
                <div className="rounded-lg overflow-hidden border border-white/10">
                  <video src={source.url} className="w-full" muted />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <span>Resolution</span><span className="text-text-main text-right">{source.meta.width}×{source.meta.height}</span>
                  <span>Duration</span><span className="text-text-main text-right">{source.meta.durationSec.toFixed(1)}s</span>
                  <span>FPS</span><span className="text-text-main text-right">{source.meta.fps.toFixed(2)}</span>
                  <span>Frames</span><span className="text-text-main text-right">{source.meta.frameCount}</span>
                </div>
                <label className="block pt-2">
                  <span className="text-text-muted">Exact frame</span>
                  <Input type="number" min={0} max={source.meta.frameCount - 1} value={frameNumber}
                    onChange={(e) => { setFrameNumber(Number(e.target.value)); if (workflow) updateNode("n_frame", { settings: { frameNumber: Number(e.target.value) } }); }} />
                  <span className="text-[10px] text-text-muted">Frame {frameNumber} / {source.meta.frameCount}</span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Center: canvas + preview */}
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2"><Layers className="w-4 h-4" /> Node workflow</CardTitle>
              <div className="flex gap-2">
                <Select value="" onChange={(e) => addNode(e.target.value)}>
                  <option value="">+ Add node…</option>
                  {/* S210: nodes with no executor are disabled rather than
                      offered — adding one used to build a graph that ran green
                      and returned the input untouched. */}
                  {Object.entries(groupedDefs).map(([cat, list]) => (
                    <optgroup key={cat} label={cat}>{list.map((d) => (
                      <option key={d.kind} value={d.kind} disabled={d.implemented === false}>
                        {d.label}{d.implemented === false ? " (not implemented)" : ""}
                      </option>
                    ))}</optgroup>
                  ))}
                </Select>
                <Button size="sm" variant="secondary" onClick={runWorkflow} loading={busy === "workflow"} disabled={!workflow}><Play className="w-4 h-4 mr-1" />Run</Button>
              </div>
            </CardHeader>
            <CardContent>
              {workflow ? (
                <NodeCanvas nodes={workflow.nodes} connections={workflow.connections} defs={defs}
                  selectedId={selected} onSelect={setSelected} onChange={mutate}
                  onRunNode={runNode} runningNodeId={activeJob?.status === "running" ? selected : null} />
              ) : (
                <div className="h-[560px] flex items-center justify-center text-text-muted border border-dashed border-white/10 rounded-xl">Upload a video to auto-build the workflow</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><SplitSquareHorizontal className="w-4 h-4" /> Before / After</CardTitle>
              <div className="flex gap-1">
                {(["original", "generated", "side", "split"] as const).map((m) => (
                  <Button key={m} size="sm" variant={compareMode === m ? "primary" : "outline"} onClick={() => setCompareMode(m)}>{m}</Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3" style={{ gridTemplateColumns: compareMode === "side" ? "1fr 1fr" : "1fr" }}>
                {(compareMode === "original" || compareMode === "side") && source && (
                  <div><div className="text-xs text-text-muted mb-1">Original</div><VideoPreview src={source.url} fps={source.meta.fps} meta={source.meta} /></div>
                )}
                {(compareMode === "generated" || compareMode === "side") && (
                  <div><div className="text-xs text-text-muted mb-1">Generated</div>{resultUrl ? <VideoPreview src={resultUrl} fps={source?.meta.fps ?? 30} /> : <div className="aspect-video rounded-lg border border-white/10 flex items-center justify-center text-text-muted text-sm">No result yet — run Switch X</div>}</div>
                )}
                {compareMode === "split" && source && resultUrl && (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10">
                    <video src={source.url} className="absolute inset-0 w-full h-full object-contain" muted loop onMouseEnter={(e) => e.currentTarget.play()} />
                    <div className="absolute inset-0 overflow-hidden" style={{ width: `${splitPos}%` }}>
                      <video src={resultUrl} className="absolute inset-0 h-full object-contain" style={{ width: "100vw", maxWidth: "none" }} muted loop onMouseEnter={(e) => e.currentTarget.play()} />
                    </div>
                    <input type="range" min={0} max={100} value={splitPos} onChange={(e) => setSplitPos(Number(e.target.value))} className="absolute bottom-2 left-2 right-2 accent-violet-500" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: settings + progress */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Switch X</CardTitle>
              <CardDescription>Preserve the subject, transform the world.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={3} value={prompt} onChange={(e) => { setPrompt(e.target.value); if (workflow) updateNode("n_sx", { settings: { ...workflow.nodes.find(n=>n.id==="n_sx")?.settings, prompt: e.target.value } }); }} placeholder="Place the person in a..." />
              <label className="block text-xs">
                Preserve subject
                <Select value={preserve} onChange={(e) => { setPreserve(e.target.value); updateNode("n_sx", { settings: { preserveSubject: e.target.value } }); }}>
                  {["maximum", "high", "balanced", "creative"].map((o) => <option key={o}>{o}</option>)}
                </Select>
              </label>
              <label className="block text-xs">
                Transform mode
                <Select value={transformMode} onChange={(e) => { setTransformMode(e.target.value); updateNode("n_sx", { settings: { transformMode: e.target.value } }); }}>
                  {["background_only", "subject_and_background", "full_scene", "environment_replacement", "cinematic_restyle"].map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">Resolution
                  <Select value={resolution} onChange={(e) => { setResolution(e.target.value); updateNode("n_sx", { settings: { resolution: e.target.value } }); }}>
                    {["480p", "720p", "1080p", "1440p", "4k"].map((o) => <option key={o}>{o}</option>)}
                  </Select>
                </label>
                <label className="block text-xs">Preview (s)
                  <Input type="number" min={3} max={30} value={previewSeconds} onChange={(e) => setPreviewSeconds(Number(e.target.value))} />
                </label>
              </div>
              <Button className="w-full" onClick={() => selectedNode && runNode(workflow!.nodes.find(n=>n.id==="n_sx")!)} loading={busy === "switch"} disabled={!source}>
                <Sparkles className="w-4 h-4 mr-1" /> Generate {previewSeconds}s preview
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Film className="w-4 h-4" /> Progress</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activeJob ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">{activeJob.status === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{stageLabel}</span>
                    <Badge variant={activeJob.status === "succeeded" ? "success" : activeJob.status === "failed" ? "danger" : "azure"}>{activeJob.status}</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-violet-500 transition-all" style={{ width: `${percent}%` }} /></div>
                  <div className="text-xs text-text-muted">{percent}% · est. {activeJob.estimatedCredits} credits · ~{activeJob.estimatedRuntimeSec}s</div>
                  {activeJob.status === "failed" && <div className="text-xs text-rose-300">{activeJob.error}</div>}
                  <div className="flex gap-2">
                    {["running", "queued"].includes(activeJob.status) && <Button size="sm" variant="outline" onClick={() => vtApi.cancelJob(activeJob.id)}>Cancel</Button>}
                    {resultUrl && <a href={resultUrl} download className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><Download className="w-3 h-3" />Download</a>}
                  </div>
                </>
              ) : <p className="text-sm text-text-muted">No active job.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Models</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {providers.map((m) => (
                <div key={m.modelId} className="flex items-center justify-between text-xs">
                  <span>{m.label}</span>
                  <Badge variant={m.configured && m.status === "online" ? "success" : "default"}>{m.status}{m.configured ? "" : " (not configured)"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
