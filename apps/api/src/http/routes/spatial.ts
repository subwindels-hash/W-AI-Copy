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

  // Dedicated listing endpoints for other spatial components
  router.get("/maps", async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.listMaps((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/waypoints", async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.listWaypoints((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/holo-dashboards", async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.listHoloDashboards((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/remote-expert-sessions", async (req, res, next) => { try { res.json({ ok:true, data: await SpatialService.listRemoteExpertSessions((req.user as any).organizationId) }); } catch (e) { next(e); } });

  // Session 156 — device heartbeat (the live spatial connector)
  router.post("/devices/heartbeat", validate({
    body: z.object({
      fingerprint: z.string().min(2).max(128),
      deviceTarget: z.enum(["vision_pro","hololens","quest","desktop","mobile","smart_glasses"]).optional(),
    }),
  }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SpatialService.heartbeat({
        ...req.body, organizationId: (req.user as any).organizationId,
      }) });
    } catch (e) { next(e); }
  });
}
