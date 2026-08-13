/**
 * Storage integration for the Video Engine (§15).
 *
 * Reuses the existing WINDELS storage conventions rather than introducing a
 * second storage system: generated clips, intermediate files, final renders,
 * thumbnails, captions and audio tracks live under a per-tenant cache
 * directory (same pattern as Music Video's MV_CACHE_DIR / media-cache) and are
 * surfaced through a `/api/v1/video/assets/...` public prefix. In production
 * this directory is mounted on the existing object store / persistent volume.
 *
 * Lifecycle: intermediate files can be purged via `purgeIntermediates()` once
 * a final render is stored, keeping storage costs bounded (§15).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../config/logger.js";

export const VIDEO_CACHE_DIR = process.env.VIDEO_CACHE_DIR ?? `${process.cwd()}/video-cache`;
export const VIDEO_PUBLIC_PREFIX = "/api/v1/video/assets";

export function projectDir(projectId: string): string {
  return path.join(VIDEO_CACHE_DIR, projectId);
}

export function versionDir(projectId: string, versionId: string): string {
  return path.join(projectDir(projectId), "versions", versionId);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function publicAssetUrl(projectId: string, versionId: string | undefined, fileName: string): string {
  return versionId
    ? `${VIDEO_PUBLIC_PREFIX}/${projectId}/versions/${versionId}/${fileName}`
    : `${VIDEO_PUBLIC_PREFIX}/${projectId}/${fileName}`;
}

/**
 * Record storage usage (bytes) through the existing Media Metering ledger so
 * billing tracks storage egress/object size without a parallel system.
 */
export async function recordStorageUsage(organizationId: string, refId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  try {
    const { MediaMeteringService } = await import("../mediaFactory/metering.service.js");
    await MediaMeteringService.record({
      organizationId,
      operation: "video.storage",
      refId,
      kind: "output_bytes",
      quantity: bytes,
    });
  } catch (e) {
    logger.warn("[video-storage] metering record failed", { err: e instanceof Error ? e.message : String(e) });
  }
}

/** Remove intermediate render artifacts for a project, keeping final renders. */
export async function purgeIntermediates(projectId: string): Promise<number> {
  const intermediateDir = path.join(projectDir(projectId), "intermediate");
  try {
    await fs.rm(intermediateDir, { recursive: true, force: true });
    return 0;
  } catch (e) {
    logger.warn("[video-storage] purge intermediates failed", { projectId, err: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}
