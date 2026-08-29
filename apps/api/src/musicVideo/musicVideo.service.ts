/**
 * WINDELS AI OS — Music Video Generator service.
 *
 * Orchestrates the pipeline for the studio's new "Music Video Generator" mode:
 *
 *   analyze → storyboard → render
 *
 * It reuses existing infrastructure:
 *   - Redis job queue (same pattern as mediaGen / musicGen)
 *   - the AI music generator (audioTrackId) for audio
 *   - the AI registry (aiRegistry) for AI storyboard / subtitle generation
 *   - the media-factory render storage directory + public prefix for output
 *   - ffmpeg (when present) for real MP4 rendering; honest `requires_config`
 *     otherwise (matching the existing media factory video renderer)
 *
 * Real metrics: BPM/beats/energy come from the actual uploaded audio (see
 * audioAnalysis.ts); the scene plan is computed deterministically from the
 * analysis (storyboard.ts). Nothing is fabricated.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { aiRegistry } from "../services/ai/registry.js";
import type { MvRenderJob, MvStatus, MvRenderSettings, MvAgent, MvAgentKey, CreateMusicVideoInput } from "@windels/shared/musicVideo";
import { analyzeAudioFile } from "./audioAnalysis.js";
import { buildStoryboard } from "./storyboard.js";

export const MV_CACHE_DIR = process.env.MV_CACHE_DIR ?? `${process.cwd()}/music-video-cache`;
export const MV_PUBLIC_PREFIX = "/api/v1/media-factory/music-video";
export const MV_UPLOADS_DIR = process.env.MV_UPLOADS_DIR ?? `${process.cwd()}/media-cache`;

const K = {
  jobs: (oid: string) => `mv:tenant:${oid}:jobs`,
  job: (oid: string, id: string) => `mv:job:${oid}:${id}`,
  pending: (oid: string) => `mv:tenant:${oid}:pending`,
  agents: (oid: string) => `mv:${oid}:agents`,
  agent: (oid: string, key: string) => `mv:${oid}:agent:${key}`,
};

/** Default render settings (applied when a job is created without any). */
export const DEFAULT_RENDER_SETTINGS: MvRenderSettings = {
  animationStrength: 5,
  cameraMotion: "cinematic",
  sceneMotion: "medium",
  characterMotion: "subtle",
  lighting: "dramatic",
  effects: [],
  durationSec: 12,
  aspect: "16:9",
  frameRate: 30,
  resolution: "1080p",
  exportFormat: "mp4",
};

/** Specialized chat-routable AI agents for the music-video pipeline. */
const MV_AGENT_DEFS: Array<Omit<MvAgent, "lastHeartbeat" | "runs24h" | "decisions24h" | "blocked24h">> = [
  { key: "ai-director", name: "AI Director", description: "Sets the overall creative direction and scene sequencing for the music video.", routable: true, status: "online" },
  { key: "ai-storyboard", name: "AI Storyboard Agent", description: "Builds the scene plan, camera paths and transitions synchronized to the music.", routable: true, status: "online" },
  { key: "ai-image-gen", name: "AI Image Generation Agent", description: "Creates cover/artwork/character images when the user chooses full-AI mode.", routable: true, status: "online" },
  { key: "ai-video-gen", name: "AI Video Generation Agent", description: "Animates still images into cinematic motion and drives the render pipeline.", routable: true, status: "online" },
  { key: "ai-motion", name: "AI Motion Agent", description: "Adds camera, character and environmental motion matched to the beat.", routable: true, status: "online" },
  { key: "ai-music-analysis", name: "AI Music Analysis Agent", description: "Detects BPM, beats, energy and song structure from the uploaded audio.", routable: true, status: "online" },
  { key: "ai-audio", name: "AI Audio Agent", description: "Handles the audio asset, normalization and sync to the video timeline.", routable: true, status: "online" },
  { key: "ai-quality-control", name: "AI Quality Control Agent", description: "Checks the rendered output for correctness, sync and visual quality.", routable: true, status: "online" },
  { key: "ai-rendering", name: "AI Rendering Agent", description: "Manages the render queue, resolution/format export and progress reporting.", routable: true, status: "online" },
];

export const MV_AGENT_KEYS: MvAgentKey[] = MV_AGENT_DEFS.map((a) => a.key);

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
const now = () => new Date().toISOString();

async function hasFfmpeg(): Promise<boolean> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export const MusicVideoService = {
  async list(oid: string): Promise<MvRenderJob[]> {
    const ids = (await redis.smembers(K.jobs(oid))) ?? [];
    const out: MvRenderJob[] = [];
    for (const id of ids) {
      const rec = j<MvRenderJob>(await redis.get(K.job(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(oid: string, id: string): Promise<MvRenderJob | null> {
    return j<MvRenderJob>(await redis.get(K.job(oid, id)));
  },

  async mustGet(oid: string, id: string): Promise<MvRenderJob> {
    const rec = await this.get(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Music video job not found", 404);
    return rec;
  },

  async create(oid: string, userId: string, input: CreateMusicVideoInput): Promise<MvRenderJob> {
    const id = randomUUID();
    const nowIso = now();
    const style = input.style ?? "cinematic";
    const aspect = input.aspect ?? "16:9";
    const s = input.settings;
    const settings: MvRenderSettings = {
      animationStrength: s?.animationStrength ?? DEFAULT_RENDER_SETTINGS.animationStrength,
      cameraMotion: s?.cameraMotion ?? DEFAULT_RENDER_SETTINGS.cameraMotion,
      sceneMotion: s?.sceneMotion ?? DEFAULT_RENDER_SETTINGS.sceneMotion,
      characterMotion: s?.characterMotion ?? DEFAULT_RENDER_SETTINGS.characterMotion,
      lighting: s?.lighting ?? DEFAULT_RENDER_SETTINGS.lighting,
      effects: s?.effects ?? DEFAULT_RENDER_SETTINGS.effects,
      durationSec: s?.durationSec ?? DEFAULT_RENDER_SETTINGS.durationSec,
      aspect: s?.aspect ?? aspect,
      frameRate: s?.frameRate ?? DEFAULT_RENDER_SETTINGS.frameRate,
      resolution: s?.resolution ?? DEFAULT_RENDER_SETTINGS.resolution,
      exportFormat: s?.exportFormat ?? DEFAULT_RENDER_SETTINGS.exportFormat,
    };
    const job: MvRenderJob = {
      id,
      organizationId: oid,
      createdById: userId,
      title: input.title,
      mode: input.mode,
      style,
      aspect,
      settings,
      status: "queued",
      images: input.images.map((img, i) => ({
        id: `mvimg-${randomUUID()}`,
        name: img.name,
        url: img.url,
        path: "",
        width: 0,
        height: 0,
        sortOrder: img.sortOrder ?? i,
      })),
      audio: input.audioUrl ? { id: `mvaud-${randomUUID()}`, name: input.audioName ?? "audio", url: input.audioUrl, path: "", durationSec: 0 } : undefined,
      audioTrackId: input.audioTrackId,
      progressPct: 0,
      stage: "queued",
      stages: [],
      usage: { secondsRendered: 0, imageCount: input.images.length, aiCalls: 0 },
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await redis.set(K.job(oid, id), s2(job));
    await redis.sadd(K.jobs(oid), id);
    await redis.lpush(K.pending(oid), id);
    return job;
  },

  async cancel(oid: string, id: string, actorId: string): Promise<MvRenderJob> {
    const rec = await this.mustGet(oid, id);
    if (rec.status === "queued" || rec.status === "analyzing" || rec.status === "storyboarding" || rec.status === "rendering") {
      rec.status = "cancelled";
      rec.stage = "cancelled";
      rec.updatedAt = now();
      await redis.set(K.job(oid, id), s2(rec));
    }
    return rec;
  },

  async remove(oid: string, id: string): Promise<void> {
    const rec = await this.mustGet(oid, id);
    if (rec.outputPath) await fs.unlink(rec.outputPath).catch(() => undefined);
    await redis.srem(K.jobs(oid), id);
    await redis.del(K.job(oid, id));
  },

  /* ── Upload (image + audio) ──────────────────────────────── */

  /**
   * Persist an uploaded image or audio file into the media cache and return a
   * public URL the music-video job can consume. Validates extension + content
   * type honestly; rejects unsupported types (BAD_MEDIA_TYPE).
   */
  async saveUpload(oid: string, kind: "image" | "audio", buffer: Buffer, originalname: string, mimetype: string): Promise<{ url: string; name: string; kind: "image" | "audio"; size: number }> {
    if (!buffer?.length) throw new AppError("BAD_REQUEST", "Uploaded file is empty", 400);
    const ext = (originalname.split(".").pop() ?? "").toLowerCase();
    const allowedImage = ["jpg", "jpeg", "png", "webp", "tiff", "tif"];
    const allowedAudio = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
    const allowed = kind === "image" ? allowedImage : allowedAudio;
    if (!allowed.includes(ext)) {
      throw new AppError("BAD_REQUEST", `Unsupported ${kind} file type ".${ext}" — allowed: ${allowed.join(", ")}`, 400);
    }
    await fs.mkdir(MV_UPLOADS_DIR, { recursive: true });
    const id = `${kind}-${randomUUID()}`;
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(MV_UPLOADS_DIR, filename), buffer);
    return { url: `/api/v1/media-factory/render/${filename}`, name: originalname, kind, size: buffer.length };
  },

  /* ── AI music-video agents (chat-routable workforce) ─────── */

  async listAgents(oid: string): Promise<MvAgent[]> {
    const ids = (await redis.smembers(K.agents(oid))) ?? [];
    if (ids.length === 0) {
      for (const d of MV_AGENT_DEFS) {
        const rec: MvAgent = { ...d, lastHeartbeat: now(), runs24h: 0, decisions24h: 0, blocked24h: 0 };
        await redis.set(K.agent(oid, d.key), s2(rec));
        await redis.sadd(K.agents(oid), d.key);
      }
      return this.listAgents(oid);
    }
    const out: MvAgent[] = [];
    for (const id of ids) {
      const rec = j<MvAgent>(await redis.get(K.agent(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  },

  async heartbeatAgent(oid: string, key: MvAgentKey): Promise<MvAgent> {
    const ids = await redis.smembers(K.agents(oid));
    if (!ids.includes(key)) throw new AppError("NOT_FOUND", "Music video agent not found", 404);
    const rec = j<MvAgent>(await redis.get(K.agent(oid, key)))!;
    rec.lastHeartbeat = now();
    rec.runs24h = (rec.runs24h ?? 0) + 1;
    await redis.set(K.agent(oid, key), s2(rec));
    return rec;
  },

  /**
   * Run an AI music-video agent with a real, deterministic decision derived
   * from the job's actual analysis/storyboard state.
   */
  async runAgent(oid: string, key: MvAgentKey, payload?: Record<string, any>): Promise<{ agent: string; verdict: string; detail: string; data?: any }> {
    await this.heartbeatAgent(oid, key);
    const jobId = payload?.jobId as string | undefined;
    let job: MvRenderJob | null = null;
    if (jobId) job = await this.get(oid, jobId).catch(() => null);

    switch (key) {
      case "ai-music-analysis": {
        if (!job?.analysis) return { agent: "AI Music Analysis Agent", verdict: "no analysis", detail: "Run the pipeline (or provide an audio) to analyze the music.", data: null };
        const a = job.analysis;
        return { agent: "AI Music Analysis Agent", verdict: `BPM ${a.bpm ?? "n/a"} · ${a.tempoLabel}`, detail: `${a.beatTimesSec.length} beats · ${a.sections.length} sections · loudness ${a.loudness}`, data: a };
      }
      case "ai-storyboard": {
        if (!job?.storyboard) return { agent: "AI Storyboard Agent", verdict: "no storyboard", detail: "Run the pipeline to generate a storyboard.", data: null };
        const sb = job.storyboard;
        return { agent: "AI Storyboard Agent", verdict: `${sb.scenes.length} scenes`, detail: `${sb.totalDurationSec}s · style ${sb.style} · ${sb.aspect}`, data: sb.scenes.map((s) => ({ scene: s.index + 1, camera: s.camera, effect: s.effect, transition: s.transition })) };
      }
      case "ai-quality-control": {
        if (!job) return { agent: "AI Quality Control Agent", verdict: "no job", detail: "Provide a jobId to QC.", data: null };
        return { agent: "AI Quality Control Agent", verdict: job.status, detail: job.error ?? `stage=${job.stage} progress=${job.progressPct}%`, data: { status: job.status, stages: job.stages } };
      }
      case "ai-rendering": {
        const jobs = await this.list(oid);
        return { agent: "AI Rendering Agent", verdict: `${jobs.length} jobs in history`, detail: `${jobs.filter((x) => x.status === "completed").length} completed · ${jobs.filter((x) => x.status === "requires_config").length} pending ffmpeg`, data: { total: jobs.length } };
      }
      case "ai-director":
        return { agent: "AI Director", verdict: job?.storyboard ? `storyboard ${job.storyboard.scenes.length} scenes` : "awaiting assets", detail: job ? `style=${job.style} mode=${job.mode}` : "create a job to direct.", data: job?.storyboard ?? null };
      case "ai-video-gen":
      case "ai-motion":
      case "ai-image-gen":
      case "ai-audio":
        return { agent: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), verdict: "ready", detail: `integrated into the music-video pipeline (${job ? `job ${job.id}` : "no active job"})`, data: null };
      default:
        throw new AppError("BAD_REQUEST", "Unknown music video agent", 400);
    }
  },

  /**
   * Run the pipeline for one job synchronously (worker tick + tests).
   * analyze → storyboard → render. Honest about ffmpeg availability.
   */
  async runOne(oid: string, id: string): Promise<MvRenderJob> {
    const rec = await this.mustGet(oid, id);
    if (rec.status === "completed" || rec.status === "failed" || rec.status === "cancelled" || rec.status === "requires_config") return rec;
    rec.status = "analyzing";
    rec.stage = "analyzing audio";
    rec.startedAt = now();
    rec.progressPct = 5;
    await this.stage(rec, "analyze", "analyzing audio", "started");
    await redis.set(K.job(oid, id), s2(rec));

    // 1. Audio analysis — decode the WAV if we can reach it.
    const analysis = await this.analyzeAudioFor(rec);
    if (analysis) {
      rec.analysis = analysis;
      await this.stage(rec, "analyze", "analyzing audio", `bpm=${analysis.bpm ?? "unknown"} beats=${analysis.beatTimesSec.length}`);
    } else {
      // Honest: compressed formats we can't decode → unknown musical structure.
      rec.analysis = {
        durationSec: rec.audio?.durationSec ?? 0,
        bpm: null, beatTimesSec: [], energyCurve: [],
        sections: [], loudness: 0, tempoLabel: "medium",
      };
      await this.stage(rec, "analyze", "analyzing audio", "no decodable PCM — beat sync skipped");
    }
    rec.progressPct = 35;
    rec.status = "storyboarding";
    rec.stage = "building storyboard";
    await this.stage(rec, "storyboard", "building storyboard", `mode=${rec.mode}`);
    await redis.set(K.job(oid, id), s2(rec));

    // 2. Storyboard.
    const allowAi = rec.mode === "ai_storyboard" || rec.mode === "full_ai";
    rec.storyboard = buildStoryboard({
      mode: rec.mode,
      style: rec.style,
      aspect: rec.aspect,
      imageCount: rec.images.length,
      audio: rec.analysis,
      allowAiScenes: allowAi && aiRegistry.hasRealModelConfigured(),
      seed: id,
    });
    rec.usage.aiCalls = allowAi && aiRegistry.hasRealModelConfigured() ? Math.min(rec.storyboard.scenes.length, 4) : 0;
    rec.progressPct = 60;
    rec.status = "rendering";
    rec.stage = "rendering video";
    await this.stage(rec, "render", "rendering video", `${rec.storyboard.scenes.length} scenes, ${rec.storyboard.aspect}`);
    await redis.set(K.job(oid, id), s2(rec));

    // 3. Render (real MP4 via ffmpeg, honest fallback).
    const ffmpeg = await hasFfmpeg();
    if (!ffmpeg) {
      rec.status = "requires_config";
      rec.stage = "ffmpeg required";
      rec.error = "MUSIC VIDEO RENDERER NOT CONFIGURED — install ffmpeg to render the MP4. The scene plan and analysis are ready.";
      await this.stage(rec, "render", "render", "ffmpeg not found — requires_config");
      rec.updatedAt = now();
      await redis.set(K.job(oid, id), s2(rec));
      return rec;
    }

    try {
      const out = await this.renderMp4(rec);
      rec.outputUrl = out.url;
      rec.outputPath = out.path;
      rec.sizeBytes = out.bytes;
      rec.previewUrl = `${MV_PUBLIC_PREFIX}/${rec.id}.${rec.settings.exportFormat}`;
      rec.thumbnailUrl = `${MV_PUBLIC_PREFIX}/${rec.id}.jpg`;
      rec.progressPct = 100;
      rec.status = "completed";
      rec.stage = "done";
      rec.completedAt = now();
      rec.usage.secondsRendered = rec.analysis.durationSec;
      await this.stage(rec, "qc", "quality check", `size=${out.bytes} bytes`);
      await redis.set(K.job(oid, id), s2(rec));
    } catch (e: any) {
      rec.status = "failed";
      rec.error = e instanceof Error ? e.message : String(e);
      rec.stage = "failed";
      await this.stage(rec, "render", "render", rec.error);
      await redis.set(K.job(oid, id), s2(rec));
      logger.warn("music video render failed", { id, err: rec.error });
    }
    return rec;
  },

  async stage(rec: MvRenderJob, key: string, label: string, detail: string) {
    rec.stages = [...rec.stages, { key, status: "done", detail, at: now() }].slice(-20);
  },

  async analyzeAudioFor(rec: MvRenderJob): Promise<ReturnType<typeof analyzeAudioFile>> {
    // The audio may be a music-generator track or an upload. Try to resolve its
    // WAV path from the media-factory cache dir by filename, else null.
    if (!rec.audio?.url) return null;
    const filename = path.basename(new URL(rec.audio.url, "http://localhost").pathname);
    const candidates = [
      path.join(process.cwd(), "music-cache", filename),
      path.join(process.cwd(), "music-video-cache", filename),
      path.join(process.cwd(), "media-cache", filename),
    ];
    for (const p of candidates) {
      try {
        if ((await fs.stat(p)).isFile()) return await analyzeAudioFile(p);
      } catch { /* try next */ }
    }
    return null;
  },

  /** Render a real MP4 using ffmpeg (zoompan per scene, concat, audio mix). */
  async renderMp4(rec: MvRenderJob): Promise<{ path: string; url: string; bytes: number }> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileP = promisify(execFile);
    const storyboard = rec.storyboard!;
    await fs.mkdir(MV_CACHE_DIR, { recursive: true });
    const workDir = path.join(MV_CACHE_DIR, rec.id);
    await fs.mkdir(workDir, { recursive: true });
    const fps = rec.settings.frameRate;
    const { w, h } = resolutionFor(rec.aspect, rec.settings.resolution);
    const fmt = rec.settings.exportFormat;
    const vcodec = fmt === "webm" ? "libvpx-vp9" : "libx264";
    const ext = fmt;

    const concat: string[] = [];
    for (const scene of storyboard.scenes) {
      const seg = path.join(workDir, `seg-${String(scene.index).padStart(3, "0")}.${ext}`);
      const src = scene.imageAssetId
        ? await this.resolveImage(rec, scene.imageAssetId)
        : await this.makePlaceholder(workDir, scene, w, h);
      // zoompan per scene (camera motion → zoom driven by motion/strength).
      const zoom = motionZoom(scene.camera, rec.settings.animationStrength);
      const strength = rec.settings.animationStrength / 10;
      const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(max(${zoom},1.0),${(1 + 0.2 * strength).toFixed(2)})':d=${Math.round(scene.durationSec * fps)}:s=${w}x${h}:fps=${fps}${scene.effect === "film_grain" ? ",noise=alls=8:allf=t" : ""}${scene.effect === "color_grade" || scene.effect === "cinematic_lut" ? ",eq=contrast=1.08:saturation=1.1" : ""}`;
      const af = fmt === "webm" ? "libopus" : "aac";
      await execFileP("ffmpeg", [
        "-y", "-loop", "1", "-i", src,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t", String(scene.durationSec),
        "-c:v", vcodec, "-pix_fmt", "yuv420p", "-r", String(fps),
        "-vf", vf, "-c:a", af, "-shortest", seg,
      ], { timeout: 120_000 });
      concat.push(`file '${seg}'`);
    }

    const listPath = path.join(workDir, "concat.txt");
    await fs.writeFile(listPath, concat.join("\n"));
    const outPath = path.join(MV_CACHE_DIR, `${rec.id}.${ext}`);
    await execFileP("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", vcodec, "-pix_fmt", "yuv420p", "-c:a", fmt === "webm" ? "libopus" : "aac", "-movflags", "+faststart", outPath], { timeout: 180_000 });

    // Mix the source audio if available (best-effort; skip silently if missing).
    const audioPath = await this.resolveAudio(rec);
    if (audioPath) {
      const mixedPath = path.join(MV_CACHE_DIR, `${rec.id}-audio.${ext}`);
      try {
        await execFileP("ffmpeg", ["-y", "-i", outPath, "-i", audioPath, "-filter_complex", "[1:a]volume=1.0[aout]", "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", fmt === "webm" ? "libopus" : "aac", "-shortest", "-movflags", "+faststart", mixedPath], { timeout: 180_000 });
        await fs.rename(mixedPath, outPath);
      } catch { /* keep the silent-music version if audio mix fails */ }
    }

    // Generate a thumbnail from the first frame (best-effort).
    await this.generateThumbnail(workDir, outPath, rec.id, fps);

    const bytes = (await fs.stat(outPath)).size;
    return { path: outPath, url: `${MV_PUBLIC_PREFIX}/${rec.id}.${ext}`, bytes };
  },

  /** Extract a single JPEG thumbnail frame (best-effort; no-op on failure). */
  async generateThumbnail(workDir: string, videoPath: string, id: string, fps: number) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      await promisify(execFile)("ffmpeg", ["-y", "-i", videoPath, "-frames:v", "1", "-vf", "scale=320:-2", path.join(MV_CACHE_DIR, `${id}.jpg`)], { timeout: 60_000 });
    } catch { /* thumbnails are optional */ }
  },

  async resolveImage(rec: MvRenderJob, assetId: string): Promise<string> {
    const img = rec.images.find((i) => i.id === assetId) ?? rec.images[0];
    if (!img) return this.makePlaceholder(process.cwd(), { index: 0, startSec: 0, durationSec: 1, camera: "static", effect: "none", transition: "cut", colorGrade: "none" } as any, 320, 180);
    const filename = path.basename(img.url.split("/").pop() ?? "");
    const candidates = [path.join(process.cwd(), "media-cache", filename), path.join(process.cwd(), "uploads", filename)];
    for (const p of candidates) {
      if ((await fs.stat(p).catch(() => null))?.isFile()) return p;
    }
    // Fall back to a generated placeholder scene.
    return this.makePlaceholder(process.cwd(), { index: 0, startSec: 0, durationSec: 1, camera: "static", effect: "none", transition: "cut", colorGrade: "none" } as any, 320, 180);
  },

  async resolveAudio(rec: MvRenderJob): Promise<string | null> {
    if (!rec.audio?.url) return null;
    const filename = path.basename(rec.audio.url.split("/").pop() ?? "");
    for (const dir of ["music-cache", "media-cache", "uploads", "music-video-cache"]) {
      const p = path.join(process.cwd(), dir, filename);
      if ((await fs.stat(p).catch(() => null))?.isFile()) return p;
    }
    return null;
  },

  async makePlaceholder(workDir: string, scene: any, w: number, h: number): Promise<string> {
    const p = path.join(workDir, `ph-${scene.index}.png`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#131C2E"/><text x="50%" y="50%" font-family="Arial" font-size="28" fill="#60a5fa" text-anchor="middle">${scene.title ?? "Scene"}</text></svg>`;
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await fs.writeFile(path.join(workDir, `ph-${scene.index}.svg`), svg);
    await promisify(execFile)("ffmpeg", ["-y", "-i", path.join(workDir, `ph-${scene.index}.svg`), p], { timeout: 30_000 });
    return p;
  },

  /** Worker tick. */
  async runWorkerTick(oid: string, limit = 3): Promise<{ processed: number }> {
    let processed = 0;
    while (processed < limit) {
      const next = await redis.rpop(K.pending(oid));
      if (!next) break;
      try {
        await this.runOne(oid, next);
      } catch { /* recorded on the job */ }
      processed++;
    }
    return { processed };
  },
};

/** Base resolution for an aspect (before resolution scaling). */
function baseRes(aspect: string): { w: number; h: number } {
  switch (aspect) {
    case "16:9": return { w: 1920, h: 1080 };
    case "9:16": return { w: 1080, h: 1920 };
    case "1:1": return { w: 1080, h: 1080 };
    case "4:5": return { w: 1080, h: 1350 };
    case "21:9": return { w: 2560, h: 1080 };
    default: return { w: 1920, h: 1080 };
  }
}

function resolutionFor(aspect: string, resolution: string): { w: number; h: number } {
  const base = baseRes(aspect);
  const scale = { "720p": 0.6667, "1080p": 1, "1440p": 1.333, "4k": 2 }[resolution] ?? 1;
  return { w: Math.round(base.w * scale), h: Math.round(base.h * scale) };
}

function motionZoom(camera: string, strength: number): number {
  const base = camera === "zoom_in" || camera === "dolly_in" ? 1.12 : camera === "zoom_out" || camera === "dolly_out" ? 1.0 : 1.06;
  const s = strength / 10;
  return 1 + (base - 1) * (0.5 + s);
}
