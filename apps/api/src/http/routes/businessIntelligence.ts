import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { BusinessIntelligenceService } from "../../businessIntelligence/businessIntelligence.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  BiSourceUpsertSchema,
  BiKpiUpsertSchema,
  BiReportUpsertSchema,
} from "@windels/shared/businessIntelligence";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });

export function registerBusinessIntelligenceRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard ─────────────────────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await BusinessIntelligenceService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Sources ───────────────────────────────────────────────────────
  router.get("/sources", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: await BusinessIntelligenceService.listSources(orgOf(_req)), meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sources", validate({ body: BiSourceUpsertSchema }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.createSource(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/sources/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.getSource(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Source not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/sources/:id", validate({ params: IdParam, body: BiSourceUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.updateSource(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Source not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/sources/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await BusinessIntelligenceService.deleteSource(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Source not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── KPIs ──────────────────────────────────────────────────────────
  router.get("/kpis", async (req, res, next) => {
    try {
      const sourceModule = typeof req.query.sourceModule === "string" ? (req.query.sourceModule as any) : undefined;
      const data = await BusinessIntelligenceService.listKpis(orgOf(req), { sourceModule });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/kpis", validate({ body: BiKpiUpsertSchema }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.createKpi(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/kpis/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.getKpi(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "KPI not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/kpis/:id", validate({ params: IdParam, body: BiKpiUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.updateKpi(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "KPI not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/kpis/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await BusinessIntelligenceService.deleteKpi(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "KPI not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/kpis/:id/value", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.evaluateKpiValue(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "KPI not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Reports ───────────────────────────────────────────────────────
  router.get("/reports", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: await BusinessIntelligenceService.listReports(orgOf(_req)), meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/reports", validate({ body: BiReportUpsertSchema }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.createReport(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/reports/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.getReport(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Report not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/reports/:id", validate({ params: IdParam, body: BiReportUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.updateReport(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Report not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/reports/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await BusinessIntelligenceService.deleteReport(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Report not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/reports/:id/evaluate", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.evaluateReport(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Report not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/reports/:id/export.csv", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await BusinessIntelligenceService.exportReportCsv(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Report not found" } });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${data.filename}"`);
      res.send(data.csv);
    } catch (e) { next(e); }
  });
}
