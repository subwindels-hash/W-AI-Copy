/**
 * WINDELS AI Video Generation & Production Engine — core service.
 *
 * This is the main entry point used by the API routes. It owns persistent
 * Video Projects (§7), drives the AI Video Director pipeline (§3), dispatches
 * async generation through the Video Job Queue (§8), routes model calls through
 * the Video Model Gateway (§4), renders via FFmpeg (§9), validates through the
 * Quality layer (§13), meters usage through the existing Media Metering ledger
 * (§14 — no second billing system), and publishes through existing integrations
 * (§12).
 *
 * Storage: project documents live in Redis (same pattern as mediaGen/composer);
 * generated binaries live under VIDEO_CACHE_DIR and are served by the asset
 * route. Prisma is used only where existing services require it (billing etc.).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  VideoAspectRatio,
  VideoAsset,
  VideoCreationType,
  VideoDashboard,
  VideoJob,
  VideoModification,
  VideoProductRef,
  VideoProject,
  VideoProjectStatus,
  VideoPublishRequest,
  VideoPublishResult,
  VideoQuality,
  VideoResolution,
  VideoVersion,
  VideoVoiceTrack,
  VideoMusicTrack,
} from "@windels/shared";
import { videoProviderGateway } from "./providerGateway.js";
import { VideoJobQueue } from "./jobQueue.js";
import { planProduction, inferCreationType, inferTargetDuration } from "./director.js";
import { renderVersion } from "./renderer.js";
import { runQualityChecks } from "./quality.js";
import { buildCaptions, produceMusic, produceVoiceover } from "./audio.js";
import { hasFfmpeg } from "./render/ffmpeg.js";

const K = {
  projects: (oid: string) => `vid:tenant:${oid}:projects`,
  project: (id: string) => `vid:project:${id}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

export interface CreateProjectInput {
  name?: string;
  prompt: string;
  creationType?: VideoCreationType;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  quality?: VideoQuality;
  targetDurationSec?: number;
  marketplaceProductId?: string;
  products?: VideoProductRef[];
  contentPolicy?: Record<string, unknown>;
  /** When true (default) disclosure that content is AI-generated is enabled. */
  discloseAi?: boolean;
}

export interface GenerateInput {
  sceneIndex?: number;
  op?: "text-to-video" | "image-to-video" | "video-to-video" | "talking-avatar" | "text-to-image";
  voiceGender?: "male" | "female" | "neutral";
  voiceId?: string;
}

/**
 * Per-project async mutex. Workers run concurrently and each handler loads,
 * mutates, and saves the project document; without serialization the last
 * writer would clobber assets added by another worker (lost-update). Each
 * project gets an independent promise chain so different projects still run in
 * parallel.
 */
const projectLocks = new Map<string, Promise<unknown>>();
async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = projectLocks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => { release = res; });
  projectLocks.set(projectId, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (projectLocks.get(projectId) === next) projectLocks.delete(projectId);
  }
}

function emptyUsage(): VideoProject["usage"] {
  return {
    generationJobs: 0, successfulGenerations: 0, failedGenerations: 0,
    totalDurationSec: 0, voiceSeconds: 0, renderMs: 0, outputBytes: 0, aiTokens: 0,
    estimatedCostMicros: 0, recordedCostMicros: 0, unpriced: true,
  };
}

async function loadProject(id: string): Promise<VideoProject | null> {
  const raw = await redis.hget(K.project(id), "_doc");
  return raw ? (JSON.parse(raw) as VideoProject) : null;
}

async function saveProject(p: VideoProject): Promise<void> {
  p.updatedAt = new Date().toISOString();
  await redis.hset(K.project(p.id), "_doc", s2(p), "orgId", p.organizationId);
  await redis.zadd(K.projects(p.organizationId), Date.now(), p.id);
}

function guardOrg(p: VideoProject | null, orgId: string): VideoProject | null {
  if (!p || p.organizationId !== orgId) return null;
  return p;
}

export const VideoService = {
  // ── Capabilities / dashboard ─────────────────────────────────────
  capabilities() {
    return {
      creationTypes: [
        "advertisement", "product", "social", "short_form", "educational", "explainer",
        "business_presentation", "marketing", "cinematic", "story", "promotional", "ugc",
        "music_video", "talking_avatar", "image_animation", "video_transform",
        "image_to_video", "video_to_video",
      ],
      aspectRatios: ["16:9", "9:16", "1:1", "4:5", "21:9"],
      resolutions: ["480p", "720p", "1080p", "4k"],
      providers: videoProviderGateway.listProviders(),
      ffmpegAvailable: true, // resolved async by dashboard
    };
  },

  async dashboard(organizationId: string): Promise<VideoDashboard> {
    const projects = await this.listProjects(organizationId);
    const jobs = await VideoJobQueue.list(organizationId);
    const providers = videoProviderGateway.listProviders();
    const ready = projects.filter((p) => p.status === "ready").length;
    const inProgress = projects.filter((p) => ["planning", "generating", "rendering", "qa"].includes(p.status)).length;
    const failed = projects.filter((p) => p.status === "failed").length;
    const recorded = projects.reduce((a, p) => a + p.usage.recordedCostMicros, 0);
    const unpriced = projects.every((p) => p.usage.unpriced);
    return {
      projects: projects.length, ready, inProgress, failed,
      queuedJobs: jobs.filter((j) => j.status === "pending").length,
      runningJobs: jobs.filter((j) => j.status === "running").length,
      providers: providers.length,
      providersConfigured: providers.filter((p) => p.configured).length,
      totalDurationSec: projects.reduce((a, p) => a + p.usage.totalDurationSec, 0),
      recordedCostMicros: recorded,
      unpriced,
      ffmpegAvailable: await hasFfmpeg(),
    };
  },

  // ── Project CRUD ─────────────────────────────────────────────────
  async createProject(organizationId: string, userId: string, input: CreateProjectInput): Promise<VideoProject> {
    const creationType = input.creationType ?? inferCreationType(input.prompt);
    const duration = input.targetDurationSec ?? inferTargetDuration(input.prompt, 30);
    const products = input.products ?? [];
    const now = new Date().toISOString();
    const project: VideoProject = {
      id: uid("vp-"),
      organizationId,
      userId,
      name: input.name ?? input.prompt.slice(0, 60),
      prompt: input.prompt,
      creationType,
      status: "draft",
      aspectRatio: input.aspectRatio ?? "16:9",
      resolution: input.resolution ?? "1080p",
      quality: input.quality ?? "standard",
      targetDurationSec: duration,
      scenes: [],
      characters: [],
      products,
      assets: [],
      voiceTracks: [],
      music: [],
      captions: [],
      versions: [],
      jobs: [],
      usage: emptyUsage(),
      contentPolicy: input.contentPolicy,
      disclosureAiGenerated: input.discloseAi ?? true,
      marketplaceProductId: input.marketplaceProductId,
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(project);
    await emitKernel("video.project.created", { projectId: project.id, creationType });
    return project;
  },

  async getProject(organizationId: string, id: string): Promise<VideoProject | null> {
    return guardOrg(await loadProject(id), organizationId);
  },

  async listProjects(organizationId: string, limit = 100): Promise<VideoProject[]> {
    const ids = await redis.zrange(K.projects(organizationId), 0, -1, "REV");
    const out: VideoProject[] = [];
    for (const id of ids.slice(0, limit)) {
      const p = await loadProject(id);
      if (p && p.organizationId === organizationId) out.push(p);
    }
    return out;
  },

  async updateProject(organizationId: string, id: string, patch: Partial<CreateProjectInput>): Promise<VideoProject | null> {
    const p = await this.getProject(organizationId, id);
    if (!p) return null;
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.prompt !== undefined) p.prompt = patch.prompt;
    if (patch.aspectRatio) p.aspectRatio = patch.aspectRatio;
    if (patch.resolution) p.resolution = patch.resolution;
    if (patch.quality) p.quality = patch.quality;
    if (patch.targetDurationSec) p.targetDurationSec = patch.targetDurationSec;
    if (patch.products) p.products = patch.products;
    if (patch.contentPolicy !== undefined) p.contentPolicy = patch.contentPolicy;
    if (patch.discloseAi !== undefined) p.disclosureAiGenerated = patch.discloseAi;
    await saveProject(p);
    return p;
  },

  async deleteProject(organizationId: string, id: string): Promise<boolean> {
    const p = await this.getProject(organizationId, id);
    if (!p) return false;
    await redis.zrem(K.projects(organizationId), id);
    await redis.del(K.project(id));
    return true;
  },

  // ── Planning (director) ──────────────────────────────────────────
  async plan(organizationId: string, id: string): Promise<VideoProject | null> {
    const p = await this.getProject(organizationId, id);
    if (!p) return null;
    p.status = "planning";
    await saveProject(p);
    const plan = planProduction({
      prompt: p.prompt,
      creationType: p.creationType,
      durationSec: p.targetDurationSec,
      products: p.products,
      aspectRatio: p.aspectRatio,
    });
    p.script = plan.script;
    p.storyboard = plan.storyboard;
    p.scenes = plan.scenes;
    p.usage.totalDurationSec = plan.script.totalDurationSec;
    p.status = "draft";
    await saveProject(p);
    await emitKernel("video.project.planned", { projectId: p.id, scenes: p.scenes.length });
    return p;
  },

  // ── Generation pipeline (async via job queue) ────────────────────
  async generate(organizationId: string, id: string, input: GenerateInput = {}): Promise<{ project: VideoProject; jobs: VideoJob[] }> {
    const p = await this.getProject(organizationId, id);
    if (!p) throw Object.assign(new Error("Project not found"), { status: 404 });
    if (p.scenes.length === 0) await this.plan(organizationId, id);
    const fresh = (await this.getProject(organizationId, id))!;
    fresh.status = "generating";
    await saveProject(fresh);

    const jobs: VideoJob[] = [];
    const scenes = input.sceneIndex !== undefined ? fresh.scenes.filter((s) => s.index === input.sceneIndex) : fresh.scenes;
    for (const scene of scenes) {
      const job = await VideoJobQueue.enqueue({
        organizationId,
        projectId: fresh.id,
        kind: "scene_clip",
        idempotencyKey: `clip:${fresh.id}:${scene.index}:${fresh.resolution}`,
        payload: { sceneIndex: scene.index, op: input.op ?? "text-to-video" },
        maxAttempts: 3,
      });
      jobs.push(job);
      fresh.usage.generationJobs++;
    }

    // Voice + music jobs. Idempotency keys are project/scene-based so repeated
    // "generate" calls modify the existing project rather than spawning
    // duplicate projects/jobs (§6 — conversational modifications).
    for (const scene of scenes) {
      if (scene.voiceoverText) {
        let vt = fresh.voiceTracks.find((t) => t.sceneIndex === scene.index);
        if (!vt) {
          vt = { id: uid("vv-"), sceneIndex: scene.index, text: scene.voiceoverText, gender: input.voiceGender, voiceId: input.voiceId };
          fresh.voiceTracks.push(vt);
        } else if (input.voiceGender) {
          vt.gender = input.voiceGender;
          vt.assetId = undefined; // regenerate
        }
        jobs.push(await VideoJobQueue.enqueue({
          organizationId, projectId: fresh.id, kind: "voice",
          idempotencyKey: `voice:${fresh.id}:${scene.index}`, payload: { trackId: vt.id, text: vt.text, gender: vt.gender },
        }));
      }
    }
    let mt = fresh.music[0];
    if (!mt) {
      mt = { id: uid("vm-"), mood: fresh.script?.tone ?? "uplifting", volume: 0.3 };
      fresh.music.push(mt);
    }
    jobs.push(await VideoJobQueue.enqueue({
      organizationId, projectId: fresh.id, kind: "music",
      idempotencyKey: `music:${fresh.id}`, payload: { trackId: mt.id, mood: mt.mood },
    }));

    await saveProject(fresh);
    // Kick the worker immediately for responsiveness.
    void VideoJobQueue.tick(organizationId, (job) => this.handleJob(job)).catch(() => {});
    return { project: fresh, jobs };
  },

  /**
   * Worker handler invoked by VideoJobQueue. Executes a single job stage and
   * updates the project. This is where provider fallback happens: if the routed
   * provider throws, the queue retry can re-route; a hard failure marks the
   * scene failed and the QA layer reports it.
   */
  async handleJob(job: VideoJob): Promise<{ result?: Record<string, unknown>; costMicros?: number }> {
    return withProjectLock(job.projectId, () => this._handleJobLocked(job));
  },

  async _handleJobLocked(job: VideoJob): Promise<{ result?: Record<string, unknown>; costMicros?: number }> {
    const p = await loadProject(job.projectId);
    if (!p || p.organizationId !== job.organizationId) throw new Error("project not found");

    if (job.kind === "scene_clip") {
      const sceneIndex = Number(job.payload?.sceneIndex ?? 0);
      const op = (job.payload?.op as any) ?? "text-to-video";
      const route = videoProviderGateway.route({
        op,
        resolution: p.resolution,
        aspectRatio: p.aspectRatio,
        durationSec: p.scenes[sceneIndex]?.durationSec ?? p.targetDurationSec,
        needsProductConsistency: p.products.length > 0,
      });
      const result = await videoProviderGateway.generate(route.providerId, route.modelId, {
        op, prompt: p.scenes[sceneIndex]?.visualPrompt ?? p.prompt,
        aspectRatio: p.aspectRatio, resolution: p.resolution, quality: p.quality,
        durationSec: p.scenes[sceneIndex]?.durationSec ?? p.targetDurationSec,
        idempotencyKey: job.idempotencyKey,
        inputAssetUrls: p.products.flatMap((pr) => pr.images),
        consistencyKey: p.products[0]?.sourceId,
      });
      const asset: VideoAsset = {
        id: uid("va-"), kind: "clip", url: result.assetUrl!, mime: "video/mp4",
        durationSec: result.durationSec, providerId: route.providerId, modelId: route.modelId,
        meta: result.meta, createdAt: new Date().toISOString(),
      };
      p.assets.push(asset);
      const scene = p.scenes.find((s) => s.index === sceneIndex);
      if (scene) { scene.clipAssetId = asset.id; scene.status = "ready"; }
      p.usage.successfulGenerations++;
      p.usage.estimatedCostMicros += route.estimatedCostMicros;
      await saveProject(p);
      return { result: { assetId: asset.id, route }, costMicros: route.estimatedCostMicros };
    }

    if (job.kind === "voice") {
      const trackId = String(job.payload?.trackId);
      const track = p.voiceTracks.find((t) => t.id === trackId);
      if (!track) throw new Error("voice track missing");
      const produced = await produceVoiceover(p, track);
      const asset: VideoAsset = {
        id: produced.track.id, kind: "audio_voice", url: produced.url, mime: "audio/wav",
        bytes: produced.bytes, durationSec: produced.durationSec, createdAt: new Date().toISOString(),
      };
      p.assets = p.assets.filter((a) => a.id !== asset.id);
      p.assets.push(asset);
      p.usage.voiceSeconds += produced.durationSec;
      await saveProject(p);
      return { result: { assetId: asset.id } };
    }

    if (job.kind === "music") {
      const trackId = String(job.payload?.trackId);
      const track = p.music.find((t) => t.id === trackId) ?? { id: trackId, mood: "uplifting", volume: 0.3 };
      const produced = await produceMusic(p, track);
      const asset: VideoAsset = {
        id: produced.track.id, kind: "audio_music", url: produced.url, mime: "audio/wav",
        createdAt: new Date().toISOString(),
      };
      p.assets = p.assets.filter((a) => a.id !== asset.id);
      p.assets.push(asset);
      await saveProject(p);
      return { result: { assetId: asset.id } };
    }

    if (job.kind === "render") {
      const versionId = String(job.payload?.versionId);
      const version = p.versions.find((v) => v.id === versionId);
      if (!version) throw new Error("version missing");
      version.status = "rendering";
      await saveProject(p);
      const result = await renderVersion(p, version);
      if (result.status === "rendered" && result.url) {
        const asset: VideoAsset = {
          id: uid("va-"), kind: "render", url: result.url, mime: "video/mp4",
          bytes: result.bytes, thumbnailUrl: result.thumbnailUrl,
          durationSec: p.usage.totalDurationSec, createdAt: new Date().toISOString(),
        };
        p.assets.push(asset);
        version.renderAssetId = asset.id;
        if (result.thumbnailUrl) version.thumbnailAssetId = result.thumbnailUrl;
        version.status = "ready";
        p.usage.renderMs += result.elapsedMs;
        p.usage.outputBytes += result.bytes ?? 0;
      } else {
        version.status = "failed";
      }
      await saveProject(p);
      return { result: { status: result.status, url: result.url } };
    }

    if (job.kind === "qa") {
      p.captions = buildCaptions(p);
      const report = await runQualityChecks(p);
      p.status = report.passed ? "ready" : "failed";
      await saveProject(p);
      await emitKernel("video.project.qa", { projectId: p.id, passed: report.passed });
      return { result: { report } };
    }

    return {};
  },

  // ── Versions & rendering ─────────────────────────────────────────
  async createVersion(organizationId: string, id: string, aspectRatio?: VideoAspectRatio, platform?: string): Promise<VideoProject | null> {
    const p = await this.getProject(organizationId, id);
    if (!p) return null;
    const version: VideoVersion = {
      id: uid("vv-"),
      label: platform ?? (aspectRatio ?? p.aspectRatio),
      aspectRatio: aspectRatio ?? p.aspectRatio,
      resolution: p.resolution,
      platform,
      status: "planned",
      createdAt: new Date().toISOString(),
    };
    p.versions.push(version);
    await saveProject(p);
    return p;
  },

  async render(organizationId: string, id: string, versionId?: string): Promise<{ project: VideoProject; job: VideoJob } | null> {
    let p = await this.getProject(organizationId, id);
    if (!p) return null;
    if (p.versions.length === 0) {
      p = (await this.createVersion(organizationId, id))!;
    }
    const version = p.versions.find((v) => v.id === versionId) ?? p.versions[p.versions.length - 1]!;
    p.status = "rendering";
    await saveProject(p);
    const job = await VideoJobQueue.enqueue({
      organizationId, projectId: p.id, kind: "render",
      idempotencyKey: `render:${p.id}:${version.id}`,
      payload: { versionId: version.id },
    });
    // After render, queue QA.
    await VideoJobQueue.enqueue({
      organizationId, projectId: p.id, kind: "qa",
      idempotencyKey: `qa:${p.id}:${version.id}`,
      payload: { versionId: version.id },
    });
    void VideoJobQueue.tick(organizationId, (j) => this.handleJob(j)).catch(() => {});
    return { project: (await this.getProject(organizationId, id))!, job };
  },

  /** Convenience: plan → generate → render in one call (still async jobs). */
  async produce(organizationId: string, id: string, input: GenerateInput = {}): Promise<VideoProject | null> {
    await this.plan(organizationId, id);
    await this.generate(organizationId, id, input);
    const r = await this.render(organizationId, id);
    return r?.project ?? this.getProject(organizationId, id);
  },

  async getJob(organizationId: string, jobId: string): Promise<VideoJob | null> {
    return VideoJobQueue.get(organizationId, jobId);
  },

  async listJobs(organizationId: string, projectId?: string): Promise<VideoJob[]> {
    const jobs = await VideoJobQueue.list(organizationId);
    return projectId ? jobs.filter((j) => j.projectId === projectId) : jobs;
  },

  async cancelJob(organizationId: string, jobId: string): Promise<VideoJob | null> {
    return VideoJobQueue.cancel(organizationId, jobId);
  },

  // ── Conversational modification (§6) ─────────────────────────────
  async modify(organizationId: string, id: string, mod: VideoModification): Promise<VideoProject | null> {
    const p = await this.getProject(organizationId, id);
    if (!p) return null;
    switch (mod.action) {
      case "shorten":
        p.targetDurationSec = Math.max(5, Math.round(p.targetDurationSec * 0.7));
        break;
      case "lengthen":
        p.targetDurationSec = Math.min(120, Math.round(p.targetDurationSec * 1.3));
        break;
      case "change_background":
        p.scenes.forEach((s) => { s.environment = String(mod.value ?? "new background"); s.status = "planned"; s.clipAssetId = undefined; });
        break;
      case "set_tone":
        if (p.script) p.script.tone = String(mod.value ?? "professional");
        break;
      case "set_voice_gender":
        p.voiceTracks.forEach((t) => { t.gender = (mod.value as any) ?? "neutral"; t.assetId = undefined; });
        break;
      case "change_music":
        p.music = [{ id: uid("vm-"), mood: String(mod.value ?? "new mood"), volume: 0.3 }];
        break;
      case "zoom_product":
        p.scenes.forEach((s) => { s.cameraMovement = "slow push-in on product"; });
        break;
      case "set_aspect":
      case "reformat":
        if (mod.value) p.aspectRatio = mod.value as VideoAspectRatio;
        break;
      case "add_captions":
        p.captions = buildCaptions(p);
        break;
      default:
        // Custom instruction — store on prompt and re-plan; no fabricated specifics.
        p.prompt = `${p.prompt}\n\nModification: ${mod.instruction ?? JSON.stringify(mod.value)}`;
    }
    // Re-plan to keep script/scene durations consistent, preserving assets that
    // are still valid.
    const plan = planProduction({
      prompt: p.prompt, creationType: p.creationType, durationSec: p.targetDurationSec,
      products: p.products, aspectRatio: p.aspectRatio,
    });
    p.script = plan.script;
    p.storyboard = plan.storyboard;
    p.scenes = plan.scenes.map((s) => {
      const prior = p.scenes.find((x) => x.index === s.index);
      return prior?.clipAssetId && mod.action !== "change_background" ? { ...s, clipAssetId: prior.clipAssetId, status: "ready" as const } : s;
    });
    p.captions = buildCaptions(p);
    await saveProject(p);
    await emitKernel("video.project.modified", { projectId: p.id, action: mod.action });
    return p;
  },

  // ── Marketplace integration (§11) ────────────────────────────────
  async attachMarketplaceProduct(organizationId: string, id: string, productId: string): Promise<VideoProject | null> {
    // Resolve product info through the existing Marketplace service. We import
    // lazily to avoid a hard dependency when the marketplace module is idle.
    let product: VideoProductRef | undefined;
    try {
      const mod = await import("../marketplace/appStore.service.js").catch(() => null);
      // The marketplace app store catalog differs from vendor products; we also
      // accept a product object passed through the AI commerce product catalog.
      const catalog = await import("../aiCommerce/commerceDiscovery.service.js").catch(() => null);
      const found = (catalog as any)?.CommerceDiscoveryService;
      if (found && typeof found.getProduct === "function") {
        const rec = await found.getProduct(productId);
        if (rec) {
          product = {
            source: "marketplace", sourceId: rec.id, name: rec.name, description: rec.description,
            images: rec.images ?? [],
            price: typeof rec.price === "string" ? rec.price : rec.price?.display,
            brand: rec.brand, features: rec.features ?? [], category: rec.category,
            vendorName: rec.vendorName,
          };
        }
      }
      void mod;
    } catch (e) {
      logger.warn("[video] marketplace product lookup failed", { productId, err: (e as Error).message });
    }
    if (!product) {
      // Do not invent product facts; attach a stub requiring the caller to supply.
      throw Object.assign(new Error("Product not found in marketplace; supply product details explicitly"), { status: 404, code: "PRODUCT_NOT_FOUND" });
    }
    const p = await this.getProject(organizationId, id);
    if (!p) return null;
    p.products = [product];
    p.marketplaceProductId = productId;
    await saveProject(p);
    return p;
  },

  // ── Publishing (§12) ─────────────────────────────────────────────
  async publish(organizationId: string, id: string, req: VideoPublishRequest): Promise<{ results: VideoPublishResult[] }> {
    const p = await this.getProject(organizationId, id);
    if (!p) throw Object.assign(new Error("Project not found"), { status: 404 });
    const version = p.versions.find((v) => v.id === req.versionId);
    if (!version?.renderAssetId) throw Object.assign(new Error("Version not rendered"), { status: 400 });

    // Delegate to the existing publishing/media-factory publish service when
    // available; report unsupported platforms honestly.
    const results: VideoPublishResult[] = [];
    for (const platform of req.platforms) {
      try {
        const mod = await import("../mediaFactory/publishing.service.js").catch(() => null);
        const svc = (mod as any)?.PublishingService;
        if (svc && typeof svc.publish === "function") {
          const res = await svc.publish({ organizationId, platform, mediaUrl: p.assets.find((a) => a.id === version.renderAssetId)?.url, title: req.title, description: req.description });
          results.push({ platform, status: "published", externalId: res?.externalId, url: res?.url });
        } else {
          results.push({ platform, status: "unsupported", error: "publishing integration not configured" });
        }
      } catch (e) {
        results.push({ platform, status: "failed", error: (e as Error).message });
      }
    }
    await emitKernel("video.project.published", { projectId: p.id, platforms: req.platforms });
    return { results };
  },

  // ── Asset / export ───────────────────────────────────────────────
  async getAsset(organizationId: string, projectId: string, assetId: string): Promise<VideoAsset | null> {
    const p = await this.getProject(organizationId, projectId);
    if (!p) return null;
    return p.assets.find((a) => a.id === assetId) ?? null;
  },

  async setStatus(organizationId: string, id: string, status: VideoProjectStatus): Promise<VideoProject | null> {
    const p = await this.getProject(organizationId, id);
    if (!p) return null;
    p.status = status;
    await saveProject(p);
    return p;
  },
};

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "video-engine", kind, payload });
  } catch { /* kernel optional */ }
}
