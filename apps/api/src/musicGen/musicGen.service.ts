/**
 * WINDELS AI OS — Music Generation service.
 *
 * A Redis-backed job queue around the pure-Node music synthesis engine
 * (musicEngine.ts). Jobs are tenant-scoped; a worker tick renders queued jobs
 * into REAL WAV files on disk. Unlike the old mediaGen "music" placeholder,
 * completion yields an actual playable audio file, not a fake asset URL.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { renderMusic, MUSIC_CAPABILITIES } from "./musicEngine.js";
import type {
  MusicTrackRecord,
  MusicGenre,
  MusicKey,
  GenerateMusicInput,
  MusicCapability,
} from "@windels/shared/musicGen";

const K = {
  jobs: (oid: string) => `music:tenant:${oid}:jobs`,
  job: (oid: string, id: string) => `music:job:${oid}:${id}`,
  pending: (oid: string) => `music:tenant:${oid}:pending`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
const now = () => new Date().toISOString();

export const MusicService = {
  capabilities(): MusicCapability[] {
    return MUSIC_CAPABILITIES.map((c) => ({
      genre: c.genre as MusicGenre,
      label: c.label,
      blurb: c.blurb,
      defaultTempo: c.defaultTempo,
    }));
  },

  async list(oid: string): Promise<MusicTrackRecord[]> {
    const ids = (await redis.smembers(K.jobs(oid))) ?? [];
    const out: MusicTrackRecord[] = [];
    for (const id of ids) {
      const rec = j<MusicTrackRecord>(await redis.get(K.job(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(oid: string, id: string): Promise<MusicTrackRecord | null> {
    return j<MusicTrackRecord>(await redis.get(K.job(oid, id)));
  },

  async generate(oid: string, userId: string, input: GenerateMusicInput): Promise<MusicTrackRecord> {
    const id = randomUUID();
    const nowIso = now();
    const genre = input.genre ?? "pop";
    const key = input.key ?? "C";
    const tempo = input.tempo ?? 100;
    const durationSec = input.durationSec ?? 12;
    const rec: MusicTrackRecord = {
      id,
      organizationId: oid,
      createdById: userId,
      title: input.title ?? `${genre} track in ${key}`,
      genre,
      key,
      tempo,
      durationSec,
      status: "queued",
      sampleRate: 44100,
      channels: 2,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await redis.set(K.job(oid, id), s2(rec));
    await redis.sadd(K.jobs(oid), id);
    await redis.lpush(K.pending(oid), id);
    return rec;
  },

  /**
   * Render one queued job synchronously (used by the worker tick and directly
   * by tests). Returns the completed record.
   */
  async renderOne(oid: string, id: string): Promise<MusicTrackRecord> {
    const rec = await this.get(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Music track not found", 404);
    if (rec.status === "completed") return rec;
    rec.status = "rendering";
    rec.updatedAt = now();
    await redis.set(K.job(oid, id), s2(rec));
    try {
      const rendered = await renderMusic({
        genre: rec.genre,
        key: rec.key,
        tempo: rec.tempo,
        durationSec: rec.durationSec,
        seed: id,
      });
      rec.status = "completed";
      rec.path = rendered.path;
      rec.url = rendered.url;
      rec.bytes = rendered.bytes;
      rec.sampleRate = rendered.sampleRate;
      rec.channels = rendered.channels;
      rec.updatedAt = now();
      await redis.set(K.job(oid, id), s2(rec));
      return rec;
    } catch (e) {
      rec.status = "failed";
      rec.error = e instanceof Error ? e.message : String(e);
      rec.updatedAt = now();
      await redis.set(K.job(oid, id), s2(rec));
      logger.warn("music render failed", { id, err: rec.error });
      throw e;
    }
  },

  /** Worker tick: render up to `limit` queued jobs. */
  async runWorkerTick(oid: string, limit = 5): Promise<{ processed: number }> {
    let processed = 0;
    while (processed < limit) {
      const next = await redis.rpop(K.pending(oid));
      if (!next) break;
      try {
        await this.renderOne(oid, next);
      } catch { /* recorded as failed on the record */ }
      processed++;
    }
    return { processed };
  },
};
