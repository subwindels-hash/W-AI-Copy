/** Session 54 — Enterprise Update & Lifecycle Management routes */
import { Router } from "express";
import { z } from "zod";
import { UpdateService } from "../../updates/updates.service.js";
import { validate } from "../middleware/validate.js";
import { UPDATE_CHANNELS } from "@windels/shared";

const ChannelSchema = z.object({ channel: z.enum(UPDATE_CHANNELS) });

export function registerUpdateRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await UpdateService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/packages", async (req, res, next) => { try { res.json({ ok: true, data: await UpdateService.list((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/check", async (req, res, next) => { try { res.json({ ok: true, data: await UpdateService.checkForUpdates((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/packages/:id", async (req, res, next) => {
    try { const p = await UpdateService.get(req.params.id, (req.user as any).organizationId);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND",message:"package not found"} });
      res.json({ ok:true, data:p });
    } catch (e) { next(e); }
  });
  router.post("/packages/:id/validate", async (req, res, next) => { try { res.json({ ok:true, data: await UpdateService.validate(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/packages/:id/approve", async (req, res, next) => { try { res.json({ ok:true, data: await UpdateService.approve(req.params.id, (req.user as any).id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/packages/:id/deploy", async (req, res, next) => { try { res.json({ ok:true, data: await UpdateService.deploy(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/packages/:id/rollback", async (req, res, next) => { try { res.json({ ok:true, data: await UpdateService.rollback(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/channel", validate({ body: ChannelSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await UpdateService.setChannel(req.body.channel, (req.user as any).organizationId) }); } catch (e) { next(e); } });
}
