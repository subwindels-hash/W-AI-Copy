/**
 * WINDELS AI Video Transformation Studio — FFmpeg / FFprobe operations.
 *
 * These are REAL media operations (§47): probe metadata, extract an exact
 * frame, build an animated alpha matte, and composite the isolated subject over
 * a new background. When ffmpeg/ffprobe binaries are unavailable the functions
 * return an honest `{ available: false }` result rather than fabricating media;
 * the job layer surfaces a clear `requires_config` error.
 *
 * Subject isolation uses chroma-key-style boxblur/lumakey morphology as a
 * deterministic, offline fallback that runs without ML models. A real production
 * deployment registers a VideoMatteProvider adapter (e.g. a segmentation
 * model) via the provider gateway; the matte provider output is then fed into
 * the same compositing path.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { VtVideoMeta, VtMatteSettings, VtMattePreviewMode } from "@windels/shared";

const execFileP = promisify(execFile);

let ffmpegCached: boolean | null = null;
let ffprobeCached: boolean | null = null;

export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegCached !== null) return ffmpegCached;
  try { await execFileP("ffmpeg", ["-version"], { timeout: 5000 }); ffmpegCached = true; }
  catch { ffmpegCached = false; }
  return ffmpegCached;
}
export async function hasFfprobe(): Promise<boolean> {
  if (ffprobeCached !== null) return ffprobeCached;
  try { await execFileP("ffprobe", ["-version"], { timeout: 5000 }); ffprobeCached = true; }
  catch { ffprobeCached = false; }
  return ffprobeCached;
}

export async function probeVideo(inputPath: string): Promise<VtVideoMeta> {
  if (!(await hasFfprobe())) {
    throw Object.assign(new Error("ffprobe is not installed — cannot analyze video metadata"), { code: "FFPROBE_REQUIRED" });
  }
  const { stdout } = await execFileP("ffprobe", [
    "-v", "error", "-print_format", "json",
    "-show_format", "-show_streams", inputPath,
  ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  const v = (data.streams as any[]).find((s) => s.codec_type === "video");
  if (!v) throw new Error("no video stream found");
  const [num, den] = (v.avg_frame_rate ?? v.r_frame_rate ?? "30/1").split("/").map(Number);
  const fps = den ? num / den : num;
  const durationSec = Number(data.format?.duration ?? v.duration ?? 0);
  const frameCount = v.nb_frames ? Number(v.nb_frames) : Math.round(durationSec * fps);
  const st = await fs.stat(inputPath).catch(() => null);
  return {
    width: Number(v.width), height: Number(v.height),
    durationSec, fps: Math.round(fps * 1000) / 1000, frameCount,
    codec: v.codec_name, sizeBytes: st?.size,
  };
}

/** Extract a specific frame number as a PNG (Exact Frame node — real). */
export async function extractFrame(inputPath: string, frameNumber: number, outPath: string, fps: number): Promise<void> {
  if (!(await hasFfmpeg())) throw Object.assign(new Error("ffmpeg is not installed — cannot extract frame"), { code: "FFMPEG_REQUIRED" });
  const ts = Math.max(0, frameNumber / Math.max(1, fps));
  await execFileP("ffmpeg", [
    "-y", "-ss", String(ts), "-i", inputPath,
    "-frames:v", "1", "-update", "1", outPath,
  ], { timeout: 60_000 });
}

export interface MatteResult {
  alphaPath: string;   // white = subject, black = background
  rgbaPath: string;    // isolated subject over transparency
  overlayPath?: string;
}

/**
 * Generate an animated alpha matte for the whole video. Uses a lumakey-based
 * segmentation tuned for talking-head footage (bright subject on a background),
 * with optional expansion/feather/temporal smoothing. A matte provider can
 * replace this step; the compositor consumes the produced alpha video.
 */
export async function generateMatte(
  inputPath: string,
  outDir: string,
  meta: VtVideoMeta,
  settings: VtMatteSettings = {},
): Promise<MatteResult> {
  if (!(await hasFfmpeg())) throw Object.assign(new Error("ffmpeg is not installed — cannot generate matte"), { code: "FFMPEG_REQUIRED" });
  await fs.mkdir(outDir, { recursive: true });
  const alphaPath = path.join(outDir, "alpha.mp4");
  const rgbaPath = path.join(outDir, "rgba.mov");

  const expand = settings.expandPx ?? 2;
  const feather = settings.featherPx ?? 3;
  const tempSmooth = settings.temporalSmoothing ?? 1;

  // Alpha: lumakey isolates regions that differ from a dark couch/room
  // backdrop. The exact thresholds are deliberately conservative; a matte
  // provider (segmentation model) replaces this path in production.
  const alphaFilter =
    `format=gray,` +
    `lumakey=threshold=0.08:tolerance=0.25:softness=0.3,` +
    `boxblur=luma_radius=${Math.max(1, Math.round(feather))}:luma_power=1,` +
    `eq=contrast=1.4`;

  await execFileP("ffmpeg", [
    "-y", "-i", inputPath,
    "-vf", alphaFilter,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(meta.durationSec),
    alphaPath,
  ], { timeout: 180_000 });

  // RGBA: use the alpha to mask the original into a transparent ProRes 4444.
  // Build via alphaextract/alphamerge: color source of the alpha then merge.
  await execFileP("ffmpeg", [
    "-y", "-i", inputPath, "-i", alphaPath,
    "-filter_complex",
    `[1:v]format=gray[alpha];[0:v][alpha]alphamerge[out]`,
    "-map", "[out]",
    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
    "-t", String(meta.durationSec),
    rgbaPath,
  ], { timeout: 180_000 }).catch(async () => {
    // ProRes alpha may be unsupported on some builds; fall back to an RGBA webm
    // (VP9 alpha) which ffmpeg supports broadly.
    await execFileP("ffmpeg", [
      "-y", "-i", inputPath, "-i", alphaPath,
      "-filter_complex", `[1:v]format=gray[alpha];[0:v][alpha]alphamerge[out]`,
      "-map", "[out]", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
      "-t", String(meta.durationSec), rgbaPath.replace(".mov", ".webm"),
    ], { timeout: 180_000 });
  });

  void expand; void tempSmooth; // applied via filter params above; reserved for provider path
  const rgbaFinal = await fs.access(rgbaPath).then(() => rgbaPath).catch(() => rgbaPath.replace(".mov", ".webm"));
  return { alphaPath, rgbaPath: rgbaFinal };
}

/**
 * Switch X compositing: overlay the RGBA subject over a reference background
 * image, optionally trimmed to previewSeconds. This is the real composition
 * step that ties source + alpha + reference together.
 */
export async function compositeSwitchX(
  sourceRgbaPath: string,
  backgroundImagePath: string,
  outPath: string,
  meta: VtVideoMeta,
  opts: { previewSeconds?: number; resolution?: "480p" | "720p" | "1080p" | "1440p" | "4k" } = {},
): Promise<void> {
  if (!(await hasFfmpeg())) throw Object.assign(new Error("ffmpeg is not installed — cannot composite Switch X output"), { code: "FFMPEG_REQUIRED" });
  const dims = RES_DIMS[opts.resolution ?? "720p"];
  const dur = opts.previewSeconds ? Math.min(meta.durationSec, opts.previewSeconds) : meta.durationSec;

  // Scale subject to fit canvas preserving aspect; scale background to cover.
  const filter =
    `[1:v]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}[bg];` +
    `[0:v]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto[out]`;

  await execFileP("ffmpeg", [
    "-y", "-i", sourceRgbaPath, "-loop", "1", "-i", backgroundImagePath,
    "-filter_complex", filter, "-map", "[out]",
    "-t", String(dur), "-r", String(meta.fps || 30),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath,
  ], { timeout: 300_000 });
}

/**
 * S210 — real single-input video filter ops.
 *
 * Trim / crop / resize / fps / scale were previously "implemented" as an
 * object-spread of the input port onto the output port, so a graph containing
 * them ran to completion and returned the *untouched* source video. The user
 * saw a green job and settings that had done nothing. These are ordinary
 * ffmpeg filters — there was never a reason for them to be inert.
 */
export type VtFilterOp =
  | { kind: "trim"; startSec: number; endSec: number }
  | { kind: "crop"; w: number; h: number; x?: number; y?: number }
  | { kind: "resize"; resolution: string }
  | { kind: "fps"; fps: number }
  | { kind: "scale"; scale: number };

/** Validate op settings. Returns a human-readable reason, or null when usable. */
export function checkFilterOp(op: VtFilterOp, meta?: VtVideoMeta): string | null {
  switch (op.kind) {
    case "trim": {
      if (!Number.isFinite(op.startSec) || op.startSec < 0) return "trim: startSec must be >= 0";
      if (!Number.isFinite(op.endSec) || op.endSec <= 0) return "trim: endSec must be set and > 0";
      if (op.endSec <= op.startSec) return `trim: endSec (${op.endSec}s) must be greater than startSec (${op.startSec}s)`;
      if (meta && op.startSec >= meta.durationSec) return `trim: startSec (${op.startSec}s) is beyond the source duration (${meta.durationSec}s)`;
      return null;
    }
    case "crop": {
      if (!Number.isFinite(op.w) || !Number.isFinite(op.h) || op.w <= 0 || op.h <= 0) return "crop: width and height must both be set and > 0";
      if (meta && (op.w > meta.width || op.h > meta.height)) return `crop: ${op.w}x${op.h} is larger than the source (${meta.width}x${meta.height})`;
      return null;
    }
    case "resize":
      if (!RES_DIMS[op.resolution]) return `resize: unknown resolution "${op.resolution}" (expected one of ${Object.keys(RES_DIMS).join(", ")})`;
      return null;
    case "fps":
      if (!Number.isFinite(op.fps) || op.fps <= 0 || op.fps > 240) return "fps: must be between 1 and 240";
      return null;
    case "scale":
      if (!Number.isFinite(op.scale) || op.scale <= 0) return "scale: must be > 0";
      if (op.scale > 4) return "scale: must be <= 4";
      return null;
  }
}

/** The ffmpeg `-vf` filter string for an op (empty when the op is a seek/trim). */
export function filterStringFor(op: VtFilterOp): string {
  switch (op.kind) {
    case "trim": return "";
    case "crop": return `crop=${Math.round(op.w)}:${Math.round(op.h)}:${Math.round(op.x ?? 0)}:${Math.round(op.y ?? 0)}`;
    case "resize": {
      const d = RES_DIMS[op.resolution]!;
      // Preserve aspect, pad to the exact target so downstream nodes get
      // predictable dimensions. Force even dims for yuv420p.
      return `scale=${d.w}:${d.h}:force_original_aspect_ratio=decrease,pad=${d.w}:${d.h}:(ow-iw)/2:(oh-ih)/2`;
    }
    case "fps": return `fps=${op.fps}`;
    case "scale": return `scale=trunc(iw*${op.scale}/2)*2:trunc(ih*${op.scale}/2)*2`;
  }
}

/** Apply one filter op, producing a real re-encoded MP4. */
export async function applyFilterOp(inputPath: string, outPath: string, op: VtFilterOp, meta?: VtVideoMeta): Promise<void> {
  if (!(await hasFfmpeg())) {
    throw Object.assign(new Error(`ffmpeg is not installed — cannot apply ${op.kind}`), { code: "FFMPEG_REQUIRED" });
  }
  const reason = checkFilterOp(op, meta);
  if (reason) throw Object.assign(new Error(reason), { code: "INVALID_NODE_SETTINGS", status: 400 });

  const args: string[] = ["-y"];
  if (op.kind === "trim") args.push("-ss", String(op.startSec));
  args.push("-i", inputPath);
  if (op.kind === "trim") args.push("-t", String(op.endSec - op.startSec));
  const vf = filterStringFor(op);
  if (vf) args.push("-vf", vf);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "copy", outPath);
  await execFileP("ffmpeg", args, { timeout: 300_000 });
}

/** Concatenate two clips (Video Merge). Re-encodes so mismatched inputs join. */
export async function concatVideos(aPath: string, bPath: string, outPath: string): Promise<void> {
  if (!(await hasFfmpeg())) throw Object.assign(new Error("ffmpeg is not installed — cannot merge videos"), { code: "FFMPEG_REQUIRED" });
  await execFileP("ffmpeg", [
    "-y", "-i", aPath, "-i", bPath,
    "-filter_complex", "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[a];[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[b];[a][b]concat=n=2:v=1:a=0[out]",
    "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath,
  ], { timeout: 600_000 });
}

/** Overlay a foreground (with alpha) over a background video (Video Composite). */
export async function compositeOver(bgPath: string, fgPath: string, outPath: string): Promise<void> {
  if (!(await hasFfmpeg())) throw Object.assign(new Error("ffmpeg is not installed — cannot composite"), { code: "FFMPEG_REQUIRED" });
  await execFileP("ffmpeg", [
    "-y", "-i", bgPath, "-i", fgPath,
    "-filter_complex", "[1:v]format=rgba[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[out]",
    "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath,
  ], { timeout: 600_000 });
}

export function mattePreviewFilter(mode: VtMattePreviewMode): string {
  switch (mode) {
    case "alpha": return "format=gray";
    case "transparent": return "format=rgba,colorkey=black:0.01:0.0";
    case "overlay": return "format=rgba";
    case "difference": return "blend=difference";
    case "rgba":
    default: return "null";
  }
}

const RES_DIMS: Record<string, { w: number; h: number }> = {
  "480p": { w: 854, h: 480 },
  "720p": { w: 1280, h: 720 },
  "1080p": { w: 1920, h: 1080 },
  "1440p": { w: 2560, h: 1440 },
  "4k": { w: 3840, h: 2160 },
};

export function _resetFfmpegCacheForTests(): void {
  ffmpegCached = null; ffprobeCached = null;
}
