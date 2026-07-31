/**
 * Multi-factor authentication (TOTP RFC 6238) routes:
 *   GET  /mfa/status           — check if MFA is enabled for current user
 *   POST /mfa/enable           — begin enrollment (returns secret + otpauth URL + recovery codes)
 *   POST /mfa/verify           — during login flow: verify 6-digit TOTP or recovery code
 *   POST /mfa/confirm          — confirm enrollment by verifying a TOTP
 *   POST /mfa/disable          — turn off MFA (requires valid TOTP)
 *   POST /mfa/recovery-codes   — regenerate recovery codes (requires valid TOTP)
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { MfaService } from "../../services/mfa.service.js";
import { prisma } from "../../db/client.js";

const tokenBody = z.object({ token: z.string().min(6).max(12) });

export function registerMfaRoutes(router: Router) {
  // All MFA routes require authenticated user (handled by auth middleware globally).

  router.get("/mfa/status", async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      res.json({ ok: true, data: await MfaService.status(uid) });
    } catch (e) { next(e); }
  });

  router.post("/mfa/enable", async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const existing = await MfaService.status(uid);
      if (existing.enabled) return res.status(400).json({ ok: false, error: { code: "MFA_ALREADY_ENABLED", message: "MFA is already enabled. Disable first or verify." } });
      const user = await prisma.user.findUnique({ where: { id: uid } });
      if (!user) return res.status(404).json({ ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } });
      const result = await MfaService.enable(uid, user.email);
      res.json({ ok: true, data: result });
    } catch (e) { next(e); }
  });

  router.post("/mfa/confirm", validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const v = await MfaService.verify(uid, req.body.token);
      if (!v.ok) return res.status(400).json({ ok: false, error: { code: "INVALID_TOTP", message: v.reason || "Invalid code" } });
      res.json({ ok: true, data: { verified: true, method: v.method } });
    } catch (e) { next(e); }
  });

  router.post("/mfa/verify", validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const v = await MfaService.verify(uid, req.body.token);
      res.json({ ok: v.ok, data: v });
    } catch (e) { next(e); }
  });

  router.post("/mfa/disable", validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const v = await MfaService.verify(uid, req.body.token);
      if (!v.ok) return res.status(400).json({ ok: false, error: { code: "INVALID_TOTP", message: v.reason || "Invalid code" } });
      await MfaService.disable(uid);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.post("/mfa/recovery-codes", validate({ body: tokenBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const v = await MfaService.verify(uid, req.body.token);
      if (!v.ok) return res.status(400).json({ ok: false, error: { code: "INVALID_TOTP", message: v.reason || "Invalid code" } });
      const codes = await MfaService.regenerateRecoveryCodes(uid);
      res.json({ ok: true, data: { recoveryCodes: codes } });
    } catch (e) { next(e); }
  });
}
