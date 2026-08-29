/**
 * Session 31 bootstrap — seed Enterprise Foundation.
 * Slices 271-284: Data Fabric, Identity, FinOps, Resilience, AI Quality, Ops Center.
 */
import { logger } from "../observability/logger.js";
import { DataFabricService } from "./dataFabric.service.js";
import { IdentityService } from "./identity.service.js";
import { FinOpsService } from "./finops.service.js";
import { ResilienceService } from "./resilience.service.js";
import { QualityService } from "./quality.service.js";
import { OpsCenterService } from "./opsCenter.service.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

export async function bootstrapEnterpriseFoundation() {
  // Synthetic demo records are opt-in; see config/demoData.ts.
  if (!demoDataEnabled()) return skipDemoSeed("enterprise-foundation");

  const conns = await DataFabricService.listConnectors();
  if (conns.length > 0) {
    const dps = await DataFabricService.listProducts();
    const ps = await IdentityService.listPrincipals();
    const idps = await IdentityService.listIdps();
    const accts = await FinOpsService.listAccounts();
    const incs = await ResilienceService.listIncidents();
    const cards = await QualityService.listScorecards();
    logger.info("enterprise foundation already seeded", {
      connectors: conns.length, products: dps.length, principals: ps.length, idps: idps.length,
      accounts: accts.length, incidents: incs.length, scorecards: cards.length,
    });
    await OpsCenterService.seed();
    return;
  }

  // ── Data Fabric connectors (271) ─────────────────────────────
  const connSeeds = [
    { name:"prod-postgres", kind:"postgres", region:"na-east", host:"db.windels.internal", database:"windels_prod", owner:"data-platform", tags:["prod","oltp"] },
    { name:"warehouse-snowflake", kind:"snowflake", region:"na-east", host:"windels.snowflakecomputing.com", database:"PROD_WH", owner:"analytics", tags:["warehouse","analytics"] },
    { name:"bigquery-usage", kind:"bigquery", region:"us-central1", owner:"platform", tags:["usage","ml"] },
    { name:"s3-data-lake", kind:"s3", region:"us-east-1", owner:"data-platform", tags:["lake"] },
    { name:"kafka-events", kind:"kafka", region:"na-east", host:"kafka.windels.internal:9092", owner:"platform", tags:["events","streaming"] },
    { name:"salesforce-sync", kind:"salesforce", region:"na-east", host:"login.salesforce.com", owner:"revops", tags:["crm"] },
    { name:"workday-hr", kind:"workday", region:"na-east", host:"wd3.myworkday.com", owner:"people", tags:["hr","scim"] },
    { name:"sap-erp", kind:"sap", region:"eu-west", owner:"finance", tags:["erp"] },
    { name:"azure-blob-eu", kind:"azure-blob", region:"eu-west", owner:"eu-team", tags:["eu","residency"] },
    { name:"redshift-cdp", kind:"redshift", region:"na-east", owner:"growth", tags:["cdp"] },
    { name:"databricks-ml", kind:"databricks", region:"na-east", owner:"ml-platform", tags:["ml","feature-store"] },
    { name:"rest-partner-api", kind:"api", region:"na-east", host:"https://partners.windels.ai", owner:"bd", tags:["partner"] },
  ] as const;
  const connObjs = [];
  for (const c of connSeeds as unknown as any[]) {
    const co = await DataFabricService.registerConnector({
      name:c.name, kind:c.kind, status: "connected",
      region:c.region, host:c.host, database:c.database, owner:c.owner, tags:c.tags,
    });
    // set backfill metrics
    co.datasets = 28;
    co.rowsProcessed24h = 120_000_000;
    co.bytesProcessed24h = Math.floor(co.rowsProcessed24h * 0.9);
    const redis = (await import("../db/redis.js")).redisCmd;
    await redis.set(`ef:conn:${co.id}`, JSON.stringify(co));
    connObjs.push(co);
  }
  const dpSeeds = [
    { name:"Customer 360", domain:"growth", desc:"Unified customer view from CRM + CDP + product.", owner:"growth", sources:[connObjs[0].id, connObjs[5].id, connObjs[9].id], schema:"customer", freshnessMinutes:60, certified:"official", sla:"99.9%" },
    { name:"Financial Close", domain:"finance", desc:"GL close package from ERP + warehouse.", owner:"finance", sources:[connObjs[1].id, connObjs[7].id], schema:"finance", freshnessMinutes:1440, certified:"official", sla:"99.5%" },
    { name:"ML Feature Store", domain:"ml", desc:"Feature tables for model training/serving.", owner:"ml-platform", sources:[connObjs[2].id, connObjs[10].id], schema:"ml_features", freshnessMinutes:15, certified:"official", sla:"99.95%" },
    { name:"Product Analytics", domain:"product", desc:"Event + clickstream for product team.", owner:"product", sources:[connObjs[4].id], schema:"events", freshnessMinutes:5, certified:"official", sla:"99.9%" },
    { name:"HR Master", domain:"people", desc:"Directory + workforce planning from Workday.", owner:"people", sources:[connObjs[6].id], schema:"hr", freshnessMinutes:60, certified:"official", sla:"99.5%" },
    { name:"EU Data Residency Set", domain:"compliance", desc:"PII-restricted EU-only datasets.", owner:"compliance", sources:[connObjs[8].id], schema:"eu_pii", freshnessMinutes:60, certified:"official", sla:"99.9%" },
  ];
  const dpObjs = [];
  for (const d of dpSeeds as any[]) {
    const dp = await DataFabricService.publishProduct({
      name:d.name, domain:d.domain, description:d.desc, owner:d.owner, sources:d.sources,
      schema:d.schema, freshnessMinutes:d.freshnessMinutes, certified:d.certified, sla:d.sla,
    });
    dp.rows = 4_000_000;
    dp.consumers = 35;
    const redis = (await import("../db/redis.js")).redisCmd;
    await redis.set(`ef:dp:${dp.id}`, JSON.stringify(dp));
    dpObjs.push(dp);
  }
  for (const [from,to,type,job] of [
    [connObjs[0].id,dpObjs[0].id,"ingest","sync-pg-crm"],
    [connObjs[5].id,dpObjs[0].id,"ingest","sync-sfdc"],
    [connObjs[7].id,dpObjs[1].id,"ingest","gl-sap-sync"],
    [connObjs[10].id,dpObjs[2].id,"transform","materialize-features"],
    [connObjs[4].id,dpObjs[3].id,"ingest","event-pump"],
    [dpObjs[2].id,"model-training","serve","serve-training"],
    [connObjs[8].id,dpObjs[5].id,"ingest","eu-restricted-sync"],
  ] as const) {
    await DataFabricService.addLineage({ from, to, type, job, rows: 2_000_000 });
  }

  // ── Identity (272-274) ───────────────────────────────────────
  const idpSeeds = [
    { name:"WINDELS Local", kind:"local", domain:"windels.ai", status:"active", scimEnabled:false, usersSynced:1 },
    { name:"Google Workspace", kind:"google", domain:"windels.ai", status:"active", ssoUrl:"https://accounts.google.com/o/saml2", scimEnabled:true, usersSynced:420 },
    { name:"Microsoft Entra", kind:"microsoft", domain:"windels.ai", status:"active", ssoUrl:"https://login.microsoftonline.com/windels/saml2", scimEnabled:true, usersSynced:380 },
    { name:"Okta Enterprise", kind:"okta", domain:"windels.ai", status:"active", ssoUrl:"https://windels.okta.com", scimEnabled:true, usersSynced:510 },
    { name:"Customer OIDC", kind:"oidc", domain:"customers.windels.ai", status:"active", ssoUrl:"https://auth.windels.ai", scimEnabled:false, usersSynced:182_400 },
    { name:"Partner SCIM", kind:"scim", domain:"partners.windels.ai", status:"provisioning", scimEnabled:true, usersSynced:42 },
  ];
  for (const i of idpSeeds) {
    const idp = await IdentityService.registerIdp({ ...i, kind: i.kind as any, status: i.status as any });
    idp.usersSynced = i.usersSynced;
    idp.lastSyncAt = new Date(Date.now()-900_000).toISOString();
    const redis = (await import("../db/redis.js")).redisCmd;
    await redis.set(`ef:idp:${idp.id}`, JSON.stringify(idp));
  }
  // sample human, service, AI principals
  await IdentityService.createPrincipal({ principalId:"u_admin", kind:"human", displayName:"Super Admin", email:"admin@windels.ai", provider:"local", tenantId:"windels", status:"active", mfaEnabled:true, scopes:["*"], groups:["admin","super-admin"], riskScore:5, lastLoginAt:new Date().toISOString() });
  for (let i=0;i<40;i++) {
    await IdentityService.createPrincipal({
      principalId:`u_${1000+i}`, kind:"human", displayName:`Employee ${i+1}`, email:`emp${i+1}@windels.ai`,
      provider:(["google","microsoft","okta"] as const)[i%3] as any, tenantId:"windels", status:"active",
      mfaEnabled: true, scopes:["read:org"], groups:[`team-${i%8}`],
      lastLoginAt: new Date(Date.now()-2*86400_000).toISOString(),
    });
  }
  for (let i=0;i<12;i++) {
    await IdentityService.createPrincipal({ principalId:`sa_${i}`, kind:"service", displayName:`service-${i}`, provider:"local", tenantId:"windels", status:"active", mfaEnabled:false, scopes:[["read","write","admin"][i%3]], groups:[], lastRotatedAt: new Date(Date.now()-15*86400_000).toISOString() } as any);
  }
  for (let i=0;i<8;i++) {
    await IdentityService.createPrincipal({
      principalId:`ai_${i}`, kind:"ai-agent", displayName:`AI Agent ${i+1}`, provider:"windels-federation",
      tenantId:"windels", status:"active", mfaEnabled:false, scopes:["invoke:llm","read:memory"], groups:[],
      aiClass: (["trusted","sandboxed","read-only"] as const)[i%3], modelId:`model-${i}`, agentId:`agent-${i}`, riskScore: 20+i*4,
    });
  }
  for (let i=0;i<3;i++) await IdentityService.createSa(`deploy-key-${i+1}`, ["read:infra","write:deploy"], "sre", 90);

  // ── FinOps (275-277) ─────────────────────────────────────────
  const accounts = [
    { provider:"aws", name:"AWS prod", accountId:"1234-5678", region:"us-east-1", mtd:184_000, forecast:240_000, budget:250_000, trendPct:6.2, status:"on-track", currency:"USD" },
    { provider:"aws", name:"AWS eu", accountId:"1234-5679", region:"eu-west-1", mtd:62_000, forecast:82_000, budget:90_000, trendPct:2.1, status:"on-track", currency:"USD" },
    { provider:"gcp", name:"GCP ml", accountId:"windels-gcp", region:"us-central1", mtd:41_000, forecast:58_000, budget:50_000, trendPct:18.4, status:"over", currency:"USD" },
    { provider:"azure", name:"Azure EU", accountId:"az-windels-eu", region:"eu-west", mtd:28_000, forecast:34_000, budget:40_000, trendPct:-3.4, status:"under", currency:"USD" },
    { provider:"windels", name:"Windels Hosted", accountId:"internal", region:"multi", mtd:46_000, forecast:62_000, budget:65_000, trendPct:4.0, status:"on-track", currency:"USD" },
    { provider:"on-prem", name:"SaaS stack", accountId:"saas", region:"global", mtd:38_000, forecast:38_000, budget:45_000, trendPct:0.5, status:"on-track", currency:"USD" },
  ];
  for (const a of accounts as any[]) await FinOpsService.addAccount({
    provider:a.provider, name:a.name, accountId:a.accountId, region:a.region,
    monthToDate:a.mtd, forecast:a.forecast, budget:a.budget,
    trendPct:a.trendPct, status:a.status, currency:a.currency,
  });

  await FinOpsService.addAnomaly({ provider:"gcp", service:"Vertex AI Training", category:"ml", expectedAmount:8_000, actualAmount:21_400, deltaPct:167, severity:"critical" });
  await FinOpsService.addAnomaly({ provider:"aws", service:"S3 Cross-region", category:"network", expectedAmount:12_000, actualAmount:17_800, deltaPct:48, severity:"warn" });
  await FinOpsService.addAnomaly({ provider:"windels", service:"Inference Cache", category:"compute", expectedAmount:6_000, actualAmount:6_400, deltaPct:6, severity:"info" });

  const opts = [
    { title:"Rightsize idle GPU nodes", provider:"aws", category:"compute", resource:"g5.2xlarge ASG", region:"us-east-1", savingMonthly:18400, effort:"low", risk:"low", status:"recommended", description:"Scale down 12 idle GPU nodes running outside business hours." },
    { title:"Commit to 1-yr SageMaker", provider:"aws", category:"ml", resource:"SageMaker endpoints", region:"us-east-1", savingMonthly:9200, effort:"medium", risk:"medium", status:"recommended", description:"Convert 60% of ml.c6g to 1-yr reserved." },
    { title:"Move cold logs to Glacier", provider:"aws", category:"storage", resource:"CloudWatch Logs", region:"us-east-1", savingMonthly:4200, effort:"low", risk:"low", status:"recommended", description:"Transition logs >90d to Glacier." },
    { title:"Delete orphaned Persistent Disks", provider:"gcp", category:"storage", resource:"pd-ssd", region:"us-central1", savingMonthly:3100, effort:"low", risk:"low", status:"recommended", description:"Remove 47 unattached PDs." },
    { title:"Enable VPC Flow Logs sampling", provider:"aws", category:"network", resource:"VPC Flow Logs", region:"us-east-1", savingMonthly:2200, effort:"medium", risk:"medium", status:"recommended", description:"Sample at 20% instead of 100%." },
    { title:"Reserved BigQuery slots", provider:"gcp", category:"database", resource:"BigQuery slots", region:"us-central1", savingMonthly:5600, effort:"medium", risk:"low", status:"applied", description:"Convert flex slots to baseline commitments." },
    { title:"Scale staging replicas overnight", provider:"windels", category:"compute", resource:"k8s-staging", region:"na-east", savingMonthly:1800, effort:"low", risk:"low", status:"applied", description:"Scale staging to 1 replica between 8pm-6am." },
    { title:"Decommission legacy Redis cluster", provider:"aws", category:"database", resource:"elasticache-old", region:"na-east", savingMonthly:1100, effort:"high", risk:"medium", status:"dismissed", description:"Migration blocked by legacy audit service." },
  ];
  for (const o of opts as any[]) await FinOpsService.addOptimization({
    title:o.title, provider:o.provider, category:o.category, resource:o.resource,
    region:o.region, savingMonthly:o.savingMonthly, effort:o.effort, risk:o.risk,
    status:o.status, description:o.description,
  });

  // ── Resilience (278-280) ─────────────────────────────────────
  await ResilienceService.openIncident({ title:"Elevated latency on EU inference fleet", severity:"sev2", service:"inference-router", region:"eu-west", impactedCustomers:2400, commander:"oncall-sre" });
  await ResilienceService.openIncident({ title:"Data sync delay between Salesforce and CDP", severity:"sev3", service:"cdp-sync", region:"na-east", impactedCustomers:0, commander:"oncall-data" });
  const sev1 = await ResilienceService.openIncident({ title:"Identity provider failover drill", severity:"sev4", service:"auth", region:"global", impactedCustomers:0, commander:"sre-dr" });
  await ResilienceService.updateStatus(sev1.id, "resolved", "drill complete", "sre-dr");

  const pb = [
    { name:"Restart unhealthy pods", trigger:"pod_crashloop", action:"kubectl rollout restart deploy", autoRun:true, runsLast30d:42, successRatePct:92, avgResolveSec:38, description:"Rollout restart failing deployments." },
    { name:"Failover read replicas", trigger:"db_replica_lag_high", action:"pg_failover", autoRun:false, runsLast30d:3, successRatePct:100, avgResolveSec:95, description:"Promote healthiest replica." },
    { name:"Evict noisy-neighbor pods", trigger:"node_cpu_pressure", action:"drain+cordon", autoRun:true, runsLast30d:18, successRatePct:84, avgResolveSec:120, description:"Cordon high-CPU nodes and reschedule." },
    { name:"Throttle abusive tenant", trigger:"rate_limit_breach", action:"edge-throttle", autoRun:true, runsLast30d:26, successRatePct:100, avgResolveSec:12, description:"Apply 429 throttling at edge." },
    { name:"Roll back bad deploy", trigger:"error_spike_post_deploy", action:"argo rollback", autoRun:false, runsLast30d:2, successRatePct:100, avgResolveSec:180, description:"Roll back most recent rollout." },
    { name:"Resize autoscaling group", trigger:"queue_backlog", action:"asg-scale-out", autoRun:true, runsLast30d:14, successRatePct:96, avgResolveSec:68, description:"Scale out workers when backlog exceeds threshold." },
  ];
  for (const p of pb) await ResilienceService.addPlaybook(p);

  const bcps = [
    { name:"Global platform outage", rtoMinutes:60, rpoMinutes:15, criticalSystems:["auth","api","db-primary","inference-router"], failoverRegion:"na-west", owner:"sre", status:"ready" },
    { name:"EU data sovereignty failover", rtoMinutes:120, rpoMinutes:30, criticalSystems:["api-eu","pg-eu","s3-eu"], failoverRegion:"eu-central", owner:"compliance", status:"ready" },
    { name:"Payment processor outage", rtoMinutes:30, rpoMinutes:5, criticalSystems:["billing","webhooks"], failoverRegion:"active-active", owner:"payments", status:"drill-scheduled" },
    { name:"Identity provider outage", rtoMinutes:15, rpoMinutes:5, criticalSystems:["auth"], failoverRegion:"multi-active", owner:"identity", status:"ready" },
    { name:"AI model regression", rtoMinutes:45, rpoMinutes:0, criticalSystems:["inference-router"], failoverRegion:"model-fallback", owner:"ml-platform", status:"ready" },
    { name:"Region-wide network partition", rtoMinutes:240, rpoMinutes:60, criticalSystems:["api","db","events"], failoverRegion:"na-west", owner:"sre", status:"needs-updating" },
  ];
  for (const b of bcps) {
    const plan = await ResilienceService.addBcp({ ...b, status:b.status as any });
    if (b.status === "ready") await ResilienceService.recordDrill(plan.id, true);
  }

  // ── AI Quality (281-282) ─────────────────────────────────────
  const models = ["claude-3.5-sonnet","gpt-4o","gemini-1.5-pro","mistral-large-2","llama-3.1-70b","windels-routing-llm","text-embedding-3-large"];
  for (const m of models) {
    const scores = {
      accuracy: 89,
      groundedness: 89,
      relevance: 91,
      safety: 94,
      hallucination: 93,
      latency: 82,
      cost: 76,
      bias: 91,
    };
    const avg = Object.values(scores).reduce((a,b)=>a+b,0)/Object.values(scores).length;
    await QualityService.addScorecard({
      modelId:m, modelName:m, evaluator:"auto-red-team+llm-judge", dataset:"golden-set-v4",
      samples: 1200, scores,
      passPct: +avg.toFixed(1), regression: false, approved: avg>=85,
    });
  }
  for (let i=0;i<6;i++) {
    await QualityService.startRun({
      name:`eval-run-${i+1}`, modelId: models[i%models.length], dataset:["golden-v4","red-team-b","contract-set","multiling"][i%4],
      dimensions: ["accuracy","groundedness","relevance","safety"],
      triggeredBy: i<3?"cron":"manual",
    });
  }

  // ── Ops Center (283+284) ─────────────────────────────────────
  await OpsCenterService.seed();

  // ── Summary log ───────────────────────────────────────────────
  const [fab, idn, fin, res, ql] = await Promise.all([
    DataFabricService.summary(), IdentityService.summary(), FinOpsService.summary(),
    ResilienceService.summary(), QualityService.summary(),
  ]);
  logger.info("enterprise foundation bootstrapped", {
    connectors: fab.connectors, products: fab.dataProducts,
    principals: idn.principals, idps: idn.idps, aiAgents: idn.aiAgents,
    finAccounts: fin.providers, anomalies: fin.anomaliesOpen,
    incidents: res.activeIncidents, playbooks: res.autoHealingPlaybooks, bcps: res.bcpPlans,
    scorecards: ql.qualityScorecards, evalRuns: ql.evalRuns,
  });
}
