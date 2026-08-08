/**
 * Session 141 — WINDELS AI OS Global Religion, Belief & Spirituality
 * Knowledge System (shared contract).
 *
 * A comprehensive, structured knowledge layer for the world's religious
 * heritage: major world religions, denominations, schools, indigenous and
 * traditional religions, ancient and historical religions, and new religious
 * movements — with a standardized record structure (§12 of the spec),
 * multilingual name preservation (§17), educational levels (§16), a
 * criteria-based comparison engine that never declares a winner (§15), and a
 * controlled expansion process with duplicate detection (§18).
 *
 * NEUTRALITY REQUIREMENTS (§14) — enforced by design:
 *   - No record promotes one religion as universally superior.
 *   - Contested claims are attributed ("Christian traditions generally teach
 *     X, while Islamic traditions generally teach Y"), never asserted as
 *     objective truth.
 *   - "Which religion is true?" is answered by explaining that truth claims
 *     are matters of faith, theology, philosophy and personal belief —
 *     WINDELS never claims to have chosen a religion.
 *   - Followers of a religion are never treated as identical; a religion is
 *     never confused with its denominations; indigenous identities are
 *     preserved under their own names.
 */
import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────────
 * Enumerations
 * ──────────────────────────────────────────────────────────────────────────── */

/** Major religious families (§2). */
export const RELIGION_FAMILIES = [
  "abrahamic",            // Christianity, Judaism, Islam, Baháʼí, …
  "dharmic",              // Hinduism, Buddhism, Jainism, Sikhism
  "iranian",              // Zoroastrianism, Manichaeism, …
  "east_asian",           // Taoism, Confucianism, Shinto, Chinese folk religion, …
  "african_traditional",  // African traditional & indigenous religions
  "african_diaspora",     // Vodun diaspora traditions (Vodou, Santería/Lucumí, Candomblé, …)
  "indigenous_american",  // North/Central/South American & Arctic traditions
  "oceanian",             // Aboriginal Australian, Māori, Polynesian, Melanesian, …
  "ancient",              // historical & extinct religions
  "new_religious_movement", // modern religions and NRMs
  "humanistic",           // non-theistic and humanistic movements
  "other",
] as const;
export type ReligionFamily = (typeof RELIGION_FAMILIES)[number];

export const RELIGION_FAMILY_LABELS: Record<ReligionFamily, string> = {
  abrahamic: "Abrahamic traditions",
  dharmic: "Dharmic traditions",
  iranian: "Iranian traditions",
  east_asian: "East Asian traditions",
  african_traditional: "African traditional religions",
  african_diaspora: "African diaspora traditions",
  indigenous_american: "Indigenous American traditions",
  oceanian: "Oceanian & Australian traditions",
  ancient: "Historical & ancient religions",
  new_religious_movement: "Modern religions & new religious movements",
  humanistic: "Non-theistic & humanistic movements",
  other: "Other traditions",
};

/** Category within the knowledge base (§1: coverage is unbounded by design). */
export const RELIGION_CATEGORIES = [
  "major_religion",        // world religions
  "minor_religion",        // smaller but distinct religions
  "denomination",          // branch within a religion
  "school",                // theological/legal/philosophical school
  "mystical_tradition",    // mystical / esoteric tradition
  "indigenous_tradition",  // indigenous / traditional / tribal / ethnic religion
  "syncretic",             // syncretic religion
  "ancient_religion",      // historical / extinct religion
  "new_religious_movement",
  "philosophical_tradition",
  "policy",                // system policy records (neutrality, expansion)
] as const;
export type ReligionCategory = (typeof RELIGION_CATEGORIES)[number];

/** Contemporary status (§12 field 29). */
export const RELIGION_STATUSES = [
  "active",       // practiced today
  "minority",     // active with a small or localized following
  "revived",      // revived/reconstructed from historical practice
  "historical",   // documented historically; no continuous community
  "extinct",      // no living practitioners
  "transformed",  // historically transformed into other traditions
] as const;
export type ReligionStatus = (typeof RELIGION_STATUSES)[number];

/** Educational levels (§16). */
export const RELIGION_LEVELS = ["beginner", "intermediate", "advanced", "research"] as const;
export type ReligionLevel = (typeof RELIGION_LEVELS)[number];

/** Theism classification (§1 taxonomy terms). */
export const THEISM_TYPES = [
  "monotheistic", "polytheistic", "henotheistic", "pantheistic", "panentheistic",
  "non_theistic", "animistic", "deistic", "dualistic", "unclassifiable",
] as const;
export type TheismType = (typeof THEISM_TYPES)[number];

/** Source types (§12 fields 34–36). */
export const RELIGION_SOURCE_TYPES = [
  "academic",      // scholarly/peer-reviewed religious studies
  "primary",       // sacred texts and primary documents
  "historical",    // historical records
  "community",     // community/institutional sources
  "indigenous",    // indigenous/community authorities
] as const;
export type ReligionSourceType = (typeof RELIGION_SOURCE_TYPES)[number];

/** Confidence classification (shared vocabulary with the S140 knowledge layer). */
export const RELIGION_CONFIDENCE = [
  "verified",        // supported by reliable sources
  "well_supported",  // supported by multiple credible sources
  "disputed",        // credible sources disagree
  "uncertain",       // evidence is incomplete
  "unverified",      // not sufficiently established (e.g. new submissions)
] as const;
export type ReligionConfidence = (typeof RELIGION_CONFIDENCE)[number];

export const RELIGION_CONFIDENCE_LABELS: Record<ReligionConfidence, string> = {
  verified: "Supported by reliable sources.",
  well_supported: "Supported by multiple credible sources.",
  disputed: "Credible sources disagree.",
  uncertain: "Evidence is incomplete.",
  unverified: "Not sufficiently established.",
};

/** The 18 comparison categories (§15). */
export const RELIGION_COMPARISON_CATEGORIES = [
  "origin", "founder", "scriptures", "god_divinity", "creation", "humanity",
  "morality", "worship", "prayer", "festivals", "afterlife", "salvation",
  "authority", "branches", "history", "distribution", "similarities", "differences",
] as const;
export type ReligionComparisonCategory = (typeof RELIGION_COMPARISON_CATEGORIES)[number];

export const RELIGION_COMPARISON_LABELS: Record<ReligionComparisonCategory, string> = {
  origin: "Origin",
  founder: "Founder / key figures",
  scriptures: "Sacred texts",
  god_divinity: "God / divinity",
  creation: "Creation",
  humanity: "View of humanity",
  morality: "Moral teachings",
  worship: "Worship",
  prayer: "Prayer",
  festivals: "Festivals",
  afterlife: "Afterlife",
  salvation: "Salvation / liberation",
  authority: "Religious authority",
  branches: "Major branches",
  history: "Historical development",
  distribution: "Geographic distribution",
  similarities: "Similarities",
  differences: "Differences",
};

/* ────────────────────────────────────────────────────────────────────────────
 * Standardized record structure (§12 — 38 fields)
 * ──────────────────────────────────────────────────────────────────────────── */

/** A name with its language/script preserved (§17). */
export const ReligionNameSchema = z.object({
  name: z.string().min(1).max(200),
  lang: z.string().max(20).optional(),   // ISO 639 or "indigenous"
  script: z.string().max(40).optional(), // e.g. "Arabic", "Devanagari", "Han characters"
  note: z.string().max(200).optional(),  // e.g. "original name", "endonym"
});
export type ReligionNameEntry = z.infer<typeof ReligionNameSchema>;

export const ReligionSourceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url().max(500).optional(),
  type: z.enum(RELIGION_SOURCE_TYPES).optional(),
  note: z.string().max(300).optional(),
});
export type ReligionSource = z.infer<typeof ReligionSourceSchema>;

/**
 * The standardized religion knowledge record. Every field maps to the spec's
 * §12 list; optional fields may reference the family record where a tradition
 * shares its family's fuller account.
 */
export const ReligionRecordSchema = z.object({
  id: z.string().min(1).max(64),          // slug: rel.<name> / den.<name> / ind.<name> / anc.<name>
  name: z.string().min(1).max(200),       // 1. official/common name
  altNames: z.array(z.string().min(1).max(100)).max(30).default([]),   // 2. alternative names
  indigenousNames: z.array(ReligionNameSchema).max(10).default([]),    // 3. indigenous/original names
  namesByLanguage: z.record(z.string(), z.array(z.string().min(1).max(200))).default({}), // §17 multilingual
  family: z.enum(RELIGION_FAMILIES),      // 4. religious family
  category: z.enum(RELIGION_CATEGORIES),
  status: z.enum(RELIGION_STATUSES),      // 29-related contemporary status
  theism: z.enum(THEISM_TYPES),
  region: z.array(z.string().min(1).max(120)).min(1).max(20),          // 5. country/region
  ethnicGroups: z.array(z.string().min(1).max(120)).max(20).default([]), // 6. associated community
  originLabel: z.string().min(1).max(120), // 8. approximate founding period
  originYear: z.number().int().nullable().optional(), // approximate; negative = BCE
  founder: z.array(z.string().min(1).max(120)).max(10).default([]),    // 9. founder / major figures
  keyFigures: z.array(z.string().min(1).max(120)).max(20).default([]),
  centralTeachings: z.string().min(1),    // 10. central teachings
  deityConcept: z.string().min(1),        // 11. concept of God/gods/divinity
  spiritualBeings: z.string().min(1).max(2000), // 12. spiritual beings
  cosmology: z.string().min(1).max(2000),
  creationBelief: z.string().min(1).max(2000),  // 14. creation traditions
  humanity: z.string().min(1).max(2000),
  afterlife: z.string().min(1).max(2000), // 30. afterlife concepts
  salvation: z.string().min(1).max(2000), // 31. salvation/liberation
  morality: z.string().min(1).max(2000),  // 16. moral teachings
  worship: z.string().min(1).max(2000),   // 17. worship practices
  prayer: z.string().min(1).max(2000),    // 18. prayer practices
  meditation: z.string().min(1).max(2000),// 19. meditation practices
  rituals: z.string().min(1).max(2000),   // 20. rituals
  festivals: z.array(z.string().min(1).max(150)).max(25).default([]),  // 21. festivals
  sacredPlaces: z.array(z.string().min(1).max(150)).max(20).default([]), // 22. sacred places
  symbols: z.array(z.string().min(1).max(150)).max(20).default([]),    // 23. religious symbols
  religiousLeaders: z.string().min(1).max(2000), // 24. religious leaders
  religiousLaw: z.string().min(1).max(2000),     // 25. religious laws
  sacredTexts: z.array(z.string().min(1).max(200)).max(25).default([]), // 26. sacred texts
  oralTraditions: z.string().min(1).max(2000),   // 27. oral traditions
  branches: z.array(z.string().min(1).max(100)).max(30).default([]),   // 28. major branches
  denominations: z.array(z.string().min(1).max(100)).max(30).default([]),
  schools: z.array(z.string().min(1).max(100)).max(30).default([]),
  historicalDevelopment: z.string().min(1).max(6000), // 29. historical development
  modernStatus: z.string().min(1).max(2000),         // 30. modern status
  distribution: z.string().min(1).max(2000),         // 31. estimated geographic distribution
  relatedReligions: z.array(z.string().min(1).max(64)).max(30).default([]), // 32. related religions
  differences: z.string().min(1).max(3000),          // 33. differences from related traditions
  similarities: z.string().min(1).max(3000),         // 34. similarities with other traditions
  sources: z.array(ReligionSourceSchema).min(1).max(30), // 35–37. sources
  confidence: z.enum(RELIGION_CONFIDENCE),           // 38. confidence classification
  lastReviewed: z.string(),                          // 39. date of last knowledge review
  summary: z.string().min(1).max(3000),              // teaching: overview
  simple: z.string().min(1).max(2000),               // teaching: beginner
  advanced: z.string().max(6000).optional(),         // teaching: academic note
  researchNote: z.string().max(6000).optional(),     // teaching: research mode — debates & open questions
  controversialNote: z.string().max(1000).optional(), // neutrality: contested claims attribution
  expansionNote: z.string().max(1000).optional(),    // expansion: legacy/classification notes
});
export type ReligionRecord = z.infer<typeof ReligionRecordSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Question classification for the religion layer (§13/§14)
 * ──────────────────────────────────────────────────────────────────────────── */

export const RELIGION_QUESTION_INTENTS = [
  "definition",        // "What is Christianity?"
  "comparison",        // "What is the difference between Christianity and Islam?"
  "truth_claim",       // "Which religion is true?"
  "practice",          // "How do Muslims pray?"
  "history",           // "When did Buddhism begin?"
  "family",            // "What are the Abrahamic religions?"
  "status",            // "Is this religion still practiced?"
  "general",           // fallback
] as const;
export type ReligionQuestionIntent = (typeof RELIGION_QUESTION_INTENTS)[number];

export interface ReligionQuestionClassification {
  intent: ReligionQuestionIntent;
  confidence: number;
  matchedRules: string[];
  explanation: string;
}

export function normalizeReligionText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s'’]/g, " ").replace(/\s+/g, " ").trim();
}

const RELIGION_INTENT_RULES: Array<{ intent: Exclude<ReligionQuestionIntent, "general">; patterns: RegExp[] }> = [
  {
    intent: "truth_claim",
    patterns: [
      /which religion is (true|the true|right|correct|real)/, /is (my|the) religion (true|right)/,
      /is (christianity|islam|judaism|buddhism|hinduism|sikhism|jainism|zoroastrianism) (the )?true/, /what is the true religion/,
      /does god exist/, /which faith is (true|right)/,
    ],
  },
  {
    intent: "comparison",
    patterns: [
      /\bvs\.?/, /\bversus\b/, /\bcompare\b/, /\bdifference between\b/, /\bsimilarities (between|and)/,
      /\bcompared to\b/, /\bdiffer from\b/, /\bhow (is|are) .* different\b/,
    ],
  },
  {
    intent: "practice",
    patterns: [
      /how (do|does|did) .* (worship|pray|meditate|celebrate|worship|practi[cs]e)/,
      /\bfestivals? of\b/, /\brituals?\b/, /\bhow to pray\b/, /\bwhat (do|does) .* (believe|teach)\b/,
    ],
  },
  {
    intent: "history",
    patterns: [
      /when (did|was|were)/, /\borigin\b/, /\bfounded\b/, /\bhistory of\b/, /\bbegin\b/, /\bstarted\b/, /\bwho (founded|created|started)/,
    ],
  },
  {
    intent: "family",
    patterns: [
      /\bfamil(y|ies)\b/, /\bwhat are the (major|world) religions\b/, /\btypes of religions\b/, /\blist of religions\b/,
      /\bhow many religions\b/, /\b(abrahamic|dharmic|east asian|indigenous|major|world) religions?\b/, /\breligions of (the )?world\b/,
    ],
  },
  {
    intent: "status",
    patterns: [
      /still (practiced|practised|exists?|followed)/, /\bextinct\b/, /\balive\b/, /\bhow many (people|followers)/,
      /\bwhere (is|are) .* practiced\b/, /\btoday\b/,
    ],
  },
  {
    intent: "definition",
    patterns: [
      /what is/, /what are/, /\bdefine\b/, /\bdefinition\b/, /\bmeaning of\b/, /\bwhat('s| is) (the )?/,
      /\bwho (is|was|are)\b/,
    ],
  },
];

/**
 * Specificity bonus: when several intents match, the more specific intent
 * must win deterministically. Truth claims and comparisons outrank plain
 * definitions even when the question also contains "what is".
 */
const RELIGION_INTENT_PRIORITY: Record<Exclude<ReligionQuestionIntent, "general">, number> = {
  truth_claim: 5,
  comparison: 4,
  practice: 2,
  history: 2,
  family: 1,
  status: 1,
  definition: 0,
};

/**
 * Deterministic classification of a religion-related question. Same text →
 * same result. No match yields the honest `general` fallback.
 */
export function classifyReligionQuestion(text: string): ReligionQuestionClassification {
  const normalized = normalizeReligionText(text);
  const scores = new Map<ReligionQuestionIntent, number>();
  const matched: string[] = [];
  for (const rule of RELIGION_INTENT_RULES) {
    let ruleScore = 0;
    for (const p of rule.patterns) {
      if (p.test(normalized)) {
        ruleScore += 1;
        matched.push(p.source);
      }
    }
    if (ruleScore > 0) scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + ruleScore);
  }
  if (scores.size === 0) {
    return {
      intent: "general",
      confidence: 0.05,
      matchedRules: [],
      explanation: "No religion-question pattern matched; routed to general search rather than forced into a category.",
    };
  }
  let best: ReligionQuestionIntent = "general";
  let bestScore = 0;
  for (const rule of RELIGION_INTENT_RULES) {
    const raw = scores.get(rule.intent) ?? 0;
    if (raw === 0) continue; // priority applies only among actually-matched intents
    const weighted = raw + RELIGION_INTENT_PRIORITY[rule.intent];
    if (weighted > bestScore) {
      best = rule.intent;
      bestScore = weighted;
    }
  }
  const rawScore = scores.get(best) ?? 0;
  return {
    intent: best,
    confidence: Number(Math.min(0.95, 0.4 + 0.15 * rawScore).toFixed(2)),
    matchedRules: matched,
    explanation: `Classified as "${best}" from ${rawScore} matching pattern${rawScore === 1 ? "" : "s"} (specificity-weighted).`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Teaching engine (§16) — beginner → intermediate → advanced → research
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReligionTeachingSection {
  key: string;
  heading: string;
  body: string;
}

const RELIGION_TEACHING_PLANS: Record<ReligionLevel, string[]> = {
  beginner: ["simple", "centralTeachings", "festivals"],
  intermediate: ["summary", "centralTeachings", "deityConcept", "worship", "prayer", "morality", "afterlife", "festivals", "branches", "history"],
  advanced: [
    "summary", "centralTeachings", "deityConcept", "cosmology", "creationBelief", "humanity",
    "morality", "worship", "prayer", "meditation", "rituals", "afterlife", "salvation",
    "authority", "branches", "history", "differences", "similarities",
  ],
  research: [
    "summary", "centralTeachings", "deityConcept", "spiritualBeings", "cosmology", "creationBelief",
    "humanity", "morality", "worship", "prayer", "meditation", "rituals", "afterlife", "salvation",
    "authority", "branches", "history", "differences", "similarities", "researchNote",
  ],
};

const RELIGION_TEACHING_HEADINGS: Record<string, string> = {
  simple: "Simple explanation",
  summary: "Overview",
  centralTeachings: "Central teachings",
  deityConcept: "Concept of God / divinity",
  spiritualBeings: "Spiritual beings",
  cosmology: "Cosmology",
  creationBelief: "Creation traditions",
  humanity: "View of humanity",
  morality: "Moral teachings",
  worship: "Worship",
  prayer: "Prayer",
  meditation: "Meditation",
  rituals: "Rituals",
  afterlife: "Afterlife",
  salvation: "Salvation / liberation",
  authority: "Religious authority",
  branches: "Major branches",
  history: "Historical development",
  differences: "Differences from related traditions",
  similarities: "Similarities with other traditions",
  researchNote: "Research note — debates and open questions",
};

/**
 * Render a record at an educational level. The underlying record is
 * unchanged; only the presented fields change. Unknown/empty fields are
 * skipped — never invented for the level.
 */
export function renderReligionAtLevel(record: ReligionRecord, level: ReligionLevel): {
  level: ReligionLevel;
  sections: ReligionTeachingSection[];
} {
  const keys = RELIGION_TEACHING_PLANS[level];
  const sections: ReligionTeachingSection[] = [];
  const field = (k: string): string | undefined => {
    switch (k) {
      case "simple": return record.simple;
      case "summary": return record.summary;
      case "centralTeachings": return record.centralTeachings;
      case "deityConcept": return record.deityConcept;
      case "spiritualBeings": return record.spiritualBeings;
      case "cosmology": return record.cosmology;
      case "creationBelief": return record.creationBelief;
      case "humanity": return record.humanity;
      case "morality": return record.morality;
      case "worship": return record.worship;
      case "prayer": return record.prayer;
      case "meditation": return record.meditation;
      case "rituals": return record.rituals;
      case "afterlife": return record.afterlife;
      case "salvation": return record.salvation;
      case "authority": return record.religiousLeaders;
      case "branches": return record.branches.length ? `Major branches: ${record.branches.join(", ")}.` : undefined;
      case "history": return record.historicalDevelopment;
      case "differences": return record.differences;
      case "similarities": return record.similarities;
      case "researchNote": return record.researchNote;
      default: return undefined;
    }
  };
  for (const k of keys) {
    const body = field(k);
    if (body && body.trim().length > 0) {
      sections.push({ key: k, heading: RELIGION_TEACHING_HEADINGS[k] ?? k, body });
    }
  }
  return { level, sections };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Comparison engine (§15) — 18 categories, attributed, never a winner
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReligionComparisonRow {
  category: ReligionComparisonCategory;
  label: string;
  values: Array<{ id: string; name: string; text: string }>;
}

export interface ReligionComparisonResult {
  items: Array<{ id: string; name: string; family: ReligionFamily; category: ReligionCategory; status: ReligionStatus }>;
  rows: ReligionComparisonRow[];
  note: string;
}

function fieldText(record: ReligionRecord, category: ReligionComparisonCategory): string {
  switch (category) {
    case "origin": return record.originLabel;
    case "founder": return record.founder.length ? record.founder.join(", ") : "No single founder recorded";
    case "scriptures": return record.sacredTexts.length ? record.sacredTexts.join("; ") : "Primarily oral tradition";
    case "god_divinity": return record.deityConcept;
    case "creation": return record.creationBelief;
    case "humanity": return record.humanity;
    case "morality": return record.morality;
    case "worship": return record.worship;
    case "prayer": return record.prayer;
    case "festivals": return record.festivals.length ? record.festivals.join(", ") : "Not recorded";
    case "afterlife": return record.afterlife;
    case "salvation": return record.salvation;
    case "authority": return record.religiousLeaders;
    case "branches": return record.branches.length ? record.branches.join(", ") : "—";
    case "history": return record.historicalDevelopment.slice(0, 400);
    case "distribution": return record.distribution;
    case "similarities": return record.similarities;
    case "differences": return record.differences;
    default: return "";
  }
}

/**
 * Build a side-by-side comparison across the 18 categories (§15). Values come
 * only from the records' own structured fields; contested claims remain
 * attributed to the tradition in the record text. The result never selects a
 * winner.
 */
export function compareReligions(records: ReligionRecord[]): ReligionComparisonResult {
  const items = records.map((r) => ({
    id: r.id,
    name: r.name,
    family: r.family,
    category: r.category,
    status: r.status,
  }));
  const rows: ReligionComparisonRow[] = RELIGION_COMPARISON_CATEGORIES.map((category) => ({
    category,
    label: RELIGION_COMPARISON_LABELS[category],
    values: records.map((r) => ({ id: r.id, name: r.name, text: fieldText(r, category) })),
  }));
  return {
    items,
    rows,
    note: "This comparison presents each tradition's own teachings as recorded in its knowledge entry. WINDELS does not rank religions or judge which is true; truth claims are matters of faith, theology, philosophy and personal belief.",
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Expansion process (§18) — the 10-step controlled review pipeline
 * ──────────────────────────────────────────────────────────────────────────── */

export const RELIGION_SUBMISSION_STEPS = [
  "identity_verification",    // 1. name + aliases present and non-empty
  "classification",           // 2. family + category + status valid
  "source_verification",      // 3. at least one source provided
  "historical_verification",  // 4. origin period and historical development present
  "community_review",         // 5. community/indigenous source present where appropriate (advisory)
  "duplicate_detection",      // 6. no existing catalog record with the same name/alias
  "related_mapping",          // 7. related traditions mapped
  "branch_mapping",           // 8. branches/denominations/schools mapped
  "confidence_scoring",       // 9. confidence classified (defaults to unverified)
  "knowledge_base_approval",  // 10. Super Admin approval gate
] as const;
export type ReligionSubmissionStep = (typeof RELIGION_SUBMISSION_STEPS)[number];

export const RELIGION_SUBMISSION_STATUSES = ["draft", "pending_review", "approved", "rejected"] as const;
export type ReligionSubmissionStatus = (typeof RELIGION_SUBMISSION_STATUSES)[number];

export interface ReligionSubmissionCheck {
  step: ReligionSubmissionStep;
  passed: boolean;
  note: string;
}

export interface ReligionSubmission {
  id: string;
  organizationId: string;
  submittedBy: string;
  status: ReligionSubmissionStatus;
  record: ReligionRecord;                 // the proposed standardized record
  checks: ReligionSubmissionCheck[];      // automated pipeline report
  allAutomatedPassed: boolean;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * API input schemas
 * ──────────────────────────────────────────────────────────────────────────── */

export const ReligionAskSchema = z.object({
  question: z.string().min(3).max(500),
  level: z.enum(RELIGION_LEVELS).default("intermediate"),
  limit: z.number().int().min(1).max(8).default(5),
});
export type ReligionAskInput = z.input<typeof ReligionAskSchema>;

export const ReligionCompareSchema = z.object({
  recordIds: z.array(z.string().min(1).max(64)).min(2).max(8),
});
export type ReligionCompareInput = z.input<typeof ReligionCompareSchema>;

export const ReligionSearchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  family: z.enum(RELIGION_FAMILIES).optional(),
  category: z.enum(RELIGION_CATEGORIES).optional(),
  status: z.enum(RELIGION_STATUSES).optional(),
  theism: z.enum(THEISM_TYPES).optional(),
  region: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ReligionSearchQuery = z.input<typeof ReligionSearchQuerySchema>;

/** The minimum required fields for a submission; the rest default from the family record. */
export const ReligionSubmissionCreateSchema = z.object({
  name: z.string().min(2).max(200),
  altNames: z.array(z.string().min(1).max(100)).max(20).optional(),
  indigenousNames: z.array(ReligionNameSchema).max(10).optional(),
  namesByLanguage: z.record(z.string(), z.array(z.string())).optional(),
  family: z.enum(RELIGION_FAMILIES),
  category: z.enum(RELIGION_CATEGORIES),
  status: z.enum(RELIGION_STATUSES).default("active"),
  theism: z.enum(THEISM_TYPES).default("unclassifiable"),
  region: z.array(z.string().min(1).max(120)).min(1).max(20),
  ethnicGroups: z.array(z.string().min(1).max(120)).max(20).optional(),
  originLabel: z.string().min(2).max(120),
  originYear: z.number().int().nullable().optional(),
  founder: z.array(z.string().min(1).max(120)).max(10).optional(),
  centralTeachings: z.string().min(10).max(4000),
  deityConcept: z.string().min(10).max(4000),
  spiritualBeings: z.string().min(1).max(2000).optional(),
  cosmology: z.string().min(1).max(2000).optional(),
  creationBelief: z.string().min(1).max(2000).optional(),
  humanity: z.string().min(1).max(2000).optional(),
  afterlife: z.string().min(1).max(2000).optional(),
  salvation: z.string().min(1).max(2000).optional(),
  morality: z.string().min(1).max(2000).optional(),
  worship: z.string().min(1).max(2000).optional(),
  prayer: z.string().min(1).max(2000).optional(),
  meditation: z.string().min(1).max(2000).optional(),
  rituals: z.string().min(1).max(2000).optional(),
  festivals: z.array(z.string().min(1).max(150)).max(25).optional(),
  sacredPlaces: z.array(z.string().min(1).max(150)).max(20).optional(),
  symbols: z.array(z.string().min(1).max(150)).max(20).optional(),
  religiousLeaders: z.string().min(1).max(2000).optional(),
  religiousLaw: z.string().min(1).max(2000).optional(),
  sacredTexts: z.array(z.string().min(1).max(200)).max(25).optional(),
  oralTraditions: z.string().min(1).max(2000).optional(),
  branches: z.array(z.string().min(1).max(100)).max(30).optional(),
  denominations: z.array(z.string().min(1).max(100)).max(30).optional(),
  schools: z.array(z.string().min(1).max(100)).max(30).optional(),
  historicalDevelopment: z.string().min(10).max(6000),
  modernStatus: z.string().min(1).max(2000).optional(),
  distribution: z.string().min(1).max(2000).optional(),
  relatedReligions: z.array(z.string().min(1).max(64)).max(30).optional(),
  differences: z.string().min(1).max(3000).optional(),
  similarities: z.string().min(1).max(3000).optional(),
  sources: z.array(ReligionSourceSchema).min(1).max(30),
  summary: z.string().min(10).max(3000),
  simple: z.string().min(10).max(2000),
});
export type ReligionSubmissionCreateInput = z.input<typeof ReligionSubmissionCreateSchema>;

export const ReligionSubmissionReviewSchema = z.object({
  reviewNote: z.string().max(1000).optional(),
  status: z.enum(["approved", "rejected"]).optional(),
});
export type ReligionSubmissionReviewInput = z.input<typeof ReligionSubmissionReviewSchema>;

export const ReligionSubmissionsQuerySchema = z.object({
  status: z.enum(RELIGION_SUBMISSION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ReligionSubmissionsQuery = z.input<typeof ReligionSubmissionsQuerySchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * AI Response Safety (§19) — distinguish education/advice/theology/faith/
 * history/criticism from discrimination and hate speech.
 *
 * The classifier is deliberately narrow and conservative: it flags only
 * clear hate speech and blanket religious discrimination (slurs, calls to
 * harm, dehumanization, blanket condemnation of a whole religion or its
 * followers). Everything else — including religious criticism and historical
 * discussion — passes through to the normal question engine. Educational
 * discussion of religion remains available; the system never generates
 * hateful content targeting people because of their religion.
 * ──────────────────────────────────────────────────────────────────────────── */

export const RELIGION_SAFETY_CATEGORIES = [
  "religious_education",      // "What is Christianity?"
  "religious_advice",         // "How should I pray?" / practice guidance
  "theology",                 // doctrinal discussion and argument
  "personal_faith",           // "I am a Muslim and I believe…"
  "historical_information",   // "What happened during the Crusades?"
  "religious_criticism",      // "I think this doctrine is wrong because…"
  "religious_discrimination", // blanket condemnation of a religion/its people
  "hate_speech",              // slurs, calls to harm, dehumanization
] as const;
export type ReligionSafetyCategory = (typeof RELIGION_SAFETY_CATEGORIES)[number];

export interface ReligionSafetyClassification {
  category: ReligionSafetyCategory;
  isHateful: boolean;         // hate speech (slurs, calls to harm, dehumanization)
  isDiscriminatory: boolean;  // blanket condemnation of a religion or its followers
  matchedPatterns: string[];
  explanation: string;
}

/** Groups/religions whose members are the targets of religious hatred. */
const SAFETY_TARGETS = [
  "muslims?", "jews", "christians?", "hindus?", "buddhists?", "sikhs?",
  "jains?", "yazidis?", "bahá", "atheists?", "pagans?", "zoroastrians?",
  "catholics?", "protestants?", "sunnis?", "shia", "shias?", "mormons?",
  "jewish people", "muslim people", "christian people", "people of faith",
  "believers?", "nonbelievers?", "non-believers?",
] as const;

/** Unambiguous religious slurs / dehumanizing terms. */
const SAFETY_SLURS = [
  "kike", "raghead", "towelhead", "muzzie", "muzzie", "christ-killer",
  "christkiller", "heathen scum", "infidel scum", "devil worshippers?",
  "satan worshippers?", "jew pigs?", "muslim pigs?", "christian pigs?",
] as const;

const SAFETY_HATE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Calls to harm a group
  { label: "call_to_harm", re: /\b(kill|exterminate|destroy|burn|hang|shoot|slaughter|gas|bomb|behead|stone|hunt)\b[^.!?]{0,80}\b(all|every|any|the)\b[^.!?]{0,40}(muslims?|jews|christians?|hindus?|buddhists?|sikhs?|yazidis?|atheists?|pagans?|believers?|nonbelievers?)/i },
  { label: "harm_call_reversed", re: /\b(all|every|the)\b[^.!?]{0,40}(muslims?|jews|christians?|hindus?|buddhists?|sikhs?|yazidis?|atheists?|pagans?|believers?|nonbelievers?)[^.!?]{0,40}\b(kill|exterminate|destroy|burn|hang|shoot|slaughter|gas|bomb|behead|stone|hunt)\b/i },
  // Dehumanization of a group
  { label: "dehumanization", re: /\b(all|most|every|these|those)\b[^.!?]{0,30}(muslims?|jews|christians?|hindus?|buddhists?|sikhs?|yazidis?|atheists?|pagans?|believers?|nonbelievers?|catholics?|protestants?|mormons?)[^.!?]{0,30}\b(are|is)\b[^.!?]{0,40}\b(subhuman|vermin|scum|parasites?|dogs|rats?|pigs?|garbage|trash|animals|beasts|monsters|disease|cancer|plague)\b/i },
  // Blanket condemnation of a whole religion as evil
  { label: "religion_blanket_evil", re: /\b(islam|judaism|christianity|hinduism|buddhism|sikhism|jainism|the (qur|kor)an|the bible|the torah|the talmud)\b[^.!?]{0,50}\b(is|are)\b[^.!?]{0,40}\b(evil|of the devil|satanic|a curse|a plague|worthless|garbage|trash|vile|disgusting|an abomination|(the|a) religion of (evil|hatred|terror|violence|murder))\b/i },
  { label: "religion_blanket_evil_reversed", re: /\b(evil|of the devil|satanic|a curse|a plague|worthless|garbage|trash|vile|disgusting|an abomination)\b[^.!?]{0,50}\b(islam|judaism|christianity|hinduism|buddhism|sikhism|jainism)\b/i },
];

const SAFETY_DISCRIMINATION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // "all X are …" blanket statements about people of a religion
  { label: "blanket_all_are", re: /\b(all|every|most)\b[^.!?]{0,30}(muslims?|jews|christians?|hindus?|buddhists?|sikhs?|yazidis?|atheists?|pagans?|believers?|nonbelievers?|catholics?|protestants?|mormons?)[^.!?]{0,30}\b(are|is)\b[^.!?]{0,60}\b(evil|stupid|ignorant|backward|savages?|barbaric|brainwashed|dangerous|criminals?|terrorists?|liars?|thieves?|inferior|subhuman|animals)\b/i },
  // "get rid of / ban all X"
  { label: "ban_or_remove_group", re: /\b(get rid of|ban|remove|expel|deport|exclude|erase)\b[^.!?]{0,40}\b(all|every|the)\b[^.!?]{0,40}(muslims?|jews|christians?|hindus?|buddhists?|sikhs?|yazidis?|atheists?|pagans?|believers?|nonbelievers?)/i },
  // slurs by themselves
  { label: "slur", re: new RegExp(`\\b(${SAFETY_SLURS.join("|")})\\b`, "i") },
];

/**
 * Classify the safety posture of a religion-related message (§19).
 * Deterministic. Only clear hate speech and blanket discrimination are
 * flagged; criticism, theology, personal faith and education pass through.
 */
export function classifyReligionResponseSafety(text: string): ReligionSafetyClassification {
  const normalized = normalizeReligionText(text);
  const matchedPatterns: string[] = [];

  for (const p of SAFETY_HATE_PATTERNS) {
    if (p.re.test(text)) matchedPatterns.push(`hate:${p.label}`);
  }
  for (const p of SAFETY_DISCRIMINATION_PATTERNS) {
    if (p.re.test(text)) matchedPatterns.push(`discrimination:${p.label}`);
  }

  const isHateful = matchedPatterns.some((m) => m.startsWith("hate:"));
  const isDiscriminatory = matchedPatterns.some((m) => m.startsWith("discrimination:"));

  let category: ReligionSafetyCategory;
  if (isHateful) category = "hate_speech";
  else if (isDiscriminatory) category = "religious_discrimination";
  else if (/i (am|'m) (a )?(muslim|christian|jew|jewish|hindu|buddhist|sikh|jain|atheist|pagan)/i.test(text)) category = "personal_faith";
  else if (/\b(advice|should i|how (do|should) i (pray|worship|meditate|celebrate|observe))\b/i.test(text)) category = "religious_advice";
  else if (/\b(criticism|criticize|critique|disagree|i think .* (wrong|mistaken|incorrect))\b/i.test(text)) category = "religious_criticism";
  else if (/\b(history|historically|in (the )?(medieval|ancient|modern) (era|period)|during|war|crusades|inquisition)\b/i.test(text)) category = "historical_information";
  else if (/\b(theology|theological|doctrine|doctrinal|exegesis|hermeneutics)\b/i.test(text)) category = "theology";
  else category = "religious_education";

  const explanation = isHateful || isDiscriminatory
    ? `Flagged as ${category} — WINDELS does not generate hateful or discriminatory content targeting people because of their religion (§19). Educational discussion of the tradition remains available.`
    : `Classified as ${category}; educational religious discussion is available.`;

  return { category, isHateful, isDiscriminatory, matchedPatterns, explanation };
}
