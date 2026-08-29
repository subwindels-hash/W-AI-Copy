/**
 * Professional video preview (§3): play/pause, seek, frame stepping, time,
 * duration, FPS, resolution, volume, fullscreen, download, frame capture.
 * Updates when its src changes (node output).
 */
import { useEffect, useRef, useState } from "react";
import { Download, Maximize, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";

export function VideoPreview({ src, fps = 30, meta }: { src?: string; fps?: number; meta?: { width?: number; height?: number; durationSec?: number; frameCount?: number; fps?: number } }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(meta?.durationSec ?? 0);
  const [frame, setFrame] = useState(0);

  useEffect(() => { setPlaying(false); setTime(0); setFrame(0); }, [src]);

  const toggle = () => {
    const v = ref.current; if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };
  const step = (dir: number) => {
    const v = ref.current; if (!v) return; v.pause();
    const f = Math.max(0, Math.round(v.currentTime * fps) + dir);
    v.currentTime = f / fps;
    setFrame(f);
  };
  const capture = () => {
    const v = ref.current; if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png"); a.download = `frame-${frame}.png`; a.click();
  };

  const totalFrames = meta?.frameCount ?? Math.round((dur || 0) * fps);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="rounded-lg border border-white/10 bg-black overflow-hidden">
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {src ? <video ref={ref} src={src} className="max-h-full max-w-full" onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); setFrame(Math.round(e.currentTarget.currentTime * (meta?.fps ?? fps))); }} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onEnded={() => setPlaying(false)} />
          : <span className="text-text-muted text-sm">No video</span>}
      </div>
      <div className="p-3 space-y-2 bg-bg-card/60">
        <input type="range" min={0} max={dur || 0} step={0.01} value={time}
          onChange={(e) => { if (ref.current) ref.current.currentTime = Number(e.target.value); }}
          className="w-full accent-violet-500" />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => step(-1)} className="p-1.5 rounded hover:bg-white/10"><SkipBack className="w-4 h-4" /></button>
          <button onClick={toggle} className="p-2 rounded-full bg-violet-500/20 text-violet-200 hover:bg-violet-500/30">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
          <button onClick={() => step(1)} className="p-1.5 rounded hover:bg-white/10"><SkipForward className="w-4 h-4" /></button>
          <Volume2 className="w-4 h-4 text-text-muted" />
          <span className="text-xs text-text-muted tabular-nums">{fmt(time)} / {fmt(dur)} · Frame {frame}{totalFrames ? ` / ${totalFrames}` : ""} · {meta?.fps ? `${meta.fps.toFixed(1)} fps` : `${fps} fps`}{meta?.width ? ` · ${meta.width}×${meta.height}` : ""}</span>
          <div className="ml-auto flex gap-1">
            <button onClick={capture} className="text-xs px-2 py-1 rounded hover:bg-white/10">📸 Frame</button>
            {src && <a href={src} download className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"><Download className="w-3 h-3" />Download</a>}
            <button onClick={() => ref.current?.requestFullscreen()} className="p-1.5 rounded hover:bg-white/10"><Maximize className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
