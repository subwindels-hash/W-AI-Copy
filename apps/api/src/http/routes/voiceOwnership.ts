/**
 * Session 44 — Voice Ownership, Security & Governance routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { VoiceOwnershipService } from "../../voiceOwnership/voiceOwnership.service.js";

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
}
