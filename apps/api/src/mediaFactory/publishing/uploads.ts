/**
 * Session 77B completion pass — browser-side direct media upload.
 *
 * Users upload a video/image from the browser; the file is stored in the
 * shared media cache dir (the same dir the render pipeline + `/render/:file`
 * route serve from) so the publish endpoint can resolve it as an internal
 * artifact (`/api/v1/media-factory/render/<file>`). Org-scoped metadata lives
 * in Redis: `pub:<oid>:uploads` (zset, newest first) + `pub:<oid>:upload:<file>`
 * (hash doc). Deletion is blocked while an active job references the file.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { redisCmd as redis } from "../../db/redis.js";
import { AppError } from "../../utils/result.js";
import type { PubUploadRecord } from "@windels/shared";

export const MEDIA_CACHE_DIR = path.resolve(process.cwd(), "media-cache");

export interface UploadKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zrange(key: string, start: number, stop: number, ...args: unknown[]): Promise<string[]>;
  zrem(key: string, member: string): Promise<unknown>;
}

export interface UploadFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface UploadDeps {
  kv: UploadKv;
  dir: string;
  writeFile?: (p: string, data: Buffer) => Promise<void>;
  unlink?: (p: string) => Promise<void>;
  now?: () => number;
}

const K = {
  list: (oid: string) => `pub:${oid}:uploads`,
  meta: (oid: string, file: string) => `pub:${oid}:upload:${file}`,
};

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/x-msvideo": ".avi",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
const ALLOWED_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** Deterministic storage file name (uuid + extension), never derived from user input. */
export function storageName(mimetype: string, originalname: string): string | null {
  const byMime = EXT_BY_MIME[mimetype];
  if (byMime) return `${randomUUID().replace(/-/g, "")}${byMime}`;
  const ext = path.extname(originalname).toLowerCase();
  return ALLOWED_EXT.has(ext) ? `${randomUUID().replace(/-/g, "")}${ext}` : null;
}

export const defaultUploadDeps: UploadDeps = {
  kv: redis as unknown as UploadKv,
  dir: MEDIA_CACHE_DIR,
  writeFile: (p, data) => fs.writeFile(p, data),
  unlink: (p) => fs.unlink(p).catch(() => undefined),
};

/** Saves an uploaded buffer to disk + records org metadata. Throws BAD_MEDIA_TYPE for non video/image. */
export async function saveUpload(
  oid: string,
  userId: string,
  file: UploadFileInput,
  deps: UploadDeps = defaultUploadDeps,
): Promise<PubUploadRecord> {
  if (!file.buffer?.length) throw AppError.badRequest("Uploaded file is empty.", { code: "EMPTY_FILE" });
  const name = storageName(file.mimetype, file.originalname);
  if (!name) throw AppError.badRequest(`Unsupported media type "${file.mimetype || "unknown"}" — upload a video or image file.`, { code: "BAD_MEDIA_TYPE" });

  const full = path.join(deps.dir, name);
  await (deps.writeFile ?? ((p, d) => fs.writeFile(p, d)))(full, file.buffer);

  const rec: PubUploadRecord = {
    file: name,
    url: `/api/v1/media-factory/render/${name}`,
    fileName: path.basename(file.originalname),
    contentType: file.mimetype || "application/octet-stream",
    sizeBytes: file.size || file.buffer.byteLength,
    ownerUserId: userId,
    createdAt: new Date().toISOString(),
  };
  await deps.kv.set(K.meta(oid, name), JSON.stringify(rec));
  await deps.kv.zadd(K.list(oid), deps.now?.() ?? Date.now(), name);
  return rec;
}

export async function listUploads(oid: string, limit = 100, deps: UploadDeps = defaultUploadDeps): Promise<PubUploadRecord[]> {
  const names = await deps.kv.zrange(K.list(oid), 0, -1, "REV");
  const out: PubUploadRecord[] = [];
  for (const name of names.slice(0, limit)) {
    const raw = await deps.kv.get(K.meta(oid, name));
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as PubUploadRecord);
    } catch { /* skip corrupt metadata */ }
  }
  return out;
}

/** Deletes disk file + metadata. Does NOT check job references — the service layer does. */
export async function deleteUploadFile(oid: string, file: string, deps: UploadDeps = defaultUploadDeps): Promise<void> {
  const safe = path.basename(file);
  await (deps.unlink ?? ((p) => fs.unlink(p).catch(() => undefined)))(path.join(deps.dir, safe));
  await deps.kv.del(K.meta(oid, safe));
  await deps.kv.zrem(K.list(oid), safe);
}
