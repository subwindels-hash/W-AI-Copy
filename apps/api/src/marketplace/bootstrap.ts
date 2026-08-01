/**
 * Enterprise Marketplace, Digital Twin & Simulation bootstrap (Slices 291-294) — 10000ms slot
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { SkillsService } from "./skills.service.js";
import { DigitalTwinsService } from "./digitalTwins.service.js";
import { SimulationService } from "./simulation.service.js";
import { AppStoreService } from "./appStore.service.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

export async function bootstrapMarketplace(logger?: any): Promise<void> {
  // Synthetic demo records are opt-in; see config/demoData.ts.
  if (!demoDataEnabled()) return skipDemoSeed("marketplace", logger);

  const existing = await redis.zrange("mk:skills", 0, -1);
  if (existing.length > 0) {
    logger?.info("[marketplace] bootstrap skipped — already seeded", { skills: existing.length });
    return;
  }

  // ----- Slice 291 — Skills marketplace -----
  const skillSeeds = [
    { name: "Spreadsheet Analyst", slug: "spreadsheet-analyst", cat: "spreadsheet", pub: "WINDELS", ver: "1.2.0", summary: "Analyze Excel/Google Sheets workbooks, detect errors, build pivot narratives.", tags: ["excel","sheets","finance"], price: "free", color: "#10B981", emoji: "📊", caps: ["code-interpreter","file-read"] },
    { name: "Contract Review", slug: "contract-review", cat: "contract-review", pub: "WINDELS Legal", ver: "2.0.1", summary: "Redline contracts, flag risky clauses, compare against playbook.", tags: ["legal","nda","msa"], price: "subscription", priceUsd: 49, color: "#8B5CF6", emoji: "📝", caps: ["long-context","doc-parse"], perms: ["doc.read"] },
    { name: "Tax Analysis", slug: "tax-analysis", cat: "tax", pub: "WINDELS Finance", ver: "1.0.4", summary: "Multi-jurisdiction tax computation, deduction suggestions, audit prep.", tags: ["tax","finance"], price: "subscription", priceUsd: 99, color: "#F59E0B", emoji: "🧾", caps: ["reasoning","tabular"], perms: ["fin.read"] },
    { name: "Engineering Calculator", slug: "eng-calc", cat: "engineering-calc", pub: "WINDELS Engineering", ver: "1.5.0", summary: "Structural/thermal/electrical engineering calculations with units.", tags: ["engineering","calc","physics"], price: "free", color: "#14B8A6", emoji: "🧮", caps: ["code-interpreter"], perms: [] },
    { name: "CAD Assistant", slug: "cad-assistant", cat: "cad", pub: "WINDELS Design", ver: "0.9.3", summary: "BOM generation, GD&T review, CAD-file QA, manufacturability hints.", tags: ["cad","manufacturing"], price: "subscription", priceUsd: 79, color: "#3B82F6", emoji: "📐", caps: ["file-read","vision"], perms: ["fs.read"] },
    { name: "Procurement Evaluator", slug: "procurement-eval", cat: "procurement", pub: "WINDELS Ops", ver: "1.1.0", summary: "Supplier RFP scoring, risk scoring, savings analysis.", tags: ["procurement","rfp"], price: "free", color: "#D946EF", emoji: "🛒", caps: ["reasoning"], perms: ["procurement.read"] },
    { name: "Financial Modeler", slug: "fin-model", cat: "financial-modeling", pub: "WINDELS Finance", ver: "2.1.0", summary: "Build/audit DCF, LBO, 3-statement models with sensitivity analysis.", tags: ["finance","dcf"], price: "subscription", priceUsd: 129, color: "#10B981", emoji: "💹", caps: ["code-interpreter","long-context"], perms: ["fin.read"] },
    { name: "Healthcare Coder", slug: "healthcare-coding", cat: "healthcare-coding", pub: "WINDELS Health", ver: "1.0.0", summary: "ICD-10/CPT coding assistance, claims QA (non-diagnostic).", tags: ["healthcare","coding"], price: "subscription", priceUsd: 149, color: "#DC2626", emoji: "🏥", caps: ["reasoning","tabular"], perms: ["phi.read"] },
    { name: "ERP/CRM Bridge", slug: "erp-crm-bridge", cat: "erp-crm", pub: "WINDELS Integrations", ver: "1.3.2", summary: "Pre-built workflows bridging SAP/Salesforce/NetSuite to AI Workforces.", tags: ["erp","crm","salesforce","sap"], price: "free", color: "#8B5CF6", emoji: "🔗", caps: ["tool-use"], perms: ["integration.write"] },
    { name: "Manufacturing Ops", slug: "manufacturing-ops", cat: "industry", pub: "WINDELS Industry", ver: "1.0.0", summary: "OEE analysis, SPC charts, downtime root-cause for discrete manufacturing.", tags: ["manufacturing","oee"], price: "subscription", priceUsd: 199, color: "#F59E0B", emoji: "🏭", caps: ["timeseries","vision"], perms: ["iot.read"] },
  ] as const;
  for (const s of skillSeeds as unknown as any[]) {
    await SkillsService.publishSkill({
      name: s.name, slug: s.slug, publisher: s.pub, category: s.cat, version: s.ver,
      summary: s.summary, description: s.summary + "\n\n" + s.summary, tags: s.tags,
      priceModel: s.price, priceUsd: s.priceUsd, status: "published",
      requiredCapabilities: s.caps, requiredPermissions: s.perms, iconColor: s.color, iconEmoji: s.emoji,
    });
  }

  // Sample installations
  const skills = await SkillsService.listSkills();
  const orgId = "org-default";
  const adminId = "user-admin";
  const installed = [];
  for (const s of skills.slice(0, 5)) {
    installed.push(await SkillsService.installSkill({ skillId: s.id, orgId, installedBy: adminId }));
  }
  await SkillsService.assignSkill({ installationId: installed[0].id, scope: "department", targetId: "finance", targetName: "Finance", assignedBy: adminId });
  await SkillsService.assignSkill({ installationId: installed[1].id, scope: "department", targetId: "legal", targetName: "Legal", assignedBy: adminId });
  await SkillsService.assignSkill({ installationId: installed[3].id, scope: "workforce", targetId: "eng", targetName: "Engineering Workforce", assignedBy: adminId });

  // ----- Slice 292 — Digital Twins -----
  const twinSeeds = [
    { name: "WINDELS Smart Warehouse #1", kind: "warehouse", desc: "Main distribution warehouse with 42 IoT sensors, AS/RS, and picking automation.", loc: "Rotterdam, NL", color: "#14B8A6", tags: ["iot","logistics"], owner: "Ops" },
    { name: "Factory Line A — Austin", kind: "factory", desc: "Automotive component manufacturing line with live OEE and defect telemetry.", loc: "Austin, TX", color: "#F59E0B", tags: ["manufacturing","oee"], owner: "Manufacturing" },
    { name: "APAC Supply Chain", kind: "supply-chain", desc: "Tier-1 to tier-3 supplier network with disruption modeling.", loc: "Multi-region", color: "#3B82F6", tags: ["supply-chain","risk"], owner: "Procurement" },
    { name: "HQ Building 5", kind: "building", desc: "Smart HQ tower with HVAC/energy/occupancy digital twin.", loc: "Amsterdam, NL", color: "#10B981", tags: ["smart-building","energy"], owner: "Facilities" },
    { name: "Downtown Microgrid", kind: "utility-network", desc: "Neighborhood solar+storage microgrid with fault simulation.", loc: "Enugu, NG", color: "#D946EF", tags: ["energy","microgrid"], owner: "Sustainability" },
    { name: "Order-to-Cash Process", kind: "business-process", desc: "End-to-end O2C workflow twin with cycle-time telemetry.", loc: "Global", color: "#8B5CF6", tags: ["process","o2c"], owner: "Finance" },
  ] as const;
  for (const t of twinSeeds as unknown as any[]) {
    const twin = await DigitalTwinsService.createTwin({
      name: t.name, kind: t.kind, description: t.desc, status: "live", owner: t.owner,
      location: t.loc, tags: t.tags, iconColor: t.color,
    });
    // Seed entities per twin
    const entitySeeds = [
      { name: "Primary Sensor", kind: "sensor", tags: ["telemetry"] },
      { name: "Zone A", kind: "zone", tags: ["area"] },
      { name: "Node Alpha", kind: "node", tags: ["network"] },
      { name: "Critical Asset", kind: "asset", tags: ["equipment"] },
    ] as const;
    for (const e of entitySeeds as unknown as any[]) {
      const ent = await DigitalTwinsService.addEntity(twin.id, { name: e.name, kind: e.kind, tags: e.tags, metadata: { twin: t.name } });
      // Seed a few telemetry points
      for (let i = 0; i < 3; i++) {
        await DigitalTwinsService.recordTelemetry(twin.id, ent.id, ["temp","utilization","throughput"][i%3], 50, ["°C","%","u/h"][i%3], "seed-bootstrap");
      }
    }
  }

  // ----- Slice 293 — Simulation scenarios -----
  const scenarios = [
    { name: "FY27 Revenue Upside 12%", kind: "revenue-forecast", desc: "12% revenue upside scenario with enterprise segment expansion.", owner: "Finance", color: "#10B981", tags: ["fy27","growth"], assumptions: [
      { id: "growth", label: "Market growth rate", value: 8, unit: "%" },
      { id: "winrate", label: "Win rate", value: 28, unit: "%" },
      { id: "acv", label: "Avg ACV growth", value: 6, unit: "%" },
    ]},
    { name: "Tier-1 Supplier Disruption", kind: "supply-disruption", desc: "4-week outage of primary APAC supplier.", owner: "Procurement", color: "#DC2626", tags: ["risk","supplier"], assumptions: [
      { id: "duration", label: "Outage duration", value: 28, unit: "days" },
      { id: "mitigation", label: "Alt supplier coverage", value: 60, unit: "%" },
    ]},
    { name: "Ransomware IR Playbook", kind: "cyber-ir", desc: "Simulated ransomware event response with containment metrics.", owner: "Security", color: "#8B5CF6", tags: ["security","ir"], assumptions: [
      { id: "dwell", label: "Mean dwell time", value: 48, unit: "hours" },
      { id: "coverage", label: "EDR coverage", value: 92, unit: "%" },
    ]},
    { name: "DR Region Failover", kind: "dr", desc: "Primary region failover to secondary (EU->US).", owner: "Platform", color: "#3B82F6", tags: ["dr","ha"], assumptions: [
      { id: "rto", label: "Target RTO", value: 4, unit: "hours" },
      { id: "rpo", label: "Target RPO", value: 15, unit: "min" },
    ]},
    { name: "Hiring Freeze + Efficiency", kind: "hiring-plan", desc: "Hiring freeze, 3% automation efficiency gain.", owner: "People Ops", color: "#F59E0B", tags: ["hiring","cost"], assumptions: [
      { id: "freeze", label: "Freeze duration", value: 6, unit: "months" },
      { id: "auto", label: "Automation gain", value: 3, unit: "%" },
    ]},
    { name: "Q4 Operational Optimization", kind: "operational-optimization", desc: "End-to-end cycle time and opex optimization.", owner: "COO", color: "#14B8A6", tags: ["ops","efficiency"], assumptions: [
      { id: "cycle", label: "Cycle time reduction", value: 12, unit: "%" },
      { id: "opex", label: "Opex reduction", value: 7, unit: "%" },
    ]},
  ] as const;
  for (const sc of scenarios as unknown as any[]) {
    const created = await SimulationService.createScenario({
      name: sc.name, kind: sc.kind, description: sc.desc, owner: sc.owner,
      assumptions: sc.assumptions, tags: sc.tags, iconColor: sc.color,
    });
    // Run one seed simulation for each to populate results
    await SimulationService.runSimulation({ scenarioId: created.id, startedBy: adminId, feedSuperIntelligence: true });
  }

  // ----- Slice 294 — AI App Store -----
  const appSeeds = [
    { name: "WINDELS Copilot for Excel", slug: "copilot-excel", kind: "plugin", cat: "Productivity", pub: "WINDELS", sd: "Bring AI into every spreadsheet.", fd: "Seamless Excel integration with formula authoring, data cleanup, and narrative generation.", ver: "2.4.1", price: "free", color: "#10B981", emoji: "📊" },
    { name: "Salesforce Agent Pack", slug: "sf-agent-pack", kind: "integration-pack", cat: "CRM", pub: "WINDELS Integrations", sd: "Pre-built agents for Salesforce workflows.", fd: "Lead scoring, opportunity summarization, next-best-action for Salesforce.", ver: "1.7.0", price: "subscription", priceUsd: 29, color: "#3B82F6", emoji: "💼" },
    { name: "Compliance Workflow Templates", slug: "compliance-wf", kind: "workflow-template", cat: "Governance", pub: "WINDELS GRC", sd: "SOX/GDPR/HIPAA workflow templates.", fd: "Pre-approved templates for audit evidence, data subject requests, and change approval.", ver: "1.0.3", price: "free", color: "#8B5CF6", emoji: "✅" },
    { name: "Manufacturing Q&A Pack", slug: "mfg-pack", kind: "industry-extension", cat: "Industry", pub: "WINDELS Industry", sd: "Manufacturing Q&A assistant pack.", fd: "SOP lookup, defect triage, shift handoff for discrete manufacturing.", ver: "1.2.0", price: "subscription", priceUsd: 99, color: "#F59E0B", emoji: "🏭" },
    { name: "DevOps Automation Pack", slug: "devops-pack", kind: "automation-pack", cat: "Engineering", pub: "WINDELS Engineering", sd: "CI/CD and incident-response automations.", fd: "PR review, incident summarization, runbook execution for DevOps teams.", ver: "3.1.0", price: "free", color: "#14B8A6", emoji: "⚙️" },
    { name: "Executive Briefing App", slug: "exec-brief", kind: "app", cat: "Executive", pub: "WINDELS", sd: "Daily exec briefing across KPIs.", fd: "Daily morning briefings synthesizing KPIs, risks, mail, and calendar.", ver: "2.0.0", price: "subscription", priceUsd: 19, color: "#D946EF", emoji: "🎯" },
    { name: "Slack Connector", slug: "slack-connector", kind: "connector", cat: "Collaboration", pub: "WINDELS", sd: "WINDELS inside Slack.", fd: "Invoke WINDELS skills and agents from any Slack channel.", ver: "1.9.2", price: "free", color: "#8B5CF6", emoji: "💬" },
    { name: "Board Report Business Template", slug: "board-report", kind: "business-template", cat: "Templates", pub: "WINDELS", sd: "Quarterly board report template.", fd: "Pre-formatted board report with auto-populating KPI sections.", ver: "1.0.0", price: "one-time", priceUsd: 149, color: "#DC2626", emoji: "📈" },
  ] as const;
  for (const a of appSeeds as unknown as any[]) {
    await AppStoreService.publishApp({
      name: a.name, slug: a.slug, publisher: a.pub, kind: a.kind, category: a.cat,
      shortDescription: a.sd, fullDescription: a.fd, latestVersion: a.ver,
      status: "published", priceModel: a.price, priceUsd: a.priceUsd,
      permissions: ["app.basic"], dependencies: [], tags: [a.cat.toLowerCase()],
      iconColor: a.color, iconEmoji: a.emoji, governanceApproved: true,
    });
  }
  // One app pending governance approval
  await AppStoreService.publishApp({
    name: "Beta Finance Workbench", slug: "beta-finance", publisher: "Partner Labs", kind: "app", category: "Finance",
    shortDescription: "Experimental finance workbench (awaiting governance).", fullDescription: "Pending review.",
    latestVersion: "0.1.0", status: "pending-review", priceModel: "trial",
    permissions: ["fin.read"], dependencies: [], tags: ["beta"],
    iconColor: "#F59E0B", iconEmoji: "🧪", governanceApproved: false,
  });
  // Install a few apps
  const apps = await AppStoreService.listApps({ approvedOnly: true });
  for (const a of apps.slice(0, 4)) {
    await AppStoreService.installApp({ appId: a.id, orgId, installedBy: adminId });
  }

  logger?.info("[marketplace] bootstrap complete", {
    skills: skillSeeds.length, twins: twinSeeds.length, scenarios: scenarios.length, apps: appSeeds.length,
  });
}
