/**
 * Session 32 bootstrap — Enterprise Collaboration & Perception Intelligence.
 * Slices 285 (Meetings), 286 (Screen Intel), 287 (Camera Intel).
 */
import { logger } from "../observability/logger.js";
import { MeetingsService } from "./meetings.service.js";
import { ScreenIntelService } from "./screenIntel.service.js";
import { CameraIntelService } from "./cameraIntel.service.js";

export async function bootstrapCollaboration() {
  const existing = await MeetingsService.listConnectors();
  if (existing.length > 0) {
    const meets = await MeetingsService.listMeetings();
    const scrs = await ScreenIntelService.listSessions();
    const cams = await CameraIntelService.listPipelines();
    logger.info("collaboration already seeded", { connectors: existing.length, meetings: meets.length, screenSessions: scrs.length, cameraPipelines: cams.length });
    return;
  }

  // ── Slice 285: Meeting connectors ────────────────────────
  const connDefs = [
    { name: "Microsoft Teams", platform: "teams" as const, owner: "it-ops", tenantDomain: "windels.ai", capabilities: ["transcription", "translation", "speakerId", "recording", "calendarSync"] },
    { name: "Zoom Enterprise",  platform: "zoom"  as const, owner: "it-ops", tenantDomain: "windels.ai", capabilities: ["transcription", "translation", "speakerId", "recording"] },
    { name: "Google Meet",      platform: "meet"  as const, owner: "it-ops", tenantDomain: "windels.ai", capabilities: ["transcription", "translation", "calendarSync"] },
    { name: "Cisco Webex",      platform: "webex" as const, owner: "eu-ops", capabilities: ["transcription", "speakerId", "recording"] },
    { name: "Slack Huddles",    platform: "slack-huddle" as const, owner: "collab-tools", capabilities: ["transcription", "translation"] },
    { name: "WINDELS Talk",     platform: "windels-talk" as const, owner: "platform", capabilities: ["transcription", "translation", "speakerId", "recording", "calendarSync"] },
  ];
  const connectors = [];
  for (const c of connDefs as unknown as any[]) {
    const co = await MeetingsService.registerConnector(c);
    co.meetingsToday = 6;
    co.minutesTranscribed24h = 2400;
    co.languagesActive = c.platform === "slack-huddle" ? ["en"] : ["en", "es", "fr", "de"];
    co.lastSyncAt = new Date(Date.now() - 900_000).toISOString();
    co.status = "connected";
    const { redisCmd } = await import("../db/redis.js");
    await redisCmd.set(`coll:m:conn:${co.id}`, JSON.stringify(co));
    connectors.push(co);
  }

  // Sample meetings: 3 completed, 2 live, 1 scheduled
  const m1 = await MeetingsService.scheduleMeeting({ title: "Q3 Revenue Pipeline Review", platform: "teams", connectorId: connectors[0].id, organizer: "revops-lead", attendees: 12, languages: ["en", "es"], tags: ["revenue", "weekly"] });
  const m2 = await MeetingsService.scheduleMeeting({ title: "Incident Postmortem — EU Auth Latency", platform: "zoom", connectorId: connectors[1].id, organizer: "sre-oncall", attendees: 8, languages: ["en"], tags: ["incident", "postmortem"] });
  const m3 = await MeetingsService.scheduleMeeting({ title: "Design Review: Talk Whiteboard v2", platform: "windels-talk", connectorId: connectors[5].id, organizer: "design-lead", attendees: 6, languages: ["en", "fr"], tags: ["design"] });
  const m4 = await MeetingsService.scheduleMeeting({ title: "Customer Kickoff — Acme Corp", platform: "meet", connectorId: connectors[2].id, organizer: "csm-beth", attendees: 14, languages: ["en", "es", "pt"], tags: ["customer", "kickoff"] });
  // m5 = scheduled (not started)
  await MeetingsService.scheduleMeeting({ title: "ML Model Gating: vision-v1.3.0", platform: "webex", connectorId: connectors[3].id, organizer: "ml-lead", attendees: 5, languages: ["en"], tags: ["ml", "gating"] });
  const m6 = await MeetingsService.scheduleMeeting({ title: "EU Compliance Sync — AI Act", platform: "slack-huddle", connectorId: connectors[4].id, organizer: "compliance", attendees: 4, languages: ["en", "de"], tags: ["compliance", "eu"] });

  // Mark m4 & m6 as LIVE with AI participant joined
  await MeetingsService.joinAiParticipant(m4.id);
  await MeetingsService.joinAiParticipant(m6.id);

  // Put m1/m2/m3 into a simulated finished state then end them
  for (const [m, dur] of [[m1, 52], [m2, 45], [m3, 38]] as const) {
    const rec = await MeetingsService.getMeeting(m.id);
    if (rec) {
      rec.status = "live";
      rec.durationMin = dur;
      rec.aiParticipantJoined = true;
      rec.startedAt = new Date(Date.now() - dur * 60_000 - 600_000).toISOString();
      const { redisCmd } = await import("../db/redis.js");
      await redisCmd.set(`coll:m:m:${rec.id}`, JSON.stringify(rec));
    }
  }

  // Speakers
  const speakerNames = ["Priya Shah", "Marcus Lee", "Dana Okafor", "Elena Rossi", "Jonas Muller", "AI Notetaker"];
  for (const m of [m1, m2, m3, m4, m6]) {
    for (let i = 0; i < Math.min(m.attendees, 6); i++) {
      await MeetingsService.addSpeaker(m.id, {
        principalId: i === 5 ? "ai_notetaker" : `u_${100 + i}`,
        displayName: speakerNames[i] || `Attendee ${i + 1}`,
        role: i === 0 ? "host" : i === 5 ? "ai-participant" : "attendee",
        talkTimeSec: 300,
        interjections: 3,
        sentiment: (["positive", "neutral", "mixed", "negative"] as const)[i % 4],
        permissionGated: i === 3,
      });
    }
  }

  // Transcript snippets
  const snippets: Record<string, string> = {
    [m1.id]: "Let's walk the Q3 pipeline. We have four enterprise deals in late stage.",
    [m2.id]: "The auth latency spike traces to a Redis hot key on session lookups.",
    [m3.id]: "The new whiteboard needs a glassmorphic dark palette to align with the platform.",
    [m4.id]: "Acme requires SSO with SCIM and a 99.95% SLA before signature.",
    [m6.id]: "The EU AI Act requires high-risk AI classification by end of quarter.",
  };
  for (const [mid, txt] of Object.entries(snippets)) {
    await MeetingsService.addSegment(mid, {
      startSec: 60, endSec: 78, speakerLabel: "Host",
      text: txt, confidence: 0.95, language: "en",
      translated: { es: "[es] " + txt, fr: "[fr] " + txt },
    });
  }

  // Translation channels
  for (const m of [m1, m3, m4, m6]) {
    for (const lang of m.languages.filter(l => l !== "en")) {
      await MeetingsService.enableTranslationChannel(m.id, lang);
    }
  }

  // Action items
  await MeetingsService.addActionItem(m1.id, { title: "Schedule Acme procurement follow-up", description: "Beth owns; share MSA redlines by EOW.", assignee: "csm-beth", dueDate: new Date(Date.now() + 5 * 86400_000).toISOString(), priority: "high" });
  await MeetingsService.addActionItem(m1.id, { title: "Update Q3 forecast model", description: "Revops weights pipeline 0.7x at stage 4.", assignee: "revops-lead", priority: "medium" });
  await MeetingsService.addActionItem(m2.id, { title: "Ship Redis key sharding for sessions", description: "SRE implements hash tags; target +1 week.", assignee: "sre-oncall", priority: "critical" });
  await MeetingsService.addActionItem(m3.id, { title: "Prototype glassmorphic toolbar", description: "Design + front-end pair on prototype.", assignee: "design-lead", priority: "medium" });
  await MeetingsService.addActionItem(m4.id, { title: "Send Acme SSO configuration guide", description: "CSM delivers with security review.", assignee: "csm-beth", priority: "high" });
  await MeetingsService.addActionItem(m6.id, { title: "Draft AI Act classification matrix", description: "Compliance circulates draft by next sync.", assignee: "compliance", priority: "high" });

  // Decisions
  await MeetingsService.addDecision(m1.id, { title: "Commit Q3 forecast at $4.2M", type: "approved", decidedBy: "cfo", rationale: "Pipeline coverage at 3.4x supports the commit.", timestampSec: 1320 });
  await MeetingsService.addDecision(m2.id, { title: "Hot-key mitigation ships in 7 days", type: "action-required", decidedBy: "sre-oncall", rationale: "EU customers hit 400ms p95 for auth.", timestampSec: 2400 });
  await MeetingsService.addDecision(m3.id, { title: "Adopt Geist for whiteboard typography", type: "approved", decidedBy: "design-lead", rationale: "Consistent with platform typography.", timestampSec: 1500 });

  // Risks
  await MeetingsService.addRisk(m1.id, { label: "Acme legal may delay MSA", severity: "medium", category: "timeline", detail: "Outside counsel cycle averaging 14 days." });
  await MeetingsService.addRisk(m2.id, { label: "Mitigation may break mobile sessions", severity: "high", category: "security", detail: "Mobile uses a different session key schema." });
  await MeetingsService.addRisk(m4.id, { label: "Customer requires EU residency", severity: "high", category: "legal", detail: "Acme requires Frankfurt-only inference." });
  await MeetingsService.addRisk(m6.id, { label: "AI Act classification backlog", severity: "critical", category: "legal", detail: "34 model cards pending legal review." });

  // End completed meetings — generates summary + write-through
  for (const m of [m1, m2, m3]) {
    await MeetingsService.endMeeting(m.id);
  }

  // ── Slice 286: Screen Intelligence sessions ──────────────
  const s1 = await ScreenIntelService.startSession({ title: "Customer onboarding — Acme dashboard", user: "csm-beth", level: "tab", application: "Chrome", url: "https://app.windels.ai/acme/dashboard" });
  const s2 = await ScreenIntelService.startSession({ title: "SRE troubleshooting auth latency", user: "sre-oncall", level: "fullscreen", application: "iTerm2 + Grafana" });
  const s3 = await ScreenIntelService.startSession({ title: "Pair programming: toolbar refactor", user: "dev-jamie", level: "developer-coding", application: "VS Code" });
  const s4 = await ScreenIntelService.startSession({ title: "Billing config walk-through", user: "finance-ops", level: "window", application: "Stripe Dashboard" });

  const steps = [
    ["Open tenant settings", "Navigate to Settings / Tenant / SSO.", "SSO configuration page visible."],
    ["Upload IdP metadata XML", "Drag XML into the drop zone.", "Metadata validates without errors."],
    ["Test SSO login", "Click Test SSO and complete IdP flow.", "Test login returns success."],
  ] as const;
  for (let i = 0; i < steps.length; i++) {
    const [title, instr, exp] = steps[i];
    const st = await ScreenIntelService.addStep(s1.id, { stepNumber: i + 1, title, instruction: instr, expectedOutcome: exp });
    if (i < 2) await ScreenIntelService.advanceStep(s1.id, st.id, i === 0 ? "done" : "active");
  }
  await ScreenIntelService.addExplanation(s1.id, { elementSelector: "#tenant-sso-toggle", explanation: "Enables SAML/OIDC SSO for all users in the tenant; non-admin local passwords are disabled once on.", relatedDocs: ["docs/sso/saml", "docs/sso/oidc"], confidence: 0.96 });
  await ScreenIntelService.addExplanation(s2.id, { region: "Grafana auth-latency-p95 panel", explanation: "This panel shows p95 auth latency per region; the 13:04 UTC spike correlates with the Redis hot-key incident.", confidence: 0.91 });
  await ScreenIntelService.addCodeAssist(s3.id, { kind: "refactor", language: "tsx", fileName: "WhiteboardToolbar.tsx", selectionSnippet: "<button className=\"bg-white/5\"/>", suggestion: "Replace with <Button variant='ghost' size='sm'/> to match the glassmorphism system." });
  await ScreenIntelService.addCodeAssist(s3.id, { kind: "review", language: "tsx", fileName: "WhiteboardToolbar.tsx", suggestion: "Add aria-labels and Cmd+Z / Cmd+Shift+Z shortcuts for accessibility parity." });
  await ScreenIntelService.addIssue(s4.id, { label: "Stripe webhook signing secret expired", severity: "critical", detail: "Events will fail verification until secret is rotated." });
  await ScreenIntelService.addIssue(s2.id, { label: "Grafana auth datasource stale", severity: "warn", detail: "Auth latency datasource last refreshed 2 hours ago." });
  await ScreenIntelService.generateDoc(s1.id, "Acme SSO Onboarding Runbook", "markdown");

  // ── Slice 287: Camera Intelligence pipelines ─────────────
  const camDefs = [
    { name: "NA-East Assembly Line QA", kind: "manufacturing-qa" as const, site: "plant-na-east-01", cameraCount: 8, fps: 12, resolution: "1920x1080", owner: "quality-eng" },
    { name: "Berlin Construction Safety", kind: "construction-site" as const, site: "site-berlin-eu", cameraCount: 4, fps: 6, owner: "safety-eu" },
    { name: "DFW Warehouse Cycle Count", kind: "warehouse-ops" as const, site: "wh-dfw-03", cameraCount: 12, fps: 4, owner: "warehouse-ops" },
    { name: "Retail Checkout Pilot", kind: "retail-recognition" as const, site: "store-aus-07", cameraCount: 2, fps: 8, owner: "retail-ai" },
    { name: "Field Tech Equipment Inspection", kind: "equipment-inspection" as const, site: "field-technicians", cameraCount: 30, fps: 2, owner: "field-ops" },
  ];
  const camPipes = [];
  for (const c of camDefs as unknown as any[]) camPipes.push(await CameraIntelService.registerPipeline(c));
  // One pipeline wired to an approved workflow
  const invApproved = await CameraIntelService.registerPipeline({
    name: "DFW Inventory Auto-Count (Approved)", kind: "inventory-recognition", site: "wh-dfw-03",
    cameraCount: 6, fps: 4, owner: "warehouse-ops", approvedWorkflow: "WIN-INV-AUTOCOUNT-v2", tags: ["approved", "autonomous"],
  });
  camPipes.push(invApproved);

  const findDefs: Array<{ pipe: number; kind: any; label: string; sev: "info" | "warn" | "critical"; title: string; detail: string; loc: string; rec: string }> = [
    { pipe: 0, kind: "defect", label: "scratch_on_housing", sev: "warn", title: "Surface defect: scratch on unit A421", detail: "4mm scratch on chassis edge detected at station 3.", loc: "Station 3", rec: "Route to rework belt; re-verify after polish." },
    { pipe: 0, kind: "misalignment", label: "seal_misaligned", sev: "critical", title: "Gasket misalignment on unit B117", detail: "Gasket offset ~1.8mm; IP67 likely to fail.", loc: "Station 7", rec: "Halt line; re-seat gasket and re-run pressure test." },
    { pipe: 1, kind: "ppe-missing", label: "no_hard_hat", sev: "critical", title: "Worker without hard hat", detail: "Detected on NW perimeter camera at 09:14 local.", loc: "Perimeter NW", rec: "Broadcast audio reminder; dispatch safety officer." },
    { pipe: 1, kind: "obstacle", label: "debris_in_walkway", sev: "warn", title: "Debris blocking walkway", detail: "Loose cable/lumber on east pedestrian path.", loc: "East path", rec: "Notify site foreman to clear within 15 min." },
    { pipe: 2, kind: "inventory-count", label: "pallet_count", sev: "info", title: "Pallet count variance", detail: "Vision 412 vs WMS 418 — possible mis-shelf.", loc: "Aisle 14", rec: "Cycle-count aisle 14 next shift." },
    { pipe: 3, kind: "recognition", label: "long_queue", sev: "warn", title: "Checkout queue > 6 customers", detail: "Queue threshold exceeded at register 3.", loc: "Register 3", rec: "Open additional register per staffing playbook." },
    { pipe: 4, kind: "asset-tag", label: "asset_tag_corroded", sev: "warn", title: "Corroded asset tag HVAC-0092", detail: "OCR confidence 0.61 on rooftop unit.", loc: "Rooftop unit 92", rec: "Schedule technician re-scan with handheld." },
    { pipe: 4, kind: "anomaly", label: "thermal_hotspot", sev: "warn", title: "Thermal hotspot on Panel B", detail: "12C delta vs neighboring panels.", loc: "Panel B", rec: "Dispatch electrician for IR follow-up." },
    { pipe: 5, kind: "inventory-count", label: "verified_pallet_count", sev: "info", title: "Auto-count reconciled with WMS", detail: "Approved workflow posted delta -1.", loc: "Bulk zone", rec: "No action — auto-reconciled per policy." },
  ];
  for (const fd of findDefs) {
    const p = camPipes[fd.pipe];
    const conf = 0.79;
    const det = await CameraIntelService.emitDetection(p.id, {
      cameraId: `cam-${fd.pipe}-1`,
      kind: fd.kind, label: fd.label, confidence: conf,
      bbox: { x: 200, y: 160, w: 90, h: 90 },
    });
    await CameraIntelService.openFinding(p.id, det.id, {
      kind: fd.kind, title: fd.title, severity: fd.sev, detail: fd.detail,
      location: fd.loc, recommendation: fd.rec,
    });
  }

  // ── Summary log ──────────────────────────────────────────
  const [mt, sc, cam] = await Promise.all([MeetingsService.summary(), ScreenIntelService.summary(), CameraIntelService.summary()]);
  logger.info("collaboration & perception intelligence bootstrapped", {
    connectors: mt.connectors, meetingsLive: mt.meetingsLive, meetingsToday: mt.meetingsToday,
    screenActive: sc.screenSessionsActive, docsGenerated: sc.docsGenerated24h,
    cameraPipelines: cam.cameraPipelines, openFindings: cam.openFindings, safetyAlerts: cam.safetyAlerts24h,
  });
}
