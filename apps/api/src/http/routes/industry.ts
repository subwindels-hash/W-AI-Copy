/** Session 74 — Semantic Intelligence, Industry Solutions & Digital Operations */
import { Router } from "express";
import { IndustryService } from "../../industry/industry.service.js";
export function registerIndustryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await IndustryService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
}
