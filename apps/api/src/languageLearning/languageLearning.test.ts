import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | string>();
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      return map.get(field) ?? null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));

// Session 199 — the service now imports the translation module, which pulls in
// the AI fabric (and, transitively, the Prisma client). Mock the registry so
// this suite stays hermetic and never reaches a real provider or the DB layer.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: async () => { throw new Error("no AI provider configured in test"); },
  },
}));

import { LanguageLearningService as Ll } from "./languageLearning.service.js";
import { acceptedAnswers } from "./engines.js";
import { getPack } from "./curriculum.js";

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER_1 = "user-1";
const USER_2 = "user-2";

beforeEach(() => { fake.store.clear(); });

async function enrollNl(org = ORG_A, user = USER_1) {
  return Ll.enroll(org, user, {
    languageCode: "nl",
    nativeLanguageCode: "en",
    explanationLanguageCode: "en",
    goal: "GENERAL",
    dailyMinutes: 25,
  });
}

describe("Phase 1 — profiles, isolation, assessment, path", () => {
  it("lets one user hold independent Dutch and Spanish profiles", async () => {
    await enrollNl();
    await Ll.enroll(ORG_A, USER_1, {
      languageCode: "es", nativeLanguageCode: "en", explanationLanguageCode: "en", goal: "TRAVEL", dailyMinutes: 20,
    });
    const list = await Ll.listProfiles(ORG_A, USER_1);
    expect(list.map((p) => p.languageCode).sort()).toEqual(["es", "nl"]);
    expect(list.find((p) => p.languageCode === "es")?.goal).toBe("TRAVEL");
    expect(list.find((p) => p.languageCode === "nl")?.currentLevel).toBe("NOT_STARTED");
  });

  it("never leaks a profile across orgs or users", async () => {
    await enrollNl();
    await expect(Ll.getProfile(ORG_B, USER_1, "nl")).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND" });
    await expect(Ll.getProfile(ORG_A, USER_2, "nl")).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND" });
  });

  it("refuses an unregistered language", async () => {
    await expect(Ll.enroll(ORG_A, USER_1, {
      languageCode: "xx", nativeLanguageCode: "en", explanationLanguageCode: "en", dailyMinutes: 20,
    })).rejects.toMatchObject({ code: "LANGUAGE_NOT_SUPPORTED" });
  });

  it("labels a self-declared level instead of pretending it was assessed", async () => {
    await enrollNl();
    const rec = await Ll.updateProfile(ORG_A, USER_1, "nl", { selfDeclaredLevel: "A2" });
    expect(rec.currentLevel).toBe("A2");
    expect(rec.levelSource).toBe("SELF_DECLARED");
  });

  it("assigns BEGINNER/A1 when every answer is wrong and a higher band when every answer is right", async () => {
    await enrollNl();
    const fail = await Ll.startAssessment(ORG_A, USER_1, "nl");
    let cursor = fail;
    while (cursor.status === "IN_PROGRESS" && cursor.currentItem) {
      cursor = await Ll.answerAssessment(ORG_A, USER_1, cursor.id, "zzzz-not-an-answer");
    }
    expect(cursor.status).toBe("COMPLETED");
    expect(cursor.itemsAsked).toBeGreaterThanOrEqual(8);
    expect(cursor.itemsCorrect).toBe(0);
    expect(["BEGINNER", "A1"]).toContain(cursor.overallLevel);
    const failedProfile = await Ll.getProfile(ORG_A, USER_1, "nl");
    expect(failedProfile.levelSource).toBe("ASSESSED");
    expect(failedProfile.currentLevel).toBe(cursor.overallLevel);

    await Ll.enroll(ORG_A, USER_2, {
      languageCode: "nl", nativeLanguageCode: "en", explanationLanguageCode: "en", dailyMinutes: 25,
    });
    const pass = await Ll.startAssessment(ORG_A, USER_2, "nl");
    let good = pass;
    while (good.status === "IN_PROGRESS" && good.currentItem) {
      const accepted = acceptedAnswers("nl", good.currentItem);
      good = await Ll.answerAssessment(ORG_A, USER_2, good.id, accepted[0] ?? good.currentItem.targetText ?? "hello");
    }
    expect(good.status).toBe("COMPLETED");
    expect(good.itemsCorrect).toBe(good.itemsAsked);
    expect(["B1", "B2", "C1", "C2"]).toContain(good.overallLevel);
    expect(good.overallLevel).not.toBe(cursor.overallLevel);
  });

  it("creates a curriculum path after an assessment", async () => {
    await enrollNl();
    const asm = await Ll.startAssessment(ORG_A, USER_1, "nl");
    let cur = asm;
    while (cur.status === "IN_PROGRESS" && cur.currentItem) {
      cur = await Ll.answerAssessment(ORG_A, USER_1, cur.id, "nope");
    }
    const path = await Ll.getPath(ORG_A, USER_1, "nl");
    expect(path?.source).toBe("CURRICULUM");
    expect(path?.modules.length).toBeGreaterThan(0);
    expect(path?.modules[0]?.lessonIds.length).toBeGreaterThan(0);
  });

  it("reports zero progress when the user has not practised", async () => {
    await enrollNl();
    const p = await Ll.progress(ORG_A, USER_1, "nl");
    expect(p.lessonsCompleted).toBe(0);
    expect(p.vocabularyKnown).toBe(0);
    expect(p.writingAttempts).toBe(0);
    expect(p.levelSource).toBe("NOT_SET");
  });
});

describe("Phase 2 — lessons, conversation, writing, grammar", () => {
  it("will not mark a lesson complete until practice is answered well enough", async () => {
    await enrollNl();
    const pack = getPack("nl");
    const lesson = pack.lessons[0]!;
    const started = await Ll.startLesson(ORG_A, USER_1, "nl", lesson.id);
    expect(started.attempt.status).toBe("IN_PROGRESS");
    expect(started.intro.examples.length).toBeGreaterThan(0);
    let attempt = started.attempt;
    for (const p of lesson.practice) {
      attempt = await Ll.answerLesson(ORG_A, USER_1, attempt.id, p.id, "totally-wrong");
    }
    expect(attempt.status).toBe("NEEDS_MORE_PRACTICE");
    expect(attempt.completedAt).toBeNull();
  });

  it("completes a lesson only after correct practice", async () => {
    await enrollNl();
    const lesson = getPack("nl").lessons[0]!;
    const started = await Ll.startLesson(ORG_A, USER_1, "nl", lesson.id);
    let attempt = started.attempt;
    for (const p of lesson.practice) {
      attempt = await Ll.answerLesson(ORG_A, USER_1, attempt.id, p.id, p.accepted[0]!);
    }
    expect(attempt.status).toBe("COMPLETED");
    expect(attempt.completedAt).toBeTruthy();
    const progress = await Ll.progress(ORG_A, USER_1, "nl");
    expect(progress.lessonsCompleted).toBe(1);
  });

  it("corrects Dutch conversation without overwriting the user turn", async () => {
    await enrollNl();
    const session = await Ll.startConversation(ORG_A, USER_1, "nl", "BEGINNER", "IMMEDIATE");
    expect(session.turns[0]?.role).toBe("TEACHER");
    const next = await Ll.conversationTurn(ORG_A, USER_1, session.id, "Ik goed.");
    const userTurn = next.turns.find((t) => t.role === "USER");
    expect(userTurn?.text).toBe("Ik goed.");
    expect(userTurn?.correction || next.turns.some((t) => t.correction)).toBeTruthy();
  });

  it("stores original writing next to the correction", async () => {
    await enrollNl();
    const rec = await Ll.write(ORG_A, USER_1, "nl", "Ik goed.");
    expect(rec.originalText).toBe("Ik goed.");
    expect(rec.correctedText).not.toBe("");
    expect(rec.originalText).not.toBe(rec.correctedText);
    const listed = await Ll.listWriting(ORG_A, USER_1, "nl");
    expect(listed[0]?.originalText).toBe("Ik goed.");
  });

  it("can simplify a grammar explanation", async () => {
    await enrollNl();
    const full = await Ll.explainGrammar(ORG_A, USER_1, "nl", undefined, false);
    const simple = await Ll.explainGrammar(ORG_A, USER_1, "nl", undefined, true);
    expect(simple.explanation.length).toBeLessThanOrEqual(full.explanation.length);
    expect(simple.title).toBe(full.title);
  });
});

describe("Phase 3 — vocabulary SRS", () => {
  it("schedules the next review from the SM-2 result", async () => {
    await enrollNl();
    const item = getPack("nl").vocab[0]!;
    const card = await Ll.saveVocab(ORG_A, USER_1, "nl", item.id);
    const reviewed = await Ll.reviewVocab(ORG_A, USER_1, card.id, true, 5);
    expect(reviewed.intervalDays).toBe(1);
    expect(Date.parse(reviewed.nextReviewAt)).toBeGreaterThan(Date.parse(reviewed.lastReviewedAt!));
    const forgotten = await Ll.reviewVocab(ORG_A, USER_1, card.id, false, 1);
    expect(forgotten.intervalDays).toBe(1);
    expect(forgotten.repetitions).toBe(0);
  });

  it("scores a vocab quiz against the stored translation", async () => {
    await enrollNl();
    const item = getPack("nl").vocab[0]!;
    const card = await Ll.saveVocab(ORG_A, USER_1, "nl", item.id);
    const hit = await Ll.answerVocabQuiz(ORG_A, USER_1, card.id, item.translation);
    expect(hit.correct).toBe(true);
    const miss = await Ll.answerVocabQuiz(ORG_A, USER_1, card.id, "not-this");
    expect(miss.correct).toBe(false);
  });
});

describe("Phase 4 — listening and speaking honesty", () => {
  it("scores listening from the stored transcript answers", async () => {
    await enrollNl();
    const item = getPack("nl").listening[0]!;
    const rec = await Ll.answerListening(ORG_A, USER_1, "nl", item.id, item.accepted[0]!, "NORMAL");
    expect(rec.correct).toBe(true);
    expect(rec.audioStatus).toBe("CLIENT_TTS");
    expect(rec.transcript).toBe(item.transcript);
  });

  it("never invents a pronunciation score", async () => {
    await enrollNl();
    const rec = await Ll.speak(ORG_A, USER_1, "nl", "hallo", "TYPED", "hallo");
    expect(rec.pronunciation.status).toBe("NOT_AVAILABLE");
    expect(rec.pronunciation.score).toBeNull();
    expect(rec.accuracy).toBe(1);
  });
});

describe("Phase 5 — adaptive next step", () => {
  it("asks for an assessment before inventing a level", async () => {
    await enrollNl();
    const step = await Ll.nextStep(ORG_A, USER_1, "nl");
    expect(step.action).toBe("ASSESS");
  });

  it("recommends a weakness only after repeated stored misses", async () => {
    await enrollNl();
    const lesson = getPack("nl").lessons[0]!;
    const first = await Ll.startLesson(ORG_A, USER_1, "nl", lesson.id);
    await Ll.answerLesson(ORG_A, USER_1, first.attempt.id, lesson.practice[0]!.id, "wrong");
    const second = await Ll.startLesson(ORG_A, USER_1, "nl", lesson.id);
    await Ll.answerLesson(ORG_A, USER_1, second.attempt.id, lesson.practice[0]!.id, "wrong-again");
    const recs = await Ll.recommendations(ORG_A, USER_1, "nl");
    expect(recs.some((r) => r.kind === "WEAKNESS")).toBe(true);
    expect(recs.find((r) => r.kind === "WEAKNESS")?.evidence.length).toBeGreaterThan(0);
  });

  it("builds today's plan from due work rather than a canned list", async () => {
    await enrollNl();
    await Ll.updateProfile(ORG_A, USER_1, "nl", { selfDeclaredLevel: "A1" });
    const item = getPack("nl").vocab[0]!;
    await Ll.saveVocab(ORG_A, USER_1, "nl", item.id);
    const plan = await Ll.dailyPlan(ORG_A, USER_1, "nl");
    expect(plan.estimatedMinutes).toBeGreaterThan(0);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.basedOn.length).toBeGreaterThan(0);
  });
});
