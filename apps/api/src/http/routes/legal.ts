/** Session 66 — Legal Intelligence */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { LegalService } from "../../legal/legal.service.js";

const ResearchSchema = z.object({ query: z.string().min(3) });

export function registerLegalRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await LegalService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.post("/research", validate({body:ResearchSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await LegalService.research(req.body.query,(req.user as any).organizationId)});
  }catch(e){next(e);}});
  router.post("/updates/:id/acknowledge", async (req,res,next)=>{try{
    const u = await LegalService.acknowledgeUpdate(req.params.id,(req.user as any).organizationId);
    if(!u) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}});
    res.json({ok:true,data:u});
  }catch(e){next(e);}});
}
