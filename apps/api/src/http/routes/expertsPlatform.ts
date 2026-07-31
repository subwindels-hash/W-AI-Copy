import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ExpertsPlatformService } from "../../expertsPlatform/expertsPlatform.service.js";

const query = z.object({ q: z.string().min(1) });

export function registerExpertsPlatformRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.dashboard() }); } catch(e){next(e);} });
  router.get("/agents", async (req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.listAgents(req.query.domain as any) }); } catch(e){next(e);} });
  router.post("/agents/:id/query", validate({body:query}), async (req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.query(req.params.id, req.body.q) }); } catch(e){next(e);} });
  router.get("/courses", async (_req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.listCourses() }); } catch(e){next(e);} });
  router.get("/packages", async (_req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.listPackages() }); } catch(e){next(e);} });
}
