import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { LanguageLearningService as Ll } from "../../languageLearning/languageLearning.service.js";
import {
  LlAssessmentAnswerSchema,
  LlConversationStartSchema,
  LlConversationTurnSchema,
  LlDetectLanguageSchema,
  LlEnrollSchema,
  LlGrammarAskSchema,
  LlGrammarExerciseSchema,
  LlLessonAnswerSchema,
  LlListeningAnswerSchema,
  LlProfilePatchSchema,
  LlSpeakingSchema,
  LlTeacherAskSchema,
  LlTranslateSchema,
  LlVocabQuizAnswerSchema,
  LlVocabReviewSchema,
  LlWritingSchema,
} from "@windels/shared/languageLearning";

const orgOf = (req: any) => {
  const oid = req.user?.organizationId;
  if (!oid) {
    const err: any = new Error("organization context required");
    err.status = 403; err.code = "FORBIDDEN";
    throw err;
  }
  return oid as string;
};
const userOf = (req: any): string => req.user?.id ?? "unknown";
const LangParam = z.object({ languageCode: z.string().min(2).max(12) });
const IdParam = z.object({ id: z.string().min(3).max(80) });

export function registerLanguageLearningRoutes(router: Router) {
  router.use(authenticate);

  router.get("/languages", async (req, res, next) => {
    try { res.json({ ok: true, data: Ll.listLanguages(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/languages/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.catalog(req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Session 199 — automatic language detection (typed/pasted/uploaded/message text).
  router.post("/detect", validate({ body: LlDetectLanguageSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.detectLanguage(orgOf(req), userOf(req), req.body.text), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Session 199 — context-aware translation via the AI fabric.
  router.post("/translate", validate({ body: LlTranslateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.translate(orgOf(req), userOf(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/dashboard", async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.dashboard(orgOf(req), userOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/profiles", async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.listProfiles(orgOf(req), userOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/profiles", validate({ body: LlEnrollSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.enroll(orgOf(req), userOf(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/profiles/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.getProfile(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.patch("/profiles/:languageCode", validate({ params: LangParam, body: LlProfilePatchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.updateProfile(orgOf(req), userOf(req), req.params.languageCode, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.delete("/profiles/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try {
      const ok = await Ll.deleteProfile(orgOf(req), userOf(req), req.params.languageCode);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Profile not found" } });
      res.json({ ok: true, data: { deleted: true }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/assessments/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.startAssessment(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/assessments/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await Ll.getAssessment(orgOf(req), userOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Assessment not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/assessments/:id/answer", validate({ params: IdParam, body: LlAssessmentAnswerSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.answerAssessment(orgOf(req), userOf(req), req.params.id, req.body.response), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/paths/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.getPath(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/paths/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.createPath(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/lessons/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.lessons(req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/lessons/:languageCode/:lessonId", async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.getLesson(req.params.languageCode, req.params.lessonId), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/lessons/:languageCode/:lessonId/start", async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.startLesson(orgOf(req), userOf(req), req.params.languageCode, req.params.lessonId), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/lesson-attempts/:id/answer", validate({ params: IdParam, body: LlLessonAnswerSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.answerLesson(orgOf(req), userOf(req), req.params.id, req.body.practiceId, req.body.response), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/lesson-attempts/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.listLessonAttempts(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/teacher", validate({ body: LlTeacherAskSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.askTeacher(orgOf(req), userOf(req), req.body.message, req.body.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/conversations/:languageCode", validate({ params: LangParam, body: LlConversationStartSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.startConversation(orgOf(req), userOf(req), req.params.languageCode, req.body.mode, req.body.correctionMode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/conversations/:id/turn", validate({ params: IdParam, body: LlConversationTurnSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.conversationTurn(orgOf(req), userOf(req), req.params.id, req.body.text), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/conversations/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.listConversations(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/vocabulary/:languageCode/catalog", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.catalogVocab(req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/vocabulary/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.listUserVocab(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/vocabulary/:languageCode/due", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.dueVocab(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/vocabulary/:languageCode/:vocabId", async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.saveVocab(orgOf(req), userOf(req), req.params.languageCode, req.params.vocabId), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/vocabulary-cards/:id/review", validate({ params: IdParam, body: LlVocabReviewSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.reviewVocab(orgOf(req), userOf(req), req.params.id, req.body.remembered, req.body.quality), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/vocabulary/:languageCode/quiz", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.vocabQuiz(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/vocabulary-cards/:id/quiz", validate({ params: IdParam, body: LlVocabQuizAnswerSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.answerVocabQuiz(orgOf(req), userOf(req), req.params.id, req.body.response), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/grammar/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.grammarRules(req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/grammar/:languageCode/explain", validate({ params: LangParam, body: LlGrammarAskSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.explainGrammar(orgOf(req), userOf(req), req.params.languageCode, req.body.ruleId, req.body.simplify), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/grammar/:languageCode/exercise", validate({ params: LangParam, body: LlGrammarExerciseSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.answerGrammar(orgOf(req), userOf(req), req.params.languageCode, req.body.ruleId, req.body.response), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/grammar/:languageCode/progress", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.grammarProgress(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/writing/:languageCode", validate({ params: LangParam, body: LlWritingSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.write(orgOf(req), userOf(req), req.params.languageCode, req.body.text, req.body.prompt), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/writing/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.listWriting(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/listening/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.listeningItems(req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/listening/:languageCode", validate({ params: LangParam, body: LlListeningAnswerSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.answerListening(orgOf(req), userOf(req), req.params.languageCode, req.body.itemId, req.body.response, req.body.speed), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/speaking/:languageCode/prompts", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.speakingPrompts(req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/speaking/:languageCode", validate({ params: LangParam, body: LlSpeakingSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Ll.speak(orgOf(req), userOf(req), req.params.languageCode, req.body.transcript, req.body.transcriptSource, req.body.expected, req.body.promptId), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/plans/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.dailyPlan(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/progress/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.progress(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/recommendations/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.recommendations(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/next/:languageCode", validate({ params: LangParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ll.nextStep(orgOf(req), userOf(req), req.params.languageCode), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
}
