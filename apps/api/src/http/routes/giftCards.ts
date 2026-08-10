/**
 * WMPC Gift Card Payment Platform routes (Session 79).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { GiftCardsService } from "../../giftCards/giftCards.service.js";

const issue = z.object({
  type: z.enum(["physical","digital","virtual","one-time","reloadable","promotional","enterprise","corporate-reward","employee-incentive","educational"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
  pin: z.string().min(4).max(8).optional(),
  recipientId: z.string().optional(),
  personalMessage: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
});
const reload = z.object({ amount: z.number().positive() });
const redeem = z.object({ amount: z.number().positive(), pin: z.string().optional(), orderId: z.string().optional() });
const activate = z.object({ pin: z.string().optional() });
const freeze = z.object({ reason: z.string().min(3) });

export function registerGiftCardsRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/cards", async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.listCards(req.query.status as any) }); } catch (e) { next(e); }
  });
  router.post("/cards", validate({ body: issue }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.issue({ ...req.body, issuerId: req.user?.id }) }); } catch (e) { next(e); }
  });
  router.get("/cards/:id", async (req, res, next) => {
    try {
      const c = await GiftCardsService.getCard(req.params.id);
      if (!c) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Card not found" } });
      res.json({ ok: true, data: c });
    } catch (e) { next(e); }
  });
  router.post("/cards/:id/activate", validate({ body: activate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.activate(req.params.id, req.body.pin) }); } catch (e) { next(e); }
  });
  router.post("/cards/:id/reload", validate({ body: reload }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.reload(req.params.id, req.body.amount) }); } catch (e) { next(e); }
  });
  router.post("/cards/:id/redeem", validate({ body: redeem }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.redeem(req.params.id, req.body.amount, req.body.pin, req.body.orderId) }); } catch (e) { next(e); }
  });
  router.post("/cards/:id/expire", async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.expire(req.params.id) }); } catch (e) { next(e); }
  });
  router.post("/cards/:id/freeze", validate({ body: freeze }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.freeze(req.params.id, req.body.reason) }); } catch (e) { next(e); }
  });
  router.post("/cards/:id/unfreeze", async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.unfreeze(req.params.id) }); } catch (e) { next(e); }
  });
  router.post("/cards/:id/apply-invoice", validate({ body: z.object({ invoiceId: z.string().cuid(), pin: z.string().optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.applyToInvoice(req.params.id, req.body.invoiceId, req.body.pin) }); } catch (e) { next(e); }
  });
  router.get("/transactions", async (req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.listTransactions(req.query.cardId as any) }); } catch (e) { next(e); }
  });
  router.get("/fraud", async (req, res, next) => {
    try {
      const resolved = req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : undefined;
      res.json({ ok: true, data: await GiftCardsService.listFraud(resolved) });
    } catch (e) { next(e); }
  });
  router.post("/fraud/:id/resolve", async (req, res, next) => {
    try {
      const resolvedBy = req.user?.id;
      res.json({ ok: true, data: await GiftCardsService.resolveFraudFlag(req.params.id, resolvedBy) });
    } catch (e) { next(e); }
  });
  router.get("/loyalty", async (_req, res, next) => {
    try { res.json({ ok: true, data: await GiftCardsService.listLoyaltyPrograms() }); } catch (e) { next(e); }
  });
  router.get("/agents", async (_req, res, next) => {
    try { res.json({ ok: true, data: GiftCardsService.listAgents() }); } catch (e) { next(e); }
  });
  router.get("/payment-method", async (_req, res, next) => {
    try { res.json({ ok: true, data: GiftCardsService.paymentMethodDescriptor() }); } catch (e) { next(e); }
  });
}
