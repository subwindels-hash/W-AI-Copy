/**
 * Google OAuth routes (consumer Gmail/Google sign-in, not enterprise SSO).
 *
 * GET  /auth/google              — start OAuth flow (redirects to Google)
 * GET  /auth/google/callback     — handles callback, returns JWT or redirects
 *                                  to frontend with ?token=... (or posts to web)
 * POST /auth/google/status       — indicates if OAuth is configured
 */
import { Router } from "express";
import { z } from "zod";
import { GoogleAuthService } from "../../services/googleAuth.service.js";

export function registerGoogleAuthRoutes(router: Router) {
  router.get("/auth/google/status", (_req, res) => {
    res.json({ ok: true, data: { enabled: GoogleAuthService.enabled() } });
  });

  router.get("/auth/google", async (req, res, next) => {
    try {
      if (!GoogleAuthService.enabled()) {
        return res.status(503).json({ ok: false, error: { code: "PLATFORM_CREDENTIALS_REQUIRED", message: "Google OAuth credentials are not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI." } });
      }
      const redirectAfter = typeof req.query.redirect === "string" ? req.query.redirect : "/";
      const { url } = await GoogleAuthService.startAuth(redirectAfter);
      res.redirect(url);
    } catch (e) { next(e); }
  });

  router.get("/auth/google/callback", async (req, res, next) => {
    try {
      if (!GoogleAuthService.enabled()) {
        return res.status(503).send("PLATFORM CREDENTIALS REQUIRED — Google OAuth is not configured on this WINDELS instance.");
      }
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const state = typeof req.query.state === "string" ? req.query.state : null;
      if (!code || !state) return res.status(400).send("Missing code/state");
      const fe = process.env.WEB_ORIGIN || process.env.API_CORS_ORIGIN || "http://localhost:5173";
      let result: Awaited<ReturnType<typeof GoogleAuthService.handleCallback>>;
      try {
        result = await GoogleAuthService.handleCallback({ code, state });
      } catch (err: any) {
        // Session 114 — an organization's Google sign-in policy refused this
        // account. That is a decision, not a fault: send the browser back to
        // the frontend callback with the reason so it can be shown, rather
        // than surfacing a 500 that says nothing. Every other failure keeps
        // its original path through the error handler.
        if (err?.code === "GOOGLE_SIGNIN_BLOCKED") {
          const params = new URLSearchParams({
            error: "policy_blocked",
            outcome: String(err.outcome ?? "blocked"),
            message: String(err.message ?? "Google sign-in was refused by this organization's policy."),
          });
          return res.redirect(302, `${fe}/auth/callback#${params.toString()}`);
        }
        throw err;
      }
      // Redirect to frontend with token in hash fragment (avoids query-logging on servers)
      res.redirect(302, `${fe}/auth/callback#token=${encodeURIComponent(result.token)}&isNewUser=${result.isNewUser}&redirect=${encodeURIComponent(result.redirectAfter)}`);
    } catch (e) { next(e); }
  });
}
