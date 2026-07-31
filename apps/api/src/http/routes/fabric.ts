/** Session 56 — Enterprise Intelligence Fabric / Trust / Mission Control routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { FabricService } from "../../fabric/fabric.service.js";

const SandboxSchema = z.object({
  name: z.string().min(2), experiment: z.string().min(2), gpu: z.number().int().min(0).max(8).optional(),
});

export function registerFabricRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/trust", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.evaluateTrust((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/sandboxes", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.listSandboxes((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/sandboxes", validate({ body: SandboxSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.createSandbox({ ...req.body, owner: (req.user as any).id, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.get("/twins", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.listTwins((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/twins/:id/simulate", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.runSimulation(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/packages", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.listPackages((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/alerts/:id/acknowledge", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.acknowledgeAlert(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/bus/recent", async (req, res, next) => { try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    res.json({ ok:true, data: await FabricService.busRecent((req.user as any).organizationId, limit) });
  } catch (e) { next(e); } });
}
