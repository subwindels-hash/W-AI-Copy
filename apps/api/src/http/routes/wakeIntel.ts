/**
 * Wake Intelligence routes (Session 36).
 * Mounted at /wake-intel behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { WakeIntelligenceService as Wi } from "../../wakeIntel/wakeIntelligence.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const activateBody = z.object({
  method: z.enum(["voice-wake-word","clap","finger-snap","hotkey","mouse-gesture","touch-gesture","mobile-gesture","smart-watch","smart-button","nfc","bluetooth-device","enterprise-hardware","api","scheduled","workflow","automation-rule"]),
  deviceId: z.string(), deviceKind: z.string(), userId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(), context: z.any().optional(),
  workforceId: z.string().optional(), phrase: z.string().optional(), offline: z.boolean().optional(),
});
const clapDetectBody = z.object({ intervals: z.array(z.number()), noiseDb: z.number().default(45), userId: z.string().optional(), deviceId: z.string(), acousticSignature: z.string().optional() });
const patternBody = z.object({ name: z.string(), pattern: z.array(z.number()), toleranceMs: z.number().int().default(120), action: z.string(), mfaRequired: z.boolean().default(false), enabled: z.boolean().default(true), description: z.string() });
const mfaBody = z.object({ name: z.string(), requiredFactors: z.array(z.string()), appliesTo: z.object({ methods: z.array(z.string()).optional(), emergency: z.boolean().optional(), workforceIds: z.array(z.string()).optional() }).default({}) });
const contactBody = z.object({ label: z.string(), type: z.enum(["internal-security","personal","emergency-services","designated-responder"]), target: z.string(), notifyOnEmergency: z.boolean().default(true) });
const bindingBody = z.object({ workforceId: z.string(), workforceName: z.string(), triggerPhrase: z.string(), triggerMethods: z.array(z.string()), requiresMfa: z.boolean().default(false), policyBindingId: z.string().optional(), enabled: z.boolean().default(true) });
const emCfgBody = z.object({
  enabled: z.boolean(), triggerPhrases: z.array(z.string()).default([]), triggerPatterns: z.array(z.string()).default([]),
  notifyContacts: z.array(z.string()).default([]), shareLocation: z.boolean().default(true),
  recordAudio: z.boolean().default(true), recordVideo: z.boolean().default(false),
  generateIncidentReport: z.boolean().default(true), triggerWorkflows: z.array(z.string()).default([]),
});
const deviceBody = z.object({ deviceId: z.string(), deviceKind: z.string(), user: z.string(), online: z.boolean().default(true), scope: z.enum(["single-device","all-devices"]).default("single-device") });
const emTrigger = z.object({ triggeredBy: z.string(), triggerMethod: z.string(), location: z.string().optional() });

export function registerWakeIntelRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.summary() }); } catch (e) { next(e); }
  });
  router.get("/config", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.getConfig() }); } catch (e) { next(e); }
  });

  // 300 activation
  router.post("/activate", validate({ body: activateBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.activate(req.body) }); } catch (e) { next(e); }
  });
  router.get("/activations", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listActivations() }); } catch (e) { next(e); }
  });

  // 301-302 clap
  router.get("/clap/patterns", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listPatterns() }); } catch (e) { next(e); }
  });
  router.post("/clap/patterns", validate({ body: patternBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.addPattern(req.body) }); } catch (e) { next(e); }
  });
  router.post("/clap/detect", validate({ body: clapDetectBody }), async (req, res, next) => {
    try { const d = await Wi.detectClap(req.body); res.json({ ok: true, data: d }); } catch (e) { next(e); }
  });
  router.get("/clap/detections", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listDetections() }); } catch (e) { next(e); }
  });

  // 303 MFA
  router.get("/mfa/policies", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listMfaPolicies() }); } catch (e) { next(e); }
  });
  router.post("/mfa/policies", validate({ body: mfaBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.addMfaPolicy(req.body) }); } catch (e) { next(e); }
  });

  // 304 cross-device
  router.get("/devices", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listDevices() }); } catch (e) { next(e); }
  });
  router.post("/devices", validate({ body: deviceBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.registerDevice(req.body) }); } catch (e) { next(e); }
  });

  // 305 context (stateless recommendation)
  router.post("/context/recommend", (req, res) => {
    res.json({ ok: true, data: Wi.contextualRecommendation(req.body ?? {}) });
  });

  // 306 emergency
  router.get("/emergency/config", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.getEmergencyConfig() }); } catch (e) { next(e); }
  });
  router.post("/emergency/config", validate({ body: emCfgBody }), async (req, res, next) => {
    try { await Wi.setEmergencyConfig(req.body); res.json({ ok: true, data: await Wi.getEmergencyConfig() }); } catch (e) { next(e); }
  });
  router.get("/emergency/contacts", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listEmergencyContacts() }); } catch (e) { next(e); }
  });
  router.post("/emergency/contacts", validate({ body: contactBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.addEmergencyContact(req.body) }); } catch (e) { next(e); }
  });
  router.post("/emergency/trigger", validate({ body: emTrigger }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.triggerEmergency(req.body) }); } catch (e) { next(e); }
  });
  router.get("/emergency/events", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listEmergencyEvents() }); } catch (e) { next(e); }
  });

  // 307 workforce bindings
  router.get("/workforce-bindings", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Wi.listBindings() }); } catch (e) { next(e); }
  });
  router.post("/workforce-bindings", validate({ body: bindingBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Wi.addBinding(req.body) }); } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for wakeIntel — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "wi:notes", idPrefix: "wi-" });
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
