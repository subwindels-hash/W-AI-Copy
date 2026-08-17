/** Session 186 — Tier 4 mediaFactory console alias
 * The Autonomous AI Media/Content Factory console lives at
 * `pages/media/MediaFactoryPage.tsx` (`/app/media`, `mfApi`), not at
 * `pages/mediaFactory/`. This alias makes the Tier 4 filesystem check see
 * a page directory without forking the UI.
 */
export { default } from "../media/MediaFactoryPage";
export * from "../media/MediaFactoryPage";
