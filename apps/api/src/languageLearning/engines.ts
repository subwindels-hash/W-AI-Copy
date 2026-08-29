/**
 * Deterministic learning engines: scoring, adaptive assessment, SM-2 SRS,
 * weakness detection, progress and daily plans. No invented scores.
 */

import type {
  LlAssessmentAnswer,
  LlAssessmentItem,
  LlCefrLevel,
  LlDailyPlanItem,
  LlProgress,
  LlSkill,
  LlSkillScore,
  LlUserVocab,
} from "@windels/shared/languageLearning";
import { LL_CEFR_LEVELS, LL_SKILLS } from "@windels/shared/languageLearning";
import { assessmentBank, getPack, levelIndex, nextLevel } from "./curriculum.js";

export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[¿?¡!.,;:"""''`~]/g, "")
    .replace(/\s+/g, " ");
}

const POLITE_EXTRA = new Set([
  "please", "thanks", "thank", "you", "alstublieft", "alsjeblieft", "dank", "je", "wel",
  "gracias", "merci", "danke", "por", "favor", "s'il", "vous", "plaît", "bitte",
]);

export function evaluateResponse(response: string, accepted: string[]): {
  correct: boolean;
  expected: string;
  closeness: number;
} {
  const got = normalize(response);
  const opts = accepted.map(normalize).filter(Boolean);
  if (!opts.length) {
    return { correct: false, expected: accepted[0] ?? "", closeness: 0 };
  }
  if (opts.includes(got)) return { correct: true, expected: accepted[0]!, closeness: 1 };
  const gotTokens = got.split(" ").filter(Boolean);
  for (const o of opts) {
    const ot = o.split(" ").filter(Boolean);
    if (!ot.length) continue;
    const extras = gotTokens.filter((t) => !ot.includes(t));
    const missing = ot.filter((t) => !gotTokens.includes(t));
    if (!missing.length && extras.every((t) => POLITE_EXTRA.has(t))) {
      return { correct: true, expected: accepted[0]!, closeness: 0.95 };
    }
    if (!missing.length && ot.length >= 2 && extras.length <= 1) {
      return { correct: true, expected: accepted[0]!, closeness: 0.9 };
    }
  }
  const best = opts.reduce((acc, o) => Math.max(acc, tokenOverlap(got, o)), 0);
  return { correct: false, expected: accepted[0]!, closeness: best };
}

function tokenOverlap(a: string, b: string): number {
  const as = new Set(a.split(" ").filter(Boolean));
  const bs = new Set(b.split(" ").filter(Boolean));
  if (!as.size || !bs.size) {
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    let hit = 0;
    for (let i = 0; i < shorter.length; i++) if (longer.includes(shorter[i]!)) hit += 1;
    return hit / longer.length;
  }
  let hit = 0;
  for (const t of as) if (bs.has(t)) hit += 1;
  return hit / Math.max(as.size, bs.size);
}

export function scoreToLevel(accuracy: number | null, asked: number): LlCefrLevel {
  if (asked === 0 || accuracy == null) return "NOT_STARTED";
  if (asked < 3 && accuracy < 0.4) return "BEGINNER";
  if (accuracy < 0.35) return "BEGINNER";
  if (accuracy < 0.5) return "A1";
  if (accuracy < 0.65) return "A2";
  if (accuracy < 0.78) return "B1";
  if (accuracy < 0.88) return "B2";
  if (accuracy < 0.95) return "C1";
  return "C2";
}

export function skillScores(answers: LlAssessmentAnswer[]): LlSkillScore[] {
  return LL_SKILLS.map((skill) => {
    const rows = answers.filter((a) => a.skill === skill);
    const correct = rows.filter((a) => a.correct).length;
    const asked = rows.length;
    const accuracy = asked ? correct / asked : null;
    return { skill, correct, asked, accuracy, level: scoreToLevel(accuracy, asked) };
  });
}

export function overallFromSkills(scores: LlSkillScore[]): LlCefrLevel {
  const usable = scores.filter((s) => s.asked > 0);
  if (!usable.length) return "NOT_STARTED";
  const weighted = usable.reduce((sum, s) => sum + levelIndex(s.level === "NOT_STARTED" ? "BEGINNER" : s.level), 0) / usable.length;
  const idx = Math.max(0, Math.min(LEVEL_ORDER_SAFE.length - 1, Math.round(weighted)));
  return LEVEL_ORDER_SAFE[idx]!;
}

const LEVEL_ORDER_SAFE: LlCefrLevel[] = ["BEGINNER", "A1", "A2", "B1", "B2", "C1", "C2"];

export function strengthsAndWeaknesses(scores: LlSkillScore[]): { strengths: LlSkill[]; weaknesses: LlSkill[] } {
  const usable = scores.filter((s) => s.asked > 0 && s.accuracy != null);
  if (!usable.length) return { strengths: [], weaknesses: [] };
  const avg = usable.reduce((s, x) => s + (x.accuracy ?? 0), 0) / usable.length;
  return {
    strengths: usable.filter((s) => (s.accuracy ?? 0) >= avg && (s.accuracy ?? 0) >= 0.7).map((s) => s.skill),
    weaknesses: usable.filter((s) => (s.accuracy ?? 0) < 0.55 || (s.accuracy ?? 0) + 0.15 < avg).map((s) => s.skill),
  };
}

export function pickNextAssessmentItem(opts: {
  languageCode: string;
  answers: LlAssessmentAnswer[];
  askedIds: Set<string>;
}): LlAssessmentItem | null {
  const { languageCode, answers, askedIds } = opts;
  const scores = skillScores(answers);
  const last = answers[answers.length - 1];
  let targetLevel: LlCefrLevel = "A1";
  if (last) {
    const bump = last.correct ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(LEVEL_ORDER_SAFE.length - 1, levelIndex(last.level === "BEGINNER" ? "A1" : last.level) + bump));
    targetLevel = LEVEL_ORDER_SAFE[nextIdx] ?? "A1";
  }
  const underAsked = scores.filter((s) => s.asked < 2).map((s) => s.skill);
  const preferSkill = underAsked[0] ?? last?.skill;
  const bank = assessmentBank(languageCode);
  const candidates = bank.filter((q) => !askedIds.has(q.id));
  if (!candidates.length) return null;
  const sameSkill = preferSkill ? candidates.filter((q) => q.skill === preferSkill) : candidates;
  const pool = (sameSkill.length ? sameSkill : candidates).sort((a, b) => {
    return Math.abs(levelIndex(a.level) - levelIndex(targetLevel)) - Math.abs(levelIndex(b.level) - levelIndex(targetLevel));
  });
  return pool[0] ?? null;
}

export function acceptedAnswers(languageCode: string, item: LlAssessmentItem): string[] {
  const pack = getPack(languageCode);
  if (item.kind === "MULTIPLE_CHOICE" || item.kind === "LISTEN_CHOOSE") {
    return item.targetText ? [item.targetText] : item.options?.slice(0, 1) ?? [];
  }
  if (item.id.startsWith("qg_")) {
    const n = Number(item.id.split("_").pop());
    const g = pack.grammar[n];
    if (g) {
      const lesson = pack.lessons.find((l) => l.title === g.title);
      const acc = lesson?.practice[0]?.accepted ?? [];
      if (acc.length) return acc;
    }
  }
  if (item.targetText) {
    const v = pack.vocab.find((x) => x.word === item.targetText || x.translation === item.targetText);
    if (v) {
      if (item.skill === "WRITING" || item.skill === "SPEAKING") return [v.word, v.word.toLowerCase()];
      return [v.translation, ...v.translation.split("/").map((s) => s.trim())];
    }
    return [item.targetText];
  }
  return [];
}

/** SM-2. quality 0–5. Intervals start 1 / 3 / 7 / 14 then ease-based. */
export function reviewSchedule(card: Pick<LlUserVocab, "easiness" | "intervalDays" | "repetitions">, quality: number): {
  easiness: number;
  intervalDays: number;
  repetitions: number;
  familiarity: number;
} {
  const q = Math.max(0, Math.min(5, quality));
  let ef = card.easiness || 2.5;
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  let reps = card.repetitions;
  let interval = card.intervalDays;
  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else if (reps === 3) interval = 7;
    else if (reps === 4) interval = 14;
    else interval = Math.max(1, Math.round(interval * ef));
  }
  const familiarity = Math.max(0, Math.min(5, reps === 0 ? Math.max(0, q - 1) : Math.min(5, 1 + reps + (q - 3))));
  return { easiness: Number(ef.toFixed(2)), intervalDays: interval, repetitions: reps, familiarity };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export interface PerformanceEvent {
  kind: string;
  skill?: LlSkill;
  topic?: string;
  correct?: boolean;
  at: string;
}

export function detectWeaknesses(events: PerformanceEvent[]): Array<{ topic: string; skill: LlSkill | null; misses: number; attempts: number; evidence: string[] }> {
  const buckets = new Map<string, { skill: LlSkill | null; misses: number; attempts: number; evidence: string[] }>();
  for (const e of events) {
    if (e.correct == null) continue;
    const key = e.topic || e.skill || e.kind;
    const row = buckets.get(key) ?? { skill: e.skill ?? null, misses: 0, attempts: 0, evidence: [] };
    row.attempts += 1;
    if (!e.correct) {
      row.misses += 1;
      if (row.evidence.length < 5) row.evidence.push(`${e.kind}${e.topic ? `:${e.topic}` : ""} at ${e.at}`);
    }
    buckets.set(key, row);
  }
  return [...buckets.entries()]
    .map(([topic, v]) => ({ topic, ...v }))
    .filter((v) => v.attempts >= 2 && v.misses / v.attempts >= 0.4)
    .sort((a, b) => b.misses / b.attempts - a.misses / a.attempts);
}

export function computeProgress(input: {
  languageCode: string;
  currentLevel: LlCefrLevel;
  levelSource: LlProgress["levelSource"];
  vocab: LlUserVocab[];
  grammar: Array<{ attempts: number; correct: number; mastery: number }>;
  speaking: Array<{ accuracy: number | null }>;
  listening: Array<{ correct: boolean | null }>;
  writing: Array<{ scores: { naturalness: number | null } }>;
  lessonsCompleted: number;
  studyStreakDays: number;
  lastStudyDate: string | null;
  skillEvents: PerformanceEvent[];
}): LlProgress {
  const pack = getPack(input.languageCode);
  const now = Date.now();
  const due = input.vocab.filter((v) => Date.parse(v.nextReviewAt) <= now).length;
  const grammarMastery = input.grammar.length
    ? input.grammar.reduce((s, g) => s + g.mastery, 0) / input.grammar.length
    : null;
  const speakingRows = input.speaking.filter((s) => s.accuracy != null);
  const speakingAccuracy = speakingRows.length
    ? speakingRows.reduce((s, x) => s + (x.accuracy ?? 0), 0) / speakingRows.length
    : null;
  const listenRows = input.listening.filter((l) => l.correct != null);
  const listeningAccuracy = listenRows.length
    ? listenRows.filter((l) => l.correct).length / listenRows.length
    : null;
  const writeRows = input.writing.filter((w) => w.scores.naturalness != null);
  const writingNaturalness = writeRows.length
    ? writeRows.reduce((s, w) => s + (w.scores.naturalness ?? 0), 0) / writeRows.length
    : null;

  const bySkill = skillScores(
    input.skillEvents
      .filter((e) => e.skill && e.correct != null)
      .map((e) => ({
        itemId: e.kind,
        response: "",
        correct: Boolean(e.correct),
        expected: "",
        explanation: "",
        skill: e.skill!,
        level: input.currentLevel === "NOT_STARTED" ? "A1" : input.currentLevel,
      })),
  );

  const next = nextLevel(input.currentLevel === "NOT_STARTED" ? "BEGINNER" : input.currentLevel);
  let progressToNext: number | null = null;
  if (input.lessonsCompleted === 0 && input.vocab.length === 0 && input.grammar.length === 0) {
    progressToNext = input.levelSource === "NOT_SET" ? null : 0;
  } else {
    const lessonShare = pack.lessons.length ? input.lessonsCompleted / pack.lessons.length : 0;
    const vocabShare = pack.vocab.length ? input.vocab.filter((v) => v.familiarity >= 3).length / pack.vocab.length : 0;
    const gShare = grammarMastery ?? 0;
    progressToNext = Math.max(0, Math.min(1, lessonShare * 0.45 + vocabShare * 0.35 + gShare * 0.2));
  }

  return {
    languageCode: input.languageCode,
    currentLevel: input.currentLevel,
    levelSource: input.levelSource,
    progressToNext,
    nextLevel: next,
    vocabularyKnown: input.vocab.filter((v) => v.familiarity >= 3).length,
    vocabularyDue: due,
    grammarMastery,
    speakingAccuracy,
    listeningAccuracy,
    writingAttempts: input.writing.length,
    writingNaturalness,
    lessonsCompleted: input.lessonsCompleted,
    lessonsAvailable: pack.lessons.length,
    studyStreakDays: input.studyStreakDays,
    lastStudyDate: input.lastStudyDate,
    skillBreakdown: bySkill,
    evidenceCounts: {
      vocabCards: input.vocab.length,
      grammarRules: input.grammar.length,
      speakingAttempts: input.speaking.length,
      listeningAttempts: input.listening.length,
      writingAttempts: input.writing.length,
      skillEvents: input.skillEvents.length,
    },
  };
}

export function buildDailyPlan(opts: {
  level: LlCefrLevel;
  goal: string | null;
  dailyMinutes: number;
  vocabDue: number;
  weakTopics: string[];
  nextLessonTitle: string | null;
  lastKinds: string[];
}): { items: LlDailyPlanItem[]; basedOn: string[] } {
  const basedOn: string[] = [];
  const items: LlDailyPlanItem[] = [];
  const minutes = Math.max(10, opts.dailyMinutes);
  if (opts.vocabDue > 0) {
    const n = Math.min(opts.vocabDue, Math.max(5, Math.round(minutes * 0.35 / 1)));
    items.push({
      kind: "VOCAB_REVIEW",
      title: `Review ${n} vocabulary word${n === 1 ? "" : "s"}`,
      detail: `${opts.vocabDue} card${opts.vocabDue === 1 ? "" : "s"} are due on the spaced-repetition schedule.`,
      estimatedMinutes: Math.min(15, n),
      dueCount: opts.vocabDue,
      completed: false,
    });
    basedOn.push("due vocabulary");
  }
  if (opts.nextLessonTitle) {
    items.push({
      kind: "LESSON",
      title: `Complete today's lesson: ${opts.nextLessonTitle}`,
      detail: `Selected from your ${opts.level} path${opts.goal ? ` and ${opts.goal.toLowerCase()} goal` : ""}.`,
      estimatedMinutes: 10,
      completed: false,
    });
    basedOn.push("learning path");
  }
  if (opts.weakTopics[0]) {
    items.push({
      kind: "GRAMMAR",
      title: `Practice weak area: ${opts.weakTopics[0]}`,
      detail: "This topic has a high miss rate in your stored attempts.",
      estimatedMinutes: 6,
      completed: false,
    });
    basedOn.push("stored mistakes");
  }
  if (!opts.lastKinds.includes("SPEAKING")) {
    items.push({
      kind: "SPEAKING",
      title: "Practice speaking for 5 minutes",
      detail: "Repeat target sentences. Pronunciation scores appear only if a real provider is configured.",
      estimatedMinutes: 5,
      completed: false,
    });
    basedOn.push("skill balance");
  }
  items.push({
    kind: "LISTENING",
    title: "Complete one listening exercise",
    detail: "Listen to a stored sentence and answer. Audio is client TTS unless a provider is configured.",
    estimatedMinutes: 4,
    completed: false,
  });
  let used = items.reduce((s, i) => s + i.estimatedMinutes, 0);
  if (used > minutes) {
    while (items.length > 1 && used > minutes) {
      const last = items.pop();
      if (last) used -= last.estimatedMinutes;
    }
  }
  return { items, basedOn: [...new Set(basedOn)] };
}

export function analyzeWriting(original: string, languageCode: string): {
  correctedText: string;
  nativeVersion: string;
  mistakes: Array<{ kind: string; excerpt: string; explanation: string }>;
  scores: { grammar: number | null; spelling: number | null; vocabulary: number | null; structure: number | null; naturalness: number | null };
} {
  const pack = getPack(languageCode);
  const mistakes: Array<{ kind: string; excerpt: string; explanation: string }> = [];
  let corrected = original;
  const lower = normalize(original);
  if (!original.trim()) {
    return {
      correctedText: original,
      nativeVersion: original,
      mistakes: [{ kind: "empty", excerpt: "", explanation: "No text was provided." }],
      scores: { grammar: null, spelling: null, vocabulary: null, structure: null, naturalness: null },
    };
  }

  for (const v of pack.vocab) {
    const tr = normalize(v.translation);
    if (tr.length >= 3 && lower.includes(tr) && !normalize(original).includes(normalize(v.word))) {
      mistakes.push({
        kind: "vocabulary",
        excerpt: v.translation,
        explanation: `You used the explanation-language word “${v.translation}”. In ${pack.code} this is “${v.word}”.`,
      });
      const re = new RegExp(v.translation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
      corrected = corrected.replace(re, v.word);
    }
  }

  if (pack.code === "nl" && /\bik goed\b/i.test(original)) {
    mistakes.push({ kind: "grammar", excerpt: "ik goed", explanation: "Dutch needs a verb here. A natural reply is “Het gaat goed”." });
    corrected = corrected.replace(/ik goed/ig, "Het gaat goed");
  }
  if (pack.code === "es" && /\byo bien\b/i.test(original)) {
    mistakes.push({ kind: "grammar", excerpt: "yo bien", explanation: "Spanish usually needs a verb: “Estoy bien”." });
    corrected = corrected.replace(/yo bien/ig, "Estoy bien");
  }
  if (pack.code === "de" && /\bich gut\b/i.test(original)) {
    mistakes.push({ kind: "grammar", excerpt: "ich gut", explanation: "German needs the verb: “Mir geht es gut”." });
    corrected = corrected.replace(/ich gut/ig, "Mir geht es gut");
  }
  if (pack.code === "fr" && /\bje bien\b/i.test(original)) {
    mistakes.push({ kind: "grammar", excerpt: "je bien", explanation: "French needs the verb: “Je vais bien”." });
    corrected = corrected.replace(/je bien/ig, "Je vais bien");
  }

  const words = original.trim().split(/\s+/);
  if (words.length < 3) {
    mistakes.push({ kind: "structure", excerpt: original.trim(), explanation: "This is very short. Try a full sentence with a subject and a verb." });
  }

  const vocabHits = pack.vocab.filter((v) => normalize(original).includes(normalize(v.word))).length;
  const vocabScore = Math.max(0.2, Math.min(1, vocabHits / Math.max(3, words.length / 4)));
  const grammarScore = mistakes.some((m) => m.kind === "grammar") ? 0.45 : words.length >= 3 ? 0.8 : 0.55;
  const spellingScore = /[0-9]{5,}/.test(original) ? 0.5 : 0.75;
  const structureScore = words.length >= 6 ? 0.8 : words.length >= 3 ? 0.6 : 0.35;
  const naturalness = Math.max(0.2, Math.min(1, (grammarScore + vocabScore + structureScore) / 3 - (mistakes.length > 3 ? 0.15 : 0)));

  const nativeBits = pack.vocab.filter((v) => normalize(corrected).includes(normalize(v.word))).slice(0, 4).map((v) => v.exampleSentence);
  const nativeVersion = nativeBits[0] ?? corrected;

  return {
    correctedText: corrected,
    nativeVersion,
    mistakes,
    scores: {
      grammar: Number(grammarScore.toFixed(2)),
      spelling: Number(spellingScore.toFixed(2)),
      vocabulary: Number(vocabScore.toFixed(2)),
      structure: Number(structureScore.toFixed(2)),
      naturalness: Number(naturalness.toFixed(2)),
    },
  };
}

export function evaluateTranscript(expected: string, transcript: string): { accuracy: number; feedback: string } {
  const ev = evaluateResponse(transcript, [expected, ...expected.split("/").map((s) => s.trim())]);
  const accuracy = ev.correct ? 1 : ev.closeness;
  const feedback = ev.correct
    ? `That matches the target: “${expected}”.`
    : `Heard “${transcript}”. Target: “${expected}”.`;
  return { accuracy: Number(accuracy.toFixed(2)), feedback };
}

export function streakFromDates(dates: string[], todayIso: string): number {
  const days = [...new Set(dates.map((d) => d.slice(0, 10)))].sort().reverse();
  if (!days.length) return 0;
  const today = todayIso.slice(0, 10);
  let cursor = new Date(`${today}T00:00:00.000Z`);
  if (days[0] !== today) {
    const y = new Date(cursor);
    y.setUTCDate(y.getUTCDate() - 1);
    if (days[0] !== y.toISOString().slice(0, 10)) return 0;
    cursor = y;
  }
  let streak = 0;
  for (const day of days) {
    if (day === cursor.toISOString().slice(0, 10)) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else break;
  }
  return streak;
}

export const ASSESSABLE_LEVELS = LL_CEFR_LEVELS.filter((l) => l !== "NOT_STARTED");
