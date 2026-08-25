/**
 * WINDELS AI Language Learning — shared contracts.
 *
 * Honesty rules:
 *  - Levels come from assessment answers or are labelled SELF_DECLARED.
 *  - Progress percentages come from stored activity, never invented.
 *  - Pronunciation scores are omitted unless a real provider produced them.
 *  - Weaknesses are derived from stored mistakes, never fabricated.
 */

import { z } from "zod";

export const LL_CURRENT_MODEL = {
  name: "WINDELS Language Teacher",
  version: "1.0",
  curriculumVersion: "curriculum-v1.1",
  srsVersion: "srs-sm2-v1",
} as const;

export const LL_TEXT_DIRECTIONS = ["LTR", "RTL"] as const;
export type LlTextDirection = (typeof LL_TEXT_DIRECTIONS)[number];

export const LL_WRITING_SYSTEMS = [
  "LATIN",
  "ARABIC",
  "HAN",
  "HIRAGANA_KANJI",
  "HANGUL",
  "CYRILLIC",
  "DEVANAGARI",
  "HEBREW",
  "THAI",
  "GREEK",
  // Session 199 — scripts required by the full ~250-language catalog.
  "LAO",
  "BENGALI",
  "GUJARATI",
  "GURMUKHI",
  "KANNADA",
  "TELUGU",
  "TAMIL",
  "MALAYALAM",
  "ODIA",
  "SINHALA",
  "ETHIOPIC",
  "ARMENIAN",
  "GEORGIAN",
  "KHMER",
  "MYANMAR",
  "TIBETAN",
  "TIFINAGH",
  "SYLLABICS",
  "OL_CHIKI",
  "NKO",
  "THAANA",
  "MEITEI",
  "MONGOLIAN",
  "MIXED",
] as const;
export type LlWritingSystem = (typeof LL_WRITING_SYSTEMS)[number];

export const LL_FEATURES = [
  "LESSONS",
  "ASSESSMENT",
  "CONVERSATION",
  "VOCABULARY",
  "GRAMMAR",
  "WRITING",
  "LISTENING_TEXT",
  "LISTENING_AUDIO",
  "SPEAKING_TRANSCRIPT",
  "SPEAKING_PRONUNCIATION",
  "DAILY_PLAN",
  "WEAKNESS_DETECTION",
  // Session 199 — available for every catalog language, not just those with an
  // authored curriculum pack. Translation & detection run through the AI fabric.
  "TRANSLATION",
  "LANGUAGE_DETECTION",
] as const;
export type LlFeature = (typeof LL_FEATURES)[number];

export const LL_CEFR_LEVELS = [
  "NOT_STARTED",
  "BEGINNER",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;
export type LlCefrLevel = (typeof LL_CEFR_LEVELS)[number];

export const LL_SKILLS = [
  "VOCABULARY",
  "GRAMMAR",
  "READING",
  "LISTENING",
  "WRITING",
  "SPEAKING",
] as const;
export type LlSkill = (typeof LL_SKILLS)[number];

export const LL_GOALS = [
  "GENERAL",
  "TRAVEL",
  "WORK",
  "STUDY",
  "CONVERSATION",
  "EXAM",
  "FAMILY",
  "RELOCATION",
] as const;
export type LlGoal = (typeof LL_GOALS)[number];

export const LL_PROFILE_STATUSES = [
  "NOT_STARTED",
  "GOAL_SET",
  "ASSESSING",
  "READY",
  "LEARNING",
  "PAUSED",
] as const;
export type LlProfileStatus = (typeof LL_PROFILE_STATUSES)[number];

export const LL_LEVEL_SOURCES = ["NOT_SET", "ASSESSED", "SELF_DECLARED"] as const;
export type LlLevelSource = (typeof LL_LEVEL_SOURCES)[number];

export const LL_CORRECTION_MODES = [
  "IMMEDIATE",
  "AFTER_TURN",
  "IMPORTANT_ONLY",
  "CONVERSATION_ONLY",
] as const;
export type LlCorrectionMode = (typeof LL_CORRECTION_MODES)[number];

export const LL_CONVERSATION_MODES = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "CASUAL",
  "TRAVEL",
  "RESTAURANT",
  "SHOPPING",
  "HOTEL",
  "BUSINESS",
  "JOB_INTERVIEW",
  "SOCIAL",
  "EMERGENCY",
] as const;
export type LlConversationMode = (typeof LL_CONVERSATION_MODES)[number];

export const LL_ITEM_KINDS = [
  "MULTIPLE_CHOICE",
  "TRANSLATE_TO_TARGET",
  "TRANSLATE_TO_EXPLANATION",
  "FILL_BLANK",
  "FREE_TEXT",
  "LISTEN_CHOOSE",
  "LISTEN_TRANSCRIBE",
  "SPEAK_REPEAT",
] as const;
export type LlItemKind = (typeof LL_ITEM_KINDS)[number];

export const LL_AUDIO_STATUSES = ["TEXT_ONLY", "CLIENT_TTS", "PROVIDER_AUDIO"] as const;
export type LlAudioStatus = (typeof LL_AUDIO_STATUSES)[number];

export const LL_PRONUNCIATION_STATUSES = ["NOT_AVAILABLE", "PROVIDER"] as const;
export type LlPronunciationStatus = (typeof LL_PRONUNCIATION_STATUSES)[number];

export const LL_TEACHER_SOURCES = ["STRUCTURED_TEACHER", "LLM_AUGMENTED"] as const;
export type LlTeacherSource = (typeof LL_TEACHER_SOURCES)[number];

export interface LlLanguage {
  /** Stable internal key. Regional/script variants use a suffixed code, e.g. `zh-Hant`, `pt-BR`, `pa-Arab`. */
  code: string;
  /** English display name, e.g. "Chinese (Traditional)". */
  name: string;
  /** Endonym / native-script name where known; falls back to `name`. */
  nativeName: string;
  /** Best-effort ISO 639-1 (2-letter) code, or the base ISO 639-3 code when no 639-1 exists. */
  iso6391: string;
  /** BCP-47 tag used for TTS/locale and passed to the translation provider, e.g. `zh-Hant`, `pt-BR`, `ar`. */
  bcp47: string;
  writingSystem: LlWritingSystem;
  textDirection: LlTextDirection;
  family: string;
  supportedFeatures: LlFeature[];
  active: boolean;
  scriptNotes: string | null;
  /**
   * Session 199 — capability flags kept in the catalog so languages can be
   * enabled/disabled and their surfaces toggled without a rebuild.
   */
  /** Translation + detection are available (AI-fabric powered) for this entry. */
  translationSupported: boolean;
  /** A structured learning curriculum (vocab/grammar/lessons) is authored for this entry. */
  learningSupported: boolean;
  /** Region subtag, e.g. "BR", "PT", "CA" — null for non-regional entries. */
  region: string | null;
  /** Human label for the script/regional variant, e.g. "Simplified", "Jawi" — null for the default form. */
  variantLabel: string | null;
  /** Alternate spellings/aliases used by search and free-text language detection. */
  aliases: string[];
}

export interface LlUserLanguageProfile {
  id: string;
  organizationId: string;
  userId: string;
  languageCode: string;
  nativeLanguageCode: string;
  explanationLanguageCode: string;
  goal: LlGoal | null;
  goalNotes: string | null;
  dailyMinutes: number;
  currentLevel: LlCefrLevel;
  levelSource: LlLevelSource;
  status: LlProfileStatus;
  correctionMode: LlCorrectionMode;
  currentPathId: string | null;
  lastAssessmentId: string | null;
  studyStreakDays: number;
  lastStudyDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlSkillScore {
  skill: LlSkill;
  correct: number;
  asked: number;
  accuracy: number | null;
  level: LlCefrLevel;
}

export interface LlAssessmentItem {
  id: string;
  skill: LlSkill;
  level: LlCefrLevel;
  kind: LlItemKind;
  prompt: string;
  promptLanguage: string;
  targetText?: string;
  options?: string[];
  audioText?: string;
}

export interface LlAssessmentAnswer {
  itemId: string;
  response: string;
  correct: boolean;
  expected: string;
  explanation: string;
  skill: LlSkill;
  level: LlCefrLevel;
}

export interface LlAssessment {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  overallLevel: LlCefrLevel | null;
  skillScores: LlSkillScore[];
  strengths: LlSkill[];
  weaknesses: LlSkill[];
  recommendedFocus: string | null;
  itemsAsked: number;
  itemsCorrect: number;
  answers: LlAssessmentAnswer[];
  currentItem: LlAssessmentItem | null;
  source: "ADAPTIVE_BANK";
  createdAt: string;
  completedAt: string | null;
}

export interface LlLearningModule {
  id: string;
  languageCode: string;
  title: string;
  topic: string;
  level: LlCefrLevel;
  skills: LlSkill[];
  lessonIds: string[];
  week: number;
  order: number;
}

export interface LlLearningPath {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  level: LlCefrLevel;
  goal: LlGoal | null;
  modules: LlLearningModule[];
  currentModuleId: string | null;
  createdAt: string;
  updatedAt: string;
  source: "CURRICULUM";
}

export interface LlLessonPractice {
  id: string;
  skill: LlSkill;
  kind: LlItemKind;
  prompt: string;
  accepted: string[];
  hint: string | null;
  explanation: string;
}

export interface LlLesson {
  id: string;
  languageCode: string;
  moduleId: string;
  title: string;
  topic: string;
  level: LlCefrLevel;
  explanation: string;
  examples: Array<{ target: string; explanation: string }>;
  practice: LlLessonPractice[];
  estimatedMinutes: number;
}

export interface LlLessonAttempt {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  lessonId: string;
  status: "IN_PROGRESS" | "NEEDS_MORE_PRACTICE" | "COMPLETED";
  answers: Array<{
    practiceId: string;
    response: string;
    correct: boolean;
    expected: string;
    explanation: string;
  }>;
  correctCount: number;
  askedCount: number;
  completedAt: string | null;
  createdAt: string;
  teacherSource: LlTeacherSource;
}

export interface LlVocabItem {
  id: string;
  languageCode: string;
  word: string;
  translation: string;
  pronunciation: string;
  exampleSentence: string;
  exampleTranslation: string;
  difficulty: LlCefrLevel;
  category: string;
}

export interface LlUserVocab {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  vocabId: string;
  word: string;
  translation: string;
  pronunciation: string;
  exampleSentence: string;
  difficulty: LlCefrLevel;
  category: string;
  familiarity: number;
  easiness: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  lastQuality: number | null;
  createdAt: string;
}

export interface LlGrammarRule {
  id: string;
  languageCode: string;
  title: string;
  level: LlCefrLevel;
  rule: string;
  simpleRule: string;
  examples: Array<{ target: string; explanation: string }>;
}

export interface LlUserGrammarProgress {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  ruleId: string;
  title: string;
  attempts: number;
  correct: number;
  mastery: number;
  lastExplainedAt: string | null;
  simplifyCount: number;
  updatedAt: string;
}

export interface LlConversationTurn {
  role: "TEACHER" | "USER";
  text: string;
  correction: string | null;
  naturalVersion: string | null;
  notes: string | null;
  at: string;
}

export interface LlConversationSession {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  mode: LlConversationMode;
  correctionMode: LlCorrectionMode;
  status: "ACTIVE" | "ENDED";
  turns: LlConversationTurn[];
  prompt: string;
  expectedNext: string[] | null;
  createdAt: string;
  updatedAt: string;
  teacherSource: LlTeacherSource;
}

export interface LlWritingAttempt {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  prompt: string;
  originalText: string;
  correctedText: string;
  nativeVersion: string;
  mistakes: Array<{ kind: string; excerpt: string; explanation: string }>;
  scores: {
    grammar: number | null;
    spelling: number | null;
    vocabulary: number | null;
    structure: number | null;
    naturalness: number | null;
  };
  createdAt: string;
  teacherSource: LlTeacherSource;
}

export interface LlListeningAttempt {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  itemId: string;
  transcript: string;
  audioStatus: LlAudioStatus;
  speed: "SLOW" | "NORMAL" | "NATIVE";
  response: string;
  correct: boolean | null;
  createdAt: string;
}

export interface LlSpeakingAttempt {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  prompt: string;
  expected: string;
  transcript: string;
  transcriptSource: "CLIENT" | "PROVIDER" | "TYPED";
  accuracy: number | null;
  pronunciation: {
    status: LlPronunciationStatus;
    score: number | null;
    fluency: number | null;
    reason: string | null;
  };
  feedback: string;
  createdAt: string;
}

export interface LlStudySession {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  kind: string;
  minutes: number;
  startedAt: string;
  endedAt: string;
}

export interface LlDailyPlanItem {
  kind: "VOCAB_REVIEW" | "GRAMMAR" | "LESSON" | "SPEAKING" | "LISTENING" | "WRITING" | "CONVERSATION";
  title: string;
  detail: string;
  estimatedMinutes: number;
  dueCount?: number;
  completed: boolean;
}

export interface LlDailyPlan {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  date: string;
  items: LlDailyPlanItem[];
  estimatedMinutes: number;
  basedOn: string[];
  createdAt: string;
}

export interface LlRecommendation {
  id: string;
  organizationId: string;
  userId: string;
  profileId: string;
  languageCode: string;
  kind: "WEAKNESS" | "NEXT_LESSON" | "REVIEW" | "LEVEL";
  title: string;
  detail: string;
  evidence: string[];
  createdAt: string;
}

export interface LlProgress {
  languageCode: string;
  currentLevel: LlCefrLevel;
  levelSource: LlLevelSource;
  progressToNext: number | null;
  nextLevel: LlCefrLevel | null;
  vocabularyKnown: number;
  vocabularyDue: number;
  grammarMastery: number | null;
  speakingAccuracy: number | null;
  listeningAccuracy: number | null;
  writingAttempts: number;
  writingNaturalness: number | null;
  lessonsCompleted: number;
  lessonsAvailable: number;
  studyStreakDays: number;
  lastStudyDate: string | null;
  skillBreakdown: LlSkillScore[];
  evidenceCounts: Record<string, number>;
}

export interface LlDashboard {
  languages: LlLanguage[];
  profiles: Array<LlUserLanguageProfile & { progress: LlProgress }>;
  model: typeof LL_CURRENT_MODEL;
  speech: {
    pronunciationAssessment: LlPronunciationStatus;
    listeningAudio: LlAudioStatus;
    note: string;
  };
}

export const LlEnrollSchema = z.object({
  languageCode: z.string().min(2).max(12),
  nativeLanguageCode: z.string().min(2).max(12).default("en"),
  explanationLanguageCode: z.string().min(2).max(12).default("en"),
  goal: z.enum(LL_GOALS).optional(),
  goalNotes: z.string().trim().max(400).optional(),
  dailyMinutes: z.number().int().min(5).max(240).default(25),
});
export type LlEnrollInput = z.infer<typeof LlEnrollSchema>;

export const LlProfilePatchSchema = z.object({
  goal: z.enum(LL_GOALS).optional(),
  goalNotes: z.string().trim().max(400).nullable().optional(),
  dailyMinutes: z.number().int().min(5).max(240).optional(),
  nativeLanguageCode: z.string().min(2).max(12).optional(),
  explanationLanguageCode: z.string().min(2).max(12).optional(),
  correctionMode: z.enum(LL_CORRECTION_MODES).optional(),
  selfDeclaredLevel: z.enum(LL_CEFR_LEVELS).optional(),
  status: z.enum(LL_PROFILE_STATUSES).optional(),
});
export type LlProfilePatch = z.infer<typeof LlProfilePatchSchema>;

export const LlAssessmentAnswerSchema = z.object({
  response: z.string().trim().min(1).max(500),
});

export const LlLessonAnswerSchema = z.object({
  practiceId: z.string().min(2).max(80),
  response: z.string().trim().min(1).max(500),
});

export const LlTeacherAskSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  languageCode: z.string().min(2).max(12).optional(),
});

export const LlConversationStartSchema = z.object({
  mode: z.enum(LL_CONVERSATION_MODES).default("BEGINNER"),
  correctionMode: z.enum(LL_CORRECTION_MODES).optional(),
});

export const LlConversationTurnSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const LlWritingSchema = z.object({
  prompt: z.string().trim().min(3).max(400).optional(),
  text: z.string().trim().min(1).max(8000),
});

export const LlVocabReviewSchema = z.object({
  remembered: z.boolean(),
  quality: z.number().int().min(0).max(5).optional(),
});

export const LlVocabQuizAnswerSchema = z.object({
  itemId: z.string().min(2).max(80),
  response: z.string().trim().min(1).max(200),
});

export const LlGrammarAskSchema = z.object({
  ruleId: z.string().min(2).max(80).optional(),
  question: z.string().trim().min(1).max(800).optional(),
  simplify: z.boolean().optional(),
});

export const LlGrammarExerciseSchema = z.object({
  ruleId: z.string().min(2).max(80),
  response: z.string().trim().min(1).max(400),
});

export const LlListeningAnswerSchema = z.object({
  itemId: z.string().min(2).max(80),
  response: z.string().trim().min(1).max(800),
  speed: z.enum(["SLOW", "NORMAL", "NATIVE"]).default("NORMAL"),
  showTranscript: z.boolean().optional(),
});

export const LlSpeakingSchema = z.object({
  promptId: z.string().min(2).max(80).optional(),
  expected: z.string().trim().max(400).optional(),
  transcript: z.string().trim().min(1).max(800),
  transcriptSource: z.enum(["CLIENT", "PROVIDER", "TYPED"]).default("TYPED"),
});

export const LL_DISCLAIMER =
  "Progress, levels and recommendations are computed from your stored answers and reviews. The teacher does not invent fluency scores or pronunciation grades.";

/* ─────────────────────────── Translation & detection ─────────────────────── */
/**
 * Session 199 — context-aware translation and automatic language detection.
 *
 * Honesty rules carried over:
 *  - The engine source is always reported (`REAL` vs `DEMO`); a DEMO/echo
 *    result is never presented as a real translation.
 *  - When a provider fails or a language/direction is unavailable, the API
 *    returns a clear error — it never silently returns the input or a guess.
 */
export const LL_TRANSLATION_FORMALITIES = ["AUTO", "FORMAL", "INFORMAL"] as const;
export type LlTranslationFormality = (typeof LL_TRANSLATION_FORMALITIES)[number];

export const LL_ENGINE_SOURCES = ["REAL", "DEMO"] as const;
export type LlEngineSource = (typeof LL_ENGINE_SOURCES)[number];

export const AUTO_DETECT_CODE = "auto" as const;

export interface LlDetectedLanguage {
  /** Catalog code of the best guess, or null when detection is inconclusive. */
  code: string | null;
  /** English display name of the best guess, or null. */
  name: string | null;
  /** 0..1 confidence. */
  confidence: number;
  /** Whether the detector considers the guess reliable enough to translate from. */
  reliable: boolean;
  /** Ranked alternatives (excluding the winner). */
  alternatives: Array<{ code: string; name: string; confidence: number }>;
  /** How the detection was produced. */
  source: LlEngineSource | "HEURISTIC";
}

export interface LlTranslation {
  sourceText: string;
  translatedText: string;
  sourceLanguage: LlDetectedLanguage;
  targetLanguage: { code: string; name: string; bcp47: string };
  formality: LlTranslationFormality;
  /** Optional alternative renderings the model offered. */
  alternatives: string[];
  /** Optional short note (e.g. idiom handling, transliteration). */
  note: string | null;
  source: LlEngineSource;
  model: string;
  createdAt: string;
}

export const LlDetectLanguageSchema = z.object({
  text: z.string().trim().min(1).max(20000),
});

export const LlTranslateSchema = z.object({
  text: z.string().trim().min(1).max(20000),
  /** Target catalog code (required). */
  targetLanguage: z.string().min(2).max(24),
  /** Source catalog code, or "auto" to detect. Defaults to auto-detect. */
  sourceLanguage: z.string().min(2).max(24).default(AUTO_DETECT_CODE),
  formality: z.enum(LL_TRANSLATION_FORMALITIES).default("AUTO"),
  /** Preserve line breaks / markup layout where possible. */
  preserveFormatting: z.boolean().default(true),
  /** Include 1–2 alternative renderings when useful. */
  includeAlternatives: z.boolean().default(false),
});
export type LlTranslateInput = z.infer<typeof LlTranslateSchema>;
