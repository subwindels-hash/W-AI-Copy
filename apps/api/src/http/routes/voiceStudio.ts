/**
 * Enterprise Voice Studio routes (Session 40).
 * Consent gate enforced BEFORE any cloning pipeline.
 */
import { Router } from "express";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { validate } from "../middleware/validate.js";
import { VoiceStudioService } from "../../voiceStudio/voiceStudio.service.js";
import { VoiceService } from "../../voiceStudio/voice.service.js";

const AUDIO_DIR = path.resolve(process.cwd(), "audio-cache");

const cloneBody = z.object({
  name: z.string().min(1).max(80),
  gender: z.enum(["masculine","feminine","neutral","child-boy","child-girl","teen"]),
  age: z.enum(["child","teen","young-adult","adult","senior"]),
  language: z.string().default("en"),
  method: z.enum(["upload-samples","record-in-app","import-audio","pro-training","fast-clone","hf-clone"]).default("fast-clone"),
  consentGranted: z.boolean(),
  baseVoiceId: z.string().optional(),
});
const emotionEnum = z.enum(["happy","sad","calm","friendly","professional","serious","excited","motivational","inspirational","empathetic","urgent","confident","storytelling"]);
const settingsBody = z.object({
  pitch: z.number().min(-10).max(10).optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  volume: z.number().min(0).max(1).optional(),
  energy: z.number().min(0).max(1).optional(),
  warmth: z.number().min(0).max(1).optional(),
  emotion: emotionEnum.optional(),
  formality: z.number().min(0).max(1).optional(),
  accentStrength: z.number().min(0).max(1).optional(),
  pauseMs: z.number().min(0).max(2000).optional(),
  breathing: z.number().min(0).max(1).optional(),
});
const presetBody = z.object({
  name: z.string(), voiceId: z.string(),
  settings: settingsBody, description: z.string().optional(),
});
const synthBody = z.object({
  voiceId: z.string(), text: z.string().min(1).max(5000),
  settings: settingsBody.optional(),
  emotion: emotionEnum.optional(),
  language: z.string().optional(),
  clientSide: z.boolean().optional(),
});

export function registerVoiceStudioRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.summary() }); } catch (e) { next(e); }
  });
  router.get("/voices/builtin", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.listBuiltIn() }); } catch (e) { next(e); }
  });
  router.get("/voices/custom", async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.listCustom(req.user?.id) }); } catch (e) { next(e); }
  });
  router.post("/voices/clone", validate({ body: cloneBody }), async (req, res, next) => {
    try {
      const cv = await VoiceStudioService.cloneVoice({
        ownerId: req.user!.id,
        name: req.body.name, gender: req.body.gender, age: req.body.age, language: req.body.language,
        method: req.body.method, consentGranted: req.body.consentGranted,
        consentRecordedBy: req.user!.id,
        baseVoiceId: req.body.baseVoiceId,
      });
      res.json({ ok: true, data: cv });
    } catch (e: any) {
      if (e?.code === "CONSENT_REQUIRED") {
        return res.status(400).json({ ok: false, error: { code: "CONSENT_REQUIRED", message: e.message } });
      }
      next(e);
    }
  });
  router.patch("/voices/:id/settings", validate({ body: settingsBody }), async (req, res, next) => {
    try {
      const cv = await VoiceStudioService.updateSettings(req.params.id, req.body, req.user!.id);
      if (!cv) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "voice not found" } });
      res.json({ ok: true, data: cv });
    } catch (e) { next(e); }
  });
  router.get("/presets", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.listPresets() }); } catch (e) { next(e); }
  });
  router.post("/presets", validate({ body: presetBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.createPreset(req.body) }); } catch (e) { next(e); }
  });
  router.post("/synthesize", validate({ body: synthBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.synthesize(req.body) }); } catch (e) { next(e); }
  });
  router.get("/jobs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceStudioService.listJobs() }); } catch (e) { next(e); }
  });
  router.get("/voices/registry", (_req, res) => {
    res.json({ ok: true, data: { voices: VoiceService.listVoices(), providers: VoiceService.configuredProviders() } });
  });
  router.get("/audio/:file", (req, res) => {
    const name = path.basename(req.params.file);
    const full = path.join(AUDIO_DIR, name);
    if (!full.startsWith(AUDIO_DIR)) return res.status(400).end();
    if (!fs.existsSync(full)) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    const ext = path.extname(name).toLowerCase();
    const mime = ext === ".mp3" ? "audio/mpeg" : "audio/wav";
    res.setHeader("Content-Type", mime);
    fs.createReadStream(full).pipe(res);
  });
}
