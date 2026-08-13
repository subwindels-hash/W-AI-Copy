/**
 * WINDELS AI Video Transformation Studio — storage integration (§33).
 *
 * Uses the existing WINDELS storage conventions: source videos, extracted
 * frames, alpha mattes, reference images, intermediates and final outputs live
 * under a per-tenant cache directory (same pattern as the video engine / music
 * video cache) and are served through a /api/v1/video-transform/assets prefix.
 * In production this directory is mounted on the existing object store /
 * persistent volume.
 *
 * Lifecycle: intermediate files expire via `purgeIntermediates` (§33) unless
 * the user chooses to keep them.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { logger } from "../config/logger.js";

export const VT_CACHE_DIR = process.env.VT_CACHE_DIR ?? `${process.cwd()}/video-transform-cache`;
export const VT_PUBLIC_PREFIX = "/api/v1/video-transform/assets";
export const MAX_UPLOAD_BYTES = Number(process.env.VT_MAX_UPLOAD_MB ?? 200) * 1024 * 1024;

export function jobDir(jobId: string): string {
  return path.join(VT_CACHE_DIR, "jobs", jobId);
}
export function workflowDir(workflowId: string): string {
  return path.join(VT_CACHE_DIR, "workflows", workflowId);
}
export function assetDir(organizationId: string): string {
  return path.join(VT_CACHE_DIR, "org", organizationId, "assets");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function publicAssetUrl(kind: "jobs" | "workflows" | "org", id: string, fileName: string): string {
  if (kind === "org") return `${VT_PUBLIC_PREFIX}/org/${id}/${fileName}`;
  return `${VT_PUBLIC_PREFIX}/${kind}/${id}/${fileName}`;
}

export function localAssetPath(publicUrl: string): string {
  if (publicUrl.startsWith(VT_PUBLIC_PREFIX)) {
    return path.join(VT_CACHE_DIR, publicUrl.slice(VT_PUBLIC_PREFIX.length + 1));
  }
  return publicUrl;
}

export async function writeAsset(
  organizationId: string,
  fileName: string,
  data: Buffer,
): Promise<{ path: string; url: string; bytes: number }> {
  const dir = assetDir(organizationId);
  await ensureDir(dir);
  const full = path.join(dir, fileName);
  await fs.writeFile(full, data);
  return { path: full, url: publicAssetUrl("org", organizationId, fileName), bytes: data.length };
}

export async function recordStorageUsage(organizationId: string, refId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  try {
    const { MediaMeteringService } = await import("../mediaFactory/metering.service.js");
    await MediaMeteringService.record({
      organizationId, operation: "video-transform.storage", refId,
      kind: "output_bytes", quantity: bytes,
    });
  } catch (e) {
    logger.warn("[vt-storage] metering failed", { err: (e as Error).message });
  }
}

export async function purgeJobIntermediates(jobId: string): Promise<void> {
  try {
    const dir = path.join(jobDir(jobId), "intermediate");
    await fs.rm(dir, { recursive: true, force: true });
  } catch (e) {
    logger.warn("[vt-storage] purge failed", { jobId, err: (e as Error).message });
  }
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 24);
}

export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"];
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];

export function extForMime(mime: string): string {
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "mp4";
}
