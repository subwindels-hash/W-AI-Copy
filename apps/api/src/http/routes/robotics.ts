/** Session 57 — Enterprise Robotics & Physical Automation routes.
 *  Session 155 — telemetry ingest, alerts, maintenance, connectors, update/delete.
 *  Existing six endpoints keep their paths, bodies and response envelopes. */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { RoboticsService } from "../../robotics/robotics.service.js";
import {
  CreateRobotSchema, UpdateRobotSchema, CommandSchema,
  TelemetryIngestSchema, ScheduleMaintenanceSchema,
} from "@windels/shared";

function oid(req: { user?: { organizationId?: string } }) {
  return (req.user as { organizationId?: string } | undefined)?.organizationId;
}

export function registerRoboticsRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try { res.json({ ok: true, data: await RoboticsService.dashboard(oid(req)) }); } catch (e) { next(e); }
  });
  router.get("/connectors", async (_req, res, next) => {
    try { res.json({ ok: true, data: RoboticsService.connectors() }); } catch (e) { next(e); }
  });
  router.get("/health", async (req, res, next) => {
    try {
      const d = await RoboticsService.dashboard(oid(req));
      res.json({
        ok: true,
        data: {
          robots: d.totalRobots,
          measuredRobots: d.measuredRobots,
          openAlerts: d.predictiveAlerts,
          connectors: d.connectors,
          mqtt: d.provenance.mqtt,
        },
      });
    } catch (e) { next(e); }
  });
  router.get("/alerts", async (req, res, next) => {
    try { res.json({ ok: true, data: await RoboticsService.listAlerts(oid(req)) }); } catch (e) { next(e); }
  });
  router.post("/alerts/:id/ack", async (req, res, next) => {
    try {
      const a = await RoboticsService.ackAlert(req.params.id, oid(req));
      if (!a) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "alert not found" } });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.get("/maintenance", async (req, res, next) => {
    try { res.json({ ok: true, data: await RoboticsService.listMaintenance(oid(req)) }); } catch (e) { next(e); }
  });
  router.post("/maintenance", validate({ body: ScheduleMaintenanceSchema }), async (req, res, next) => {
    try {
      const mw = await RoboticsService.scheduleMaintenance(req.body, oid(req));
      if (!mw) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: mw });
    } catch (e) { next(e); }
  });
  router.get("/robots", async (req, res, next) => {
    try { res.json({ ok: true, data: await RoboticsService.list(oid(req)) }); } catch (e) { next(e); }
  });
  router.get("/robots/:id", async (req, res, next) => {
    try {
      const r = await RoboticsService.get(req.params.id, oid(req));
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.post("/robots", validate({ body: CreateRobotSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await RoboticsService.create({ ...req.body, organizationId: oid(req) }) }); } catch (e) { next(e); }
  });
  router.patch("/robots/:id", validate({ body: UpdateRobotSchema }), async (req, res, next) => {
    try {
      const r = await RoboticsService.update(req.params.id, req.body, oid(req));
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.delete("/robots/:id", async (req, res, next) => {
    try {
      const ok = await RoboticsService.remove(req.params.id, oid(req));
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id } });
    } catch (e) { next(e); }
  });
  router.post("/robots/:id/command", validate({ body: CommandSchema }), async (req, res, next) => {
    try {
      const r = await RoboticsService.command(req.params.id, req.body.action, oid(req));
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.post("/robots/:id/telemetry", validate({ body: TelemetryIngestSchema }), async (req, res, next) => {
    try {
      const out = await RoboticsService.recordTelemetry(req.params.id, req.body, oid(req));
      if (!out) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: out });
    } catch (e) { next(e); }
  });
  router.get("/robots/:id/telemetry", async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const rows = await RoboticsService.listTelemetry(req.params.id, oid(req), Number.isFinite(limit) ? limit : 50);
      if (!rows) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "robot not found" } });
      res.json({ ok: true, data: rows });
    } catch (e) { next(e); }
  });
  router.post("/predictive/scan", async (req, res, next) => {
    try { res.json({ ok: true, data: await RoboticsService.runPredictiveScan(oid(req)) }); } catch (e) { next(e); }
  });
}
