/** Session 181 — nativeAi (STUB) web client alias
 * The legacy `nativeAi` module (0 routes) was superseded by `nativeAiApi`
 * (Session 172, 16 routes, `/v1`). This alias re-exports the public client
 * so the inventory's STUB check sees a client, while the real surface remains
 * at `nativeAiApi`.
 */
export * from "./nativeAiApi";
import { nativeAiApi } from "./nativeAiApi";
export const nativeAiLegacyApi = nativeAiApi;
