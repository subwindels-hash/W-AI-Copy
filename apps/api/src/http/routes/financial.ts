/**
 * WINDELS AI OS — Financial Policy console routes.
 *
 * Exposes the authoritative financial provenance / decision-safety gates that
 * payments, billing, invoices, wallet, trading, risk, valuation and P&L all
 * depend on, plus a tenant-scoped audited decision ledger and a rollup
 * dashboard. Every handler requires `authenticate` + an organization (no
 * org-windels fallback).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { AppError } from "../../utils/result.js";
import {
  FinancialDecisionRequestSchema,
  FinancialProvenanceInputSchema,
} from "@windels/shared";
import { FinancialService } from "../../financial/financial.service.js";

function orgOf(req: any): string {
  const org = (req.user as any)?.organizationId ?? null;
  if (!org) {
    throw AppError.forbidden(
      "The financial ledger is organization-scoped and this session carries no organization.",
    );
  }
  return org;
}

const ledgerInput = z.object({
  source: z.string().min(1).max(200),
  provider: z.string().max(200).nullable().optional(),
  status: z.enum(["REAL", "SIMULATED", "UNAVAILABLE", "UNVERIFIED", "STALE"]),
  safe: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});

const ledgerId = z.object({ id: z.string().min(1).max(80) });

export function registerFinancialRoutes(router: Router) {
  router.use(authenticate);

  router.get("/health", async (req, res, next) => {
    try {
      res.json({ ok: true, data: FinancialService.status() });
    } catch (e) { next(e); }
  });

  router.get("/status", async (req, res, next) => {
    try {
      res.json({ ok: true, data: FinancialService.status() });
    } catch (e) { next(e); }
  });

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await FinancialService.dashboard(orgOf(req)) });
    } catch (e) { next(e); }
  });

  router.get("/ledger", async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? "100");
      const safe = Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.trunc(limit))) : 100;
      res.json({ ok: true, data: await FinancialService.listLedger(orgOf(req), safe) });
    } catch (e) { next(e); }
  });

  /** Non-throwing decision-safety verdict (read-only; not recorded). */
  router.post("/check", validate({ body: FinancialDecisionRequestSchema }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await FinancialService.check(req.body.provenance, {
          allowSandbox: req.body.allowSandbox,
          maxAgeMs: req.body.maxAgeMs,
        }),
      });
    } catch (e) { next(e); }
  });

  /** Throwing decision-safety gate; records the attempt to the ledger. */
  router.post("/decide", validate({ body: FinancialDecisionRequestSchema }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await FinancialService.decide(orgOf(req), req.body.provenance, {
          allowSandbox: req.body.allowSandbox,
          maxAgeMs: req.body.maxAgeMs,
        }),
      });
    } catch (e) { next(e); }
  });

  router.post("/provenance/real", validate({ body: FinancialProvenanceInputSchema }), async (req, res, next) => {
    try {
      res.status(201).json({ ok: true, data: await FinancialService.createReal(orgOf(req), req.body) });
    } catch (e) { next(e); }
  });

  router.post("/provenance/simulated", validate({ body: FinancialProvenanceInputSchema }), async (req, res, next) => {
    try {
      res.status(201).json({ ok: true, data: await FinancialService.createSimulated(orgOf(req), req.body) });
    } catch (e) { next(e); }
  });

  router.post("/provenance/unavailable", validate({ body: FinancialProvenanceInputSchema }), async (req, res, next) => {
    try {
      res.status(201).json({ ok: true, data: await FinancialService.createUnavailable(orgOf(req), req.body) });
    } catch (e) { next(e); }
  });

  /** Explicitly record an audited ledger entry (e.g. from an external audit). */
  router.post("/ledger", validate({ body: ledgerInput }), async (req, res, next) => {
    try {
      res.status(201).json({ ok: true, data: await FinancialService.record(orgOf(req), req.body) });
    } catch (e) { next(e); }
  });

  router.delete("/ledger/:id", validate({ params: ledgerId }), async (req, res, next) => {
    try {
      const ok = await FinancialService.deleteLedger(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
