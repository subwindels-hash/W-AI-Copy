/** Session 70 — Global Command Center */
import { Router } from "express";
import { CommandService } from "../../command/command.service.js";
export function registerCommandRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await CommandService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
}
