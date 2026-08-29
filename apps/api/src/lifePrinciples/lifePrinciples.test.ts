/**
 * Session 150 — Unit tests: Life Operating Principles Engine.
 *
 * Covers the 115-rule catalog integrity (numbers, parts, completeness), the
 * Life Coaching Engine (13 areas, the general "rules of life" question, area
 * override), Daily Rules Mode (determinism, structure, override), Decision
 * Mode (10 questions, never decides for the user), the philosophy pairs, the
 * WINDELS Principle, search, and the neutrality discipline (principles, not
 * absolute laws).
 */
import { describe, it, expect } from "vitest";
import {
  classifyLifeCoachingArea,
  dayOfYear,
  DECISION_FRAMEWORK_QUESTIONS,
  isGeneralRulesQuestion,
  LIFE_COACHING_AREAS,
  LIFE_PHILOSOPHY_PAIRS,
  LIFE_RULE_PARTS,
  WINDELS_PRINCIPLE_STEPS,
} from "@windels/shared";
import { LifePrinciplesService, LIFE_RULES_CATALOG } from "./lifePrinciples.service.js";

describe("Catalog integrity (115 rules)", () => {
  it("contains exactly 115 rules numbered 1–115 with no duplicates", () => {
    expect(LIFE_RULES_CATALOG.length).toBe(115);
    const numbers = LIFE_RULES_CATALOG.map((r) => r.number);
    expect(new Set(numbers).size).toBe(115);
    for (let n = 1; n <= 115; n++) {
      expect(numbers).toContain(n);
    }
  });

  it("matches the spec part boundaries (50 + 25 + 10 + 10 + 8 + 12)", () => {
    const byPart = new Map<string, number>();
    for (const r of LIFE_RULES_CATALOG) byPart.set(r.part, (byPart.get(r.part) ?? 0) + 1);
    expect(byPart.get("mindset_self_control")).toBe(10);
    expect(byPart.get("discipline_daily_life")).toBe(10);
    expect(byPart.get("knowledge_skills")).toBe(10);
    expect(byPart.get("money_financial_freedom")).toBe(10);
    expect(byPart.get("privacy_strategy_boundaries")).toBe(10);
    expect(byPart.get("unstoppable")).toBe(25);
    expect(byPart.get("relationships")).toBe(10);
    expect(byPart.get("business_work")).toBe(10);
    expect(byPart.get("digital_life")).toBe(8);
    expect(byPart.get("character")).toBe(12);
  });

  it("every rule is complete: title, principle, why, how, action, reflection", () => {
    for (const r of LIFE_RULES_CATALOG) {
      expect(r.title.length, `r${r.number} title`).toBeGreaterThan(2);
      expect(r.principle.length, `r${r.number} principle`).toBeGreaterThan(15);
      expect(r.whyItMatters.length, `r${r.number} why`).toBeGreaterThan(20);
      expect(r.howToApply.length, `r${r.number} how`).toBeGreaterThan(20);
      expect(r.action.length, `r${r.number} action`).toBeGreaterThan(10);
      expect(r.reflectionQuestion.length, `r${r.number} reflection`).toBeGreaterThan(10);
      expect(LIFE_RULE_PARTS.some((p) => p.id === r.part)).toBe(true);
    }
  });

  it("reports a clean integrity report", () => {
    const report = LifePrinciplesService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("boundary rule numbers resolve and out-of-range returns null", () => {
    for (const n of [1, 10, 11, 50, 51, 75, 76, 85, 86, 95, 96, 103, 104, 115]) {
      expect(LifePrinciplesService.getRuleByNumber(n), `rule ${n}`).not.toBeNull();
    }
    expect(LifePrinciplesService.getRuleByNumber(0)).toBeNull();
    expect(LifePrinciplesService.getRuleByNumber(116)).toBeNull();
  });

  it("catalog meta reports honest counts and the not-absolute-laws framing", () => {
    const meta = LifePrinciplesService.catalogMeta();
    expect(meta.ruleCount).toBe(115);
    expect(meta.partCount).toBe(10);
    expect(meta.areaCount).toBe(13);
    expect(meta.philosophyPairCount).toBe(12);
    expect(meta.catalogVersion).toContain("150");
    expect(meta.note).toContain("not absolute laws");
  });

  it("principles that need balance carry considerations notes", () => {
    for (const n of [2, 5, 9, 33, 34, 42, 62, 84]) {
      const r = LifePrinciplesService.getRuleByNumber(n)!;
      expect(r.considerations?.length, `r${n} considerations`).toBeGreaterThan(20);
    }
  });
});

describe("Life Coaching Engine (spec Part VII)", () => {
  it("classifies the canonical question for each of the 13 areas", () => {
    const cases: Array<[string, string]> = [
      ["I struggle with discipline and procrastination", "discipline"],
      ["How do I save money and pay off debt?", "money"],
      ["What skills do I need for my career?", "career"],
      ["Should I start a business?", "business"],
      ["My marriage is going through a hard time", "relationships"],
      ["How do I lead my team?", "leadership"],
      ["How do I study effectively?", "education"],
      ["How can I improve myself and grow?", "personal_growth"],
      ["I am stressed and afraid of failure", "mental_resilience"],
      ["I need to exercise more and sleep better", "health_habits"],
      ["How do I protect my passwords online?", "digital_life"],
      ["How can faith and gratitude help me?", "spirituality"],
      ["I have a difficult decision to make", "decision_making"],
    ];
    for (const [text, expected] of cases) {
      expect(classifyLifeCoachingArea(text).area.id, text).toBe(expected);
    }
  });

  it("is deterministic: identical text yields identical classification", () => {
    const a = classifyLifeCoachingArea("How do I save money?");
    const b = classifyLifeCoachingArea("How do I save money?");
    expect(a).toEqual(b);
  });

  it("answers the general 'rules of life' question with the area menu, not all 115 rules", () => {
    expect(isGeneralRulesQuestion("What are the rules of life?")).toBe(true);
    expect(isGeneralRulesQuestion("What are the rules of life about money?")).toBe(false);
    const res = LifePrinciplesService.ask({ question: "What are the rules of life?" });
    expect(res.general).toBe(true);
    expect(res.areas!.length).toBe(13);
    expect(res.rules).toBeUndefined();
    expect(res.sample!.length).toBe(3);
    expect(res.note).toContain("no single universal set");
  });

  it("routes a money question to the money area with the money principles", () => {
    const res = LifePrinciplesService.ask({ question: "How do I save money?" });
    expect(res.general).toBe(false);
    expect(res.area!.id).toBe("money");
    expect(res.rules!.map((r) => r.number)).toEqual([22, 31, 32, 33, 34, 35]);
    expect(res.note).toContain("not absolute laws");
  });

  it("routes a relationships question to the relationships area", () => {
    const res = LifePrinciplesService.ask({ question: "My marriage is going through a hard time" });
    expect(res.area!.id).toBe("relationships");
    expect(res.rules!.some((r) => r.number === 76 || r.number === 77 || r.number === 82)).toBe(true);
  });

  it("supports an explicit area override", () => {
    const res = LifePrinciplesService.ask({ question: "give me the principles", area: "money" });
    expect(res.area!.id).toBe("money");
    expect(res.classification).toBeNull();
  });

  it("exposes the 13 areas with mapped rule counts", () => {
    const areas = LifePrinciplesService.areas();
    expect(areas.length).toBe(13);
    expect(areas.find((a) => a.id === "money")!.ruleCount).toBeGreaterThanOrEqual(11);
    expect(areas.find((a) => a.id === "relationships")!.ruleNumbers).toContain(85);
    // Every mapped rule number exists in the catalog.
    const report = LifePrinciplesService.integrity();
    expect(report.ok).toBe(true);
  });
});

describe("Daily Rules Mode (spec Part VIII)", () => {
  it("is deterministic per date", () => {
    const a = LifePrinciplesService.dailyRule("2026-08-08");
    const b = LifePrinciplesService.dailyRule("2026-08-08");
    expect(a.ruleNumber).toBe(b.ruleNumber);
    expect(a).toEqual(b);
  });

  it("returns a different rule on a different date", () => {
    const a = LifePrinciplesService.dailyRule("2026-08-08");
    const b = LifePrinciplesService.dailyRule("2026-08-09");
    expect(a.ruleNumber).not.toBe(b.ruleNumber);
  });

  it("composes the full daily payload: rule, why, how, action, reflection", () => {
    const d = LifePrinciplesService.dailyRule("2026-08-08");
    expect(d.todayRule.length).toBeGreaterThan(10);
    expect(d.whyItMatters.length).toBeGreaterThan(20);
    expect(d.howToApply.length).toBeGreaterThan(20);
    expect(d.todayAction.length).toBeGreaterThan(10);
    expect(d.reflectionQuestion.length).toBeGreaterThan(10);
    expect(d.date).toBe("2026-08-08");
    expect(d.rule.number).toBe(d.ruleNumber);
  });

  it("honours a rule override", () => {
    const d = LifePrinciplesService.dailyRule("2026-08-08", 1);
    expect(d.ruleNumber).toBe(1);
    expect(d.rule.title).toBe("Stay Alert");
  });

  it("dayOfYear is bounded and deterministic", () => {
    expect(dayOfYear(new Date("2026-01-01T00:00:00Z"))).toBe(1);
    const v = dayOfYear(new Date("2026-08-08T00:00:00Z"));
    expect(v).toBeGreaterThan(200);
    expect(v).toBeLessThanOrEqual(365);
  });
});

describe("Decision Mode (spec Part IX)", () => {
  it("returns the ten framework questions in order", () => {
    expect(DECISION_FRAMEWORK_QUESTIONS.length).toBe(10);
    const res = LifePrinciplesService.decisionMode({ situation: "Should I leave my job?" });
    expect(res.framework.length).toBe(10);
    expect(res.framework[0]).toBe("What are you trying to achieve?");
    expect(res.framework[9]).toBe("What is the next responsible action?");
    for (const q of DECISION_FRAMEWORK_QUESTIONS) {
      expect(res.framework).toContain(q.question);
    }
  });

  it("maps relevant principles and never decides for the user", () => {
    const res = LifePrinciplesService.decisionMode({ situation: "Should I move to another country?" });
    expect(res.relevantPrinciples.length).toBeGreaterThan(5);
    expect(res.relevantPrinciples.some((p) => p.number === 45 || p.number === 71)).toBe(true);
    expect(res.note).toContain("does not make the decision for you");
    expect(res.note).toContain("your own judgment");
  });
});

describe("Philosophy & the WINDELS Principle (Part X)", () => {
  it("carries the 12 balance pairs with the spec's signature phrases", () => {
    const pairs = LifePrinciplesService.philosophy();
    expect(pairs.length).toBe(12);
    const phrases = pairs.map((p) => p.phrase);
    for (const expected of [
      "Discipline without cruelty.",
      "Confidence without arrogance.",
      "Privacy without paranoia.",
      "Ambition without greed.",
      "Persistence without refusing to adapt.",
      "Forgiveness without abandoning boundaries.",
      "Freedom with responsibility.",
      "Power with accountability.",
    ]) {
      expect(phrases).toContain(expected);
    }
    for (const p of pairs) {
      expect(p.meaning.length).toBeGreaterThan(20);
      expect(p.guidance.length).toBeGreaterThan(20);
    }
  });

  it("carries the ten WINDELS Principle steps", () => {
    expect(WINDELS_PRINCIPLE_STEPS.length).toBe(10);
    const res = LifePrinciplesService.principle();
    expect(res.steps[0]).toBe("THINK BEFORE YOU ACT.");
    expect(res.steps[9]).toBe("NEVER STOP LEARNING.");
    expect(LIFE_PHILOSOPHY_PAIRS.length).toBe(12);
  });
});

describe("Search & retrieval", () => {
  it("finds rules by title and tags", () => {
    const password = LifePrinciplesService.search("password");
    expect(password.some((r) => r.number === 96)).toBe(true);
    const debt = LifePrinciplesService.search("debt");
    expect(debt.some((r) => r.number === 33)).toBe(true);
    const focus = LifePrinciplesService.search("focus");
    expect(focus.some((r) => r.number === 16)).toBe(true);
  });

  it("filters by part", () => {
    const digital = LifePrinciplesService.search("online", { part: "digital_life" });
    expect(digital.length).toBeGreaterThan(0);
    expect(digital.every((r) => r.part === "digital_life")).toBe(true);
  });

  it("returns no matches for nonsense", () => {
    expect(LifePrinciplesService.search("zxqvbn")).toEqual([]);
  });
});

describe("Enterprise Search surface & listing", () => {
  it("exposes all 115 rules as searchable entries", () => {
    const entries = LifePrinciplesService.listSearchable();
    expect(entries.length).toBe(115);
    expect(entries[0]!.title).toContain("Rule 1");
    expect(entries[0]!.body.length).toBeGreaterThan(50);
    expect(entries[0]!.meta).toContain("Mindset");
  });

  it("lists rules with part filter and pagination", () => {
    const all = LifePrinciplesService.listRules({ limit: 115 });
    expect(all.length).toBe(115);
    const digital = LifePrinciplesService.listRules({ part: "digital_life" });
    expect(digital.length).toBe(8);
    const page = LifePrinciplesService.listRules({ limit: 10, offset: 50 });
    expect(page.length).toBe(10);
    expect(page[0]!.number).toBe(51);
  });

  it("parts() reports the part counts", () => {
    const parts = LifePrinciplesService.parts();
    expect(parts.length).toBe(10);
    expect(parts.find((p) => p.id === "character")!.ruleCount).toBe(12);
    expect(parts.find((p) => p.id === "unstoppable")!.ruleCount).toBe(25);
  });
});
