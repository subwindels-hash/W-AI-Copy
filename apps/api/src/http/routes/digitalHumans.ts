/** Session 62 — Digital Human Platform */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { DigitalHumanService } from "../../digitalHumans/digitalHumans.service.js";
import { AVATAR_ROLES, AVATAR_STYLES, AVATAR_GENDERS } from "@windels/shared";

const CreateSchema = z.object({
  name: z.string().min(2),
  role: z.enum(AVATAR_ROLES),
  gender: z.enum(AVATAR_GENDERS),
  style: z.enum(AVATAR_STYLES),
  appearanceConfig: z.record(z.string(), z.any()).optional(),
  voiceId: z.string().optional(),
  personalityProfileId: z.string().optional(),
  languages: z.array(z.string()).optional(),
  emotionIntensity: z.number().min(0).max(1).optional(),
  gestureIntensity: z.number().min(0).max(1).optional(),
  eyeContactStrength: z.number().min(0).max(1).optional(),
});
const StartSchema = z.object({ participantId: z.string().optional(), language: z.string().optional() });
const EndSchema = z.object({ resolution: z.enum(["resolved","escalated","abandoned"]).optional(), rating: z.number().int().min(1).max(5).optional() });

export function registerDigitalHumanRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await DigitalHumanService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/", async (req,res,next)=>{try{res.json({ok:true,data:await DigitalHumanService.list((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/:id", async (req,res,next)=>{try{
    const h = await DigitalHumanService.get(req.params.id,(req.user as any).organizationId);
    if(!h) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"not found"}});
    res.json({ok:true,data:h});
  }catch(e){next(e);}});
  router.post("/", validate({body:CreateSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await DigitalHumanService.create({...req.body, organizationId:(req.user as any).organizationId, createdBy:(req.user as any).id})});
  }catch(e){next(e);}});
  router.post("/:id/sessions", validate({body:StartSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await DigitalHumanService.startSession(req.params.id,(req.user as any).organizationId,req.body.participantId,req.body.language)});
  }catch(e){next(e);}});
  router.post("/sessions/:id/end", validate({body:EndSchema}), async (req,res,next)=>{try{
    const s = await DigitalHumanService.endSession(req.params.id,(req.user as any).organizationId,req.body.resolution,req.body.rating);
    if(!s) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"session not found"}});
    res.json({ok:true,data:s});
  }catch(e){next(e);}});
}
