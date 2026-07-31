/**
 * Session 29 bootstrap — seed Enterprise Platform Services.
 * Slices 245–257: config, feature flags, runtime, policies,
 * tenants, licensing, billing, capabilities, ontology, blueprints.
 */
import { logger } from "../observability/logger.js";
import { ConfigService } from "./config.service.js";
import { FeatureFlagsService } from "./featureFlags.service.js";
import { PoliciesService } from "./policies.service.js";
import { TenantsService } from "./tenants.service.js";
import { LicensingService } from "./licensing.service.js";
import { BillingService } from "./billing.service.js";
import { CapabilitiesService } from "./capabilities.service.js";
import { OntologyService } from "./ontology.service.js";
import { BlueprintsService } from "./blueprints.service.js";

export async function bootstrapPlatformServices() {
  const existingConfigs = await ConfigService.list();
  if (existingConfigs.length > 0) {
    const flags = await FeatureFlagsService.list();
    const pols = await PoliciesService.list();
    const tens = await TenantsService.list();
    const lic = await LicensingService.list();
    const bill = await BillingService.list();
    const caps = await CapabilitiesService.list();
    const onto = await OntologyService.list();
    const bps = await BlueprintsService.list();
    logger.info("platform services already seeded", {
      configs: existingConfigs.length, flags: flags.length, policies: pols.length,
      tenants: tens.length, licenses: lic.length, billing: bill.length,
      capabilities: caps.length, ontology: onto.length, blueprints: bps.length,
    });
    return;
  }

  // ── Config entries (Slice 245 + 247) ─────────────────────────
  const configSeeds: Array<[string, any, string, any]> = [
    ["platform.name", "WINDELS AI OS", "Platform display name", {}],
    ["platform.timezone", "UTC", "Default org timezone", { tags: ["locale"] }],
    ["platform.locale", "en-US", "Default locale", { tags: ["locale"] }],
    ["platform.max_upload_mb", 100, "Max upload size (MB)", { valueType: "number", hotReload: true }],
    ["platform.session_timeout_min", 60, "Session timeout", { valueType: "number", hotReload: true }],
    ["ai.default_model", "claude-3.5-sonnet", "Default chat model", { hotReload: true }],
    ["ai.temperature", 0.3, "Default sampling temperature", { valueType: "number", hotReload: true }],
    ["ai.max_tokens", 4096, "Default max output tokens", { valueType: "number", hotReload: true }],
    ["ai.safety_filter", true, "Enable content safety filters", { valueType: "boolean", hotReload: true }],
    ["billing.currency", "USD", "Default billing currency", {}],
    ["billing.trial_days", 14, "Free trial length (days)", { valueType: "number" }],
    ["billing.grace_period_days", 7, "Dunning grace period", { valueType: "number" }],
    ["security.mfa_required", false, "Require MFA for all users", { valueType: "boolean", hotReload: true }],
    ["security.password_min_length", 12, "Minimum password length", { valueType: "number" }],
    ["security.session_sweep_min", 30, "Session sweep interval", { valueType: "number", hotReload: true }],
    ["observability.trace_sample_rate", 0.1, "Trace sampling rate", { valueType: "number", hotReload: true }],
    ["observability.retention_days", 30, "Log retention (days)", { valueType: "number" }],
    ["notifications.email_from", "platform@windels.ai", "From address for emails", { encrypted: false }],
    ["extensions.marketplace_enabled", true, "Enable marketplace installs", { valueType: "boolean", hotReload: true }],
    ["runtime.debug_mode", false, "Runtime debug flag", { valueType: "boolean", hotReload: true, source: "runtime" as const }],
    ["secrets.db_encryption_key", "dk-2F9aX9eR7p", "DB encryption KEK id", { encrypted: true }],
    ["rate_limit.global_per_min", 60, "Global API rate limit / min", { valueType: "number", hotReload: true }],
  ];
  for (const [key, value, desc, extra] of configSeeds) {
    const valueType = extra.valueType ?? (typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string");
    await ConfigService.upsert({
      key, scope: "global", valueType, value, description: desc,
      source: extra.source ?? "bootstrap",
      encrypted: !!extra.encrypted, hotReload: !!extra.hotReload,
      tags: extra.tags ?? [], updatedBy: "bootstrap",
    });
  }

  // ── Feature flags (Slice 246 + 253) ──────────────────────────
  const flagSeeds = [
    { key:"new-dashboard-ui", name:"New Dashboard UI", desc:"Redesigned dashboard with glassmorphism.", strategy:"boolean", enabled:true, pct:100 },
    { key:"ai-copilot", name:"AI Copilot Assistant", desc:"In-app copilot for all surfaces.", strategy:"percentage", enabled:true, pct:50 },
    { key:"advanced-analytics", name:"Advanced Analytics", desc:"Multi-dimensional analytics + cohorts.", strategy:"org-segment", enabled:false, pct:0, segments:["enterprise"] },
    { key:"dark-mode-v4", name:"Dark Mode v4 palette", desc:"Updated dark palette tokens.", strategy:"boolean", enabled:true, pct:100 },
    { key:"mobile-beta", name:"Mobile App Beta", desc:"iOS/Android companion beta.", strategy:"user-segment", enabled:false, pct:0, segments:["beta"] },
    { key:"workflow-v2", name:"Workflow Engine v2", desc:"Next-gen workflow runtime.", strategy:"percentage", enabled:true, pct:25 },
    { key:"kill-switch-payments", name:"Kill Switch: Payments", desc:"Emergency toggle for billing events.", strategy:"kill-switch", enabled:false, pct:0 },
    { key:"billing-self-serve", name:"Self-serve Billing", desc:"In-app plan upgrade/downgrade.", strategy:"boolean", enabled:true, pct:100 },
    { key:"sso-saml", name:"SSO SAML", desc:"SAML SSO for enterprise.", strategy:"tenant", enabled:false, pct:0 },
    { key:"audit-export", name:"Audit Log Export", desc:"CSV/SIEM audit export.", strategy:"boolean", enabled:true, pct:100 },
    { key:"rag-v2", name:"RAG v2 retrieval", desc:"Hybrid sparse+dense retrieval.", strategy:"percentage", enabled:true, pct:75 },
    { key:"multi-region", name:"Multi-region routing", desc:"Route to closest region.", strategy:"boolean", enabled:false, pct:0 },
    { key:"voice-agents", name:"Voice Agents GA", desc:"Real-time voice for agents.", strategy:"percentage", enabled:false, pct:10 },
    { key:"extension-runtime", name:"Extension Runtime v2", desc:"Sandboxed extension runtime.", strategy:"boolean", enabled:true, pct:100 },
    { key:"data-residency-eu", name:"EU Data Residency", desc:"Restrict PII to EU regions.", strategy:"tenant", enabled:false, pct:0 },
    { key:"dev-cli-oauth", name:"Dev CLI OAuth", desc:"OAuth device flow for CLI.", strategy:"boolean", enabled:true, pct:100 },
    { key:"ai-safety-redteam", name:"AI Red-team harness", desc:"Continuous red-teaming evals.", strategy:"boolean", enabled:true, pct:100 },
    { key:"desktop-sync", name:"Desktop sync v2", desc:"Improved desktop sync.", strategy:"percentage", enabled:true, pct:30 },
    { key:"feature-flag-rollback", name:"Instant rollback UI", desc:"One-click flag rollback.", strategy:"boolean", enabled:true, pct:100 },
    { key:"enterprise-blueprints", name:"Enterprise Blueprints", desc:"Solution blueprint library.", strategy:"boolean", enabled:true, pct:100 },
  ] as const;
  for (const f of flagSeeds) {
    await FeatureFlagsService.create({
      key: f.key, name: f.name, description: f.desc,
      status: f.enabled ? "active" : "paused",
      enabled: f.enabled, rolloutPct: f.pct,
      strategy: f.strategy as any,
      overrides: [], segments: (f as any).segments ?? [],
      tags: ["bootstrap"], owner: "platform",
    });
  }

  // ── Policies (Slice 248 + 254) ───────────────────────────────
  const policySeeds = [
    { key:"pci-no-export", name:"Block PCI export", desc:"Prevent PCI fields from being exported.", type:"compliance", effect:"block", priority:100,
      conditions:[{field:"action",op:"eq",value:"export"},{field:"dataset",op:"in",value:["pci","cards"]}], scope:"global" as const },
    { key:"eu-data-residency", name:"EU data residency", desc:"Block PII writes outside EU for EU tenants.", type:"data-residency", effect:"deny", priority:90,
      conditions:[{field:"tenantRegion",op:"eq",value:"eu"},{field:"targetRegion",op:"neq",value:"eu"}], scope:"tenant" as const },
    { key:"free-tier-ratelimit", name:"Free tier rate limit", desc:"Throttle free-tier tenants to 60 rpm.", type:"rate-limit", effect:"throttle", priority:50,
      conditions:[{field:"plan",op:"eq",value:"free"},{field:"rpm",op:"gt",value:60}], scope:"tenant" as const },
    { key:"quota-seats", name:"Seat quota enforcement", desc:"Deny seat additions beyond licensed limit.", type:"quota", effect:"deny", priority:80,
      conditions:[{field:"resource",op:"eq",value:"seats"},{field:"delta",op:"gt",value:0}], scope:"tenant" as const },
    { key:"retention-pii-90d", name:"PII 90-day retention", desc:"Auto-purge PII older than 90 days.", type:"retention", effect:"enforce", priority:40,
      conditions:[{field:"dataClass",op:"eq",value:"pii"},{field:"ageDays",op:"gte",value:90}], scope:"global" as const },
    { key:"content-safety", name:"Content safety filter", desc:"Block disallowed content via safety classifier.", type:"content-filter", effect:"block", priority:95,
      conditions:[{field:"content.unsafe",op:"eq",value:true}], scope:"global" as const },
    { key:"budget-daily-ai", name:"Daily AI budget", desc:"Throttle tenants exceeding daily AI spend.", type:"budget", effect:"throttle", priority:60,
      conditions:[{field:"spend.dailyUsd",op:"gte",value:1000}], scope:"tenant" as const },
    { key:"admin-approval-ext", name:"Admin approval for extensions", desc:"Enterprise extensions require admin approval.", type:"approval", effect:"enforce", priority:70,
      conditions:[{field:"extension.visibility",op:"eq",value:"enterprise"}], scope:"org" as const },
    { key:"audit-all-privileged", name:"Audit privileged ops", desc:"Audit-log all privilege escalations.", type:"access-control", effect:"audit", priority:20,
      conditions:[{field:"action",op:"in",value:["role.grant","user.impersonate","key.rotate"]}], scope:"global" as const },
    { key:"mfa-admin", name:"Admin MFA required", desc:"Deny admin actions without MFA.", type:"access-control", effect:"deny", priority:100,
      conditions:[{field:"role",op:"eq",value:"admin"},{field:"mfaVerified",op:"eq",value:false}], scope:"global" as const },
  ];
  for (const p of policySeeds) {
    await PoliciesService.create({
      key: p.key, name: p.name, description: p.desc,
      type: p.type as any, effect: p.effect as any, status: "active",
      priority: p.priority, conditions: p.conditions as any,
      scope: p.scope, owner: "platform",
    });
  }

  // ── Tenants (Slice 249 + 250) ────────────────────────────────
  const windels = await TenantsService.create({
    slug: "windels", name: "WINDELS", displayName: "WINDELS AI (Host)",
    plan: "enterprise", status: "active", isolation: "dedicated-vpc",
    region: "na-east", seats: 9999, dataResidency:["us","eu","apac"],
    ssoEnabled: true, customDomain: "app.windels.ai",
  });
  const demo = await TenantsService.create({
    slug: "acme-demo", name: "Acme Demo Corp", displayName: "Acme Demo",
    plan: "business", status: "active", isolation: "schema",
    region: "na-east", seats: 150, dataResidency:["us"],
    ssoEnabled: false,
  });
  const beta = await TenantsService.create({
    slug: "betacorp", name:"BetaCorp Industries", displayName:"BetaCorp",
    plan:"team", status:"provisioning", isolation:"shared",
    region:"eu-west", seats:25, dataResidency:["eu"], ssoEnabled: false,
  });

  // ── Licenses (Slice 251) ─────────────────────────────────────
  const lic1 = await LicensingService.issue({
    holder: "WINDELS AI", tenantId: windels.id, tier: "unlimited",
    seats: 9999, daysValid: 3650, features: ["*"],
    flags: { whiteLabel: true, dedicatedSupport: true, sso: true },
    capabilities: ["*"],
  });
  await LicensingService.issue({
    holder: "Acme Demo Corp", tenantId: demo.id, tier: "enterprise",
    seats: 150, daysValid: 365, features: ["core","pro","enterprise"],
  });
  await LicensingService.issue({
    holder: "BetaCorp Industries", tenantId: beta.id, tier: "pro",
    seats: 25, daysValid: 30, features: ["core","pro"],
  });

  // ── Billing (Slice 252) ──────────────────────────────────────
  await BillingService.openAccount({ tenantId: windels.id, plan:"enterprise", period:"annual", seats:250, lastFour:"4242" });
  await BillingService.openAccount({ tenantId: demo.id, plan:"scale", period:"monthly", seats:150, lastFour:"1111" });
  const betaBill = await BillingService.openAccount({ tenantId: beta.id, plan:"starter", period:"monthly", seats:25 });
  // mark one small account delinquent for the dashboard
  await BillingService.update(betaBill.id, { status: "delinquent", dunningLevel: 2 });

  // ── Capabilities (Slice 255) ─────────────────────────────────
  const capSeeds: Array<[string, string, string, number, number]> = [
    ["api.auth", "api", "auth-service", 45, 0.02],
    ["api.conversations", "api", "conversations", 180, 0.1],
    ["api.workflows", "api", "workflow-engine", 220, 0.3],
    ["api.billing", "api", "billing-service", 70, 0.05],
    ["api.extensions", "api", "extension-runtime", 95, 0.08],
    ["svc.agent-runtime", "service", "agent-runtime", 320, 0.4],
    ["svc.event-bus", "service", "event-bus", 25, 0.01],
    ["mod.crm", "module", "windels-crm", 120, 0.15],
    ["mod.erp", "module", "windels-erp", 180, 0.2],
    ["skill.sheet-analyst", "skill", "skills-service", 820, 0.5],
    ["skill.contract-reviewer", "skill", "skills-service", 2400, 1.2],
    ["agent.exec-briefing", "agent", "agent-runtime", 1800, 0.9],
    ["agent.sales-pioneer", "agent", "agent-runtime", 950, 1.1],
    ["wf.stripe-charge", "workflow", "workflow-engine", 160, 0.05],
    ["dash.revenue-kpis", "dashboard", "dashboard-service", 110, 0.02],
    ["model.claude-3.5", "model", "ai-gateway", 420, 0.7],
    ["model.gpt-4o", "model", "ai-gateway", 510, 0.8],
    ["storage.documents", "storage", "document-service", 60, 0.02],
    ["queue.tasks", "queue", "task-queue", 15, 0.01],
    ["event.audit", "event", "event-bus", 30, 0.01],
    ["integration.slack", "integration", "integrations", 240, 0.3],
    ["integration.stripe", "integration", "integrations", 200, 0.2],
  ];
  for (const [name, kind, producer, p95, err] of capSeeds) {
    await CapabilitiesService.register({
      name, kind: kind as any, version: "1.0.0", producer,
      consumers: [], health: "healthy",
      slaMs: kind === "queue" ? 100 : kind === "model" ? 2000 : 500,
      p95Ms: p95, errorRatePct: err,
      requestsPerMin: 900,
      deprecated: false,
    });
  }
  // one downstream service as down
  await CapabilitiesService.register({
    name: "integration.salesforce-legacy", kind: "integration", version: "0.9.0",
    producer: "integrations", consumers: ["windels-crm"], health: "down",
    p95Ms: 5000, errorRatePct: 62.0, requestsPerMin: 12, deprecated: true,
  });

  // ── Ontology (Slice 256) ─────────────────────────────────────
  const ontoRoots = [
    { uri:"windels:Entity", label:"Entity", color:"slate", icon:"◆", desc:"Base entity class.", props:[] as any[] },
  ];
  const ontoClasses = [
    { uri:"windels:User", label:"User", parent:"windels:Entity", color:"azure", icon:"👤", desc:"Platform user.",
      props:[{name:"email",type:"string",required:true,description:"primary email"},{name:"displayName",type:"string",required:true,description:"display name"},{name:"role",type:"enum",required:false,description:"system role"}] },
    { uri:"windels:Organization", label:"Organization", parent:"windels:Entity", color:"violet", icon:"🏢", desc:"Tenant organization.",
      props:[{name:"name",type:"string",required:true,description:"legal name"},{name:"plan",type:"enum",required:true,description:"billing plan"}] },
    { uri:"windels:Agent", label:"AI Agent", parent:"windels:Entity", color:"fuchsia", icon:"🤖", desc:"Autonomous AI agent.",
      props:[{name:"model",type:"string",required:true,description:"LLM model id"},{name:"department",type:"enum",required:false,description:"dept"}] },
    { uri:"windels:Skill", label:"AI Skill", parent:"windels:Entity", color:"emerald", icon:"🧠", desc:"Reusable AI skill.",
      props:[{name:"category",type:"enum",required:true,description:"skill category"},{name:"avgLatencyMs",type:"number",required:false,description:"p50 latency"}] },
    { uri:"windels:Workflow", label:"Workflow", parent:"windels:Entity", color:"crimson", icon:"🔀", desc:"Composed workflow.",
      props:[{name:"trigger",type:"string",required:true,description:"trigger type"},{name:"status",type:"enum",required:false,description:"wf status"}] },
    { uri:"windels:Document", label:"Document", parent:"windels:Entity", color:"teal", icon:"📄", desc:"Stored document.",
      props:[{name:"mime",type:"string",required:true,description:"content type"},{name:"sizeKb",type:"number",required:false,description:"size"}] },
    { uri:"windels:Conversation", label:"Conversation", parent:"windels:Entity", color:"amber", icon:"💬", desc:"Chat conversation.",
      props:[{name:"channel",type:"enum",required:true,description:"channel"},{name:"agentId",type:"ref",required:false,description:"bound agent",refClass:"windels:Agent"}] },
    { uri:"windels:Message", label:"Message", parent:"windels:Entity", color:"azure", icon:"✉️", desc:"Conversation message.",
      props:[{name:"role",type:"enum",required:true,description:"user|assistant|system"},{name:"content",type:"string",required:true,description:"text"},{name:"conversationId",type:"ref",required:true,refClass:"windels:Conversation",description:"parent conversation"}] },
    { uri:"windels:Task", label:"Task", parent:"windels:Entity", color:"violet", icon:"✅", desc:"Agent or user task.",
      props:[{name:"status",type:"enum",required:true,description:"task status"},{name:"assigneeId",type:"ref",required:false,refClass:"windels:Agent",description:"assignee"}] },
    { uri:"windels:Invoice", label:"Invoice", parent:"windels:Entity", color:"emerald", icon:"🧾", desc:"Billing invoice.",
      props:[{name:"amount",type:"number",required:true,description:"total"},{name:"status",type:"enum",required:true,description:"payment status"}] },
    { uri:"windels:Customer", label:"Customer", parent:"windels:Entity", color:"fuchsia", icon:"🧑‍💼", desc:"CRM customer.",
      props:[{name:"email",type:"string",required:false,description:"contact email"},{name:"stage",type:"enum",required:false,description:"lifecycle stage"}] },
    { uri:"windels:Lead", label:"Lead", parent:"windels:Customer", color:"amber", icon:"🎯", desc:"Sales lead.",
      props:[{name:"source",type:"string",required:false,description:"lead source"},{name:"score",type:"number",required:false,description:"lead score"}] },
    { uri:"windels:Deal", label:"Deal", parent:"windels:Entity", color:"crimson", icon:"💼", desc:"Sales deal/opportunity.",
      props:[{name:"amount",type:"number",required:false,description:"deal amount"},{name:"stage",type:"enum",required:true,description:"pipeline stage"}] },
    { uri:"windels:Product", label:"Product", parent:"windels:Entity", color:"teal", icon:"📦", desc:"Sellable product.",
      props:[{name:"sku",type:"string",required:true,description:"sku"},{name:"price",type:"number",required:true,description:"unit price"}] },
    { uri:"windels:Project", label:"Project", parent:"windels:Entity", color:"azure", icon:"📁", desc:"Delivery project.",
      props:[{name:"startDate",type:"date",required:false,description:"start"},{name:"status",type:"enum",required:true,description:"status"}] },
    { uri:"windels:Incident", label:"Incident", parent:"windels:Entity", color:"crimson", icon:"🚨", desc:"Ops incident.",
      props:[{name:"severity",type:"enum",required:true,description:"sev1-4"},{name:"status",type:"enum",required:true,description:"status"}] },
    { uri:"windels:Dashboard", label:"Dashboard", parent:"windels:Entity", color:"amber", icon:"📊", desc:"Analytics dashboard.",
      props:[{name:"layout",type:"enum",required:false,description:"layout type"},{name:"refreshSec",type:"number",required:false,description:"refresh rate"}] },
    { uri:"windels:Extension", label:"Extension", parent:"windels:Entity", color:"violet", icon:"🧩", desc:"Platform extension.",
      props:[{name:"kind",type:"enum",required:true,description:"extension kind"},{name:"version",type:"string",required:true,description:"semver"}] },
    { uri:"windels:Blueprint", label:"Solution Blueprint", parent:"windels:Entity", color:"emerald", icon:"📐", desc:"Pre-composed solution blueprint.",
      props:[{name:"category",type:"enum",required:true,description:"blueprint category"},{name:"compatibility",type:"enum",required:true,description:"tier"}] },
    { uri:"windels:Policy", label:"Policy", parent:"windels:Entity", color:"slate", icon:"⚖️", desc:"Governance policy.",
      props:[{name:"effect",type:"enum",required:true,description:"allow|deny|..."},{name:"priority",type:"number",required:false,description:"priority"}] },
  ];
  for (const o of ontoRoots) {
    await OntologyService.define({
      uri: o.uri, label: o.label, description: o.desc, color: o.color as any, icon: o.icon,
      properties: o.props, aliases: [],
    });
  }
  for (const o of ontoClasses) {
    await OntologyService.define({
      uri: o.uri, label: o.label, parentUri: o.parent, description: o.desc, color: o.color as any, icon: o.icon,
      properties: o.props as any, aliases: [],
    });
  }

  // ── Blueprints (Slice 257) ───────────────────────────────────
  const blueprintSeeds = [
    { slug:"saas-starter", name:"SaaS Startup Stack", tagline:"End-to-end SaaS launch kit.", desc:"CRM, billing, support, exec agent. Launch in under an hour.",
      cat:"startup", ind:undefined, compat:"starter", icon:"🚀", color:"azure", mods:["windels-crm","billing-cloud","growth-marketing"],
      ags:["sales-pioneer","support-sentinel"], sks:["sheet-analyst","market-research"], wfs:["stripe-trigger","slack-msg-action"], dbs:["revenue-kpis"], min:35, cert:"official" as const },
    { slug:"financial-compliance", name:"Financial Compliance Suite", tagline:"SOX-grade finance & audit.", desc:"FinOps, billing, audit logging, retention policies.",
      cat:"compliance", ind:"banking", compat:"enterprise", icon:"🏦", color:"violet", mods:["fin-ops","billing-cloud"],
      ags:["fin-analyst"], sks:["tax-advisor","financial-modeler"], wfs:["human-approval"], dbs:["revenue-kpis","security-posture"], min:90, cert:"official" as const },
    { slug:"healthcare-clinic", name:"Healthcare Clinic", tagline:"HIPAA-ready clinic in a box.", desc:"Patient records, telehealth, coding, compliance.",
      cat:"industry", ind:"healthcare", compat:"enterprise", icon:"🏥", color:"emerald", mods:["healthcare-records"],
      ags:["support-sentinel"], sks:["hc-coding"], wfs:["human-approval"], dbs:["support-trends"], min:120, cert:"partner" as const },
    { slug:"ai-sales-floor", name:"AI Sales Floor", tagline:"SDRs + RevOps on day one.", desc:"Sales Pioneer agents, CRM, marketing journeys, revenue KPIs.",
      cat:"ai-workforce", ind:undefined, compat:"growth", icon:"📞", color:"fuchsia", mods:["windels-crm","growth-marketing"],
      ags:["sales-pioneer","exec-briefing"], sks:["market-research","sheet-analyst"], wfs:["ai-transform","cron-trigger"], dbs:["revenue-kpis"], min:25, cert:"official" as const },
    { slug:"enterprise-migration", name:"Enterprise Migration Pack", tagline:"Lift & shift legacy systems.", desc:"Legacy connectors, governance, dashboards, workflow orchestration.",
      cat:"migration", ind:undefined, compat:"enterprise", icon:"🔀", color:"crimson", mods:["windels-erp"],
      ags:["code-reviewer"], sks:["eng-calculator"], wfs:["ai-transform","human-approval"], dbs:["engineering-pulse","security-posture"], min:240, cert:"partner" as const },
    { slug:"ai-research-lab", name:"AI Research Lab", tagline:"Experiments, models, evals.", desc:"Agent comms, QA, observability, RAG v2, red-team harness.",
      cat:"enterprise", ind:undefined, compat:"enterprise", icon:"🔬", color:"teal", mods:[],
      ags:["code-reviewer"], sks:["market-research","eng-calculator"], wfs:["ai-transform"], dbs:["engineering-pulse"], min:60, cert:"official" as const },
  ];
  for (const b of blueprintSeeds) {
    await BlueprintsService.publish({
      slug:b.slug, name:b.name, tagline:b.tagline, description:b.desc,
      category:b.cat as any, industry:b.ind, compatibility:b.compat as any,
      version:"1.0.0", author:"windels-team", icon:b.icon, color:b.color as any,
      slices: b.mods.map(m=>({id:m,name:m,required:true,config:{}})),
      modules:b.mods, agents:b.ags, skills:b.sks, workflows:b.wfs, dashboards:b.dbs,
      estimatedDeployMin:b.min, certified:b.cert,
    });
  }

  // ── Summary log ───────────────────────────────────────────────
  const [flags, pols, tens, lics, bills, caps, ontos, bps] = await Promise.all([
    FeatureFlagsService.list(), PoliciesService.list(), TenantsService.list(),
    LicensingService.list(), BillingService.list(), CapabilitiesService.list(),
    OntologyService.list(), BlueprintsService.list(),
  ]);
  logger.info("platform services bootstrapped", {
    configs: configSeeds.length, flags: flags.length, policies: pols.length,
    tenants: tens.length, licenses: lics.length, billing: bills.length,
    capabilities: caps.length, ontology: ontos.length, blueprints: bps.length,
  });
}
