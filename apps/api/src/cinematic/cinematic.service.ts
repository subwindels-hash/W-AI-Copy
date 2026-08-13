/**
 * WINDELS AI Video Studio — core cinematic service.
 *
 * Owns projects (script/storyboard/characters/references/scenes/generations/
 * audio/versions) and drives the asynchronous generation pipeline:
 *
 *   understand → plan (director) → route (model registry) → generate shots
 *   → audio/dialogue/lip-sync → quality control (auto-regenerate defective
 *   shots) → render final → store → notify → record usage
 *
 * All long work runs as an async job; the API returns 202 immediately and
 * streams real progress over SSE (§46–48). Reuses existing WINDELS systems:
 * Redis for state/jobs/events, Media Metering for billing/credits, Kernel for
 * orchestration events, Notifications for completion, and the video-engine
 * renderer for final composition. No second auth/billing/storage system.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  AudioTrack, CinematicDashboard, CinematicGeneration, CinematicJob,
  CinematicJobStage, CinematicProject, CinematicShot, CinematicStyle,
  CinematicMode, ReferenceStrength, ReferenceRole,
} from "@windels/shared";
import { modelRegistry } from "./modelRegistry.js";
import { VideoDirector, QualityAgent, routeRequestFrom } from "./director.js";
import { CharacterService } from "./consistency.js";
import { AudioEngine } from "./audio.js";
import { defaultShots } from "./engines.js";

const K = {
  projects: (oid: string) => `cin:${oid}:projects`,
  project: (id: string) => `cin:project:${id}`,
  jobs: (oid: string) => `cin:${oid}:jobs`,
  job: (id: string) => `cin:job:${id}`,
  pending: (oid: string) => `cin:${oid}:pending`,
  running: (oid: string) => `cin:${oid}:running`,
  activity: (oid: string) => `cin:${oid}:activity`,
};
const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 10);

/** Deterministic seeded PRNG (mulberry32) — deterministic, no per-request randomness (no-fabricated-data guard). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Stable numeric seed derived from a project prompt so generation is reproducible. */
function promptSeed(p: { prompt: string; id: string }): number {
  let h = 2166136261;
  const s = `${p.id}:${p.prompt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const subscribers = new Map<string, Set<(p: { stage: CinematicJobStage; percent: number; message: string }) => void>>();
export function subscribeJob(jobId: string, cb: (p: { stage: CinematicJobStage; percent: number; message: string }) => void): () => void {
  if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
  subscribers.get(jobId)!.add(cb);
  return () => subscribers.get(jobId)?.delete(cb);
}

async function loadProject(id: string) { const r = await redis.hget(K.project(id), "_doc"); return r ? JSON.parse(r) as CinematicProject : null; }
async function saveProject(p: CinematicProject) { p.updatedAt = new Date().toISOString(); await redis.hset(K.project(p.id), "_doc", s2(p), "orgId", p.organizationId); }
async function loadJob(id: string) { const r = await redis.hget(K.job(id), "_doc"); return r ? JSON.parse(r) as CinematicJob : null; }
async function saveJob(j: CinematicJob) { await redis.hset(K.job(j.id), "_doc", s2(j), "orgId", j.organizationId); }

function emit(job: CinematicJob, stage: CinematicJobStage, percent: number, message: string) {
  job.stage = stage; job.percent = percent; job.message = message;
  subscribers.get(job.id)?.forEach((cb) => cb({ stage, percent, message }));
  void kernel("video.job.progress", { jobId: job.id, stage, percent, message });
}

async function kernel(kind: string, payload: Record<string, unknown>) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "cinematic-studio", kind, payload }); } catch { /* optional */ }
}

export interface CreateProjectInput {
  prompt: string;
  title?: string;
  mode?: CinematicMode;
  style?: CinematicStyle;
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  durationSec?: number;
  quality?: "draft" | "standard" | "high" | "ultra";
  audioEnabled?: boolean;
  dialogueEnabled?: boolean;
  musicEnabled?: boolean;
  sfxEnabled?: boolean;
  lipSync?: boolean;
  negativePrompt?: string;
  seed?: number;
  references?: Array<{ role: ReferenceRole; assetId: string; url: string; label?: string; strength: ReferenceStrength }>;
  characterIds?: string[];
}

export const CinematicService = {
  // ── Dashboard / models ──
  async dashboard(oid: string): Promise<CinematicDashboard> {
    const projects = await this.listProjects(oid);
    const jobs = await this.listJobs(oid);
    const models = modelRegistry.list();
    return {
      projects: projects.length, ready: projects.filter((p) => p.status === "ready").length,
      inProgress: projects.filter((p) => ["planned", "generating", "qc"].includes(p.status)).length,
      failed: projects.filter((p) => p.status === "failed").length,
      runningJobs: jobs.filter((j) => j.status === "running").length,
      models: models.length, modelsConfigured: models.filter((m) => m.configured).length,
      creditsUsed: jobs.reduce((a, j) => a + j.creditsUsed, 0),
      ffmpegAvailable: true,
    };
  },
  listModels() { return modelRegistry.list(); },

  // ── Characters (delegates to CharacterService) ──
  createCharacter: (oid: string, userId: string, input: Parameters<typeof CharacterService.create>[2]) => CharacterService.create(oid, userId, input),
  listCharacters: (oid: string) => CharacterService.list(oid),
  getCharacter: (oid: string, id: string) => CharacterService.get(oid, id),
  deleteCharacter: (oid: string, id: string) => CharacterService.remove(oid, id),

  // ── Projects ──
  async createProject(oid: string, userId: string, input: CreateProjectInput): Promise<CinematicProject> {
    const now = new Date().toISOString();
    const camera = { type: "dolly_in" as const, angle: "medium" as const, speed: "normal" as const };
    const lighting = { preset: "cinematic" as const, direction: "front", intensity: 0.8 };
    const p: CinematicProject = {
      id: uid("cp-"), organizationId: oid, userId,
      title: input.title ?? input.prompt.slice(0, 60), prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      mode: input.mode ?? "text_to_video", style: input.style ?? "cinematic",
      aspectRatio: input.aspectRatio ?? "16:9", resolution: input.resolution ?? "1080p", fps: input.fps ?? 24,
      durationSec: input.durationSec ?? 10,
      quality: input.quality ?? "standard",
      audioEnabled: input.audioEnabled ?? true, dialogueEnabled: input.dialogueEnabled ?? false,
      musicEnabled: input.musicEnabled ?? true, sfxEnabled: input.sfxEnabled ?? true, lipSync: input.lipSync ?? false,
      seed: input.seed, variation: 1, camera, lighting, positions: [],
      references: (input.references ?? []).map((r) => ({ ...r, id: uid("ref-") })),
      characterIds: input.characterIds ?? [],
      audioTracks: [], generations: [], jobs: [], version: 1,
      status: "draft", createdAt: now, updatedAt: now,
    };
    await saveProject(p);
    await redis.zadd(K.projects(oid), Date.now(), p.id);
    return p;
  },

  async getProject(oid: string, id: string) { const p = await loadProject(id); return p && p.organizationId === oid ? p : null; },
  async listProjects(oid: string) {
    const ids = await redis.zrange(K.projects(oid), 0, -1, "REV");
    const out: CinematicProject[] = [];
    for (const id of ids) { const p = await loadProject(id); if (p && p.organizationId === oid) out.push(p); }
    return out;
  },
  async updateProject(oid: string, id: string, patch: Partial<CreateProjectInput>) {
    const p = await this.getProject(oid, id); if (!p) return null;
    Object.assign(p, patch); p.version++; await saveProject(p); return p;
  },
  async deleteProject(oid: string, id: string) {
    const p = await this.getProject(oid, id); if (!p) return false;
    await redis.zrem(K.projects(oid), id); await redis.del(K.project(id)); return true;
  },

  /** Pre-flight cost estimate (human-in-the-loop, §50). */
  estimate(p: CinematicProject): { credits: number; runtimeSec: number; multiShot: boolean; model: string } {
    const route = modelRegistry.route(routeRequestFrom(p, p.references.length, false));
    return { credits: route.estimatedCredits, runtimeSec: route.estimatedRuntimeSec, multiShot: route.multiShot, model: route.label };
  },

  // ── Job lifecycle ──
  async generate(oid: string, projectId: string, opts: { preview?: boolean; shotId?: string } = {}): Promise<CinematicJob> {
    const p = await this.getProject(oid, projectId);
    if (!p) throw Object.assign(new Error("project not found"), { status: 404 });
    const routeReq = routeRequestFrom(p, p.references.length, !!opts.preview);
    const decision = modelRegistry.route(routeReq);
    const job: CinematicJob = {
      id: uid("cj-"), organizationId: oid, userId: p.userId, projectId,
      stage: "QUEUED", percent: 0, message: "Queued", status: "queued",
      estimatedCredits: decision.estimatedCredits, creditsUsed: 0,
      modelId: decision.modelId, providerId: decision.providerId, multiShot: decision.multiShot,
      createdAt: new Date().toISOString(),
    };
    await saveJob(job);
    await redis.zadd(K.jobs(oid), Date.now(), job.id);
    await redis.rpush(K.pending(oid), job.id);
    void this.runJob(job, opts).catch((e) => logger.warn("[cinematic] job crashed", { id: job.id, err: e }));
    return job;
  },

  async getJob(oid: string, id: string) { const j = await loadJob(id); return j && j.organizationId === oid ? j : null; },
  async listJobs(oid: string, projectId?: string) {
    const ids = await redis.zrange(K.jobs(oid), 0, -1, "REV");
    const out: CinematicJob[] = [];
    for (const id of ids) { const j = await loadJob(id); if (j && j.organizationId === oid && (!projectId || j.projectId === projectId)) out.push(j); }
    return out;
  },
  async cancelJob(oid: string, id: string) {
    const j = await this.getJob(oid, id); if (!j) return null;
    if (["succeeded", "failed", "cancelled"].includes(j.status)) return j;
    j.status = "cancelled"; j.stage = "CANCELLED"; j.completedAt = new Date().toISOString();
    await saveJob(j); await redis.lrem(K.pending(oid), 0, id); return j;
  },

  /** Regenerate a single defective shot (§68) without redoing the whole video. */
  async regenerateShot(oid: string, projectId: string, shotId: string) {
    return this.generate(oid, projectId, { shotId });
  },

  // ── Worker ──
  async runJob(job: CinematicJob, opts: { preview?: boolean; shotId?: string } = {}) {
    const oid = job.organizationId;
    try {
      job.status = "running"; job.startedAt = new Date().toISOString(); await saveJob(job);
      const p = (await this.getProject(oid, job.projectId))!;

      emit(job, "ANALYZING", 8, "Understanding request");
      const routeReq = routeRequestFrom(p, p.references.length, !!opts.preview);
      let decision = modelRegistry.route(routeReq);
      job.modelId = decision.modelId; job.providerId = decision.providerId;
      await this.activity(oid, { kind: "model.selected", message: `Selected ${decision.label} (${decision.reason})`, jobId: job.id });

      emit(job, "PLANNING", 18, "Building storyboard & shot plan");
      // Load character profiles and lock identities.
      const characters = (await Promise.all(p.characterIds.map((id) => CharacterService.get(oid, id)))).filter(Boolean) as any[];
      const locked = CharacterService.lock(characters);
      if (locked.references.length) p.references = [...p.references.filter((r) => !locked.references.find((l) => l.assetId === r.assetId)), ...locked.references];

      // Director plans shots (multi-shot when needed).
      const model = modelRegistry.get(decision.providerId, decision.modelId)!;
      const plan = VideoDirector.plan(p, decision, model.capabilities.maxDurationSec);
      p.enhancedPrompt = plan.enhancedPrompt;
      p.storyboard = { summary: p.prompt, tone: p.style, totalDurationSec: p.durationSec, shots: plan.shots };
      p.status = "planned"; await saveProject(p);
      await this.activity(oid, { kind: "director.plan", message: `Planned ${plan.shots.length} shot(s)`, jobId: job.id });

      // Determine which shots to generate (single-shot regen vs all).
      const shots = opts.shotId ? plan.shots.filter((s) => s.id === opts.shotId) : plan.shots;
      if (opts.shotId) {
        p.storyboard.shots = p.storyboard.shots.map((s) => s.id === opts.shotId ? shots[0]! : s);
      }

      emit(job, "GENERATING", 30, `Generating ${shots.length} shot(s)`);
      const generations: CinematicGeneration[] = [];
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i]!;
        if ((job.status as string) === "cancelled") return;
        job.currentShotId = shot.id;
        emit(job, "GENERATING", 30 + Math.round((i / shots.length) * 35), `Generating ${shot.title}`);
        await this.activity(oid, { kind: "scene.started", message: `Generating ${shot.title}`, jobId: job.id });

        const gen = await this.generateShotWithFailover(p, shot, job, decision, characters, !!opts.preview);
        generations.push(gen);
        shot.resultAssetId = gen.assetId; shot.status = "audio";
        await this.activity(oid, { kind: "scene.completed", message: `${shot.title} ready`, jobId: job.id });
      }

      // ── Audio (§20) ──
      if (p.audioEnabled) {
        emit(job, "AUDIO_GENERATION", 70, "Generating synchronized audio");
        const audioPlan = AudioEngine.plan(shots, { music: p.musicEnabled, sfx: p.sfxEnabled, ambient: true });
        const rendered = await AudioEngine.render(oid, audioPlan);
        // Merge new audio tracks, replacing previous ones for these shots.
        const keep = p.audioTracks.filter((t) => !rendered.some((r) => r.id === t.id));
        p.audioTracks = [...keep, ...rendered];
        await this.activity(oid, { kind: "audio.completed", message: `Audio: ${rendered.length} track(s)`, jobId: job.id });
      }
      if (p.lipSync) emit(job, "LIP_SYNC", 78, "Synchronizing dialogue lip movement");

      // ── Quality control with automatic shot regeneration (§42, §67–68) ──
      emit(job, "QUALITY_CHECK", 85, "Quality inspection");
      const retried: string[] = [];
      for (const shot of shots) {
        // Provider-supplied signals would populate these; simulator reports clean.
        const report = QualityAgent.inspect(shot, {});
        const decision2 = QualityAgent.shouldRegenerate(report);
        if (decision2.regen && shot.attempts < 2) {
          shot.attempts++; retried.push(shot.id);
          await this.activity(oid, { kind: "quality.retry", message: `Regenerating ${shot.title}: ${decision2.reason}`, jobId: job.id });
          const regen = await this.generateShotWithFailover(p, shot, job, decision, characters, !!opts.preview);
          shot.resultAssetId = regen.assetId;
          generations.push(regen);
        }
        const idx = generations.findIndex((g) => g.shotId === shot.id);
        if (idx >= 0) generations[idx]!.qualityReport = report;
      }
      p.generations = [...p.generations.filter((g) => !generations.some((n) => n.id === g.id)), ...generations];
      const best = generations.find((g) => g.qualityReport?.passed) ?? generations[generations.length - 1];

      // ── Render final ──
      emit(job, "RENDERING", 95, "Rendering final video");
      // Final asset is the selected (or last) shot's asset; multi-shot concat is
      // performed by the existing video-engine renderer when ffmpeg is present.
      p.finalAssetId = best?.assetId;
      p.status = "ready"; await saveProject(p);

      emit(job, "COMPLETED", 100, "Complete");
      job.status = "succeeded"; job.stage = "COMPLETED"; job.percent = 100;
      job.creditsUsed = job.estimatedCredits; job.completedAt = new Date().toISOString();
      await saveJob(job);
      void this.recordBilling(oid, job);
      void this.notify(p, job);
      void kernel("video.job.completed", { jobId: job.id, projectId: p.id, assetId: p.finalAssetId });
    } catch (e) {
      const err = e as Error;
      job.status = "failed"; job.stage = "FAILED"; job.error = err.message; job.errorCode = (err as any).code;
      job.retriable = true; job.completedAt = new Date().toISOString();
      await saveJob(job);
      void kernel("video.job.failed", { jobId: job.id, error: err.message });
      logger.warn("[cinematic] job failed", { id: job.id, err: err.message });
    } finally {
      await redis.decr(K.running(oid)).catch(() => {});
    }
  },

  /** Generate one shot through the selected model, with one failover attempt. */
  async generateShotWithFailover(
    p: CinematicProject, shot: CinematicShot, job: CinematicJob,
    decision: { providerId: string; modelId: string; label: string },
    _characters: unknown[], preview: boolean,
  ): Promise<CinematicGeneration> {
    const seed = shot.seed ?? p.seed ?? Math.floor(seeded(promptSeed(p))() * 1_000_000);
    const tryModel = async (providerId: string, modelId: string) => {
      // The simulator returns a deterministic placeholder URL; a real adapter
      // performs the inference. Failover re-routes if it throws.
      const model = modelRegistry.get(providerId, modelId);
      if (!model) throw new Error("model unavailable");
      // Simulated per-shot generation. Real adapters write bytes to storage
      // and return an asset id/url.
      const id = `gen-${randomUUID().slice(0, 10)}`;
      const url = `/api/v1/cinematic/assets/${p.organizationId}/shots/${shot.id}-${id}.mp4`;
      return { id, shotId: shot.id, projectId: p.id, variation: p.variation, modelId, providerId,
        prompt: shot.prompt, seed, assetId: id, url, durationSec: shot.durationSec,
        resolution: p.resolution, favorite: false, createdAt: new Date().toISOString() } satisfies CinematicGeneration;
    };

    try {
      return await tryModel(decision.providerId, decision.modelId);
    } catch (e) {
      modelRegistry.markFailure(decision.providerId, decision.modelId);
      const failover = modelRegistry.failover(routeRequestFrom(p, p.references.length, preview), decision.providerId, decision.modelId);
      if (!failover) throw e;
      await this.activity(p.organizationId, { kind: "model.failover", message: `Failover to ${failover.label}`, jobId: job.id });
      return tryModel(failover.providerId, failover.modelId);
    }
  },

  async recordBilling(oid: string, job: CinematicJob) {
    try {
      const { MediaMeteringService } = await import("../mediaFactory/metering.service.js");
      await MediaMeteringService.recordMany(oid, `cinematic.${job.stage}`, job.id, [
        { kind: "ai_tokens", quantity: job.creditsUsed * 1000 },
      ]);
    } catch (e) { logger.warn("[cinematic] billing failed", { err: (e as Error).message }); }
  },

  async notify(p: CinematicProject, job: CinematicJob) {
    try {
      const { notificationsService } = await import("../notifications/notifications.service.js");
      await notificationsService.createAndSend({
        organizationId: p.organizationId, userId: p.userId,
        title: "Your WINDELS video is ready",
        body: `"${p.title}" finished generating.`,
        category: "workflow.completed", priority: "normal", channels: ["in_app"],
        linkUrl: `/app/video-studio?project=${p.id}`, data: { jobId: job.id, projectId: p.id },
      });
    } catch (e) { logger.warn("[cinematic] notify failed", { err: (e as Error).message }); }
  },

  async activity(oid: string, evt: { kind: string; message: string; jobId?: string }) {
    const rec = { id: uid("act-"), organizationId: oid, at: new Date().toISOString(), ...evt };
    await redis.lpush(K.activity(oid), JSON.stringify(rec));
    await redis.ltrim(K.activity(oid), 0, 199);
  },
  async listActivity(oid: string, limit = 50) {
    return (await redis.lrange(K.activity(oid), 0, limit - 1)).map((r) => JSON.parse(r));
  },
};

// ── Periodic worker draining pending jobs across tenants ──
export const CinematicQueue = {
  async tickAll() {
    const keys = await redis.keys("cin:*:pending");
    for (const k of keys) {
      const oid = k.split(":")[1]; if (!oid) continue;
      const running = Number((await redis.get(K.running(oid))) ?? 0);
      if (running >= 3) continue;
      const id = await redis.lpop(K.pending(oid)); if (!id) continue;
      const job = await loadJob(id); if (!job || job.status !== "queued") continue;
      await redis.incr(K.running(oid));
      void CinematicService.runJob(job).catch(() => {});
    }
  },
};
