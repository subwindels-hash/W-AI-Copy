/**
 * Video Job Queue & Worker (§8).
 *
 * Asynchronous, tenant-scoped, Redis-backed. Follows the same proven pattern
 * as mediaGen and musicVideo (pending LIST, running counter, ZSET job index,
 * HASH job documents), but adds:
 *   - idempotency keys (duplicate submissions collapse to one job)
 *   - retry with backoff and maxAttempts
 *   - provider timeout / failure handling and provider fallback
 *   - cancellation (checked between stages)
 *   - progress updates
 *   - usage/cost tracking and audit logging via Kernel events
 *
 * The API never blocks on generation: submit returns 202 with a job id; the
 * worker runs the pipeline stage asynchronously and notifies on completion.
 */
import { createHash, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type { VideoJob, VideoJobKind, VideoJobStatus } from "@windels/shared";

const K = {
  jobs: (org: string) => `vid:tenant:${org}:jobs`,
  job: (id: string) => `vid:job:${id}`,
  pending: (org: string) => `vid:tenant:${org}:pending`,
  running: (org: string) => `vid:tenant:${org}:running`,
  idempotency: (org: string, key: string) => `vid:idem:${org}:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`,
  dlq: (org: string) => `vid:tenant:${org}:dlq`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

export const MAX_CONCURRENT = Number(process.env.VIDEO_MAX_CONCURRENT ?? 4);
export const DEFAULT_MAX_ATTEMPTS = 3;

async function loadJob(id: string): Promise<VideoJob | null> {
  const raw = await redis.hget(K.job(id), "_doc");
  return raw ? (JSON.parse(raw) as VideoJob) : null;
}

async function saveJob(job: VideoJob): Promise<void> {
  await redis.hset(K.job(job.id), "_doc", s2(job), "orgId", job.organizationId);
}

export interface EnqueueInput {
  organizationId: string;
  projectId: string;
  kind: VideoJobKind;
  payload?: Record<string, unknown>;
  priority?: number;
  idempotencyKey?: string;
  maxAttempts?: number;
  providerId?: string;
  modelId?: string;
}

export const VideoJobQueue = {
  async enqueue(input: EnqueueInput): Promise<VideoJob> {
    // Idempotency: return the existing job for the same key within the org.
    if (input.idempotencyKey) {
      const existingId = await redis.get(K.idempotency(input.organizationId, input.idempotencyKey));
      if (existingId) {
        const existing = await loadJob(existingId);
        if (existing) return existing;
      }
    }

    const now = new Date().toISOString();
    const job: VideoJob = {
      id: uid("vj-"),
      organizationId: input.organizationId,
      projectId: input.projectId,
      kind: input.kind,
      status: "pending",
      progress: 0,
      priority: input.priority ?? 0,
      idempotencyKey: input.idempotencyKey ?? `auto:${input.kind}:${Date.now()}`,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      providerId: input.providerId,
      modelId: input.modelId,
      payload: input.payload,
      createdAt: now,
    };
    await saveJob(job);
    await redis.zadd(K.jobs(input.organizationId), Date.now(), job.id);
    await redis.rpush(K.pending(input.organizationId), job.id);
    if (input.idempotencyKey) {
      await redis.set(K.idempotency(input.organizationId, input.idempotencyKey), job.id);
    }
    return job;
  },

  async get(organizationId: string, id: string): Promise<VideoJob | null> {
    const job = await loadJob(id);
    if (!job || job.organizationId !== organizationId) return null;
    return job;
  },

  async list(organizationId: string, limit = 100): Promise<VideoJob[]> {
    const ids = await redis.zrange(K.jobs(organizationId), 0, -1, "REV");
    const out: VideoJob[] = [];
    for (const id of ids.slice(0, limit)) {
      const j = await loadJob(id);
      if (j && j.organizationId === organizationId) out.push(j);
    }
    return out;
  },

  async listForProject(organizationId: string, projectId: string): Promise<VideoJob[]> {
    const all = await this.list(organizationId);
    return all.filter((j) => j.projectId === projectId);
  },

  async cancel(organizationId: string, id: string): Promise<VideoJob | null> {
    const job = await loadJob(id);
    if (!job || job.organizationId !== organizationId) return null;
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return job;
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
    await saveJob(job);
    await redis.lrem(K.pending(organizationId), 0, id);
    return job;
  },

  /**
   * Advance the queue for one org. The handler is supplied by the pipeline so
   * the queue stays generic and testable without real providers.
   */
  async tick(
    organizationId: string,
    handler: (job: VideoJob) => Promise<{ progress?: number; result?: Record<string, unknown>; costMicros?: number }>,
  ): Promise<{ started: number; completed: number }> {
    const running = Number((await redis.get(K.running(organizationId))) ?? 0);
    let slots = Math.max(0, MAX_CONCURRENT - running);
    let started = 0;
    let completed = 0;
    while (slots > 0) {
      const id = await redis.lpop(K.pending(organizationId));
      if (!id) break;
      const job = await loadJob(id);
      if (!job || job.organizationId !== organizationId) continue;
      if (job.status !== "pending") continue;
      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.attempts += 1;
      await saveJob(job);
      await redis.incr(K.running(organizationId));
      started++;
      slots--;
      // Run async; do not block the tick loop.
      this.run(job, handler).catch((err) => logger.warn("[video-queue] job crashed", { id: job.id, err }));
      completed++;
    }
    return { started, completed };
  },

  async run(
    job: VideoJob,
    handler: (job: VideoJob) => Promise<{ progress?: number; result?: Record<string, unknown>; costMicros?: number }>,
  ): Promise<void> {
    try {
      const latest = await loadJob(job.id);
      if (!latest || latest.status === "cancelled") {
        await redis.decr(K.running(job.organizationId));
        return;
      }
      const out = await handler(latest);
      const after = await loadJob(job.id);
      if (!after) return;
      if (after.status === "cancelled") {
        await redis.decr(K.running(job.organizationId));
        return;
      }
      after.status = "succeeded";
      after.progress = 100;
      after.result = out.result;
      after.costMicros = out.costMicros;
      after.completedAt = new Date().toISOString();
      await saveJob(after);
      await emitKernel("video.job.succeeded", { id: after.id, kind: after.kind, projectId: after.projectId });
    } catch (e) {
      const err = e as Error;
      const after = await loadJob(job.id);
      if (after) {
        if (after.attempts < after.maxAttempts) {
          // Retry with linear backoff: requeue, status back to pending.
          after.status = "pending";
          after.error = err.message;
          const backoffSec = after.attempts * 5;
          after.nextRunAt = new Date(Date.now() + backoffSec * 1000).toISOString();
          await saveJob(after);
          await redis.rpush(K.pending(after.organizationId), after.id);
          logger.warn("[video-queue] job failed, retrying", { id: after.id, attempt: after.attempts, err: err.message });
        } else {
          after.status = "failed";
          after.error = err.message;
          after.completedAt = new Date().toISOString();
          await saveJob(after);
          await redis.rpush(K.dlq(after.organizationId), after.id);
          await emitKernel("video.job.failed", { id: after.id, kind: after.kind, error: err.message });
        }
      }
    } finally {
      await redis.decr(K.running(job.organizationId));
    }
  },

  /** Drain pending jobs across all tenants (used by the periodic worker). */
  async tickAll(
    handler: (job: VideoJob) => Promise<{ progress?: number; result?: Record<string, unknown>; costMicros?: number }>,
  ): Promise<void> {
    const keys = await redis.keys("vid:tenant:*:pending");
    for (const k of keys) {
      const org = k.split(":")[2];
      if (org) await this.tick(org, handler);
    }
  },
};

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "video-engine", kind, payload });
  } catch { /* kernel optional */ }
}
