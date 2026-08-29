/**
 * WINDELS AI VIDEO TRANSFORMER — storage and asset handling (§45).
 *
 * Uploads are written under a per-organization cache directory (same
 * convention as the other media modules) and served from a public asset
 * prefix. Intermediate files are purged after successful runs.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const VTX_CACHE = process.env.VTX_CACHE_DIR ?? path.join(process.cwd(), "video-transformer-cache");
export const VTX_PUBLIC = "/api/v1/video-transform/assets";

const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = (Number(process.env.VTX_MAX_UPLOAD_MB ?? 500)) * 1024 * 1024;

export function ensureDir(p: string) { return fs.mkdir(p, { recursive: true }); }

export async function saveUpload(organizationId: string, file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<{ assetId: string; path: string; url: string; bytes: number; mime: string }> {
  if (!ALLOWED_VIDEO.has(file.mimetype) && !ALLOWED_IMAGE.has(file.mimetype)) {
    throw Object.assign(new Error(`Unsupported type ${file.mimetype}`), { status: 415, code: "UNSUPPORTED_TYPE" });
  }
  if (file.buffer.length > MAX_BYTES) throw Object.assign(new Error("File too large"), { status: 413 });
  const dir = path.join(VTX_CACHE, "org", organizationId, "sources");
  await ensureDir(dir);
  const hash = createHash("sha256").update(file.buffer).digest("hex").slice(0, 24);
  const ext = file.mimetype === "video/quicktime" ? "mov" : file.mimetype.split("/")[1]?.replace("jpeg", "jpg") ?? "mp4";
  const id = `src_${hash}`;
  const full = path.join(dir, `${id}.${ext}`);
  await fs.writeFile(full, file.buffer);
  return { assetId: id, path: full, url: `${VTX_PUBLIC}/org/${organizationId}/sources/${id}.${ext}`, bytes: file.buffer.length, mime: file.mimetype };
}

export async function writeOutput(organizationId: string, jobId: string, data: Buffer, ext = "mp4") {
  const dir = path.join(VTX_CACHE, "org", organizationId, "outputs");
  await ensureDir(dir);
  const name = `${jobId}.${ext}`;
  const full = path.join(dir, name);
  await fs.writeFile(full, data);
  return { path: full, url: `${VTX_PUBLIC}/org/${organizationId}/outputs/${name}` };
}

export function assetUrl(organizationId: string, kind: "sources" | "outputs" | "refs", name: string) {
  return `${VTX_PUBLIC}/org/${organizationId}/${kind}/${name}`;
}

export async function purgeIntermediates(jobDir: string) {
  await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
}

export function localPath(publicUrl: string): string {
  if (publicUrl.startsWith(VTX_PUBLIC)) return path.join(VTX_CACHE, publicUrl.slice(VTX_PUBLIC.length + 1));
  return publicUrl;
}

export const __maxBytes = MAX_BYTES;
