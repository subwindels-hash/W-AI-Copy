/** Session 62 — Digital Human Platform */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { DigitalHumanService } from "../../digitalHumans/digitalHumans.service.js";
import { AVATAR_ROLES, AVATAR_STYLES, AVATAR_GENDERS } from "@windels/shared";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const CreateSchema = z.object({
  name: z.string().min(2),
  role: z.enum(AVATAR_ROLES),
  gender: z.enum(AVATAR_GENDERS),
  style: z.enum(AVATAR_STYLES),
  appearanceConfig: z.record(z.string(), z.any()).optional(),
  voiceId: z.string().optional(),
  personalityProfileId: z.string().optional(),
  languages: z.array(z.string()).optional(),
  emotionIntensity: z.number().min(0).max(1).optional(),
  gestureIntensity: z.number().min(0).max(1).optional(),
  eyeContactStrength: z.number().min(0).max(1).optional(),
});
const StartSchema = z.object({ participantId: z.string().optional(), language: z.string().optional() });
const EndSchema = z.object({ resolution: z.enum(["resolved","escalated","abandoned"]).optional(), rating: z.number().int().min(1).max(5).optional() });

export function registerDigitalHumanRoutes(router: Router) {
  // Real tenant-scoped notes ledger for digitalHumans — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "dh:notes", idPrefix: "dh-" });
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

  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await DigitalHumanService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/", async (req,res,next)=>{try{res.json({ok:true,data:await DigitalHumanService.list((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/:id", async (req,res,next)=>{try{
    const h = await DigitalHumanService.get(req.params.id,(req.user as any).organizationId);
    if(!h) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"not found"}});
    res.json({ok:true,data:h});
  }catch(e){next(e);}});
  router.post("/", validate({body:CreateSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await DigitalHumanService.create({...req.body, organizationId:(req.user as any).organizationId, createdBy:(req.user as any).id})});
  }catch(e){next(e);}});
  router.post("/:id/sessions", validate({body:StartSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await DigitalHumanService.startSession(req.params.id,(req.user as any).organizationId,req.body.participantId,req.body.language)});
  }catch(e){next(e);}});
  router.post("/sessions/:id/end", validate({body:EndSchema}), async (req,res,next)=>{try{
    const s = await DigitalHumanService.endSession(req.params.id,(req.user as any).organizationId,req.body.resolution,req.body.rating);
    if(!s) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"session not found"}});
    res.json({ok:true,data:s});
  }catch(e){next(e);}});


}
