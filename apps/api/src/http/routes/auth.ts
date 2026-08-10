import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { registerUser, loginUser, completeMfaLogin, refreshAccessToken, logoutUser, requestPasswordReset, resetPassword } from "../../services/auth.service.js";
import type { ApiEnvelope } from "@windels/shared/api";
import { rateLimit } from "../middleware/rateLimit.js";
import { assessPassword } from "../../security/passwords.js";
import { authenticate } from "../middleware/auth.js";

const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(10).max(200).refine((pw) => assessPassword(pw).meetsPolicy, (pw) => ({ message: "Password does not meet policy: " + assessPassword(pw).issues.join(", ") })),
    displayName: z.string().min(1).max(100),
    organizationName: z.string().min(1).max(100),
  }),
};

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
};

const mfaCompleteSchema = {
  body: z.object({
    mfaToken: z.string().min(10),
    totp: z.string().min(6).max(12),
  }),
};

const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(32),
  }),
};

const logoutSchema = {
  body: z.object({
    refreshToken: z.string().min(32).optional(),
    allSessions: z.boolean().optional(),
  }),
};

const forgotSchema = {
  body: z.object({
    email: z.string().email(),
  }),
};

const resetSchema = {
  body: z.object({
    token: z.string().min(20),
    password: z.string().min(10).max(200).refine((pw) => assessPassword(pw).meetsPolicy, (pw) => ({ message: "Password does not meet policy: " + assessPassword(pw).issues.join(", ") })),
  }),
};

export function registerAuthRoutes(router: Router) {
  // Request a password reset email. Always returns a generic 200 (even when the
  // email is unknown) to avoid account enumeration.
  router.post("/auth/forgot", rateLimit("passwordReset"), validate(forgotSchema), async (req, res, next) => {
    try {
      const result = await requestPasswordReset(req.body.email);
      const env: ApiEnvelope<typeof result> = {
        ok: true,
        data: result,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  // Reset the password with a one-time token.
  router.post("/auth/reset", rateLimit("passwordReset"), validate(resetSchema), async (req, res, next) => {
    try {
      const result = await resetPassword(req.body.token, req.body.password);
      const env: ApiEnvelope<typeof result> = {
        ok: true,
        data: result,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  router.post("/auth/register", rateLimit("register"), validate(registerSchema), async (req, res, next) => {
    try {
      const result = await registerUser(req.body);
      const env: ApiEnvelope<typeof result> = {
        ok: true,
        data: result,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.status(201).json(env);
    } catch (e) {
      next(e);
    }
  });

  router.post("/auth/login", rateLimit("login"), validate(loginSchema), async (req, res, next) => {
    try {
      const result = await loginUser(req.body, {
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      const env: ApiEnvelope<typeof result> = {
        ok: true,
        data: result,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  router.post("/auth/mfa/complete", rateLimit("login"), validate(mfaCompleteSchema), async (req, res, next) => {
    try {
      const result = await completeMfaLogin(req.body, {
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      const env: ApiEnvelope<typeof result> = {
        ok: true,
        data: result,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  // ─── Token Refresh ───────────────────────────────────────────
  router.post("/auth/refresh", rateLimit("tokenRefresh"), validate(refreshSchema), async (req, res, next) => {
    try {
      const result = await refreshAccessToken(
        { refreshToken: req.body.refreshToken },
        { ip: req.ip, ua: req.headers["user-agent"] },
      );
      const env: ApiEnvelope<typeof result> = {
        ok: true,
        data: result,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  // ─── Logout ──────────────────────────────────────────────────
  router.post("/auth/logout", authenticate, validate(logoutSchema), async (req, res, next) => {
    try {
      const userId = req.user!.id;
      if (req.body.allSessions) {
        await logoutUser({ userId });
      } else {
        await logoutUser({ refreshToken: req.body.refreshToken, userId });
      }
      res.json({ ok: true, data: { loggedOut: true } });
    } catch (e) {
      next(e);
    }
  });

  // /auth/me uses the shared `authenticate` middleware for a single JWT
  // verification path (previously this handler re-implemented Bearer parsing
  // and JWT verification inline). It is also used by the Google OAuth fragment
  // flow, which passes the token via the Authorization header.
  router.get("/auth/me", authenticate, async (req, res, next) => {
    try {
      const { prisma } = await import("../../db/client.js");
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: { memberships: { take: 1, orderBy: { joinedAt: "asc" } }, profile: true },
      });
      if (!user) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({
        ok: true,
        data: {
          id: user.id,
          email: user.email,
          role: (user.role as string).toLowerCase(),
          displayName: user.profile?.displayName ?? null,
          organizationId: user.memberships[0]?.organizationId ?? null,
        },
      });
    } catch (e) { next(e); }
  });
}
