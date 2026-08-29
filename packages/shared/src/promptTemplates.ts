/**
 * Session 23 — Prompt Templates Library (completed by Session 119).
 *
 * Session 23 shipped five Prisma-backed endpoints under `/api/v1/prompt-templates`
 * with no shared contract at all: the API declared its own Zod schemas inside the
 * service file and the web client redeclared every shape by hand, so the two
 * sides could drift without a compiler noticing. Session 119 gives the module
 * its first contract and fixes the rendering defects that this file now makes
 * testable (see the helper docs below).
 *
 * Honesty rules observed by the new surface:
 *   - a template variable that is neither supplied nor defaulted is reported in
 *     `unresolved` — it is never silently presented as if the prompt were whole;
 *   - usage statistics come from the org-scoped event ledger (`pt:*` keys); a
 *     day with no recorded event is *absent* from `daily`, never a zero, and
 *     the payload says when the ledger began so pre-ledger days are not read as
 *     "zero use";
 *   - share/rate percentages are floored and `null` on an empty denominator;
 *   - lifetime `totalUses` comes from the database `usageCount` column (the
 *     durable counter), and the window counts from the Redis ledger — the two
 *     are never mixed into one number.
 */

import { z } from "zod";

/* ── Limits ─────────────────────────────────────────────────────────────── */

export const PROMPT_TEMPLATE_MAX_TITLE = 200;
export const PROMPT_TEMPLATE_MAX_DESCRIPTION = 500;
export const PROMPT_TEMPLATE_MAX_CONTENT = 20000;
export const PROMPT_TEMPLATE_MAX_CATEGORY = 40;
/** Icon length is counted in Unicode code points, not UTF-16 units: family
 *  emoji (👨‍👩‍👧‍👦) is 11 UTF-16 units but 4 code points, and Session 23's
 *  `.max(8)` rejected it as "too long" while accepting nothing it should not. */
export const PROMPT_TEMPLATE_MAX_ICON_CODEPOINTS = 8;
export const PROMPT_TEMPLATE_DEFAULT_CATEGORY = "general";
/** Categories the built-in library uses. Free-form categories remain allowed —
 *  this is a suggested list for pickers, not an enum enforced on storage. */
export const PROMPT_TEMPLATE_CATEGORIES = [
  "general",
  "coding",
  "writing",
  "creative",
  "analysis",
] as const;
export type PromptTemplateCategory = (typeof PROMPT_TEMPLATE_CATEGORIES)[number];

/** Upper bound the API accepts for `?limit=` on the list endpoint. */
export const PROMPT_TEMPLATE_MAX_LIST_LIMIT = 100;
/** The event ledger keeps at most this many recent use events per org. */
export const PROMPT_TEMPLATE_LEDGER_CAP = 500;
/** Day buckets expire this many days after their last recorded use, and the
 *  largest statistics window the API accepts is 90 days — so a live bucket is
 *  always readable for every window the API offers. */
export const PROMPT_TEMPLATE_DAY_BUCKET_TTL_DAYS = 92;
export const PROMPT_TEMPLATE_STATS_TOP_N = 5;
export const PROMPT_TEMPLATE_STATS_MAX_WINDOW_DAYS = 90;
export const PROMPT_TEMPLATE_STATS_DEFAULT_WINDOW_DAYS = 7;

/* ── Core types ─────────────────────────────────────────────────────────── */

/** A row of the `PromptTemplate` table, as returned by the API. */
export interface PromptTemplate {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  content: string;
  category: string;
  icon: string | null;
  createdById: string;
  isBuiltIn: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

const VAR_PATTERN = /\{\{\s*(\w+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

/**
 * Extract the variable names a template references, in first-appearance order,
 * deduplicated. Understands `{{name}}`, `{{ name }}`, `{{name|default}}` and
 * `{{ name | default }}` — the whitespace-around-the-pipe form is a Session 119
 * fix: Session 23's pattern did not match it, so the placeholder leaked into
 * the rendered prompt.
 */
export function extractTemplateVars(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  VAR_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_PATTERN.exec(content))) {
    const name = m[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Defaults declared in the template, keyed by variable name: for
 * `{{tone|professional}}` the entry is `{ tone: "professional" }`. A variable
 * without a default is absent, and a later placeholder re-declaring the same
 * variable keeps the first default (matching the renderer, which also resolves
 * in first-appearance order).
 */
export function extractTemplateDefaults(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  VAR_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_PATTERN.exec(content))) {
    const name = m[1]!;
    const def = m[2];
    if (def !== undefined && !(name in out)) out[name] = def;
  }
  return out;
}

/**
 * Render `content` against `vars` (the pure function the service calls).
 *
 * - `{{name}}` → `vars[name]` when supplied;
 * - `{{name|default}}` → `vars[name]` when supplied, else `default`;
 * - `{{name}}` with neither → `""` (Session 23's pinned behaviour) and the
 *   name is reported in `missing` so the caller can tell the user the prompt
 *   was not filled in. A prompt with a hole is not a complete prompt.
 * - `usedDefaults` lists the names that were filled from their default, so a
 *   caller can distinguish "the user typed it" from "the default was used".
 *
 * A placeholder that is not one of the recognised shapes (e.g. `{{ }}` or a
 * name containing spaces) is left in the text untouched and is not reported as
 * missing — the template itself is malformed and the raw text is the honest
 * output.
 */
export function renderPromptTemplate(
  content: string,
  vars: Record<string, string>,
): { rendered: string; missing: string[]; usedDefaults: string[] } {
  const missing: string[] = [];
  const usedDefaults: string[] = [];
  const seenMissing = new Set<string>();
  const seenDefaults = new Set<string>();
  const rendered = content.replace(VAR_PATTERN, (whole, key: string, def: string | undefined) => {
    const value = vars[key];
    if (value !== undefined) return value;
    if (def !== undefined) {
      if (!seenDefaults.has(key)) {
        seenDefaults.add(key);
        usedDefaults.push(key);
      }
      return def;
    }
    if (!seenMissing.has(key)) {
      seenMissing.add(key);
      missing.push(key);
    }
    return "";
  });
  return { rendered, missing, usedDefaults };
}

/* ── Statistics ─────────────────────────────────────────────────────────── */

/** One day's recorded usage in the window. Days without any recorded event do
 *  not appear — an absent day is not a measured zero. */
export interface PromptTemplateDailyUses {
  day: string; // YYYY-MM-DD (UTC)
  uses: number;
}

export interface PromptTemplateTopTemplate {
  templateId: string;
  /** `null` when the template has since been deleted — the ledger keeps the
   *  id and the count, but the title is gone and is not invented. */
  title: string | null;
  uses: number;
  /** ISO timestamp of the last recorded use, or null when the ledger has no
   *  recent entry for the id. */
  lastUsedAt: string | null;
}

export interface PromptTemplateStats {
  windowDays: number;
  generatedAt: string;
  // Database side (measured, durable).
  totalTemplates: number;
  builtInTemplates: number;
  userTemplates: number;
  /** Lifetime uses from the `usageCount` column — the durable counter. */
  totalUses: number;
  // Ledger side (best-effort event ledger, org-scoped `pt:*` keys).
  /** False when the ledger could not be read; every ledger field below is
   *  then empty/`null`, never a fabricated zero. */
  ledgerAvailable: boolean;
  /** ISO timestamp of the earliest recorded event, or null when the ledger
   *  has none. Days before this are *not* reported as zero-use days. */
  ledgerStart: string | null;
  /** Uses recorded inside the window (sum of the window's day buckets). */
  usesInWindow: number;
  /** Distinct days inside the window that have a recorded event. */
  distinctUseDays: number;
  /** Calendar days the ledger covers inside the window:
   *  max(ledgerStart day, window start) … today, inclusive. */
  ledgerCoveredDays: number;
  /** Uses per covered calendar day, floored to 2 decimals; `null` when the
   *  ledger covers no day of the window. */
  avgUsesPerDay: number | null;
  /** Most-used templates inside the window, descending. */
  topTemplates: PromptTemplateTopTemplate[];
  /** Most recently used templates, descending by last use. */
  recentTemplates: PromptTemplateTopTemplate[];
  daily: PromptTemplateDailyUses[];
  /** States what the numbers are, so the payload cannot be misread later. */
  note: string;
}

/* ── Zod schemas (API + web share one definition) ───────────────────────── */

/** Icon validation counts Unicode code points. `[...s].length` is the code
 *  point count; `s.length` counts UTF-16 units and rejects family/flag emoji
 *  that are a single glyph. */
const iconSchema = z
  .string()
  .refine((s) => [...s].length <= PROMPT_TEMPLATE_MAX_ICON_CODEPOINTS, {
    message: `Icon must be at most ${PROMPT_TEMPLATE_MAX_ICON_CODEPOINTS} characters`,
  });

export const PromptTemplateCreateSchema = z.object({
  title: z.string().trim().min(1).max(PROMPT_TEMPLATE_MAX_TITLE),
  description: z.string().trim().max(PROMPT_TEMPLATE_MAX_DESCRIPTION).optional(),
  content: z.string().min(1).max(PROMPT_TEMPLATE_MAX_CONTENT),
  category: z.string().trim().min(1).max(PROMPT_TEMPLATE_MAX_CATEGORY).default(PROMPT_TEMPLATE_DEFAULT_CATEGORY),
  icon: iconSchema.optional(),
});

export const PromptTemplateUpdateSchema = PromptTemplateCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const PromptTemplateIdParamSchema = z.object({ id: z.string().cuid() });

export const PromptTemplateListQuerySchema = z.object({
  category: z.string().trim().max(PROMPT_TEMPLATE_MAX_CATEGORY).optional(),
  /** Case-insensitive substring match over title/content/description. The
   *  console labels it as substring search; it is not relevance ranking. */
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(PROMPT_TEMPLATE_MAX_LIST_LIMIT).optional(),
});

export const PromptTemplateUseBodySchema = z.record(z.string()).default({});

export const PromptTemplateDuplicateSchema = z.object({
  title: z.string().trim().min(1).max(PROMPT_TEMPLATE_MAX_TITLE).optional(),
});

export const PromptTemplateStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(PROMPT_TEMPLATE_STATS_MAX_WINDOW_DAYS)
    .default(PROMPT_TEMPLATE_STATS_DEFAULT_WINDOW_DAYS),
});

export type PromptTemplateCreateInput = z.infer<typeof PromptTemplateCreateSchema>;
export type PromptTemplateUpdateInput = z.infer<typeof PromptTemplateUpdateSchema>;
export type PromptTemplateUseBody = z.infer<typeof PromptTemplateUseBodySchema>;
export type PromptTemplateDuplicateInput = z.infer<typeof PromptTemplateDuplicateSchema>;

/** Result of rendering a template with variables. `unresolved` lists the
 *  placeholders that had neither a value nor a default — Session 23 substituted
 *  an empty string silently; the field exists so the caller can surface the
 *  hole instead of shipping a prompt with a gap. */
export interface PromptTemplateUseResult {
  template: PromptTemplate;
  rendered: string;
  unresolved: string[];
}

/* ── Pure helpers ───────────────────────────────────────────────────────── */

/** Floored percentage share of `part` within `whole`. `null` when the
 *  denominator is not a positive finite number — an empty denominator is not
 *  a 0 % share. Never rounds: a share of 999/1000 reports 99, not 100. */
export function promptTemplateSharePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  const clamped = Math.min(Math.max(part, 0), whole);
  return Math.floor((clamped / whole) * 100);
}

/** Average floored to 2 decimals; `null` when `days <= 0`. */
export function promptTemplateAvgPerDay(uses: number, days: number): number | null {
  if (!Number.isFinite(uses) || !Number.isFinite(days) || days <= 0) return null;
  return Math.floor((uses / days) * 100) / 100;
}

/** UTC calendar day of a Date, as YYYY-MM-DD. Bucketing is done in UTC so a
 *  server clock/timezone choice cannot shift a use into another day. */
export function utcDayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC day string `days` calendar days before `today` (inclusive). */
export function utcDayBefore(today: Date, days: number): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - days);
  return utcDayOf(d);
}

/** Static note attached to every stats payload so its basis cannot be
 *  misread later. */
export const PROMPT_TEMPLATE_STATS_NOTE =
  "Window counts come from the org-scoped use-event ledger (pt:* keys), which began " +
  "recording when the usage surface shipped; days before ledgerStart are not reported " +
  "as zero. Lifetime totalUses comes from the database usageCount column. The ledger is " +
  "best-effort: a Redis outage empties it and sets ledgerAvailable=false; it never blocks " +
  "a template use.";
