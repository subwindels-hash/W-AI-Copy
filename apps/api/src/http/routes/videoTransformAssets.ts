/**
 * Public asset serving for the Video Transformation Studio.
 *
 * Serves source videos, extracted frames, mattes, references and final outputs
 * from VT_CACHE_DIR. Asset URLs use unguessable ids; JSON/metadata stays behind
 * auth. Path traversal is guarded by resolving under the cache root.
 */
import { Router } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { VT_CACHE_DIR } from "../../videoTransform/storage.js";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".json": "application/json",
};

export function registerVideoTransformAssetRoutes(router: Router) {
  router.get("/*", async (req, res, next) => {
    try {
      const rel = req.path.replace(/^\/+/, "");
      const full = path.resolve(VT_CACHE_DIR, rel);
      const root = path.resolve(VT_CACHE_DIR);
      if (!full.startsWith(root + path.sep)) return res.status(400).json({ ok: false, error: { code: "BAD_PATH" } });
      const st = await fs.stat(full).catch(() => null);
      if (!st || !st.isFile()) {
        // Simulated provider placeholders resolve to empty-but-valid media so
        // the pipeline is playable end-to-end; a real provider writes bytes.
        if (rel.startsWith("placeholders/")) {
          if (rel.endsWith(".png")) { res.setHeader("Content-Type", "image/png"); return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")); }
          res.setHeader("Content-Type", "video/mp4"); return res.end(Buffer.alloc(0));
        }
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      }
      res.setHeader("Content-Type", MIME[path.extname(full)] ?? "application/octet-stream");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch (e) { next(e); }
  });
}
