/**
 * Enterprise Platform Services routes (Session 29: Phase 28, Slices 245–257).
 * Mounted at /platform-services behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ConfigService } from "../../platformServices/config.service.js";
import { FeatureFlagsService } from "../../platformServices/featureFlags.service.js";
import { PoliciesService } from "../../platformServices/policies.service.js";
import { TenantsService } from "../../platformServices/tenants.service.js";
import { LicensingService } from "../../platformServices/licensing.service.js";
import { BillingService } from "../../platformServices/billing.service.js";
import { CapabilitiesService } from "../../platformServices/capabilities.service.js";
import { OntologyService } from "../../platformServices/ontology.service.js";
import { BlueprintsService } from "../../platformServices/blueprints.service.js";

const configSchema = z.object({
  key: z.string().min(2).max(120),
  scope: z.enum(["global","org","user","tenant","environment"]).default("global"),
  valueType: z.enum(["string","number","boolean","json","secret"]).default("string"),
  value: z.any(),
  defaultValue: z.any().optional(),
  description: z.string().min(2).max(500),
  encrypted: z.boolean().default(false),
  hotReload: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
const runtimeOverrideSchema = z.object({ value: z.any(), actor: z.string().default("admin") });
const flagCreateSchema = z.object({
  key: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(500),
  enabled: z.boolean().default(false),
  rolloutPct: z.number().min(0).max(100).default(0),
  strategy: z.enum(["boolean","percentage","user-segment","org-segment","tenant","kill-switch"]).default("boolean"),
  segments: z.array(z.string()).default([]),
  owner: z.string().default("admin"),
});
const flagPatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().min(2).max(500).optional(),
  enabled: z.boolean().optional(),
  rolloutPct: z.number().min(0).max(100).optional(),
  strategy: z.enum(["boolean","percentage","user-segment","org-segment","tenant","kill-switch"]).optional(),
  segments: z.array(z.string()).optional(),
  status: z.enum(["draft","active","paused","archived"]).optional(),
  overrides: z.array(z.object({ subject: z.string(), kind: z.enum(["user","org","tenant","segment"]), enabled: z.boolean() })).optional(),
});
const flagEvalSchema = z.object({
  userId: z.string().optional(),
  orgId: z.string().optional(),
  tenantId: z.string().optional(),
  segment: z.string().optional(),
});
const policyCreateSchema = z.object({
  key: z.string().min(2).max(120),
  name: z.string().min(2).max(160),
  description: z.string().min(2).max(500),
  type: z.enum(["access-control","data-residency","rate-limit","quota","compliance","retention","content-filter","budget","approval"]),
  effect: z.enum(["allow","deny","enforce","audit","throttle","block"]),
  priority: z.number().int().min(0).max(1000).default(100),
  conditions: z.array(z.object({
    field: z.string(),
    op: z.enum(["eq","neq","gt","gte","lt","lte","in","not_in","contains","regex","exists"]),
    value: z.any(),
  })).default([]),
  scope: z.enum(["global","org","user","tenant","environment"]).default("global"),
  owner: z.string().default("admin"),
});
const policyPatchSchema = policyCreateSchema.partial();
const evaluateSchema = z.object({ context: z.record(z.any()) });
const tenantSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  displayName: z.string().min(2).max(120),
  plan: z.enum(["free","team","business","enterprise","dedicated"]).default("team"),
  status: z.enum(["provisioning","active","suspended","degraded","offboarded"]).default("provisioning"),
  isolation: z.enum(["shared","schema","database","dedicated-vpc"]).default("shared"),
  region: z.string().default("na-east"),
  seats: z.number().int().min(1).default(25),
  dataResidency: z.array(z.string()).default([]),
  ssoEnabled: z.boolean().default(false),
  customDomain: z.string().optional(),
});
const tenantPatchSchema = tenantSchema.partial();
const licenseIssueSchema = z.object({
  holder: z.string().min(2),
  tenantId: z.string().min(2),
  tier: z.enum(["core","pro","enterprise","unlimited"]).default("pro"),
  seats: z.number().int().min(1).default(25),
  daysValid: z.number().int().min(1).default(365),
  features: z.array(z.string()).default(["core"]),
  autoRenew: z.boolean().default(true),
});
const billingAccountSchema = z.object({
  tenantId: z.string().min(2),
  plan: z.enum(["free","starter","growth","scale","enterprise"]).default("growth"),
  period: z.enum(["monthly","annual"]).default("monthly"),
  seats: z.number().int().min(1).default(25),
  currency: z.string().default("USD"),
  lastFour: z.string().max(4).optional(),
});
const usageSchema = z.object({ metric: z.string().min(1), delta: z.number() });
const capabilitySchema = z.object({
  name: z.string().min(2),
  kind: z.enum(["api","service","module","skill","agent","workflow","dashboard","integration","model","storage","queue","event"]),
  version: z.string().default("1.0.0"),
  producer: z.string().min(1),
  consumers: z.array(z.string()).default([]),
  health: z.enum(["healthy","degraded","down","unknown"]).default("unknown"),
  slaMs: z.number().optional(),
  p95Ms: z.number().default(0),
  errorRatePct: z.number().default(0),
  requestsPerMin: z.number().default(0),
  deprecated: z.boolean().default(false),
  docsUrl: z.string().optional(),
});
const healthReportSchema = z.object({
  health: z.enum(["healthy","degraded","down","unknown"]),
  p95Ms: z.number().optional(),
  errorRatePct: z.number().optional(),
  requestsPerMin: z.number().optional(),
});
const ontologySchema = z.object({
  uri: z.string().min(2),
  label: z.string().min(1),
  parentUri: z.string().optional(),
  description: z.string().default(""),
  color: z.enum(["azure","violet","teal","fuchsia","amber","emerald","crimson","slate"]).default("slate"),
  icon: z.string().default("◆"),
  properties: z.array(z.object({
    name: z.string(), type: z.enum(["string","number","boolean","date","ref","enum","struct"]),
    refClass: z.string().optional(), required: z.boolean().default(false), description: z.string().default(""),
  })).default([]),
  aliases: z.array(z.string()).default([]),
});
const blueprintSchema = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  tagline: z.string().min(2).max(200),
  description: z.string().min(2).max(1000),
  category: z.enum(["startup","enterprise","industry","compliance","ai-workforce","workflow","data","migration"]),
  industry: z.string().optional(),
  compatibility: z.enum(["core","pro","enterprise"]).default("core"),
  version: z.string().default("1.0.0"),
  author: z.string().default("windels-team"),
  icon: z.string().default("📐"),
  color: z.enum(["azure","violet","teal","fuchsia","amber","emerald","crimson","slate"]).default("azure"),
  modules: z.array(z.string()).default([]),
  agents: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  workflows: z.array(z.string()).default([]),
  dashboards: z.array(z.string()).default([]),
  estimatedDeployMin: z.number().int().min(1).default(60),
  certified: z.enum(["official","partner","community"]).default("community"),
});

export function registerPlatformServicesRoutes(router: Router) {
  // ── Aggregate dashboard ────────────────────────────────────
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [configs, flags, runtime, pols, tens, lics, bills, caps, ontos, bps] = await Promise.all([
        ConfigService.list(),
        FeatureFlagsService.list(),
        ConfigService.runtimeOverrides(),
        PoliciesService.list(),
        TenantsService.list(),
        LicensingService.list(),
        BillingService.list(),
        CapabilitiesService.list(),
        OntologyService.list(),
        BlueprintsService.list(),
      ]);
      const activeFlags = flags.filter(f=>f.status==="active").length;
      const activePols = pols.filter(p=>p.status==="active").length;
      const l30 = Date.now() + 30*86400_000;
      res.json({ ok:true, data: {
        configEntries: configs.length,
        hotReloadable: configs.filter(c=>c.hotReload).length,
        featureFlags: flags.length,
        flagsActive: activeFlags,
        runtimeOverrides: Object.keys(runtime).length,
        policies: pols.length,
        policiesActive: activePols,
        evaluations24h: pols.reduce((a,p)=>a+p.evaluations30d,0),
        violations24h: pols.reduce((a,p)=>a+p.violations30d,0),
        tenants: tens.length,
        tenantsActive: tens.filter(t=>t.status==="active").length,
        isolatedTenants: tens.filter(t=>t.isolated).length,
        licenses: lics.length,
        licensesActive: lics.filter(l=>l.status==="active"||l.status==="trial").length,
        expiringLicenses30d: lics.filter(l=>l.status==="active" && new Date(l.expiresAt).getTime() < l30).length,
        accounts: bills.length,
        totalMrr: bills.reduce((a,b)=>a+b.mrr,0),
        totalArr: bills.reduce((a,b)=>a+b.arr,0),
        delinquentAccounts: bills.filter(b=>b.status==="delinquent"||b.status==="past_due").length,
        capabilities: caps.length,
        capabilitiesHealthy: caps.filter(c=>c.health==="healthy").length,
        ontologyClasses: ontos.length,
        ontologyProperties: ontos.reduce((a,o)=>a+o.properties.length,0),
        blueprints: bps.length,
        blueprintsCertified: bps.filter(b=>b.certified!=="community").length,
      }});
    } catch (e) { next(e); }
  });

  // ── Config (245 + 247) ────────────────────────────────────
  router.get("/config", async (req, res, next) => {
    try {
      const scope = typeof req.query.scope === "string" ? req.query.scope as any : undefined;
      const hot = typeof req.query.hotReload === "string" ? req.query.hotReload === "true" : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await ConfigService.list({ scope, hotReload: hot, q }) });
    } catch (e) { next(e); }
  });
  router.get("/config/runtime", async (_req, res, next) => {
    try { res.json({ ok:true, data: await ConfigService.runtimeOverrides() }); } catch(e){next(e);}
  });
  router.get("/config/:id", async (req, res, next) => {
    try {
      const c = await ConfigService.get(req.params.id);
      if (!c) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:c });
    } catch(e){next(e);}
  });
  router.post("/config", validate({ body: configSchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ConfigService.upsert({ ...req.body, updatedBy: req.user?.id ?? "admin" }) }); }
    catch(e){next(e);}
  });
  router.post("/config/:key/runtime", validate({ body: runtimeOverrideSchema }), async (req, res, next) => {
    try {
      const c = await ConfigService.setRuntimeOverride(req.params.key, req.body.value, req.body.actor);
      if (!c) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:c });
    } catch(e){next(e);}
  });

  // ── Feature Flags (246 + 253) ─────────────────────────────
  router.get("/flags", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await FeatureFlagsService.list({ status, q }) });
    } catch(e){next(e);}
  });
  router.get("/flags/:id", async (req, res, next) => {
    try {
      const f = await FeatureFlagsService.get(req.params.id);
      if (!f) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:f });
    } catch(e){next(e);}
  });
  router.post("/flags", validate({ body: flagCreateSchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await FeatureFlagsService.create({ ...req.body, overrides:[], tags:["ui"] }) }); }
    catch(e){next(e);}
  });
  router.patch("/flags/:id", validate({ body: flagPatchSchema }), async (req, res, next) => {
    try {
      const f = await FeatureFlagsService.update(req.params.id, req.body);
      if (!f) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:f });
    } catch(e){next(e);}
  });
  router.post("/flags/:id/toggle", async (req, res, next) => {
    try {
      const existing = await FeatureFlagsService.get(req.params.id);
      if (!existing) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      const f = await FeatureFlagsService.setEnabled(req.params.id, !existing.enabled);
      res.json({ ok:true, data:f });
    } catch(e){next(e);}
  });
  router.delete("/flags/:id", async (req, res, next) => {
    try {
      const ok = await FeatureFlagsService.remove(req.params.id);
      res.json({ ok, data: { removed: ok } });
    } catch(e){next(e);}
  });
  router.post("/flags/evaluate/:key", validate({ body: flagEvalSchema }), async (req, res, next) => {
    try {
      const enabled = await FeatureFlagsService.evaluate(req.params.key, req.body);
      await FeatureFlagsService.bumpEval(req.params.key, enabled);
      res.json({ ok:true, data: { key: req.params.key, enabled } });
    } catch(e){next(e);}
  });

  // ── Policies (248 + 254) ──────────────────────────────────
  router.get("/policies", async (req, res, next) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await PoliciesService.list({ type, status, q }) });
    } catch(e){next(e);}
  });
  router.get("/policies/:id", async (req, res, next) => {
    try {
      const p = await PoliciesService.get(req.params.id);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });
  router.post("/policies", validate({ body: policyCreateSchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await PoliciesService.create({ ...req.body, status:"draft" }) }); }
    catch(e){next(e);}
  });
  router.patch("/policies/:id", validate({ body: policyPatchSchema }), async (req, res, next) => {
    try {
      const p = await PoliciesService.update(req.params.id, req.body);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });
  router.delete("/policies/:id", async (req, res, next) => {
    try { res.json({ ok:true, data: { removed: await PoliciesService.remove(req.params.id) } }); }
    catch(e){next(e);}
  });
  router.post("/policies/evaluate", validate({ body: evaluateSchema }), async (req, res, next) => {
    try {
      const results = await PoliciesService.evaluateAll(req.body.context);
      const deny = results.find(r => r.matched && (r.effect === "deny" || r.effect === "block"));
      res.json({ ok:true, data: { allow: !deny, results, deniedBy: deny ?? null } });
    } catch(e){next(e);}
  });

  // ── Tenants (249 + 250) ───────────────────────────────────
  router.get("/tenants", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const plan = typeof req.query.plan === "string" ? req.query.plan as any : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await TenantsService.list({ status, plan, q }) });
    } catch(e){next(e);}
  });
  router.get("/tenants/:id", async (req, res, next) => {
    try {
      const t = await TenantsService.get(req.params.id);
      if (!t) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:t });
    } catch(e){next(e);}
  });
  router.post("/tenants", validate({ body: tenantSchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await TenantsService.create(req.body) }); }
    catch(e){next(e);}
  });
  router.patch("/tenants/:id", validate({ body: tenantPatchSchema }), async (req, res, next) => {
    try {
      const t = await TenantsService.update(req.params.id, req.body);
      if (!t) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:t });
    } catch(e){next(e);}
  });

  // ── Licenses (251) ────────────────────────────────────────
  router.get("/licenses", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const tier = typeof req.query.tier === "string" ? req.query.tier as any : undefined;
      res.json({ ok:true, data: await LicensingService.list({ status, tier }) });
    } catch(e){next(e);}
  });
  router.get("/licenses/:id", async (req, res, next) => {
    try {
      const l = await LicensingService.get(req.params.id);
      if (!l) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:l });
    } catch(e){next(e);}
  });
  router.post("/licenses", validate({ body: licenseIssueSchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await LicensingService.issue(req.body) }); }
    catch(e){next(e);}
  });
  router.post("/licenses/:id/revoke", async (req, res, next) => {
    try {
      const l = await LicensingService.revoke(req.params.id);
      if (!l) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:l });
    } catch(e){next(e);}
  });
  router.post("/licenses/verify/:key", async (req, res, next) => {
    try { res.json({ ok:true, data: await LicensingService.verify(req.params.key) }); }
    catch(e){next(e);}
  });

  // ── Billing (252) ─────────────────────────────────────────
  router.get("/billing", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const plan = typeof req.query.plan === "string" ? req.query.plan as any : undefined;
      res.json({ ok:true, data: await BillingService.list({ status, plan }) });
    } catch(e){next(e);}
  });
  router.get("/billing/:id", async (req, res, next) => {
    try {
      const b = await BillingService.get(req.params.id);
      if (!b) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:b });
    } catch(e){next(e);}
  });
  router.post("/billing", validate({ body: billingAccountSchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await BillingService.openAccount(req.body) }); }
    catch(e){next(e);}
  });
  router.post("/billing/:id/usage", validate({ body: usageSchema }), async (req, res, next) => {
    try {
      const b = await BillingService.recordUsage(req.params.id, req.body.metric, req.body.delta);
      if (!b) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:b });
    } catch(e){next(e);}
  });

  // ── Capabilities (255) ────────────────────────────────────
  router.get("/capabilities", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const health = typeof req.query.health === "string" ? req.query.health as any : undefined;
      const producer = typeof req.query.producer === "string" ? req.query.producer : undefined;
      res.json({ ok:true, data: await CapabilitiesService.list({ kind, health, producer }) });
    } catch(e){next(e);}
  });
  router.get("/capabilities/:id", async (req, res, next) => {
    try {
      const c = await CapabilitiesService.get(req.params.id);
      if (!c) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:c });
    } catch(e){next(e);}
  });
  router.post("/capabilities", validate({ body: capabilitySchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await CapabilitiesService.register(req.body) }); }
    catch(e){next(e);}
  });
  router.post("/capabilities/:name/health", validate({ body: healthReportSchema }), async (req, res, next) => {
    try {
      const c = await CapabilitiesService.reportHealth(req.params.name, req.body.health, req.body.p95Ms, req.body.errorRatePct, req.body.requestsPerMin);
      if (!c) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:c });
    } catch(e){next(e);}
  });

  // ── Ontology (256) ────────────────────────────────────────
  router.get("/ontology", async (req, res, next) => {
    try {
      const parent = typeof req.query.parentUri === "string" ? req.query.parentUri : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await OntologyService.list({ parentUri: parent, q }) });
    } catch(e){next(e);}
  });
  router.get("/ontology/:id", async (req, res, next) => {
    try {
      const o = await OntologyService.get(req.params.id);
      if (!o) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:o });
    } catch(e){next(e);}
  });
  router.post("/ontology", validate({ body: ontologySchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await OntologyService.define(req.body) }); }
    catch(e){next(e);}
  });

  // ── Blueprints (257) ──────────────────────────────────────
  router.get("/blueprints", async (req, res, next) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category as any : undefined;
      const industry = typeof req.query.industry === "string" ? req.query.industry : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await BlueprintsService.list({ category, industry, q }) });
    } catch(e){next(e);}
  });
  router.get("/blueprints/:id", async (req, res, next) => {
    try {
      const b = await BlueprintsService.get(req.params.id);
      if (!b) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:b });
    } catch(e){next(e);}
  });
  router.post("/blueprints", validate({ body: blueprintSchema }), async (req, res, next) => {
    try {
      const { modules, agents, skills, workflows, dashboards, ...rest } = req.body;
      res.json({ ok:true, data: await BlueprintsService.publish({
        ...rest,
        slices: (modules ?? []).map((m: string) => ({ id:m, name:m, required:true, config:{} })),
        modules: modules ?? [], agents: agents ?? [], skills: skills ?? [],
        workflows: workflows ?? [], dashboards: dashboards ?? [],
      }) });
    } catch(e){next(e);}
  });
  router.post("/blueprints/:id/install", async (req, res, next) => {
    try {
      const b = await BlueprintsService.install(req.params.id);
      if (!b) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:b });
    } catch(e){next(e);}
  });
}
