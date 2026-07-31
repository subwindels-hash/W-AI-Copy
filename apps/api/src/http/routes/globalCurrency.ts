/**
 * Global Multi-Currency & Localization routes (Session 80).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { GlobalCurrencyService } from "../../globalCurrency/globalCurrency.service.js";

const detect = z.object({ country: z.string().length(2).optional(), acceptLanguage: z.string().optional(), ip: z.string().optional() });
const localize = z.object({ amount: z.number(), from: z.string().length(3), to: z.string().length(3), country: z.string().length(2).optional() });
const override = z.object({ rate: z.number().positive() });
const prefs = z.object({
  autoDetect: z.boolean(),
  preferredCurrency: z.string().length(3),
  preferredLanguage: z.string().min(2),
  timezone: z.string(),
  dateFormat: z.string(),
  numberFormat: z.string(),
  taxRegion: z.string().optional(),
});
const fraudCheck = z.object({ from: z.string().length(3), to: z.string().length(3), observedRate: z.number().positive() });
const regionalPrice = z.object({ amountUSD: z.number().positive(), country: z.string().length(2) });
const report = z.object({ rows: z.array(z.object({ amount: z.number(), currency: z.string().length(3) })), target: z.string().length(3) });

export function registerGlobalCurrencyRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/currencies", async (_req, res, next) => {
    try { res.json({ ok: true, data: GlobalCurrencyService.listCurrencies() }); } catch (e) { next(e); }
  });
  router.get("/languages", async (_req, res, next) => {
    try { res.json({ ok: true, data: GlobalCurrencyService.listLanguages() }); } catch (e) { next(e); }
  });
  router.get("/countries", async (_req, res, next) => {
    try { res.json({ ok: true, data: GlobalCurrencyService.listCountries() }); } catch (e) { next(e); }
  });
  router.post("/detect", validate({ body: detect }), (req, res) => {
    res.json({ ok: true, data: GlobalCurrencyService.detect(req.body) });
  });
  router.get("/rates/:from/:to", async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.getRate(req.params.from, req.params.to) }); } catch (e) { next(e); }
  });
  router.post("/rates/:from/:to/override", validate({ body: override }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.setEnterpriseOverride(req.params.from, req.params.to, req.body.rate, req.user?.id ?? "system") }); } catch (e) { next(e); }
  });
  router.post("/localize-price", validate({ body: localize }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.localizePrice(req.body.amount, req.body.from, req.body.to, req.body.country) }); } catch (e) { next(e); }
  });
  router.post("/regional-price", validate({ body: regionalPrice }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.regionalPrice(req.body.amountUSD, req.body.country.toUpperCase()) }); } catch (e) { next(e); }
  });
  router.post("/report", validate({ body: report }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.multiCurrencyReport(req.body.rows, req.body.target) }); } catch (e) { next(e); }
  });
  router.get("/preferences", async (req, res, next) => {
    try { res.json({ ok: true, data: (await GlobalCurrencyService.getPreferences(req.user!.id)) ?? null }); } catch (e) { next(e); }
  });
  router.put("/preferences", validate({ body: prefs }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.setPreferences(req.user!.id, req.body) }); } catch (e) { next(e); }
  });
  router.post("/fraud/check", validate({ body: fraudCheck }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GlobalCurrencyService.checkRateManipulation(req.body.from, req.body.to, req.body.observedRate) }); } catch (e) { next(e); }
  });
  router.get("/agents", async (_req, res, next) => {
    try { res.json({ ok: true, data: GlobalCurrencyService.listAgents() }); } catch (e) { next(e); }
  });
}
