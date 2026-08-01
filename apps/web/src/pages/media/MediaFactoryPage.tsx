/**
 * Media Factory page — real video pipeline UI.
 * Pipes user script to /media-factory/pipeline/render and shows the resulting
 * MP4 (playable via <video>) or clear "VIDEO RENDERER NOT CONFIGURED" banner.
 *
 * Publishing (Session 77B): real OAuth connect per platform, publish any
 * rendered MP4 (or any media URL) with optional scheduling, a live job board
 * with retry/cancel, and the org audit feed. Success is never faked: the UI
 * surfaces NOT_CONNECTED / credential errors exactly as returned.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { publishingApi, type PubJob, type PubPlatformId, type PubPlatformInfo, type PubAuditEvent, type PubUploadRecord, type PubWebhookConfig, type PubWebhookRegistration } from "@/lib/mediaFactory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Film, Upload, Video, Loader2, CheckCircle2, AlertTriangle, Youtube, Music2,
  Send, Link2, Unlink, RotateCcw, XCircle, ExternalLink, CalendarClock, History,
  FileUp, Copy, RadioTower, Trash2, Building2,
} from "lucide-react";

type Aspect = "16:9"|"9:16"|"1:1";
interface RenderJob {
  id: string; title: string; aspect: Aspect; durationSec: number; script: string;
  status: "queued"|"rendering"|"ready"|"failed"|"requires-config";
  outputUrl?: string; width:number; height:number; sizeBytes?:number; error?:string;
  stages?: Record<string,{status:string;detail?:string}>;
  createdAt: string; updatedAt: string;
}

const JOB_BADGE: Record<PubJob["status"], { cls: string; label: string }> = {
  queued:    { cls: "bg-azure/15 text-azure border-azure/30", label: "Queued" },
  scheduled: { cls: "bg-violet-500/15 text-violet-300 border-violet-500/30", label: "Scheduled" },
  uploading: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Uploading" },
  published: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "Published" },
  failed:    { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: "Failed" },
  cancelled: { cls: "bg-white/10 text-text-muted border-white/20", label: "Cancelled" },
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function MediaFactoryPage() {
  const [title, setTitle] = useState("Windels Market Briefing");
  const [script, setScript] = useState("Welcome to Windels AI OS. This video was rendered by the real ffmpeg pipeline. Scene one: market overview. Scene two: trading intelligence. Scene three: risk assessment. Scene four: decision support. Always verify with your own research.");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [duration, setDuration] = useState(8);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ffmpeg, setFfmpeg] = useState<boolean | null>(null);

  // ── Publishing state ─────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<PubPlatformInfo[] | null>(null);
  const [pubJobs, setPubJobs] = useState<PubJob[]>([]);
  const [audit, setAudit] = useState<PubAuditEvent[]>([]);
  const [pubNotice, setPubNotice] = useState<string | null>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const [pubPlatform, setPubPlatform] = useState<PubPlatformId>("youtube");
  const [pubTitle, setPubTitle] = useState("");
  const [pubDescription, setPubDescription] = useState("");
  const [pubSchedule, setPubSchedule] = useState("");
  const [pubBusy, setPubBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState<string | null>(null);
  // Completion pass state: uploads, webhooks, org token usage, media source.
  const [pubMediaUrl, setPubMediaUrl] = useState<string | null>(null);
  const [pubUploads, setPubUploads] = useState<PubUploadRecord[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [webhooks, setWebhooks] = useState<PubWebhookConfig[]>([]);
  const [whBusy, setWhBusy] = useState<string | null>(null);
  const [whRegistration, setWhRegistration] = useState<PubWebhookRegistration | null>(null);
  const [useOrgToken, setUseOrgToken] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshPublishing = useCallback(async () => {
    try {
      const [p, j, a] = await Promise.all([
        publishingApi.platforms(),
        publishingApi.jobs({ limit: 30 }),
        publishingApi.audit(12),
      ]);
      setPlatforms(p);
      setPubJobs(j);
      setAudit(a);
    } catch { /* publishing endpoints are admin-gated; page degrades silently */ }
    try {
      const [u, w] = await Promise.all([publishingApi.uploads(20), publishingApi.webhooks()]);
      setPubUploads(u);
      setWebhooks(w);
    } catch { /* uploads/webhooks are optional surface; degrade silently */ }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.get<{ffmpeg:boolean}>("/media-factory/pipeline/status");
      setFfmpeg(s.ffmpeg);
    } catch {}
    void refreshPublishing();
  }, [refreshPublishing]);

  // Handle OAuth provider return (?code&state on the page URL).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      void (async () => {
        try {
          await publishingApi.completeOAuth({ code, state });
          setPubNotice("Account connected successfully.");
        } catch (e) {
          setPubError(e instanceof ApiError ? e.message : String(e));
        } finally {
          window.history.replaceState({}, "", window.location.pathname);
          void refreshPublishing();
        }
      })();
    }
  }, [refreshPublishing]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // Live-poll while any job is in flight.
  const anyActive = useMemo(() => pubJobs.some((j) => ["queued", "scheduled", "uploading"].includes(j.status)), [pubJobs]);
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (anyActive) {
      pollRef.current = setInterval(() => void refreshPublishing(), 8000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [anyActive, refreshPublishing]);

  // Prefill the publish form when a render completes.
  useEffect(() => {
    if (job?.status === "ready") {
      setPubTitle((t) => t || job.title);
      setPubDescription((d) => d || job.script.slice(0, 300));
    }
  }, [job?.status, job?.title, job?.script]);

  const render = useCallback(async () => {
    setBusy(true); setErr(null); setJob(null);
    try {
      const j = await api.post<RenderJob>("/media-factory/pipeline/render", { title, script, aspect, durationSec: duration });
      setJob(j);
      if (j.status === "failed") setErr(j.error ?? "Render failed.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally { setBusy(false); }
  }, [title, script, aspect, duration]);

  const connect = useCallback(async (platform: PubPlatformId, scope: "user" | "org" = "user") => {
    setConnectBusy(`${platform}:${scope}`); setPubError(null); setPubNotice(null);
    try {
      const r = await publishingApi.connectStart(platform, scope);
      if (r.authUrl) {
        window.open(r.authUrl, "_blank", "noopener,width=720,height=860");
        setPubNotice(scope === "org"
          ? `Complete the consent in the new window — this will connect ${platform} as the organization-shared account.`
          : "Complete the consent in the new window — you'll return here automatically.");
      } else {
        setPubError(r.error ?? "Platform credentials not configured on the server.");
      }
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    } finally { setConnectBusy(null); }
  }, []);

  const disconnect = useCallback(async (platform: PubPlatformId, scope: "user" | "org" = "user") => {
    setConnectBusy(`${platform}:${scope}`); setPubError(null);
    try {
      await publishingApi.disconnect(platform, scope);
      setPubNotice(`${platform} ${scope === "org" ? "org" : "account"} disconnected.`);
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    } finally { setConnectBusy(null); }
  }, [refreshPublishing]);

  const uploadMedia = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setUploadBusy(true); setPubError(null); setPubNotice(null);
    try {
      const rec = await publishingApi.upload(file);
      setPubMediaUrl(rec.url);
      setPubNotice(`Uploaded ${rec.fileName} (${Math.round(rec.sizeBytes / 1024)} KB) — ready to publish.`);
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    } finally { setUploadBusy(false); }
  }, [refreshPublishing]);

  const registerWebhook = useCallback(async (platform: PubPlatformId) => {
    setWhBusy(platform); setPubError(null); setWhRegistration(null);
    try {
      const reg = await publishingApi.registerWebhook(platform);
      setWhRegistration(reg);
      setPubNotice(`Webhook registered for ${platform} — copy the secret now (it is shown once).`);
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    } finally { setWhBusy(null); }
  }, [refreshPublishing]);

  const deleteWebhook = useCallback(async (platform: PubPlatformId) => {
    setWhBusy(platform); setPubError(null);
    try {
      await publishingApi.deleteWebhook(platform);
      setPubNotice(`Webhook removed for ${platform}.`);
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    } finally { setWhBusy(null); }
  }, [refreshPublishing]);

  const deleteUpload = useCallback(async (file: string) => {
    setPubError(null);
    try {
      await publishingApi.deleteUpload(file);
      setPubMediaUrl((u) => (u?.includes(file) ? null : u));
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    }
  }, [refreshPublishing]);

  const publish = useCallback(async () => {
    setPubBusy(true); setPubError(null); setPubNotice(null);
    try {
      const mediaUrl = pubMediaUrl ?? job?.outputUrl;
      if (!mediaUrl) throw new Error("Render a video or upload media first.");
      const out = await publishingApi.publish(pubPlatform, {
        title: pubTitle.trim(),
        description: pubDescription.trim() || undefined,
        mediaUrl,
        scheduledAt: pubSchedule ? new Date(pubSchedule).toISOString() : undefined,
        idempotencyKey: job?.id ? `render-${job.id}-${pubPlatform}` : undefined,
        tokenScope: useOrgToken ? "org" : undefined,
      });
      setPubNotice(out.deduplicated
        ? `Already submitted — reusing existing job ${out.job.id}.`
        : out.job.status === "scheduled"
          ? `Scheduled for ${fmtTime(out.job.input.scheduledAt)} (job ${out.job.id}).`
          : `Publish job queued (${out.job.id}). Upload starts within seconds.`);
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof Error ? e.message : String(e));
    } finally { setPubBusy(false); }
  }, [job, pubMediaUrl, pubPlatform, pubTitle, pubDescription, pubSchedule, useOrgToken, refreshPublishing]);

  const jobAction = useCallback(async (id: string, action: "retry" | "cancel") => {
    try {
      if (action === "retry") await publishingApi.retry(id);
      else await publishingApi.cancel(id);
      void refreshPublishing();
    } catch (e) {
      setPubError(e instanceof ApiError ? e.message : String(e));
    }
  }, [refreshPublishing]);

  const selectedPlatform = platforms?.find((p) => p.id === pubPlatform);

  return (
    <div className="space-y-5 p-1">
      <div>
        <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><Film className="h-6 w-6 text-azure"/> Media Factory</h1>
        <p className="text-sm text-text-muted mt-1">IDEA → RESEARCH → SCRIPT → VISUALS → VOICE → VIDEO → QC → PUBLISH. Real MP4 output via ffmpeg.</p>
      </div>

      {ffmpeg === false && <DataBanner variant="no-creds" title="VIDEO RENDERER NOT CONFIGURED" message="Install ffmpeg on the server to enable real video rendering."/>}
      {platforms && platforms.every(p => !p.configured) && (
        <DataBanner variant="no-creds" title="PUBLISHING CREDENTIALS REQUIRED" message="Configure YouTube/TikTok/Instagram/Facebook/X/Pinterest OAuth credentials to publish rendered videos."/>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Compose &amp; Render</CardTitle><CardDescription>Write a short script, pick an aspect ratio, and render an MP4.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Title</label>
              <Input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Script / Voiceover</label>
              <Textarea rows={6} value={script} onChange={e=>setScript(e.target.value)} maxLength={5000}/>
              <div className="text-[11px] text-text-muted text-right mt-1">{script.length}/5000</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-muted">Aspect</label>
                <Select value={aspect} onChange={e=>setAspect(e.target.value as Aspect)}>
                  <option value="16:9">16:9 Horizontal (YouTube)</option>
                  <option value="9:16">9:16 Vertical (TikTok/Reels/Shorts)</option>
                  <option value="1:1">1:1 Square (Instagram)</option>
                </Select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-muted">Duration (seconds)</label>
                <Input type="number" min={3} max={60} value={duration} onChange={e=>setDuration(Number(e.target.value))}/>
              </div>
            </div>
            <Button onClick={render} disabled={busy || !script.trim() || ffmpeg === false} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Video className="h-4 w-4"/>} Render MP4
            </Button>
            {err && <DataBanner variant="no-creds" title="RENDER ERROR" message={err}/>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Publishing Platforms</CardTitle><CardDescription>Connect a personal or org-shared account, then publish any rendered video.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {!platforms && <div className="text-sm text-text-muted">Loading…</div>}
            {platforms?.map(p => (
              <div key={p.id} className="p-2 rounded-lg bg-white/[0.03] space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {p.id === "youtube" ? <Youtube className="h-4 w-4 text-rose-400"/> : <Upload className="h-4 w-4 text-azure"/>}
                    <span className="text-sm capitalize">{p.id === "x" ? "X / Twitter" : p.id}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {p.connected && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Connected</Badge>}
                    {p.orgConnected && <Badge className="bg-azure/15 text-azure border-azure/30 gap-1"><Building2 className="h-3 w-3"/> Org</Badge>}
                    {!p.connected && !p.orgConnected && !p.needsReauth && !p.orgNeedsReauth && (
                      <Badge variant="outline" className="text-amber-300">{p.configured ? "Not connected" : "Credentials required"}</Badge>
                    )}
                    {(p.needsReauth || p.orgNeedsReauth) && <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">Reconnect needed</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.connected || p.needsReauth ? (
                    <Button size="sm" variant="outline" onClick={() => disconnect(p.id, "user")} disabled={connectBusy === `${p.id}:user`} className="gap-1 h-7 text-xs">
                      {connectBusy === `${p.id}:user` ? <Loader2 className="h-3 w-3 animate-spin"/> : <Unlink className="h-3 w-3"/>} Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => connect(p.id, "user")} disabled={!p.configured || connectBusy === `${p.id}:user`} className="gap-1 h-7 text-xs">
                      {connectBusy === `${p.id}:user` ? <Loader2 className="h-3 w-3 animate-spin"/> : <Link2 className="h-3 w-3"/>} Connect
                    </Button>
                  )}
                  {p.orgConnected || p.orgNeedsReauth ? (
                    <Button size="sm" variant="outline" onClick={() => disconnect(p.id, "org")} disabled={connectBusy === `${p.id}:org`} className="gap-1 h-7 text-xs" title="Disconnect the org-shared account">
                      {connectBusy === `${p.id}:org` ? <Loader2 className="h-3 w-3 animate-spin"/> : <Building2 className="h-3 w-3"/>} Unlink org
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => connect(p.id, "org")} disabled={!p.configured || connectBusy === `${p.id}:org`} className="gap-1 h-7 text-xs" title="Connect one org-shared account the whole team can publish with">
                      {connectBusy === `${p.id}:org` ? <Loader2 className="h-3 w-3 animate-spin"/> : <Building2 className="h-3 w-3"/>} Connect org
                    </Button>
                  )}
                  {p.connected && p.expiresAt && <span className="text-[11px] text-text-muted self-center">token until {fmtTime(p.expiresAt)}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {job && (
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">{job.title}
                {job.status === "ready" && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3"/> Ready</Badge>}
                {job.status === "requires-config" && <Badge variant="outline" className="text-amber-300 gap-1"><AlertTriangle className="h-3 w-3"/> Config required</Badge>}
                {job.status === "failed" && <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30">Failed</Badge>}
              </CardTitle>
              <CardDescription>{job.width}×{job.height} · {job.durationSec}s · {job.aspect} · {job.sizeBytes ? Math.round(job.sizeBytes/1024)+" KB" : "—"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.outputUrl && job.status === "ready" && (
              <video controls src={job.outputUrl} className="w-full max-h-[60vh] rounded-lg bg-black"/>
            )}
            {job.stages && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {Object.entries(job.stages).map(([k,v]) => (
                  <div key={k} className={`p-2 rounded-lg border ${v.status==='done'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-300':v.status==='failed'?'border-rose-500/30 bg-rose-500/10 text-rose-300':'border-white/10 bg-white/5 text-text-muted'}`}>
                    <div className="font-semibold uppercase tracking-wider">{k}</div>
                    <div className="truncate">{v.detail ?? v.status}</div>
                  </div>
                ))}
              </div>
            )}

            {job.status === "ready" && (
              <div className="mt-2 p-3 rounded-lg border border-azure/25 bg-azure/5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-bright"><Send className="h-4 w-4 text-azure"/> Publish this video</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-text-muted">Platform</label>
                    <Select value={pubPlatform} onChange={e=>setPubPlatform(e.target.value as PubPlatformId)}>
                      {(platforms ?? []).map(p => <option key={p.id} value={p.id}>{p.id === "x" ? "X / Twitter" : p.id[0]!.toUpperCase() + p.id.slice(1)}{p.connected || p.orgConnected ? " ✓" : ""}</option>)}
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] uppercase tracking-wider text-text-muted">Post title</label>
                    <Input value={pubTitle} onChange={e=>setPubTitle(e.target.value)} maxLength={selectedPlatform?.maxTitle ?? 100}/>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-text-muted flex items-center gap-1"><CalendarClock className="h-3 w-3"/> Schedule (optional)</label>
                    <Input type="datetime-local" value={pubSchedule} onChange={e=>setPubSchedule(e.target.value)}/>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-muted">Description / caption</label>
                  <Textarea rows={2} value={pubDescription} onChange={e=>setPubDescription(e.target.value)} maxLength={selectedPlatform?.maxDescription ?? 2200}/>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-text-muted flex items-center gap-1"><FileUp className="h-3 w-3"/> Media source</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {job.outputUrl && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" className="accent-azure" checked={!pubMediaUrl} onChange={() => setPubMediaUrl(null)}/>
                        Rendered MP4 ({job.title})
                      </label>
                    )}
                    {pubMediaUrl && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" className="accent-azure" checked={!!pubMediaUrl} onChange={() => {}} readOnly/>
                        Uploaded file ({pubUploads.find(u => u.url === pubMediaUrl)?.fileName ?? pubMediaUrl.split("/").pop()})
                      </label>
                    )}
                    <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={(e) => { void uploadMedia(e.target.files?.[0]); e.target.value = ""; }}/>
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploadBusy} className="gap-1 h-7 text-xs">
                      {uploadBusy ? <Loader2 className="h-3 w-3 animate-spin"/> : <FileUp className="h-3 w-3"/>} Upload media…
                    </Button>
                  </div>
                  {pubUploads.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pubUploads.map(u => (
                        <button key={u.file} onClick={() => setPubMediaUrl(u.url)}
                          className={`px-2 py-0.5 rounded-md text-[11px] border ${pubMediaUrl === u.url ? "border-azure/60 bg-azure/15 text-azure" : "border-white/10 bg-white/5 text-text-muted hover:border-white/30"}`}>
                          {u.fileName} ({Math.round(u.sizeBytes / 1024)} KB)
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPlatform?.orgConnected && (
                  <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
                    <input type="checkbox" className="accent-azure" checked={useOrgToken} onChange={(e) => setUseOrgToken(e.target.checked)}/>
                    <Building2 className="h-3.5 w-3.5 text-azure"/> Publish with the organization-shared {pubPlatform} account
                  </label>
                )}
                <div className="flex items-center gap-3">
                  <Button onClick={publish} disabled={pubBusy || !pubTitle.trim() || !((useOrgToken && selectedPlatform?.orgConnected) || (!useOrgToken && selectedPlatform?.connected))} className="gap-2">
                    {pubBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                    {pubSchedule ? "Schedule post" : "Publish now"}
                  </Button>
                  {selectedPlatform && !(selectedPlatform.connected || selectedPlatform.orgConnected) && (
                    <span className="text-xs text-amber-300">Connect {pubPlatform} (or the org account) first to publish.</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {pubError && <DataBanner variant="no-creds" title="PUBLISHING" message={pubError}/>}
      {pubNotice && !pubError && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0"/> {pubNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Publish Jobs</CardTitle><CardDescription>Org-scoped queue with automatic retry (30s·2ⁿ backoff, max 5 attempts).</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {pubJobs.length === 0 && <div className="text-sm text-text-muted">No publish jobs yet. Render a video and publish it above.</div>}
            {pubJobs.map(j => (
              <div key={j.id} className="p-2.5 rounded-lg bg-white/[0.03] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="capitalize shrink-0">{j.platform}</Badge>
                    <span className="text-sm truncate">{j.input.title}</span>
                  </div>
                  <Badge className={JOB_BADGE[j.status].cls}>{JOB_BADGE[j.status].label}</Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span className="flex items-center gap-2">
                    {j.tokenScope === "org" && <Badge className="bg-azure/15 text-azure border-azure/30 h-5">org token</Badge>}
                    <span>
                      attempt {j.attempts}/{j.maxAttempts}
                      {j.status === "queued" && j.nextAttemptAt > Date.now() && <> · retry {fmtTime(new Date(j.nextAttemptAt).toISOString())}</>}
                      {j.status === "scheduled" && <> · due {fmtTime(j.input.scheduledAt)}</>}
                      {j.publishedAt && <> · {fmtTime(j.publishedAt)}</>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {j.result?.url && (
                      <a href={j.result.url} target="_blank" rel="noreferrer" className="text-azure hover:underline flex items-center gap-1">
                        Open post <ExternalLink className="h-3 w-3"/>
                      </a>
                    )}
                    {j.status === "failed" && (
                      <button onClick={() => jobAction(j.id, "retry")} className="text-azure hover:underline flex items-center gap-1"><RotateCcw className="h-3 w-3"/> Retry</button>
                    )}
                    {["queued","scheduled","failed"].includes(j.status) && (
                      <button onClick={() => jobAction(j.id, "cancel")} className="text-rose-300 hover:underline flex items-center gap-1"><XCircle className="h-3 w-3"/> Cancel</button>
                    )}
                  </span>
                </div>
                {j.platformStatus && (
                  <div className="text-[11px] text-azure/90 flex items-center gap-1.5">
                    <RadioTower className="h-3 w-3"/>
                    platform: {j.platformStatus}
                    {j.platformAvailableAt && <> · available {fmtTime(j.platformAvailableAt)}</>}
                  </div>
                )}
                {/* S77 ChildSafetyReviewer verdict. Blocked content never reaches
                    this list (createJob throws before persisting), so the only
                    state worth surfacing is child-targeted content awaiting an
                    age-appropriateness decision a keyword screen cannot make. */}
                {j.safety === "child-targeted-review" && (
                  <div className="text-[11px] text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3"/>
                    child-targeted — needs age-appropriateness review before publishing
                  </div>
                )}
                {j.statusHistory && j.statusHistory.length > 1 && (
                  <details className="text-[11px] text-text-muted">
                    <summary className="cursor-pointer hover:text-text-bright">History ({j.statusHistory.length})</summary>
                    <ul className="mt-1 space-y-0.5 pl-2 border-l border-white/10">
                      {j.statusHistory.slice(-8).map((h, i) => (
                        <li key={i}>{fmtTime(h.at)} · <span className="text-text-bright">{h.status}</span>{h.detail ? ` — ${h.detail}` : ""}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {j.error && <div className="text-[11px] text-rose-300/90">{j.error.code}: {j.error.message}</div>}
                {j.result?.warnings?.map((w, i) => <div key={i} className="text-[11px] text-amber-300/80">{w}</div>)}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4 text-azure"/>Audit Trail</CardTitle><CardDescription>Every connect and job transition, newest first.</CardDescription></CardHeader>
          <CardContent className="space-y-1.5">
            {audit.length === 0 && <div className="text-sm text-text-muted">No publishing activity recorded yet.</div>}
            {audit.map(a => (
              <div key={a.id} className="text-xs flex items-start justify-between gap-2 py-1 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <span className={`font-mono ${a.kind.includes("failed") ? "text-rose-300" : a.kind.includes("published") || a.kind.includes("success") ? "text-emerald-300" : "text-text-bright"}`}>{a.kind}</span>
                  {a.platform && <span className="text-text-muted"> · {a.platform}</span>}
                  {a.detail && <div className="text-text-muted truncate">{a.detail}</div>}
                </div>
                <span className="text-text-muted shrink-0">{new Date(a.at).toLocaleTimeString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RadioTower className="h-5 w-5 text-azure"/>Webhook Status Sync</CardTitle>
          <CardDescription>Register a callback endpoint per platform, then platforms push post-processing state (processing → available / rejected) onto your jobs. Sign the callback at the platform with the secret below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!platforms && <div className="text-sm text-text-muted">Loading…</div>}
          {(platforms ?? []).map(p => {
            const cfg = webhooks.find(w => w.platform === p.id);
            return (
              <div key={p.id} className="p-2 rounded-lg bg-white/[0.03] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm capitalize">{p.id === "x" ? "X / Twitter" : p.id}</span>
                  <div className="flex items-center gap-2">
                    {cfg
                      ? <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Registered</Badge>
                      : <Badge variant="outline" className="text-amber-300">Not registered</Badge>}
                    <Button size="sm" variant="outline" onClick={() => cfg ? void deleteWebhook(p.id) : void registerWebhook(p.id)} disabled={whBusy === p.id} className="gap-1 h-7 text-xs">
                      {whBusy === p.id ? <Loader2 className="h-3 w-3 animate-spin"/> : cfg ? <Trash2 className="h-3 w-3"/> : <RadioTower className="h-3 w-3"/>}
                      {cfg ? "Remove" : "Register"}
                    </Button>
                  </div>
                </div>
                {(cfg || whRegistration?.platform === p.id) && (
                  <div className="space-y-1 text-[11px] text-text-muted">
                    <div className="flex items-center gap-2">
                      <code className="truncate bg-black/30 px-1.5 py-0.5 rounded">{cfg?.callbackUrl ?? whRegistration?.callbackUrl}</code>
                      <button onClick={() => { void navigator.clipboard?.writeText(cfg?.callbackUrl ?? whRegistration?.callbackUrl ?? ""); setPubNotice("Callback URL copied."); }} className="text-azure hover:underline shrink-0 flex items-center gap-1"><Copy className="h-3 w-3"/> Copy</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Secret: <code className="bg-black/30 px-1.5 py-0.5 rounded">{whRegistration?.platform === p.id ? whRegistration.secret : cfg?.secret}</code></span>
                      {whRegistration?.platform === p.id && <span className="text-amber-300">shown once — copy it now</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Music2 className="h-5 w-5 text-azure"/>Pipeline Stages</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            {["IDEA","RESEARCH","SCRIPT","VISUALS","VOICE","VIDEO","QC","PUBLISH","ANALYZE","LEARN"].map((s,i)=>(
              <li key={s} className="p-2 rounded-lg border border-white/10 bg-white/[0.03] text-center">
                <div className="text-[10px] text-text-muted">Step {i+1}</div>
                <div className="font-semibold">{s}</div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default MediaFactoryPage;
