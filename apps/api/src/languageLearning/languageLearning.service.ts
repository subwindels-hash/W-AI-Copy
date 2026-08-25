/**
 * WINDELS AI Language Learning — orchestration.
 * Profiles, assessments, paths, teacher, vocab SRS, grammar, conversation,
 * writing, listening, speaking, progress and daily plans.
 */

import { randomUUID } from "node:crypto";
import type {
  LlAssessment,
  LlAssessmentAnswer,
  LlConversationMode,
  LlConversationSession,
  LlCorrectionMode,
  LlDailyPlan,
  LlDashboard,
  LlEnrollInput,
  LlGrammarRule,
  LlLanguage,
  LlLearningPath,
  LlLesson,
  LlLessonAttempt,
  LlListeningAttempt,
  LlProfilePatch,
  LlProgress,
  LlRecommendation,
  LlSpeakingAttempt,
  LlUserGrammarProgress,
  LlUserLanguageProfile,
  LlUserVocab,
  LlVocabItem,
  LlWritingAttempt,
} from "@windels/shared/languageLearning";
import { LL_CURRENT_MODEL, LL_DISCLAIMER } from "@windels/shared/languageLearning";
import { listLanguages, requireLanguage } from "./registry.js";
import {
  curriculumCeiling,
  getPack,
  grammarById,
  lessonById,
  pathForLevel,
  vocabById,
} from "./curriculum.js";
import {
  acceptedAnswers,
  addDays,
  analyzeWriting,
  buildDailyPlan,
  computeProgress,
  detectWeaknesses,
  evaluateResponse,
  evaluateTranscript,
  overallFromSkills,
  pickNextAssessmentItem,
  reviewSchedule,
  skillScores,
  strengthsAndWeaknesses,
  streakFromDates,
  type PerformanceEvent,
} from "./engines.js";
import {
  conversationPrompt,
  detectIntent,
  grammarExplain,
  lessonIntro,
  nextConversationBeat,
  openingFor,
  scoreConversationReply,
  teacherReplyTemplate,
} from "./teacher.js";
import {
  llDelete,
  llForgetNatural,
  llListUser,
  llLookupNatural,
  llRead,
  llRememberNatural,
  llWrite,
  type LlEntity,
} from "./store.js";

const nowIso = () => new Date().toISOString();
const nid = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

function deny(code: string, message: string, status = 400): never {
  const err: any = new Error(message);
  err.code = code;
  err.status = status;
  throw err;
}

async function audit(org: string, actor: string, action: string, resourceType: string, resourceId: string, after: unknown) {
  const rec = {
    id: nid("aud"),
    organizationId: org,
    actorId: actor,
    action,
    resourceType,
    resourceId,
    after,
    createdAt: nowIso(),
  };
  await llWrite("audit", org, rec);
}

async function emitEvent(org: string, userId: string, ev: PerformanceEvent & { profileId: string; languageCode: string }) {
  const rec = { id: nid("evt"), organizationId: org, userId, ...ev, createdAt: ev.at };
  await llWrite("event", org, rec);
}

function profileKey(userId: string, languageCode: string) {
  return `${userId}:${languageCode}`;
}

async function loadProfile(org: string, userId: string, languageCode: string): Promise<LlUserLanguageProfile | null> {
  const id = await llLookupNatural("profile", org, profileKey(userId, languageCode));
  if (!id) return null;
  const rec = await llRead<LlUserLanguageProfile>("profile", org, id);
  if (!rec || rec.userId !== userId) return null;
  return rec;
}

async function requireProfile(org: string, userId: string, languageCode: string): Promise<LlUserLanguageProfile> {
  const p = await loadProfile(org, userId, languageCode);
  if (!p) deny("PROFILE_NOT_FOUND", `No ${languageCode} profile for this user`, 404);
  return p;
}

async function saveProfile(org: string, rec: LlUserLanguageProfile) {
  rec.updatedAt = nowIso();
  await llWrite("profile", org, rec);
}

async function allEvents(org: string, userId: string, profileId: string): Promise<Array<PerformanceEvent & { profileId: string; languageCode: string }>> {
  const rows = await llListUser<any>("event", org, userId);
  return rows.filter((r) => r.profileId === profileId);
}

export const LanguageLearningService = {
  listLanguages(): LlLanguage[] {
    return listLanguages();
  },

  async dashboard(org: string, userId: string): Promise<LlDashboard> {
    const languages = listLanguages();
    const profiles = await llListUser<LlUserLanguageProfile>("profile", org, userId);
    const withProgress = [];
    for (const p of profiles) {
      withProgress.push({ ...p, progress: await this.progress(org, userId, p.languageCode) });
    }
    return {
      languages,
      profiles: withProgress,
      model: LL_CURRENT_MODEL,
      speech: {
        pronunciationAssessment: "NOT_AVAILABLE",
        listeningAudio: "CLIENT_TTS",
        note: "Pronunciation scores stay hidden until a real speech-assessment provider is configured. Listening audio uses the browser speech synthesizer unless a TTS provider is wired.",
      },
    };
  },

  async enroll(org: string, userId: string, input: LlEnrollInput): Promise<LlUserLanguageProfile> {
    const lang = requireLanguage(input.languageCode);
    requireLanguage(input.nativeLanguageCode);
    requireLanguage(input.explanationLanguageCode);
    const existing = await loadProfile(org, userId, lang.code);
    if (existing) return existing;
    const rec: LlUserLanguageProfile = {
      id: nid("prf"),
      organizationId: org,
      userId,
      languageCode: lang.code,
      nativeLanguageCode: input.nativeLanguageCode,
      explanationLanguageCode: input.explanationLanguageCode,
      goal: input.goal ?? null,
      goalNotes: input.goalNotes ?? null,
      dailyMinutes: input.dailyMinutes,
      currentLevel: "NOT_STARTED",
      levelSource: "NOT_SET",
      status: input.goal ? "GOAL_SET" : "NOT_STARTED",
      correctionMode: "IMPORTANT_ONLY",
      currentPathId: null,
      lastAssessmentId: null,
      studyStreakDays: 0,
      lastStudyDate: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await llWrite("profile", org, rec);
    await llRememberNatural("profile", org, profileKey(userId, lang.code), rec.id);
    await audit(org, userId, "PROFILE_CREATE", "profile", rec.id, { languageCode: lang.code });
    return rec;
  },

  async listProfiles(org: string, userId: string): Promise<LlUserLanguageProfile[]> {
    return llListUser<LlUserLanguageProfile>("profile", org, userId);
  },

  async getProfile(org: string, userId: string, languageCode: string): Promise<LlUserLanguageProfile> {
    return requireProfile(org, userId, languageCode);
  },

  async updateProfile(org: string, userId: string, languageCode: string, patch: LlProfilePatch): Promise<LlUserLanguageProfile> {
    const rec = await requireProfile(org, userId, languageCode);
    if (patch.goal !== undefined) rec.goal = patch.goal;
    if (patch.goalNotes !== undefined) rec.goalNotes = patch.goalNotes;
    if (patch.dailyMinutes !== undefined) rec.dailyMinutes = patch.dailyMinutes;
    if (patch.nativeLanguageCode) {
      requireLanguage(patch.nativeLanguageCode);
      rec.nativeLanguageCode = patch.nativeLanguageCode;
    }
    if (patch.explanationLanguageCode) {
      requireLanguage(patch.explanationLanguageCode);
      rec.explanationLanguageCode = patch.explanationLanguageCode;
    }
    if (patch.correctionMode) rec.correctionMode = patch.correctionMode;
    if (patch.status) rec.status = patch.status;
    if (patch.selfDeclaredLevel && patch.selfDeclaredLevel !== "NOT_STARTED") {
      rec.currentLevel = patch.selfDeclaredLevel;
      rec.levelSource = "SELF_DECLARED";
      rec.status = rec.status === "NOT_STARTED" ? "READY" : rec.status;
      const path = await this.createPath(org, userId, languageCode);
      rec.currentPathId = path.id;
    }
    await saveProfile(org, rec);
    await audit(org, userId, "PROFILE_UPDATE", "profile", rec.id, patch);
    return rec;
  },

  async deleteProfile(org: string, userId: string, languageCode: string): Promise<boolean> {
    const rec = await loadProfile(org, userId, languageCode);
    if (!rec) return false;
    await llDelete("profile", org, rec.id);
    await llForgetNatural("profile", org, profileKey(userId, languageCode));
    await audit(org, userId, "PROFILE_DELETE", "profile", rec.id, { languageCode });
    return true;
  },

  async startAssessment(org: string, userId: string, languageCode: string): Promise<LlAssessment> {
    const profile = await requireProfile(org, userId, languageCode);
    getPack(languageCode);
    const assessment: LlAssessment = {
      id: nid("asm"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      status: "IN_PROGRESS",
      overallLevel: null,
      skillScores: [],
      strengths: [],
      weaknesses: [],
      recommendedFocus: null,
      itemsAsked: 0,
      itemsCorrect: 0,
      answers: [],
      currentItem: pickNextAssessmentItem({ languageCode, answers: [], askedIds: new Set() }),
      source: "ADAPTIVE_BANK",
      createdAt: nowIso(),
      completedAt: null,
    };
    profile.status = "ASSESSING";
    profile.lastAssessmentId = assessment.id;
    await saveProfile(org, profile);
    await llWrite("assessment", org, assessment);
    return assessment;
  },

  async getAssessment(org: string, userId: string, id: string): Promise<LlAssessment | null> {
    const rec = await llRead<LlAssessment>("assessment", org, id);
    if (!rec || rec.userId !== userId) return null;
    return rec;
  },

  async answerAssessment(org: string, userId: string, id: string, response: string): Promise<LlAssessment> {
    const rec = await this.getAssessment(org, userId, id);
    if (!rec) deny("ASSESSMENT_NOT_FOUND", "Assessment not found", 404);
    if (rec.status !== "IN_PROGRESS" || !rec.currentItem) deny("ASSESSMENT_CLOSED", "This assessment is not accepting answers");
    const item = rec.currentItem;
    const accepted = acceptedAnswers(rec.languageCode, item);
    const ev = evaluateResponse(response, accepted);
    const answer: LlAssessmentAnswer = {
      itemId: item.id,
      response,
      correct: ev.correct,
      expected: ev.expected,
      explanation: ev.correct
        ? "Correct."
        : `Expected something like “${ev.expected}”.`,
      skill: item.skill,
      level: item.level,
    };
    rec.answers.push(answer);
    rec.itemsAsked = rec.answers.length;
    rec.itemsCorrect = rec.answers.filter((a) => a.correct).length;
    const askedIds = new Set(rec.answers.map((a) => a.itemId));
    const next = rec.answers.length >= 12
      ? null
      : pickNextAssessmentItem({ languageCode: rec.languageCode, answers: rec.answers, askedIds });
    rec.currentItem = next;
    rec.skillScores = skillScores(rec.answers);
    if (!next) {
      rec.status = "COMPLETED";
      rec.completedAt = nowIso();
      rec.overallLevel = overallFromSkills(rec.skillScores);
      const sw = strengthsAndWeaknesses(rec.skillScores);
      rec.strengths = sw.strengths;
      rec.weaknesses = sw.weaknesses;
      rec.recommendedFocus = rec.weaknesses.length
        ? `Focus on ${rec.weaknesses.join(" and ").toLowerCase()}.`
        : rec.itemsCorrect === rec.itemsAsked
          ? "Strong result across the items asked. Continue at the assessed level."
          : "Keep practising the same level before moving up.";
      const profile = await requireProfile(org, userId, rec.languageCode);
      profile.currentLevel = rec.overallLevel;
      profile.levelSource = "ASSESSED";
      profile.status = "READY";
      profile.lastAssessmentId = rec.id;
      await saveProfile(org, profile);
      const path = await this.createPath(org, userId, rec.languageCode);
      profile.currentPathId = path.id;
      await saveProfile(org, profile);
    }
    await llWrite("assessment", org, rec);
    await emitEvent(org, userId, {
      kind: "assessment",
      skill: item.skill,
      topic: item.skill.toLowerCase(),
      correct: ev.correct,
      at: nowIso(),
      profileId: rec.profileId,
      languageCode: rec.languageCode,
    });
    return rec;
  },

  async createPath(org: string, userId: string, languageCode: string): Promise<LlLearningPath> {
    const profile = await requireProfile(org, userId, languageCode);
    const level = profile.currentLevel === "NOT_STARTED" ? "A1" : profile.currentLevel;
    const modules = pathForLevel(languageCode, level, profile.goal);
    const path: LlLearningPath = {
      id: nid("pth"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      level,
      goal: profile.goal,
      modules,
      currentModuleId: modules[0]?.id ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      source: "CURRICULUM",
    };
    await llWrite("path", org, path);
    profile.currentPathId = path.id;
    await saveProfile(org, profile);
    return path;
  },

  async getPath(org: string, userId: string, languageCode: string): Promise<LlLearningPath | null> {
    const profile = await requireProfile(org, userId, languageCode);
    if (!profile.currentPathId) return this.createPath(org, userId, languageCode);
    const path = await llRead<LlLearningPath>("path", org, profile.currentPathId);
    if (!path || path.userId !== userId) return this.createPath(org, userId, languageCode);
    return path;
  },

  async lessons(languageCode: string): Promise<LlLesson[]> {
    return getPack(languageCode).lessons;
  },

  async getLesson(languageCode: string, lessonId: string): Promise<LlLesson> {
    const lesson = lessonById(languageCode, lessonId);
    if (!lesson) deny("LESSON_NOT_FOUND", "Lesson not found", 404);
    return lesson;
  },

  async startLesson(org: string, userId: string, languageCode: string, lessonId: string): Promise<{ attempt: LlLessonAttempt; intro: ReturnType<typeof lessonIntro> }> {
    const profile = await requireProfile(org, userId, languageCode);
    const lesson = await this.getLesson(languageCode, lessonId);
    const intro = lessonIntro(languageCode, lesson.id, false);
    const attempt: LlLessonAttempt = {
      id: nid("lat"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      lessonId: lesson.id,
      status: "IN_PROGRESS",
      answers: [],
      correctCount: 0,
      askedCount: 0,
      completedAt: null,
      createdAt: nowIso(),
      teacherSource: intro.teacherSource,
    };
    await llWrite("lesson", org, attempt);
    return { attempt, intro };
  },

  async answerLesson(org: string, userId: string, attemptId: string, practiceId: string, response: string): Promise<LlLessonAttempt> {
    const attempt = await llRead<LlLessonAttempt>("lesson", org, attemptId);
    if (!attempt || attempt.userId !== userId) deny("LESSON_NOT_FOUND", "Lesson attempt not found", 404);
    if (attempt.status === "COMPLETED") deny("LESSON_CLOSED", "This lesson is already completed");
    const lesson = await this.getLesson(attempt.languageCode, attempt.lessonId);
    const practice = lesson.practice.find((p) => p.id === practiceId);
    if (!practice) deny("PRACTICE_NOT_FOUND", "Practice item not found");
    const ev = evaluateResponse(response, practice.accepted);
    attempt.answers.push({
      practiceId,
      response,
      correct: ev.correct,
      expected: ev.expected,
      explanation: ev.correct ? practice.explanation : `${practice.explanation} Expected: ${ev.expected}.`,
    });
    attempt.askedCount = attempt.answers.length;
    attempt.correctCount = attempt.answers.filter((a) => a.correct).length;
    const answeredIds = new Set(attempt.answers.map((a) => a.practiceId));
    const remaining = lesson.practice.filter((p) => !answeredIds.has(p.id));
    if (!remaining.length) {
      const rate = attempt.askedCount ? attempt.correctCount / attempt.askedCount : 0;
      if (rate >= 0.6) {
        attempt.status = "COMPLETED";
        attempt.completedAt = nowIso();
        await this.touchStudy(org, userId, attempt.languageCode, "lesson", 8);
      } else {
        attempt.status = "NEEDS_MORE_PRACTICE";
      }
    }
    await llWrite("lesson", org, attempt);
    await emitEvent(org, userId, {
      kind: "lesson",
      skill: practice.skill,
      topic: lesson.topic,
      correct: ev.correct,
      at: nowIso(),
      profileId: attempt.profileId,
      languageCode: attempt.languageCode,
    });
    return attempt;
  },

  async listLessonAttempts(org: string, userId: string, languageCode: string): Promise<LlLessonAttempt[]> {
    const rows = await llListUser<LlLessonAttempt>("lesson", org, userId);
    return rows.filter((r) => r.languageCode === languageCode);
  },

  async askTeacher(org: string, userId: string, message: string, languageCode?: string) {
    const profiles = await this.listProfiles(org, userId);
    const intent = detectIntent(message, languageCode ?? profiles[0]?.languageCode ?? null);
    const lang = intent.languageCode;
    const profile = lang ? await loadProfile(org, userId, lang) : null;
    const languageName = lang ? requireLanguage(lang).name : null;
    const tpl = teacherReplyTemplate(intent, {
      hasProfile: Boolean(profile),
      level: profile?.currentLevel ?? null,
      languageName,
    });
    const opening = profile && lang
      ? openingFor(lang, profile.currentLevel, profile.explanationLanguageCode)
      : null;
    return {
      intent,
      message: opening ? `${opening}\n\n${tpl.message}` : tpl.message,
      suggestedAction: tpl.suggestedAction,
      teacherSource: "STRUCTURED_TEACHER" as const,
      disclaimer: LL_DISCLAIMER,
    };
  },

  async startConversation(
    org: string,
    userId: string,
    languageCode: string,
    mode: LlConversationMode,
    correctionMode?: LlCorrectionMode,
  ): Promise<LlConversationSession> {
    const profile = await requireProfile(org, userId, languageCode);
    const cm = correctionMode ?? profile.correctionMode;
    const prompt = conversationPrompt(languageCode, mode, cm);
    const session: LlConversationSession = {
      id: nid("cnv"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      mode,
      correctionMode: cm,
      status: "ACTIVE",
      turns: [{
        role: "TEACHER",
        text: prompt.teacher,
        correction: null,
        naturalVersion: null,
        notes: prompt.notes,
        at: nowIso(),
      }],
      prompt: prompt.teacher,
      expectedNext: prompt.expected,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      teacherSource: "STRUCTURED_TEACHER",
    };
    await llWrite("conversation", org, session);
    return session;
  },

  async conversationTurn(org: string, userId: string, sessionId: string, text: string): Promise<LlConversationSession> {
    const session = await llRead<LlConversationSession>("conversation", org, sessionId);
    if (!session || session.userId !== userId) deny("CONVERSATION_NOT_FOUND", "Conversation not found", 404);
    if (session.status !== "ACTIVE") deny("CONVERSATION_CLOSED", "This conversation has ended");
    const beat = nextConversationBeat(session.languageCode, session.mode, Math.floor(session.turns.filter((t) => t.role === "USER").length));
    const expected = session.expectedNext ?? beat?.expected ?? [];
    const scored = scoreConversationReply(text, expected, beat?.natural ?? expected[0] ?? text, session.correctionMode);
    session.turns.push({
      role: "USER",
      text,
      correction: scored.correction,
      naturalVersion: scored.naturalVersion,
      notes: scored.notes,
      at: nowIso(),
    });
    const next = nextConversationBeat(session.languageCode, session.mode, session.turns.filter((t) => t.role === "USER").length);
    const teacherText = session.correctionMode === "IMMEDIATE" && scored.correction
      ? `${scored.correction} ${next?.teacher ?? "Go on."}`
      : next?.teacher ?? "Go on.";
    session.turns.push({
      role: "TEACHER",
      text: teacherText,
      correction: session.correctionMode === "AFTER_TURN" ? scored.correction : null,
      naturalVersion: scored.naturalVersion,
      notes: scored.notes,
      at: nowIso(),
    });
    session.expectedNext = next?.expected ?? null;
    session.updatedAt = nowIso();
    await llWrite("conversation", org, session);
    await emitEvent(org, userId, {
      kind: "conversation",
      skill: "SPEAKING",
      topic: session.mode.toLowerCase(),
      correct: scored.ok,
      at: nowIso(),
      profileId: session.profileId,
      languageCode: session.languageCode,
    });
    return session;
  },

  async listConversations(org: string, userId: string, languageCode: string): Promise<LlConversationSession[]> {
    return (await llListUser<LlConversationSession>("conversation", org, userId)).filter((c) => c.languageCode === languageCode);
  },

  async write(org: string, userId: string, languageCode: string, text: string, prompt?: string): Promise<LlWritingAttempt> {
    const profile = await requireProfile(org, userId, languageCode);
    const analysis = analyzeWriting(text, languageCode);
    const rec: LlWritingAttempt = {
      id: nid("wrt"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      prompt: prompt ?? getPack(languageCode).writing[0]?.prompt ?? "Write a few sentences.",
      originalText: text,
      correctedText: analysis.correctedText,
      nativeVersion: analysis.nativeVersion,
      mistakes: analysis.mistakes,
      scores: analysis.scores,
      createdAt: nowIso(),
      teacherSource: "STRUCTURED_TEACHER",
    };
    await llWrite("writing", org, rec);
    await emitEvent(org, userId, {
      kind: "writing",
      skill: "WRITING",
      topic: "writing",
      correct: analysis.mistakes.filter((m) => m.kind === "grammar").length === 0,
      at: nowIso(),
      profileId: profile.id,
      languageCode,
    });
    await this.touchStudy(org, userId, languageCode, "writing", 6);
    return rec;
  },

  async listWriting(org: string, userId: string, languageCode: string): Promise<LlWritingAttempt[]> {
    return (await llListUser<LlWritingAttempt>("writing", org, userId)).filter((w) => w.languageCode === languageCode);
  },

  async catalogVocab(languageCode: string): Promise<LlVocabItem[]> {
    return getPack(languageCode).vocab;
  },

  async saveVocab(org: string, userId: string, languageCode: string, vocabId: string): Promise<LlUserVocab> {
    const profile = await requireProfile(org, userId, languageCode);
    const item = vocabById(languageCode, vocabId);
    if (!item) deny("VOCAB_NOT_FOUND", "Vocabulary item not in the curriculum", 404);
    const natural = `${userId}:${languageCode}:${vocabId}`;
    const existingId = await llLookupNatural("vocab", org, natural);
    if (existingId) {
      const existing = await llRead<LlUserVocab>("vocab", org, existingId);
      if (existing && existing.userId === userId) return existing;
    }
    const rec: LlUserVocab = {
      id: nid("vcb"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      vocabId: item.id,
      word: item.word,
      translation: item.translation,
      pronunciation: item.pronunciation,
      exampleSentence: item.exampleSentence,
      difficulty: item.difficulty,
      category: item.category,
      familiarity: 0,
      easiness: 2.5,
      intervalDays: 1,
      repetitions: 0,
      nextReviewAt: nowIso(),
      lastReviewedAt: null,
      lastQuality: null,
      createdAt: nowIso(),
    };
    await llWrite("vocab", org, rec);
    await llRememberNatural("vocab", org, natural, rec.id);
    return rec;
  },

  async listUserVocab(org: string, userId: string, languageCode: string): Promise<LlUserVocab[]> {
    return (await llListUser<LlUserVocab>("vocab", org, userId)).filter((v) => v.languageCode === languageCode);
  },

  async dueVocab(org: string, userId: string, languageCode: string): Promise<LlUserVocab[]> {
    const now = Date.now();
    return (await this.listUserVocab(org, userId, languageCode)).filter((v) => Date.parse(v.nextReviewAt) <= now);
  },

  async reviewVocab(org: string, userId: string, cardId: string, remembered: boolean, quality?: number): Promise<LlUserVocab> {
    const card = await llRead<LlUserVocab>("vocab", org, cardId);
    if (!card || card.userId !== userId) deny("VOCAB_NOT_FOUND", "Vocabulary card not found", 404);
    const q = quality ?? (remembered ? 4 : 1);
    const next = reviewSchedule(card, q);
    card.easiness = next.easiness;
    card.intervalDays = next.intervalDays;
    card.repetitions = next.repetitions;
    card.familiarity = next.familiarity;
    card.lastQuality = q;
    card.lastReviewedAt = nowIso();
    card.nextReviewAt = addDays(card.lastReviewedAt, next.intervalDays);
    await llWrite("vocab", org, card);
    await emitEvent(org, userId, {
      kind: "vocab_review",
      skill: "VOCABULARY",
      topic: card.category,
      correct: remembered,
      at: nowIso(),
      profileId: card.profileId,
      languageCode: card.languageCode,
    });
    await this.touchStudy(org, userId, card.languageCode, "vocab", 1);
    return card;
  },

  async vocabQuiz(org: string, userId: string, languageCode: string): Promise<Array<{ itemId: string; prompt: string; word: string }>> {
    let cards = await this.listUserVocab(org, userId, languageCode);
    if (!cards.length) {
      const pack = getPack(languageCode);
      for (const v of pack.vocab.slice(0, 8)) {
        await this.saveVocab(org, userId, languageCode, v.id);
      }
      cards = await this.listUserVocab(org, userId, languageCode);
    }
    return cards.slice(0, 8).map((c) => ({
      itemId: c.id,
      prompt: `What does “${c.word}” mean?`,
      word: c.word,
    }));
  },

  async answerVocabQuiz(org: string, userId: string, itemId: string, response: string) {
    const card = await llRead<LlUserVocab>("vocab", org, itemId);
    if (!card || card.userId !== userId) deny("VOCAB_NOT_FOUND", "Quiz item not found", 404);
    const ev = evaluateResponse(response, [card.translation, ...card.translation.split("/").map((s) => s.trim())]);
    await this.reviewVocab(org, userId, card.id, ev.correct, ev.correct ? 5 : 1);
    return { correct: ev.correct, expected: ev.expected, word: card.word };
  },

  async grammarRules(languageCode: string): Promise<LlGrammarRule[]> {
    return getPack(languageCode).grammar;
  },

  async explainGrammar(org: string, userId: string, languageCode: string, ruleId?: string, simplify?: boolean) {
    const profile = await requireProfile(org, userId, languageCode);
    const explained = grammarExplain(languageCode, ruleId, Boolean(simplify));
    const rule = ruleId ? grammarById(languageCode, ruleId) : getPack(languageCode).grammar[0];
    if (rule) {
      const natural = `${userId}:${languageCode}:${rule.id}`;
      const existingId = await llLookupNatural("grammar", org, natural);
      let rec = existingId ? await llRead<LlUserGrammarProgress>("grammar", org, existingId) : null;
      if (!rec || rec.userId !== userId) {
        rec = {
          id: nid("grm"),
          organizationId: org,
          userId,
          profileId: profile.id,
          languageCode,
          ruleId: rule.id,
          title: rule.title,
          attempts: 0,
          correct: 0,
          mastery: 0,
          lastExplainedAt: nowIso(),
          simplifyCount: simplify ? 1 : 0,
          updatedAt: nowIso(),
        };
        await llWrite("grammar", org, rec);
        await llRememberNatural("grammar", org, natural, rec.id);
      } else {
        rec.lastExplainedAt = nowIso();
        if (simplify) rec.simplifyCount += 1;
        rec.updatedAt = nowIso();
        await llWrite("grammar", org, rec);
      }
    }
    return explained;
  },

  async answerGrammar(org: string, userId: string, languageCode: string, ruleId: string, response: string) {
    const profile = await requireProfile(org, userId, languageCode);
    const pack = getPack(languageCode);
    const rule = grammarById(languageCode, ruleId);
    if (!rule) deny("GRAMMAR_NOT_FOUND", "Grammar rule not found", 404);
    const lesson = pack.lessons.find((l) => l.title === rule.title);
    const practice = lesson?.practice[0];
    const accepted = practice?.accepted ?? [];
    const ev = evaluateResponse(response, accepted);
    const natural = `${userId}:${languageCode}:${rule.id}`;
    let recId = await llLookupNatural("grammar", org, natural);
    if (!recId) {
      await this.explainGrammar(org, userId, languageCode, ruleId, false);
      recId = await llLookupNatural("grammar", org, natural);
    }
    const rec = recId ? await llRead<LlUserGrammarProgress>("grammar", org, recId) : null;
    if (!rec) deny("GRAMMAR_NOT_FOUND", "Grammar progress missing", 404);
    rec.attempts += 1;
    if (ev.correct) rec.correct += 1;
    rec.mastery = rec.attempts ? rec.correct / rec.attempts : 0;
    rec.updatedAt = nowIso();
    await llWrite("grammar", org, rec);
    await emitEvent(org, userId, {
      kind: "grammar",
      skill: "GRAMMAR",
      topic: rule.title,
      correct: ev.correct,
      at: nowIso(),
      profileId: profile.id,
      languageCode,
    });
    return { correct: ev.correct, expected: ev.expected, explanation: practice?.explanation ?? rule.simpleRule, progress: rec };
  },

  async grammarProgress(org: string, userId: string, languageCode: string): Promise<LlUserGrammarProgress[]> {
    return (await llListUser<LlUserGrammarProgress>("grammar", org, userId)).filter((g) => g.languageCode === languageCode);
  },

  async listeningItems(languageCode: string) {
    return getPack(languageCode).listening.map((i) => ({
      id: i.id,
      prompt: i.prompt,
      transcriptAvailable: true,
      audioStatus: "CLIENT_TTS" as const,
      audioText: i.transcript,
      translationHidden: i.translation,
      level: i.level,
    }));
  },

  async answerListening(
    org: string,
    userId: string,
    languageCode: string,
    itemId: string,
    response: string,
    speed: "SLOW" | "NORMAL" | "NATIVE",
  ): Promise<LlListeningAttempt> {
    const profile = await requireProfile(org, userId, languageCode);
    const item = getPack(languageCode).listening.find((i) => i.id === itemId);
    if (!item) deny("LISTENING_NOT_FOUND", "Listening item not in the curriculum", 404);
    const ev = evaluateResponse(response, item.accepted);
    const rec: LlListeningAttempt = {
      id: nid("lis"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      itemId: item.id,
      transcript: item.transcript,
      audioStatus: "CLIENT_TTS",
      speed,
      response,
      correct: ev.correct,
      createdAt: nowIso(),
    };
    await llWrite("listening", org, rec);
    await emitEvent(org, userId, {
      kind: "listening",
      skill: "LISTENING",
      topic: "listening",
      correct: ev.correct,
      at: nowIso(),
      profileId: profile.id,
      languageCode,
    });
    return rec;
  },

  async speakingPrompts(languageCode: string) {
    return getPack(languageCode).vocab.slice(0, 10).map((v) => ({
      id: `spk_${v.id}`,
      prompt: `Say: ${v.word}`,
      expected: v.word,
      pronunciation: v.pronunciation,
      note: "Submit a transcript from your device. Pronunciation scoring is not available without a provider.",
    }));
  },

  async speak(
    org: string,
    userId: string,
    languageCode: string,
    transcript: string,
    transcriptSource: "CLIENT" | "PROVIDER" | "TYPED",
    expected?: string,
    promptId?: string,
  ): Promise<LlSpeakingAttempt> {
    const profile = await requireProfile(org, userId, languageCode);
    let target = expected ?? "";
    if (promptId?.startsWith("spk_")) {
      const v = vocabById(languageCode, promptId.slice(4));
      if (v) target = v.word;
    }
    if (!target) deny("SPEAKING_TARGET_REQUIRED", "A target sentence is required so the attempt can be scored against the curriculum");
    const scored = evaluateTranscript(target, transcript);
    const rec: LlSpeakingAttempt = {
      id: nid("spk"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      prompt: `Say: ${target}`,
      expected: target,
      transcript,
      transcriptSource,
      accuracy: scored.accuracy,
      pronunciation: {
        status: "NOT_AVAILABLE",
        score: null,
        fluency: null,
        reason: "No pronunciation-assessment provider is configured. Accuracy below is transcript-to-target match only.",
      },
      feedback: scored.feedback,
      createdAt: nowIso(),
    };
    await llWrite("speaking", org, rec);
    await emitEvent(org, userId, {
      kind: "speaking",
      skill: "SPEAKING",
      topic: "speaking",
      correct: scored.accuracy >= 0.7,
      at: nowIso(),
      profileId: profile.id,
      languageCode,
    });
    return rec;
  },

  async listSpeaking(org: string, userId: string, languageCode: string): Promise<LlSpeakingAttempt[]> {
    return (await llListUser<LlSpeakingAttempt>("speaking", org, userId)).filter((s) => s.languageCode === languageCode);
  },

  async listListening(org: string, userId: string, languageCode: string): Promise<LlListeningAttempt[]> {
    return (await llListUser<LlListeningAttempt>("listening", org, userId)).filter((s) => s.languageCode === languageCode);
  },

  async progress(org: string, userId: string, languageCode: string): Promise<LlProgress> {
    const profile = await requireProfile(org, userId, languageCode);
    const [vocab, grammar, speaking, listening, writing, lessons, events] = await Promise.all([
      this.listUserVocab(org, userId, languageCode),
      this.grammarProgress(org, userId, languageCode),
      this.listSpeaking(org, userId, languageCode),
      this.listListening(org, userId, languageCode),
      this.listWriting(org, userId, languageCode),
      this.listLessonAttempts(org, userId, languageCode),
      allEvents(org, userId, profile.id),
    ]);
    return computeProgress({
      languageCode,
      currentLevel: profile.currentLevel,
      levelSource: profile.levelSource,
      vocab,
      grammar,
      speaking,
      listening,
      writing,
      lessonsCompleted: lessons.filter((l) => l.status === "COMPLETED").length,
      studyStreakDays: profile.studyStreakDays,
      lastStudyDate: profile.lastStudyDate,
      skillEvents: events,
    });
  },

  async dailyPlan(org: string, userId: string, languageCode: string): Promise<LlDailyPlan> {
    const profile = await requireProfile(org, userId, languageCode);
    const date = nowIso().slice(0, 10);
    const natural = `${userId}:${languageCode}:${date}`;
    const existingId = await llLookupNatural("plan", org, natural);
    if (existingId) {
      const existing = await llRead<LlDailyPlan>("plan", org, existingId);
      if (existing && existing.userId === userId) return existing;
    }
    const due = await this.dueVocab(org, userId, languageCode);
    const events = await allEvents(org, userId, profile.id);
    const weak = detectWeaknesses(events);
    const path = await this.getPath(org, userId, languageCode);
    const attempts = await this.listLessonAttempts(org, userId, languageCode);
    const done = new Set(attempts.filter((a) => a.status === "COMPLETED").map((a) => a.lessonId));
    const nextLessonId = path?.modules.flatMap((m) => m.lessonIds).find((id) => !done.has(id));
    const nextLesson = nextLessonId ? lessonById(languageCode, nextLessonId) : null;
    const lastKinds = events.slice(-8).map((e) => e.kind.toUpperCase());
    const built = buildDailyPlan({
      level: profile.currentLevel,
      goal: profile.goal,
      dailyMinutes: profile.dailyMinutes,
      vocabDue: due.length,
      weakTopics: weak.map((w) => w.topic),
      nextLessonTitle: nextLesson?.title ?? null,
      lastKinds,
    });
    const rec: LlDailyPlan = {
      id: nid("pln"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      date,
      items: built.items,
      estimatedMinutes: built.items.reduce((s, i) => s + i.estimatedMinutes, 0),
      basedOn: built.basedOn,
      createdAt: nowIso(),
    };
    await llWrite("plan", org, rec);
    await llRememberNatural("plan", org, natural, rec.id);
    return rec;
  },

  async recommendations(org: string, userId: string, languageCode: string): Promise<LlRecommendation[]> {
    const profile = await requireProfile(org, userId, languageCode);
    const events = await allEvents(org, userId, profile.id);
    const weak = detectWeaknesses(events);
    const recs: LlRecommendation[] = weak.slice(0, 5).map((w) => ({
      id: nid("rec"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      kind: "WEAKNESS" as const,
      title: `Repeated difficulty: ${w.topic}`,
      detail: `${w.misses} miss${w.misses === 1 ? "" : "es"} out of ${w.attempts} stored attempt${w.attempts === 1 ? "" : "s"}.`,
      evidence: w.evidence,
      createdAt: nowIso(),
    }));
    if (!recs.length) {
      recs.push({
        id: nid("rec"),
        organizationId: org,
        userId,
        profileId: profile.id,
        languageCode,
        kind: "NEXT_LESSON",
        title: "Not enough stored mistakes to name a weakness",
        detail: "Complete lessons, reviews or writing so recommendations can be based on evidence.",
        evidence: [],
        createdAt: nowIso(),
      });
    }
    for (const r of recs) await llWrite("rec", org, r);
    return recs;
  },

  async nextStep(org: string, userId: string, languageCode: string) {
    const profile = await requireProfile(org, userId, languageCode);
    if (profile.currentLevel === "NOT_STARTED" && profile.levelSource === "NOT_SET") {
      return { action: "ASSESS", detail: "Take the adaptive assessment so the starting level is based on answers." };
    }
    const due = await this.dueVocab(org, userId, languageCode);
    if (due.length >= 5) return { action: "VOCAB_REVIEW", detail: `${due.length} cards are due.` };
    const recs = await this.recommendations(org, userId, languageCode);
    const weak = recs.find((r) => r.kind === "WEAKNESS");
    if (weak) return { action: "PRACTICE_WEAKNESS", detail: weak.title };
    return { action: "LESSON", detail: "Continue the current learning path." };
  },

  async touchStudy(org: string, userId: string, languageCode: string, kind: string, minutes: number) {
    const profile = await loadProfile(org, userId, languageCode);
    if (!profile) return;
    const rec = {
      id: nid("ses"),
      organizationId: org,
      userId,
      profileId: profile.id,
      languageCode,
      kind,
      minutes,
      startedAt: nowIso(),
      endedAt: nowIso(),
    };
    await llWrite("session", org, rec);
    const sessions = (await llListUser<any>("session", org, userId)).filter((s) => s.languageCode === languageCode);
    profile.studyStreakDays = streakFromDates(sessions.map((s: any) => s.endedAt), nowIso());
    profile.lastStudyDate = nowIso();
    if (profile.status === "READY" || profile.status === "GOAL_SET") profile.status = "LEARNING";
    await saveProfile(org, profile);
  },

  async catalog(languageCode: string) {
    const lang = requireLanguage(languageCode);
    const pack = getPack(languageCode);
    return {
      language: lang,
      vocabCount: pack.vocab.length,
      grammarCount: pack.grammar.length,
      lessonCount: pack.lessons.length,
      assessmentItems: pack.assessment.length,
      conversationModes: [...new Set(pack.conversations.map((c) => c.mode))],
      curriculumCeiling: curriculumCeiling(languageCode),
      nextUnauthoredLevel: curriculumCeiling(languageCode) === "B2" ? "C1" : null,
      note: "Curriculum is authored through B2 workplace language. C1/C2 lessons are not invented. Pronunciation scores stay NOT_AVAILABLE without a provider.",
    };
  },
};

export type { LlEntity };
