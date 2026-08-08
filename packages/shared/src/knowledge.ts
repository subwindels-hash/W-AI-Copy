/**
 * Session 140 — WINDELS AI OS Global Human Knowledge & Everyday Question
 * Intelligence System (shared contract).
 *
 * This module gives WINDELS a broad, expandable knowledge layer covering the
 * major categories of questions people actually ask: definitions, practical
 * instructions, causal explanations, people, history/timelines, geography,
 * comparisons, education paths, science, technology, business, careers, law,
 * health, culture, travel, relationships, entertainment, languages, everyday
 * life and creative work.
 *
 * The two architectural pillars (per the Session 140 spec) are:
 *
 *  1. QUESTION INTENT ENGINE — every question is classified into one of the
 *     13 intents (plus an honest `general` fallback) before retrieval, so the
 *     system routes the request to the right knowledge domain and response
 *     style instead of treating every question as an isolated query.
 *
 *  2. STABLE / DYNAMIC KNOWLEDGE SEPARATION — stable knowledge (mathematics,
 *     history, scientific foundations, established concepts) changes slowly
 *     and lives in the curated catalog. Dynamic knowledge (politics,
 *     elections, prices, sports, weather, current events, technology
 *     releases, laws, appointments, travel requirements) is never "memorized"
 *     as if permanent: every dynamic record must carry
 *     SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED, and current
 *     information is answered with verification guidance, not stale claims.
 *
 * Every knowledge record carries a confidence classification
 * (VERIFIED / WELL-SUPPORTED / DISPUTED / UNCERTAIN / UNVERIFIED) and the
 * system never turns uncertainty into certainty.
 */
import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────────
 * Enumerations
 * ──────────────────────────────────────────────────────────────────────────── */

/** Knowledge record kinds — each maps to one content layer of the spec. */
export const KNOWLEDGE_KINDS = [
  "concept",          // 2. "What is…?" knowledge
  "instruction",      // 3. "How do I…?" knowledge
  "explanation",      // 4. "Why…?" knowledge
  "person",           // 5. "Who…?" knowledge
  "timeline_event",   // 6. "When…?" knowledge
  "place",            // 7. "Where…?" knowledge
  "comparison",       // 8. "Which is better?" knowledge
  "discipline",       // 9. Education & university knowledge
  "science_field",    // 10. Science knowledge
  "technology",       // 11. Technology knowledge
  "business",         // 12. Business & money knowledge
  "career",           // 13. Career intelligence
  "law",              // 14. Law & government education
  "health",           // 15. Health & medical education
  "history_era",      // 16. History of humanity
  "culture",          // 17. Culture & human society
  "travel",           // 18. Travel & world knowledge
  "relationship",     // 19. Relationships & human communication
  "entertainment",    // 20. Entertainment & popular culture
  "language",         // 21. Language intelligence
  "everyday",         // 22. Everyday life knowledge
  "creative",         // 23. Creative knowledge
  "policy",           // 25/26. System policy records (how WINDELS treats knowledge)
  "current_information", // 25. Dynamic layer — never memorized as permanent
] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

/** The 13 question intents (spec §24) plus the honest `general` fallback. */
export const QUESTION_INTENTS = [
  "definition",          // "What is AI?"
  "explanation",         // "How does AI work?"
  "history",             // "When did AI begin?"
  "comparison",          // "AI vs traditional software?"
  "instruction",         // "How do I build an AI app?"
  "recommendation",      // "Which cloud platform should I use?"
  "calculation",         // "How much will this cost?"
  "current_information", // "Who is the current president?"
  "research",            // "Give me everything about this subject."
  "education",           // "Teach me mathematics."
  "creative",            // "Write a business plan."
  "troubleshooting",     // "Why isn't my application working?"
  "personal_guidance",   // "What should I do?"
  "general",             // fallback — no intent pattern matched
] as const;
export type QuestionIntent = (typeof QUESTION_INTENTS)[number];

/** Knowledge confidence classification (spec §26). */
export const KNOWLEDGE_CONFIDENCE = [
  "verified",        // supported by reliable sources
  "well_supported",  // supported by multiple credible sources
  "disputed",        // credible sources disagree
  "uncertain",       // evidence is incomplete
  "unverified",      // not sufficiently established
] as const;
export type KnowledgeConfidence = (typeof KNOWLEDGE_CONFIDENCE)[number];

export const KNOWLEDGE_CONFIDENCE_LABELS: Record<KnowledgeConfidence, string> = {
  verified: "Supported by reliable sources.",
  well_supported: "Supported by multiple credible sources.",
  disputed: "Credible sources disagree.",
  uncertain: "Evidence is incomplete.",
  unverified: "Not sufficiently established.",
};

/** Stable vs dynamic knowledge (spec §25). */
export const KNOWLEDGE_TIERS = ["stable", "dynamic"] as const;
export type KnowledgeTier = (typeof KNOWLEDGE_TIERS)[number];

export const KNOWLEDGE_TIER_LABELS: Record<KnowledgeTier, string> = {
  stable: "Changes slowly: mathematics, historical events, scientific foundations, established concepts, language fundamentals, classical literature, religious history.",
  dynamic: "Changes frequently: politics, elections, prices, sports, weather, current events, technology releases, laws, government appointments, travel requirements, business information. Must carry SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED.",
};

/** Audience levels for the personalized teaching engine (spec §27). */
export const AUDIENCE_LEVELS = ["child", "high_school", "undergraduate", "graduate", "research"] as const;
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];

/** Section keys of a knowledge record. */
export const KNOWLEDGE_SECTION_KEYS = [
  "summary",            // one-paragraph overview
  "definition",         // precise definition
  "simple",             // plain-language explanation (children)
  "detailed",           // in-depth explanation
  "history",            // history / origins
  "how_it_works",       // mechanism
  "examples",           // concrete examples
  "misconceptions",     // common misconceptions (see structured field too)
  "causes",             // causes, contributing factors, competing explanations
  "criteria",           // comparison criteria explanation
  "steps",              // step-by-step guidance (see structured field too)
  "geography",          // geographic layer content
  "economy",            // economic layer content
  "culture",            // cultural layer content
  "biography",          // person profile
  "achievements",       // person achievements
  "historical_context", // person historical context
  "learning_path",      // beginner → advanced path (disciplines)
  "levels",             // FOUNDATIONS → INTERMEDIATE → ADVANCED → RESEARCH
  "guidance",           // balanced guidance / considerations
  "warning",            // professional-assistance / disclaimer note
  "policy",             // system policy explanation
  "sources",            // sources & verification (see structured field too)
] as const;
export type KnowledgeSectionKey = (typeof KNOWLEDGE_SECTION_KEYS)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * Core record shapes
 * ──────────────────────────────────────────────────────────────────────────── */

export const KnowledgeReferenceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url().max(500).optional(),
  retrievedAt: z.string().max(40).optional(),
  note: z.string().max(300).optional(),
});
export type KnowledgeReference = z.infer<typeof KnowledgeReferenceSchema>;

export const KnowledgeMisconceptionSchema = z.object({
  misconception: z.string().min(1).max(300),
  correction: z.string().min(1).max(500),
});
export type KnowledgeMisconception = z.infer<typeof KnowledgeMisconceptionSchema>;

export const KnowledgeStepSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(1000),
  requiresProfessional: z.boolean().optional(),
});
export type KnowledgeStep = z.infer<typeof KnowledgeStepSchema>;

/** A labeled comparison criterion (spec §8: explain the criteria, never a universal winner). */
export const ComparisonCriterionSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  value: z.number().min(0).max(100).optional(), // present = labeled score in the catalog
  note: z.string().max(300).optional(),
});
export type ComparisonCriterion = z.infer<typeof ComparisonCriterionSchema>;

/** A curated catalog record (stable knowledge) or org-contributed record (dynamic). */
export const KnowledgeRecordSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(KNOWLEDGE_KINDS),
  categoryIds: z.array(z.string().min(1).max(40)).min(1).max(12),
  title: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(60)).max(20).default([]),
  question: z.string().min(1).max(300),
  intents: z.array(z.enum(QUESTION_INTENTS)).min(1).max(6),
  tier: z.enum(KNOWLEDGE_TIERS),
  confidence: z.enum(KNOWLEDGE_CONFIDENCE),
  provenance: z.enum(["catalog", "self_reported"]),
  summary: z.string().min(1).max(3000),
  sections: z.record(z.string(), z.string()).default({}),
  examples: z.array(z.string().min(1).max(600)).max(20).optional(),
  misconceptions: z.array(KnowledgeMisconceptionSchema).max(20).optional(),
  steps: z.array(KnowledgeStepSchema).max(50).optional(),
  criteria: z.array(ComparisonCriterionSchema).max(20).optional(),
  relatedIds: z.array(z.string().min(1).max(64)).max(30).optional(),
  sources: z.array(KnowledgeReferenceSchema).max(30).optional(),
  lastUpdated: z.string(), // ISO date — when the record was last verified into the layer
  asOfDate: z.string().max(40).optional(), // for dynamic info: the date the information describes
  dateLabel: z.string().max(80).optional(), // timeline events: human display ("c. 508 BCE")
  year: z.number().int().nullable().optional(), // timeline events: approximate; negative = BCE; null = uncertain
  eraId: z.string().max(40).nullable().optional(), // timeline events: history era id
  verificationNote: z.string().max(500).optional(),
  professionalAssistanceNote: z.string().max(500).optional(),
});
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Question Intent Engine (spec §24) — deterministic, testable, honest
 * ──────────────────────────────────────────────────────────────────────────── */

export interface IntentRule {
  intent: Exclude<QuestionIntent, "general">;
  patterns: RegExp[];
}

/**
 * Rule order IS priority: when two intents tie on score, the earlier rule
 * wins. Specific intents (personal guidance, troubleshooting, comparison)
 * precede broad ones (definition, explanation).
 */
export const INTENT_RULES: IntentRule[] = [
  {
    intent: "personal_guidance",
    patterns: [
      /what should i do/, /what do i do (now|next)/, /help me decide/,
      /\badvice\b/, /i feel/, /my partner/, /my boss/, /should i (quit|leave|accept|take)/,
      /what would you do/, /what is the right (choice|decision)/,
    ],
  },
  {
    intent: "troubleshooting",
    patterns: [
      /why isn't|why isnt|why won't|why wont/, /not working/, /doesn't work|doesnt work/,
      /won't start|wont start/, /\berror\b/, /\bcrash/, /\bbroken\b/, /troubleshoot/,
      /fix (my|this|the)/, /\bissue with/, /\bproblem with/, /keep(s|ing)? failing/,
    ],
  },
  {
    intent: "comparison",
    patterns: [
      /\bvs\.?/, /\bversus\b/, /\bcompare\b/, /\bcomparison\b/, /which is better/,
      /difference between/, /better than/, /which one (should|do) i choose/,
      /what('s| is) the difference/,
    ],
  },
  {
    intent: "current_information",
    patterns: [
      /\bcurrent\b/, /\blatest\b/, /\btoday\b/, /\bright now\b/, /\bnow\b/,
      /who is the (current|new)/, /price of/, /score of/, /\bweather\b/, /election results/,
      /stock price/, /exchange rate/, /who won/, /who is leading/,
    ],
  },
  {
    intent: "calculation",
    patterns: [
      /how much/, /how many/, /\bcalculate\b/, /\bcompute\b/, /\bconvert\b/,
      /total cost/, /what is \d/, /percent (of|increase|decrease)/, /\binterest on/,
    ],
  },
  {
    intent: "creative",
    patterns: [
      /write (me )?(a|an|my)/, /create (a|an)/, /\bdraft\b/, /\bpoem\b/,
      /story about/, /\bessay\b/, /\bdesign\b/, /\bbrainstorm\b/, /name ideas/,
      /\bscript for/, /\bcaption/, /\bheadline/,
    ],
  },
  {
    intent: "education",
    patterns: [
      /teach me/, /i want to learn/, /\bstudy\b/, /\bcourse\b/, /\bcurriculum\b/,
      /\blesson/, /\btutorial\b/, /\bsyllabus\b/, /\bdegree\b/, /\buniversity (course|program)/,
    ],
  },
  {
    intent: "history",
    patterns: [
      /history of/, /when did/, /when was/, /when were/, /\borigins?\b/, /\bfounded\b/,
      /\binvented\b/, /\bdiscovered\b/, /\btimeline\b/, /\bhistorical\b/, /when (did|was) (it|this) (begin|start|created|built|made)/,
    ],
  },
  {
    intent: "instruction",
    patterns: [
      /how do i/, /how can i/, /how to/, /steps to/, /step by step/, /walk me through/,
      /guide me/, /how should i/, /how do you (start|make|build|apply|register|write|prepare|create|learn|use)/,
    ],
  },
  {
    intent: "recommendation",
    patterns: [
      /should i/, /\brecommend/, /which .* should/, /what is the best/, /best (one|option|choice|platform|tool|language|phone|university)/,
      /\bsuggest/, /\btop \d/, /worth (it|buying|getting)/,
    ],
  },
  {
    intent: "research",
    patterns: [
      /\bresearch\b/, /everything about/, /tell me everything/, /all about/,
      /\bcomprehensive\b/, /deep dive/, /overview of/, /give me everything/,
      /\bsummarize\b/, /full (picture|details?|story)/,
    ],
  },
  {
    intent: "definition",
    patterns: [
      /what is/, /what are/, /what's|whats/, /\bdefine\b/, /\bdefinition\b/,
      /meaning of/, /what does .* mean/, /who is/, /who was/, /what do you call/, /\bterm\b/,
    ],
  },
  {
    intent: "explanation",
    patterns: [
      /\bwhy\b/, /how does/, /how do/, /\bexplain\b/, /what happens (when|if)/,
      /reason (for|behind)/, /\bcause(s|d)? of/, /because of/, /how is .* (made|created|formed)/,
    ],
  },
];

export interface IntentClassification {
  intent: QuestionIntent;
  confidence: number; // 0..1 — honest confidence of the classification
  matchedRules: string[];
  explanation: string;
}

/** Normalize free text for pattern matching. */
export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s'’]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classify a question into one of the 13 intents (spec §24) or the honest
 * `general` fallback. Deterministic: same text always yields the same result.
 * Confidence reflects how many independent patterns matched.
 */
export function classifyQuestionIntent(text: string): IntentClassification {
  const normalized = normalizeQuestionText(text);
  const scores = new Map<QuestionIntent, number>();
  const matched: string[] = [];

  for (const rule of INTENT_RULES) {
    let ruleScore = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        ruleScore += 1;
        matched.push(pattern.source);
      }
    }
    if (ruleScore > 0) {
      scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + ruleScore);
    }
  }

  if (scores.size === 0) {
    return {
      intent: "general",
      confidence: 0.05,
      matchedRules: [],
      explanation: "No intent pattern matched this question, so it is routed to the general search surface rather than being forced into a category.",
    };
  }

  // Highest score wins; ties break by rule order (most specific first).
  let best: QuestionIntent = "general";
  let bestScore = 0;
  for (const rule of INTENT_RULES) {
    const score = scores.get(rule.intent) ?? 0;
    if (score > bestScore) {
      best = rule.intent;
      bestScore = score;
    }
  }

  const confidence = Math.min(0.95, 0.4 + 0.15 * bestScore);
  return {
    intent: best,
    confidence: Number(confidence.toFixed(2)),
    matchedRules: matched,
    explanation: `Classified as "${best}" from ${bestScore} matching pattern${bestScore === 1 ? "" : "s"}.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Intent → knowledge domain routing (spec §29 — the "Ask WINDELS" layer)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface IntentRoute {
  intent: QuestionIntent;
  domain: string;
  note: string;
}

export const INTENT_ROUTING: Record<QuestionIntent, IntentRoute> = {
  definition: {
    intent: "definition",
    domain: "Concept layer",
    note: "What is…? records with definition, simple explanation, history, how it works, examples and misconceptions.",
  },
  explanation: {
    intent: "explanation",
    domain: "Explanation layer",
    note: "Why…? / How does…? records covering causes, contributing factors, uncertainty and competing explanations.",
  },
  history: {
    intent: "history",
    domain: "Timeline layer",
    note: "When…? records served from the global timeline engine with era context and approximate dates where precision is not possible.",
  },
  comparison: {
    intent: "comparison",
    domain: "Comparison layer",
    note: "Which is better…? records present criteria instead of declaring a universal winner; what is better depends on the user's goals.",
  },
  instruction: {
    intent: "instruction",
    domain: "Instruction layer",
    note: "How do I…? records give step-by-step guidance and clearly flag when professional or official assistance is required.",
  },
  recommendation: {
    intent: "recommendation",
    domain: "Guidance layer",
    note: "The system explains the criteria and trade-offs for a choice; it does not endorse one option as universally best.",
  },
  calculation: {
    intent: "calculation",
    domain: "Calculation layer",
    note: "The system teaches how a figure is calculated. It never presents unverifiable numbers as measured facts.",
  },
  current_information: {
    intent: "current_information",
    domain: "Dynamic layer",
    note: "Current facts are never memorized as permanent. Answers require SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED; stale claims are refused.",
  },
  research: {
    intent: "research",
    domain: "Research layer",
    note: "Full record surface: definitions, history, mechanics, sources and verification metadata.",
  },
  education: {
    intent: "education",
    domain: "Education layer",
    note: "Disciplines with beginner → intermediate → advanced → research learning paths.",
  },
  creative: {
    intent: "creative",
    domain: "Creative layer",
    note: "Writing, storytelling, design and content scaffolds. Output is a scaffold for the user to complete, not a finished claim.",
  },
  troubleshooting: {
    intent: "troubleshooting",
    domain: "Troubleshooting layer",
    note: "General diagnostics guidance. Live system state must be inspected directly; the knowledge layer does not invent root causes.",
  },
  personal_guidance: {
    intent: "personal_guidance",
    domain: "Guidance layer",
    note: "Balanced considerations and questions to weigh. The system does not decide for the user.",
  },
  general: {
    intent: "general",
    domain: "General layer",
    note: "No intent pattern matched; the question is searched across the full catalog.",
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Personalized Teaching Engine (spec §27)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TeachingPlan {
  level: AudienceLevel;
  mode: string;
  includedSections: KnowledgeSectionKey[];
  note: string;
}

const ALL_SECTIONS: KnowledgeSectionKey[] = [...KNOWLEDGE_SECTION_KEYS];

export const TEACHING_PLANS: Record<AudienceLevel, TeachingPlan> = {
  child: {
    level: "child",
    mode: "plain language",
    includedSections: ["simple", "examples", "guidance"],
    note: "Short sentences and concrete everyday examples; no jargon. The underlying facts are identical to every other level.",
  },
  high_school: {
    level: "high_school",
    mode: "introductory",
    includedSections: ["summary", "definition", "simple", "examples", "misconceptions", "guidance"],
    note: "Definitions plus worked examples, with common misconceptions corrected.",
  },
  undergraduate: {
    level: "undergraduate",
    mode: "detailed",
    includedSections: ["summary", "definition", "detailed", "how_it_works", "causes", "examples", "misconceptions", "learning_path", "guidance"],
    note: "Full conceptual detail: mechanisms, causes, and how the subject connects to practice.",
  },
  graduate: {
    level: "graduate",
    mode: "advanced",
    includedSections: ["summary", "definition", "detailed", "history", "how_it_works", "causes", "criteria", "steps", "levels", "geography", "economy", "culture", "learning_path", "misconceptions", "guidance"],
    note: "Adds historical context, competing explanations, comparison criteria and structured paths.",
  },
  research: {
    level: "research",
    mode: "research-grade",
    includedSections: ALL_SECTIONS,
    note: "Full record surface: every section, sources, verification metadata and professional-assistance warnings.",
  },
};

export function teachingPlanFor(level: AudienceLevel): TeachingPlan {
  return TEACHING_PLANS[level];
}

/**
 * Render a record at an audience level: the underlying knowledge is unchanged,
 * only the presented sections change. Unknown section keys in the record are
 * ignored (never invented for the level).
 */
export function renderRecordAtLevel(record: KnowledgeRecord, level: AudienceLevel): {
  level: AudienceLevel;
  mode: string;
  sections: { key: KnowledgeSectionKey; heading: string; body: string }[];
} {
  const plan = teachingPlanFor(level);
  const sections: { key: KnowledgeSectionKey; heading: string; body: string }[] = [];
  for (const key of plan.includedSections) {
    const body = record.sections[key];
    if (body && body.trim().length > 0) {
      sections.push({ key, heading: sectionHeading(key), body });
    }
  }
  return { level, mode: plan.mode, sections };
}

export function sectionHeading(key: KnowledgeSectionKey): string {
  const map: Record<KnowledgeSectionKey, string> = {
    summary: "Overview",
    definition: "Definition",
    simple: "Simple explanation",
    detailed: "In-depth explanation",
    history: "History",
    how_it_works: "How it works",
    examples: "Examples",
    misconceptions: "Common misconceptions",
    causes: "Causes & contributing factors",
    criteria: "Criteria",
    steps: "Step-by-step guidance",
    geography: "Geography",
    economy: "Economy",
    culture: "Culture",
    biography: "Biography",
    achievements: "Achievements",
    historical_context: "Historical context",
    learning_path: "Learning path",
    levels: "Levels (foundations → research)",
    guidance: "Guidance",
    warning: "Important note",
    policy: "How WINDELS treats this",
    sources: "Sources & verification",
  };
  return map[key] ?? key;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Comparison engine (spec §8) — criteria, never a universal winner
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ComparisonScore {
  criterionKey: string;
  value: number | null; // null = not labeled in the catalog (never invented)
  basis: "labeled" | "not_labeled";
  note: string;
}

export interface KnowledgeComparisonItem {
  id: string;
  title: string;
  kind: KnowledgeKind;
  tier: KnowledgeTier;
  confidence: KnowledgeConfidence;
  scores: ComparisonScore[];
}

export interface KnowledgeComparisonResult {
  criteria: ComparisonCriterion[];
  items: KnowledgeComparisonItem[];
  note: string;
}

/**
 * Compare records on the union of their labeled criteria. Records never
 * receive invented scores: a criterion without a labeled value in the catalog
 * is reported `value: null, basis: "not_labeled"`. The result declares no
 * winner — it presents the criteria so the user can judge.
 */
export function compareKnowledge(
  records: KnowledgeRecord[],
  criteriaKeys?: string[],
): KnowledgeComparisonResult {
  const requested = criteriaKeys?.map((k) => k.trim()).filter(Boolean) ?? null;
  const union = new Map<string, ComparisonCriterion>();
  for (const record of records) {
    for (const c of record.criteria ?? []) {
      if (requested && !requested.includes(c.key)) continue;
      if (!union.has(c.key)) union.set(c.key, c);
    }
  }
  const criteria = [...union.values()];

  const items: KnowledgeComparisonItem[] = records.map((record) => {
    const labeled = new Map((record.criteria ?? []).map((c) => [c.key, c]));
    return {
      id: record.id,
      title: record.title,
      kind: record.kind,
      tier: record.tier,
      confidence: record.confidence,
      scores: criteria.map((c) => {
        const entry = labeled.get(c.key);
        if (entry && typeof entry.value === "number") {
          return {
            criterionKey: c.key,
            value: entry.value,
            basis: "labeled" as const,
            note: entry.note ?? "Labeled score from the curated catalog.",
          };
        }
        return {
          criterionKey: c.key,
          value: null,
          basis: "not_labeled" as const,
          note: "Not labeled in the catalog; the system does not invent scores.",
        };
      }),
    };
  });

  return {
    criteria,
    items,
    note: "This comparison presents criteria instead of declaring a universal winner. What is 'better' depends on the user's goals, constraints and values.",
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Timeline engine (spec §6) — deterministic chronological ordering
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TimelineEventView {
  id: string;
  title: string;
  dateLabel: string; // human display ("c. 508 BCE")
  year: number | null; // approximate; negative = BCE; null = "date uncertain"
  eraId: string | null;
  summary: string;
  confidence: KnowledgeConfidence;
}

/** Sort ascending by approximate year; events with an unknown year sort last, stable. */
export function sortTimelineEvents(events: TimelineEventView[]): TimelineEventView[] {
  return [...events].sort((a, b) => {
    if (a.year === null && b.year === null) return a.id.localeCompare(b.id);
    if (a.year === null) return 1;
    if (b.year === null) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return a.id.localeCompare(b.id);
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Confidence & tier helpers (spec §25/26)
 * ──────────────────────────────────────────────────────────────────────────── */

const CONFIDENCE_ORDER: KnowledgeConfidence[] = ["verified", "well_supported", "disputed", "uncertain", "unverified"];

export function confidenceRank(c: KnowledgeConfidence): number {
  const i = CONFIDENCE_ORDER.indexOf(c);
  return i === -1 ? CONFIDENCE_ORDER.length : i;
}

/** Kinds that describe the present and therefore belong to the dynamic tier by default. */
export function defaultTierForKind(kind: KnowledgeKind): KnowledgeTier {
  return kind === "current_information" ? "dynamic" : "stable";
}

export function isCurrentInfoQuestion(text: string): boolean {
  const classification = classifyQuestionIntent(text);
  return classification.intent === "current_information";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Answer views (shared between service and web client)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface KnowledgeAnswerSection {
  key: KnowledgeSectionKey;
  heading: string;
  body: string;
}

/** A record rendered for delivery: sections filtered to the audience level. */
export interface KnowledgeAnswerMatch {
  id: string;
  title: string;
  kind: KnowledgeKind;
  categoryIds: string[];
  question: string;
  tier: KnowledgeTier;
  confidence: KnowledgeConfidence;
  provenance: "catalog" | "self_reported";
  scope: "catalog" | "organization";
  score: number;
  matchedBy: string[];
  intent: QuestionIntent;
  summary: string;
  sections: KnowledgeAnswerSection[];
  examples: string[];
  misconceptions: KnowledgeMisconception[];
  steps: KnowledgeStep[];
  criteria: ComparisonCriterion[];
  relatedIds: string[];
  sources: KnowledgeReference[];
  lastUpdated: string;
  asOfDate?: string;
  dateLabel?: string;
  eraId?: string | null;
  verificationNote?: string;
  professionalAssistanceNote?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * API input schemas
 * ──────────────────────────────────────────────────────────────────────────── */

export const IntentRequestSchema = z.object({
  text: z.string().min(1).max(500),
});
export type IntentRequestInput = z.infer<typeof IntentRequestSchema>;

export const KnowledgeAskSchema = z.object({
  question: z.string().min(3).max(500),
  audienceLevel: z.enum(AUDIENCE_LEVELS).default("high_school"),
  limit: z.number().int().min(1).max(10).default(5),
  includeDynamic: z.boolean().default(true),
});
export type KnowledgeAskInput = z.input<typeof KnowledgeAskSchema>;

export const CompareRequestSchema = z.object({
  recordIds: z.array(z.string().min(1).max(64)).min(2).max(8),
  criteriaKeys: z.array(z.string().min(1).max(60)).max(20).optional(),
});
export type CompareRequestInput = z.input<typeof CompareRequestSchema>;

export const KnowledgeSearchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  kind: z.enum(KNOWLEDGE_KINDS).optional(),
  intent: z.enum(QUESTION_INTENTS).optional(),
  category: z.string().max(40).optional(),
  tier: z.enum(KNOWLEDGE_TIERS).optional(),
  confidence: z.enum(KNOWLEDGE_CONFIDENCE).optional(),
  scope: z.enum(["catalog", "org", "all"]).default("catalog"),
  audienceLevel: z.enum(AUDIENCE_LEVELS).default("high_school"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type KnowledgeSearchQuery = z.input<typeof KnowledgeSearchQuerySchema>;

export const DynamicKnowledgeCreateSchema = z.object({
  title: z.string().min(2).max(200),
  question: z.string().min(2).max(300),
  kind: z.enum(KNOWLEDGE_KINDS).default("concept"),
  categoryIds: z.array(z.string().min(1).max(40)).min(1).max(10),
  summary: z.string().min(2).max(2000),
  sections: z.record(z.string(), z.string()).optional(),
  examples: z.array(z.string().min(1).max(600)).max(20).optional(),
  misconceptions: z.array(KnowledgeMisconceptionSchema).max(20).optional(),
  steps: z.array(KnowledgeStepSchema).max(50).optional(),
  criteria: z.array(ComparisonCriterionSchema).max(20).optional(),
  relatedIds: z.array(z.string().min(1).max(64)).max(30).optional(),
  // SOURCE is required for every dynamic record (spec §25).
  sources: z.array(KnowledgeReferenceSchema).min(1).max(20),
  confidence: z.enum(KNOWLEDGE_CONFIDENCE).default("unverified"),
  asOfDate: z.string().max(40).optional(),
  verificationNote: z.string().max(500).optional(),
  professionalAssistanceNote: z.string().max(500).optional(),
});
export type DynamicKnowledgeCreateInput = z.input<typeof DynamicKnowledgeCreateSchema>;

export const DynamicKnowledgePatchSchema = DynamicKnowledgeCreateSchema.partial().extend({
  title: z.string().min(2).max(200).optional(),
  question: z.string().min(2).max(300).optional(),
  sources: z.array(KnowledgeReferenceSchema).min(1).max(20).optional(),
});
export type DynamicKnowledgePatchInput = z.input<typeof DynamicKnowledgePatchSchema>;

export const DynamicRecordsQuerySchema = z.object({
  kind: z.enum(KNOWLEDGE_KINDS).optional(),
  confidence: z.enum(KNOWLEDGE_CONFIDENCE).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type DynamicRecordsQuery = z.input<typeof DynamicRecordsQuerySchema>;
