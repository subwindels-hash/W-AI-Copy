/** Session 68 — Scientific Research */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ScientificService } from "../../scientific/scientific.service.js";

const SearchSchema = z.object({ q: z.string().min(1).max(200).optional() });

export function registerScientificRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await ScientificService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/papers", validate({query:SearchSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await ScientificService.searchPapers((req.user as any).organizationId, (req.query as any).q||"")});
  }catch(e){next(e);}});
}
