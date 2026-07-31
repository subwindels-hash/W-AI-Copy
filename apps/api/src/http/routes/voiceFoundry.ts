/**
 * Voice Foundry routes (Session 41).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { VoiceFoundryService } from "../../voiceFoundry/voiceFoundry.service.js";

const generate = z.object({
  name: z.string(), category: z.enum(["original-male","original-female","children","elder","executive","narrator","customer-service","sales","character","digital-human","ai-employee","brand","accessibility"]),
  design: z.any().optional(),
});
const design = z.object({ prompt: z.string() });
const evolve = z.object({ op: z.enum(["pronunciation","naturalness","emotion-expand","accent-refine","style-optimize","language-expand","quality-enhance"]) });
const deploy = z.object({ target: z.enum(["ai-employee","ai-assistant","digital-human","support-agent","sales-agent","executive-agent","voice-call","podcast","audiobook","marketing-video","presentation","training","navigation","accessibility","live-meeting","smart-device","robotics"]) });

export function registerVoiceFoundryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.dashboard() }); } catch(e){next(e);} });
  router.get("/voices", async (req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listVoices(req.query.category as any) }); } catch(e){next(e);} });
  router.post("/voices/generate", validate({body:generate}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.generate({ ...req.body, owner: req.user?.id }) }); } catch(e){next(e);}
  });
  router.post("/design", validate({body:design}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.designFromPrompt(req.body.prompt) }); } catch(e){next(e);}
  });
  router.post("/voices/:id/evolve", validate({body:evolve}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.evolve(req.params.id, req.body.op, req.user?.id) }); } catch(e){next(e);}
  });
  router.get("/voices/:id/evolutions", async (req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listEvolutions(req.params.id) }); } catch(e){next(e);} });
  router.post("/voices/:id/deploy", validate({body:deploy}), async (req, res, next) => {
    try { res.json({ ok:true, data: await VoiceFoundryService.deploy(req.params.id, req.body.target) }); } catch(e){next(e);}
  });
  router.get("/deployments", async (_req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listDeployments() }); } catch(e){next(e);} });
  router.get("/packs", async (_req, res, next) => { try { res.json({ ok:true, data: await VoiceFoundryService.listPacks() }); } catch(e){next(e);} });
}
