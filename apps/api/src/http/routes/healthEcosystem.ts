/** Session 75 — Health, Wellness & Digital Healthcare Ecosystem (V10.0)
 * Routes honour the Fifth Standing Rule — every POST accepts a `label` field which
 * is validated against HealthLabel; if omitted, sensible defaults are applied
 * (manual entries default to `wellness_estimate`, device entries to `clinically_validated`).
 *
 * Session 175: all handlers enforce tenant+user isolation via orgOf/userOf — no
 * fallback to anon, no org-windels default. Dashboard is a pure read (never seeds).
 */
import { Router } from "express";
import { z } from "zod";
import { HealthEcosystemService } from "../../healthEcosystem/healthEcosystem.service.js";
import { HeartHealthService } from "../../healthEcosystem/heartHealth.service.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
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

// ── Session 200 — Heart Center (AI-Powered Heart Reports & Scans) ────────────
const quickMeasureBody = z.object({
  heartRateBpm: z.number().int().min(20).max(300).optional(),
  systolic: z.number().int().min(50).max(300).optional(),
  diastolic: z.number().int().min(30).max(200).optional(),
  rrIntervalsMs: z.array(z.number().min(200).max(2000)).max(600).optional(),
  source: z.string().optional(),
  at: z.string().optional(),
  note: z.string().max(500).optional(),
}).refine(
  (b) => b.heartRateBpm !== undefined || b.rrIntervalsMs?.length || (b.systolic !== undefined && b.diastolic !== undefined),
  { message: "at least one measurement (heartRateBpm, systolic+diastolic, or rrIntervalsMs) is required" },
);
const bloodPressureBody = z.object({
  systolic: z.number().int().min(50).max(300),
  diastolic: z.number().int().min(30).max(200),
  pulseBpm: z.number().int().min(20).max(300).optional(),
  source: z.string().optional(),
  at: z.string().optional(),
  note: z.string().max(500).optional(),
}).refine((b) => b.diastolic < b.systolic, { message: "diastolic must be lower than systolic" });
const heartReportBody = z.object({
  kind: z.enum(["heart_scan", "kidney_scan", "health_scan"]),
});

function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}
function userOf(req: any, res: any): string | null {
  const uid = req.user?.id;
  if (!uid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "user context required" } });
    return null;
  }
  return uid;
}

export function registerHealthEcosystemRoutes(router: Router) {
  router.use(authenticate);

  // Dashboard
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.dashboard(oid, uid), disclaimer: HEALTH_DISCLAIMER });
    } catch (e) { next(e); }
  });

  // Metrics
  router.get("/metrics", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const kind = (req.query.kind as string) || undefined;
      const limit = parseInt((req.query.limit as string) || "50", 10);
      res.json({ ok: true, data: await HealthEcosystemService.listMetrics(oid, uid, kind as any, limit) });
    } catch (e) { next(e); }
  });
  router.post("/metrics", validate({ body: metricBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addMetric(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });

  // Fitness sessions
  router.get("/fitness-sessions", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listSessions(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/fitness-sessions", validate({ body: sessionBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addSession(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });

  // Medications
  router.get("/medications", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listMedications(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/medications", validate({ body: medicationBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addMedication(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });
  router.delete("/medications/:id", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      await HealthEcosystemService.deleteMedication(oid, uid, req.params.id); res.json({ ok: true });
    }
    catch (e) { next(e); }
  });

  // Notes
  router.get("/notes", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listNotes(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/notes", validate({ body: noteBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addNote(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });

  // Emergency alerts
  router.get("/emergency-alerts", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listAlerts(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/emergency-alerts", validate({ body: alertBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addAlert(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });
  router.post("/emergency-alerts/:id/acknowledge", validate({ body: ackBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const a = await HealthEcosystemService.ackAlert(oid, uid, req.params.id);
      if (!a) return res.status(404).json({ ok: false, error: "alert_not_found" });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });

  // Insights (read) with optional label filter
  router.get("/insights", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const label = req.query.label as any;
      res.json({ ok: true, data: await HealthEcosystemService.listInsights(oid, uid, label), disclaimer: HEALTH_DISCLAIMER });
    } catch (e) { next(e); }
  });

  // Profile — user-supplied; nothing is inferred or invented.
  router.get("/profile", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.getProfile(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/profile", validate({ body: profileBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.upsertProfile(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });

  // Connected devices — registered explicitly, never assumed present.
  router.get("/wearables", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listWearables(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/wearables", validate({ body: wearableBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addWearable(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });
  router.get("/medical-devices", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listMedicalDevices(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/medical-devices", validate({ body: medicalDeviceBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addMedicalDevice(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });

  // Preventive care records
  router.get("/vaccinations", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listVaccinations(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/vaccinations", validate({ body: vaccinationBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addVaccination(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });
  router.get("/screenings", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.listScreenings(oid, uid) });
    }
    catch (e) { next(e); }
  });
  router.post("/screenings", validate({ body: screeningBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HealthEcosystemService.addScreening(oid, uid, req.body) });
    }
    catch (e) { next(e); }
  });

  // ── Session 200 — Heart Center (AI-Powered Heart Reports & Scans) ──────────
  // All subroutes are analysis/convenience layers over the shared metric store:
  // writes go through HealthEcosystemService.addMetric (label provenance gate),
  // reads are deterministic arithmetic, and scans never fabricate findings.

  // Your Heart Data
  router.get("/heart/data", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HeartHealthService.heartData(oid, uid) });
    } catch (e) { next(e); }
  });

  // Heart Rate Variability Analysis
  router.get("/heart/hrv", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const days = req.query.days ? Number(req.query.days) : 7;
      res.json({ ok: true, data: await HeartHealthService.hrvAnalysis(oid, uid, days) });
    } catch (e) { next(e); }
  });

  // Heart Rate Monitor feed
  router.get("/heart/monitor", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const limit = req.query.limit ? Number(req.query.limit) : 60;
      res.json({ ok: true, data: await HeartHealthService.monitorFeed(oid, uid, limit) });
    } catch (e) { next(e); }
  });

  // Quick Heart Measure
  router.post("/heart/measure", validate({ body: quickMeasureBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HeartHealthService.quickMeasure(oid, uid, req.body) });
    } catch (e) { next(e); }
  });

  // Track Blood Pressure — summary + history
  router.get("/heart/blood-pressure", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HeartHealthService.bloodPressure(oid, uid) });
    } catch (e) { next(e); }
  });

  // Track Blood Pressure — record a reading
  router.post("/heart/blood-pressure", validate({ body: bloodPressureBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HeartHealthService.addBloodPressure(oid, uid, req.body) });
    } catch (e) { next(e); }
  });

  // Pulse Statistics
  router.get("/heart/pulse-stats", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HeartHealthService.pulseStats(oid, uid) });
    } catch (e) { next(e); }
  });

  // AI-Powered Heart Reports & Scans — list saved reports
  router.get("/heart/reports", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: await HeartHealthService.listReports(oid, uid) });
    } catch (e) { next(e); }
  });

  // AI-Powered Heart Reports & Scans — generate (Heart Scan / Kidney Scan / Health Scan)
  router.post("/heart/reports", validate({ body: heartReportBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const report = await HeartHealthService.generateReport(oid, uid, req.body.kind);
      res.json({ ok: true, data: report, disclaimer: HEALTH_DISCLAIMER });
    } catch (e) { next(e); }
  });

  // AI-Powered Heart Reports & Scans — fetch one saved report
  router.get("/heart/reports/:id", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      const report = await HeartHealthService.getReport(oid, uid, String(req.params.id));
      if (!report) {
        res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "report not found" } });
        return;
      }
      res.json({ ok: true, data: report });
    } catch (e) { next(e); }
  });

  // Module registry (which sub-modules are enabled, routes to them)
  router.get("/modules", async (req, res, next) => {
    try {
      // Modules catalog is shared static — but still requires auth to avoid leaking enabled-module list to anonymous callers.
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: HealthEcosystemService.listModules() });
    } catch (e) { next(e); }
  });

  // Fifth Standing Rule / compliance disclosure
  router.get("/disclaimer", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const uid = userOf(req, res); if (!uid) return;
      res.json({ ok: true, data: { disclaimer: HEALTH_DISCLAIMER, rule: "Fifth Standing Rule — three-bucket health labels" } });
    } catch (e) { next(e); }
  });
}
