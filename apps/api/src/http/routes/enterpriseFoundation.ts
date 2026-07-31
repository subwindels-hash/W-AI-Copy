/**
 * Enterprise Foundation routes (Session 31: Phase 30, Slices 271–284).
 * Mounted at /enterprise-foundation behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { DataFabricService } from "../../enterpriseFoundation/dataFabric.service.js";
import { IdentityService } from "../../enterpriseFoundation/identity.service.js";
import { FinOpsService } from "../../enterpriseFoundation/finops.service.js";
import { ResilienceService } from "../../enterpriseFoundation/resilience.service.js";
import { QualityService } from "../../enterpriseFoundation/quality.service.js";
import { OpsCenterService } from "../../enterpriseFoundation/opsCenter.service.js";

const connCreate = z.object({
  name: z.string(), kind: z.enum(["postgres","mysql","snowflake","bigquery","redshift","databricks","s3","gcs","azure-blob","kafka","api","salesforce","sap","workday"]),
  status: z.enum(["connected","degraded","error","syncing","paused"]).default("connected"),
  region: z.string().default("na-east"), host: z.string().optional(), database: z.string().optional(),
  owner: z.string().default("platform"), tags: z.array(z.string()).default([]),
});
const connStatus = z.object({ status: z.enum(["connected","degraded","error","syncing","paused"]) });
const dpCreate = z.object({
  name: z.string(), domain: z.string(), description: z.string(), owner: z.string(),
  sources: z.array(z.string()).default([]), schema: z.string().default("default"),
  freshnessMinutes: z.number().int().default(60), certified: z.enum(["official","partner","community"]).default("official"), sla: z.string().default("99.9%"),
});
const lineageAdd = z.object({ from: z.string(), to: z.string(), type: z.enum(["ingest","transform","serve","join"]), job: z.string(), rows: z.number().int().default(0) });

const princCreate = z.object({
  principalId: z.string(), kind: z.enum(["human","service","ai-agent","api-key","device"]),
  displayName: z.string(), email: z.string().email().optional(),
  provider: z.enum(["local","saml","oidc","google","microsoft","okta","auth0","scim","windels-federation"]).default("local"),
  tenantId: z.string(), status: z.enum(["active","pending","suspended","offboarded"]).default("active"),
  mfaEnabled: z.boolean().default(false), scopes: z.array(z.string()).default([]), groups: z.array(z.string()).default([]),
  aiClass: z.enum(["trusted","sandboxed","read-only","quarantined"]).optional(), modelId: z.string().optional(), agentId: z.string().optional(),
});
const idpCreate = z.object({
  name: z.string(), kind: z.enum(["local","saml","oidc","google","microsoft","okta","auth0","scim","windels-federation"]),
  domain: z.string(), status: z.enum(["active","error","provisioning"]).default("provisioning"),
  ssoUrl: z.string().optional(), scimEnabled: z.boolean().default(false),
});
const saCreate = z.object({ name: z.string(), scopes: z.array(z.string()).default([]), createdBy: z.string().default("admin"), daysValid: z.number().int().default(90) });

const acctCreate = z.object({
  provider: z.enum(["aws","gcp","azure","windels","on-prem"]), name: z.string(), accountId: z.string(),
  region: z.string().default("na-east"), monthToDate: z.number().default(0), forecast: z.number().default(0), budget: z.number().default(0),
  trendPct: z.number().default(0), status: z.enum(["on-track","over","under","alert"]).default("on-track"), currency: z.string().default("USD"),
});
const anomCreate = z.object({
  provider: z.enum(["aws","gcp","azure","windels","on-prem"]), service: z.string(),
  category: z.enum(["compute","storage","network","database","ml","saas","support","other"]),
  expectedAmount: z.number(), actualAmount: z.number(), deltaPct: z.number(), severity: z.enum(["info","warn","critical"]).default("warn"),
});
const optCreate = z.object({
  title: z.string(), provider: z.enum(["aws","gcp","azure","windels","on-prem"]),
  category: z.enum(["compute","storage","network","database","ml","saas","support","other"]),
  resource: z.string(), region: z.string().default("na-east"), savingMonthly: z.number(),
  effort: z.enum(["low","medium","high"]).default("medium"), risk: z.enum(["low","medium","high"]).default("low"),
  status: z.enum(["recommended","applied","dismissed"]).default("recommended"), description: z.string().default(""),
});

const incCreate = z.object({
  title: z.string(), severity: z.enum(["sev1","sev2","sev3","sev4"]),
  service: z.string(), region: z.string().default("global"), impactedCustomers: z.number().int().default(0),
  commander: z.string().optional(), playbookId: z.string().optional(),
});
const incUpdate = z.object({ status: z.enum(["open","investigating","mitigated","resolved","postmortem"]), rca: z.string().optional(), commander: z.string().optional() });
const pbCreate = z.object({
  name: z.string(), trigger: z.string(), action: z.string(), autoRun: z.boolean().default(false),
  runsLast30d: z.number().int().default(0), successRatePct: z.number().default(100), avgResolveSec: z.number().int().default(60), description: z.string().default(""),
});
const bcpCreate = z.object({
  name: z.string(), rtoMinutes: z.number().int(), rpoMinutes: z.number().int(), criticalSystems: z.array(z.string()).default([]),
  failoverRegion: z.string(), owner: z.string(), status: z.enum(["ready","drill-scheduled","needs-updating","failover-active"]).default("ready"),
});

const cardCreate = z.object({
  modelId: z.string(), modelName: z.string(), evaluator: z.string().default("llm-judge"), dataset: z.string().default("golden"),
  samples: z.number().int().default(100), scores: z.record(z.number()).default({}), passPct: z.number().default(0),
  regression: z.boolean().default(false), approved: z.boolean().default(false),
});
const runStart = z.object({
  name: z.string(), modelId: z.string(), dataset: z.string().default("golden"),
  dimensions: z.array(z.enum(["accuracy","hallucination","toxicity","groundedness","relevance","latency","cost","safety","bias","multilingual"])).default(["accuracy"]),
  triggeredBy: z.string().default("manual"),
});

export function registerEnterpriseFoundationRoutes(router: Router) {
  // Dashboard
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [fab, idn, fin, res_, ql, glob] = await Promise.all([
        DataFabricService.summary(), IdentityService.summary(), FinOpsService.summary(),
        ResilienceService.summary(), QualityService.summary(), OpsCenterService.globalStatus(),
      ]);
      res.json({ ok:true, data: { ...fab, ...idn, ...fin, ...res_, ...ql,
        regionsHealthy: glob.regions.filter(r=>r.status==="healthy").length,
        globalRps: glob.trafficRps, globalP95Ms: glob.p95Ms, globalErrorRate: glob.errorRatePct,
        activeUsers: glob.activeUsers, aiRequestsPerMin: glob.aiRequestsPerMin,
      }});
    } catch(e){next(e);}
  });

  // Data fabric
  router.get("/connectors", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await DataFabricService.listConnectors({ kind, status }) });
    } catch(e){next(e);}
  });
  router.post("/connectors", validate({ body: connCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await DataFabricService.registerConnector(req.body) }); } catch(e){next(e);}
  });
  router.post("/connectors/:id/status", validate({ body: connStatus }), async (req, res, next) => {
    try {
      const c = await DataFabricService.setConnectorStatus(req.params.id, req.body.status);
      if (!c) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:c });
    } catch(e){next(e);}
  });
  router.get("/products", async (_req, res, next) => {
    try { res.json({ ok:true, data: await DataFabricService.listProducts() }); } catch(e){next(e);}
  });
  router.post("/products", validate({ body: dpCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await DataFabricService.publishProduct(req.body) }); } catch(e){next(e);}
  });
  router.get("/lineage", async (_req, res, next) => {
    try { res.json({ ok:true, data: await DataFabricService.listLineage() }); } catch(e){next(e);}
  });
  router.post("/lineage", validate({ body: lineageAdd }), async (req, res, next) => {
    try { res.json({ ok:true, data: await DataFabricService.addLineage(req.body) }); } catch(e){next(e);}
  });

  // Identity
  router.get("/principals", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await IdentityService.listPrincipals({ kind, status }) });
    } catch(e){next(e);}
  });
  router.post("/principals", validate({ body: princCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await IdentityService.createPrincipal(req.body) }); } catch(e){next(e);}
  });
  router.get("/idps", async (_req, res, next) => {
    try { res.json({ ok:true, data: await IdentityService.listIdps() }); } catch(e){next(e);}
  });
  router.post("/idps", validate({ body: idpCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await IdentityService.registerIdp(req.body) }); } catch(e){next(e);}
  });
  router.get("/service-accounts", async (_req, res, next) => {
    try { res.json({ ok:true, data: await IdentityService.listServiceAccounts() }); } catch(e){next(e);}
  });
  router.post("/service-accounts", validate({ body: saCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await IdentityService.createSa(req.body.name, req.body.scopes, req.body.createdBy, req.body.daysValid) }); } catch(e){next(e);}
  });

  // FinOps
  router.get("/accounts", async (req, res, next) => {
    try {
      const provider = typeof req.query.provider === "string" ? req.query.provider as any : undefined;
      res.json({ ok:true, data: await FinOpsService.listAccounts({ provider }) });
    } catch(e){next(e);}
  });
  router.post("/accounts", validate({ body: acctCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await FinOpsService.addAccount(req.body) }); } catch(e){next(e);}
  });
  router.get("/anomalies", async (req, res, next) => {
    try {
      const severity = typeof req.query.severity === "string" ? req.query.severity as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await FinOpsService.listAnomalies({ severity, status }) });
    } catch(e){next(e);}
  });
  router.post("/anomalies", validate({ body: anomCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await FinOpsService.addAnomaly(req.body) }); } catch(e){next(e);}
  });
  router.post("/anomalies/:id/ack", async (req, res, next) => {
    try {
      const a = await FinOpsService.acknowledge(req.params.id);
      if (!a) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:a });
    } catch(e){next(e);}
  });
  router.get("/optimizations", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await FinOpsService.listOptimizations({ status }) });
    } catch(e){next(e);}
  });
  router.post("/optimizations", validate({ body: optCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await FinOpsService.addOptimization(req.body) }); } catch(e){next(e);}
  });
  router.post("/optimizations/:id/apply", async (req, res, next) => {
    try {
      const o = await FinOpsService.applyOptimization(req.params.id);
      if (!o) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:o });
    } catch(e){next(e);}
  });

  // Resilience
  router.get("/incidents", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const severity = typeof req.query.severity === "string" ? req.query.severity as any : undefined;
      res.json({ ok:true, data: await ResilienceService.listIncidents({ status, severity }) });
    } catch(e){next(e);}
  });
  router.post("/incidents", validate({ body: incCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ResilienceService.openIncident(req.body) }); } catch(e){next(e);}
  });
  router.post("/incidents/:id/status", validate({ body: incUpdate }), async (req, res, next) => {
    try {
      const i = await ResilienceService.updateStatus(req.params.id, req.body.status, req.body.rca, req.body.commander);
      if (!i) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:i });
    } catch(e){next(e);}
  });
  router.get("/playbooks", async (_req, res, next) => {
    try { res.json({ ok:true, data: await ResilienceService.listPlaybooks() }); } catch(e){next(e);}
  });
  router.post("/playbooks", validate({ body: pbCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ResilienceService.addPlaybook(req.body) }); } catch(e){next(e);}
  });
  router.post("/playbooks/:id/run", async (req, res, next) => {
    try {
      const p = await ResilienceService.runPlaybook(req.params.id);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });
  router.get("/bcp", async (_req, res, next) => {
    try { res.json({ ok:true, data: await ResilienceService.listBcps() }); } catch(e){next(e);}
  });
  router.post("/bcp", validate({ body: bcpCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ResilienceService.addBcp(req.body) }); } catch(e){next(e);}
  });
  router.post("/bcp/:id/drill", validate({ body: z.object({ passed: z.boolean() }) }), async (req, res, next) => {
    try {
      const b = await ResilienceService.recordDrill(req.params.id, req.body.passed);
      if (!b) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:b });
    } catch(e){next(e);}
  });

  // Quality
  router.get("/scorecards", async (req, res, next) => {
    try {
      const modelId = typeof req.query.modelId === "string" ? req.query.modelId : undefined;
      res.json({ ok:true, data: await QualityService.listScorecards({ modelId }) });
    } catch(e){next(e);}
  });
  router.post("/scorecards", validate({ body: cardCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await QualityService.addScorecard(req.body) }); } catch(e){next(e);}
  });
  router.get("/eval-runs", async (req, res, next) => {
    try {
      const modelId = typeof req.query.modelId === "string" ? req.query.modelId : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await QualityService.listRuns({ modelId, status }) });
    } catch(e){next(e);}
  });
  router.post("/eval-runs", validate({ body: runStart }), async (req, res, next) => {
    try { res.json({ ok:true, data: await QualityService.startRun(req.body) }); } catch(e){next(e);}
  });

  // Ops Center
  router.get("/global-status", async (_req, res, next) => {
    try { res.json({ ok:true, data: await OpsCenterService.globalStatus() }); } catch(e){next(e);}
  });
  router.get("/kpis", async (_req, res, next) => {
    try { res.json({ ok:true, data: await OpsCenterService.listKpis() }); } catch(e){next(e);}
  });
}
