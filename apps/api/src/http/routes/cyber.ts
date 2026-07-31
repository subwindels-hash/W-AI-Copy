/** Session 82 — Cybersecurity Academy, Ethical Hacking & Multi-Cloud Security */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { CyberService } from "../../cyber/cyber.service.js";

const LabSchema = z.object({ domain: z.string(), difficulty: z.string(), cloud: z.string().optional() });
export function registerCyberRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await CyberService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.post("/labs", validate({body:LabSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await CyberService.startLab((req.user as any).organizationId, req.body)});
  }catch(e){next(e);}});
}
