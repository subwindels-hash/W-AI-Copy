/** Session 57 — Enterprise Robotics & Physical Automation routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { RoboticsService } from "../../robotics/robotics.service.js";
import { ROBOT_KINDS } from "@windels/shared";

const CreateRobotSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(ROBOT_KINDS),
  site: z.string().min(2),
  zone: z.string().optional(),
  serial: z.string().optional(),
});
const CommandSchema = z.object({ action: z.enum(["start","pause","stop","reset","maintenance"]) });

export function registerRoboticsRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await RoboticsService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/robots", async (req, res, next) => { try { res.json({ ok:true, data: await RoboticsService.list((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/robots/:id", async (req, res, next) => { try {
    const r = await RoboticsService.get(req.params.id, (req.user as any).organizationId);
    if (!r) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"robot not found"}});
    res.json({ok:true,data:r});
  } catch (e) { next(e); } });
  router.post("/robots", validate({ body: CreateRobotSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await RoboticsService.create({ ...req.body, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.post("/robots/:id/command", validate({ body: CommandSchema }), async (req, res, next) => { try {
    const r = await RoboticsService.command(req.params.id, req.body.action, (req.user as any).organizationId);
    if (!r) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"robot not found"}});
    res.json({ok:true,data:r});
  } catch (e) { next(e); } });
  router.post("/predictive/scan", async (req, res, next) => { try { res.json({ ok:true, data: await RoboticsService.runPredictiveScan((req.user as any).organizationId) }); } catch (e) { next(e); } });
}
