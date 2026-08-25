import { describe, it, expect } from "vitest";
import {
  analyzeWriting,
  buildDailyPlan,
  detectWeaknesses,
  evaluateResponse,
  evaluateTranscript,
  overallFromSkills,
  reviewSchedule,
  scoreToLevel,
  skillScores,
  streakFromDates,
} from "./engines.js";
import { REQUIRED_CATALOG_CODES, getLanguage, listLanguages, registerLanguage } from "./registry.js";
import { conversationBeats, curriculumCeiling, getPack, listPackCodes, pathForLevel } from "./curriculum.js";
import { detectIntent } from "./teacher.js";

describe("Language registry", () => {
  it("includes every required catalog language with metadata", () => {
    const codes = listLanguages().map((l) => l.code);
    for (const code of REQUIRED_CATALOG_CODES) {
      expect(codes).toContain(code);
      const lang = getLanguage(code);
      expect(lang?.iso6391).toBeTruthy();
      expect(lang?.nativeName).toBeTruthy();
      expect(lang?.writingSystem).toBeTruthy();
      expect(lang?.textDirection === "LTR" || lang?.textDirection === "RTL").toBe(true);
      expect(lang?.supportedFeatures.length).toBeGreaterThan(4);
      expect(lang?.active).toBe(true);
    }
  });

  it("treats Arabic and Hebrew as RTL", () => {
    expect(getLanguage("ar")?.textDirection).toBe("RTL");
    expect(getLanguage("he")?.textDirection).toBe("RTL");
  });

  it("allows a new language to be registered without hard-coding it elsewhere", () => {
    const added = registerLanguage({
      code: "cy",
      name: "Welsh",
      nativeName: "Cymraeg",
      iso6391: "cy",
      writingSystem: "LATIN",
      textDirection: "LTR",
      family: "Celtic",
      supportedFeatures: ["LESSONS", "ASSESSMENT"],
      active: true,
      scriptNotes: null,
    });
    expect(getLanguage("cy")?.name).toBe("Welsh");
    expect(added.code).toBe("cy");
  });
});

describe("Curriculum packs", () => {
  it("ships a pack for every required language", () => {
    const packs = listPackCodes();
    for (const code of REQUIRED_CATALOG_CODES) {
      expect(packs).toContain(code);
      const pack = getPack(code);
      expect(pack.vocab.length).toBeGreaterThanOrEqual(15);
      expect(pack.grammar.length).toBeGreaterThanOrEqual(2);
      expect(pack.lessons.length).toBeGreaterThanOrEqual(5);
      expect(pack.assessment.length).toBeGreaterThanOrEqual(10);
    }
  });

  it("builds a level-filtered path from the curriculum, not a random list", () => {
    const a1 = pathForLevel("nl", "A1", "GENERAL");
    const b1 = pathForLevel("nl", "B1", "TRAVEL");
    expect(a1.length).toBeGreaterThan(0);
    expect(b1.length).toBeGreaterThanOrEqual(a1.length);
    expect(a1.every((m) => m.languageCode === "nl")).toBe(true);
  });

  it("authors B2 workplace content and reports that ceiling honestly", () => {
    for (const code of REQUIRED_CATALOG_CODES) {
      const pack = getPack(code);
      expect(curriculumCeiling(code)).toBe("B2");
      expect(pack.vocab.some((v) => v.difficulty === "B2" && v.category === "work")).toBe(true);
      expect(pack.grammar.some((g) => g.level === "B2")).toBe(true);
      expect(pack.writing.some((w) => w.level === "B2")).toBe(true);
      expect(pack.lessons.some((l) => l.level === "B2" && l.topic === "work")).toBe(true);
      expect(conversationBeats(code, "BUSINESS").some((b) => b.mode === "BUSINESS")).toBe(true);
      expect(pack.vocab.some((v) => v.difficulty === "C1" || v.difficulty === "C2")).toBe(false);
    }
    const workPath = pathForLevel("nl", "B2", "WORK");
    expect(workPath[0]?.topic === "work" || workPath.some((m) => m.topic === "work")).toBe(true);
  });
});

describe("Scoring honesty", () => {
  it("accepts exact and close translations and rejects unrelated text", () => {
    expect(evaluateResponse("Hello", ["hello", "hi"]).correct).toBe(true);
    expect(evaluateResponse("  HELLO! ", ["hello"]).correct).toBe(true);
    expect(evaluateResponse("banana", ["hello"]).correct).toBe(false);
    expect(evaluateResponse("Ik goed", ["goed", "het gaat goed"]).correct).toBe(false);
  });

  it("maps accuracy to CEFR bands from performance, not chance", () => {
    expect(scoreToLevel(null, 0)).toBe("NOT_STARTED");
    expect(scoreToLevel(0.1, 10)).toBe("BEGINNER");
    expect(scoreToLevel(0.55, 10)).toBe("A2");
    expect(scoreToLevel(0.99, 10)).toBe("C2");
  });

  it("computes overall level from skill answers", () => {
    const scores = skillScores([
      { itemId: "1", response: "x", correct: true, expected: "x", explanation: "", skill: "VOCABULARY", level: "A2" },
      { itemId: "2", response: "x", correct: true, expected: "x", explanation: "", skill: "VOCABULARY", level: "A2" },
      { itemId: "3", response: "x", correct: false, expected: "x", explanation: "", skill: "GRAMMAR", level: "A2" },
      { itemId: "4", response: "x", correct: false, expected: "x", explanation: "", skill: "GRAMMAR", level: "A2" },
    ]);
    const vocab = scores.find((s) => s.skill === "VOCABULARY")!;
    const grammar = scores.find((s) => s.skill === "GRAMMAR")!;
    expect(vocab.accuracy).toBe(1);
    expect(grammar.accuracy).toBe(0);
    expect(overallFromSkills(scores)).not.toBe("NOT_STARTED");
  });
});

describe("SM-2 spaced repetition", () => {
  it("uses 1 then 3 then 7 then 14 day intervals on successful reviews", () => {
    let card = { easiness: 2.5, intervalDays: 0, repetitions: 0 };
    card = { ...card, ...reviewSchedule(card, 4) };
    expect(card.intervalDays).toBe(1);
    card = { ...card, ...reviewSchedule(card, 4) };
    expect(card.intervalDays).toBe(3);
    card = { ...card, ...reviewSchedule(card, 5) };
    expect(card.intervalDays).toBe(7);
    card = { ...card, ...reviewSchedule(card, 5) };
    expect(card.intervalDays).toBe(14);
  });

  it("resets the interval when the learner forgets", () => {
    const next = reviewSchedule({ easiness: 2.6, intervalDays: 14, repetitions: 4 }, 1);
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(0);
  });
});

describe("Weakness detection and plans", () => {
  it("does not invent a weakness from a single miss", () => {
    expect(detectWeaknesses([
      { kind: "lesson", topic: "word order", skill: "GRAMMAR", correct: false, at: "2026-01-01" },
    ])).toEqual([]);
  });

  it("names a weakness only when the miss rate is high", () => {
    const weak = detectWeaknesses([
      { kind: "lesson", topic: "word order", skill: "GRAMMAR", correct: false, at: "2026-01-01" },
      { kind: "lesson", topic: "word order", skill: "GRAMMAR", correct: false, at: "2026-01-02" },
      { kind: "lesson", topic: "word order", skill: "GRAMMAR", correct: true, at: "2026-01-03" },
    ]);
    expect(weak[0]?.topic).toBe("word order");
    expect(weak[0]?.misses).toBe(2);
  });

  it("builds a daily plan from due cards and weak topics", () => {
    const plan = buildDailyPlan({
      level: "A1",
      goal: "TRAVEL",
      dailyMinutes: 25,
      vocabDue: 15,
      weakTopics: ["word order"],
      nextLessonTitle: "Greetings",
      lastKinds: [],
    });
    expect(plan.items.some((i) => i.kind === "VOCAB_REVIEW")).toBe(true);
    expect(plan.basedOn).toContain("due vocabulary");
    expect(plan.basedOn).toContain("stored mistakes");
  });
});

describe("Writing and speaking evaluation", () => {
  it("keeps the original Dutch text and explains ik goed", () => {
    const out = analyzeWriting("Ik goed.", "nl");
    expect(out.mistakes.some((m) => /Het gaat goed/i.test(m.explanation))).toBe(true);
    expect(out.correctedText.toLowerCase()).toContain("het gaat goed");
  });

  it("scores a transcript against the target without a pronunciation number from thin air", () => {
    const hit = evaluateTranscript("Het gaat goed", "Het gaat goed");
    expect(hit.accuracy).toBe(1);
    const miss = evaluateTranscript("Het gaat goed", "banana");
    expect(miss.accuracy).toBeLessThan(0.5);
  });
});

describe("Teacher intent", () => {
  it("detects language and teach/assess/converse intents from natural phrasing", () => {
    expect(detectIntent("Teach me Dutch from the beginning.", null)).toMatchObject({ kind: "TEACH", languageCode: "nl" });
    expect(detectIntent("Test my French level.", null)).toMatchObject({ kind: "ASSESS", languageCode: "fr" });
    expect(detectIntent("Practice Italian conversation with me.", null)).toMatchObject({ kind: "CONVERSE", languageCode: "it" });
    expect(detectIntent("Correct my German.", null)).toMatchObject({ kind: "CORRECT", languageCode: "de" });
  });
});

describe("Study streak", () => {
  it("counts consecutive UTC days ending today", () => {
    expect(streakFromDates(["2026-08-22T10:00:00.000Z", "2026-08-23T09:00:00.000Z", "2026-08-24T08:00:00.000Z"], "2026-08-24T12:00:00.000Z")).toBe(3);
    expect(streakFromDates(["2026-08-20T10:00:00.000Z"], "2026-08-24T12:00:00.000Z")).toBe(0);
  });
});
