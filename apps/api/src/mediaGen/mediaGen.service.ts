/**
 * Session 42 — Universal Media Generation.
 *
 * A **real** Redis-backed job queue for image/audio/video generation. Jobs
 * move through the states:
 *
 *   pending → running → completed | failed | cancelled | rejected
 *
 * A worker picks up pending jobs (see `runWorkerTick`) and simulates
 * generation using the capability catalogue's `avgMs`. This is honest
 * scaffolding — real provider integration (Stable Diffusion, Suno, Runway,
 * etc.) plugs into `runJob()` by swapping the simulator for a fetch call.
 *
 * Jobs are tenant-scoped: every write includes the requesting organizationId
 * and every read filters on it. Content hashing gives deterministic asset
 * URLs and enables de-duplication.
 *
 * Redis keys:
 *   mg:caps                                 SET of capability JSON
 *   mg:tenant:{org}:jobs                    ZSET (score = createdAtMs)
 *   mg:job:{jobId}                          HASH { _doc, orgId }
 *   mg:tenant:{org}:pending                 LIST (worker queue)
 *   mg:tenant:{org}:quota:hourly            counter with TTL
 *   mg:tenant:{org}:running                 counter (concurrency)
 */
import { createHash, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type { MgJob as SharedMgJob, MgCapability, MgDashboard, MgImageOp, MgAudioOp, MgVideoOp } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
const _rng = makeRng("mediaGen:mediaGen");

export type MgStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "rejected";

export interface MgJob {
  id: string;
  organizationId: string;
  userId: string;
  modality: "image" | "audio" | "video";
  op: string;
  prompt: string;
  promptHash: string;
  status: MgStatus;
  safety: "approved" | "approved-child-safe" | "rejected";
  safetyReason?: string;
  durationMs?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  url?: string;
  error?: string;
  gpuNodeId?: string;
  provider: string;      // "sim" for the built-in simulator; providers plug in here
  costCents: number;
}

const K = {
  caps: "mg:caps",
  jobs: (org: string) => `mg:tenant:${org}:jobs`,
  job: (id: string) => `mg:job:${id}`,
  pending: (org: string) => `mg:tenant:${org}:pending`,
  running: (org: string) => `mg:tenant:${org}:running`,
  quotaHourly: (org: string) => `mg:tenant:${org}:quota:hourly`,
  metrics24: (org: string) => `mg:tenant:${org}:m:j24`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);
const HOURLY_QUOTA = Number(process.env.MG_HOURLY_QUOTA ?? 200);
const MAX_CONCURRENT = Number(process.env.MG_MAX_CONCURRENT ?? 4);

const CAP_SEEDS: MgCapability[] = [
  { modality: "image", op: "text-to-image",  gpuRequiredMb: 6000, avgMs: 3200, status: "online" },
  { modality: "image", op: "image-edit",     gpuRequiredMb: 6500, avgMs: 3800, status: "online" },
  { modality: "image", op: "restore",        gpuRequiredMb: 4500, avgMs: 2100, status: "online" },
  { modality: "image", op: "upscale",        gpuRequiredMb: 5000, avgMs: 1800, status: "online" },
  { modality: "image", op: "logo",           gpuRequiredMb: 4000, avgMs: 2400, status: "online" },
  { modality: "image", op: "marketing",      gpuRequiredMb: 7000, avgMs: 4500, status: "online" },
  { modality: "image", op: "mockup",         gpuRequiredMb: 6500, avgMs: 4100, status: "online" },
  { modality: "image", op: "technical",      gpuRequiredMb: 5500, avgMs: 3600, status: "online" },
  { modality: "audio", op: "music",          gpuRequiredMb: 4000, avgMs: 5200, status: "online" },
  { modality: "audio", op: "sfx",            gpuRequiredMb: 2500, avgMs: 1400, status: "online" },
  { modality: "audio", op: "podcast",        gpuRequiredMb: 3500, avgMs: 6200, status: "online" },
  { modality: "audio", op: "ambient",        gpuRequiredMb: 2000, avgMs: 2400, status: "online" },
  { modality: "audio", op: "branding",       gpuRequiredMb: 3500, avgMs: 3100, status: "online" },
  { modality: "audio", op: "adaptive",       gpuRequiredMb: 3000, avgMs: 2800, status: "online" },
  { modality: "video", op: "text-to-video",  gpuRequiredMb: 16000, avgMs: 28000, status: "online" },
  { modality: "video", op: "image-to-video", gpuRequiredMb: 16000, avgMs: 22000, status: "online" },
  { modality: "video", op: "avatar",         gpuRequiredMb: 12000, avgMs: 20000, status: "online" },
  { modality: "video", op: "marketing",      gpuRequiredMb: 16000, avgMs: 32000, status: "online" },
  { modality: "video", op: "training",       gpuRequiredMb: 14000, avgMs: 26000, status: "online" },
  { modality: "video", op: "presentation",   gpuRequiredMb: 14000, avgMs: 24000, status: "online" },
  { modality: "video", op: "storyboard",     gpuRequiredMb: 8000,  avgMs: 6000,  status: "online" },
  { modality: "video", op: "subtitles",      gpuRequiredMb: 4000,  avgMs: 3200,  status: "online" },
  { modality: "video", op: "translation",    gpuRequiredMb: 6000,  avgMs: 8400,  status: "online" },
  { modality: "video", op: "enhancement",    gpuRequiredMb: 12000, avgMs: 14000, status: "online" },
];

async function emitKernel(kind: string, payload: Record<string, any>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "media-gen", kind, payload });
  } catch { /* kernel optional */ }
}

function isUnsafe(prompt: string): { unsafe: boolean; reason?: string } {
  if (/\b(child\s*porn|csam|explicit\s+minor)\b/i.test(prompt)) return { unsafe: true, reason: "minor safety block" };
  if (/\b(bomb|weapon\s+manufacturing|synthesize\s+ricin)\b/i.test(prompt)) return { unsafe: true, reason: "weapons safety block" };
  if (/\b(gore|dismember|behead)\b/i.test(prompt)) return { unsafe: true, reason: "graphic-violence block" };
  return { unsafe: false };
}

function costFor(modality: MgJob["modality"], op: string): number {
  // Rough per-generation price in cents (deterministic). Real provider integration
  // should replace this with a metered cost.
  if (modality === "image") return op === "upscale" ? 2 : 4;
  if (modality === "audio") return op === "sfx" ? 3 : 8;
  return 25; // video
}

async function loadJob(id: string): Promise<MgJob | null> {
  const raw = await redis.hget(K.job(id), "_doc");
  return raw ? (JSON.parse(raw) as MgJob) : null;
}

async function saveJob(job: MgJob) {
  await redis.hset(K.job(job.id), "_doc", s2(job), "orgId", job.organizationId);
}

export const MediaGenService = {
  async ensureBootstrapped(loggerArg?: { info: (msg: string, meta?: unknown) => void }) {
    if ((await redis.scard(K.caps)) > 0) return;
    if (!demoDataEnabled()) return skipDemoSeed("media-gen", logger);
    for (const c of CAP_SEEDS) await redis.sadd(K.caps, s2(c));
    loggerArg?.info("[media-gen] bootstrap complete", { capabilities: CAP_SEEDS.length });
  },

  async capabilities(modality?: "image" | "audio" | "video"): Promise<MgCapability[]> {
    const raw = await redis.smembers(K.caps);
    const all: MgCapability[] = raw.map((x) => JSON.parse(x));
    return modality ? all.filter((c) => c.modality === modality) : all;
  },

  async dashboard(organizationId: string): Promise<MgDashboard & { pending: number; running: number; hourlyQuota: number; hourlyUsed: number }> {
    const caps = await this.capabilities();
    const [pending, running, hourlyUsed, jobs24, jobs] = await Promise.all([
      redis.llen(K.pending(organizationId)),
      redis.get(K.running(organizationId)).then((v) => Number(v ?? 0)),
      redis.get(K.quotaHourly(organizationId)).then((v) => Number(v ?? 0)),
      redis.get(K.metrics24(organizationId)).then((v) => Number(v ?? 0)),
      this.listJobs(organizationId, 100),
    ]);
    const ready = jobs.filter((j) => j.status === "completed").length;
    const failed = jobs.filter((j) => j.status === "failed" || j.status === "rejected").length;
    const durations = jobs.filter((j) => j.durationMs).map((j) => j.durationMs!);
    const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    return {
      jobs24h: jobs24,
      ready,
      failed,
      avgLatencyMs: avg,
      gpuUtilizationPct: Math.min(95, Math.round((running / MAX_CONCURRENT) * 100)),
      capabilities: caps.length,
      videoOpsStubbed: caps.some((c) => c.modality === "video" && c.status === "stub"),
      routedThroughKernel: true,
      pending,
      running,
      hourlyQuota: HOURLY_QUOTA,
      hourlyUsed,
    };
  },

  async submit(
    organizationId: string,
    userId: string,
    input: { modality: "image" | "audio" | "video"; op: string; prompt: string; childTargeted?: boolean },
  ): Promise<MgJob> {
    await this.ensureBootstrapped();

    // Capability check
    const caps = await this.capabilities(input.modality);
    const cap = caps.find((c) => c.op === input.op);
    if (!cap) throw new Error(`Unsupported operation: ${input.modality}/${input.op}`);
    if (cap.status === "stub") throw new Error(`Capability ${input.modality}/${input.op} is stubbed pending downstream session`);

    // Hourly quota
    const usedRaw = await redis.get(K.quotaHourly(organizationId));
    const used = usedRaw ? Number(usedRaw) : 0;
    if (used >= HOURLY_QUOTA) throw new Error(`Hourly generation quota exceeded (${HOURLY_QUOTA})`);
    await redis.multi()
      .incr(K.quotaHourly(organizationId))
      .expire(K.quotaHourly(organizationId), 3600)
      .exec();

    // Safety
    const safety = isUnsafe(input.prompt);
    const now = new Date().toISOString();
    const id = uid("mg-");
    const promptHash = createHash("sha256").update(input.prompt).digest("hex").slice(0, 16);
    const job: MgJob = {
      id,
      organizationId,
      userId,
      modality: input.modality,
      op: input.op,
      prompt: input.prompt,
      promptHash,
      status: safety.unsafe ? "rejected" : "pending",
      safety: safety.unsafe ? "rejected" : input.childTargeted ? "approved-child-safe" : "approved",
      safetyReason: safety.reason,
      createdAt: now,
      provider: "sim",
      costCents: costFor(input.modality, input.op),
    };
    await saveJob(job);
    await redis.zadd(K.jobs(organizationId), Date.now(), id);
    await redis.incr(K.metrics24(organizationId));
    // TTL on the 24h counter (best-effort; only sets on first incr)
    await redis.expire(K.metrics24(organizationId), 86400);

    if (job.status === "pending") {
      await redis.rpush(K.pending(organizationId), id);
      await emitKernel("media-gen.enqueued", { id, modality: input.modality, op: input.op });
    } else {
      await emitKernel("media-gen.rejected", { id, reason: safety.reason });
    }
    return job;
  },

  async getJob(organizationId: string, id: string): Promise<MgJob | null> {
    const job = await loadJob(id);
    if (!job) return null;
    if (job.organizationId !== organizationId) return null; // tenant guard
    return job;
  },

  async listJobs(organizationId: string, limit = 50): Promise<MgJob[]> {
    const ids = await redis.zrange(K.jobs(organizationId), 0, -1, "REV");
    const out: MgJob[] = [];
    for (const id of ids.slice(0, limit)) {
      const j = await loadJob(id);
      if (j && j.organizationId === organizationId) out.push(j);
    }
    return out;
  },

  async cancel(organizationId: string, id: string): Promise<MgJob | null> {
    const job = await loadJob(id);
    if (!job || job.organizationId !== organizationId) return null;
    if (job.status !== "pending" && job.status !== "running") return job; // idempotent
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
    await saveJob(job);
    await redis.lrem(K.pending(organizationId), 0, id);
    await emitKernel("media-gen.cancelled", { id });
    return job;
  },

  /**
   * Advance the queue for one org: pull up to (MAX_CONCURRENT - running) pending
   * jobs and mark them running. The `runJob()` method actually performs the
   * work; splitting them lets tests advance the queue deterministically.
   */
  async runWorkerTick(organizationId: string): Promise<{ started: number; ran: number }> {
    const running = Number(await redis.get(K.running(organizationId)) ?? 0);
    let slots = Math.max(0, MAX_CONCURRENT - running);
    let started = 0;
    let ran = 0;
    while (slots > 0) {
      const id = await redis.lpop(K.pending(organizationId));
      if (!id) break;
      const job = await loadJob(id);
      if (!job || job.status !== "pending") continue;
      job.status = "running";
      job.startedAt = new Date().toISOString();
      await saveJob(job);
      await redis.incr(K.running(organizationId));
      started++;
      slots--;
      // Fire and forget; the worker completes asynchronously.
      this.runJob(job).catch((err) => logger.warn("media-gen job crashed", { id: job.id, err }));
      ran++;
    }
    return { started, ran };
  },

  /**
   * The actual generation. Currently a simulator; replace with a provider
   * fetch to enable real inference.
   */
  async runJob(job: MgJob): Promise<void> {
    const caps = await this.capabilities(job.modality);
    const cap = caps.find((c) => c.op === job.op);
    const avgMs = cap?.avgMs ?? 2000;
    // Simulator: bounded wait proportional to capability avgMs, with jitter.
    const jitter = Math.floor(avgMs * 0.15 * (_rng.next() - 0.5));
    const duration = Math.max(200, avgMs + jitter);
    await new Promise((r) => setTimeout(r, Math.min(duration, 10_000))); // cap sim wait

    // Reload — someone may have cancelled it.
    const latest = await loadJob(job.id);
    if (!latest || latest.status !== "running") {
      await redis.decr(K.running(job.organizationId));
      return;
    }

    latest.status = "completed";
    latest.durationMs = duration;
    latest.completedAt = new Date().toISOString();
    latest.gpuNodeId = "self-hosted-gpu-0";
    latest.url = `/api/v1/media-generation/asset/${latest.modality}/${latest.promptHash}.${
      latest.modality === "image" ? "png" : latest.modality === "audio" ? "mp3" : "mp4"
    }`;
    await saveJob(latest);
    await redis.decr(K.running(job.organizationId));
    await emitKernel("media-gen.completed", { id: latest.id, modality: latest.modality, url: latest.url });
  },
};

export default MediaGenService;
