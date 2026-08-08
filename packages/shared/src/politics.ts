/**
 * Session 144 — WINDELS AI OS Global Politics, Government & Political
 * History Intelligence System (shared contract).
 *
 * An educational and informational system — NOT a political persuasion
 * engine (§1). It presents political information accurately, neutrally,
 * transparently and with historical context, and it never secretly favors a
 * party, candidate, government, ideology, country or movement (§24:
 * INFORM, NOT MANIPULATE).
 *
 * Architectural pillars:
 *
 *  1. INTERCONNECTED ENTITIES (§27) — country profiles, leaders, parties,
 *     elections, ministries, governors, legislators, constitutions,
 *     movements, ideologies, international organizations and political
 *     events are separate typed records with `relatedIds` edges — never one
 *     giant text block.
 *
 *  2. FACT vs OPINION ENGINE (§23) — every political claim can be
 *     classified as verified fact / historical interpretation / political
 *     analysis / opinion / allegation / disputed claim / propaganda.
 *
 *  3. HISTORY vs CURRENT SEPARATION (§21) — stable historical knowledge
 *     lives in the curated catalog; current office-holders carry a
 *     "Last Verified" timestamp and are dynamic information.
 *
 *  4. NEVER OVERWRITE HISTORY (§28/§29) — the update engine records change
 *     log entries (previous value, new value, effective date, source,
 *     verification) and preserves the historical record; every entity
 *     carries version metadata.
 *
 *  5. NEUTRALITY (§24) — comparisons attribute each country's/party's own
 *     self-description alongside academic classification; disputed claims
 *     are labelled, never resolved by WINDELS.
 */
import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────────
 * Enumerations
 * ──────────────────────────────────────────────────────────────────────────── */

/** Government system classifications (§12). */
export const GOVERNMENT_FORMS = [
  "presidential_republic",
  "parliamentary_republic",
  "semi_presidential_republic",
  "constitutional_monarchy",
  "parliamentary_monarchy",
  "absolute_monarchy",
  "federal_republic",
  "unitary_republic",
  "federal_monarchy",
  "one_party_state",
  "military_government",
  "transitional_government",
  "other",
] as const;
export type GovernmentForm = (typeof GOVERNMENT_FORMS)[number];

export const GOVERNMENT_FORM_LABELS: Record<GovernmentForm, string> = {
  presidential_republic: "Presidential republic",
  parliamentary_republic: "Parliamentary republic",
  semi_presidential_republic: "Semi-presidential republic",
  constitutional_monarchy: "Constitutional monarchy",
  parliamentary_monarchy: "Parliamentary monarchy",
  absolute_monarchy: "Absolute monarchy",
  federal_republic: "Federal republic",
  unitary_republic: "Unitary republic",
  federal_monarchy: "Federal monarchy",
  one_party_state: "One-party system",
  military_government: "Military government",
  transitional_government: "Transitional government",
  other: "Other arrangement",
};

/** Office title kinds (§4 — do not assume every country has a president). */
export const OFFICE_TITLE_KINDS = [
  "president",
  "prime_minister",
  "chancellor",
  "monarch_king",
  "monarch_queen",
  "emperor",
  "sultan",
  "emir",
  "governor_general",
  "governor",
  "premier",
  "chief_minister",
  "military_ruler",
  "transitional_leader",
  "revolutionary_leader",
  "head_of_state_ceremonial",
  "head_of_government",
  "other",
] as const;
export type OfficeTitleKind = (typeof OFFICE_TITLE_KINDS)[number];

/** Political entity kinds (§27). */
export const POLITICS_ENTITY_KINDS = [
  "country",
  "leader",
  "party",
  "election",
  "ministry",
  "governor",
  "legislator",
  "constitution",
  "event",
  "movement",
  "ideology",
  "international_organization",
  "government_form",
  "policy",
] as const;
export type PoliticsEntityKind = (typeof POLITICS_ENTITY_KINDS)[number];

/** Educational levels (§25). */
export const POLITICS_LEVELS = ["beginner", "intermediate", "advanced", "research"] as const;
export type PoliticsLevel = (typeof POLITICS_LEVELS)[number];

/** Verification status (§22). */
export const POLITICS_VERIFICATION = [
  "verified",          // official sources + corroboration
  "well_supported",    // multiple credible sources
  "disputed",          // credible sources disagree
  "uncertain",         // evidence incomplete
  "unverified",        // not sufficiently established
  "current_as_of",     // dynamic current info, valid as of Last Verified date
] as const;
export type PoliticsVerification = (typeof POLITICS_VERIFICATION)[number];

/** Source types in the §22 priority ladder. */
export const POLITICS_SOURCE_TYPES = [
  "official_government",
  "electoral_commission",
  "parliamentary_record",
  "constitution_legal",
  "international_organization",
  "historical_archive",
  "academic",
  "journalism",
  "secondary_credible",
] as const;
export type PoliticsSourceType = (typeof POLITICS_SOURCE_TYPES)[number];

/** Fact vs opinion categories (§23). */
export const FACT_OPINION_CATEGORIES = [
  "verified_fact",          // "Person X served as president from year A to year B."
  "historical_interpretation", // "X's policy caused the crisis" (scholarly debate)
  "political_analysis",     // conditional, evidence-based analysis
  "opinion",                // "Person X was the greatest president."
  "allegation",             // an accusation, not established
  "disputed_claim",         // credible sources disagree
  "propaganda_messaging",   // partisan messaging, not neutral information
] as const;
export type FactOpinionCategory = (typeof FACT_OPINION_CATEGORIES)[number];

/** Politics question intents. */
export const POLITICS_QUESTION_INTENTS = [
  "country_history",      // "Tell me the history of Nigeria."
  "leader",               // "Who was Nigeria's first president?" / "List all presidents."
  "current_office",       // "Who is the current president?"
  "election",             // "Explain every Nigerian presidential election."
  "government_how",       // "How does the Nigerian Senate work?"
  "comparison",           // "Compare Nigeria's government with the United States."
  "constitution",         // "How does the Nigerian constitution work?"
  "ideology",             // "What is socialism?"
  "international",        // "What does ECOWAS do?"
  "education",            // "Teach me politics." / "Quiz me on political history."
  "general",
] as const;
export type PoliticsQuestionIntent = (typeof POLITICS_QUESTION_INTENTS)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * Fact vs Opinion Engine (§23) — deterministic, honest
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FactOpinionClassification {
  category: FactOpinionCategory;
  matchedPatterns: string[];
  explanation: string;
}

/**
 * Classify a political claim into the §23 categories. Deterministic and
 * deliberately conservative: only clear patterns are classified as opinion,
 * allegation or propaganda; sourced-looking factual statements fall to
 * verified_fact (their verification depends on the source ladder, §22), and
 * causal/interpretive statements fall to historical_interpretation or
 * political_analysis rather than being treated as bare facts.
 */
export function classifyPoliticalClaim(text: string): FactOpinionClassification {
  const t = text.toLowerCase().replace(/[^a-z0-9\s'’]/g, " ").replace(/\s+/g, " ").trim();
  const matched: string[] = [];

  const isAllegation =
    /\b(alleged(ly)?|accused of|claims? that|is accused|reportedly)\b/.test(t);
  const isOpinion =
    /\b(greatest|worst|best|most (successful|corrupt|brilliant|disastrous)|terrible|amazing|wonderful|pathetic|disgraceful)\b/.test(t) ||
    /\b(i|we|everyone|nobody) (think|believe|feel)\b/.test(t) ||
    /\b(in my opinion|in my view)\b/.test(t);
  const isCausal =
    /\b(caused|destroyed|ruined|created|led to|resulted in|due to|because of)\b/.test(t);
  const isAnalytical =
    /\b(analysis|analysts?|according to (most )?(scholars|analysts|observers)|evidence suggests|data shows|trend)\b/.test(t);
  const isDisputed =
    /\b(disputed|contested|disagreement|opposition (says|claims)|alleges|controversial)\b/.test(t);
  const isPropaganda =
    /\b(enemies of (the people|god|the nation)|traitors?|evil (regime|empire)|death to|treasonous|puppet (regime|government)|fake news)\b/.test(t);

  if (isPropaganda) {
    matched.push("propaganda_messaging");
    return {
      category: "propaganda_messaging",
      matchedPatterns: matched,
      explanation: "This phrasing uses partisan messaging vocabulary; it is presented as messaging, not neutral information (§23).",
    };
  }
  if (isDisputed) {
    matched.push("disputed_claim");
    return {
      category: "disputed_claim",
      matchedPatterns: matched,
      explanation: "The claim itself indicates credible disagreement; WINDELS presents the competing positions rather than resolving them (§24).",
    };
  }
  if (isAllegation) {
    matched.push("allegation");
    return {
      category: "allegation",
      matchedPatterns: matched,
      explanation: "This is an accusation, not an established fact; it must be attributed and unverified until corroborated (§23).",
    };
  }
  if (isOpinion) {
    matched.push("opinion");
    return {
      category: "opinion",
      matchedPatterns: matched,
      explanation: "Value-laden language marks this as opinion, not fact (§23).",
    };
  }
  if (isCausal) {
    matched.push("historical_interpretation");
    return {
      category: "historical_interpretation",
      matchedPatterns: matched,
      explanation: "Causal claims about politics are interpretations requiring evidence; WINDELS presents the evidence and competing views rather than asserting the cause as fact.",
    };
  }
  if (isAnalytical) {
    matched.push("political_analysis");
    return {
      category: "political_analysis",
      matchedPatterns: matched,
      explanation: "This is conditional, evidence-based analysis rather than a bare fact (§23).",
    };
  }
  return {
    category: "verified_fact",
    matchedPatterns: [],
    explanation: "No opinion, allegation or propaganda markers detected; treat as a factual claim subject to the §22 source ladder for verification.",
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Question intent engine
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PoliticsQuestionClassification {
  intent: PoliticsQuestionIntent;
  confidence: number;
  matchedRules: string[];
  explanation: string;
}

const POLITICS_INTENT_PRIORITY: Record<Exclude<PoliticsQuestionIntent, "general">, number> = {
  current_office: 5,
  election: 4,
  leader: 4,
  constitution: 3,
  government_how: 3,
  comparison: 3,
  international: 2,
  ideology: 2,
  education: 2,
  country_history: 1,
};

const POLITICS_INTENT_RULES: Array<{ intent: Exclude<PoliticsQuestionIntent, "general">; patterns: RegExp[] }> = [
  {
    intent: "current_office",
    patterns: [
      /who is the current/, /\bcurrent (president|prime minister|chancellor|governor|minister|senator|mp)\b/,
      /who (is|are) (now|currently)/, /\bwho (governs|rules|leads) (now|today)\b/,
    ],
  },
  {
    intent: "election",
    patterns: [
      /\belection(s)?\b/, /\bvot(e|es|ing|ed)\b/, /\bballot\b/, /\bcandidates?\b/, /\bresults\b/, /\bturnout\b/, /\breferendum\b/,
    ],
  },
  {
    intent: "leader",
    patterns: [
      /\bpresidents?\b/, /\bprime ministers?\b/, /\bchancellors?\b/, /\bmonarchs?\b/, /\bheads? of state\b/,
      /\bheads? of government\b/, /\bwho (was|were|governed|ruled|led)\b/, /\bleaders?\b/, /\bgovernors?\b/, /\bsenators?\b/, /\bministers?\b/,
    ],
  },
  {
    intent: "constitution",
    patterns: [
      /\bconstitution(s|al)?\b/, /\bamendments?\b/, /\bseparation of powers\b/, /\bfederalism\b/, /\bterm limits?\b/,
    ],
  },
  {
    intent: "government_how",
    patterns: [
      /how does .* (work|function|operate)\b/, /\bhow (is|are) .* (elected|chosen|appointed)\b/, /\bsystem of government\b/,
      /\bsenate\b/, /\bparliament\b/, /\bcongress\b/, /\bnational assembly\b/, /\bcabinet\b/, /\bjudiciary\b/,
    ],
  },
  {
    intent: "comparison",
    patterns: [
      /\bvs\.?/, /\bversus\b/, /\bcompare\b/, /\bdifference between\b/, /\bsimilarities\b/, /\bcompared to\b/,
    ],
  },
  {
    intent: "international",
    patterns: [
      /\b(united nations|african union|european union|nato|asean|arab league|commonwealth|ecowas|sadc|eac|igad|g20|g7|brics)\b/,
      /\binternational\b/, /\btreat(y|ies)\b/, /\bdiplomatic\b/, /\bambassador\b/, /\bsanctions\b/,
    ],
  },
  {
    intent: "ideology",
    patterns: [
      /\bideolog(y|ies)\b/, /\bwhat is (socialism|communism|liberalism|conservatism|fascism|anarchism|nationalism|populism|marxism|social democracy|libertarianism)\b/,
      /\bleft[- ]wing\b/, /\bright[- ]wing\b/, /\bcenter[- ]?left\b/, /\bcenter[- ]?right\b/,
    ],
  },
  {
    intent: "education",
    patterns: [
      /teach me/, /\bquiz\b/, /\bexam(ination)?\b/, /\blesson\b/, /\bstudy\b/, /\blearn\b/, /\bexplain (democracy|presidential|parliamentary|federalism|elections|constitutions)\b/,
    ],
  },
  {
    intent: "country_history",
    patterns: [
      /\bhistory of\b/, /\btimeline\b/, /\bhistorical\b/, /\bcolonial\b/, /\bindependence\b/, /\bcivil war\b/, /\bcoup\b/, /\bpre-colonial\b/,
      /\btell me about\b/, /\bwhat happened\b/, /\btransition to democracy\b/,
    ],
  },
];

export function normalizePoliticsText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s'’]/g, " ").replace(/\s+/g, " ").trim();
}

/** Deterministic question classification. Same text → same result. */
export function classifyPoliticsQuestion(text: string): PoliticsQuestionClassification {
  const normalized = normalizePoliticsText(text);
  const scores = new Map<PoliticsQuestionIntent, number>();
  const matched: string[] = [];
  for (const rule of POLITICS_INTENT_RULES) {
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
      explanation: "No politics-question pattern matched; routed to general search rather than forced into a category.",
    };
  }
  let best: PoliticsQuestionIntent = "general";
  let bestScore = 0;
  for (const rule of POLITICS_INTENT_RULES) {
    const raw = scores.get(rule.intent) ?? 0;
    if (raw === 0) continue;
    const weighted = raw + POLITICS_INTENT_PRIORITY[rule.intent];
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
 * Entity records (§2–§17)
 * ──────────────────────────────────────────────────────────────────────────── */

export const PoliticsSourceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url().max(500).optional(),
  type: z.enum(POLITICS_SOURCE_TYPES).optional(),
  publishedAt: z.string().max(40).optional(),
  note: z.string().max(300).optional(),
});
export type PoliticsSource = z.infer<typeof PoliticsSourceSchema>;

/** §29 versioning metadata — every record carries these. */
export const VersionMetaSchema = z.object({
  created: z.string(),
  updated: z.string(),
  lastReviewed: z.string(),
  verification: z.enum(POLITICS_VERIFICATION),
  asOfDate: z.string().max(40).optional(),      // for current info: the date the info describes
  lastVerified: z.string().max(40).optional(),  // §21 "Last Verified" for current info
  conflictingSources: z.boolean().optional(),   // §22 conflicting-source indicator
});
export type VersionMeta = z.infer<typeof VersionMetaSchema>;

const baseRecord = {
  id: z.string().min(1).max(64),
  kind: z.enum(POLITICS_ENTITY_KINDS),
  name: z.string().min(1).max(200),
  altNames: z.array(z.string().min(1).max(100)).max(20).default([]),
  summary: z.string().min(1).max(3000),
  simple: z.string().min(1).max(2000),
  relatedIds: z.array(z.string().min(1).max(64)).max(40).default([]),
  sources: z.array(PoliticsSourceSchema).min(1).max(30),
  meta: VersionMetaSchema,
};

/** §2 country political profile (abridged to the essential fields; the
 *  history periods live in `historyPeriods`). */
export const CountryProfileSchema = z.object({
  ...baseRecord,
  kind: z.literal("country"),
  capital: z.string().min(1).max(120),
  governmentForm: z.enum(GOVERNMENT_FORMS),
  federalStructure: z.enum(["federal", "unitary", "confederal", "other"]),
  constitutionRef: z.string().max(64).optional(),
  independence: z.string().min(1).max(200),
  independenceYear: z.number().int().nullable().optional(),
  colonialPower: z.string().max(120).optional(),
  preColonial: z.string().min(1).max(3000),
  colonialHistory: z.string().max(4000).optional(),
  independenceStory: z.string().min(1).max(3000),
  modernHistory: z.string().min(1).max(4000),
  legislature: z.string().min(1).max(200),
  executive: z.string().min(1).max(200),
  judiciary: z.string().min(1).max(200),
  electoralSystem: z.string().min(1).max(1200),
  parties: z.array(z.string().min(1).max(100)).max(30).default([]),
  currentSituation: z.string().min(1).max(2000),
  historyPeriods: z.array(z.object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(120),
    dateLabel: z.string().min(1).max(120),
    year: z.number().int().nullable(),
    text: z.string().min(1).max(2000),
  })).max(20).default([]),
});
export type CountryProfile = z.infer<typeof CountryProfileSchema>;

/** §4/§5 leader record. */
export const LeaderRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("leader"),
  countryId: z.string().min(1).max(64),
  title: z.string().min(1).max(120),           // e.g. "President", "Prime Minister", "Military Head of State"
  titleKind: z.enum(OFFICE_TITLE_KINDS),
  role: z.enum(["head_of_state", "head_of_government", "both", "regional", "legislative", "ministerial", "other"]),
  party: z.string().max(120).optional(),       // party at the time of office
  born: z.string().max(120).optional(),
  officeStart: z.string().min(1).max(120),
  officeEnd: z.string().max(120).optional(),   // empty = current
  predecessor: z.string().max(120).optional(),
  successor: z.string().max(120).optional(),
  cameToOffice: z.string().min(1).max(1200),   // election / coup / succession
  majorPolicies: z.string().min(1).max(2000),
  achievements: z.string().min(1).max(2000),
  controversies: z.string().min(1).max(2000),
  majorEvents: z.string().min(1).max(2000),
  constitutionalRole: z.string().min(1).max(1500),
  historicalSignificance: z.string().min(1).max(2000),
  ordinal: z.number().int().min(1).optional(), // 1st, 2nd… president of the country
});
export type LeaderRecord = z.infer<typeof LeaderRecordSchema>;

/** §9 political party. */
export const PartyRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("party"),
  countryId: z.string().min(1).max(64),
  abbreviation: z.string().max(40).optional(),
  founded: z.string().min(1).max(120),
  founders: z.array(z.string().min(1).max(120)).max(10).default([]),
  selfDescription: z.string().min(1).max(1200),   // what the party calls itself
  academicClassification: z.string().min(1).max(1200), // how scholars classify it
  position: z.string().min(1).max(300),           // left/right/center WITH context
  majorLeaders: z.array(z.string().min(1).max(120)).max(20).default([]),
  historicalDevelopment: z.string().min(1).max(2500),
  electoralHistory: z.string().min(1).max(2000),
  currentStatus: z.string().min(1).max(1200),
  formerNames: z.array(z.string().min(1).max(120)).max(10).default([]),
  coalitions: z.string().max(1200).optional(),
  governmentParticipation: z.string().min(1).max(1500),
  historicalSignificance: z.string().min(1).max(2000),
});
export type PartyRecord = z.infer<typeof PartyRecordSchema>;

/** §10 election. */
export const ElectionRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("election"),
  countryId: z.string().min(1).max(64),
  electionType: z.string().min(1).max(120),     // presidential / parliamentary / legislative
  date: z.string().min(1).max(120),
  year: z.number().int(),
  turnout: z.string().max(200).optional(),
  winner: z.string().min(1).max(200),
  winnerParty: z.string().max(200).optional(),
  runnerUp: z.string().max(200).optional(),
  resultSummary: z.string().min(1).max(1500),   // vote totals/percentages per official sources
  electoralSystem: z.string().min(1).max(600),
  importance: z.string().min(1).max(2000),      // why it mattered historically
  disputes: z.string().max(1500).optional(),    // disputes / constitutional implications
  candidates: z.array(z.string().min(1).max(120)).max(20).default([]),
});
export type ElectionRecord = z.infer<typeof ElectionRecordSchema>;

/** §8 ministry. */
export const MinistryRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("ministry"),
  countryId: z.string().min(1).max(64),
  minister: z.string().min(1).max(200),
  appointmentDate: z.string().max(120).optional(),
  previousMinister: z.string().max(200).optional(),
  responsibilities: z.string().min(1).max(1500),
  majorPrograms: z.string().max(2000).optional(),
  historicalMinisters: z.array(z.string().min(1).max(200)).max(20).default([]),
  note: z.string().max(600).optional(),         // e.g. "ministry names differ between countries"
});
export type MinistryRecord = z.infer<typeof MinistryRecordSchema>;

/** §6/§7 governor / legislator (regional or legislative office). */
export const OfficeHolderRecordSchema = z.object({
  ...baseRecord,
  kind: z.union([z.literal("governor"), z.literal("legislator")]),
  countryId: z.string().min(1).max(64),
  office: z.string().min(1).max(200),           // "Governor of Lagos State", "Senator for Lagos West"
  officeKind: z.enum(["governor", "senator", "mp", "mayor", "premier", "chief_minister", "traditional_ruler", "other"]),
  jurisdiction: z.string().min(1).max(200),     // state / constituency / region
  party: z.string().max(200).optional(),
  term: z.string().min(1).max(200),
  cameToOffice: z.string().max(600).optional(),
  majorWork: z.string().max(2000).optional(),
});
export type OfficeHolderRecord = z.infer<typeof OfficeHolderRecordSchema>;

/** §11 constitution. */
export const ConstitutionRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("constitution"),
  countryId: z.string().min(1).max(64),
  adopted: z.string().min(1).max(200),
  previousConstitutions: z.array(z.string().min(1).max(200)).max(15).default([]),
  separationOfPowers: z.string().min(1).max(1500),
  executivePowers: z.string().min(1).max(1500),
  legislativePowers: z.string().min(1).max(1500),
  judicialPowers: z.string().min(1).max(1200),
  federalism: z.string().min(1).max(1200),
  electoralProvisions: z.string().min(1).max(1200),
  termLimits: z.string().min(1).max(800),
  emergencyPowers: z.string().min(1).max(800),
  successionRules: z.string().min(1).max(800),
  rightsFreedoms: z.string().min(1).max(1500),
  constitutionalCourt: z.string().min(1).max(800),
  amendments: z.array(z.string().min(1).max(300)).max(25).default([]),
  history: z.string().min(1).max(2500),
});
export type ConstitutionRecord = z.infer<typeof ConstitutionRecordSchema>;

/** §14 political movement. */
export const MovementRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("movement"),
  countryIds: z.array(z.string().min(1).max(64)).max(10).default([]),
  origin: z.string().min(1).max(1200),
  leaders: z.array(z.string().min(1).max(120)).max(20).default([]),
  goals: z.string().min(1).max(1500),
  historicalContext: z.string().min(1).max(2000),
  majorEvents: z.string().min(1).max(2500),
  governmentResponse: z.string().min(1).max(1500),
  outcome: z.string().min(1).max(2000),
  impact: z.string().min(1).max(2000),
});
export type MovementRecord = z.infer<typeof MovementRecordSchema>;

/** §13 ideology — taught academically, never advocated. */
export const IdeologyRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("ideology"),
  family: z.string().min(1).max(120),
  definition: z.string().min(1).max(2000),
  origins: z.string().min(1).max(2000),
  coreIdeas: z.string().min(1).max(2500),
  keyThinkers: z.array(z.string().min(1).max(120)).max(20).default([]),
  historicalRole: z.string().min(1).max(2500),
  variants: z.string().min(1).max(1500),
  criticism: z.string().min(1).max(1500),
  advocacyNote: z.string().min(1).max(500),   // "WINDELS teaches this academically; it does not advocate it."
});
export type IdeologyRecord = z.infer<typeof IdeologyRecordSchema>;

/** §16 international organization. */
export const InternationalOrgRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("international_organization"),
  founded: z.string().min(1).max(120),
  headquarters: z.string().min(1).max(200),
  membership: z.string().min(1).max(1200),
  purpose: z.string().min(1).max(2000),
  structure: z.string().min(1).max(1500),
  majorActivities: z.string().min(1).max(2000),
  achievements: z.string().min(1).max(2000),
  criticisms: z.string().min(1).max(1500),
  memberExamples: z.array(z.string().min(1).max(100)).max(20).default([]),
});
export type InternationalOrgRecord = z.infer<typeof InternationalOrgRecordSchema>;

/** §12 government form — educational. */
export const GovernmentFormRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("government_form"),
  definition: z.string().min(1).max(2000),
  howItWorks: z.string().min(1).max(2500),
  examples: z.array(z.string().min(1).max(120)).max(15).default([]),
  strengths: z.string().min(1).max(1500),
  weaknesses: z.string().min(1).max(1500),
  variants: z.string().max(1500).optional(),
});
export type GovernmentFormRecord = z.infer<typeof GovernmentFormRecordSchema>;

/** §15 political event (coups, transitions, crises…). */
export const PoliticalEventRecordSchema = z.object({
  ...baseRecord,
  kind: z.literal("event"),
  countryIds: z.array(z.string().min(1).max(64)).max(5).default([]),
  dateLabel: z.string().min(1).max(120),
  year: z.number().int().nullable(),
  eventType: z.string().min(1).max(120),       // coup / election / transition / crisis / reform / treaty / protest
  description: z.string().min(1).max(3000),
  keyFigures: z.array(z.string().min(1).max(120)).max(15).default([]),
  consequences: z.string().min(1).max(2000),
  nonViolenceNote: z.string().max(800).optional(), // §15: educational, no glorification
});
export type PoliticalEventRecord = z.infer<typeof PoliticalEventRecordSchema>;

/** §28/§29 update & versioning types. */
export const POLITICS_UPDATE_KINDS = [
  "leadership_change",
  "appointment",
  "resignation",
  "cabinet_change",
  "election_result",
  "legislative_change",
  "constitutional_change",
  "major_event",
  "correction",
] as const;
export type PoliticsUpdateKind = (typeof POLITICS_UPDATE_KINDS)[number];

export const POLITICS_UPDATE_STATUSES = ["pending_review", "applied", "rejected"] as const;
export type PoliticsUpdateStatus = (typeof POLITICS_UPDATE_STATUSES)[number];

export interface PoliticsChangeLogEntry {
  id: string;
  updateId: string;
  entityId: string;
  entityKind: PoliticsEntityKind;
  field: string;
  previousValue: string | null;
  newValue: string;
  effectiveDate: string;
  source: PoliticsSource;
  verification: PoliticsVerification;
  appliedAt: string;
  appliedBy: string;
}

export interface PoliticsUpdate {
  id: string;
  organizationId: string;
  submittedBy: string;
  kind: PoliticsUpdateKind;
  entityId: string;                 // the entity the update concerns (e.g. a country profile)
  entityKind: PoliticsEntityKind;
  title: string;
  changeSummary: string;
  field: string;                    // e.g. "currentSituation", "currentPresident"
  previousValue: string | null;
  newValue: string;
  effectiveDate: string;
  sources: PoliticsSource[];        // §22 ladder required
  verification: PoliticsVerification;
  status: PoliticsUpdateStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  appliedBy: string | null;
  changeLog: PoliticsChangeLogEntry | null; // set when applied
}

/** §31 quiz question. */
export interface PoliticsQuizQuestion {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export interface PoliticsQuiz {
  topicId: string;
  topicName: string;
  level: PoliticsLevel;
  questions: PoliticsQuizQuestion[];
  note: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Teaching engine (§25) — beginner → research
 * ──────────────────────────────────────────────────────────────────────────── */

const COUNTRY_SECTION_KEYS = [
  "summary", "simple", "preColonial", "colonialHistory", "independenceStory",
  "modernHistory", "legislature", "executive", "judiciary", "electoralSystem",
  "currentSituation",
] as const;

export function renderCountryAtLevel(record: CountryProfile, level: PoliticsLevel): Array<{ key: string; heading: string; body: string }> {
  const heading: Record<string, string> = {
    summary: "Overview",
    simple: "Simple explanation",
    preColonial: "Pre-colonial political history",
    colonialHistory: "Colonial period",
    independenceStory: "Independence & state formation",
    modernHistory: "Modern political history",
    legislature: "Legislature",
    executive: "Executive",
    judiciary: "Judiciary",
    electoralSystem: "Electoral system",
    currentSituation: "Current situation",
  };
  const include = (key: string): boolean => {
    switch (level) {
      case "beginner": return key === "simple" || key === "summary";
      case "intermediate": return ["summary", "preColonial", "independenceStory", "modernHistory", "currentSituation"].includes(key);
      case "advanced": return COUNTRY_SECTION_KEYS.filter((k) => k !== "simple").includes(key as any);
      case "research": return COUNTRY_SECTION_KEYS.includes(key as any);
      default: return true;
    }
  };
  const out: Array<{ key: string; heading: string; body: string }> = [];
  for (const key of COUNTRY_SECTION_KEYS) {
    if (!include(key)) continue;
    const body = (record as any)[key];
    if (body && String(body).trim().length > 0) {
      out.push({ key, heading: heading[key] ?? key, body: String(body) });
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Comparison engine (§24-neutral)
 * ──────────────────────────────────────────────────────────────────────────── */

export const COUNTRY_COMPARISON_CATEGORIES = [
  "government_form", "federal_structure", "head_of_state", "head_of_government",
  "legislature", "electoral_system", "constitution", "independence", "party_system", "current_situation",
] as const;
export type CountryComparisonCategory = (typeof COUNTRY_COMPARISON_CATEGORIES)[number];

export const COUNTRY_COMPARISON_LABELS: Record<CountryComparisonCategory, string> = {
  government_form: "Form of government",
  federal_structure: "Federal / unitary structure",
  head_of_state: "Head of state",
  head_of_government: "Head of government",
  legislature: "Legislature",
  electoral_system: "Electoral system",
  constitution: "Constitution",
  independence: "Independence / state formation",
  party_system: "Political party system",
  current_situation: "Current situation",
};

export interface CountryComparisonRow {
  category: CountryComparisonCategory;
  label: string;
  values: Array<{ id: string; name: string; text: string }>;
}

export interface CountryComparisonResult {
  items: Array<{ id: string; name: string; governmentForm: GovernmentForm }>;
  rows: CountryComparisonRow[];
  note: string;
}

export function compareCountries(records: CountryProfile[]): CountryComparisonResult {
  const field = (r: CountryProfile, c: CountryComparisonCategory): string => {
    switch (c) {
      case "government_form": return GOVERNMENT_FORM_LABELS[r.governmentForm];
      case "federal_structure": return r.federalStructure;
      case "head_of_state": return r.executive;
      case "head_of_government": return r.executive;
      case "legislature": return r.legislature;
      case "electoral_system": return r.electoralSystem;
      case "constitution": return r.constitutionRef ?? "See constitution record";
      case "independence": return r.independence;
      case "party_system": return r.parties.slice(0, 8).join(", ");
      case "current_situation": return r.currentSituation.slice(0, 300);
      default: return "";
    }
  };
  return {
    items: records.map((r) => ({ id: r.id, name: r.name, governmentForm: r.governmentForm })),
    rows: COUNTRY_COMPARISON_CATEGORIES.map((c) => ({
      category: c,
      label: COUNTRY_COMPARISON_LABELS[c],
      values: records.map((r) => ({ id: r.id, name: r.name, text: field(r, c) })),
    })),
    note: "This comparison presents each country's constitutional and institutional facts. WINDELS does not rank political systems or countries (§24).",
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * API input schemas
 * ──────────────────────────────────────────────────────────────────────────── */

export const PoliticsSearchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  kind: z.enum(POLITICS_ENTITY_KINDS).optional(),
  country: z.string().max(64).optional(),   // country id filter
  level: z.enum(POLITICS_LEVELS).default("intermediate"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PoliticsSearchQuery = z.input<typeof PoliticsSearchQuerySchema>;

export const PoliticsAskSchema = z.object({
  question: z.string().min(3).max(500),
  level: z.enum(POLITICS_LEVELS).default("intermediate"),
  limit: z.number().int().min(1).max(8).default(5),
});
export type PoliticsAskInput = z.input<typeof PoliticsAskSchema>;

export const PoliticsCompareSchema = z.object({
  countryIds: z.array(z.string().min(1).max(64)).min(2).max(6),
});
export type PoliticsCompareInput = z.input<typeof PoliticsCompareSchema>;

export const PoliticsQuizSchema = z.object({
  topicId: z.string().min(1).max(64),   // country id
  level: z.enum(POLITICS_LEVELS).default("intermediate"),
  count: z.number().int().min(3).max(10).default(5),
});
export type PoliticsQuizInput = z.input<typeof PoliticsQuizSchema>;

export const PoliticsClaimSchema = z.object({ text: z.string().min(1).max(500) });
export type PoliticsClaimInput = z.infer<typeof PoliticsClaimSchema>;

export const PoliticsUpdateCreateSchema = z.object({
  kind: z.enum(POLITICS_UPDATE_KINDS),
  entityId: z.string().min(1).max(64),
  entityKind: z.enum(POLITICS_ENTITY_KINDS),
  title: z.string().min(2).max(200),
  changeSummary: z.string().min(2).max(1000),
  field: z.string().min(1).max(80),
  previousValue: z.string().max(3000).nullable().optional(),
  newValue: z.string().min(1).max(3000),
  effectiveDate: z.string().min(1).max(40),
  sources: z.array(PoliticsSourceSchema).min(1).max(20),
  verification: z.enum(POLITICS_VERIFICATION).default("unverified"),
});
export type PoliticsUpdateCreateInput = z.input<typeof PoliticsUpdateCreateSchema>;

export const PoliticsUpdatesQuerySchema = z.object({
  status: z.enum(POLITICS_UPDATE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PoliticsUpdatesQuery = z.input<typeof PoliticsUpdatesQuerySchema>;

export const PoliticsUpdateReviewSchema = z.object({
  status: z.enum(["applied", "rejected"]),
  reviewNote: z.string().max(1000).optional(),
});
export type PoliticsUpdateReviewInput = z.input<typeof PoliticsUpdateReviewSchema>;
