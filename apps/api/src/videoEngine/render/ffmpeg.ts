/**
 * FFmpeg detection for the video renderer (§9).
 *
 * Uses the existing production-grade pattern from musicVideo.service.ts:
 * probe for the `ffmpeg` binary; the renderer reports an honest
 * `requires_config` status when it is absent rather than pretending to
 * compose video. FFmpeg is invoked via `child_process` for server-side
 * composition of clips, images, voice, music, captions and transitions.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

let cached: boolean | null = null;

export async function hasFfmpeg(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await execFileP("ffmpeg", ["-version"], { timeout: 5000 });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** Test-only reset. */
export function _resetFfmpegCache(): void {
  cached = null;
}
