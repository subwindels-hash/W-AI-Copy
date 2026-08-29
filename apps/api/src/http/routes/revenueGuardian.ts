/**
 * AI Revenue Guardian — HTTP routes.
 *
 * WINDELS AI OS — Enterprise Accounts Receivable & Revenue Recovery.
 * WINDELS is an AI platform, never a broker, exchange, or custodian.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { RevenueGuardianService } from "../../revenueGuardian/revenueGuardian.service.js";
import {
  RgCustomerUpsertSchema, RgInvoiceCreateSchema, RgCollectionCaseCreateSchema,
  RgPaymentPromiseCreateSchema, RgCommunicationCreateSchema, RgAiEmployeeCreateSchema,
  RgTaskCreateSchema, RgCollectionRuleCreateSchema,
  RG_CUSTOMER_STATUSES, RG_RISK_LEVELS, RG_INVOICE_STATUSES,
  RG_CASE_STATUSES, RG_PROMISE_STATUSES, RG_TASK_STATUSES,
} from "@windels/shared/revenueGuardian";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string => req.user!.id!;
const IdParam = z.object({ id: z.string().min(1).max(64) });

export function registerRevenueGuardianRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard & Reports ──────────────────────────────────────────

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.rollup(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/reports/executive", async (req, res, next) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : new Date(Date.now() - 30 * 86400000).toISOString();
      const to = typeof req.query.to === "string" ? req.query.to : new Date().toISOString();
      const data = await RevenueGuardianService.executiveReport(orgOf(req), from, to);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Customers ────────────────────────────────────────────────────

  router.get("/customers", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const status = RG_CUSTOMER_STATUSES.includes(req.query.status as any) ? req.query.status as any : undefined;
      const riskLevel = RG_RISK_LEVELS.includes(req.query.riskLevel as any) ? req.query.riskLevel as any : undefined;
      const data = await RevenueGuardianService.listCustomers(orgOf(req), { q, status, riskLevel });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/customers", validate({ body: RgCustomerUpsertSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createCustomer(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/customers/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.getCustomerProfile(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/customers/:id", validate({ params: IdParam, body: RgCustomerUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.updateCustomer(orgOf(req), req.params.id, req.body);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/customers/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await RevenueGuardianService.deleteCustomer(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Invoices ─────────────────────────────────────────────────────

  router.get("/invoices", async (req, res, next) => {
    try {
      const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
      const status = RG_INVOICE_STATUSES.includes(req.query.status as any) ? req.query.status as any : undefined;
      const data = await RevenueGuardianService.listInvoices(orgOf(req), { customerId, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/invoices", validate({ body: RgInvoiceCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createInvoice(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/invoices/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.getInvoice(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/invoices/:id/pay", validate({ params: IdParam, body: z.object({ amountCents: z.number().int().min(1) }) }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.recordPayment(orgOf(req), req.params.id, req.body.amountCents);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/invoices/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await RevenueGuardianService.deleteInvoice(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Collection Cases ─────────────────────────────────────────────

  router.get("/cases", async (req, res, next) => {
    try {
      const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
      const status = RG_CASE_STATUSES.includes(req.query.status as any) ? req.query.status as any : undefined;
      const data = await RevenueGuardianService.listCases(orgOf(req), { customerId, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/cases", validate({ body: RgCollectionCaseCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createCase(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/cases/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.getCase(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Case not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/cases/:id", validate({ params: IdParam, body: z.object({
    status: z.enum(RG_CASE_STATUSES).optional(),
    priority: z.enum(RG_RISK_LEVELS).optional(),
    aiEmployeeId: z.string().optional(),
    accountManagerId: z.string().optional(),
    resolutionNotes: z.string().optional(),
  }) }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.updateCase(orgOf(req), req.params.id, req.body);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Case not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/cases/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await RevenueGuardianService.deleteCase(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Case not found" } });
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Payment Promises ─────────────────────────────────────────────

  router.get("/promises", async (req, res, next) => {
    try {
      const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
      const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
      const status = RG_PROMISE_STATUSES.includes(req.query.status as any) ? req.query.status as any : undefined;
      const data = await RevenueGuardianService.listPromises(orgOf(req), { customerId, caseId, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/promises", validate({ body: RgPaymentPromiseCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createPromise(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/promises/evaluate", async (req, res, next) => {
    try {
      const result = await RevenueGuardianService.evaluatePromises(orgOf(req));
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Communications ───────────────────────────────────────────────

  router.get("/communications", async (req, res, next) => {
    try {
      const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
      const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
      const data = await RevenueGuardianService.listCommunications(orgOf(req), { customerId, caseId });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/communications", validate({ body: RgCommunicationCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createCommunication(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── AI Employees ─────────────────────────────────────────────────

  router.get("/ai-employees", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.listAiEmployees(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/ai-employees", validate({ body: RgAiEmployeeCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createAiEmployee(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/ai-employees/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await RevenueGuardianService.deleteAiEmployee(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "AI Employee not found" } });
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Tasks ────────────────────────────────────────────────────────

  router.get("/tasks", async (req, res, next) => {
    try {
      const assigneeId = typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined;
      const status = RG_TASK_STATUSES.includes(req.query.status as any) ? req.query.status as any : undefined;
      const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
      const data = await RevenueGuardianService.listTasks(orgOf(req), { assigneeId, status, caseId });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tasks", validate({ body: RgTaskCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createTask(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/tasks/:id/status", validate({ params: IdParam, body: z.object({ status: z.enum(RG_TASK_STATUSES) }) }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.updateTaskStatus(orgOf(req), req.params.id, req.body.status);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/tasks/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await RevenueGuardianService.deleteTask(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Collection Rules ─────────────────────────────────────────────

  router.get("/rules", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.listRules(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/rules", validate({ body: RgCollectionRuleCreateSchema }), async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.createRule(orgOf(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/rules/evaluate", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.evaluateRules(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/rules/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await RevenueGuardianService.deleteRule(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Rule not found" } });
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Account Manager Workspace ────────────────────────────────────

  router.get("/workspace/account-manager", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.getAccountManagerWorkspace(orgOf(req), userOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Automation ───────────────────────────────────────────────────

  router.post("/automation/evaluate-promises", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.evaluatePromises(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/automation/evaluate-rules", async (req, res, next) => {
    try {
      const data = await RevenueGuardianService.evaluateRules(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/automation/refresh-customer/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      await RevenueGuardianService.refreshCustomerAggregates(orgOf(req), req.params.id);
      const customer = await RevenueGuardianService.getCustomer(orgOf(req), req.params.id);
      res.json({ ok: true, data: customer, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
