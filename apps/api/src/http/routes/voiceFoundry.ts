/**
 * Voice Foundry routes (Session 41).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { VoiceFoundryService } from "../../voiceFoundry/voiceFoundry.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const generate = z.object({
  name: z.string(), category: z.enum(["original-male","original-female","children","elder","executive","narrator","customer-service","sales","character","digital-human","ai-employee","brand","accessibility"]),
  design: z.any().optional(),
});
const design = z.object({ prompt: z.string() });
const evolve = z.object({ op: z.enum(["pronunciation","naturalness","emotion-expand","accent-refine","style-optimize","language-expand","quality-enhance"]) });
const deploy = z.object({ target: z.enum(["ai-employee","ai-assistant","digital-human","support-agent","sales-agent","executive-agent","voice-call","podcast","audiobook","marketing-video","presentation","training","navigation","accessibility","live-meeting","smart-device","robotics"]) });

export function registerVoiceFoundryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.dashboard() }); } catch(e){next(e);} });
  router.get("/voices", async (req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listVoices(req.query.category as any) }); } catch(e){next(e);} });
  router.post("/voices/generate", validate({body:generate}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.generate({ ...req.body, owner: req.user?.id }) }); } catch(e){next(e);}
  });
  router.post("/design", validate({body:design}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.designFromPrompt(req.body.prompt) }); } catch(e){next(e);}
  });
  router.post("/voices/:id/evolve", validate({body:evolve}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.evolve(req.params.id, req.body.op, req.user?.id) }); } catch(e){next(e);}
  });
  router.get("/voices/:id/evolutions", async (req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listEvolutions(req.params.id) }); } catch(e){next(e);} });
  router.post("/voices/:id/deploy", validate({body:deploy}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.deploy(req.params.id, req.body.target) }); } catch(e){next(e);}
  });
  router.get("/deployments", async (_req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listDeployments() }); } catch(e){next(e);} });
  router.get("/packs", async (_req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listPacks() }); } catch(e){next(e);} });


  // Real tenant-scoped notes ledger for voiceFoundry — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "vf:notes", idPrefix: "vf-" });
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
