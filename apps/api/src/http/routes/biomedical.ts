/** Session 65 — Biomedical & Healthcare Intelligence */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { BiomedicalService } from "../../biomedical/biomedical.service.js";

const StudySchema = z.object({
  modality: z.enum(["xray","ct","mri","ultrasound","pet","mammo","pathology"]),
  bodyPart: z.string().min(2),
});

export function registerBiomedicalRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await BiomedicalService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.post("/studies", validate({body:StudySchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await BiomedicalService.submitStudy({...req.body, organizationId:(req.user as any).organizationId})});
  }catch(e){next(e);}});
}
