/**
 * Session 28 bootstrap — seed Extension Platform data if empty.
 * Slices 236–244: Registry, Business, Industry, Skills, Agents, Workflow/Dashboard/UI extensions, Lifecycle.
 */
import { logger } from "../observability/logger.js";
import { ExtensionRegistryService } from "./registry.service.js";
import { BusinessModuleService } from "./business.service.js";
import { IndustryModuleService } from "./industry.service.js";
import { SkillsService } from "./skills.service.js";
import { AgentsService } from "./agents.service.js";
import { WorkflowExtService } from "./workflowExt.service.js";
import { DashboardExtService } from "./dashboardExt.service.js";
import { UIComponentsService } from "./uiComponents.service.js";

export async function bootstrapExtensions() {
  const existing = await ExtensionRegistryService.list();
  if (existing.length > 0) {
    const b = await BusinessModuleService.list();
    const i = await IndustryModuleService.list();
    const s = await SkillsService.list();
    const a = await AgentsService.list();
    const w = await WorkflowExtService.list();
    const d = await DashboardExtService.list();
    const u = await UIComponentsService.list();
    logger.info("extension platform already seeded", {
      extensions: existing.length, business: b.length, industry: i.length, skills: s.length,
      agents: a.length, workflow: w.length, dashboards: d.length, ui: u.length,
    });
    return;
  }

  // ── Registry entries (one per category, 26 total) ──────────────
  const bizMods = [
    { slug:"windels-crm", name:"WINDELS CRM", category:"business", tagline:"Unified customer 360", cat:"crm", features:["Leads","Deals","Contacts","Pipeline"], ints:["gmail","slack","hubspot"], entities:42, workflows:18, dashboards:6, users:1247, color:"azure", icon:"🧑‍💼" },
    { slug:"windels-erp", name:"WINDELS ERP Core", category:"business", tagline:"Finance + supply chain", cat:"erp", features:["GL","AP/AR","Inventory","POs"], ints:["quickbooks","sap"], entities:56, workflows:32, dashboards:10, users:842, color:"violet", icon:"📦" },
    { slug:"people-ops", name:"People Ops (HR)", category:"business", tagline:"Hire-to-retire HR", cat:"hr", features:["ATS","Onboarding","PTO","Reviews"], ints:["bamboohr","workday"], entities:28, workflows:14, dashboards:5, users:2103, color:"teal", icon:"👥" },
    { slug:"fin-ops", name:"FinOps Suite", category:"business", tagline:"Cloud cost intelligence", cat:"finance", features:["Budgets","Forecasts","Anomalies","Showback"], ints:["aws","gcp","azure"], entities:19, workflows:9, dashboards:8, users:184, color:"fuchsia", icon:"💰" },
    { slug:"billing-cloud", name:"Enterprise Billing", category:"business", tagline:"Subscriptions + usage", cat:"billing", features:["Metering","Invoicing","Proration","Tax"], ints:["stripe"], entities:22, workflows:12, dashboards:4, users:612, color:"amber", icon:"🧾" },
    { slug:"growth-marketing", name:"Growth Marketing", category:"business", tagline:"Campaigns + journeys", cat:"marketing", features:["Journeys","A/B","Attribution","Email"], ints:["sendgrid","hubspot"], entities:17, workflows:20, dashboards:7, users:421, color:"emerald", icon:"📣" },
  ];

  const indMods = [
    { slug:"gov-citizen-services", name:"Government · Citizen Services", vertical:"government", region:"Global", desc:"Permits, records, public services.", compl:["FedRAMP","SOC2","HIPAA-where-applicable"], ai:14, wf:44, db:12, regs:28, color:"azure", icon:"🏛️" },
    { slug:"healthcare-records", name:"Healthcare · Patient Records", vertical:"healthcare", region:"Global", desc:"EHR, telehealth, care pathways.", compl:["HIPAA","HITECH"], ai:22, wf:60, db:18, regs:42, color:"emerald", icon:"🏥" },
    { slug:"banking-risk", name:"Banking · Risk & Compliance", vertical:"banking", region:"Global", desc:"KYC, AML, credit risk.", compl:["PCI-DSS","SOC2","Basel-III"], ai:18, wf:52, db:14, regs:51, color:"violet", icon:"🏦" },
    { slug:"construction-delivery", name:"Construction · Project Delivery", vertical:"construction", region:"Global", desc:"Plans, RFIs, daily reports.", compl:["ISO-9001","OSHA"], ai:10, wf:36, db:9, regs:18, color:"amber", icon:"🏗️" },
    { slug:"manufacturing-mes", name:"Manufacturing · MES", vertical:"manufacturing", region:"Global", desc:"MES, OEE, quality.", compl:["ISO-9001","IEC-62443"], ai:12, wf:28, db:11, regs:14, color:"teal", icon:"🏭" },
    { slug:"education-lms", name:"Education · Learning Platform", vertical:"education", region:"Global", desc:"Courses, grading, analytics.", compl:["FERPA","COPPA"], ai:8, wf:22, db:8, regs:9, color:"fuchsia", icon:"🎓" },
  ];

  const skills = [
    { slug:"sheet-analyst", name:"Spreadsheet Analyst", category:"spreadsheet", desc:"Pivot, clean, summarise tabular data.", inp:["xlsx","csv","sheets"], out:["summary","charts","anomalies"], models:["gpt-4o","claude-3.5"], lat:820, acc:96, wf:["research","finance","ops"], color:"azure", icon:"📊" },
    { slug:"contract-reviewer", name:"Contract Reviewer", category:"contract-review", desc:"Flags risky clauses and deviations.", inp:["pdf","docx"], out:["clause-map","risks","redlines"], models:["claude-3.5"], lat:2400, acc:94, wf:["legal","procurement"], color:"violet", icon:"📝" },
    { slug:"tax-advisor", name:"Tax Analyst", category:"tax", desc:"VAT, WHT, CIT computations and filings.", inp:["ledger","forms"], out:["returns","schedules"], models:["gpt-4o"], lat:1900, acc:97, wf:["finance"], color:"emerald", icon:"🧮" },
    { slug:"eng-calculator", name:"Engineering Calculator", category:"engineering", desc:"Structural, fluid, electrical calcs.", inp:["specs","diagrams"], out:["calculations","tolerances"], models:["gpt-4o","custom-slm"], lat:620, acc:98, wf:["engineering"], color:"teal", icon:"⚙️" },
    { slug:"financial-modeler", name:"Financial Modeler", category:"financial-modeling", desc:"3-statement models, DCFs, LBOs.", inp:["assumptions","historicals"], out:["model","sensitivity"], models:["claude-3.5","gpt-4o"], lat:3200, acc:92, wf:["finance","strategy"], color:"fuchsia", icon:"📈" },
    { slug:"hc-coding", name:"Healthcare Coder", category:"healthcare-coding", desc:"ICD-10/CPT coding from notes.", inp:["clinical-notes"], out:["codes","audits"], models:["claude-3.5"], lat:1100, acc:95, wf:["healthcare"], color:"crimson", icon:"🩺" },
    { slug:"market-research", name:"Market Researcher", category:"research", desc:"TAM/SAM/SOM, competitor analysis.", inp:["topic","sources"], out:["report","landscape"], models:["gpt-4o","claude-3.5"], lat:5400, acc:90, wf:["strategy","marketing"], color:"amber", icon:"🔍" },
  ];

  const agents = [
    { slug:"exec-briefing", name:"Executive Briefing Agent", dept:"executive", role:"Chief of Staff", desc:"Morning briefing, escalations, decisions.", sp:"You curate the daily executive briefing with facts, risks, and recommended decisions. Be concise.", model:"claude-3.5", skills:["market-research","financial-modeler"], tools:["email","calendar","kpi-stream"], mem:true, voice:true, col:"#8B5CF6", tasks:1420, ttm:3.8, rating:4.9, color:"violet", icon:"🤵" },
    { slug:"sales-pioneer", name:"Sales Pioneer", dept:"sales", role:"SDR Agent", desc:"Outbound, qualification, meeting booking.", sp:"You qualify outbound leads using BANT, personalize outreach, and book meetings. Stay on-brand.", model:"gpt-4o", skills:["sheet-analyst","market-research"], tools:["crm","email","linkedin"], mem:true, voice:false, col:"#3B82F6", tasks:8921, ttm:2.1, rating:4.6, color:"azure", icon:"📞" },
    { slug:"support-sentinel", name:"Support Sentinel", dept:"support", role:"Tier-1 Support", desc:"Autonomously resolves 70%+ of tickets.", sp:"Resolve customer support tickets with empathy. Escalate when confidence<85%.", model:"claude-3.5", skills:["contract-reviewer"], tools:["kb","tickets","chat"], mem:true, voice:true, col:"#14B8A6", tasks:23041, ttm:1.4, rating:4.8, color:"teal", icon:"🛟" },
    { slug:"fin-analyst", name:"Financial Analyst", dept:"finance", role:"FP&A Analyst", desc:"Variance, forecasts, board packs.", sp:"Produce accurate variance analysis with commentary and forecasts. Cite sources.", model:"gpt-4o", skills:["sheet-analyst","financial-modeler","tax-advisor"], tools:["ledger","erp","bi"], mem:true, voice:false, col:"#10B981", tasks:712, ttm:5.2, rating:4.7, color:"emerald", icon:"💹" },
    { slug:"code-reviewer", name:"Code Reviewer", dept:"engineering", role:"Senior Reviewer", desc:"Automated PR review, security, style.", sp:"Review PRs for correctness, security, and style. Produce actionable comments.", model:"claude-3.5", skills:["eng-calculator"], tools:["github","ci"], mem:true, voice:false, col:"#D946EF", tasks:4502, ttm:0.8, rating:4.5, color:"fuchsia", icon:"🧑‍💻" },
  ];

  const wfExts = [
    { slug:"stripe-trigger", name:"Stripe Charge Trigger", cat:"trigger", desc:"Fires on Stripe charge.succeeded.", in:[{name:"event",type:"stripe.Event"}], out:[{name:"charge",type:"object"}], ints:["stripe"], col:"amber", icon:"💳" },
    { slug:"slack-msg-action", name:"Slack Message Action", cat:"action", desc:"Post a Slack message to a channel.", in:[{name:"channel",type:"string"},{name:"text",type:"string"}], out:[{name:"ts",type:"string"}], ints:["slack"], col:"violet", icon:"💬" },
    { slug:"sentiment-condition", name:"Sentiment Condition", cat:"condition", desc:"Branch on sentiment score.", in:[{name:"text",type:"string"}], out:[{name:"sentiment",type:"'pos'|'neg'|'neu'"}], ints:[], col:"teal", icon:"💭" },
    { slug:"ai-transform", name:"AI Transform Node", cat:"transform", desc:"Run an LLM prompt over input data.", in:[{name:"prompt",type:"string"},{name:"context",type:"object"}], out:[{name:"result",type:"string"}], ints:["openai","anthropic"], col:"azure", icon:"🤖" },
    { slug:"human-approval", name:"Human Approval Gate", cat:"approval", desc:"Pause until approved/rejected.", in:[{name:"title",type:"string"},{name:"approvers",type:"user[]"}], out:[{name:"approved",type:"boolean"}], ints:["email","inbox"], col:"crimson", icon:"✅" },
    { slug:"cron-trigger", name:"Cron Schedule", cat:"scheduling", desc:"Fire on cron expressions.", in:[{name:"cron",type:"string"}], out:[{name:"firedAt",type:"datetime"}], ints:[], col:"slate", icon:"⏰" },
  ];

  const dashExts = [
    { slug:"revenue-kpis", name:"Revenue KPI Pack", desc:"ARR, MRR, NRR, GRR widgets.", widgets:["kpi","chart","funnel"], sources:["billing","crm"], refresh:60, roles:["exec","finance","sales"], author:"windels-team", col:"emerald", icon:"💵" },
    { slug:"engineering-pulse", name:"Engineering Pulse", desc:"DORA, PRs, incidents.", widgets:["kpi","chart","feed","gauge"], sources:["github","ci","oncall"], refresh:30, roles:["eng","exec"], author:"windels-team", col:"azure", icon:"⚡" },
    { slug:"support-trends", name:"Support Trends", desc:"CSAT, volume, top issues.", widgets:["kpi","chart","table","ai-insight"], sources:["zendesk","intercom"], refresh:120, roles:["support","ops"], author:"windels-team", col:"teal", icon:"📞" },
    { slug:"security-posture", name:"Security Posture Board", desc:"Findings, patch status, SLA.", widgets:["gauge","heatmap","table","kpi"], sources:["scanner","siem"], refresh:900, roles:["security","exec"], author:"windels-team", col:"crimson", icon:"🛡️" },
  ];

  const uiExts = [
    { slug:"data-table-pro", name:"Data Table Pro", cat:"data-viz", desc:"Virtualized tables w/ filter/sort.", fw:"react", col:"azure", icon:"📋" },
    { slug:"ai-chart", name:"AI Chart Builder", cat:"chart", desc:"Pick the best chart for your data.", fw:"react", col:"violet", icon:"📊" },
    { slug:"command-palette", name:"Command Palette", cat:"navigation", desc:"Cmd+K palette w/ AI search.", fw:"react", col:"fuchsia", icon:"⌨️" },
    { slug:"rich-markdown", name:"Rich Markdown", cat:"display", desc:"Markdown + code + citations.", fw:"react", col:"teal", icon:"📰" },
    { slug:"ai-suggest", name:"AI Suggest Input", cat:"ai-primitives", desc:"Autosuggest text input powered by AI.", fw:"react", col:"emerald", icon:"💡" },
  ];

  // ── Register business modules ──────────────────────────────────
  for (const b of bizMods) {
    const ext = await ExtensionRegistryService.register({
      slug:b.slug, name:b.name, kind:"business", author:"windels-team",
      description:b.tagline + " — " + b.features.join(", "), tagline:b.tagline,
      version:"1.0.0", visibility:"enterprise", category:b.cat, tags:["business",b.cat],
      icon:b.icon, color:b.color as any, license:"Enterprise", minPlatformVersion:"0.28.0",
      permissions:["read:org","read:finance"], sizeKb:150,
      certified:"official", sliceNumber:237,
      docsUrl:`https://docs.windels.ai/extensions/${b.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await BusinessModuleService.register({
      slug:b.slug, name:b.name, category:b.cat as any,
      description:b.tagline, features:b.features, integrations:b.ints,
      entities:b.entities, workflows:b.workflows, dashboards:b.dashboards, users:b.users,
      extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // ── Register industry modules ──────────────────────────────────
  for (const i of indMods) {
    const ext = await ExtensionRegistryService.register({
      slug:i.slug, name:i.name, kind:"industry", author:"windels-team",
      description:i.desc, tagline:i.desc.slice(0,60),
      version:"1.0.0", visibility:"enterprise", category:i.vertical as any, tags:["industry",i.vertical],
      icon:i.icon, color:i.color as any, license:"Enterprise", minPlatformVersion:"0.28.0",
      permissions:["read:org"], sizeKb:230,
      certified:"enterprise", sliceNumber:238,
      docsUrl:`https://docs.windels.ai/extensions/${i.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await IndustryModuleService.register({
      slug:i.slug, name:i.name, vertical:i.vertical as any, region:i.region, description:i.desc,
      compliancePacks:i.compl, aiEmployees:i.ai, workflows:i.wf, dashboards:i.db, regulations:i.regs,
      extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // ── Skills ─────────────────────────────────────────────────────
  for (const s of skills) {
    const ext = await ExtensionRegistryService.register({
      slug:s.slug, name:s.name, kind:"skill", author:"windels-team",
      description:s.desc, tagline:s.desc.slice(0,60),
      version:"1.0.0", visibility:"public", category:s.category as any, tags:["skill",s.category],
      icon:s.icon, color:s.color as any, license:"Apache-2.0", minPlatformVersion:"0.28.0",
      permissions:["invoke:llm"], sizeKb:35,
      certified:"official", sliceNumber:239,
      docsUrl:`https://docs.windels.ai/extensions/${s.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await SkillsService.register({
      slug:s.slug, name:s.name, category:s.category as any, description:s.desc,
      inputs:s.inp, outputs:s.out, modelRequirements:s.models,
      avgLatencyMs:s.lat, accuracyPct:s.acc, uses:4000,
      assignableWorkforces:s.wf, extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // ── Custom AI Agents ───────────────────────────────────────────
  for (const a of agents) {
    const ext = await ExtensionRegistryService.register({
      slug:a.slug, name:a.name, kind:"agent", author:"windels-team",
      description:a.desc, tagline:a.desc.slice(0,60),
      version:"1.0.0", visibility:"public", category:a.dept as any, tags:["agent",a.dept],
      icon:a.icon, color:a.color as any, license:"MIT", minPlatformVersion:"0.28.0",
      permissions:["invoke:llm","read:memory"], sizeKb:48,
      certified:"official", sliceNumber:240,
      docsUrl:`https://docs.windels.ai/extensions/${a.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await AgentsService.register({
      slug:a.slug, name:a.name, department:a.dept as any, role:a.role, description:a.desc,
      systemPrompt:a.sp, model:a.model, skills:a.skills, tools:a.tools,
      memoryKb:a.mem, voiceEnabled:a.voice, color:a.col,
      tasksCompleted:a.tasks, avgTaskTimeMin:a.ttm, rating:a.rating,
      extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // ── Workflow extensions ────────────────────────────────────────
  for (const w of wfExts) {
    const ext = await ExtensionRegistryService.register({
      slug:w.slug, name:w.name, kind:"workflow", author:"windels-team",
      description:w.desc, tagline:w.desc.slice(0,60),
      version:"1.0.0", visibility:"public", category:w.cat as any, tags:["workflow",w.cat],
      icon:w.icon, color:w.col as any, license:"MIT", minPlatformVersion:"0.28.0",
      permissions:["workflow:run"], sizeKb:22,
      certified:"official", sliceNumber:241,
      docsUrl:`https://docs.windels.ai/extensions/${w.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await WorkflowExtService.register({
      slug:w.slug, name:w.name, category:w.cat as any, description:w.desc,
      inputs:w.in, outputs:w.out, integrations:w.ints,
      invocations:2500, avgDurationMs:150, errorRatePct:0.6,
      extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // ── Dashboard extensions ───────────────────────────────────────
  for (const d of dashExts) {
    const ext = await ExtensionRegistryService.register({
      slug:d.slug, name:d.name, kind:"dashboard", author:d.author,
      description:d.desc, tagline:d.desc.slice(0,60),
      version:"1.0.0", visibility:"enterprise", category:"dashboard-pack", tags:["dashboard"],
      icon:d.icon, color:d.col as any, license:"Enterprise", minPlatformVersion:"0.28.0",
      permissions:["read:metrics"], sizeKb:60,
      certified:"official", sliceNumber:242,
      docsUrl:`https://docs.windels.ai/extensions/${d.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await DashboardExtService.register({
      slug:d.slug, name:d.name, description:d.desc, widgets:d.widgets as any, dataSources:d.sources,
      refreshRateSec:d.refresh, installations:180, author:d.author, roles:d.roles,
      extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // ── UI components ──────────────────────────────────────────────
  for (const u of uiExts) {
    const ext = await ExtensionRegistryService.register({
      slug:u.slug, name:u.name, kind:"ui-component", author:"windels-team",
      description:u.desc, tagline:u.desc.slice(0,60),
      version:"1.0.0", visibility:"public", category:u.cat as any, tags:["ui",u.cat],
      icon:u.icon, color:u.col as any, license:"MIT", minPlatformVersion:"0.28.0",
      permissions:[], sizeKb:16,
      certified:"official", sliceNumber:243,
      docsUrl:`https://docs.windels.ai/extensions/${u.slug}`,
    });
    await ExtensionRegistryService.transition(ext.id, "submitted", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "validating", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "security_review", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "testing", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "approved", "bootstrap");
    await ExtensionRegistryService.transition(ext.id, "published", "bootstrap");
    await UIComponentsService.register({
      slug:u.slug, name:u.name, category:u.cat as any, description:u.desc,
      framework:u.fw as any, a11y:true, darkMode:true, responsive:true,
      bundleKb:14, props:9,
      variants:4, downloads:2200,
      extensionId:ext.id, version:"1.0.0", status:"published",
    });
  }

  // Pre-install a couple of flagship extensions so Overview isn't empty
  const all = await ExtensionRegistryService.list();
  const flagships = all.filter(e => ["sales-pioneer","support-sentinel","revenue-kpis","data-table-pro","ai-transform"].includes(e.slug));
  for (const f of flagships.slice(0,3)) {
    await ExtensionRegistryService.install(f.id);
    await ExtensionRegistryService.setEnabled(f.id, true);
  }

  const finalList = await ExtensionRegistryService.list();
  const installed = finalList.filter(x=>x.installed).length;
  const enabled   = finalList.filter(x=>x.enabled).length;
  const byKind = await ExtensionRegistryService.countByKind();
  logger.info("extension platform bootstrapped", {
    extensions: finalList.length, installed, enabled,
    business:byKind.business, industry:byKind.industry, skills:byKind.skill, agents:byKind.agent,
    workflow:byKind.workflow, dashboards:byKind.dashboard, ui:byKind["ui-component"],
  });
}
