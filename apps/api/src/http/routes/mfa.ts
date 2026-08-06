/**
 * Multi-factor authentication (TOTP RFC 6238) routes:
 *   GET  /mfa/status           — check if MFA is enabled for current user
 *   POST /mfa/enable           — begin enrollment (returns secret + otpauth URL + recovery codes)
 *   POST /mfa/verify           — during login flow: verify 6-digit TOTP or recovery code
 *   POST /mfa/confirm          — confirm enrollment by verifying a TOTP
 *   POST /mfa/disable          — turn off MFA (requires valid TOTP)
 *   POST /mfa/recovery-codes   — regenerate recovery codes (requires valid TOTP)
 *
 * SESSION 116 — what changed here, and what did not
 * -------------------------------------------------
 * The six paths, their request bodies and their success payloads are unchanged.
 * Three things were added around them:
 *
 *   1. `authenticate` is now attached to each handler. The file previously said
 *      "handled by auth middleware globally" — but no global `authenticate` is
 *      mounted on the v1 router, so every one of these handlers dereferenced an
 *      undefined `req.user` and answered an anonymous caller with a 500. The
 *      only behaviour that changes is that refusal: 401 instead of a crash.
 *   2. Every verification now passes the Session 116 gate first (lockout after
 *      repeated failures, TOTP replay, and the organization's recovery-code
 *      policy) and its outcome is recorded. A user inside their attempt budget
 *      sees exactly what they saw before.
 *   3. Enrolment lifecycle is recorded: `enable` starts it, a successful
 *      `confirm`/`verify` closes it, `disable` clears it. `POST /mfa/confirm`
 *      used to verify a token and record nothing at all.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { MfaService } from "../../services/mfa.service.js";
import { MfaAssuranceService } from "../../mfa/mfaAssurance.service.js";
import { prisma } from "../../db/client.js";

const tokenBody = z.object({ token: z.string().min(6).max(12) });

export function registerMfaRoutes(router: Router) {
  /**
   * Run the Session 116 gate. Returns the HTTP response when the attempt is
   * refused before the secret is ever consulted, or null to carry on.
   */
  async function gateOrRefuse(req: any, res: any): Promise<boolean> {
    const uid = req.user.id;
    const org = req.user.organizationId ?? null;
    const gate = await MfaAssuranceService.gate({ userId: uid, organizationId: org, token: req.body.token });
    if (gate.allowed) return false;
    await MfaAssuranceService.recordBlocked({ userId: uid, organizationId: org, reason: gate.reason });
    if (gate.reason === "locked") {
      res.setHeader("Retry-After", String(gate.lock.retryAfterSeconds));
      res.status(429).json({
        ok: false,
        error: { code: "MFA_LOCKED", message: gate.message, details: { retryAfterSeconds: gate.lock.retryAfterSeconds } },
      });
      return true;
    }
    res.status(400).json({
      ok: false,
      error: {
        code: gate.reason === "replayed" ? "MFA_CODE_REPLAYED" : "MFA_RECOVERY_CODES_DISABLED",
        message: gate.message,
      },
    });
    return true;
  }

  router.get("/mfa/status", authenticate, async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      res.json({ ok: true, data: await MfaService.status(uid) });
    } catch (e) { next(e); }
  });

  router.post("/mfa/enable", authenticate, async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const existing = await MfaService.status(uid);
      if (existing.enabled) return res.status(400).json({ ok: false, error: { code: "MFA_ALREADY_ENABLED", message: "MFA is already enabled. Disable first or verify." } });
      const user = await prisma.user.findUnique({ where: { id: uid } });
      if (!user) return res.status(404).json({ ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } });
      const result = await MfaService.enable(uid, user.email);
      // Session 116: the enrolment is now recorded as *pending*. Until a
      // verification succeeds against this secret the platform does not claim
      // the user ever scanned it.
      await MfaAssuranceService.recordEnrollmentStarted(uid, (req.user as any).organizationId ?? null);
      res.json({ ok: true, data: result });
    } catch (e) { next(e); }
  });

  router.post("/mfa/confirm", authenticate, validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const org = (req.user as any).organizationId ?? null;
      if (await gateOrRefuse(req, res)) return;
      const v = await MfaService.verify(uid, req.body.token);
      await MfaAssuranceService.recordVerification({
        userId: uid, organizationId: org, token: req.body.token,
        ok: v.ok, method: v.method ?? null, reason: v.reason ?? null,
      });
      if (!v.ok) return res.status(400).json({ ok: false, error: { code: "INVALID_TOTP", message: v.reason || "Invalid code" } });
      res.json({ ok: true, data: { verified: true, method: v.method } });
    } catch (e) { next(e); }
  });

  router.post("/mfa/verify", authenticate, validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const org = (req.user as any).organizationId ?? null;
      if (await gateOrRefuse(req, res)) return;
      const v = await MfaService.verify(uid, req.body.token);
      await MfaAssuranceService.recordVerification({
        userId: uid, organizationId: org, token: req.body.token,
        ok: v.ok, method: v.method ?? null, reason: v.reason ?? null,
      });
      res.json({ ok: v.ok, data: v });
    } catch (e) { next(e); }
  });

  router.post("/mfa/disable", authenticate, validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const org = (req.user as any).organizationId ?? null;
      if (await gateOrRefuse(req, res)) return;
      const v = await MfaService.verify(uid, req.body.token);
      await MfaAssuranceService.recordVerification({
        userId: uid, organizationId: org, token: req.body.token,
        ok: v.ok, method: v.method ?? null, reason: v.reason ?? null,
      });
      if (!v.ok) return res.status(400).json({ ok: false, error: { code: "INVALID_TOTP", message: v.reason || "Invalid code" } });
      await MfaService.disable(uid);
      await MfaAssuranceService.recordDisabled(uid, org, uid);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.post("/mfa/recovery-codes", authenticate, validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const org = (req.user as any).organizationId ?? null;
      if (await gateOrRefuse(req, res)) return;
      const v = await MfaService.verify(uid, req.body.token);
      await MfaAssuranceService.recordVerification({
        userId: uid, organizationId: org, token: req.body.token,
        ok: v.ok, method: v.method ?? null, reason: v.reason ?? null,
      });
      if (!v.ok) return res.status(400).json({ ok: false, error: { code: "INVALID_TOTP", message: v.reason || "Invalid code" } });
      const codes = await MfaService.regenerateRecoveryCodes(uid);
      await MfaAssuranceService.recordRecoveryRegenerated(uid, org);
      res.json({ ok: true, data: { recoveryCodes: codes } });
    } catch (e) { next(e); }
  });
}
