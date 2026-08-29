/**
 * Commerce Intent Engine (§3).
 *
 * Converts natural language into a structured intent:
 *
 *   "find me a black shoe under 50k"
 *     → { intent: "PRODUCT_SEARCH", query: "black shoe",
 *         filters: { color: "black", max_price: 50000, currency: "NGN" } }
 *
 * The intent layer decides WHAT the user wants. It never decides what products
 * exist, what they cost, or whether they are in stock — every one of those
 * facts comes from WMPC afterwards.
 *
 * Two paths, in order:
 *   1. Deterministic rules — fast, free, and auditable. Handles the common
 *      shapes (search, cart verbs, order/tracking, gift cards).
 *   2. The existing AI registry — only when the rules are not confident. There
 *      is no separate "AI brain": this reuses `aiRegistry.complete` with usage
 *      metering, exactly like every other AI feature in the platform.
 *
 * If the AI provider is unconfigured the engine returns the rules result (or
 * UNKNOWN) rather than failing — intent extraction degrades, commerce does not
 * break.
 */
import type { CommerceIntent, CommerceIntentFilters, CommerceIntentName } from "@windels/shared";
import { logger } from "../config/logger.js";

/** Confidence at or above which the rules result is used without the LLM. */
const RULES_CONFIDENCE_THRESHOLD = 0.75;

interface VerbRule {
  intent: CommerceIntentName;
  patterns: RegExp[];
  confidence: number;
}

/**
 * Ordered: the first match wins, so the most specific phrasings come first.
 * These are intent verbs only — nothing here knows about a product.
 */
const VERB_RULES: VerbRule[] = [
  { intent: "ORDER_TRACK", confidence: 0.95, patterns: [
    /\b(track|where is|status of)\b[^.?!]*\b(my |the )?(order|package|parcel|delivery|shipment)\b/i,
    /\bwhen will\b[^.?!]*\b(arrive|be delivered|get here)\b/i,
  ]},
  { intent: "ORDER_DETAIL", confidence: 0.85, patterns: [
    /\b(show|view|see|details? (of|for)|what.s in)\b[^.?!]*\border\b/i,
  ]},
  { intent: "ORDER_LIST", confidence: 0.9, patterns: [
    /\b(my|list|show|recent|previous|past)\s+orders?\b/i,
    /\bwhat have i (bought|ordered|purchased)\b/i,
    /\border history\b/i,
  ]},
  { intent: "PAYMENT_STATUS", confidence: 0.9, patterns: [
    /\b(payment|transaction)\s+(status|state|went through|succeed|success|fail)/i,
    /\b(did|has)\s+(my|the)\s+payment\b/i,
  ]},
  { intent: "PAYMENT_METHODS", confidence: 0.9, patterns: [
    /\b(payment|pay)\s+(methods?|options?)\b/i,
    /\bhow can i pay\b/i,
    /\bways? to pay\b/i,
  ]},
  { intent: "CHECKOUT_START", confidence: 0.92, patterns: [
    /\b(check ?out|place (my |the )?order|complete (my |the )?purchase|buy (it|them) now|proceed to pay)\b/i,
  ]},
  { intent: "CHECKOUT_STATUS", confidence: 0.85, patterns: [
    /\b(checkout|my purchase)\s+(status|progress)\b/i,
  ]},
  { intent: "CART_CLEAR", confidence: 0.93, patterns: [
    /\b(empty|clear|wipe)\b[^.?!]*\bcart\b/i,
    /\bremove everything\b/i,
  ]},
  { intent: "CART_REMOVE", confidence: 0.9, patterns: [
    /\b(remove|delete|take out|drop)\b[^.?!]*\b(from|out of)?\s*(my )?cart\b/i,
    /\bi don.t want (that|this|it) (any ?more)?\b/i,
  ]},
  { intent: "CART_UPDATE", confidence: 0.88, patterns: [
    /\b(change|update|set|make it)\b[^.?!]*\b(quantity|qty|amount|to \d+)\b/i,
  ]},
  { intent: "CART_ADD", confidence: 0.93, patterns: [
    /\badd\b[^.?!]*\b(to|into)\s+(my\s+)?(cart|basket|bag)\b/i,
    /\b(put|throw)\b[^.?!]*\bin (my )?(cart|basket)\b/i,
    /\bi.ll take (it|that|this|\d+)\b/i,
  ]},
  { intent: "CART_VIEW", confidence: 0.93, patterns: [
    /\b(show|view|see|what.s in|check)\b[^.?!]*\b(my )?(cart|basket|bag)\b/i,
    /\bmy cart\b/i,
  ]},
  { intent: "GIFT_CARD_APPLY", confidence: 0.92, patterns: [
    /\b(apply|use|redeem)\b[^.?!]*\b(gift ?card|voucher|coupon)\b/i,
  ]},
  { intent: "GIFT_CARD_VALIDATE", confidence: 0.9, patterns: [
    /\b(check|validate|verify|balance (of|on))\b[^.?!]*\b(gift ?card|voucher)\b/i,
  ]},
  { intent: "PRODUCT_COMPARE", confidence: 0.9, patterns: [
    /\bcompare\b/i,
    /\b(difference|differences)\s+between\b/i,
    /\bwhich (one )?is (better|cheaper|best)\b/i,
    /\b\w+\s+(vs\.?|versus)\s+\w+/i,
  ]},
  { intent: "RECOMMENDATION", confidence: 0.85, patterns: [
    /\b(recommend|suggest|what should i (buy|get)|any ideas|best .* for)\b/i,
    /\bsimilar to\b/i,
  ]},
  { intent: "SUPPORT", confidence: 0.88, patterns: [
    /\b(refund|return|complaint|damaged|broken|wrong item|missing|speak to (a )?(human|agent|person)|help me with (my )?order)\b/i,
  ]},
  { intent: "PRODUCT_DETAIL", confidence: 0.8, patterns: [
    /\b(tell me (more )?about|details? (of|for|on)|specs? (of|for)|more info)\b/i,
  ]},
  { intent: "PRODUCT_SEARCH", confidence: 0.85, patterns: [
    /\b(find|search|look(ing)? for|show me|do you have|i want|i need|shop for|browse|any)\b/i,
  ]},
];

/** Currency words → ISO code. Only affects the filter, never a price. */
const CURRENCY_WORDS: Array<{ re: RegExp; code: string }> = [
  { re: /\b(₦|naira|ngn)\b/i, code: "NGN" },
  { re: /\b(\$|dollars?|usd)\b/i, code: "USD" },
  { re: /\b(£|pounds?|gbp)\b/i, code: "GBP" },
  { re: /\b(€|euros?|eur)\b/i, code: "EUR" },
  { re: /\b(cedis?|ghs)\b/i, code: "GHS" },
  { re: /\b(rand|zar)\b/i, code: "ZAR" },
  { re: /\b(shillings?|kes)\b/i, code: "KES" },
];

const COLOR_WORDS = [
  "black", "white", "red", "blue", "green", "yellow", "brown", "grey", "gray",
  "silver", "gold", "pink", "purple", "orange", "beige", "navy", "cream",
];

/** Words to strip from the search query — they describe intent, not product. */
const STOPWORD_RE =
  /\b(please|kindly|can you|could you|i (want|need|would like)|find( me)?|search( for)?|look(ing)? for|show me|do you have|get me|shop for|browse|any|some|a|an|the|for|me|my|under|below|less than|over|above|more than|between|cheap(est)?|affordable|good|nice|best|new|available|in stock|around|about|approximately|that costs?|priced?|and|with)\b/gi;

/**
 * Parse a price token: "50k" → 50000, "1.2m" → 1200000, "45,000" → 45000.
 * Returns a MAJOR-unit number; the connector layer converts to minor units.
 */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s₦$£€]/g, "").toLowerCase();
  const m = /^(\d+(?:\.\d+)?)([km])?$/.exec(cleaned);
  if (!m) return null;
  const base = parseFloat(m[1]!);
  if (!isFinite(base)) return null;
  if (m[2] === "k") return Math.round(base * 1000);
  if (m[2] === "m") return Math.round(base * 1_000_000);
  return Math.round(base);
}

const AMOUNT = "(?:[₦$£€]\\s*)?\\d[\\d,\\.]*\\s*[km]?";

function extractFilters(text: string): CommerceIntentFilters {
  const filters: CommerceIntentFilters = {};

  // Price bounds. "between X and Y" first so it is not eaten by the others.
  const between = new RegExp(`\\bbetween\\s+(${AMOUNT})\\s+(?:and|to|-)\\s+(${AMOUNT})`, "i").exec(text);
  if (between) {
    const lo = parseAmount(between[1]!);
    const hi = parseAmount(between[2]!);
    if (lo !== null) filters.min_price = Math.min(lo, hi ?? lo);
    if (hi !== null) filters.max_price = Math.max(hi, lo ?? hi);
  } else {
    const under = new RegExp(`\\b(?:under|below|less than|cheaper than|max(?:imum)?|up to|not more than|within)\\s+(${AMOUNT})`, "i").exec(text);
    if (under) {
      const v = parseAmount(under[1]!);
      if (v !== null) filters.max_price = v;
    }
    const over = new RegExp(`\\b(?:over|above|more than|at least|min(?:imum)?|starting (?:at|from)|from)\\s+(${AMOUNT})`, "i").exec(text);
    if (over) {
      const v = parseAmount(over[1]!);
      if (v !== null) filters.min_price = v;
    }
  }

  if (filters.max_price !== undefined || filters.min_price !== undefined) {
    const cur = CURRENCY_WORDS.find((c) => c.re.test(text));
    // Default to NGN only when a bare number was given and no currency named.
    filters.currency = cur ? cur.code : "NGN";
  }

  const color = COLOR_WORDS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
  if (color) filters.color = color.toLowerCase();

  const size = /\bsize\s+(\d{1,2}(?:\.\d)?|xs|s|m|l|xl|xxl)\b/i.exec(text);
  if (size) filters.size = size[1]!.toLowerCase();

  const brand = /\b(?:by|from|brand)\s+([A-Z][\w-]+)/.exec(text);
  if (brand) filters.brand = brand[1]!;

  const condition = /\b(brand ?new|new|used|refurbished|pre-?owned)\b/i.exec(text);
  if (condition) filters.condition = condition[1]!.toLowerCase().replace(/\s+/g, "");

  return filters;
}

/** Strip intent words and filter phrases, leaving the product terms. */
function extractQuery(text: string): string {
  let q = text;
  q = q.replace(new RegExp(`\\b(?:under|below|less than|cheaper than|over|above|more than|at least|up to|between|max(?:imum)?|min(?:imum)?|within|from|starting (?:at|from))\\s+${AMOUNT}(?:\\s+(?:and|to)\\s+${AMOUNT})?`, "gi"), " ");
  q = q.replace(/\b(?:add|put|throw)\b.*?\b(?:to|into|in)\s+(?:my\s+)?(?:cart|basket|bag)\b/gi, (m) =>
    m.replace(/\b(?:add|put|throw)\b/gi, " ").replace(/\b(?:to|into|in)\s+(?:my\s+)?(?:cart|basket|bag)\b/gi, " "));
  q = q.replace(/\b(?:to|into|in)\s+(?:my\s+)?(?:cart|basket|bag)\b/gi, " ");
  q = q.replace(/\bsize\s+(?:\d{1,2}(?:\.\d)?|xs|s|m|l|xl|xxl)\b/gi, " ");
  q = q.replace(STOPWORD_RE, " ");
  q = q.replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
  return q;
}

/** Leading quantity: "add 2 black shoes" → 2. */
function extractQuantity(text: string): number | undefined {
  const m = /\b(?:add|buy|take|order|want|need|get)\s+(\d{1,3})\b/i.exec(text)
    || /\b(\d{1,3})\s+(?:of\s+)?(?:them|these|those|units?|pieces?|pcs)\b/i.exec(text);
  if (m) {
    const n = parseInt(m[1]!, 10);
    if (n >= 1 && n <= 999) return n;
  }
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const w = /\b(?:add|buy|take|order|want|need|get)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(text);
  if (w) return words[w[1]!.toLowerCase()];
  return undefined;
}

/** Ids the user referred to directly (WMPC ids or order references). */
function extractTargets(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(WMPC-[A-Z0-9-]{4,})\b/gi)) out.add(m[1]!.toUpperCase());
  for (const m of text.matchAll(/\border\s+#?([A-Z0-9][A-Z0-9-]{5,})\b/gi)) out.add(m[1]!.toUpperCase());
  return [...out];
}

function ruleBasedIntent(text: string): CommerceIntent {
  const targets = extractTargets(text);
  const filters = extractFilters(text);
  const quantity = extractQuantity(text);

  for (const rule of VERB_RULES) {
    if (!rule.patterns.some((re) => re.test(text))) continue;

    // A "search" phrasing with no product terms left is really a cart view etc.
    const query = extractQuery(text);
    const needsQuery = rule.intent === "PRODUCT_SEARCH" || rule.intent === "RECOMMENDATION";
    if (needsQuery && !query && !Object.keys(filters).length) continue;

    return {
      intent: rule.intent,
      ...(query ? { query } : {}),
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(targets.length ? { targets } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      confidence: rule.confidence,
      source: "rules",
      rawText: text,
    };
  }

  // Bare product-ish phrase with a price filter is still a search.
  const query = extractQuery(text);
  if (query && (Object.keys(filters).length > 0 || query.split(/\s+/).length <= 6)) {
    return {
      intent: "PRODUCT_SEARCH",
      query,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(targets.length ? { targets } : {}),
      confidence: 0.55,
      source: "rules",
      rawText: text,
    };
  }

  return { intent: "UNKNOWN", confidence: 0, source: "rules", rawText: text };
}

const LLM_SYSTEM_PROMPT = `You classify shopping messages into a structured intent for a marketplace assistant.

Reply with ONLY a JSON object, no prose, no code fences:
{"intent": "<INTENT>", "query": "<product terms only, or omit>", "filters": {...}, "quantity": <number or omit>, "confidence": <0..1>}

Valid intents: PRODUCT_SEARCH, PRODUCT_DETAIL, PRODUCT_COMPARE, RECOMMENDATION, IMAGE_SEARCH, CART_VIEW, CART_ADD, CART_UPDATE, CART_REMOVE, CART_CLEAR, CHECKOUT_START, CHECKOUT_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, ORDER_LIST, ORDER_DETAIL, ORDER_TRACK, GIFT_CARD_VALIDATE, GIFT_CARD_APPLY, SUPPORT, UNKNOWN.

Filter keys you may use: category, brand, color, size, min_price, max_price, currency, condition, vendor.
Prices are plain numbers in major units (50000, not "50k" and not minor units).

Rules:
- Classify the request only. NEVER invent products, prices, stock or availability.
- "query" holds product words only, with intent words like "find me" removed.
- Use UNKNOWN when the message is not about shopping.`;

async function llmIntent(text: string, meta: { userId?: string; organizationId?: string }): Promise<CommerceIntent | null> {
  try {
    const { aiRegistry } = await import("../services/ai/registry.js");
    const result = await aiRegistry.complete(
      {
        model: "",
        messages: [
          { role: "system", content: LLM_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0,
        maxTokens: 300,
      } as any,
      {
        ...(meta.userId ? { userId: meta.userId } : {}),
        ...(meta.organizationId ? { organizationId: meta.organizationId } : {}),
        channel: "api",
        feature: "commerce.intent",
      },
    );

    const raw = String((result as any)?.content ?? "").trim();
    const json = /\{[\s\S]*\}/.exec(raw);
    if (!json) return null;
    const parsed = JSON.parse(json[0]) as Partial<CommerceIntent> & { intent?: string };

    const VALID: CommerceIntentName[] = [
      "PRODUCT_SEARCH", "PRODUCT_DETAIL", "PRODUCT_COMPARE", "RECOMMENDATION", "IMAGE_SEARCH",
      "CART_VIEW", "CART_ADD", "CART_UPDATE", "CART_REMOVE", "CART_CLEAR",
      "CHECKOUT_START", "CHECKOUT_STATUS", "PAYMENT_METHODS", "PAYMENT_STATUS",
      "ORDER_LIST", "ORDER_DETAIL", "ORDER_TRACK", "GIFT_CARD_VALIDATE", "GIFT_CARD_APPLY",
      "SUPPORT", "UNKNOWN",
    ];
    const intent = VALID.find((v) => v === parsed.intent);
    if (!intent) return null;

    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7;

    return {
      intent,
      ...(parsed.query ? { query: String(parsed.query).trim() } : {}),
      ...(parsed.filters && typeof parsed.filters === "object" ? { filters: parsed.filters as CommerceIntentFilters } : {}),
      ...(typeof parsed.quantity === "number" ? { quantity: parsed.quantity } : {}),
      ...(extractTargets(text).length ? { targets: extractTargets(text) } : {}),
      confidence,
      source: "llm",
      rawText: text,
    };
  } catch (err) {
    // AI unconfigured or failed: fall back to rules. Never fabricate an intent.
    logger.debug("[aiCommerce] LLM intent extraction unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const commerceIntentService = {
  /** Deterministic path only — exposed for tests and for offline classification. */
  interpretWithRules(text: string): CommerceIntent {
    return ruleBasedIntent(text);
  },

  /**
   * Full extraction: rules first, LLM only when the rules are unsure.
   * Never throws — an unclassifiable message returns UNKNOWN.
   */
  async interpret(
    text: string,
    meta: { userId?: string; organizationId?: string } = {},
  ): Promise<CommerceIntent> {
    const trimmed = (text || "").trim();
    if (!trimmed) return { intent: "UNKNOWN", confidence: 0, source: "rules", rawText: text };

    const rules = ruleBasedIntent(trimmed);
    if (rules.confidence >= RULES_CONFIDENCE_THRESHOLD) return rules;

    const llm = await llmIntent(trimmed, meta);
    if (llm && llm.confidence >= rules.confidence) return llm;
    return rules;
  },
};

export default commerceIntentService;
