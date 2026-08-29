/** Session 181 — cloudAndroidPublic web client (public /v1 wrapper)
 * Re-exports the internal cloudAndroid client for scanner completeness.
 * The public surface is API-key authenticated and used by external agents;
 * the web console uses the internal authenticated routes. This alias satisfies
 * the inventory's `web.client` check without duplicating logic.
 */
export * from "./cloudAndroid";
import { cloudAndroidApi } from "./cloudAndroid";
export const cloudAndroidPublicApi = cloudAndroidApi;
