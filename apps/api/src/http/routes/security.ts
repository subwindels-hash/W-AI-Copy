import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import * as perm from "../../services/permissions.service.js";
import { Permission } from "@prisma/client";
import { AppError } from "../../utils/result.js";
import { listKeyInfo } from "../../security/encryption.js";
import { runSelfTests } from "../../security/selfTest.js";
import { scanPrompt } from "../../security/promptGuard.js";
import { assessPassword } from "../../security/passwords.js";
import { breakerStatus, resetBreaker } from "../../security/reliability.js";
import { Limits } from "../../security/rateLimit.js";
import { Metrics } from "../../observability/metrics.js";
import { snapshotRing } from "../../observability/logger.js";
import { SecurityGovernanceService } from "../../security/governance.service.js";
// Response and request contracts live in @windels/shared so the web dashboard
// imports the same definitions instead of re-declaring them by hand.
import {
  PromptGuardScanSchema,
  PasswordStrengthSchema,
  SecurityEventsQuerySchema,
  CreateSecurityIncidentSchema,
  type SecurityScorecard,
  type EncryptionStatus,
  type RateLimitTier,
} from "@windels/shared/security";

export function registerSecurityRoutes(router: Router) {
  router.use(authenticate);
  router.use(async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        throw AppError.forbidden("Admins only");
      }
      next();
    } catch (e) { next(e); }
  });

  // Security scorecard (dashboard header stats)
  router.get("/scorecard", async (_req, res) => {
    const self = runSelfTests();
    const passed = self.filter((t) => t.passed).length;
    const metrics = Metrics.snapshot();
    const blocked = (metrics.counters["security.prompt_injection.blocked"]?.total ?? 0) + (metrics.counters["security.rate_limited"]?.total ?? 0);
    const breaker = breakerStatus();
    const openBreakers = breaker.filter((b) => b.state !== "closed").length;
    // Typed against the shared contract: a renamed or dropped field here is a
    // compile error rather than an `undefined` in the dashboard.
    const data: SecurityScorecard = {
        selfTests: { passed, total: self.length },
        promptInjectionsBlocked: metrics.counters["security.prompt_injection.blocked"]?.total ?? 0,
        rateLimitedRequests: metrics.counters["security.rate_limited"]?.total ?? 0,
        openBreakers,
        encryptionKeys: listKeyInfo(),
        headers: {
          hsts: true, csp: true, noSniff: true, xFrame: "DENY", referrerPolicy: "strict-origin-when-cross-origin",
        },
        totalSecurityEvents: blocked,
        score: Math.round((passed / self.length) * 100) - openBreakers * 5,
    };
    res.json({ ok: true, data });
  });

  // Self test run
  router.get("/self-test", (_req, res) => {
    res.json({ ok: true, data: runSelfTests() });
  });

  // Test prompt guard against arbitrary text (for the dashboard's "try it" input)
  router.post("/prompt-guard/scan", validate({ body: PromptGuardScanSchema }), (req, res) => {
    res.json({ ok: true, data: scanPrompt(req.body.text) });
  });

  // Test password strength
  router.post("/password-strength", validate({ body: z.object({ password: z.string().min(1).max(200) }) }), (req, res) => {
    res.json({ ok: true, data: assessPassword(req.body.password) });
  });

  // Circuit breakers status
  router.get("/breakers", (_req, res) => {
    res.json({ ok: true, data: breakerStatus() });
  });
  router.post("/breakers/:name/reset", (req, res) => {
    resetBreaker(req.params.name);
    res.json({ ok: true, data: breakerStatus() });
  });

  // Rate limit tiers
  router.get("/rate-limits", (_req, res) => {
    const tiers: RateLimitTier[] = Object.entries(Limits).map(([name, l]) => ({
      name, burst: l.max, sustainedPerMin: Math.round(l.refillPerSec * 60), blockSeconds: l.blockSeconds ?? 0,
    }));
    res.json({ ok: true, data: tiers });
  });

  // Security events (aggregated from logs + audit)
  router.get("/events", validate({ query: SecurityEventsQuerySchema }), async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? 200);
      const warnings = snapshotRing({ level: "warn", limit: limit * 2 });
      const errors = snapshotRing({ level: "error", limit: limit });
      const security = [...warnings, ...errors]
        .filter((l) => /rate limit|prompt injection|circuit breaker|csrf|unauthorized|forbidden|failed login|audit/i.test(l.msg + " " + JSON.stringify(l)))
        .slice(-limit)
        .reverse();
      res.json({ ok: true, data: security });
    } catch (e) { next(e); }
  });

  // Encryption status
  router.get("/encryption", (_req, res) => {
    const data: EncryptionStatus = { keys: listKeyInfo(), algorithm: "AES-256-GCM", envelopeVersion: "enc.v1" };
    res.json({ ok: true, data });
  });

  // ── Incident response + access reviews ──────────────────────
  const incidentBody = z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(3).max(5000),
    severity: z.enum(["low","medium","high","critical"]),
    area: z.enum(["auth","data","ai","billing","infra","abuse","other"]),
  });
  const incidentUpdate = z.object({
    status: z.enum(["reported","investigating","contained","resolved","postmortem"]).optional(),
    note: z.string().max(2000).optional(),
  });

  router.post("/incidents", validate({ body: incidentBody }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SecurityGovernanceService.reportIncident((req.user as any).id, req.body) });
    } catch (e) { next(e); }
  });
  router.get("/incidents", validate({ query: z.object({ status: z.enum(["reported","investigating","contained","resolved","postmortem"]).optional(), limit: z.coerce.number().min(1).max(200).optional() }) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SecurityGovernanceService.listIncidents(req.query.status as any, Number(req.query.limit ?? 50)) });
    } catch (e) { next(e); }
  });
  router.patch("/incidents/:id", validate({ params: z.object({ id: z.string().cuid() }), body: incidentUpdate }), async (req, res, next) => {
    try {
      const upd = await SecurityGovernanceService.updateIncident(req.params.id, (req.user as any).id, req.body);
      if (!upd) return res.status(404).json({ ok:false, error:{ code:"NOT_FOUND" } });
      res.json({ ok: true, data: upd });
    } catch (e) { next(e); }
  });
  router.post("/access-reviews/run", validate({ body: z.object({ dormantDays: z.coerce.number().int().min(7).max(365).optional() }) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SecurityGovernanceService.runAccessReview(Number(req.body.dormantDays ?? 90)) });
    } catch (e) { next(e); }
  });
  router.get("/access-reviews/latest", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SecurityGovernanceService.latestAccessReview() }); } catch (e) { next(e); }
  });
}
