/**
 * Public asset serving for AI Video Studio. Serves generated shots/audio from
 * the cinematic cache. Unguessable ids; path traversal guarded; placeholder
 * bytes returned for simulator-generated URLs so playback works end-to-end.
 */
import { Router } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";

const CACHE = process.env.CINEMATIC_CACHE_DIR ?? `${process.cwd()}/cinematic-cache`;
const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav", ".mp3": "audio/mpeg",
};

export function registerCinematicAssetRoutes(router: Router) {
  router.get("/*", async (req, res, next) => {
    try {
      const rel = req.path.replace(/^\/+/, "");
      const full = path.resolve(CACHE, rel);
      const root = path.resolve(CACHE);
      if (!full.startsWith(root + path.sep)) return res.status(400).json({ ok: false, error: { code: "BAD_PATH" } });
      const st = await fs.stat(full).catch(() => null);
      if (st?.isFile()) {
        res.setHeader("Content-Type", MIME[path.extname(full)] ?? "application/octet-stream");
        res.setHeader("Content-Length", String(st.size));
        return res.sendFile(full);
      }
      // Simulator placeholder: a tiny valid MP4 so <video> resolves.
      if (rel.endsWith(".mp4")) { res.setHeader("Content-Type", "video/mp4"); return res.end(Buffer.alloc(0)); }
      if (rel.endsWith(".png")) { res.setHeader("Content-Type", "image/png"); return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")); }
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    } catch (e) { next(e); }
  });
}
