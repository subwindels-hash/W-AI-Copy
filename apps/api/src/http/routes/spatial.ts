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

/**
 * Session 168 — every tenant-scoped route needs an organization context.
 *
 * These routes previously read `(req.user as any).organizationId` inline with
 * no null check, and every service method defaults its `oid` parameter to
 * "org-windels". A token carrying a null organization therefore resolved to
 * `undefined`, the default engaged, and the request silently read and WROTE
 * the house organization's data. The module's own /notes sub-router already
 * guarded this way; the real routes did not.
 */
function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerSpatialRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.dashboard(oid) });
  } catch (e) { next(e); } });
  router.get("/sessions", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.listSessions(oid) });
  } catch (e) { next(e); } });
  router.post("/sessions", validate({ body: SessionSchema }), async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.createSession({ ...req.body, host: (req.user as any).id, organizationId: oid }) });
  } catch (e) { next(e); } });
  router.post("/sessions/:id/end", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    const s = await SpatialService.endSession(req.params.id, oid);
    if (!s) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"session not found"}});
    res.json({ok:true,data:s});
  } catch (e) { next(e); } });

  // Dedicated listing endpoints for other spatial components
  router.get("/maps", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.listMaps(oid) });
  } catch (e) { next(e); } });
  router.get("/waypoints", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.listWaypoints(oid) });
  } catch (e) { next(e); } });
  router.get("/holo-dashboards", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.listHoloDashboards(oid) });
  } catch (e) { next(e); } });
  router.get("/remote-expert-sessions", async (req, res, next) => { try {
    const oid = orgOf(req, res); if (!oid) return;
    res.json({ ok:true, data: await SpatialService.listRemoteExpertSessions(oid) });
  } catch (e) { next(e); } });

  // Session 156 — device heartbeat (the live spatial connector)
  router.post("/devices/heartbeat", validate({
    body: z.object({
      fingerprint: z.string().min(2).max(128),
      deviceTarget: z.enum(["vision_pro","hololens","quest","desktop","mobile","smart_glasses"]).optional(),
    }),
  }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await SpatialService.heartbeat({
        ...req.body, organizationId: oid,
      }) });
    } catch (e) { next(e); }
  });
}
