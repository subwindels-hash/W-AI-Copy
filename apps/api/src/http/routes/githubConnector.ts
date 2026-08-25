/**
 * User GitHub connector.
 *
 *   GET  /github/status          authenticated — config + connection
 *   POST /github/oauth/start     authenticated — returns GitHub authorize URL
 *   GET  /github/callback        public — OAuth code exchange
 *   POST /github/pat             authenticated — connect with a PAT
 *   POST /github/verify          authenticated — re-check the stored token
 *   DELETE /github               authenticated — disconnect
 *   GET  /github/repos           authenticated — list remote repos
 */
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { AppError } from "../../utils/result.js";
import { GithubPatConnectSchema, GithubOauthStartSchema } from "@windels/shared/githubConnector";
import { GithubConnectorService } from "../../githubConnector/githubConnector.service.js";

const orgOf = (req: any): string => {
  const org = req.user?.organizationId ?? null;
  if (!org) throw AppError.forbidden("GitHub connect is organization-scoped and this session has no organization.");
  return org;
};

export function registerGithubConnectorRoutes(router: Router) {
  const github = Router();

  github.get("/callback", async (req, res, next) => {
    try {
      const err = typeof req.query.error === "string" ? req.query.error : null;
      if (err) {
        return res.redirect(302, GithubConnectorService.frontendRedirect("/app/github", {
          error: err,
          message: typeof req.query.error_description === "string" ? req.query.error_description : "GitHub denied access",
        }));
      }
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !state) {
        return res.redirect(302, GithubConnectorService.frontendRedirect("/app/github", {
          error: "missing_code",
          message: "GitHub did not return a code and state",
        }));
      }
      const result = await GithubConnectorService.handleOauthCallback({ code, state });
      return res.redirect(302, GithubConnectorService.frontendRedirect(result.returnTo, { connected: "1" }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "GitHub connect failed";
      return res.redirect(302, GithubConnectorService.frontendRedirect("/app/github", { error: "oauth_failed", message }));
    }
  });

  github.use(authenticate);

  github.get("/status", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GithubConnectorService.getStatus(orgOf(req), req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  github.post("/oauth/start", rateLimit("apiGlobal"), validate({ body: GithubOauthStartSchema }), async (req, res, next) => {
    try {
      const data = await GithubConnectorService.startOauth(orgOf(req), req.user!.id, req.body.returnTo);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  github.post("/pat", rateLimit("apiGlobal"), validate({ body: GithubPatConnectSchema }), async (req, res, next) => {
    try {
      const connection = await GithubConnectorService.connectPat(orgOf(req), req.user!.id, req.body.token);
      res.status(201).json({ ok: true, data: connection, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  github.post("/verify", rateLimit("apiGlobal"), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GithubConnectorService.verify(orgOf(req), req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  github.delete("/", async (req, res, next) => {
    try {
      const removed = await GithubConnectorService.disconnect(orgOf(req), req.user!.id);
      res.json({ ok: true, data: { disconnected: removed }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  github.get("/repos", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GithubConnectorService.listRepos(orgOf(req), req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.use("/github", github);
}
