/**
 * Session 77 — ChildSafetyReviewer.
 *
 * The spec makes this a hard requirement, twice:
 *
 *   77.3 Conventions — "Non-bypassable safety gates: `ChildSafetyReviewer` and
 *   prescription-workflow governance checks are implemented as pipeline steps
 *   that **block publish/execution**, not as advisory warnings."
 *
 * What shipped screened only `mediaFactory.generate()` — the generation prompt.
 * The S77B publishing path, which performs the actual upload to YouTube,
 * TikTok, Instagram, Facebook, X and Pinterest, never consulted it, so the gate
 * was bypassed by the ordinary publish route: any title/description/tags could
 * be queued for a real upload, including content `generate()` would have
 * refused and content that never went through `generate()` at all.
 *
 * This module is the single reviewer both paths call.
 *
 * SCOPE, HONESTLY STATED
 * ----------------------
 * This is a **keyword-and-phrase screen**, not a classifier. It catches overt
 * textual signals in the metadata a publisher supplies. It does not inspect
 * video or image content, and it cannot judge context or intent. It is a
 * blocking pre-filter, not a substitute for human review or a trained
 * moderation model — `reviewContent()` returns `requiresHumanReview` so callers
 * can route accordingly rather than treating a `pass` as a safety guarantee.
 */

/** Terms that block publication outright. Matched on word boundaries. */
const BLOCKING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:explicit|pornograph\w*|nsfw)\b/i, label: "explicit sexual content" },
  { pattern: /\b(?:gore|gory|mutilat\w*|dismember\w*)\b/i, label: "graphic gore" },
  { pattern: /\bviolen(?:ce|t)\b/i, label: "violent content" },
  { pattern: /\b(?:hate\s+speech|racial\s+slur\w*|ethnic\s+cleansing)\b/i, label: "hate speech" },
  { pattern: /\bself[-\s]?harm\b/i, label: "self-harm" },
  { pattern: /\bsuicide\s+(?:method|instruction|guide|how)\w*\b/i, label: "suicide instruction" },
  { pattern: /\b(?:child\s+abuse|csam|child\s+exploitation)\b/i, label: "child exploitation" },
  { pattern: /\b(?:abuse\s+footage|animal\s+cruelty)\b/i, label: "abuse footage" },
  { pattern: /\b(?:make|build|build\s+a)\s+(?:a\s+)?(?:bomb|explosive)\b/i, label: "weapons instruction" },
];

/**
 * Signals that the content targets children, which requires
 * age-appropriateness review rather than a block.
 */
const CHILD_AUDIENCE_PATTERNS: RegExp[] = [
  /\b(?:kids?|children|child|toddler\w*|preschool\w*|nursery)\b/i,
  /\bfor\s+(?:kids|children)\b/i,
  /\bage\s*(?:s)?\s*\d{1,2}\s*(?:-|to)\s*\d{1,2}\b/i,
];

export type ContentSafetyVerdict = "pass" | "child-review" | "blocked";

export interface ContentSafetyResult {
  verdict: ContentSafetyVerdict;
  /** Human-readable categories that triggered a block. Never echoes the matched text. */
  reasons: string[];
  /**
   * True when the reviewer wants a human to look. Set for child-targeted
   * content — a keyword screen cannot judge age-appropriateness.
   */
  requiresHumanReview: boolean;
}

/**
 * Screen the free-text a publisher supplies.
 *
 * Every field is screened, not just the title. The generation gate only ever
 * saw one prompt string; publishing carries title, description and tags, and
 * screening one of them would leave the other two as an open channel.
 */
export function reviewContent(fields: {
  title?: string;
  description?: string;
  tags?: string[];
}): ContentSafetyResult {
  const haystack = [
    fields.title ?? "",
    fields.description ?? "",
    ...(fields.tags ?? []),
  ].join("\n");

  const reasons: string[] = [];
  for (const { pattern, label } of BLOCKING_PATTERNS) {
    if (pattern.test(haystack) && !reasons.includes(label)) reasons.push(label);
  }
  if (reasons.length) {
    return { verdict: "blocked", reasons, requiresHumanReview: false };
  }

  const childTargeted = CHILD_AUDIENCE_PATTERNS.some((p) => p.test(haystack));
  if (childTargeted) {
    return { verdict: "child-review", reasons: ["child-targeted audience"], requiresHumanReview: true };
  }

  return { verdict: "pass", reasons: [], requiresHumanReview: false };
}
