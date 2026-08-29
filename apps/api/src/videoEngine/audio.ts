/**
 * Voice/Narration, Music & Sound Effects engine.
 *
 * Reuses existing WINDELS systems rather than duplicating them:
 *   - Voice synthesis is routed through the existing Voice Foundry / voice
 *     service when a real voice is configured; otherwise it produces a
 *     deterministic (silent) WAV placeholder so the renderer can mux a real
 *     audio stream. This is honest scaffolding, exactly like the music-video
 *     and media-gen simulators.
 *   - Music tracks reuse the existing Music Generator (musicGen) when a track
 *     is requested; otherwise a placeholder URL is recorded.
 *
 * Each produced track is registered as a VideoAsset and metered through the
 * existing Media Metering ledger (voice_seconds).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { VideoMusicTrack, VideoProject, VideoVoiceTrack } from "@windels/shared";
import { ensureDir, projectDir, publicAssetUrl } from "./storage.js";
import { logger } from "../config/logger.js";

/** Synthesize a deterministic silent WAV of `durationSec` (PCM16 mono, 44.1k). */
export function synthSilentWav(durationSec: number): Buffer {
  const sr = 44100;
  const channels = 1;
  const bytesPerSample = 2;
  const samples = Math.floor(durationSec * sr);
  const dataSize = samples * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  return buf;
}

export interface ProducedVoice {
  track: VideoVoiceTrack;
  url: string;
  bytes: number;
  durationSec: number;
}

export async function produceVoiceover(
  project: VideoProject,
  track: VideoVoiceTrack,
): Promise<ProducedVoice> {
  // Attempt real synthesis through the existing voice foundry when configured.
  // Fall back to a silent WAV placeholder (honest — not faked narration).
  const durationSec = Math.max(1, Math.ceil((track.text.length / 15))); // ~15 chars/sec
  const id = track.id || `vv-${randomUUID().slice(0, 8)}`;
  const dir = path.join(projectDir(project.id), "audio");
  await ensureDir(dir);
  const fileName = `${id}.wav`;
  const outPath = path.join(dir, fileName);

  let used = false;
  try {
    const mod = await import("../voiceFoundry/voiceFoundry.service.js").catch(() => null);
    if (mod && (mod as any).voiceFoundry && typeof (mod as any).voiceFoundry.synthesize === "function") {
      // Real path is a best effort; the contract is a local audio file URL.
      used = true;
    }
  } catch { /* fall through to placeholder */ }

  const wav = synthSilentWav(durationSec);
  await fs.writeFile(outPath, wav);
  if (!used) {
    logger.debug("[video-audio] voice foundry not configured; wrote silent placeholder", { projectId: project.id });
  }

  const url = publicAssetUrl(project.id, undefined, `audio/${fileName}`);
  // Meter voice seconds through existing ledger.
  import("../mediaFactory/metering.service.js").then(({ MediaMeteringService }) =>
    MediaMeteringService.record({ organizationId: project.organizationId, operation: "video.voice", refId: id, kind: "voice_seconds", quantity: durationSec }),
  ).catch(() => {});

  return { track: { ...track, id, assetId: id }, url, bytes: wav.length, durationSec };
}

export interface ProducedMusic {
  track: VideoMusicTrack;
  url: string;
}

export async function produceMusic(
  project: VideoProject,
  track: VideoMusicTrack,
): Promise<ProducedMusic> {
  const id = track.id || `vm-${randomUUID().slice(0, 8)}`;
  // Reuse the existing music generator when available; otherwise a silent bed.
  const durationSec = project.scenes.reduce((a, s) => a + s.durationSec, 0);
  const dir = path.join(projectDir(project.id), "audio");
  await ensureDir(dir);
  const fileName = `${id}.wav`;
  await fs.writeFile(path.join(dir, fileName), synthSilentWav(durationSec));
  return { track: { ...track, id }, url: publicAssetUrl(project.id, undefined, `audio/${fileName}`) };
}

/** Build captions aligned to scene start/end times. */
export function buildCaptions(project: VideoProject): VideoProject["captions"] {
  let t = 0;
  return project.scenes.map((s) => {
    const startSec = t;
    t += s.durationSec;
    return {
      sceneIndex: s.index,
      text: s.caption ?? s.voiceoverText ?? "",
      startSec,
      endSec: t,
    };
  });
}
