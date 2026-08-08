/**
 * Session 150 — Life Operating Principles Engine service.
 *
 * Serves the curated catalog of 115 practical life principles (Part I–VI of
 * the spec) plus the three engines:
 *
 *   Part VII  Life Coaching Engine — classifies a question into one of 13
 *            areas and returns the most relevant principles. The general
 *            question "What are the rules of life?" returns the area menu
 *            instead of dumping all 115 rules.
 *   Part VIII Daily Rules Mode — a deterministic daily rule composed of
 *            TODAY'S RULE / WHY IT MATTERS / HOW TO APPLY IT / TODAY'S
 *            ACTION / REFLECTION QUESTION.
 *   Part IX   Decision Mode — the 10-question framework with mapped
 *            principles; WINDELS never decides for the user.
 *
 * Philosophy rules are structural: the catalog never presents the 115
 * principles as absolute laws. Every rule carries educational framing and
 * many carry a considerations note; the 12 "X without Y" balance pairs and
 * the 10-step WINDELS Principle are first-class catalog content.
 *
 * The catalog is static curated content (no Redis keys) — the module is
 * intentionally additive and read-only; nothing here mutates state.
 */
import {
  classifyLifeCoachingArea,
  dayOfYear,
  DECISION_FRAMEWORK_QUESTIONS,
  isGeneralRulesQuestion,
  LIFE_COACHING_AREAS,
  LIFE_PHILOSOPHY_PAIRS,
  LIFE_RULE_PARTS,
  WINDELS_PRINCIPLE_STEPS,
  type LifeDailyRule,
  type LifeRule,
} from "@windels/shared";
import { LIFE_RULES_PART1 } from "./lifePrinciples.seed.core.js";
import { LIFE_RULES_PART2 } from "./lifePrinciples.seed.unstoppable.js";
import { LIFE_RULES_PART3 } from "./lifePrinciples.seed.work.js";

export const LIFE_PRINCIPLES_CATALOG_VERSION = "2026.08.150.1";
export const LIFE_RULES_CATALOG: LifeRule[] = [...LIFE_RULES_PART1, ...LIFE_RULES_PART2, ...LIFE_RULES_PART3];
const RULES_BY_NUMBER = new Map(LIFE_RULES_CATALOG.map((r) => [r.number, r]));
const RULES_BY_ID = new Map(LIFE_RULES_CATALOG.map((r) => [r.id, r]));

const PART_IDS = new Set(LIFE_RULE_PARTS.map((p) => p.id));
const RULE_NUMBERS = new Set(LIFE_RULES_CATALOG.map((r) => r.number));

export const LifePrinciplesService = {
  catalogMeta() {
    const byPart = new Map<string, number>();
    for (const r of LIFE_RULES_CATALOG) byPart.set(r.part, (byPart.get(r.part) ?? 0) + 1);
    return {
      catalogVersion: LIFE_PRINCIPLES_CATALOG_VERSION,
      ruleCount: LIFE_RULES_CATALOG.length,
      partCount: LIFE_RULE_PARTS.length,
      areaCount: LIFE_COACHING_AREAS.length,
      philosophyPairCount: LIFE_PHILOSOPHY_PAIRS.length,
      byPart: Object.fromEntries(byPart),
      note: "The 115 rules are practical life principles, not absolute laws. Different cultures, religions, philosophies and individuals hold different principles; WINDELS presents these for understanding and critical reflection, never as a command about how anyone must live.",
    };
  },

  parts() {
    return LIFE_RULE_PARTS.map((p) => ({
      ...p,
      ruleCount: LIFE_RULES_CATALOG.filter((r) => r.part === p.id).length,
    }));
  },

  listRules(opts?: { part?: string; limit?: number; offset?: number }) {
    let items = LIFE_RULES_CATALOG;
    if (opts?.part) items = items.filter((r) => r.part === opts.part);
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    return items.slice(offset, offset + limit);
  },

  getRuleByNumber(number: number): LifeRule | null {
    return RULES_BY_NUMBER.get(number) ?? null;
  },

  getRuleById(id: string): LifeRule | null {
    return RULES_BY_ID.get(id) ?? null;
  },

  /** Search titles, principles, tags and part labels. */
  search(q: string, opts?: { part?: string; limit?: number }) {
    const query = q.toLowerCase().trim();
    const tokens = query.split(/\s+/).filter((t) => t.length >= 3);
    const limit = opts?.limit ?? 20;
    const scored = LIFE_RULES_CATALOG.filter((r) => !opts?.part || r.part === opts.part)
      .map((r) => {
        let score = 0;
        const haystack = `${r.title} ${r.principle} ${r.tags.join(" ")} ${r.considerations ?? ""}`.toLowerCase();
        for (const t of tokens) {
          if (r.title.toLowerCase().includes(t)) score += 3;
          else if (haystack.includes(t)) score += 1;
        }
        return { rule: r, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.rule.number - b.rule.number);
    return scored.slice(0, limit).map((s) => s.rule);
  },

  areas() {
    return LIFE_COACHING_AREAS.map((a) => ({
      ...a,
      ruleCount: a.ruleNumbers.length,
    }));
  },

  /**
   * Part VII — the Life Coaching Engine. "What are the rules of life?"
   * returns the area menu with a sample; any other question is classified
   * into one of the 13 areas and the most relevant principles are returned.
   */
  ask(input: { question: string; area?: string; limit?: number }) {
    const question = input.question.trim();
    const limit = input.limit ?? 6;

    // The general question is answered with the area menu, not all 115 rules.
    if (isGeneralRulesQuestion(question)) {
      return {
        question,
        general: true,
        note: "There is no single universal set of 'rules of life' — different cultures, religions, philosophies and individuals hold different principles. The 115 curated principles are grouped into 13 areas; choose an area (or ask a specific question) and WINDELS will bring the most relevant principles.",
        areas: this.areas(),
        sample: LIFE_RULES_CATALOG.slice(0, 3).map((r) => ({
          number: r.number, title: r.title, principle: r.principle, part: r.part,
        })),
      };
    }

    let area = LIFE_COACHING_AREAS.find((a) => a.id === input.area) ?? null;
    const classification = area ? null : classifyLifeCoachingArea(question);
    if (!area && classification) area = classification.area;
    if (!area) area = LIFE_COACHING_AREAS[0]!;

    const rules = area.ruleNumbers
      .map((n) => RULES_BY_NUMBER.get(n))
      .filter((r): r is LifeRule => Boolean(r))
      .slice(0, limit);

    return {
      question,
      general: false,
      area: { id: area.id, label: area.label, description: area.description },
      classification: classification
        ? { area: classification.area.id, score: classification.score, matchedKeywords: classification.matchedKeywords, explanation: classification.explanation }
        : null,
      rules: rules.map((r) => ({
        number: r.number, title: r.title, principle: r.principle, whyItMatters: r.whyItMatters,
        howToApply: r.howToApply, action: r.action, reflectionQuestion: r.reflectionQuestion,
        considerations: r.considerations, part: r.part, tags: r.tags,
      })),
      note: "These are practical life principles presented for reflection — not absolute laws, and not a verdict on how you must live. Consider them critically and keep what serves your values and circumstances.",
    };
  },

  /** Part VIII — Daily Rules Mode (deterministic per calendar date). */
  dailyRule(dateInput?: string, ruleOverride?: number): LifeDailyRule {
    const date = dateInput ? new Date(`${dateInput}T00:00:00Z`) : new Date();
    const iso = date.toISOString().slice(0, 10);
    const n = ruleOverride ?? (dayOfYear(date) % 115) + 1;
    const rule = RULES_BY_NUMBER.get(n) ?? RULES_BY_NUMBER.get(1)!;
    return {
      date: iso,
      ruleNumber: rule.number,
      rule: {
        id: rule.id, number: rule.number, part: rule.part, title: rule.title, principle: rule.principle,
        whyItMatters: rule.whyItMatters, howToApply: rule.howToApply, action: rule.action,
        reflectionQuestion: rule.reflectionQuestion, considerations: rule.considerations, tags: rule.tags,
      },
      todayRule: rule.principle,
      whyItMatters: rule.whyItMatters,
      howToApply: rule.howToApply,
      todayAction: rule.action,
      reflectionQuestion: rule.reflectionQuestion,
      note: "A daily principle for reflection — apply it if it serves you; the underlying catalog presents principles, not commands.",
    };
  },

  /** Part IX — Decision Mode: a framework that helps the user think, never deciding for them. */
  decisionMode(input: { situation: string; context?: string }) {
    const framework = DECISION_FRAMEWORK_QUESTIONS.map((q) => q.question);
    const relevant = [4, 24, 27, 28, 45, 64, 71, 75, 91, 105, 113]
      .map((n) => RULES_BY_NUMBER.get(n))
      .filter((r): r is LifeRule => Boolean(r))
      .map((r) => ({ number: r.number, title: r.title, principle: r.principle }));
    return {
      situation: input.situation,
      framework,
      relevantPrinciples: relevant,
      note: "WINDELS does not make the decision for you, and you should not become dependent on an AI for life decisions. Work through the ten questions honestly — ideally in writing — consult trusted people and qualified professionals where appropriate, then choose with your own judgment and take responsibility for the outcome.",
    };
  },

  /** The 12 "X without Y" balance pairs (the LIFE PHILOSOPHY section). */
  philosophy() {
    return LIFE_PHILOSOPHY_PAIRS.map((p) => ({
      id: p.id, phrase: p.phrase, meaning: p.meaning, guidance: p.guidance,
    }));
  },

  /** Part X — The WINDELS Principle (10 steps). */
  principle() {
    return {
      steps: [...WINDELS_PRINCIPLE_STEPS],
      note: "The ten steps of the WINDELS Principle: think, decide, execute, learn, grow, help others, leave a legacy.",
    };
  },

  /** Catalog integrity check. */
  integrity(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    const seenNumbers = new Set<number>();
    const seenIds = new Set<string>();
    for (const r of LIFE_RULES_CATALOG) {
      if (seenNumbers.has(r.number)) issues.push(`duplicate number: ${r.number}`);
      seenNumbers.add(r.number);
      if (seenIds.has(r.id)) issues.push(`duplicate id: ${r.id}`);
      seenIds.add(r.id);
      if (!PART_IDS.has(r.part)) issues.push(`${r.id}: unknown part ${r.part}`);
      if (!r.title || !r.principle || !r.whyItMatters || !r.howToApply || !r.action || !r.reflectionQuestion) {
        issues.push(`${r.id}: incomplete rule content`);
      }
      if (r.principle.length < 10) issues.push(`${r.id}: principle too short`);
    }
    for (let n = 1; n <= 115; n++) {
      if (!RULE_NUMBERS.has(n)) issues.push(`missing rule number: ${n}`);
    }
    for (const area of LIFE_COACHING_AREAS) {
      for (const n of area.ruleNumbers) {
        if (!RULE_NUMBERS.has(n)) issues.push(`area ${area.id}: unknown rule number ${n}`);
      }
    }
    return { ok: issues.length === 0, issues };
  },

  /** Enterprise Search surface (Session 150): every rule as a searchable entry. */
  listSearchable(): Array<{ id: string; title: string; body: string; meta: string; updatedAt: string }> {
    return LIFE_RULES_CATALOG.map((r) => ({
      id: r.id,
      title: `Rule ${r.number}: ${r.title}`,
      body: `${r.principle} ${r.whyItMatters} ${r.howToApply}`,
      meta: `${LIFE_RULE_PARTS.find((p) => p.id === r.part)?.label ?? r.part} · ${r.tags.join(" ")}`,
      updatedAt: "2026-08-08T00:00:00.000Z",
    }));
  },
};
