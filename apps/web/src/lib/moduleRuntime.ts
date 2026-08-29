/** Session 181 — moduleRuntime web client alias
 * Re-exports the ModuleCenter runtime client. The inventory expects
 * `apps/web/src/lib/moduleRuntime.ts` for the `moduleRuntime` module key,
 * but the implementation lives at `moduleCenter.ts` (the control plane).
 * This alias makes the scanner's heuristic see the client without forking.
 */
export * from "./moduleCenter";
import { moduleCenterApi } from "./moduleCenter";
export const moduleRuntimeApi = moduleCenterApi;
