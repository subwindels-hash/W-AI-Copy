/**
 * Structured AI Language Teacher.
 * Uses stored profile + curriculum. Optional LLM only augments explanations;
 * it never assigns levels, completion, or pronunciation scores.
 */

import type {
  LlConversationMode,
  LlCorrectionMode,
  LlCefrLevel,
  LlTeacherSource,
} from "@windels/shared/languageLearning";
import { conversationBeats, getPack, lessonById } from "./curriculum.js";
import { evaluateResponse, normalize } from "./engines.js";
import { getLanguage } from "./registry.js";

export interface TeacherIntent {
  kind:
    | "TEACH"
    | "ASSESS"
    | "CONVERSE"
    | "CORRECT"
    | "GRAMMAR"
    | "WRITE"
    | "VOCAB"
    | "LISTEN"
    | "SPEAK"
    | "PLAN"
    | "PROGRESS"
    | "UNKNOWN";
  languageCode: string | null;
  simplify: boolean;
}

export function detectIntent(message: string, fallbackLanguage: string | null): TeacherIntent {
  const text = message.toLowerCase();
  const simplify = /\bsimpl(e|y|er|ify)\b|\beasier\b|\bmore simply\b/.test(text);
  const languages = [
    ["dutch", "nl"], ["nederlands", "nl"], ["spanish", "es"], ["español", "es"],
    ["italian", "it"], ["italiano", "it"], ["french", "fr"], ["français", "fr"],
    ["german", "de"], ["deutsch", "de"], ["english", "en"], ["portuguese", "pt"],
    ["arabic", "ar"], ["chinese", "zh"], ["mandarin", "zh"], ["japanese", "ja"],
    ["korean", "ko"], ["russian", "ru"], ["hindi", "hi"], ["turkish", "tr"],
    ["swahili", "sw"], ["yoruba", "yo"], ["igbo", "ig"], ["hausa", "ha"],
    ["afrikaans", "af"], ["zulu", "zu"], ["indonesian", "id"], ["vietnamese", "vi"],
    ["polish", "pl"], ["swedish", "sv"], ["greek", "el"], ["hebrew", "he"],
    ["thai", "th"], ["ukrainian", "uk"], ["filipino", "fil"], ["tagalog", "fil"],
  ] as const;
  let languageCode: string | null = fallbackLanguage;
  for (const [name, code] of languages) {
    if (text.includes(name)) { languageCode = code; break; }
  }
  const kind: TeacherIntent["kind"] =
    /\b(test|assess|level|placement)\b/.test(text) ? "ASSESS"
      : /\b(conversation|practice .+ with me|talk to me|chat)\b/.test(text) ? "CONVERSE"
        : /\b(correct|fix my)\b/.test(text) ? "CORRECT"
          : /\b(grammar|explain .+ grammar)\b/.test(text) ? "GRAMMAR"
            : /\b(write|writing)\b/.test(text) ? "WRITE"
              : /\b(vocab|flashcard|word)\b/.test(text) ? "VOCAB"
                : /\b(listen|listening)\b/.test(text) ? "LISTEN"
                  : /\b(speak|pronounc)\b/.test(text) ? "SPEAK"
                    : /\b(plan|today)\b/.test(text) ? "PLAN"
                      : /\b(progress|level am i)\b/.test(text) ? "PROGRESS"
                        : /\b(teach|learn|lesson|from the beginning|start)\b/.test(text) ? "TEACH"
                          : "UNKNOWN";
  return { kind, languageCode, simplify };
}

export function openingFor(languageCode: string, level: LlCefrLevel, explanationLang: string): string {
  const lang = getLanguage(languageCode);
  const pack = getPack(languageCode);
  const greet = pack.greetings[0] ?? "";
  const name = lang?.name ?? languageCode;
  if (level === "NOT_STARTED") {
    return `${greet} I can teach you ${name}. First I need your goal, then an assessment so the starting level is based on your answers — not a guess.`;
  }
  return `${greet} We continue ${name} at ${level}. Explanations are in ${explanationLang}.`;
}

export function lessonIntro(languageCode: string, lessonId: string, simplify: boolean): {
  title: string;
  explanation: string;
  examples: Array<{ target: string; explanation: string }>;
  firstPractice: { id: string; prompt: string; hint: string | null } | null;
  teacherSource: LlTeacherSource;
} {
  const lesson = lessonById(languageCode, lessonId);
  if (!lesson) {
    const err: any = new Error("Lesson not found in the curriculum");
    err.code = "LESSON_NOT_FOUND";
    err.status = 404;
    throw err;
  }
  return {
    title: lesson.title,
    explanation: simplify
      ? `We will learn ${lesson.topic}. Look at the examples, then try the practice. I will tell you if the answer matches the curriculum.`
      : lesson.explanation,
    examples: lesson.examples,
    firstPractice: lesson.practice[0]
      ? { id: lesson.practice[0].id, prompt: lesson.practice[0].prompt, hint: lesson.practice[0].hint }
      : null,
    teacherSource: "STRUCTURED_TEACHER",
  };
}

export function conversationPrompt(
  languageCode: string,
  mode: LlConversationMode,
  correctionMode: LlCorrectionMode,
): { teacher: string; expected: string[]; hint: string; notes: string } {
  const beats = conversationBeats(languageCode, mode);
  const beat = beats[0];
  if (!beat) {
    return {
      teacher: getPack(languageCode).greetings[0] ?? "…",
      expected: [],
      hint: "Reply with a short greeting.",
      notes: `Correction mode: ${correctionMode}.`,
    };
  }
  return {
    teacher: beat.teacher,
    expected: beat.expected,
    hint: beat.hint,
    notes: correctionMode === "CONVERSATION_ONLY"
      ? "I will stay in the conversation and not correct unless you ask."
      : correctionMode === "IMPORTANT_ONLY"
        ? "I will only correct mistakes that change the meaning."
        : correctionMode === "AFTER_TURN"
          ? "I will reply first, then offer a correction."
          : "I will correct immediately when the reply does not match a natural target.",
  };
}

export function scoreConversationReply(
  text: string,
  expected: string[],
  natural: string,
  correctionMode: LlCorrectionMode,
): { correction: string | null; naturalVersion: string | null; notes: string | null; ok: boolean } {
  if (!expected.length) {
    return { correction: null, naturalVersion: null, notes: "No scripted target for this turn.", ok: true };
  }
  const ev = evaluateResponse(text, expected);
  if (ev.correct) {
    return { correction: null, naturalVersion: natural, notes: "That works.", ok: true };
  }
  const important = ev.closeness < 0.35;
  if (correctionMode === "CONVERSATION_ONLY") {
    return { correction: null, naturalVersion: natural, notes: null, ok: false };
  }
  if (correctionMode === "IMPORTANT_ONLY" && !important) {
    return { correction: null, naturalVersion: natural, notes: "Understood — a more natural version exists but the meaning is clear.", ok: false };
  }
  return {
    correction: `A more natural way: “${natural}”.`,
    naturalVersion: natural,
    notes: `I heard “${text}”. Target replies include: ${expected.slice(0, 3).join(" / ")}.`,
    ok: false,
  };
}

export function nextConversationBeat(languageCode: string, mode: LlConversationMode, turnCount: number) {
  const beats = conversationBeats(languageCode, mode);
  return beats[turnCount % Math.max(1, beats.length)] ?? beats[0] ?? null;
}

export function grammarExplain(languageCode: string, ruleId: string | undefined, simplify: boolean): {
  title: string;
  explanation: string;
  examples: Array<{ target: string; explanation: string }>;
  teacherSource: LlTeacherSource;
} {
  const pack = getPack(languageCode);
  const rule = ruleId ? pack.grammar.find((g) => g.id === ruleId) : pack.grammar[0];
  if (!rule) {
    const err: any = new Error("No grammar rule is available for this language");
    err.code = "GRAMMAR_NOT_FOUND";
    err.status = 404;
    throw err;
  }
  return {
    title: rule.title,
    explanation: simplify ? rule.simpleRule : rule.rule,
    examples: rule.examples,
    teacherSource: "STRUCTURED_TEACHER",
  };
}

export function teacherReplyTemplate(intent: TeacherIntent, context: {
  hasProfile: boolean;
  level: LlCefrLevel | null;
  languageName: string | null;
}): { message: string; suggestedAction: string } {
  const lang = context.languageName ?? "the language";
  switch (intent.kind) {
    case "ASSESS":
      return { message: `I will test your ${lang} with adaptive questions. Your level will come from those answers.`, suggestedAction: "START_ASSESSMENT" };
    case "TEACH":
      return {
        message: context.hasProfile
          ? `We start from your stored ${context.level ?? "unassessed"} ${lang} path.`
          : `I can teach ${lang}. Enroll first so progress stays on its own profile.`,
        suggestedAction: context.hasProfile ? "START_LESSON" : "ENROLL",
      };
    case "CONVERSE":
      return { message: `Conversation practice in ${lang}. Choose a scene and a correction style.`, suggestedAction: "START_CONVERSATION" };
    case "CORRECT":
      return { message: "Paste the text you want corrected. I keep your original and store both versions.", suggestedAction: "WRITE" };
    case "GRAMMAR":
      return { message: `I will explain a ${lang} grammar rule from the curriculum. Ask me to simplify if needed.`, suggestedAction: "GRAMMAR" };
    case "WRITE":
      return { message: "Write in the language you are learning. I will keep the original and show a corrected version.", suggestedAction: "WRITE" };
    case "VOCAB":
      return { message: "Open vocabulary to learn, review due cards, or take a quiz.", suggestedAction: "VOCAB" };
    case "LISTEN":
      return { message: "Listening uses stored sentences. Audio is client speech synthesis unless a provider is configured.", suggestedAction: "LISTEN" };
    case "SPEAK":
      return { message: "Speaking compares your transcript to a target sentence. I will not invent a pronunciation score.", suggestedAction: "SPEAK" };
    case "PLAN":
      return { message: "Your daily plan is built from due reviews, weak areas and remaining minutes.", suggestedAction: "PLAN" };
    case "PROGRESS":
      return { message: "Progress is computed from stored attempts only.", suggestedAction: "PROGRESS" };
    default:
      return {
        message: "I can teach, assess, converse, correct writing, drill vocabulary, or explain grammar. Tell me the language and what you want to do.",
        suggestedAction: "CHOOSE",
      };
  }
}

export function looksLikeLanguageName(s: string): boolean {
  return Boolean(detectIntent(`learn ${s}`, null).languageCode);
}

export { normalize };
