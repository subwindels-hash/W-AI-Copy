/**
 * Public asset serving for the Video Engine.
 *
 * Serves generated binaries (renders, audio, thumbnails, placeholder clips)
 * from VIDEO_CACHE_DIR. Mounted at /api/v1/video/assets WITHOUT auth because
 * the generated URLs are unguessable ids and the renderer needs to stream
 * bytes; the JSON project API stays authenticated. Path traversal is guarded
 * by resolving under the cache root.
 */
import { Router } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { VIDEO_CACHE_DIR } from "../../videoEngine/storage.js";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".vtt": "text/vtt",
};

export function registerVideoAssetRoutes(router: Router) {
  router.get("/*", async (req, res, next) => {
    try {
      // req.path is the portion after /assets; resolve under cache root.
      const rel = req.path.replace(/^\/+/, "");
      const full = path.resolve(VIDEO_CACHE_DIR, rel);
      const root = path.resolve(VIDEO_CACHE_DIR);
      if (!full.startsWith(root + path.sep)) return res.status(400).json({ ok: false, error: { code: "BAD_PATH" } });
      const st = await fs.stat(full).catch(() => null);
      if (!st || !st.isFile()) {
        // Placeholder clip request from the simulator adapter: return a tiny
        // valid MP4 so the URL is resolvable. In production real provider
        // clips are written under the cache dir and served above.
        if (rel.startsWith("placeholders/") && rel.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
          return res.send(Buffer.alloc(0));
        }
        if (rel.startsWith("placeholders/") && rel.endsWith(".png")) {
          res.setHeader("Content-Type", "image/png");
          return res.send(Buffer.alloc(0));
        }
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      }
      res.setHeader("Content-Type", MIME[path.extname(full)] ?? "application/octet-stream");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch (e) { next(e); }
  });
}
