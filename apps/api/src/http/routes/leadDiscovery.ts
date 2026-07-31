import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { LeadDiscoveryService } from "../../leadDiscovery/leadDiscovery.service.js";
export function registerLeadDiscoveryRoutes(router: Router) {
  router.use(authenticate);
  router.post("/search", validate({ body: z.object({ query: z.string().trim().min(3).max(300) }) }), async (req, res, next) => { try { res.json({ ok: true, data: await LeadDiscoveryService.search(req.user!.organizationId!, req.body.query), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.get("/leads", async (req, res, next) => { try { res.json({ ok: true, data: await LeadDiscoveryService.list(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.get("/collections", async (req, res, next) => { try { res.json({ ok: true, data: await LeadDiscoveryService.listCollections(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/collections", validate({ body: z.object({ name: z.string().trim().min(1).max(120) }) }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await LeadDiscoveryService.createCollection(req.user!.organizationId!, req.user!.id, req.body.name), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/collections/:id/leads", validate({ params: z.object({ id: z.string().min(1).max(100) }), body: z.object({ leadId: z.string().min(1).max(100) }) }), async (req, res, next) => { try { res.json({ ok: true, data: await LeadDiscoveryService.addLeadToCollection(req.user!.organizationId!, req.params.id, req.body.leadId), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/export", validate({ body: z.object({ leadIds: z.array(z.string().min(1).max(100)).min(1).max(500), format: z.enum(["json", "csv"]) }) }), async (req, res, next) => { try { const leads = await LeadDiscoveryService.selected(req.user!.organizationId!, req.body.leadIds); if (req.body.format === "json") return res.json({ ok: true, data: { exportedAt: new Date().toISOString(), leads } }); const fields = ["id","name","category","address","phone","website","source","sourceId","discoveredAt","verificationStatus","query"]; const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`; const csv = [fields.join(","), ...leads.map((lead: any) => fields.map((field) => quote(lead[field])).join(","))].join("\n"); res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=windels-leads.csv"); res.send(csv); } catch (e) { next(e); } });
}
