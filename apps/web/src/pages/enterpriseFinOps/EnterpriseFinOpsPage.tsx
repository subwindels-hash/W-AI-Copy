/** Session 184 — Tier 4 enterpriseFinOps console alias
 * The console lives at `pages/finops/EnterpriseFinOpsPage.tsx` (`/app/finops`),
 * not at `pages/enterpriseFinOps/`. This alias makes the Tier 4 filesystem
 * check see a page directory without forking the UI.
 */
export { EnterpriseFinOpsPage as default, EnterpriseFinOpsPage } from "../finops/EnterpriseFinOpsPage";
