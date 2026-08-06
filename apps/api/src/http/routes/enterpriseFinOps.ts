/** Session 100 — org-scoped Enterprise FinOps depth routes. */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { EnterpriseFinOpsService } from "../../enterpriseFinOps/enterpriseFinOps.service.js";
import {
  EfoAllocationCreateSchema,
  EfoBudgetUpsertSchema,
  EfoChargebackQuerySchema,
  EfoCostCenterUpsertSchema,
  EfoCostEntryUpsertSchema,
} from "@windels/shared/enterpriseFinOps";

const orgOf = (req: any): string => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;
const IdParam = z.object({ id: z.string().trim().min(1).max(64) });

export function registerEnterpriseFinOpsRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await EnterpriseFinOpsService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  // ── Cost centers ──────────────────────────────────────────────────
  router.get("/cost-centers", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok: true, data: await EnterpriseFinOpsService.listCostCenters(orgOf(req), { status }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.post("/cost-centers", validate({ body: EfoCostCenterUpsertSchema }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.createCostCenter(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.get("/cost-centers/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.getCostCenter(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cost center not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.patch("/cost-centers/:id", validate({ params: IdParam, body: EfoCostCenterUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.updateCostCenter(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cost center not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.delete("/cost-centers/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const deleted = await EnterpriseFinOpsService.deleteCostCenter(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cost center not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  // ── Budgets ───────────────────────────────────────────────────────
  router.get("/budgets", async (req, res, next) => {
    try {
      const costCenterId = typeof req.query.costCenterId === "string" ? req.query.costCenterId : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok: true, data: await EnterpriseFinOpsService.listBudgets(orgOf(req), { costCenterId, status }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.post("/budgets", validate({ body: EfoBudgetUpsertSchema }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.createBudget(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.get("/budgets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.getBudget(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Budget not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.patch("/budgets/:id", validate({ params: IdParam, body: EfoBudgetUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.updateBudget(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Budget not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.delete("/budgets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const deleted = await EnterpriseFinOpsService.deleteBudget(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Budget not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  // ── Actual cost ledger ────────────────────────────────────────────
  router.get("/costs", async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.listCosts(orgOf(req), {
        provider: typeof req.query.provider === "string" ? req.query.provider as any : undefined,
        category: typeof req.query.category === "string" ? req.query.category as any : undefined,
        costCenterId: typeof req.query.costCenterId === "string" ? req.query.costCenterId : undefined,
        currency: typeof req.query.currency === "string" ? req.query.currency : undefined,
      });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.post("/costs", validate({ body: EfoCostEntryUpsertSchema }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.createCost(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.get("/costs/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.getCost(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cost entry not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.delete("/costs/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const deleted = await EnterpriseFinOpsService.deleteCost(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cost entry not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  // ── Allocation ledger ─────────────────────────────────────────────
  router.get("/allocations", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await EnterpriseFinOpsService.listAllocations(orgOf(req), {
        costId: typeof req.query.costId === "string" ? req.query.costId : undefined,
        costCenterId: typeof req.query.costCenterId === "string" ? req.query.costCenterId : undefined,
      }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.post("/allocations", validate({ body: EfoAllocationCreateSchema }), async (req, res, next) => {
    try {
      const data = await EnterpriseFinOpsService.createAllocation(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
  router.delete("/allocations/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const deleted = await EnterpriseFinOpsService.deleteAllocation(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Allocation not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  // ── Derived chargeback statements ─────────────────────────────────
  router.get("/chargebacks", validate({ query: EfoChargebackQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await EnterpriseFinOpsService.chargebacks(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
}
