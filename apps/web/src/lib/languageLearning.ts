import { api } from "./api";
import type {
  LlAssessment,
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

export type {
  LlAssessment, LlConversationSession, LlDailyPlan, LlDashboard, LlGrammarRule,
  LlLanguage, LlLearningPath, LlLesson, LlLessonAttempt, LlListeningAttempt,
  LlProgress, LlRecommendation, LlSpeakingAttempt, LlUserGrammarProgress,
  LlUserLanguageProfile, LlUserVocab, LlVocabItem, LlWritingAttempt,
  LlConversationMode, LlCorrectionMode,
};

export const languageApi = {
  languages: () => api<LlLanguage[]>("/language-learning/languages"),
  catalog: (code: string) => api<{ language: LlLanguage; vocabCount: number; grammarCount: number; lessonCount: number; assessmentItems: number }>(`/language-learning/languages/${code}`),
  dashboard: () => api<LlDashboard>("/language-learning/dashboard"),
  profiles: () => api<LlUserLanguageProfile[]>("/language-learning/profiles"),
  enroll: (input: LlEnrollInput) => api<LlUserLanguageProfile>("/language-learning/profiles", { method: "POST", json: input }),
  profile: (code: string) => api<LlUserLanguageProfile>(`/language-learning/profiles/${code}`),
  updateProfile: (code: string, patch: LlProfilePatch) => api<LlUserLanguageProfile>(`/language-learning/profiles/${code}`, { method: "PATCH", json: patch }),
  startAssessment: (code: string) => api<LlAssessment>(`/language-learning/assessments/${code}`, { method: "POST" }),
  assessment: (id: string) => api<LlAssessment>(`/language-learning/assessments/${id}`),
  answerAssessment: (id: string, response: string) => api<LlAssessment>(`/language-learning/assessments/${id}/answer`, { method: "POST", json: { response } }),
  path: (code: string) => api<LlLearningPath>(`/language-learning/paths/${code}`),
  lessons: (code: string) => api<LlLesson[]>(`/language-learning/lessons/${code}`),
  lesson: (code: string, id: string) => api<LlLesson>(`/language-learning/lessons/${code}/${id}`),
  startLesson: (code: string, id: string) => api<{ attempt: LlLessonAttempt; intro: any }>(`/language-learning/lessons/${code}/${id}/start`, { method: "POST" }),
  answerLesson: (attemptId: string, practiceId: string, response: string) =>
    api<LlLessonAttempt>(`/language-learning/lesson-attempts/${attemptId}/answer`, { method: "POST", json: { practiceId, response } }),
  lessonAttempts: (code: string) => api<LlLessonAttempt[]>(`/language-learning/lesson-attempts/${code}`),
  askTeacher: (message: string, languageCode?: string) =>
    api<{ message: string; suggestedAction: string; intent: any; teacherSource: string }>(`/language-learning/teacher`, { method: "POST", json: { message, languageCode } }),
  startConversation: (code: string, mode: LlConversationMode, correctionMode?: LlCorrectionMode) =>
    api<LlConversationSession>(`/language-learning/conversations/${code}`, { method: "POST", json: { mode, correctionMode } }),
  conversationTurn: (id: string, text: string) =>
    api<LlConversationSession>(`/language-learning/conversations/${id}/turn`, { method: "POST", json: { text } }),
  conversations: (code: string) => api<LlConversationSession[]>(`/language-learning/conversations/${code}`),
  vocabCatalog: (code: string) => api<LlVocabItem[]>(`/language-learning/vocabulary/${code}/catalog`),
  vocab: (code: string) => api<LlUserVocab[]>(`/language-learning/vocabulary/${code}`),
  vocabDue: (code: string) => api<LlUserVocab[]>(`/language-learning/vocabulary/${code}/due`),
  saveVocab: (code: string, vocabId: string) => api<LlUserVocab>(`/language-learning/vocabulary/${code}/${vocabId}`, { method: "POST" }),
  reviewVocab: (id: string, remembered: boolean, quality?: number) =>
    api<LlUserVocab>(`/language-learning/vocabulary-cards/${id}/review`, { method: "POST", json: { remembered, quality } }),
  vocabQuiz: (code: string) => api<Array<{ itemId: string; prompt: string; word: string }>>(`/language-learning/vocabulary/${code}/quiz`),
  answerVocabQuiz: (id: string, response: string) =>
    api<{ correct: boolean; expected: string; word: string }>(`/language-learning/vocabulary-cards/${id}/quiz`, { method: "POST", json: { itemId: id, response } }),
  grammar: (code: string) => api<LlGrammarRule[]>(`/language-learning/grammar/${code}`),
  explainGrammar: (code: string, ruleId?: string, simplify?: boolean) =>
    api<{ title: string; explanation: string; examples: Array<{ target: string; explanation: string }> }>(`/language-learning/grammar/${code}/explain`, { method: "POST", json: { ruleId, simplify } }),
  grammarExercise: (code: string, ruleId: string, response: string) =>
    api<{ correct: boolean; expected: string; explanation: string }>(`/language-learning/grammar/${code}/exercise`, { method: "POST", json: { ruleId, response } }),
  grammarProgress: (code: string) => api<LlUserGrammarProgress[]>(`/language-learning/grammar/${code}/progress`),
  write: (code: string, text: string, prompt?: string) =>
    api<LlWritingAttempt>(`/language-learning/writing/${code}`, { method: "POST", json: { text, prompt } }),
  writings: (code: string) => api<LlWritingAttempt[]>(`/language-learning/writing/${code}`),
  listeningItems: (code: string) => api<Array<{ id: string; prompt: string; audioText: string; audioStatus: string; level: string }>>(`/language-learning/listening/${code}`),
  answerListening: (code: string, itemId: string, response: string, speed: "SLOW" | "NORMAL" | "NATIVE" = "NORMAL") =>
    api<LlListeningAttempt>(`/language-learning/listening/${code}`, { method: "POST", json: { itemId, response, speed } }),
  speakingPrompts: (code: string) => api<Array<{ id: string; prompt: string; expected: string; pronunciation: string }>>(`/language-learning/speaking/${code}/prompts`),
  speak: (code: string, transcript: string, expected?: string, promptId?: string) =>
    api<LlSpeakingAttempt>(`/language-learning/speaking/${code}`, { method: "POST", json: { transcript, expected, promptId, transcriptSource: "TYPED" } }),
  plan: (code: string) => api<LlDailyPlan>(`/language-learning/plans/${code}`),
  progress: (code: string) => api<LlProgress>(`/language-learning/progress/${code}`),
  recommendations: (code: string) => api<LlRecommendation[]>(`/language-learning/recommendations/${code}`),
  nextStep: (code: string) => api<{ action: string; detail: string }>(`/language-learning/next/${code}`),
};
