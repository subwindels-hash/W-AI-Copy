/** Session 67 — Education & Learning + Lecturer AI adaptive tutor (Session 82 completion). */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { EducationService } from "../../education/education.service.js";
import { LecturerService } from "../../education/lecturer.service.js";

const TutorSchema = z.object({ topic: z.string().min(2) });
const PathSchema = z.object({ title: z.string().min(2), goal: z.string().min(2), contentIds: z.array(z.string()).min(1), targetDate: z.string().optional() });
const AssessSchema = z.object({ contentId: z.string(), scorePct: z.number().min(0).max(100), correct: z.number().int().nonnegative(), questions: z.number().int().positive(), timeSpentSec: z.number().int().positive() });

const LecStart = z.object({ topic: z.string().min(2), level: z.enum(["beginner","intermediate","advanced"]).optional() });
const LecAnswer = z.object({ answerIndex: z.number().int().min(0).max(3), explanation: z.string().max(1000).optional() });
const LecAsk = z.object({ question: z.string().min(2), mode: z.enum(["simplify","more_detail","examples","why","how"]).default("why") });

export function registerEducationRoutes(router: Router) {
  const uid = (req:any) => (req.user as any).id;
  const oid = (req:any) => (req.user as any).organizationId ?? "org-windels";

  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await EducationService.dashboard(oid(req))});}catch(e){next(e);}});
  router.post("/tutor/start", validate({body:TutorSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await EducationService.startTutor(req.body.topic,uid(req),oid(req))});
  }catch(e){next(e);}});
  router.post("/paths", validate({body:PathSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await EducationService.createPath({...req.body, userId:uid(req), organizationId:oid(req)})});
  }catch(e){next(e);}});
  router.post("/assessments", validate({body:AssessSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await EducationService.assess(req.body.contentId,uid(req),req.body.scorePct,req.body.correct,req.body.questions,req.body.timeSpentSec,oid(req))});
  }catch(e){next(e);}});

  // ── Lecturer AI adaptive tutoring ────────────────────────────────
  router.post("/lecturer/start", validate({body:LecStart}), async (req,res,next)=>{try{
    res.json({ok:true,data:await LecturerService.start(uid(req), req.body.topic, req.body.level)});
  }catch(e){next(e);}});
  router.post("/lecturer/:id/answer", validate({ params: z.object({ id: z.string().cuid() }), body:LecAnswer }), async (req,res,next)=>{try{
    res.json({ok:true,data:await LecturerService.answer(uid(req), req.params.id, req.body.answerIndex, req.body.explanation)});
  }catch(e){next(e);}});
  router.post("/lecturer/:id/ask", validate({ params: z.object({ id: z.string().cuid() }), body:LecAsk }), async (req,res,next)=>{try{
    res.json({ok:true,data:await LecturerService.ask(uid(req), req.params.id, req.body.question, req.body.mode)});
  }catch(e){next(e);}});
  router.get("/lecturer/:id", validate({ params: z.object({ id: z.string().cuid() }) }), async (req,res,next)=>{try{
    const s = await LecturerService.getSession(uid(req), req.params.id);
    if (!s) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}});
    res.json({ok:true,data:s});
  }catch(e){next(e);}});
  router.get("/lecturer", async (req,res,next)=>{try{
    res.json({ok:true,data:await LecturerService.listSessions(uid(req))});
  }catch(e){next(e);}});
  router.get("/lecturer/topic/:topic/mastery", async (req,res,next)=>{try{
    res.json({ok:true,data:await LecturerService.topicMastery(uid(req), req.params.topic)});
  }catch(e){next(e);}});
}
