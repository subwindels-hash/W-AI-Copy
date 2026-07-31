/**
 * Session 44 — Voice Ownership, Security & Governance routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { VoiceOwnershipService } from "../../voiceOwnership/voiceOwnership.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const onboard = z.object({
  voiceId: z.string(), ownerId: z.string(),
  source: z.enum(["voice-studio-clone", "voice-foundry-autonomous", "enterprise-assigned"]),
  identityLevel: z.enum(["unverified", "email-verified", "gov-id-verified", "enterprise-verified"]).optional(),
  consentGranted: z.boolean().optional(),
});
const consent = z.object({ granted: z.boolean() });
const ident = z.object({ level: z.enum(["unverified", "email-verified", "gov-id-verified", "enterprise-verified"]) });

export function registerVoiceOwnershipRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/owners", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.listOwners() }); } catch (e) { next(e); }
  });
  router.post("/onboard", validate({ body: onboard }), async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.onboardVoice({ ...req.body, ownerId: req.user?.id ?? req.body.ownerId }) }); } catch (e) { next(e); }
  });
  router.post("/voices/:id/consent", validate({ body: consent }), async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.recordConsent(req.params.id, req.body.granted, req.user!.id) }); } catch (e) { next(e); }
  });
  router.post("/voices/:id/identity", validate({ body: ident }), async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.upgradeIdentity(req.params.id, req.body.level, req.user!.id) }); } catch (e) { next(e); }
  });
  router.get("/audit", async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.listAudit(req.query.voiceId as any) }); } catch (e) { next(e); }
  });
  router.get("/policies", async (_req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.listPolicies() }); } catch (e) { next(e); }
  });
  router.post("/voices/:id/check-consent", async (req, res, next) => {
    try { res.json({ ok: true, data: await VoiceOwnershipService.requireConsent(req.params.id) }); } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for voiceOwnership — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "vo:notes", idPrefix: "vo-" });
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
