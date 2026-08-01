/** Session 65 — Biomedical & Healthcare Intelligence
 *
 * Registry-only: this API records imaging studies and routes them for reading.
 * It does not interpret images. Findings are attached exclusively through
 * POST /studies/:id/findings by a real inference provider or a clinician.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAdmin } from "../middleware/auth.js";
import { BiomedicalService } from "../../biomedical/biomedical.service.js";

const StudySchema = z.object({
  modality: z.enum(["xray","ct","mri","ultrasound","pet","mammo","pathology"]),
  bodyPart: z.string().min(2),
});

const FindingsSchema = z.object({
  findings: z.array(z.object({
    finding: z.string().min(1).max(2000),
    confidence: z.number().min(0).max(1),
    severity: z.enum(["low","moderate","high"]),
    priority: z.boolean(),
  })).max(50),
  reviewedByRadiologist: z.boolean().optional(),
});

const PharmacyAlertSchema = z.object({
  kind: z.enum(["interaction","duplicate","allergy","dose","contraindication"]),
  severity: z.enum(["info","warn","critical"]),
  message: z.string().min(1).max(2000),
  at: z.string().optional(),
});

const TelemedStartSchema = z.object({
  providerId: z.string().min(1).max(128),
  modality: z.enum(["video","voice","async"]),
  language: z.string().min(2).max(16).optional(),
  aiScribeActive: z.boolean().optional(),
});

const OpsSchema = z.object({
  metrics: z.array(z.object({
    label: z.string().min(1).max(120),
    value: z.number(),
    unit: z.string().max(32),
    target: z.number(),
    status: z.enum(["ok","warn","critical"]),
  })).max(50),
});

const IdParam = z.object({ id: z.string().min(1).max(100) });

export function registerBiomedicalRoutes(router: Router) {
  const oid = (req: any) => (req.user as any).organizationId;

  router.get("/dashboard/rollup", async (req, res, next) => {
    try { res.json({ ok: true, data: await BiomedicalService.dashboard(oid(req)) }); }
    catch (e) { next(e); }
  });

  // ── imaging registry ──────────────────────────────────────────────
  router.get("/studies", async (req, res, next) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "50", 10) || 50, 200);
      res.json({ ok: true, data: await BiomedicalService.listStudies(oid(req), limit) });
    } catch (e) { next(e); }
  });

  router.post("/studies", validate({ body: StudySchema }), async (req, res, next) => {
    try {
      const study = await BiomedicalService.submitStudy({ ...req.body, organizationId: oid(req) });
      res.status(201).json({
        ok: true,
        data: study,
        meta: {
          note: "Study queued for reading. No automated interpretation is performed; " +
                "findings must be recorded by a configured inference provider or a clinician.",
        },
      });
    } catch (e) { next(e); }
  });

  router.get("/studies/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const study = await BiomedicalService.getStudy(oid(req), req.params.id);
      if (!study) return res.status(404).json({ ok: false, error: { code: "not_found", message: "Study not found" } });
      res.json({ ok: true, data: study });
    } catch (e) { next(e); }
  });

  // Attaching findings is a clinical action — admin-gated.
  router.post("/studies/:id/findings", requireAdmin, validate({ params: IdParam, body: FindingsSchema }),
    async (req, res, next) => {
      try {
        const study = await BiomedicalService.recordFindings(
          oid(req), req.params.id, req.body.findings,
          { reviewedByRadiologist: req.body.reviewedByRadiologist },
        );
        if (!study) return res.status(404).json({ ok: false, error: { code: "not_found", message: "Study not found" } });
        res.json({ ok: true, data: study });
      } catch (e) { next(e); }
    });

  // ── pharmacy alerts ───────────────────────────────────────────────
  router.post("/pharmacy-alerts", requireAdmin, validate({ body: PharmacyAlertSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await BiomedicalService.addPharmacyAlert(oid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // ── telemedicine ──────────────────────────────────────────────────
  router.post("/telemedicine/sessions", validate({ body: TelemedStartSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await BiomedicalService.startTelemedSession(oid(req), req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/telemedicine/sessions/:id/end", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const s = await BiomedicalService.endTelemedSession(oid(req), req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "not_found", message: "Session not found" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });

  // ── hospital ops feed ─────────────────────────────────────────────
  router.post("/ops-metrics", requireAdmin, validate({ body: OpsSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BiomedicalService.setOpsMetrics(oid(req), req.body.metrics) }); }
    catch (e) { next(e); }
  });
}
