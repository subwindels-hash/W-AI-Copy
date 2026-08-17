/** Session 181 — cloudAndroidPublic console alias
 * The public /v1/cloud-android surface is API-key authenticated for external
 * agents. The web console uses the internal authenticated routes at
 * /cloud-android/* (see `lib/cloudAndroid.ts` and `pages/cloudAndroid/`).
 * This alias satisfies the inventory's `web.pages` heuristic without forking
 * the UI — it re-exports the internal console.
 */
export { CloudAndroidPage as default } from "../cloudAndroid/CloudAndroidPage";
export { CloudAndroidPage } from "../cloudAndroid/CloudAndroidPage";
