import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AiEconomyService } from "../../aiEconomy/aiEconomy.service.js";

const UsageSchema = z.object({ resource: z.enum(["gpu", "cpu", "ram", "storage", "bandwidth", "tokens"]), quantity: z.number().positive(), unit: z.string().trim().min(1).max(32), costCents: z.number().int().min(0), department: z.string().trim().min(1).max(64) });
const AllocationSchema = z.object({ cluster: z.string().trim().min(1).max(120), gpuType: z.string().trim().min(1).max(64), assignedTo: z.string().trim().min(1).max(160), job: z.string().trim().min(1).max(200), utilizationPct: z.number().min(0).max(100), vramUsedGb: z.number().min(0), costPerHour: z.number().min(0) });

export function registerAiEconomyRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await AiEconomyService.dashboard(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/usage", requireAdmin, validate({ body: UsageSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await AiEconomyService.recordUsage(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/allocations", requireAdmin, validate({ body: AllocationSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await AiEconomyService.createAllocation(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
