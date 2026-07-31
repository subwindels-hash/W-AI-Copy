/**
 * AI Kernel routes (Session 39).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { KernelService } from "../../kernel/kernel.service.js";

const dispatchBody = z.object({ kind: z.string(), source: z.string(), target: z.string().optional(), payload: z.record(z.any()).default({}) });
const policyBody = z.any();
const grantBody = z.object({ priority: z.enum(["interactive","batch"]).default("interactive"), gpuCards: z.number().int().optional() });

export function registerKernelRoutes(router: Router) {
  router.get("/status", async (_req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.summary() }); } catch(e){next(e);}
  });
  router.get("/components", async (_req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.listComponents() }); } catch(e){next(e);}
  });
  router.post("/dispatch", validate({body: dispatchBody}), async (req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.dispatch(req.body) }); } catch(e){next(e);}
  });
  router.get("/events", async (_req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.listEvents() }); } catch(e){next(e);}
  });
  router.post("/policy/evaluate", validate({body: policyBody}), async (req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.evaluatePolicy(req.body) }); } catch(e){next(e);}
  });
  router.post("/resources/grant", validate({body: grantBody}), async (req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.grantResources(req.body) }); } catch(e){next(e);}
  });
  router.post("/model/select", async (req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.selectModel(req.body?.task ?? "chat") }); } catch(e){next(e);}
  });
  router.post("/diagnostics/run", async (_req, res, next) => {
    try { res.json({ ok: true, data: await KernelService.runDiagnostics() }); } catch(e){next(e);}
  });
}
