/** Session 53 — Enterprise Deployment Platform routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import DeploymentService from "../../deployment/deployment.service.js";
import { z } from "zod";

const create = z.object({
  name: z.string().min(2).max(120),
  environment: z.enum(["windows","linux","macos","docker","kubernetes","aws","azure","gcp","oracle","alibaba","private_cloud","on_prem","air_gapped","edge"]),
  region: z.string().max(32).optional(),
  endpoint: z.string().url().optional(),
  modules: z.array(z.string()).default([]),
});

export function registerDeploymentRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok: true, data: await DeploymentService.dashboard() }); } catch (e) { next(e); } });
  router.get("/targets", async (_req, res, next) => { try { res.json({ ok: true, data: await DeploymentService.list() }); } catch (e) { next(e); } });
  router.post("/targets", validate({ body: create }), async (req, res, next) => { try { res.json({ ok: true, data: await DeploymentService.create(req.body) }); } catch (e) { next(e); } });
  router.post("/targets/:id/validate", async (req, res, next) => { try { res.json({ ok: true, data: await DeploymentService.validate(req.params.id) }); } catch (e) { next(e); } });
  router.get("/targets/:id/validation", async (req, res, next) => { try { res.json({ ok: true, data: await DeploymentService.getLatestValidation(req.params.id) }); } catch (e) { next(e); } });
  router.delete("/targets/:id", async (req, res, next) => { try { await DeploymentService.destroy(req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });
}
