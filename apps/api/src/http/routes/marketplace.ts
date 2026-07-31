/**
 * Marketplace, Digital Twin & Simulation routes (Session 34).
 * Mounted at /marketplace behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { SkillsService } from "../../marketplace/skills.service.js";
import { DigitalTwinsService } from "../../marketplace/digitalTwins.service.js";
import { SimulationService } from "../../marketplace/simulation.service.js";
import { AppStoreService } from "../../marketplace/appStore.service.js";

const skillPublish = z.object({
  name: z.string(), slug: z.string(), publisher: z.string(), category: z.string(), version: z.string(),
  summary: z.string(), description: z.string().optional(), tags: z.array(z.string()).default([]),
  priceModel: z.enum(["free","subscription","one-time","usage"]).default("free"),
  priceUsd: z.number().optional(), status: z.enum(["draft","published","deprecated","disabled"]).default("published"),
  requiredCapabilities: z.array(z.string()).default([]), requiredPermissions: z.array(z.string()).default([]),
  iconColor: z.string().default("#8B5CF6"), iconEmoji: z.string().optional(),
});
const installSkill = z.object({ skillId: z.string(), configuration: z.record(z.any()).default({}) });
const assignSkill = z.object({ installationId: z.string(), scope: z.enum(["workforce","role","user","department"]), targetId: z.string(), targetName: z.string(), policyBindingId: z.string().optional() });

const twinCreate = z.object({
  name: z.string(), kind: z.string(), description: z.string(), owner: z.string(),
  location: z.string().optional(), tags: z.array(z.string()).default([]), iconColor: z.string().default("#3B82F6"),
  status: z.enum(["design","provisioning","live","paused","archived"]).default("live"),
});
const entityCreate = z.object({
  name: z.string(), kind: z.string(), externalId: z.string().optional(),
  metadata: z.record(z.any()).default({}), tags: z.array(z.string()).default([]),
  position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
  parentEntityId: z.string().optional(),
});
const telemetryCreate = z.object({ entityId: z.string(), metric: z.string(), value: z.number(), unit: z.string(), source: z.string().default("api") });

const scenarioCreate = z.object({
  name: z.string(), kind: z.string(), description: z.string(), owner: z.string(),
  twinId: z.string().optional(), tags: z.array(z.string()).default([]), iconColor: z.string().default("#14B8A6"),
  assumptions: z.array(z.object({ id: z.string(), label: z.string(), value: z.any(), unit: z.string().optional() })).default([]),
});
const runScenario = z.object({ iterations: z.number().int().optional(), horizonDays: z.number().int().optional(), feedSuperIntelligence: z.boolean().default(true) });

const appPublish = z.object({
  name: z.string(), slug: z.string(), publisher: z.string(), kind: z.string(), category: z.string(),
  shortDescription: z.string(), fullDescription: z.string().optional(),
  latestVersion: z.string().default("1.0.0"),
  priceModel: z.enum(["free","paid","trial"]).default("free"), priceUsd: z.number().optional(),
  permissions: z.array(z.string()).default([]), dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]), iconColor: z.string().default("#D946EF"), iconEmoji: z.string().optional(),
});
const installApp = z.object({ appId: z.string(), autoUpdate: z.boolean().default(true) });
const appVersion = z.object({ version: z.string(), changelog: z.string().default(""), minOsVersion: z.string().default("0.34.0"), sizeKb: z.number().int().default(128), packageUrl: z.string().optional() });

export function registerMarketplaceRoutes(router: Router) {
  // dashboard rollup
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [sk, tw, sim, ap] = await Promise.all([
        SkillsService.summary(), DigitalTwinsService.summary(), SimulationService.summary(), AppStoreService.summary(),
      ]);
      res.json({ ok: true, data: { ...sk, ...tw, ...sim, ...ap } });
    } catch (e) { next(e); }
  });

  // Skills
  router.get("/skills", async (req, res, next) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category as any : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok: true, data: await SkillsService.listSkills({ category, q }) });
    } catch (e) { next(e); }
  });
  router.post("/skills", validate({ body: skillPublish }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SkillsService.publishSkill(req.body) }); } catch (e) { next(e); }
  });
  router.get("/skills/installations", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SkillsService.listInstallations() }); } catch (e) { next(e); }
  });
  router.post("/skills/installations", validate({ body: installSkill }), async (req, res, next) => {
    try {
      const { skillId, configuration } = req.body;
      res.json({ ok: true, data: await SkillsService.installSkill({ skillId, orgId: (req as any).user?.orgId ?? "org-default", installedBy: (req as any).user?.id ?? "admin", configuration }) });
    } catch (e) { next(e); }
  });
  router.delete("/skills/installations/:id", async (req, res, next) => {
    try { await SkillsService.uninstallSkill(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
  });
  router.get("/skills/assignments", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SkillsService.listAssignments() }); } catch (e) { next(e); }
  });
  router.post("/skills/assignments", validate({ body: assignSkill }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SkillsService.assignSkill({ ...req.body, assignedBy: (req as any).user?.id ?? "admin" }) }); } catch (e) { next(e); }
  });

  // Twins
  router.get("/twins", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      res.json({ ok: true, data: await DigitalTwinsService.listTwins({ kind }) });
    } catch (e) { next(e); }
  });
  router.post("/twins", validate({ body: twinCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await DigitalTwinsService.createTwin(req.body) }); } catch (e) { next(e); }
  });
  router.get("/twins/:id", async (req, res, next) => {
    try { const t = await DigitalTwinsService.getTwin(req.params.id); if (!t) return res.status(404).json({ok:false}); res.json({ok:true,data:t}); } catch (e) { next(e); }
  });
  router.get("/twins/:id/entities", async (req, res, next) => {
    try { res.json({ ok: true, data: await DigitalTwinsService.listEntities(req.params.id) }); } catch (e) { next(e); }
  });
  router.post("/twins/:id/entities", validate({ body: entityCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await DigitalTwinsService.addEntity(req.params.id, req.body) }); } catch (e) { next(e); }
  });
  router.post("/twins/:id/telemetry", validate({ body: telemetryCreate }), async (req, res, next) => {
    try {
      const { entityId, metric, value, unit, source } = req.body;
      res.json({ ok: true, data: await DigitalTwinsService.recordTelemetry(req.params.id, entityId, metric, value, unit, source) });
    } catch (e) { next(e); }
  });
  router.get("/twins/:id/telemetry", async (req, res, next) => {
    try {
      const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
      res.json({ ok: true, data: await DigitalTwinsService.recentTelemetry(req.params.id, limit) });
    } catch (e) { next(e); }
  });

  // Simulation
  router.get("/scenarios", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      res.json({ ok: true, data: await SimulationService.listScenarios({ kind }) });
    } catch (e) { next(e); }
  });
  router.post("/scenarios", validate({ body: scenarioCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SimulationService.createScenario(req.body) }); } catch (e) { next(e); }
  });
  router.get("/scenarios/:id", async (req, res, next) => {
    try { const s = await SimulationService.getScenario(req.params.id); if (!s) return res.status(404).json({ok:false}); res.json({ok:true,data:s}); } catch (e) { next(e); }
  });
  router.post("/scenarios/:id/run", validate({ body: runScenario }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SimulationService.runSimulation({ scenarioId: req.params.id, startedBy: (req as any).user?.id ?? "admin", ...req.body }) });
    } catch (e) { next(e); }
  });
  router.get("/scenarios/:id/runs", async (req, res, next) => {
    try { res.json({ ok: true, data: await SimulationService.listRuns(req.params.id) }); } catch (e) { next(e); }
  });
  router.get("/simulations", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SimulationService.listRuns() }); } catch (e) { next(e); }
  });

  // App Store
  router.get("/apps", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      res.json({ ok: true, data: await AppStoreService.listApps({ kind, category, approvedOnly: req.query.approved === "true" }) });
    } catch (e) { next(e); }
  });
  router.post("/apps", validate({ body: appPublish }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AppStoreService.publishApp({ ...req.body, governanceApproved: false, status: "pending-review" }) }); } catch (e) { next(e); }
  });
  router.get("/apps/:id", async (req, res, next) => {
    try { const a = await AppStoreService.getApp(req.params.id); if (!a) return res.status(404).json({ok:false}); res.json({ok:true,data:a}); } catch (e) { next(e); }
  });
  router.post("/apps/:id/approve", async (req, res, next) => {
    try { const a = await AppStoreService.setApproval(req.params.id, true); res.json({ ok: true, data: a }); } catch (e) { next(e); }
  });
  router.get("/apps/:id/versions", async (req, res, next) => {
    try { res.json({ ok: true, data: await AppStoreService.listVersions(req.params.id) }); } catch (e) { next(e); }
  });
  router.post("/apps/:id/versions", validate({ body: appVersion }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AppStoreService.addVersion({ appId: req.params.id, ...req.body }) }); } catch (e) { next(e); }
  });
  router.get("/apps/installs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await AppStoreService.listInstalls() }); } catch (e) { next(e); }
  });
  router.post("/apps/installs", validate({ body: installApp }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AppStoreService.installApp({ ...req.body, orgId: (req as any).user?.orgId ?? "org-default", installedBy: (req as any).user?.id ?? "admin" }) });
    } catch (e) { next(e); }
  });
  router.delete("/apps/installs/:id", async (req, res, next) => {
    try { await AppStoreService.uninstallApp(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
  });
}
