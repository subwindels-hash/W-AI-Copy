/**
 * Session 113 — Derivatives & Fixed-Income Desk routes.
 *
 * Mounted on a `/derivatives` sub-router that is registered *before* the
 * Session 81 calculator routes. Their paths (`/derivatives/option-greeks`,
 * `/derivatives/implied-vol`, `/derivatives/option-payoff`) do not collide with
 * anything here, and because this router deliberately does **not** call
 * `router.use(authenticate)` — each handler attaches it individually — an
 * unmatched request falls straight through to the Session 81 handlers with
 * their behaviour unchanged.
 *
 * Reads and the stateless calculators need an authenticated caller; anything
 * that mutates the organization's book needs an administrator. Every path is
 * organization-scoped by `req.user.organizationId` and fails closed.
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  DerivBondCreateSchema,
  DerivBondIdParamSchema,
  DerivBondQuerySchema,
  DerivBondUpdateSchema,
  DerivHedgeSchema,
  DerivLadderQuerySchema,
  DerivParityCheckSchema,
  DerivPayoffCurveSchema,
  DerivPortfolioQuerySchema,
  DerivPositionCreateSchema,
  DerivPositionIdParamSchema,
  DerivPositionQuerySchema,
  DerivPositionUpdateSchema,
  DerivScenarioSchema,
} from "@windels/shared/derivatives";
import { DerivativesDeskService } from "../../derivatives/derivativesDesk.service.js";

export function registerDerivativesDeskRoutes(r: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
  const orgOf = (req: any): string => req.user!.organizationId!;
  const userOf = (req: any): string | null => req.user?.id ?? null;

  /* ── Desk rollup ─────────────────────────────────────────────────────── */

  r.get("/desk", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await DerivativesDeskService.summary(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Portfolio views (literal paths, declared before `/positions/:id`) ── */

  r.get("/portfolio", authenticate, validate({ query: DerivPortfolioQuerySchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.portfolio(orgOf(req), req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/portfolio/scenarios", authenticate, validate({ body: DerivScenarioSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.scenarios(orgOf(req), req.body);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/portfolio/hedge", authenticate, validate({ body: DerivHedgeSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.hedge(orgOf(req), req.body.underlying);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Option position book ────────────────────────────────────────────── */

  r.get("/positions", authenticate, validate({ query: DerivPositionQuerySchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.listPositions(orgOf(req), req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/positions", authenticate, requireAdmin, validate({ body: DerivPositionCreateSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.createPosition(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.get("/positions/:id", authenticate, validate({ params: DerivPositionIdParamSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.getPosition(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.patch("/positions/:id", authenticate, requireAdmin, validate({ params: DerivPositionIdParamSchema, body: DerivPositionUpdateSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.updatePosition(orgOf(req), req.params.id, req.body, userOf(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.delete("/positions/:id", authenticate, requireAdmin, validate({ params: DerivPositionIdParamSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.deletePosition(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Stateless analytics over the shared contract ────────────────────── */

  r.post("/payoff-curve", authenticate, validate({ body: DerivPayoffCurveSchema }), (req, res, next) => {
    try {
      res.json({ ok: true, data: DerivativesDeskService.payoffCurve(req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/parity-check", authenticate, validate({ body: DerivParityCheckSchema }), (req, res, next) => {
    try {
      res.json({ ok: true, data: DerivativesDeskService.parityCheck(req.body), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Fixed-income holdings (`/bonds/ladder` before `/bonds/:id`) ─────── */

  r.get("/bonds/ladder", authenticate, validate({ query: DerivLadderQuerySchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.ladder(orgOf(req), (req.query as any).shiftsBps);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.get("/bonds", authenticate, validate({ query: DerivBondQuerySchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.listBonds(orgOf(req), req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/bonds", authenticate, requireAdmin, validate({ body: DerivBondCreateSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.createBond(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.get("/bonds/:id", authenticate, validate({ params: DerivBondIdParamSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.getBond(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.patch("/bonds/:id", authenticate, requireAdmin, validate({ params: DerivBondIdParamSchema, body: DerivBondUpdateSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.updateBond(orgOf(req), req.params.id, req.body, userOf(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.delete("/bonds/:id", authenticate, requireAdmin, validate({ params: DerivBondIdParamSchema }), async (req, res, next) => {
    try {
      const data = await DerivativesDeskService.deleteBond(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });
}
