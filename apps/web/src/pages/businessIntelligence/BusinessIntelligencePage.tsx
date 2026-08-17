/** Session 182 — Tier 4 businessIntelligence console alias
 * The inventory's Tier 4 list reports "74 of 125 modules have no page" because
 * it checks `apps/web/src/pages/<moduleKey>/` but this module's console lives
 * at `pages/bi/BusinessIntelligencePage.tsx` (short name). This alias makes
 * the scanner's expected path exist without forking the UI.
 */
export { default } from "../bi/BusinessIntelligencePage";
export * from "../bi/BusinessIntelligencePage";
