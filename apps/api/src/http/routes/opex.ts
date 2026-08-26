import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { OpexService } from "../../opex/opex.service.js";
import { GovernanceGatesService } from "../../opex/governanceGates.service.js";
import { RegulationsRegistryService } from "../../opex/regulationsRegistry.service.js";
import {
  OpexGateCreateSchema,
  OpexGateRequestSchema,
  OpexGateDecisionSchema,
  OpexGateIdParamSchema,
  OpexGateRequestIdParamSchema,
  OpexRegulationCreateSchema,
  OpexRegulationUpdateSchema,
  OpexRegulationIdParamSchema,
} from "@windels/shared/opex";
import { AppError } from "../../utils/result.js";
const Alert = z.object({ category: z.string().trim().min(1).max(64), severity: z.enum(["info", "warning", "critical"]), source: z.string().trim().min(1).max(128), message: z.string().trim().min(1).max(5000), model: z.string().max(128).optional() });
const Id = z.object({ id: z.string().min(1).max(100) });
function orgOf(req: any): string {
  const org = (req.user as any)?.organizationId ?? null;
  if (!org) throw AppError.forbidden("The operational-excellence register is organization-scoped and this session carries no organization.");
  return org;
}
export function registerOpexRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await OpexService.dashboard(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/safety-alerts", requireAdmin, validate({ body: Alert }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await OpexService.createAlert(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/safety-alerts/:id/status", requireAdmin, validate({ params: Id, body: z.object({ status: z.enum(["acknowledged", "resolved"]), note: z.string().trim().max(2000).optional() }) }), async (req, res, next) => { try { res.json({ ok: true, data: await OpexService.updateAlert(orgOf(req), req.params.id, (req.user as any).id, req.body.status, req.body.note), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });

  // ── Governance approval gates (org-scoped) ────────────────────────────────
  router.get("/governance/gates", async (req, res, next) => { try { res.json({ ok: true, data: await GovernanceGatesService.listGates(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/governance/gates", requireAdmin, validate({ body: OpexGateCreateSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await GovernanceGatesService.createGate(orgOf(req), req.body, (req.user as any).id), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.get("/governance/gates/:gateId/requests", validate({ params: OpexGateIdParamSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await GovernanceGatesService.listRequests(orgOf(req), req.params.gateId), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/governance/gates/:gateId/requests", validate({ params: OpexGateIdParamSchema, body: OpexGateRequestSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await GovernanceGatesService.openRequest(orgOf(req), req.params.gateId, req.body, (req.user as any).id), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/governance/gates/:gateId/requests/:requestId/decision", requireAdmin, validate({ params: OpexGateRequestIdParamSchema, body: OpexGateDecisionSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await GovernanceGatesService.decideRequest(orgOf(req), req.params.gateId, req.params.requestId, req.body.decision, (req.user as any).id, req.body.reason), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });

  // ── Regulatory register (org-scoped) ──────────────────────────────────────
  router.get("/regulations", async (req, res, next) => { try { res.json({ ok: true, data: await RegulationsRegistryService.list(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/regulations", requireAdmin, validate({ body: OpexRegulationCreateSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await RegulationsRegistryService.create(orgOf(req), req.body, (req.user as any).id), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.patch("/regulations/:regulationId", requireAdmin, validate({ params: OpexRegulationIdParamSchema, body: OpexRegulationUpdateSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await RegulationsRegistryService.update(orgOf(req), req.params.regulationId, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.delete("/regulations/:regulationId", requireAdmin, validate({ params: OpexRegulationIdParamSchema }), async (req, res, next) => { try { const ok = await RegulationsRegistryService.delete(orgOf(req), req.params.regulationId); if (!ok) throw AppError.notFound("Regulation not found in organization"); res.json({ ok: true, data: { deleted: true }, meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
