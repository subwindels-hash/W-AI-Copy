/**
 * Session 20 — AI Workforce Communication routes.
 *
 * Mounted at /api/v1/agents/comm (under the agents sub-router in server.ts).
 *
 *  ── Slice 171: Identities ──
 *   GET    /agents/comm/identities
 *   GET    /agents/comm/identities/:id
 *   PATCH  /agents/comm/identities/:id
 *   POST   /agents/comm/identities/:id/lifecycle   { to }
 *   POST   /agents/comm/identities/:id/capabilities
 *   POST   /agents/comm/identities/:id/credentials { scopes, ttlDays } → returns rawKey once
 *   DELETE /agents/comm/identities/:id/credentials/:credId
 *
 *  ── Slice 172: Messaging ──
 *   POST   /agents/comm/messages          (send envelope)
 *   GET    /agents/comm/messages/inbox/:agentId
 *   GET    /agents/comm/messages/outbox/:agentId
 *   GET    /agents/comm/messages/history
 *
 *  ── Slice 173: Collaboration / Teams / Handoffs ──
 *   GET    /agents/comm/teams
 *   POST   /agents/comm/teams
 *   GET    /agents/comm/teams/:id
 *   PATCH  /agents/comm/teams/:id/members  { agentId, role?, capacity?, skills?, op: "add"|"remove"|"role" }
 *   DELETE /agents/comm/teams/:id
 *   GET    /agents/comm/handoffs
 *   POST   /agents/comm/handoffs
 *   POST   /agents/comm/handoffs/:id/respond   { accept, note? }
 *   POST   /agents/comm/handoffs/:id/complete
 *
 *  ── Slice 174: Reasoning exchange ──
 *   GET    /agents/comm/reasoning
 *   POST   /agents/comm/reasoning
 *   GET    /agents/comm/reasoning/:id
 *   GET    /agents/comm/reasoning/chain/:chainId
 *   POST   /agents/comm/reasoning/:id/evidence
 *   POST   /agents/comm/reasoning/:id/steps
 *   POST   /agents/comm/reasoning/:id/conclude
 *   POST   /agents/comm/reasoning/:id/critique
 *
 *  ── Slice 175: Feedback & metrics ──
 *   POST   /agents/comm/feedback
 *   GET    /agents/comm/feedback
 *   GET    /agents/comm/feedback/agent/:agentId
 *   GET    /agents/comm/metrics/:agentId
 *
 *  ── Slice 176: Escalation ──
 *   GET    /agents/comm/policies
 *   POST   /agents/comm/policies
 *   PATCH  /agents/comm/policies/:id
 *   DELETE /agents/comm/policies/:id
 *   POST   /agents/comm/policies/:id/toggle
 *   POST   /agents/comm/escalations/evaluate
 *   GET    /agents/comm/escalations
 *   POST   /agents/comm/escalations/:id/decide
 *   POST   /agents/comm/escalations/:id/acknowledge
 *
 *  ── Aggregate ──
 *   GET    /agents/comm/stats
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AgentIdentityService } from "../../enterprise/agentComm/agentIdentity.service.js";
import { CommProtocolService } from "../../enterprise/agentComm/commProtocol.service.js";
import { CollaborationService } from "../../enterprise/agentComm/collaboration.service.js";
import { ReasoningService } from "../../enterprise/agentComm/reasoning.service.js";
import { FeedbackService } from "../../enterprise/agentComm/feedback.service.js";
import { EscalationService } from "../../enterprise/agentComm/escalation.service.js";
import type { CommPriority, AgentLifecycle, TeamRole, FeedbackKind, ReasoningStatus } from "@windels/shared/agentComm";

const LifecycleEnum = z.enum(["created","trained","active","optimized","suspended","archived","retired"]);
const PriorityEnum = z.enum(["low","normal","high","urgent"]);
const MsgTypeEnum = z.enum(["request","response","event","heartbeat","reasoning","feedback","escalation","handoff"]);
const TeamRoleEnum = z.enum(["coordinator","worker","reviewer","observer"]);
const FeedbackKindEnum = z.enum(["upvote","downvote","correction","reward","rating","comment"]);
const RefTypeEnum = z.enum(["message","reasoning","task","handoff"]);
const ClassifEnum = z.enum(["public","internal","confidential","restricted","pii"]);
const StatusEnum = z.enum(["proposed","reviewed","verified","rejected","draft"]);
const VerdictEnum = z.enum(["approve","revise","reject"]);
const StepTypeEnum = z.enum(["observation","deduction","assumption","conclusion"]);
const StrengthEnum = z.enum(["weak","moderate","strong","conclusive"]);

export function registerAgentCommRoutes(router: Router) {
  // All sub-routes here inherit authenticate from the parent agents router —
  // but we register this file directly under the enterprise agents router which
  // already uses authenticate. For belt-and-suspenders:
  // (server.ts mounts this on agentsRouter which already calls authenticate.)

  // ───────────── Slice 171: Identities ────────────────────────────────
  router.get("/comm/identities", async (_req, res, next) => {
    try { res.json({ ok: true, data: { identities: await AgentIdentityService.list() } }); }
    catch (e) { next(e); }
  });
  router.get("/comm/identities/:id", async (req, res, next) => {
    try {
      const i = await AgentIdentityService.get(req.params.id);
      if (!i) return res.status(404).json({ ok: false, error: { message: "identity not found" } });
      res.json({ ok: true, data: i });
    } catch (e) { next(e); }
  });
  router.patch("/comm/identities/:id", validate({ body: z.object({
    displayName: z.string().optional(),
    department: z.string().optional(),
    managerId: z.string().nullable().optional(),
    permissions: z.array(z.string()).optional(),
    version: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
    endpoint: z.string().nullable().optional(),
  }) }), async (req, res, next) => {
    try {
      const i = await AgentIdentityService.update(req.params.id, {
        ...req.body,
        managerId: req.body.managerId === null ? undefined : req.body.managerId,
        endpoint: req.body.endpoint === null ? undefined : req.body.endpoint,
      });
      if (!i) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: i });
    } catch (e) { next(e); }
  });
  router.post("/comm/identities/:id/lifecycle", validate({ body: z.object({ to: LifecycleEnum }) }), async (req, res, next) => {
    try {
      const i = await AgentIdentityService.transition(req.params.id, req.body.to as AgentLifecycle);
      if (!i) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: i });
    } catch (e) { next(e); }
  });
  router.post("/comm/identities/:id/capabilities", validate({ body: z.object({
    id: z.string(), description: z.string().optional(), attestedBy: z.string().optional(), version: z.string().optional(),
  }) }), async (req, res, next) => {
    try {
      const i = await AgentIdentityService.attestCapability(req.params.id, req.body);
      res.json({ ok: true, data: i });
    } catch (e) { next(e); }
  });
  router.post("/comm/identities/:id/credentials", validate({ body: z.object({
    scopes: z.array(z.string()).default([]), ttlDays: z.number().int().positive().optional(),
  }) }), async (req, res, next) => {
    try {
      const r = await AgentIdentityService.mintCredential(req.params.id, req.body.scopes, req.body.ttlDays);
      if (!r) return res.status(404).json({ ok: false });
      res.status(201).json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.delete("/comm/identities/:id/credentials/:credId", async (req, res, next) => {
    try {
      const i = await AgentIdentityService.revokeCredential(req.params.id, req.params.credId);
      if (!i) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: i });
    } catch (e) { next(e); }
  });

  // ───────────── Slice 172: Messaging ────────────────────────────────
  router.post("/comm/messages", validate({ body: z.object({
    from: z.string(), to: z.string(), type: MsgTypeEnum, subject: z.string().min(1),
    payload: z.record(z.any()).default({}),
    schema: z.string().optional(), priority: PriorityEnum.default("normal"),
    correlationId: z.string().optional(), causationId: z.string().optional(),
    reasoningChainId: z.string().optional(),
    ttlMs: z.number().int().positive().optional(),
    requiresAck: z.boolean().default(false),
    metadata: z.record(z.any()).optional(),
  }) }), async (req, res, next) => {
    try {
      // Resolve team destinations
      let to = req.body.to;
      if (to.startsWith("team:")) {
        const resolved = await CollaborationService.resolveDestination(to);
        if (!resolved) return res.status(400).json({ ok: false, error: { message: "team has no coordinator" } });
        to = resolved;
      }
      const e = await CommProtocolService.send({ ...req.body, to });
      res.status(201).json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.get("/comm/messages/inbox/:agentId", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      res.json({ ok: true, data: { messages: await CommProtocolService.listInbox(req.params.agentId, limit) } });
    } catch (e) { next(e); }
  });
  router.get("/comm/messages/outbox/:agentId", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      res.json({ ok: true, data: { messages: await CommProtocolService.listOutbox(req.params.agentId, limit) } });
    } catch (e) { next(e); }
  });
  router.get("/comm/messages/history", async (_req, res, next) => {
    try { res.json({ ok: true, data: { messages: await CommProtocolService.listHistory(200) } }); }
    catch (e) { next(e); }
  });

  // ───────────── Slice 173: Teams / Handoffs ─────────────────────────
  router.get("/comm/teams", async (_req, res, next) => {
    try { res.json({ ok: true, data: { teams: await CollaborationService.listTeams() } }); }
    catch (e) { next(e); }
  });
  router.post("/comm/teams", validate({ body: z.object({
    name: z.string().min(1), mission: z.string().min(1), department: z.string().optional(),
    coordinatorId: z.string().optional(),
    members: z.array(z.object({
      agentId: z.string(), role: TeamRoleEnum.default("worker"),
      skills: z.array(z.string()).default([]), capacity: z.number().min(0).max(1).default(1),
    })).default([]),
    metadata: z.record(z.any()).optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await CollaborationService.createTeam(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/comm/teams/:id", async (req, res, next) => {
    try {
      const t = await CollaborationService.getTeam(req.params.id);
      if (!t) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: t });
    } catch (e) { next(e); }
  });
  router.patch("/comm/teams/:id/members", validate({ body: z.object({
    agentId: z.string(),
    op: z.enum(["add","remove","role"]),
    role: TeamRoleEnum.optional(),
    skills: z.array(z.string()).optional(),
    capacity: z.number().min(0).max(1).optional(),
  }) }), async (req, res, next) => {
    try {
      const { agentId, op, role, skills, capacity } = req.body;
      let t;
      if (op === "remove") t = await CollaborationService.removeMember(req.params.id, agentId);
      else if (op === "role" && role) t = await CollaborationService.setMemberRole(req.params.id, agentId, role as TeamRole);
      else t = await CollaborationService.addMember(req.params.id, { agentId, role: (role ?? "worker") as TeamRole, skills: skills ?? [], capacity: capacity ?? 1 });
      if (!t) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: t });
    } catch (e) { next(e); }
  });
  router.delete("/comm/teams/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await CollaborationService.deleteTeam(req.params.id) } }); }
    catch (e) { next(e); }
  });

  router.get("/comm/handoffs", async (req, res, next) => {
    try {
      res.json({ ok: true, data: { handoffs: await CollaborationService.listHandoffs({
        taskId: req.query.taskId as string, agentId: req.query.agentId as string,
        status: req.query.status as any,
      }) } });
    } catch (e) { next(e); }
  });
  router.post("/comm/handoffs", validate({ body: z.object({
    taskId: z.string(), fromAgentId: z.string(), toAgentId: z.string(),
    reason: z.string().min(1), context: z.record(z.any()).default({}),
  }) }), async (req, res, next) => {
    try {
      const h = await CollaborationService.createHandoff(req.body);
      // Notify receiving agent via protocol
      await CommProtocolService.send({
        from: req.body.fromAgentId, to: req.body.toAgentId, type: "handoff",
        subject: `Task handoff: ${req.body.taskId}`,
        payload: { handoffId: h.id, taskId: h.taskId, context: h.context, reason: h.reason },
        correlationId: h.id, requiresAck: true, priority: "normal",
      }).catch(() => {});
      res.status(201).json({ ok: true, data: h });
    } catch (e) { next(e); }
  });
  router.post("/comm/handoffs/:id/respond", validate({ body: z.object({ accept: z.boolean(), note: z.string().optional() }) }), async (req, res, next) => {
    try {
      const h = await CollaborationService.respondHandoff(req.params.id, req.body.accept, req.body.note);
      if (!h) return res.status(404).json({ ok: false });
      await CommProtocolService.send({
        from: h.toAgentId, to: h.fromAgentId, type: "handoff",
        subject: `Handoff ${req.body.accept ? "accepted" : "rejected"}: ${h.taskId}`,
        payload: { handoffId: h.id, accepted: req.body.accept, note: req.body.note },
        correlationId: h.id,
      }).catch(() => {});
      res.json({ ok: true, data: h });
    } catch (e) { next(e); }
  });
  router.post("/comm/handoffs/:id/complete", async (req, res, next) => {
    try {
      const h = await CollaborationService.completeHandoff(req.params.id);
      if (!h) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: h });
    } catch (e) { next(e); }
  });

  // ───────────── Slice 174: Reasoning ────────────────────────────────
  router.get("/comm/reasoning", async (req, res, next) => {
    try {
      res.json({ ok: true, data: { artifacts: await ReasoningService.list({
        status: req.query.status as ReasoningStatus,
        authorAgentId: req.query.authorAgentId as string,
        limit: Math.min(Number(req.query.limit ?? 50), 200),
      }) } });
    } catch (e) { next(e); }
  });
  router.post("/comm/reasoning", validate({ body: z.object({
    authorAgentId: z.string(), subject: z.string().min(1), hypothesis: z.string().min(1),
    chainId: z.string().optional(),
    evidence: z.array(z.object({ source: z.string(), content: z.string(), strength: StrengthEnum, confidence: z.number().min(0).max(1).optional() })).default([]),
    steps: z.array(z.object({ note: z.string(), stepType: StepTypeEnum })).default([]),
    confidence: z.number().min(0).max(1).optional(),
    metadata: z.record(z.any()).optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await ReasoningService.create(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/comm/reasoning/:id", async (req, res, next) => {
    try {
      const a = await ReasoningService.get(req.params.id);
      if (!a) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.get("/comm/reasoning/chain/:chainId", async (req, res, next) => {
    try { res.json({ ok: true, data: { artifacts: await ReasoningService.listChain(req.params.chainId) } }); }
    catch (e) { next(e); }
  });
  router.post("/comm/reasoning/:id/evidence", validate({ body: z.object({
    source: z.string(), content: z.string(), strength: StrengthEnum, confidence: z.number().min(0).max(1).optional(),
  }) }), async (req, res, next) => {
    try {
      const a = await ReasoningService.addEvidence(req.params.id, req.body);
      if (!a) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.post("/comm/reasoning/:id/steps", validate({ body: z.object({ note: z.string(), stepType: StepTypeEnum }) }), async (req, res, next) => {
    try {
      const a = await ReasoningService.addStep(req.params.id, req.body);
      if (!a) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.post("/comm/reasoning/:id/conclude", validate({ body: z.object({
    conclusion: z.string().min(1), confidence: z.number().min(0).max(1).optional(),
    status: StatusEnum.default("reviewed"),
  }) }), async (req, res, next) => {
    try {
      const a = await ReasoningService.conclude(req.params.id, req.body.conclusion, req.body.confidence, req.body.status as ReasoningStatus);
      if (!a) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.post("/comm/reasoning/:id/critique", validate({ body: z.object({
    reviewerAgentId: z.string(), note: z.string().min(1), verdict: VerdictEnum,
  }) }), async (req, res, next) => {
    try {
      const a = await ReasoningService.critique(req.params.id, req.body.reviewerAgentId, req.body.note, req.body.verdict);
      if (!a) return res.status(404).json({ ok: false });
      // Notify author
      await CommProtocolService.send({
        from: req.body.reviewerAgentId, to: a.authorAgentId, type: "reasoning",
        subject: `Critique on "${a.subject}"`,
        payload: { artifactId: a.id, verdict: req.body.verdict, note: req.body.note },
        reasoningChainId: a.chainId,
      }).catch(() => {});
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });

  // ───────────── Slice 175: Feedback ────────────────────────────────
  router.post("/comm/feedback", validate({ body: z.object({
    targetAgentId: z.string(), fromId: z.string(), kind: FeedbackKindEnum,
    refType: RefTypeEnum.optional(), refId: z.string().optional(),
    value: z.number().optional(), comment: z.string().optional(),
    skills: z.array(z.string()).default([]),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await FeedbackService.record(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/comm/feedback", async (req, res, next) => {
    try { res.json({ ok: true, data: { feedback: await FeedbackService.list({ kind: req.query.kind as FeedbackKind, refType: req.query.refType as any, limit: 100 }) } }); }
    catch (e) { next(e); }
  });
  router.get("/comm/feedback/agent/:agentId", async (req, res, next) => {
    try { res.json({ ok: true, data: { feedback: await FeedbackService.listForAgent(req.params.agentId, Math.min(Number(req.query.limit ?? 50), 200)) } }); }
    catch (e) { next(e); }
  });
  router.get("/comm/metrics/:agentId", async (req, res, next) => {
    try {
      const window = (req.query.window as any) ?? "all";
      res.json({ ok: true, data: await FeedbackService.getMetrics(req.params.agentId, window) });
    } catch (e) { next(e); }
  });

  // ───────────── Slice 176: Escalation ──────────────────────────────
  router.get("/comm/policies", async (_req, res, next) => {
    try { res.json({ ok: true, data: { policies: await EscalationService.listPolicies() } }); }
    catch (e) { next(e); }
  });
  router.post("/comm/policies", validate({ body: z.object({
    name: z.string().min(1), description: z.string().optional(), scope: z.string().default("*"),
    conditions: z.object({
      minConfidence: z.number().min(0).max(1).optional(),
      maxCostMicros: z.number().int().positive().optional(),
      maxRetries: z.number().int().nonnegative().optional(),
      priorityAtLeast: PriorityEnum.optional(),
      dataClassifications: z.array(ClassifEnum).optional(),
      customRule: z.string().optional(),
    }).default({}),
    actions: z.array(z.enum(["notify_manager","request_human_approval","reroute_team","pause_task","fail_task","invoke_governance"])).min(1),
    routeTo: z.string().optional(), slaMs: z.number().int().positive().optional(),
    enabled: z.boolean().default(true),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await EscalationService.createPolicy(req.body) }); }
    catch (e) { next(e); }
  });
  router.patch("/comm/policies/:id", validate({ body: z.object({
    name: z.string().optional(), description: z.string().optional(), scope: z.string().optional(),
    conditions: z.any().optional(), actions: z.array(z.string()).optional(),
    routeTo: z.string().nullable().optional(), slaMs: z.number().int().positive().nullable().optional(),
    enabled: z.boolean().optional(),
  }) }), async (req, res, next) => {
    try {
      const p = await EscalationService.updatePolicy(req.params.id, {
        ...req.body,
        routeTo: req.body.routeTo === null ? undefined : req.body.routeTo,
        slaMs: req.body.slaMs === null ? undefined : req.body.slaMs,
      });
      if (!p) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });
  router.delete("/comm/policies/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await EscalationService.deletePolicy(req.params.id) } }); }
    catch (e) { next(e); }
  });
  router.post("/comm/policies/:id/toggle", validate({ body: z.object({ enabled: z.boolean() }) }), async (req, res, next) => {
    try {
      const p = await EscalationService.togglePolicy(req.params.id, req.body.enabled);
      if (!p) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });
  router.post("/comm/escalations/evaluate", validate({ body: z.object({
    fromAgentId: z.string(), confidence: z.number().min(0).max(1).optional(),
    estimatedCostMicros: z.number().int().nonnegative().optional(),
    retries: z.number().int().nonnegative().optional(),
    priority: PriorityEnum.optional(),
    dataClassifications: z.array(ClassifEnum).optional(),
    taskId: z.string().optional(), correlationId: z.string().optional(), reason: z.string().optional(),
  }) }), async (req, res, next) => {
    try {
      const esc = await EscalationService.evaluate(req.body);
      res.status(esc ? 201 : 200).json({ ok: true, data: { escalation: esc, matched: !!esc } });
    } catch (e) { next(e); }
  });
  router.get("/comm/escalations", async (req, res, next) => {
    try {
      res.json({ ok: true, data: { escalations: await EscalationService.list({
        status: req.query.status as any, toId: req.query.toId as string, fromAgentId: req.query.fromAgentId as string,
      }) } });
    } catch (e) { next(e); }
  });
  router.post("/comm/escalations/:id/decide", validate({ body: z.object({ approved: z.boolean(), deciderId: z.string(), note: z.string().optional() }) }), async (req, res, next) => {
    try {
      const e = await EscalationService.decide(req.params.id, req.body.approved, req.body.deciderId, req.body.note);
      if (!e) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.post("/comm/escalations/:id/acknowledge", validate({ body: z.object({ deciderId: z.string() }) }), async (req, res, next) => {
    try {
      const e = await EscalationService.acknowledge(req.params.id, req.body.deciderId);
      if (!e) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });

  // ───────────── Aggregate stats ────────────────────────────────────
  router.get("/comm/stats", async (_req, res, next) => {
    try {
      const [identities, teams, { total: msgTotal }, reasoning, feedback, openEsc, policies] = await Promise.all([
        AgentIdentityService.count(),
        CollaborationService.listTeams().then((t) => t.length),
        CommProtocolService.stats(),
        ReasoningService.count(),
        FeedbackService.count(),
        EscalationService.countOpen(),
        EscalationService.countPolicies(),
      ]);
      res.json({
        ok: true,
        data: {
          identities, teams, messagesInFlight: 0, messagesTotal: msgTotal,
          reasoningArtifacts: reasoning, feedbackSignals: feedback,
          openEscalations: openEsc, policies,
        },
      });
    } catch (e) { next(e); }
  });
}
