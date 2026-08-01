/** Session 75 — Health, Wellness & Digital Healthcare Ecosystem (V10.0)
 * Routes honour the Fifth Standing Rule — every POST accepts a `label` field which
 * is validated against HealthLabel; if omitted, sensible defaults are applied
 * (manual entries default to `wellness_estimate`, device entries to `clinically_validated`).
 */
import { Router } from "express";
import { z } from "zod";
import { HealthEcosystemService } from "../../healthEcosystem/healthEcosystem.service.js";
import { validate } from "../middleware/validate.js";
import { HEALTH_DISCLAIMER } from "@windels/shared";

const metricBody = z.object({
  kind: z.string().optional(),
  value: z.number(),
  unit: z.string().optional(),
  at: z.string().optional(),
  source: z.string().optional(),
  label: z.enum(["wellness_estimate", "clinically_validated", "medical_decision_support"]).optional(),
  deviceId: z.string().optional(),
  note: z.string().optional(),
});
const sessionBody = z.object({
  kind: z.string(),
  title: z.string().optional(),
  durationMin: z.number(),
  calories: z.number().int().nonnegative(),
  distanceKm: z.number().optional(),
  avgHr: z.number().int().nonnegative(),
  peakHr: z.number().int().nonnegative(),
  coaching: z.boolean().optional(),
  coachingMode: z.string().optional(),
  at: z.string().optional(),
  label: z.enum(["wellness_estimate", "clinically_validated", "medical_decision_support"]).optional(),
});
const medicationBody = z.object({
  name: z.string(),
  generic: z.string().optional(),
  dose: z.string(),
  frequency: z.string(),
  route: z.string().optional(),
  prescriber: z.string().optional(),
  remindersOn: z.boolean().optional(),
  label: z.enum(["wellness_estimate", "clinically_validated", "medical_decision_support"]).optional(),
});
const noteBody = z.object({
  date: z.string().optional(),
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  symptoms: z.array(z.string()).optional(),
  journal: z.string().optional(),
  tags: z.array(z.string()).optional(),
  waterMl: z.number().optional(),
  caffeineMg: z.number().optional(),
  alcoholUnits: z.number().optional(),
});
const alertBody = z.object({
  kind: z.string(),
  severity: z.enum(["info", "warn", "critical", "emergency"]).optional(),
  message: z.string(),
  vitalsSnapshot: z.record(z.number()).optional(),
  contactsNotified: z.number().int().optional(),
  acknowledged: z.boolean().optional(),
  label: z.enum(["wellness_estimate", "clinically_validated", "medical_decision_support"]).optional(),
});
const ackBody = z.object({});
const profileBody = z.object({
  age: z.number().int().min(0).max(130).optional(),
  sexAtBirth: z.enum(["male", "female", "other", "decline"]).optional(),
  heightCm: z.number().min(0).max(300).optional(),
  weightKg: z.number().min(0).max(700).optional(),
  conditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  consentGiven: z.boolean().optional(),
  consentVersion: z.string().optional(),
  bloodType: z.enum(["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"]).optional(),
  emergencyContacts: z.array(z.object({ name: z.string(), phone: z.string(), relation: z.string() })).optional(),
  subscribedModules: z.array(z.string()).optional(),
});
const wearableBody = z.object({
  vendor: z.enum(["apple","samsung","fitbit","garmin","wearos","oura","whoop","polar","none"]).optional(),
  model: z.string().min(1),
  batteryPct: z.number().min(0).max(100).optional(),
  connected: z.boolean().optional(),
  metricsEnabled: z.array(z.string()).optional(),
});
const medicalDeviceBody = z.object({
  kind: z.enum(["bp_monitor","cgm","pulse_ox","ecg","thermometer","scale","spirometer","sleep_mat","glucose_meter"]),
  vendor: z.string().min(1),
  model: z.string().min(1),
  connected: z.boolean().optional(),
  calibrationStatus: z.enum(["ok","due","expired"]).optional(),
});
const vaccinationBody = z.object({
  name: z.string().min(1),
  lastDose: z.string().optional(),
  nextDose: z.string().optional(),
  dosesReceived: z.number().int().min(0).optional(),
  dosesRequired: z.number().int().min(0).optional(),
  status: z.enum(["up_to_date","due","overdue","recommended"]).optional(),
});
const screeningBody = z.object({
  name: z.string().min(1),
  frequency: z.string().min(1).optional(),
  lastCompleted: z.string().optional(),
  nextDue: z.string().optional(),
  status: z.enum(["up_to_date","due","overdue"]).optional(),
});

export function registerHealthEcosystemRoutes(router: Router) {
  const oid = (req: any) => (req.user as any).organizationId;
  const uid = (req: any) => (req.user as any).id;

  // Dashboard
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await HealthEcosystemService.dashboard(oid(req), uid(req)), disclaimer: HEALTH_DISCLAIMER });
    } catch (e) { next(e); }
  });

  // Metrics
  router.get("/metrics", async (req, res, next) => {
    try {
      const kind = (req.query.kind as string) || undefined;
      const limit = parseInt((req.query.limit as string) || "50", 10);
      res.json({ ok: true, data: await HealthEcosystemService.listMetrics(oid(req), uid(req), kind as any, limit) });
    } catch (e) { next(e); }
  });
  router.post("/metrics", validate({ body: metricBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addMetric(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // Fitness sessions
  router.get("/fitness-sessions", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listSessions(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/fitness-sessions", validate({ body: sessionBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addSession(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // Medications
  router.get("/medications", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listMedications(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/medications", validate({ body: medicationBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addMedication(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });
  router.delete("/medications/:id", async (req, res, next) => {
    try { await HealthEcosystemService.deleteMedication(oid(req), uid(req), req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // Notes
  router.get("/notes", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listNotes(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/notes", validate({ body: noteBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addNote(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // Emergency alerts
  router.get("/emergency-alerts", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listAlerts(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/emergency-alerts", validate({ body: alertBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addAlert(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/emergency-alerts/:id/acknowledge", validate({ body: ackBody }), async (req, res, next) => {
    try {
      const a = await HealthEcosystemService.ackAlert(oid(req), uid(req), req.params.id);
      if (!a) return res.status(404).json({ ok: false, error: "alert_not_found" });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });

  // Insights (read) with optional label filter
  router.get("/insights", async (req, res, next) => {
    try {
      const label = req.query.label as any;
      res.json({ ok: true, data: await HealthEcosystemService.listInsights(oid(req), uid(req), label), disclaimer: HEALTH_DISCLAIMER });
    } catch (e) { next(e); }
  });

  // Profile — user-supplied; nothing is inferred or invented.
  router.get("/profile", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.getProfile(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/profile", validate({ body: profileBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.upsertProfile(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // Connected devices — registered explicitly, never assumed present.
  router.get("/wearables", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listWearables(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/wearables", validate({ body: wearableBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addWearable(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/medical-devices", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listMedicalDevices(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/medical-devices", validate({ body: medicalDeviceBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addMedicalDevice(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // Preventive care records
  router.get("/vaccinations", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listVaccinations(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/vaccinations", validate({ body: vaccinationBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addVaccination(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/screenings", async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.listScreenings(oid(req), uid(req)) }); }
    catch (e) { next(e); }
  });
  router.post("/screenings", validate({ body: screeningBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HealthEcosystemService.addScreening(oid(req), uid(req), req.body) }); }
    catch (e) { next(e); }
  });

  // Module registry (which sub-modules are enabled, routes to them)
  router.get("/modules", (_req, res) => res.json({ ok: true, data: HealthEcosystemService.listModules() }));

  // Fifth Standing Rule / compliance disclosure
  router.get("/disclaimer", (_req, res) => res.json({ ok: true, data: { disclaimer: HEALTH_DISCLAIMER, rule: "Fifth Standing Rule — three-bucket health labels" } }));
}
