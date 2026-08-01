/**
 * Session 77B — Publishing pipeline: org-scoped publish job engine.
 *
 * State machine:  queued | scheduled → uploading → published | failed
 *                 failed → queued (manual retry)   queued|scheduled|failed → cancelled
 *
 * - Jobs persist in Redis, org-scoped: pub:<oid>:jobs (zset by createdAt),
 *   pub:<oid>:job:<id> (hash _doc), pub:<oid>:due (zset by nextAttemptAt).
 * - The worker polls due jobs across orgs (pub:orgs index) and drives the
 *   state machine; transient errors retry with exponential backoff
 *   (30s · 2^(n-1) + jitter, capped at 15m, max 5 attempts); permanent errors
 *   (auth, validation, media) fail immediately with detailed error info.
 * - Every transition appends to an org-scoped, capped audit list and emits a
 *   Kernel event (media.publish.completed / media.publish.failed).
 * - Idempotency: client idempotencyKey → pub:<oid>:idem:<key> (24h TTL); a
 *   duplicate submit returns the original job instead of double-posting.
 */
import { randomUUID, randomInt } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/result.js";
import {
  PLATFORM_ADAPTERS, PlatformPublishError, type FetchImpl, type MediaPayload, type PlatformAdapter,
} from "./platforms.js";
import { ensureFreshToken, ensureFreshOrgToken } from "./tokens.js";
import { reviewContent } from "./childSafety.js";
import type {
  PubJob, PubJobStatus, PubPlatformId, PubPublishInput, PubAuditEvent, PubAuditKind,
  PubPlatformCallbackUpdate, PubTokenScope,
} from "@windels/shared";

/* ── Minimal Redis surface (kept small so tests can inject a fake) ── */

export interface PublishKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(key: string): Promise<any>;
  hset(key: string, field: string, value: string): Promise<any>;
  hgetall(key: string): Promise<Record<string, string>>;
  zadd(key: string, score: number, member: string): Promise<any>;
  zrange(key: string, start: number, stop: number, ...args: any[]): Promise<string[]>;
  zrangebyscore(key: string, min: number | string, max: number | string, ...args: any[]): Promise<string[]>;
  zrem(key: string, member: string): Promise<any>;
  lpush(key: string, value: string): Promise<any>;
  ltrim(key: string, start: number, stop: number): Promise<any>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export interface EngineDeps {
  kv: PublishKv;
  /** Adapter overrides (tests inject fakes). */
  adapters?: Partial<Record<PubPlatformId, PlatformAdapter>>;
  now?: () => number;
  fetchImpl?: FetchImpl;
  /** Media resolver override (tests skip disk/network). */
  resolveMedia?: (input: PubPublishInput, platform: PubPlatformId) => Promise<MediaPayload | undefined>;
  /** Kernel event hook override (tests). Default: real KernelService. */
  kernelDispatch?: (evt: { kind: string; source: string; payload: Record<string, unknown> }) => Promise<unknown>;
  maxAttempts?: number;
  pollBudgetMs?: number;
}

const K = {
  jobs: (oid: string) => `pub:${oid}:jobs`,
  job: (oid: string, id: string) => `pub:${oid}:job:${id}`,
  due: (oid: string) => `pub:${oid}:due`,
  audit: (oid: string) => `pub:${oid}:audit`,
  idem: (oid: string, key: string) => `pub:${oid}:idem:${key}`,
  orgs: "pub:orgs",
  oauthState: (state: string) => `pub:oauth:${state}`,
};

const MEDIA_CACHE_DIR = path.resolve(process.cwd(), "media-cache");
const AUDIT_CAP = 500;
const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 15 * 60_000;
const JOB_BATCH_PER_ORG = 16;
const IDEM_TTL_SEC = 86_400;
const GLOBAL_MEDIA_CAP_MB = Number(process.env.PUBLISH_MAX_MEDIA_MB ?? 512);

const j = <T>(s: string): T => JSON.parse(s) as T;
const s = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().replace(/-/g, "").slice(0, 16);

/** Exported for tests: 30s · 2^(n-1) capped at 15m, plus up to 5s jitter. */
export function backoffMs(attempt: number, jitterMs = randomInt(0, 5_000)): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS);
  return exp + jitterMs;
}

/* ── Engine ───────────────────────────────────────────────────────── */

export function createPublishEngine(deps: EngineDeps) {
  const kv = deps.kv;
  const now = () => deps.now?.() ?? Date.now();
  const adapterFor = (p: PubPlatformId): PlatformAdapter => deps.adapters?.[p] ?? PLATFORM_ADAPTERS[p];
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  async function audit(oid: string, kind: PubAuditKind, actor: string, extra: Partial<Pick<PubAuditEvent, "jobId" | "platform" | "detail">> = {}): Promise<void> {
    const evt: PubAuditEvent = { id: uid("ae-"), at: new Date().toISOString(), kind, actor, ...extra };
    await kv.lpush(K.audit(oid), s(evt));
    await kv.ltrim(K.audit(oid), 0, AUDIT_CAP - 1);
  }

  // Kernel routing is best-effort; job state is authoritative. A failed
  // module import is NOT cached by the ESM loader, so cache the outcome
  // ourselves — otherwise every event re-parses the kernel module graph.
  // A 2s guard ensures kernel/Redis trouble can never stall job execution.
  let kernelStatus: "unknown" | "ok" | "unavailable" = "unknown";
  let kernelRef: ((evt: { kind: string; source: string; payload: Record<string, unknown> }) => Promise<unknown>) | null = null;
  const DISPATCH_GUARD_MS = 2_000;
  async function dispatch(kind: string, payload: Record<string, unknown>): Promise<void> {
    try {
      if (deps.kernelDispatch) {
        await deps.kernelDispatch({ kind, source: "media-factory", payload });
        return;
      }
      if (kernelStatus === "unknown") {
        try {
          const mod = await import("../../kernel/kernel.service.js");
          kernelRef = mod.KernelService.dispatch.bind(mod.KernelService);
          kernelStatus = "ok";
        } catch {
          kernelStatus = "unavailable";
          return;
        }
      }
      if (kernelStatus !== "ok" || !kernelRef) return;
      await Promise.race([
        kernelRef({ kind, source: "media-factory", payload }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("kernel dispatch timed out")), DISPATCH_GUARD_MS)),
      ]);
    } catch { /* dispatch errors never affect job state */ }
  }

  async function load(oid: string, id: string): Promise<PubJob | null> {
    const raw = await kv.hgetall(K.job(oid, id));
    return raw._doc ? j<PubJob>(raw._doc) : null;
  }

  async function save(job: PubJob): Promise<void> {
    job.updatedAt = new Date().toISOString();
    await kv.hset(K.job(job.orgId, job.id), "_doc", s(job));
  }

  /** Appends to the per-job status history (capped at 50, newest last). */
  function pushHistory(job: PubJob, status: PubJobStatus, by: string, detail?: string): void {
    const h = job.statusHistory ?? [];
    h.push({ status, at: new Date().toISOString(), by, detail });
    job.statusHistory = h.slice(-50);
  }

  function validateInput(platform: PubPlatformId, input: PubPublishInput): PubPublishInput {
    const c = adapterFor(platform).constraints;
    const title = input.title?.trim();
    if (!title) throw AppError.badRequest("Title is required", { code: "TITLE_REQUIRED" });
    if (title.length > c.maxTitle) throw AppError.badRequest(`Title exceeds ${c.maxTitle} characters for ${platform}`, { code: "TITLE_TOO_LONG" });
    if (input.description && input.description.length > c.maxDescription) throw AppError.badRequest(`Description exceeds ${c.maxDescription} characters for ${platform}`, { code: "DESCRIPTION_TOO_LONG" });
    const mediaRef = input.videoUrl ?? input.mediaUrl;
    if (c.requiresMedia && !mediaRef) throw AppError.badRequest(`${platform} publishing requires a videoUrl or mediaUrl`, { code: "MEDIA_REQUIRED" });
    if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) throw AppError.badRequest("scheduledAt must be an ISO datetime", { code: "BAD_SCHEDULE" });
    if (input.idempotencyKey && input.idempotencyKey.length > 80) throw AppError.badRequest("idempotencyKey too long (max 80)", { code: "BAD_IDEMPOTENCY" });
    return { ...input, title, description: input.description?.trim() || undefined, tags: input.tags?.slice(0, 30) };
  }

  async function createJob(oid: string, ownerUserId: string, platform: PubPlatformId, rawInput: PubPublishInput, opts: { tokenScope?: PubTokenScope } = {}): Promise<{ job: PubJob; deduplicated: boolean }> {
    const input = validateInput(platform, rawInput);
    const t = now();

    // S77 ChildSafetyReviewer — a blocking pipeline step, per the spec's
    // "non-bypassable safety gates ... block publish/execution, not advisory
    // warnings". This previously ran only in mediaFactory.generate(), so the
    // publish route was an open path to a real upload: content generate()
    // would have refused could be posted verbatim, and content that never went
    // through generate() was never screened at all.
    //
    // The check runs before the job is persisted or queued, so a rejected
    // upload never exists as a record that a worker tick could pick up.
    const safety = reviewContent({ title: input.title, description: input.description, tags: input.tags });
    if (safety.verdict === "blocked") {
      await audit(oid, "job.safety_rejected", ownerUserId, {
        platform,
        detail: `blocked by content safety review: ${safety.reasons.join(", ")}`,
      });
      throw new AppError(
        "CONTENT_SAFETY_REJECTED",
        `Content safety review blocked this publish: ${safety.reasons.join(", ")}. ` +
        `Revise the title, description and tags, or route the item through human review.`,
        422,
        { reasons: safety.reasons },
      );
    }

    if (input.idempotencyKey) {
      const marker = await kv.set(K.idem(oid, input.idempotencyKey), "pending", "EX", IDEM_TTL_SEC, "NX");
      if (marker === null) {
        const existingId = await kv.get(K.idem(oid, input.idempotencyKey));
        const existing = existingId && existingId !== "pending" ? await load(oid, existingId) : null;
        if (existing) return { job: existing, deduplicated: true };
        throw AppError.conflict("A job with this idempotencyKey is already being created");
      }
    }

    const scheduledMs = input.scheduledAt ? Date.parse(input.scheduledAt) : undefined;
    const isFuture = scheduledMs !== undefined && scheduledMs > t;
    const job: PubJob = {
      id: uid("pj-"),
      orgId: oid,
      ownerUserId,
      platform,
      input,
      status: isFuture ? "scheduled" : "queued",
      tokenScope: opts.tokenScope ?? "user",
      attempts: 0,
      maxAttempts,
      nextAttemptAt: isFuture ? scheduledMs! : t,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Records that the reviewer ran and what it concluded, so the verdict is
      // auditable rather than implied by the job's mere existence.
      safety: safety.verdict === "child-review" ? "child-targeted-review" : "screened",
    };
    pushHistory(job, job.status, ownerUserId, isFuture ? `scheduled for ${input.scheduledAt}` : undefined);
    await kv.zadd(K.jobs(oid), t, job.id);
    await kv.hset(K.job(oid, job.id), "_doc", s(job));
    await kv.zadd(K.due(oid), job.nextAttemptAt, job.id);
    await kv.zadd(K.orgs, t, oid);
    if (input.idempotencyKey) await kv.set(K.idem(oid, input.idempotencyKey), job.id, "EX", IDEM_TTL_SEC);
    await audit(oid, isFuture ? "job.scheduled" : "job.created", ownerUserId, { jobId: job.id, platform, detail: isFuture ? `scheduled for ${input.scheduledAt}` : undefined });
    return { job, deduplicated: false };
  }

  async function listJobs(oid: string, opts: { status?: PubJobStatus; platform?: PubPlatformId; limit?: number } = {}): Promise<PubJob[]> {
    const ids = await kv.zrange(K.jobs(oid), 0, -1, "REV");
    const out: PubJob[] = [];
    for (const id of ids) {
      const job = await load(oid, id);
      if (!job) continue;
      if (opts.status && job.status !== opts.status) continue;
      if (opts.platform && job.platform !== opts.platform) continue;
      out.push(job);
      if (out.length >= (opts.limit ?? 50)) break;
    }
    return out;
  }

  async function getJob(oid: string, id: string): Promise<PubJob> {
    const job = await load(oid, id);
    if (!job) throw AppError.notFound("Publish job not found");
    return job;
  }

  async function cancelJob(oid: string, id: string, actor: string): Promise<PubJob> {
    const job = await getJob(oid, id);
    if (!["queued", "scheduled", "failed"].includes(job.status)) {
      throw AppError.badRequest(`Cannot cancel a job in status ${job.status}`, { code: "BAD_STATE" });
    }
    job.status = "cancelled";
    await kv.zrem(K.due(oid), job.id);
    pushHistory(job, "cancelled", actor);
    await save(job);
    await audit(oid, "job.cancelled", actor, { jobId: job.id, platform: job.platform });
    return job;
  }

  async function retryJob(oid: string, id: string, actor: string): Promise<PubJob> {
    const job = await getJob(oid, id);
    if (job.status !== "failed") throw AppError.badRequest(`Only failed jobs can be retried (status: ${job.status})`, { code: "BAD_STATE" });
    job.status = "queued";
    job.attempts = 0;
    job.error = undefined;
    job.nextAttemptAt = now();
    await kv.zadd(K.due(oid), job.nextAttemptAt, job.id);
    pushHistory(job, "queued", actor, "manual retry");
    await save(job);
    await audit(oid, "job.retry", actor, { jobId: job.id, platform: job.platform, detail: "manual retry" });
    return job;
  }

  /** Finds the most recent job whose platform result carries the given post/video id. */
  async function findJobByPlatformRef(oid: string, platform: PubPlatformId, ref: string, limit = 100): Promise<PubJob | null> {
    const ids = await kv.zrange(K.jobs(oid), 0, -1, "REV");
    let scanned = 0;
    for (const id of ids) {
      if (++scanned > limit) break;
      const job = await load(oid, id);
      if (!job || job.platform !== platform) continue;
      if (job.result?.postId && job.result.postId === ref) return job;
    }
    return null;
  }

  /**
   * Applies an inbound platform webhook update (post accepted → processing /
   * available, or rejected after upload) to a published job. Non-terminal
   * updates only record `platformStatus` + history (the job stays published —
   * the platform accepted it). Terminal updates (failed/rejected) flip the job
   * to failed with the platform reason. Idempotent: a repeat of the same
   * non-terminal status is a no-op.
   */
  async function applyPlatformWebhook(oid: string, jobId: string, update: PubPlatformCallbackUpdate): Promise<PubJob> {
    const job = await getJob(oid, jobId);
    const ref = update.postId ?? update.videoId;
    if (ref && job.result?.postId && ref !== job.result.postId) {
      throw AppError.badRequest(`Webhook postId ${ref} does not match job ${jobId} (${job.result.postId})`, { code: "REF_MISMATCH" });
    }
    const terminal = update.status === "failed" || update.status === "rejected";
    if (!terminal && job.platformStatus === update.status) return job; // idempotent repeat

    job.platformStatus = update.status;
    if (update.status === "available" || update.status === "processed" || update.status === "uploaded") {
      job.platformAvailableAt = update.availableAt ?? new Date().toISOString();
    }
    const detail = terminal
      ? `${update.status}${update.reason ? `: ${update.reason}` : ""}`
      : `platform reports ${update.status}`;
    if (terminal) {
      job.status = "failed";
      job.error = { code: "PLATFORM_REJECTED", message: update.reason ?? `Platform rejected the post after upload (${update.status}).`, detail };
      await kv.zrem(K.due(oid), job.id); // safety: never re-queued
      pushHistory(job, "failed", "platform-webhook", detail);
    } else {
      pushHistory(job, job.status, "platform-webhook", detail);
    }
    await save(job);
    await audit(oid, "webhook.synced", "platform-webhook", { jobId: job.id, platform: job.platform, detail });
    await dispatch("media.publish.status", { jobId: job.id, platform: job.platform, postId: job.result?.postId, status: job.platformStatus, availableAt: job.platformAvailableAt });
    return job;
  }

  async function resolveMediaDefault(input: PubPublishInput, platform: PubPlatformId): Promise<MediaPayload | undefined> {
    const ref = input.videoUrl ?? input.mediaUrl;
    if (!ref) return undefined;
    const capBytes = Math.min(adapterFor(platform).constraints.maxMediaMB, GLOBAL_MEDIA_CAP_MB) * 1024 * 1024;

    if (ref.startsWith("/")) {
      // Internal render artifact, e.g. /api/v1/media-factory/render/<file>
      const name = path.basename(ref);
      const full = path.join(MEDIA_CACHE_DIR, name);
      if (!full.startsWith(MEDIA_CACHE_DIR) || name !== ref.split("/").pop()) {
        throw new PlatformPublishError("MEDIA_PATH", "Internal media path must point to a file served by /media-factory/render/", true);
      }
      const buffer = await fs.readFile(full).catch(() => {
        throw new PlatformPublishError("MEDIA_NOT_FOUND", `Rendered media not found on server: ${name}`, true);
      });
      if (buffer.byteLength > capBytes) throw new PlatformPublishError("MEDIA_TOO_LARGE", `Media exceeds ${Math.round(capBytes / 1024 / 1024)}MB cap for ${platform}.`, true);
      return { buffer, contentType: input.mediaType ?? "video/mp4" };
    }

    if (/^https?:\/\//i.test(ref)) {
      const f: FetchImpl = deps.fetchImpl ?? (globalThis as any).fetch?.bind(globalThis);
      if (!f) throw new PlatformPublishError("NO_FETCH", "No fetch implementation available.", true);
      let res: any;
      try {
        res = await f(ref, { signal: (AbortSignal as any).timeout?.(120_000) });
      } catch (e: any) {
        throw new PlatformPublishError("MEDIA_FETCH", `Downloading media failed: ${e?.message ?? e}`, false);
      }
      if (!res.ok) throw new PlatformPublishError("MEDIA_FETCH", `Downloading media failed: HTTP ${res.status}`, false);
      const len = Number(res.headers?.get?.("content-length") ?? 0);
      if (len && len > capBytes) throw new PlatformPublishError("MEDIA_TOO_LARGE", `Media exceeds ${Math.round(capBytes / 1024 / 1024)}MB cap for ${platform}.`, true);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > capBytes) throw new PlatformPublishError("MEDIA_TOO_LARGE", `Media exceeds ${Math.round(capBytes / 1024 / 1024)}MB cap for ${platform}.`, true);
      return {
        buffer: buf,
        contentType: input.mediaType ?? (String(res.headers?.get?.("content-type") ?? "").split(";")[0] || "video/mp4"),
        sourceUrl: ref,
      };
    }
    throw new PlatformPublishError("MEDIA_URL", "videoUrl/mediaUrl must be http(s) or an internal /media-factory/render path", true);
  }

  async function executeJob(job: PubJob): Promise<void> {
    const oid = job.orgId;
    job.status = "uploading";
    job.attempts += 1;
    pushHistory(job, "uploading", job.ownerUserId, `attempt ${job.attempts}/${job.maxAttempts}`);
    await save(job);
    await audit(oid, "job.attempt", job.ownerUserId, { jobId: job.id, platform: job.platform, detail: `attempt ${job.attempts}/${job.maxAttempts}` });

    try {
      const adapter = adapterFor(job.platform);
      const accessToken = job.tokenScope === "org"
        ? await ensureFreshOrgToken(job.orgId, job.platform, kv as any, deps.fetchImpl)
        : await ensureFreshToken(job.ownerUserId, job.platform, kv as any, deps.fetchImpl);
      const media = await (deps.resolveMedia ?? resolveMediaDefault)(job.input, job.platform);
      const outcome = await adapter.publish({ accessToken, input: job.input, media, fetchImpl: deps.fetchImpl, pollBudgetMs: deps.pollBudgetMs });
      job.status = "published";
      job.result = outcome;
      job.error = undefined;
      job.publishedAt = new Date().toISOString();
      await kv.zrem(K.due(oid), job.id);
      pushHistory(job, "published", job.ownerUserId, outcome.url ?? outcome.postId ?? "published");
      await save(job);
      await audit(oid, "job.published", job.ownerUserId, { jobId: job.id, platform: job.platform, detail: outcome.url ?? outcome.postId ?? "published" });
      await dispatch("media.publish.completed", { jobId: job.id, platform: job.platform, postId: outcome.postId });
    } catch (e) {
      const err = e instanceof PlatformPublishError
        ? e
        : new PlatformPublishError("UNEXPECTED", e instanceof Error ? e.message : String(e), false);
      const giveUp = err.permanent || job.attempts >= job.maxAttempts;
      job.error = { code: err.code, message: err.message, detail: err.detail };
      if (giveUp) {
        job.status = "failed";
        await kv.zrem(K.due(oid), job.id);
        pushHistory(job, "failed", job.ownerUserId, `${err.code}: ${err.message}`);
        await save(job);
        await audit(oid, "job.failed", job.ownerUserId, { jobId: job.id, platform: job.platform, detail: `${err.code}: ${err.message}${job.attempts >= job.maxAttempts && !err.permanent ? ` (max attempts ${job.maxAttempts} reached)` : ""}` });
        await dispatch("media.publish.failed", { jobId: job.id, platform: job.platform, code: err.code, message: err.message });
      } else {
        const retryAfterMs = err.retryAfterSec ? err.retryAfterSec * 1000 : undefined;
        job.status = "queued";
        job.nextAttemptAt = now() + (retryAfterMs ?? backoffMs(job.attempts));
        await kv.zadd(K.due(oid), job.nextAttemptAt, job.id);
        pushHistory(job, "queued", job.ownerUserId, `${err.code}: ${err.message}; retry at ${new Date(job.nextAttemptAt).toISOString()}`);
        await save(job);
        await audit(oid, "job.retry", job.ownerUserId, { jobId: job.id, platform: job.platform, detail: `${err.code}: ${err.message}; retry at ${new Date(job.nextAttemptAt).toISOString()}` });
      }
    }
  }

  /**
   * Process all due jobs across every org with publish activity.
   * Called by the worker interval and directly by tests.
   */
  async function processDueJobs(): Promise<{ processed: number }> {
    const t = now();
    const orgs = await kv.zrange(K.orgs, 0, -1);
    let processed = 0;
    for (const oid of orgs) {
      let dueIds: string[] = [];
      try {
        dueIds = await kv.zrangebyscore(K.due(oid), 0, t, "LIMIT", 0, JOB_BATCH_PER_ORG);
      } catch { continue; }
      for (const id of dueIds) {
        const job = await load(oid, id);
        if (!job || (job.status !== "queued" && job.status !== "scheduled") || job.nextAttemptAt > t) {
          await kv.zrem(K.due(oid), id); // stale pointer cleanup
          continue;
        }
        processed += 1;
        await executeJob(job);
      }
    }
    return { processed };
  }

  async function listAudit(oid: string, limit = 100): Promise<PubAuditEvent[]> {
    const raw = await kv.lrange(K.audit(oid), 0, Math.min(limit, AUDIT_CAP) - 1);
    return raw.map((r) => j<PubAuditEvent>(r));
  }

  return { createJob, listJobs, getJob, cancelJob, retryJob, processDueJobs, listAudit, audit, findJobByPlatformRef, applyPlatformWebhook, oauthStateKey: K.oauthState };
}

export type PublishEngine = ReturnType<typeof createPublishEngine>;

/** Default engine bound to the real command client. */
export const publishEngine = createPublishEngine({ kv: redis as unknown as PublishKv });

/* ── Worker ───────────────────────────────────────────────────────── */

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerInFlight = false;

/** Start the publish worker (idempotent). Interval: PUBLISH_WORKER_INTERVAL_MS (default 5s). */
export function startPublishWorker(intervalMs = Number(process.env.PUBLISH_WORKER_INTERVAL_MS ?? 5_000)): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerInFlight) return;
    workerInFlight = true;
    publishEngine.processDueJobs()
      .catch((e) => logger.warn("publish worker tick failed", { err: e instanceof Error ? e.message : String(e) }))
      .finally(() => { workerInFlight = false; });
  }, intervalMs);
  workerTimer.unref?.();
  logger.info("media publishing worker started", { intervalMs });
}

export function stopPublishWorker(): void {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}
