/**
 * Session 203 — Camera Heart Scan (thumb PPG) for the Heart Center.
 *
 * How it works: the user presses a thumb (or fingertip) firmly over the phone
 * camera with the light on. Each heartbeat changes how much red light the
 * finger lets through, so sampling the video's mean red-channel intensity
 * yields a PPG waveform. Beat peaks → RR intervals → heart rate + HRV, all
 * computed client-side by the pure functions in lib/thumbScan.ts.
 *
 * Honesty rules (same as the whole Heart Center):
 *   - during the scan only PROGRESS and signal guidance are shown — no results
 *   - results and the heart report appear only after the scan is COMPLETE
 *   - a weak signal means "retry", never an invented number
 *   - measurements are recorded via POST /heart/measure with source
 *     "phone_camera", which the backend always stores as a wellness estimate
 *
 * Browser support notes: torch control requires Chrome/Android; on browsers
 * without it (e.g. iOS Safari) the UI instructs the user to press firmly over
 * the lens so no ambient light leaks in. getUserMedia requires HTTPS.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, Camera, CheckCircle2, Flashlight, HeartPulse, Loader2, RotateCcw,
} from "lucide-react";
import {
  analyzeScan, coverageRatio, signalQuality, type PpgSample, type ScanAnalysis,
} from "@/lib/thumbScan";
import { heartApi, type QuickHeartMeasureResult } from "@/lib/healthEcosystem";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";

type Phase = "idle" | "scanning" | "processing" | "complete" | "error";

export interface ThumbScanOutcome {
  analysis: ScanAnalysis;
  durationMs: number;
  recorded: QuickHeartMeasureResult | null;
}

const DURATIONS = [
  { label: "15 seconds", value: 15 },
  { label: "20 seconds (recommended)", value: 20 },
  { label: "30 seconds", value: 30 },
];

const SAMPLE_W = 48;
const SAMPLE_H = 36;

export function ThumbScanCard({ onComplete }: { onComplete?: (o: ThumbScanOutcome) => void | Promise<void> }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [durationSec, setDurationSec] = useState(20);
  const [errorMsg, setErrorMsg] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [quality, setQuality] = useState<"no_signal" | "weak" | "good">("no_signal");
  const [covered, setCovered] = useState(false);
  const [outcome, setOutcome] = useState<ThumbScanOutcome | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const samplesRef = useRef<PpgSample[]>([]);
  const startRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    tickRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try { track.stop(); } catch { /* already stopped */ }
      }
    }
    streamRef.current = null;
    setTorchOn(false);
  }, []);

  // Cleanup on unmount.
  useEffect(() => stopCamera, [stopCamera]);

  const finishScan = useCallback(async () => {
    stopCamera();
    setPhase("processing");
    try {
      const samples = samplesRef.current;
      const durationMs = performance.now() - startRef.current;
      const analysis = analyzeScan(samples, durationMs);
      if (!analysis) {
        setPhase("error");
        setErrorMsg(
          "Scan couldn't detect a clear pulse. Retry with your thumb pressed firmly over the camera lens" +
            (torchSupported ? " and the light on" : "") +
            ", staying still for the full scan.",
        );
        return;
      }
      // Record through the same validated path as manual entries — the backend
      // computes the authoritative HRV and applies the Fifth Standing Rule
      // (phone_camera can only ever be a wellness estimate).
      let recorded: QuickHeartMeasureResult | null = null;
      try {
        recorded = await heartApi.quickMeasure({
          heartRateBpm: analysis.bpm,
          rrIntervalsMs: analysis.rr.slice(0, 600),
          source: "phone_camera",
          note: "camera thumb scan (PPG)",
        });
      } catch {
        // Analysis still completes even if recording fails; the card reports it.
      }
      const o: ThumbScanOutcome = { analysis, durationMs, recorded };
      setOutcome(o);
      setPhase("complete");
      await onComplete?.(o);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Scan failed");
    }
  }, [onComplete, stopCamera, torchSupported]);

  const sampleLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || phaseRef.current !== "scanning") return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const sampleOnce = () => {
      if (phaseRef.current !== "scanning" || !video || !ctx) return;
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const frame = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        let r = 0, g = 0;
        const px = frame.length / 4;
        for (let i = 0; i < frame.length; i += 4) {
          r += frame[i] ?? 0;
          g += frame[i + 1] ?? 0;
        }
        samplesRef.current.push({
          t: performance.now() - startRef.current,
          r: r / px,
          g: g / px,
        });
      }
      const elapsed = performance.now() - startRef.current;
      setElapsedMs(elapsed);
      // Live guidance only — no readings are shown until the scan completes.
      const samples = samplesRef.current;
      setCovered(coverageRatio(samples, 60) > 0.6);
      setQuality(samples.length > 30 ? signalQuality(samples) : "no_signal");
      if (elapsed >= durationSec * 1000) {
        void finishScan();
        return;
      }
      rafRef.current = requestAnimationFrame(sampleOnce);
    };

    rafRef.current = requestAnimationFrame(sampleOnce);
  }, [durationSec, finishScan]);

  const startScan = useCallback(async () => {
    setOutcome(null);
    setErrorMsg("");
    samplesRef.current = [];
    setElapsedMs(0);
    setQuality("no_signal");
    setCovered(false);
    try {
      // Prefer the rear camera; fall back to any camera (desktop webcams).
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        await video.play().catch(() => undefined);
      }
      // Turn the camera light on when the browser exposes torch control.
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
          if (caps.torch) {
            await track.applyConstraints({ advanced: [{ torch: true }] } as MediaTrackConstraintSet & { torch?: boolean });
            setTorchOn(true);
            setTorchSupported(true);
          } else {
            setTorchSupported(false);
          }
        } catch {
          setTorchSupported(false);
        }
      }
      startRef.current = performance.now();
      setPhase("scanning");
      sampleLoop();
    } catch (e) {
      setPhase("error");
      const name = e instanceof DOMException ? e.name : "";
      setErrorMsg(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings and try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : e instanceof Error
              ? `Could not start the camera: ${e.message}`
              : "Could not start the camera.",
      );
    }
  }, [sampleLoop]);

  const cancelScan = useCallback(() => {
    stopCamera();
    setPhase("idle");
  }, [stopCamera]);

  const progressPct = Math.min(100, Math.round((elapsedMs / (durationSec * 1000)) * 100));
  const a = outcome?.analysis;

  return (
    <Card className="border-slate-800 bg-slate-900/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <Camera className="h-4 w-4 text-crimson" />
          Camera Heart Scan — thumb over the lens
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Press your thumb (or fingertip) firmly over the camera{torchSupported ? " — the light turns on automatically" : " and block out ambient light"}.
          Your pulse modulates the red light passing through the thumb; the scan reads it from the video.
          Results and the heart report appear <span className="text-slate-300">only after the scan is complete</span>.
          Recorded as a wellness estimate (source: phone camera) — not a medical device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* hidden sampling surface */}
        <canvas ref={canvasRef} width={SAMPLE_W} height={SAMPLE_H} className="hidden" />

        {phase === "idle" || phase === "error" || phase === "complete" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Select value={String(durationSec)} onChange={(e) => setDurationSec(Number(e.target.value))} className="w-52" disabled={phase === "complete" ? false : undefined}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
            <Button onClick={() => void startScan()} disabled={phase === "complete" ? false : undefined}>
              {phase === "complete" ? <><RotateCcw className="mr-1 h-4 w-4" />Scan again</> : <><Camera className="mr-1 h-4 w-4" />Start thumb scan</>}
            </Button>
            {phase === "complete" && outcome && (
              <Badge variant="emerald" className="text-xs">last scan recorded</Badge>
            )}
          </div>
        ) : null}

        {phase === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-sm text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Scan failed</div>
              <div className="mt-0.5 text-xs text-rose-200/80">{errorMsg}</div>
            </div>
          </div>
        )}

        {(phase === "scanning" || phase === "processing") && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-black">
              <video ref={videoRef} playsInline muted autoPlay className="h-48 w-full object-cover opacity-90" />
              <div className="absolute left-2 top-2 flex gap-1">
                <Badge variant="crimson" className="text-[10px]"><HeartPulse className="mr-1 h-3 w-3" />scanning</Badge>
                <Badge variant={torchOn ? "amber" : "slate"} className="text-[10px]">
                  <Flashlight className="mr-1 h-3 w-3" />light {torchOn ? "on" : torchSupported ? "off" : "n/a"}
                </Badge>
              </div>
              {/* progress-only overlay: no readings shown until complete */}
              <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="h-1.5 w-full overflow-hidden rounded bg-slate-700">
                  <div className="h-full bg-crimson transition-[width] duration-150" style={{ width: `${phase === "processing" ? 100 : progressPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-300">
                  <span>{phase === "processing" ? "analyzing scan…" : `${(elapsedMs / 1000).toFixed(1)}s / ${durationSec}s — keep your thumb still`}</span>
                  <span>
                    {covered ? (quality === "good" ? "good signal" : "weak signal — press more firmly") : "position your thumb over the camera"}
                  </span>
                </div>
              </div>
            </div>
            {phase === "scanning" ? (
              <Button variant="outline" onClick={cancelScan}>Cancel scan</Button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Detecting beats and computing heart rate…</div>
            )}
          </div>
        )}

        {/* ── Results — only after COMPLETE ───────────────────────────── */}
        {phase === "complete" && outcome && a && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Scan complete — {a.bpm} bpm · {a.peakCount} beats detected · {(outcome.durationMs / 1000).toFixed(0)}s
              {outcome.recorded ? "" : " · recording failed (see message above)"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">Heart Rate</div>
                <div className="text-2xl font-semibold text-slate-100">{a.bpm} bpm</div>
                <div className="text-[10px] text-slate-500">median RR {a.hrv?.meanRrMs ?? "—"} ms</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">SDNN</div>
                <div className="text-2xl font-semibold text-slate-100">{a.hrv?.sdnnMs ?? "—"} ms</div>
                <div className="text-[10px] text-slate-500">{a.hrv?.sampleCount ?? 0} beat-to-beat intervals</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">RMSSD</div>
                <div className="text-2xl font-semibold text-slate-100">{a.hrv?.rmssdMs ?? "—"} ms</div>
                <div className="text-[10px] text-slate-500">pNN50 {a.hrv?.pnn50Pct ?? "—"}%</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">Signal coverage</div>
                <div className="text-2xl font-semibold text-slate-100">{a.coveredPct}%</div>
                <div className="text-[10px] text-slate-500">thumb detected over lens</div>
              </div>
            </div>
            {outcome.recorded && (
              <div className="rounded border border-slate-800 bg-slate-900/50 p-2 text-xs text-slate-400">
                Recorded {outcome.recorded.recorded.length} metric{outcome.recorded.recorded.length === 1 ? "" : "s"} (source <code>phone_camera</code>, label{" "}
                <Badge variant="slate" className="text-[10px]">wellness estimate</Badge>) — appears in Heart Data, HRV Analysis, Monitor and Pulse Stats.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
