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
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

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


  // Real tenant-scoped notes ledger for voiceStudio — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "vs:notes", idPrefix: "vs-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
