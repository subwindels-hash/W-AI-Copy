/**
 * Session 150 — WINDELS AI OS Life Operating Principles Engine (shared
 * contract).
 *
 * "RULES OF LIFE — TO BECOME UNSTOPPABLE". The module's core philosophy is
 * structural: there is no single universal set of "rules of life" — different
 * cultures, religions, philosophies, families and individuals hold different
 * principles. WINDELS therefore presents the 115 rules as PRACTICAL LIFE
 * PRINCIPLES, not absolute laws, and each rule carries educational framing
 * (why it matters, how to apply it, a reflection question) plus, where
 * needed, a considerations note that prevents absolutist readings.
 *
 * The surface implements the spec's engines:
 *   Part VII  Life Coaching Engine — "What are the rules of life?" is not
 *            answered by dumping 115 rules; the question is classified into
 *            one of 13 areas and the most relevant principles are returned.
 *   Part VIII Daily Rules Mode — a deterministic daily rule with
 *            WHY IT MATTERS / HOW TO APPLY IT / TODAY'S ACTION /
 *            REFLECTION QUESTION.
 *   Part IX   Decision Mode — a 10-question framework that helps the user
 *            think, never deciding for them ("WINDELS should not make the
 *            user dependent on the AI").
 *   Part X    The WINDELS Principle — 10 action steps.
 *   Philosophy — the 12 "X without Y" balance pairs (Discipline without
 *            cruelty, Privacy without paranoia, Persistence without
 *            refusing to adapt, ...).
 *
 * The module never tells people how they must live: it helps people
 * understand different principles, think critically about them, and choose
 * the principles that help them build a meaningful life.
 */
import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────────
 * Rule parts (the 10 numbered families of the 115 rules)
 * ──────────────────────────────────────────────────────────────────────────── */

export const LIFE_RULE_PARTS = [
  { id: "mindset_self_control", label: "Mindset & Self-Control", start: 1, end: 10, description: "Awareness, worth, emotional control, humility, confidence, failure and growth." },
  { id: "discipline_daily_life", label: "Discipline & Daily Life", start: 11, end: 20, description: "Intention, health, learning, difficulty, consistency, rest and finishing." },
  { id: "knowledge_skills", label: "Knowledge & Skills", start: 21, end: 30, description: "Valuable skills, money literacy, communication, questions, history, critical thinking and teaching." },
  { id: "money_financial_freedom", label: "Money & Financial Freedom", start: 31, end: 40, description: "Spending less than you earn, saving, debt, multiple income sources, protecting and investing in yourself." },
  { id: "privacy_strategy_boundaries", label: "Privacy, Strategy & Personal Boundaries", start: 41, end: 50, description: "Strategic privacy, protecting information, boundaries, trust, reputation and purposeful next moves." },
  { id: "unstoppable", label: "Becoming Unstoppable", start: 51, end: 75, description: "The 25 rules of sustained growth, resilience, self-respect and purpose." },
  { id: "relationships", label: "Relationship Rules", start: 76, end: 85, description: "Listening, clarity, boundaries, character, non-manipulation, apology, forgiveness and healthy distance." },
  { id: "business_work", label: "Business & Work Rules", start: 86, end: 95, description: "Solving problems, keeping your word, customers, competition, measurement, systems and the long term." },
  { id: "digital_life", label: "Digital Life Rules", start: 96, end: 103, description: "Passwords, posting, digital identity, verification, social media, technology as a tool and AI judgment." },
  { id: "character", label: "Character Rules", start: 104, end: 115, description: "Truth, responsibility, dignity, restraint, integrity, gratitude, curiosity and legacy." },
] as const;
export type LifeRulePart = (typeof LIFE_RULE_PARTS)[number]["id"];

export const LIFE_RULE_PART_LABELS: Record<LifeRulePart, string> = Object.fromEntries(
  LIFE_RULE_PARTS.map((p) => [p.id, p.label]),
) as Record<LifeRulePart, string>;

/* ────────────────────────────────────────────────────────────────────────────
 * The 13 Life Coaching areas (spec Part VII)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LifeCoachingArea {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  ruleNumbers: number[];
}

/** The 13 areas of the Life Coaching Engine, each mapped to its rules. */
export const LIFE_COACHING_AREAS: LifeCoachingArea[] = [
  {
    id: "discipline",
    label: "Discipline",
    description: "Self-control, habits, focus, consistency and finishing what matters.",
    keywords: ["discipline", "habit", "routine", "focus", "procrastinat", "motivation", "consisten", "self-control", "distraction", "lazy", "willpower", "morning", "start my day", "staying on track", "concentrat"],
    ruleNumbers: [3, 4, 11, 14, 15, 16, 17, 18, 19, 20, 51, 57, 64, 65, 75],
  },
  {
    id: "money",
    label: "Money",
    description: "Income, expenses, saving, debt, investing, taxes and financial freedom.",
    keywords: ["money", "finance", "financial", "debt", "save", "saving", "savings", "budget", "invest", "income", "expense", "wealth", "borrow", "loan", "tax", "salary", "spend", "rich", "naira", "dollar"],
    ruleNumbers: [22, 31, 32, 33, 34, 35, 36, 38, 39, 40, 57],
  },
  {
    id: "career",
    label: "Career",
    description: "Jobs, skills, interviews, professional growth and working life.",
    keywords: ["career", "job", "interview", "cv", "resume", "promotion", "profession", "employer", "hired", "career path", "workplace", "colleague"],
    ruleNumbers: [13, 21, 23, 24, 27, 28, 29, 30, 56, 60, 61, 72, 91],
  },
  {
    id: "business",
    label: "Business",
    description: "Starting and running ventures: value creation, customers, competition and systems.",
    keywords: ["business", "startup", "entrepreneur", "company", "customer", "competition", "sales", "product", "market", "start a business", "venture"],
    ruleNumbers: [34, 60, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
  },
  {
    id: "relationships",
    label: "Relationships",
    description: "Friendship, family, marriage, boundaries, trust, conflict and healthy distance.",
    keywords: ["relationship", "marriage", "married", "friend", "friendship", "family", "partner", "spouse", "girlfriend", "boyfriend", "breakup", "divorce", "in-law", "trust people", "my mother", "my father", "my sister", "my brother", "my wife", "my husband"],
    ruleNumbers: [46, 47, 62, 73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85],
  },
  {
    id: "leadership",
    label: "Leadership",
    description: "Leading teams and organizations with character, systems and respect.",
    keywords: ["leadership", "leader", "leading", "team", "manage", "manager", "boss", "influence", "mentor", "leading people"],
    ruleNumbers: [49, 73, 74, 87, 93, 94, 95, 104, 106, 107, 108, 109, 113],
  },
  {
    id: "education",
    label: "Education",
    description: "Learning, study, reading and keeping your mind growing.",
    keywords: ["education", "school", "study", "studying", "learn", "learning", "course", "exam", "student", "teacher", "teach", "read", "reading", "university", "college", "degree"],
    ruleNumbers: [10, 13, 21, 24, 27, 28, 30, 54, 106, 111],
  },
  {
    id: "personal_growth",
    label: "Personal growth",
    description: "Improving yourself, finding purpose and becoming more than you were.",
    keywords: ["grow", "growth", "improve", "better myself", "potential", "purpose", "self-development", "become better", "self improvement", "personal growth", "develop myself"],
    ruleNumbers: [9, 10, 18, 29, 55, 68, 69, 70, 106, 110, 111, 112, 115],
  },
  {
    id: "mental_resilience",
    label: "Mental resilience",
    description: "Handling stress, fear, failure and pressure without losing yourself.",
    keywords: ["stress", "anxious", "anxiety", "fear", "afraid", "failure", "resilience", "strong", "strength", "overcome", "depressed", "discouraged", "give up", "worried", "mental", "overwhelmed", "burnout", "pressure"],
    ruleNumbers: [1, 3, 4, 9, 51, 58, 59, 62, 65, 68, 75, 109, 110],
  },
  {
    id: "health_habits",
    label: "Health habits",
    description: "Body, sleep, exercise, hydration, rest and daily energy.",
    keywords: ["health", "body", "exercise", "sleep", "eat", "eating", "diet", "water", "hydrate", "hydration", "fitness", "rest", "energy", "sick", "tired", "workout"],
    ruleNumbers: [12, 19, 52, 53],
  },
  {
    id: "digital_life",
    label: "Digital life",
    description: "Passwords, posting, screens, social media, technology and AI.",
    keywords: ["social media", "phone", "smartphone", "password", "online", "internet", "digital", "screen", "cyber", "post", "technology", "ai", "artificial intelligence", "data", "hack", "privacy online"],
    ruleNumbers: [16, 96, 97, 98, 99, 100, 101, 102, 103],
  },
  {
    id: "spirituality",
    label: "Spirituality",
    description: "Faith, gratitude, forgiveness, meaning and what you give back.",
    keywords: ["god", "faith", "spiritual", "prayer", "pray", "religion", "gratitude", "grateful", "soul", "belief", "forgive", "forgiveness", "meaning of life", "church", "mosque"],
    ruleNumbers: [62, 63, 74, 82, 83, 110, 114, 115],
  },
  {
    id: "decision_making",
    label: "Decision-making",
    description: "Thinking before acting, weighing consequences and choosing responsibly.",
    keywords: ["decision", "decide", "choose", "choice", "option", "dilemma", "should i", "what to do", "risk", "consequences", "plan", "weigh", "trade-off", "hard choice"],
    ruleNumbers: [4, 24, 27, 28, 45, 64, 71, 75, 91, 105, 113],
  },
];

/** The 12 "X without Y" balance pairs (the LIFE PHILOSOPHY section). */
export const LIFE_PHILOSOPHY_PAIRS = [
  { id: "lp.phil.discipline", left: "Discipline", right: "cruelty", phrase: "Discipline without cruelty.", meaning: "Structure and standards should build people up, not break them. Discipline is for growth; cruelty is the corruption of it.", guidance: "Hold yourself and others to high standards while preserving dignity — firmness and kindness are not opposites." },
  { id: "lp.phil.confidence", left: "Confidence", right: "arrogance", phrase: "Confidence without arrogance.", meaning: "Knowing what you can do, while remaining willing to learn, keeps confidence honest.", guidance: "State what you know and what you do not. Confidence invites questions; arrogance resents them." },
  { id: "lp.phil.privacy", left: "Privacy", right: "paranoia", phrase: "Privacy without paranoia.", meaning: "Protecting your information is sensible; isolating from everyone is not.", guidance: "Guard what matters, share with people you trust, and keep your meaningful relationships open." },
  { id: "lp.phil.ambition", left: "Ambition", right: "greed", phrase: "Ambition without greed.", meaning: "Pursuing goals should not require exploiting people or abandoning integrity.", guidance: "Let your ambition serve a purpose larger than accumulation, and measure success by more than what you take." },
  { id: "lp.phil.success", left: "Success", right: "disrespect", phrase: "Success without disrespect.", meaning: "Achievement is not a license to treat people as beneath you.", guidance: "The way you treat people who cannot benefit you reveals who you are." },
  { id: "lp.phil.strength", left: "Strength", right: "oppression", phrase: "Strength without oppression.", meaning: "Power is measured by what it protects, not by whom it crushes.", guidance: "Use strength to create safety and opportunity, never to dominate the vulnerable." },
  { id: "lp.phil.forgiveness", left: "Forgiveness", right: "abandoning boundaries", phrase: "Forgiveness without abandoning boundaries.", meaning: "You can release resentment and still protect yourself from repeated harm.", guidance: "Forgive the person, learn the lesson, and keep the boundary that the lesson taught you." },
  { id: "lp.phil.persistence", left: "Persistence", right: "refusing to adapt", phrase: "Persistence without refusing to adapt.", meaning: "Keep going — but know when a strategy, not the goal, must change.", guidance: "Quitting a bad strategy is not the same as giving up on your purpose." },
  { id: "lp.phil.technology", left: "Technology", right: "losing humanity", phrase: "Technology without losing humanity.", meaning: "Tools should increase your capability, not replace your judgment and connection.", guidance: "Use technology to amplify attention, kindness and thinking — never to outsource them." },
  { id: "lp.phil.knowledge", left: "Knowledge", right: "arrogance", phrase: "Knowledge without arrogance.", meaning: "The more you learn, the more you see how much you do not know.", guidance: "Hold your knowledge confidently but lightly — always ready to update it." },
  { id: "lp.phil.freedom", left: "Freedom", right: "responsibility", phrase: "Freedom with responsibility.", meaning: "Choice and accountability belong together; freedom without responsibility becomes harm.", guidance: "Exercise your freedom in ways you can answer for, to yourself and others." },
  { id: "lp.phil.power", left: "Power", right: "accountability", phrase: "Power with accountability.", meaning: "Influence is safest when it answers to consequences and conscience.", guidance: "Make decisions you would defend in public, and accept the outcomes of your choices." },
] as const;

/** The 10 steps of the WINDELS Principle (spec Part X). */
export const WINDELS_PRINCIPLE_STEPS = [
  "THINK BEFORE YOU ACT.",
  "LEARN BEFORE YOU JUDGE.",
  "VERIFY BEFORE YOU BELIEVE.",
  "PLAN BEFORE YOU BUILD.",
  "BUILD BEFORE YOU BRAG.",
  "ADAPT WHEN CONDITIONS CHANGE.",
  "TAKE RESPONSIBILITY FOR YOUR ACTIONS.",
  "HELP PEOPLE WHEN YOU CAN.",
  "PROTECT YOUR PEACE AND YOUR PURPOSE.",
  "NEVER STOP LEARNING.",
] as const;

/** The 10 questions of the Decision Mode framework (spec Part IX). */
export const DECISION_FRAMEWORK_QUESTIONS = [
  { id: "d1", question: "What are you trying to achieve?" },
  { id: "d2", question: "What are the facts?" },
  { id: "d3", question: "What are the risks?" },
  { id: "d4", question: "What information are you missing?" },
  { id: "d5", question: "What emotions are influencing the decision?" },
  { id: "d6", question: "What are the short-term consequences?" },
  { id: "d7", question: "What are the long-term consequences?" },
  { id: "d8", question: "Who else could be affected?" },
  { id: "d9", question: "What choice aligns with your values?" },
  { id: "d10", question: "What is the next responsible action?" },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Rule record shape
 * ──────────────────────────────────────────────────────────────────────────── */

export const LifeRuleSchema = z.object({
  id: z.string().min(1).max(40),
  number: z.number().int().min(1).max(115),
  part: z.enum(LIFE_RULE_PARTS.map((p) => p.id) as [LifeRulePart, ...LifeRulePart[]]),
  title: z.string().min(1).max(120),
  principle: z.string().min(1).max(500),
  whyItMatters: z.string().min(1).max(800),
  howToApply: z.string().min(1).max(1200),
  action: z.string().min(1).max(400),
  reflectionQuestion: z.string().min(1).max(400),
  considerations: z.string().max(600).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
});
export type LifeRule = z.infer<typeof LifeRuleSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Coaching engine — area classification (deterministic, testable)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LifeAreaClassification {
  area: LifeCoachingArea;
  score: number;
  matchedKeywords: string[];
  explanation: string;
}

/** Normalize free text for keyword matching. */
export function normalizeLifeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classify a question into one of the 13 coaching areas. Deterministic:
 * the area with the most keyword matches wins; ties break by area order in
 * LIFE_COACHING_AREAS. The general "rules of life" question is detected
 * separately by `isGeneralRulesQuestion`.
 */
export function classifyLifeCoachingArea(text: string): LifeAreaClassification {
  const normalized = normalizeLifeText(text);
  const best: { area: LifeCoachingArea; score: number; matched: string[] } = { area: LIFE_COACHING_AREAS[0]!, score: 0, matched: [] };
  for (const area of LIFE_COACHING_AREAS) {
    let score = 0;
    const matched: string[] = [];
    for (const kw of area.keywords) {
      if (normalized.includes(kw)) {
        score += 1;
        matched.push(kw);
      }
    }
    if (score > best.score) {
      best.area = area;
      best.score = score;
      best.matched = matched;
    }
  }
  return {
    area: best.area,
    score: best.score,
    matchedKeywords: best.matched,
    explanation: best.score === 0
      ? `No coaching keyword matched; defaulted to the first area (${best.area.label}).`
      : `Classified as "${best.area.label}" from ${best.score} matching keyword${best.score === 1 ? "" : "s"}: ${best.matched.join(", ")}.`,
  };
}

/** "What are the rules of life?" — the general question answered with the area menu, not all 115 rules. */
export function isGeneralRulesQuestion(text: string): boolean {
  const n = normalizeLifeText(text);
  return /rules? of life/.test(n) && !/(money|relationship|business|discipline|career|health|digital|decision)/.test(n);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Daily Rules Mode (spec Part VIII) — deterministic per calendar date
 * ──────────────────────────────────────────────────────────────────────────── */

/** Day-of-year (1..365/366) for an ISO date — the deterministic daily-rule seed. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - start) / 86400000);
}

export interface LifeDailyRule {
  date: string;
  ruleNumber: number;
  rule: LifeRule;
  todayRule: string;
  whyItMatters: string;
  howToApply: string;
  todayAction: string;
  reflectionQuestion: string;
  note: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Decision Mode (spec Part IX)
 * ──────────────────────────────────────────────────────────────────────────── */

export const LifeDecisionInputSchema = z.object({
  situation: z.string().min(1).max(2000),
  context: z.string().max(3000).optional(),
});
export type LifeDecisionInput = z.input<typeof LifeDecisionInputSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Ask input (coaching engine)
 * ──────────────────────────────────────────────────────────────────────────── */

export const LifeAskSchema = z.object({
  question: z.string().min(1).max(600),
  area: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});
export type LifeAskInput = z.input<typeof LifeAskSchema>;

export const LifeSearchQuerySchema = z.object({
  q: z.string().min(1).max(300),
  part: z.enum(LIFE_RULE_PARTS.map((p) => p.id) as [LifeRulePart, ...LifeRulePart[]]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type LifeSearchQuery = z.input<typeof LifeSearchQuerySchema>;
