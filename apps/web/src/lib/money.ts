/**
 * Money formatting for the repo-wide `*Cents` convention.
 *
 * Every monetary value crossing the API boundary is an **integer number of
 * minor units** (cents), matching the shared contracts in `erp`, `crm`,
 * `licensing`, `revenueGuardian` and `commerce`. Amounts are never floats:
 * 0.1 + 0.2 !== 0.3, and a fractional cent has no meaning on an invoice.
 *
 * Before this helper existed, three pages had each hand-rolled their own
 * `fmtCents`/`usd` and a fourth (commerce) rendered a bare `value / 100` on a
 * field that was not in cents at all — so a product priced at 9.99 displayed as
 * "$0.0999". Use these helpers instead of dividing by 100 inline.
 */

/** Format an integer cent amount as currency, e.g. 999 → "$9.99". */
export function formatCents(cents: number | null | undefined, currency = "USD", opts?: { maximumFractionDigits?: number }): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts?.maximumFractionDigits === 0 ? 0 : 2,
    maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
  }).format(cents / 100);
}

/** Format an integer cent amount with no minor units, e.g. 123456 → "$1,235". */
export function formatCentsCompact(cents: number | null | undefined, currency = "USD"): string {
  return formatCents(cents, currency, { maximumFractionDigits: 0 });
}

/**
 * Convert a user-typed major-unit string ("9.99") to integer cents (999).
 * Returns null when the input is not a valid non-negative amount, so callers
 * can reject rather than silently submit a wrong price.
 */
export function parseMajorUnitsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$,\s]/g, "");
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
