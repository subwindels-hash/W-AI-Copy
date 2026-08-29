import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import * as audit from "../../services/audit.service.js";
import * as perm from "../../services/permissions.service.js";
import * as alerting from "../../services/alerting.service.js";
import * as health from "../../services/health.service.js";
import * as comp from "../../services/compliance.service.js";
import { Permission } from "@prisma/client";
import { AppError } from "../../utils/result.js";
// Session 23 — Engineering Governance
import { CodingStandardsService } from "../../governance/codingStandards.service.js";
import { RepoStandardsService } from "../../governance/repoStandards.service.js";
import { ADRService } from "../../governance/adr.service.js";
import { CodeReviewService } from "../../governance/codeReview.service.js";
import { DependenciesService } from "../../governance/dependencies.service.js";
import { SecurityStandardsService } from "../../governance/securityStandards.service.js";
import type { ADRStatus, ReviewStatus, SecurityControlStatus } from "@windels/shared/governance";

const PERMS = z.enum(["ORG_READ","ORG_WRITE","ORG_ADMIN","WORKFLOW_READ","WORKFLOW_WRITE","WORKFLOW_RUN","AGENT_READ","AGENT_WRITE","TALK_READ","TALK_WRITE","CANVAS_READ","CANVAS_WRITE","BILLING_READ","BILLING_WRITE","DEVELOPER_READ","DEVELOPER_WRITE","AUDIT_READ","ADMIN_STAR"]);

export function registerGovernanceRoutes(router: Router) {
  router.use(authenticate);

  // ─── Permissions / RBAC ─────────────────────────────────────
  router.get("/permissions", async (req, res, next) => {
    try { res.json({ ok: true, data: await perm.listPermissions(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/permissions/grant", validate({ body: z.object({ userId: z.string().cuid(), permission: PERMS, resourceId: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const g = await perm.grantPermission(req.user!.id, req.body.userId, req.body.permission as Permission, req.body.resourceId);
      await audit.auditFromReq(req, "PERMISSION_GRANT", { resourceType: "permission", resourceId: g.id, metadata: { targetUserId: req.body.userId, permission: req.body.permission } });
      res.status(201).json({ ok: true, data: g });
    } catch (e) { next(e); }
  });
  router.delete("/permissions/:id", async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      await perm.revokePermission(req.user!.id, req.params.id);
      await audit.auditFromReq(req, "PERMISSION_REVOKE", { resourceType: "permission", resourceId: req.params.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ─── Audit Logs ─────────────────────────────────────────────
  router.get("/audit", validate({ query: PaginationQuery.extend({ action: z.string().optional(), resourceType: z.string().optional(), userId: z.string().cuid().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.AUDIT_READ))) throw AppError.forbidden("Requires audit:read");
      res.json({ ok: true, data: await audit.listAuditLogs(req.user!.id, req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── Health Monitoring ──────────────────────────────────────
  router.get("/health", async (_req, res) => {
    res.json({ ok: true, data: await health.checkAll() });
  });
  router.get("/health/:service", async (req, res, next) => {
    try { res.json({ ok: true, data: await health.getHealthHistory(req.params.service, Number(req.query.minutes ?? 60)) }); }
    catch (e) { next(e); }
  });

  // ─── Alerts ─────────────────────────────────────────────────
  router.get("/alerts", async (req, res, next) => {
    try { res.json({ ok: true, data: await alerting.listAlerts(req.user!.id, { unreadOnly: req.query.unread === "true" }), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/alerts/read", async (req, res, next) => {
    try { await alerting.markAlertsRead(req.user!.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  router.post("/alerts/:id/dismiss", async (req, res, next) => {
    try { await alerting.dismissAlert(req.user!.id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  router.get("/alert-rules", async (req, res, next) => {
    try { res.json({ ok: true, data: await alerting.listAlertRules(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/alert-rules", validate({ body: z.object({ name: z.string().min(1), event: z.string().min(1), condition: z.string().optional(), severity: z.enum(["INFO","WARNING","CRITICAL"]).optional(), channels: z.array(z.enum(["EMAIL","WEBHOOK","IN_APP"])).optional(), enabled: z.boolean().optional() }) }), async (req, res, next) => {
    try {
      const r = await alerting.createAlertRule(req.user!.id, req.body as any);
      await audit.auditFromReq(req, "ALERT_CREATE", { resourceType: "alertRule", resourceId: r.id });
      res.status(201).json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.patch("/alert-rules/:id", validate({ body: z.object({ name: z.string().optional(), condition: z.string().optional(), severity: z.enum(["INFO","WARNING","CRITICAL"]).optional(), channels: z.array(z.enum(["EMAIL","WEBHOOK","IN_APP"])).optional(), enabled: z.boolean().optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await alerting.updateAlertRule(req.user!.id, req.params.id, req.body as any) }); }
    catch (e) { next(e); }
  });
  router.delete("/alert-rules/:id", async (req, res, next) => {
    try { await alerting.deleteAlertRule(req.user!.id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // ─── Retention & Compliance ─────────────────────────────────
  router.get("/retention", async (req, res, next) => {
    try { res.json({ ok: true, data: await comp.getRetentionPolicies(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/retention", validate({ body: comp.RetentionSchema }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const r = await comp.updateRetentionPolicy(req.user!.id, req.body);
      await audit.auditFromReq(req, "RETENTION_UPDATE", { metadata: req.body });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.post("/retention/apply", async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      res.json({ ok: true, data: await comp.applyRetention() });
    } catch (e) { next(e); }
  });

  router.get("/compliance/report", async (req, res, next) => {
    try { res.json({ ok: true, data: await comp.getComplianceReport(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/exports", async (req, res, next) => {
    try { res.json({ ok: true, data: await comp.listExports(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/exports", validate({ body: z.object({ type: z.enum(["workflows","conversations","talk","profile"]) }) }), async (req, res, next) => {
    try {
      const e = await comp.getDataExport(req.user!.id, req.body.type);
      await audit.auditFromReq(req, "EXPORT", { metadata: { type: req.body.type } });
      res.status(201).json({ ok: true, data: e });
    } catch (e) { next(e); }
  });

  // ─── Session 23: Engineering Governance ──────────────────────
  // GET /engineering/dashboard is unauthenticated-by-default only relative to
  // the route (it inherits router.use(authenticate)); write endpoints require ORG_ADMIN.
  const eng = Router();
  router.use("/engineering", eng);

  // --- Coding Standards ---
  eng.get("/coding-standards", async (_req, res, next) => {
    try { res.json({ ok: true, data: await CodingStandardsService.list() }); } catch (e) { next(e); }
  });
  eng.post("/coding-standards", validate({ body: z.object({ category: z.string(), title: z.string(), description: z.string(), rule: z.string(), severity: z.enum(["required","recommended","optional"]), enabled: z.boolean().optional(), examples: z.object({ good: z.string().optional(), bad: z.string().optional() }).optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const s = await CodingStandardsService.create(req.body);
      res.status(201).json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  eng.patch("/coding-standards/:id", validate({ body: z.object({ enabled: z.boolean().optional(), severity: z.enum(["required","recommended","optional"]).optional(), description: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const s = await CodingStandardsService.update(req.params.id, req.body);
      if (!s) throw AppError.notFound("Standard not found");
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  eng.delete("/coding-standards/:id", async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      res.json({ ok: true, data: { removed: await CodingStandardsService.remove(req.params.id) } });
    } catch (e) { next(e); }
  });

  // --- Repo Standards ---
  eng.get("/repo-standards", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RepoStandardsService.list() }); } catch (e) { next(e); }
  });
  eng.post("/repo-standards", validate({ body: z.object({ area: z.string(), title: z.string(), description: z.string(), enforced: z.boolean(), tooling: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      res.status(201).json({ ok: true, data: await RepoStandardsService.create(req.body) });
    } catch (e) { next(e); }
  });
  eng.patch("/repo-standards/:id", validate({ body: z.object({ enforced: z.boolean().optional(), description: z.string().optional(), tooling: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const s = await RepoStandardsService.update(req.params.id, req.body);
      if (!s) throw AppError.notFound("Not found");
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });

  // --- Architecture Decision Records ---
  eng.get("/adrs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ADRService.list() }); } catch (e) { next(e); }
  });
  eng.post("/adrs", validate({ body: z.object({ title: z.string(), context: z.string(), decision: z.string(), consequences: z.string(), authors: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), status: z.enum(["proposed","accepted","superseded","deprecated","rejected"]).optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      res.status(201).json({ ok: true, data: await ADRService.create(req.body) });
    } catch (e) { next(e); }
  });
  eng.patch("/adrs/:id", validate({ body: z.object({ status: z.enum(["proposed","accepted","superseded","deprecated","rejected"]), supersededBy: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const a = await ADRService.updateStatus(req.params.id, req.body.status as ADRStatus, req.body.supersededBy);
      if (!a) throw AppError.notFound("ADR not found");
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });

  // --- Code Reviews ---
  eng.get("/reviews", validate({ query: z.object({ status: z.enum(["open","approved","changes_requested","merged"]).optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CodeReviewService.list(req.query.status as ReviewStatus | undefined) }); } catch (e) { next(e); }
  });
  eng.post("/reviews", validate({ body: z.object({ title: z.string(), prUrl: z.string().url().optional(), filesChanged: z.number().int().nonnegative().optional() }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await CodeReviewService.create({ ...req.body, author: req.user!.email }) }); } catch (e) { next(e); }
  });
  eng.patch("/reviews/:id/status", validate({ body: z.object({ status: z.enum(["open","approved","changes_requested","merged"]), reviewer: z.string().optional() }) }), async (req, res, next) => {
    try {
      const r = await CodeReviewService.setStatus(req.params.id, req.body.status as ReviewStatus, req.body.reviewer);
      if (!r) throw AppError.notFound("Review not found");
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  eng.post("/reviews/:id/comments", async (req, res, next) => {
    try {
      const r = await CodeReviewService.addComment(req.params.id);
      if (!r) throw AppError.notFound("Review not found");
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  eng.get("/reviews/checklist", (_req, res) => res.json({ ok: true, data: CodeReviewService.checklist() }));
  eng.get("/reviews/metrics", async (_req, res, next) => {
    try { res.json({ ok: true, data: await CodeReviewService.metrics() }); } catch (e) { next(e); }
  });

  // --- Dependencies ---
  eng.get("/dependencies", validate({ query: z.object({ rescan: z.coerce.boolean().optional() }) }), async (req, res, next) => {
    try {
      const rescan = (req.query as { rescan?: boolean }).rescan === true;
      res.json({ ok: true, data: await DependenciesService.list(rescan) });
    } catch (e) { next(e); }
  });
  eng.post("/dependencies/rescan", async (_req, res, next) => {
    try { res.json({ ok: true, data: await DependenciesService.rescan() }); } catch (e) { next(e); }
  });
  eng.get("/dependencies/summary", async (_req, res, next) => {
    try { res.json({ ok: true, data: await DependenciesService.summary() }); } catch (e) { next(e); }
  });

  // --- Security Standards ---
  eng.get("/security", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SecurityStandardsService.list() }); } catch (e) { next(e); }
  });
  eng.post("/security", validate({ body: z.object({ control: z.string(), category: z.string(), status: z.enum(["implemented","partial","missing","not_applicable"]), description: z.string(), implementation: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      res.status(201).json({ ok: true, data: await SecurityStandardsService.create(req.body) });
    } catch (e) { next(e); }
  });
  eng.patch("/security/:id", validate({ body: z.object({ status: z.enum(["implemented","partial","missing","not_applicable"]), implementation: z.string().optional() }) }), async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) throw AppError.forbidden("Admins only");
      const s = await SecurityStandardsService.updateStatus(req.params.id, req.body.status as SecurityControlStatus, req.body.implementation);
      if (!s) throw AppError.notFound("Control not found");
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  eng.get("/security/posture", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SecurityStandardsService.posture() }); } catch (e) { next(e); }
  });

  // --- Aggregate dashboard ---
  eng.get("/dashboard", async (_req, res, next) => {
    try {
      const [coding, repo, adrs, reviews, dependencies, security] = await Promise.all([
        CodingStandardsService.summary(),
        RepoStandardsService.summary(),
        ADRService.summary(),
        CodeReviewService.metrics(),
        DependenciesService.summary().catch(() => ({ total: 0, outdated: 0, vulnerable: 0, criticalVulns: 0, highVulns: 0, unlicensed: 0, lastScanAt: new Date().toISOString() })),
        SecurityStandardsService.posture().catch(() => ({ total: 0, implemented: 0, partial: 0, missing: 0, score: 0 })),
      ]);
      res.json({ ok: true, data: { codingStandards: coding, repoStandards: repo, adrs, reviews, dependencies, security } });
    } catch (e) { next(e); }
  });
}
