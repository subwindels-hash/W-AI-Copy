/** Session 69 — Cognitive Evolution & World Intelligence */
import { Router } from "express";
import { CognitiveService } from "../../cognitive/cognitive.service.js";
export function registerCognitiveRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await CognitiveService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
}
