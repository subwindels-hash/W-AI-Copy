/**
 * Session 142 — Religion Knowledge Integration & Teaching routes.
 *
 * Mounted at `/api/v1/religions/integrations` (additive; the Session 141
 * surface is untouched). The five §20 channels:
 *
 *   Overview  GET  /                            integration status overview
 *   Memory    GET  /memory                      last memory-fabric sync
 *             POST /memory/sync                 sync curated catalog into the
 *                                               Enterprise Memory Fabric
 *   Agents    POST /agents/:agentId/attach      attach religion knowledge to
 *                                               an AI workforce agent
 *             GET  /agents/:agentId             attached-record status
 *   Training  POST /training/dataset            create the curated RAG dataset
 *                                               in the Session 60 training module
 *             GET  /training/export?family=     JSONL export of the corpus
 *   Education GET  /education/catalog           every record as a course
 *             POST /education/lesson            curated lesson + Lecturer AI
 *   Chat      POST /chat                        conversational teaching turn
 *
 * Everything is authenticated; memory/training/agent channels are
 * organization-scoped and refuse a no-organization session with 403.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { ReligionsIntegrationsService } from "../../religions/religions.integrations.service.js";
import { RELIGION_FAMILIES, type ReligionLevel } from "@windels/shared";

const AgentParam = z.object({ agentId: z.string().min(1).max(64) });
const FamilyQuery = z.object({ family: z.enum(RELIGION_FAMILIES).optional() });
const AttachQuery = z.object({ family: z.enum(RELIGION_FAMILIES).optional(), limit: z.coerce.number().int().min(1).max(500).optional() });
const SyncBody = z.object({ family: z.enum(RELIGION_FAMILIES).optional(), force: z.boolean().optional() });
const LessonBody = z.object({ recordId: z.string().min(1).max(64), level: z.enum(["beginner", "intermediate", "advanced", "research"]).default("intermediate") });
const ChatBody = z.object({ question: z.string().min(3).max(500), level: z.enum(["beginner", "intermediate", "advanced", "research"]).default("intermediate") });

export function registerReligionsIntegrationsRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) throw AppError.forbidden("This religion integration channel is organization-scoped and this session carries no organization.");
    return org;
  };
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  router.get("/", async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      res.json({ ok: true, data: await ReligionsIntegrationsService.overview(org), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Memory ───────────────────────────────────────────────────────── */

  router.get("/memory", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      res.json({ ok: true, data: await ReligionsIntegrationsService.memoryStatus(oid), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/memory/sync", validate({ body: SyncBody }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const data = await ReligionsIntegrationsService.syncMemory(oid, req.body);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── AI agents ────────────────────────────────────────────────────── */

  router.post("/agents/:agentId/attach", validate({ params: AgentParam, query: AttachQuery }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      void oid; // agent ownership is enforced by the agentKnowledge service against the caller's org
      const data = await ReligionsIntegrationsService.attachToAgent(req.user!.id, req.params.agentId, req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/agents/:agentId", validate({ params: AgentParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      void oid;
      const attached = await ReligionsIntegrationsService.agentAttachedTitles(req.user!.id, req.params.agentId);
      res.json({
        ok: true,
        data: {
          channel: "agents",
          agentId: req.params.agentId,
          attachedCount: attached.size,
          attachedTitles: [...attached].slice(0, 200),
        },
        meta: meta(req),
      });
    } catch (e) { next(e); }
  });

  /* ── Training Center ──────────────────────────────────────────────── */

  router.post("/training/dataset", validate({ query: FamilyQuery }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const data = await ReligionsIntegrationsService.createTrainingDataset(oid, { family: req.query.family as any });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/training/export", validate({ query: FamilyQuery }), async (req, res, next) => {
    try {
      const corpus = ReligionsIntegrationsService.trainingCorpus({ family: req.query.family as any });
      const jsonl = corpus.map((c) => c.line).join("\n");
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="windels-religions-${String(req.query.family ?? "all")}.jsonl"`);
      res.send(jsonl);
    } catch (e) { next(e); }
  });

  /* ── Education ────────────────────────────────────────────────────── */

  router.get("/education/catalog", async (req, res, next) => {
    try {
      res.json({ ok: true, data: ReligionsIntegrationsService.educationCatalog(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/education/lesson", validate({ body: LessonBody }), async (req, res, next) => {
    try {
      const data = await ReligionsIntegrationsService.startLesson(req.user!.id, req.body.recordId, req.body.level as ReligionLevel);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Conversational teaching ──────────────────────────────────────── */

  router.post("/chat", validate({ body: ChatBody }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      const data = await ReligionsIntegrationsService.chatAnswer(org, {
        question: req.body.question,
        level: req.body.level as ReligionLevel,
      });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });
}
