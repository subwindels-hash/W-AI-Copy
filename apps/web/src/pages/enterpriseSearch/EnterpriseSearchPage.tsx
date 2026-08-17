/** Session 183 — Tier 4 enterpriseSearch console alias
 * The console lives at `pages/search/EnterpriseSearchPage.tsx` (`/app/search`),
 * not at `pages/enterpriseSearch/`. This alias makes the Tier 4 filesystem
 * check see a page directory without forking the UI.
 */
export { EnterpriseSearchPage as default, EnterpriseSearchPage } from "../search/EnterpriseSearchPage";
