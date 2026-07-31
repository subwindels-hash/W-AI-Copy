/**
 * Collaboration & Perception Intelligence routes (Session 32, Phase 31, Slices 285–287).
 * Mounted at /collaboration behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { MeetingsService } from "../../collaboration/meetings.service.js";
import { ScreenIntelService } from "../../collaboration/screenIntel.service.js";
import { CameraIntelService } from "../../collaboration/cameraIntel.service.js";

// ── Zod schemas ──────────────────────────────────────────────────
const connCreate = z.object({
  name: z.string(),
  platform: z.enum(["teams", "zoom", "meet", "webex", "slack-huddle", "windels-talk", "custom"]),
  owner: z.string().default("it"),
  tenantDomain: z.string().optional(),
  capabilities: z.array(z.string()).default(["transcription", "translation", "speakerId"]),
});
const meetCreate = z.object({
  title: z.string(),
  platform: z.enum(["teams", "zoom", "meet", "webex", "slack-huddle", "windels-talk", "custom"]),
  connectorId: z.string(),
  organizer: z.string(),
  attendees: z.number().int().default(1),
  languages: z.array(z.enum(["en", "es", "fr", "de", "pt", "ja", "zh", "ar", "hi", "ko"])).default(["en"]),
  tags: z.array(z.string()).default([]),
  externalMeetingId: z.string().optional(),
});
const segCreate = z.object({
  startSec: z.number(),
  endSec: z.number(),
  speakerId: z.string().optional(),
  speakerLabel: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1).default(0.9),
  language: z.enum(["en", "es", "fr", "de", "pt", "ja", "zh", "ar", "hi", "ko"]).default("en"),
  translated: z.record(z.string()).optional(),
});
const spkCreate = z.object({
  principalId: z.string().optional(),
  displayName: z.string(),
  role: z.enum(["host", "presenter", "attendee", "ai-participant", "guest"]).default("attendee"),
  talkTimeSec: z.number().int().default(0),
  interjections: z.number().int().default(0),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).default("neutral"),
  permissionGated: z.boolean().default(false),
});
const agendaCreate = z.object({
  title: z.string(),
  order: z.number().int(),
  durationMin: z.number().int().default(10),
  owner: z.string().optional(),
  status: z.enum(["pending", "active", "covered", "skipped"]).default("pending"),
  notes: z.string().default(""),
});
const aiCreate = z.object({
  title: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  sourceSegmentId: z.string().optional(),
});
const aiStatus = z.object({ status: z.enum(["open", "in-progress", "blocked", "done"]) });
const decCreate = z.object({
  title: z.string(),
  type: z.enum(["approved", "rejected", "deferred", "noted", "action-required"]),
  decidedBy: z.string().optional(),
  rationale: z.string(),
  timestampSec: z.number().int().default(0),
});
const riskCreate = z.object({
  label: z.string(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).default("medium"),
  category: z.enum(["commitment", "scope", "legal", "security", "quality", "timeline", "other"]).default("other"),
  detail: z.string(),
  sourceSegmentId: z.string().optional(),
});

const sessCreate = z.object({
  title: z.string(),
  user: z.string(),
  level: z.enum(["window", "tab", "fullscreen", "developer-coding"]),
  application: z.string().optional(),
  url: z.string().optional(),
});
const explCreate = z.object({
  elementSelector: z.string().optional(),
  region: z.string().optional(),
  explanation: z.string(),
  relatedDocs: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.9),
});
const stepCreate = z.object({
  stepNumber: z.number().int(),
  title: z.string(),
  instruction: z.string(),
  expectedOutcome: z.string(),
});
const stepAdvance = z.object({ status: z.enum(["pending", "active", "done", "skipped", "failed"]) });
const codeCreate = z.object({
  kind: z.enum(["explain", "refactor", "debug", "test-gen", "review"]),
  language: z.string().optional(),
  fileName: z.string().optional(),
  selectionSnippet: z.string().optional(),
  suggestion: z.string(),
});
const issueCreate = z.object({
  label: z.string(),
  severity: z.enum(["info", "warn", "critical"]),
  detail: z.string(),
});
const docCreate = z.object({
  title: z.string(),
  format: z.enum(["markdown", "confluence", "notion", "pdf"]).default("markdown"),
});

const pipeCreate = z.object({
  name: z.string(),
  kind: z.enum([
    "equipment-inspection", "construction-site", "inventory-recognition",
    "manufacturing-qa", "warehouse-ops", "safety-compliance", "asset-id",
    "technical-troubleshooting", "facility-walkthrough", "retail-recognition",
  ]),
  site: z.string(),
  cameraCount: z.number().int().default(1),
  fps: z.number().int().default(8),
  resolution: z.string().default("1920x1080"),
  owner: z.string().default("vision-ops"),
  approvedWorkflow: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
const pipeStatus = z.object({ status: z.enum(["live", "paused", "degraded", "offline"]) });
const detCreate = z.object({
  cameraId: z.string(),
  frameId: z.string().optional(),
  kind: z.enum(["defect", "safety-violation", "asset-tag", "inventory-count", "ppe-missing", "obstacle", "spill", "anomaly", "misalignment", "recognition"]),
  label: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  verdict: z.enum(["advisory", "approved-workflow"]).optional(),
});
const fndCreate = z.object({
  detectionId: z.string(),
  kind: z.enum(["defect", "safety-violation", "asset-tag", "inventory-count", "ppe-missing", "obstacle", "spill", "anomaly", "misalignment", "recognition"]),
  title: z.string(),
  severity: z.enum(["info", "warn", "critical"]),
  detail: z.string(),
  location: z.string(),
  recommendation: z.string(),
});
const ackBody = z.object({ by: z.string().default("admin") });

export function registerCollaborationRoutes(router: Router) {
  // ── Dashboard ─────────────────────────────────────────────
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [m, s, c] = await Promise.all([
        MeetingsService.summary(),
        ScreenIntelService.summary(),
        CameraIntelService.summary(),
      ]);
      res.json({ ok: true, data: { ...m, ...s, ...c, avgCameraLatencyMs: c.avgCameraLatencyMs } });
    } catch (e) { next(e); }
  });

  // ── Meeting connectors ──────────────────────────────────
  router.get("/meetings/connectors", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listConnectors() }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/connectors", validate({ body: connCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.registerConnector(req.body) }); }
    catch (e) { next(e); }
  });

  // ── Meetings ─────────────────────────────────────────────
  router.get("/meetings", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok: true, data: await MeetingsService.listMeetings({ status }) });
    } catch (e) { next(e); }
  });
  router.post("/meetings", validate({ body: meetCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.scheduleMeeting(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/meetings/:id", async (req, res, next) => {
    try {
      const m = await MeetingsService.getMeeting(req.params.id);
      if (!m) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: m });
    } catch (e) { next(e); }
  });
  router.post("/meetings/:id/join", async (req, res, next) => {
    try {
      const m = await MeetingsService.joinAiParticipant(req.params.id);
      if (!m) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: m });
    } catch (e) { next(e); }
  });
  router.post("/meetings/:id/end", async (req, res, next) => {
    try {
      const m = await MeetingsService.endMeeting(req.params.id);
      if (!m) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: m });
    } catch (e) { next(e); }
  });

  router.get("/meetings/:id/transcripts", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listSegments(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/transcripts", validate({ body: segCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.addSegment(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });

  router.get("/meetings/:id/translations", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listTranslationChannels(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/translations", validate({ body: z.object({ language: z.enum(["en", "es", "fr", "de", "pt", "ja", "zh", "ar", "hi", "ko"]) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.enableTranslationChannel(req.params.id, req.body.language) }); }
    catch (e) { next(e); }
  });

  router.get("/meetings/:id/speakers", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listSpeakers(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/speakers", validate({ body: spkCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.addSpeaker(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });

  router.get("/meetings/:id/agenda", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listAgenda(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/agenda", validate({ body: agendaCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.addAgendaItem(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });

  router.get("/meetings/:id/action-items", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listActionItems(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/action-items", validate({ body: aiCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.addActionItem(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/action-items/:aiid/status", validate({ body: aiStatus }), async (req, res, next) => {
    try {
      const a = await MeetingsService.updateActionItemStatus(req.params.id, req.params.aiid, req.body.status);
      if (!a) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });

  router.get("/meetings/:id/decisions", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listDecisions(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/decisions", validate({ body: decCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.addDecision(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });

  router.get("/meetings/:id/risks", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listRisks(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/risks", validate({ body: riskCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.addRisk(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/risks/:rid/ack", async (req, res, next) => {
    try {
      const r = await MeetingsService.ackRisk(req.params.id, req.params.rid);
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  router.get("/meetings/:id/summary", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.getSummary(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/summary", async (req, res, next) => {
    try {
      const s = await MeetingsService.generateSummary(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.get("/meetings/:id/followups", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.listFollowUps(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/meetings/:id/writethrough", async (req, res, next) => {
    try { res.json({ ok: true, data: await MeetingsService.enqueueWriteThrough(req.params.id) }); }
    catch (e) { next(e); }
  });

  // ── Screen Intelligence ─────────────────────────────────
  router.get("/screen/sessions", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok: true, data: await ScreenIntelService.listSessions({ status }) });
    } catch (e) { next(e); }
  });
  router.post("/screen/sessions", validate({ body: sessCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.startSession(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/screen/sessions/:id", async (req, res, next) => {
    try {
      const s = await ScreenIntelService.getSession(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/end", async (req, res, next) => {
    try {
      const s = await ScreenIntelService.endSession(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.get("/screen/sessions/:id/explanations", async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.listExplanations(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/explanations", validate({ body: explCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.addExplanation(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/screen/sessions/:id/steps", async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.listSteps(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/steps", validate({ body: stepCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.addStep(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/steps/:sid/advance", validate({ body: stepAdvance }), async (req, res, next) => {
    try {
      const st = await ScreenIntelService.advanceStep(req.params.id, req.params.sid, req.body.status);
      if (!st) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: st });
    } catch (e) { next(e); }
  });
  router.get("/screen/sessions/:id/code-assist", async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.listCodeAssists(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/code-assist", validate({ body: codeCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.addCodeAssist(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/screen/sessions/:id/issues", async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.listIssues(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/issues", validate({ body: issueCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.addIssue(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/screen/sessions/:id/docs", async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.listDocs(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/screen/sessions/:id/docs", validate({ body: docCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ScreenIntelService.generateDoc(req.params.id, req.body.title, req.body.format) }); }
    catch (e) { next(e); }
  });

  // ── Camera Intelligence ─────────────────────────────────
  router.get("/camera/pipelines", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok: true, data: await CameraIntelService.listPipelines({ kind, status }) });
    } catch (e) { next(e); }
  });
  router.post("/camera/pipelines", validate({ body: pipeCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraIntelService.registerPipeline(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/camera/pipelines/:id", async (req, res, next) => {
    try {
      const p = await CameraIntelService.getPipeline(req.params.id);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });
  router.post("/camera/pipelines/:id/status", validate({ body: pipeStatus }), async (req, res, next) => {
    try {
      const p = await CameraIntelService.setPipelineStatus(req.params.id, req.body.status);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.get("/camera/pipelines/:id/detections", async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraIntelService.listDetections(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/camera/pipelines/:id/detections", validate({ body: detCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraIntelService.emitDetection(req.params.id, req.body) }); }
    catch (e) { next(e); }
  });

  router.get("/camera/pipelines/:id/findings", async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraIntelService.listFindings(req.params.id) }); }
    catch (e) { next(e); }
  });
  router.post("/camera/pipelines/:id/findings", validate({ body: fndCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraIntelService.openFinding(req.params.id, req.body.detectionId, req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/camera/pipelines/:id/findings/:fid/acknowledge", validate({ body: ackBody }), async (req, res, next) => {
    try {
      const f = await CameraIntelService.acknowledgeFinding(req.params.id, req.params.fid, req.body.by);
      if (!f) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: f });
    } catch (e) { next(e); }
  });
}
