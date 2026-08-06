import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CrmService } from "../../crm/crm.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  CrmContactUpsertSchema,
  CrmCompanyUpsertSchema,
  CrmDealUpsertSchema,
  CrmActivityCreateSchema,
} from "@windels/shared/crm";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });

export function registerCrmRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard & pipeline definition ────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const data = await CrmService.rollup(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/pipeline/stages", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: CrmService.stages(), meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Contacts ───────────────────────────────────────────────────────
  router.get("/contacts", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const data = await CrmService.listContacts(orgOf(req), { q, companyId, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/contacts", validate({ body: CrmContactUpsertSchema }), async (req, res, next) => {
    try {
      const data = await CrmService.createContact(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/contacts/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await CrmService.getContact(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/contacts/:id", validate({ params: IdParam, body: CrmContactUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await CrmService.updateContact(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/contacts/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await CrmService.deleteContact(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Companies ──────────────────────────────────────────────────────
  router.get("/companies", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const industry = typeof req.query.industry === "string" ? req.query.industry : undefined;
      const data = await CrmService.listCompanies(orgOf(req), { q, industry });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/companies", validate({ body: CrmCompanyUpsertSchema }), async (req, res, next) => {
    try {
      const data = await CrmService.createCompany(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/companies/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await CrmService.getCompany(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Company not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/companies/:id", validate({ params: IdParam, body: CrmCompanyUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await CrmService.updateCompany(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Company not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/companies/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await CrmService.deleteCompany(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Company not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Deals & pipeline ───────────────────────────────────────────────
  router.get("/deals", async (req, res, next) => {
    try {
      const stage = typeof req.query.stage === "string" ? (req.query.stage as any) : undefined;
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const open = req.query.open === "true";
      const data = await CrmService.listDeals(orgOf(req), { stage, companyId, open: open || undefined });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/deals", validate({ body: CrmDealUpsertSchema }), async (req, res, next) => {
    try {
      const data = await CrmService.createDeal(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/deals/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await CrmService.getDeal(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Deal not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/deals/:id", validate({ params: IdParam, body: CrmDealUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await CrmService.updateDeal(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Deal not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/deals/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await CrmService.deleteDeal(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Deal not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Activities ─────────────────────────────────────────────────────
  router.get("/activities", async (req, res, next) => {
    try {
      const contactId = typeof req.query.contactId === "string" ? req.query.contactId : undefined;
      const dealId = typeof req.query.dealId === "string" ? req.query.dealId : undefined;
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const data = await CrmService.listActivities(orgOf(req), { contactId, dealId, companyId, kind });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/activities", validate({ body: CrmActivityCreateSchema }), async (req, res, next) => {
    try {
      const data = await CrmService.createActivity(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/activities/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await CrmService.getActivity(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Activity not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/activities/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await CrmService.deleteActivity(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Activity not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
