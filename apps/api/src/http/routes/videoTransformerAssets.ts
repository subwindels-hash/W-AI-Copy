/**
 * Public asset serving for the AI VIDEO TRANSFORMER. Serves uploads/outputs
 * from the cache dir. Path traversal is guarded by resolving under the root.
 */
import { Router } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { VTX_CACHE } from "../../videoTransformer/storage.js";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".mp3": "audio/mpeg",
};

export function registerVideoTransformerAssetRoutes(router: Router) {
  router.get("/*", async (req, res, next) => {
    try {
      const rel = req.path.replace(/^\/+/, "");
      const full = path.resolve(VTX_CACHE, rel);
      const root = path.resolve(VTX_CACHE);
      if (!full.startsWith(root + path.sep)) return res.status(400).json({ ok: false, error: { code: "BAD_PATH" } });
      const st = await fs.stat(full).catch(() => null);
      if (!st?.isFile()) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.setHeader("Content-Type", MIME[path.extname(full)] ?? "application/octet-stream");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch (e) { next(e); }
  });
}
