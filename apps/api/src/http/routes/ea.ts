// WINDELS AI OS — Expert Advisor (EA) routes.
//
// These endpoints are consumed by the MQL5 EA running inside MetaTrader 5.
// They intentionally use lightweight auth (Bearer token) and return compact
// payloads since the EA runs inside a terminal and polls frequently over HTTP(S).
// All routes are public in the Express sense (no session cookie) but require a
// valid EA token issued by POST /ea/register.
import { Router, type Request, type Response, type NextFunction } from "express";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { EaService } from "../../tradingIntel/ea.service.js";
import {
  EaRegistrationSchema, EaFillAckSchema, EaHeartbeatSchema,
} from "@windels/shared/ea";
import { authenticate } from "../middleware/auth.js";
import type { StoredSession } from "../../tradingIntel/ea.service.js";

declare global {
  namespace Express {
    interface Request { eaSession?: StoredSession }
  }
}

export function registerEaRoutes(router: Router) {
  // ── EA-self registration (user-initiated; requires authenticated session).
  //    The UI/bridge calls this on behalf of the EA (the user pastes a short
  //    pairing code, or the EA uses a one-time install token). For Phase 2 we
  //    require a normal authenticated API session; the returned token is what
  //    the EA embeds in its Inputs.
  router.post("/ea/register", authenticate, validate({ body: EaRegistrationSchema }), async (req, res, next) => {
    try {
      const oid = (req as any).user.organizationId;
      const session = await EaService.register(oid, req.body);
      res.status(201).json({ ok: true, data: session, meta: { requestId: (req as any).requestId } });
    } catch (e) { next(e); }
  });

  // ── List + revoke (authenticated, for UI).
  router.get("/ea", authenticate, async (req, res, next) => {
    try {
      const oid = (req as any).user.organizationId;
      res.json({ ok: true, data: await EaService.listEa(oid), meta: { requestId: (req as any).requestId } });
    } catch (e) { next(e); }
  });
  router.delete("/ea/:eaId", authenticate, validate({ params: z.object({ eaId: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try {
      await EaService.revoke((req as any).user.organizationId, req.params.eaId);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  // Session 196 — per-org read of an EA's recent fill acks. The
  // session body carries `organizationId`; we check that the
  // requested eaId is in the same org before exposing the fill
  // history. Returns [] for unknown / cross-tenant eaIds rather
  // than 404, so a UI can render an empty state without leaking
  // existence.
  router.get("/ea/:eaId/fills", authenticate, validate({ params: z.object({ eaId: z.string().min(1).max(64) }), query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }) }), async (req, res, next) => {
    try {
      const oid = (req as any).user.organizationId;
      const { eaId } = req.params;
      const limit = Number((req.query as any).limit ?? 50);
      const sess = await EaService.getSession(eaId);
      if (!sess || sess.organizationId !== oid) {
        return res.json({ ok: true, data: [], meta: { requestId: (req as any).requestId } });
      }
      res.json({ ok: true, data: await EaService.recentFills(eaId, limit), meta: { requestId: (req as any).requestId } });
    } catch (e) { next(e); }
  });

  // ── EA-facing bearer-auth middleware (separate from session auth).
  const eaAuth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const hdr = req.header("authorization") || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : (req.query.token as string | undefined);
      if (!token) return next({ status: 401, message: "bearer token required" } as any);
      const sess = await EaService.authenticateToken(token);
      req.eaSession = sess;
      next();
    } catch (e) { next(e); }
  };

  // ── Poll: long-poll up to 25s, return bundle immediately if signals pending,
  //    otherwise wait briefly. For simplicity we do immediate return (EA polls
  //    at its own interval).
  router.get("/ea/poll", eaAuth, validate({ query: z.object({ wm: z.coerce.number().int().nonnegative().default(0) }) }), async (req, res, next) => {
    try {
      const wm = Number((req.query as any).wm ?? 0);
      const bundle = await EaService.poll(req.eaSession!, wm);
      res.set("cache-control", "no-store");
      res.json({ ok: true, data: bundle });
    } catch (e) { next(e); }
  });

  // ── Fill ack.
  router.post("/ea/fill", eaAuth, validate({ body: EaFillAckSchema }), async (req, res, next) => {
    try {
      const r = await EaService.ackFill(req.eaSession!, req.body);
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  // ── Heartbeat (state + diagnostics).
  router.post("/ea/heartbeat", eaAuth, validate({ body: EaHeartbeatSchema }), async (req, res, next) => {
    try {
      const r = await EaService.heartbeat(req.eaSession!, req.body);
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  // ── Lightweight config (called once at EA OnInit). Returns the same bundle as
  //    poll but with an empty signals list — useful for EA to get magic/limits
  //    before placing its first poll.
  router.get("/ea/config", eaAuth, async (req, res, next) => {
    try {
      const bundle = await EaService.poll(req.eaSession!, -1);
      // Strip signals to keep config tiny.
      const { signals, ...rest } = bundle;
      void signals;
      res.json({ ok: true, data: rest });
    } catch (e) { next(e); }
  });
}
