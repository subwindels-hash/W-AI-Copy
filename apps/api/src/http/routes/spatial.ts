/** Session 58 — Enterprise Spatial Computing routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { SpatialService } from "../../spatial/spatial.service.js";
import { SPATIAL_MODES } from "@windels/shared";

const SessionSchema = z.object({
  title: z.string().min(2),
  mode: z.enum(SPATIAL_MODES),
  deviceTarget: z.enum(["vision_pro","hololens","quest","desktop","mobile","smart_glasses"]),
  twinId: z.string().optional(),
});

export function registerSpatialRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/sessions", async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.listSessions((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/sessions", validate({ body: SessionSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.createSession({ ...req.body, host: (req.user as any).id, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.post("/sessions/:id/end", async (req, res, next) => { try {
    const s = await SpatialService.endSession(req.params.id, (req.user as any).organizationId);
    if (!s) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"session not found"}});
    res.json({ok:true,data:s});
  } catch (e) { next(e); } });
}
