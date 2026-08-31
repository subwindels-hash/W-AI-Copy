/** Session 181 — moduleRuntime web client alias
 * Re-exports the Module Center client module. The inventory expects
 * `apps/web/src/lib/moduleRuntime.ts` for the `moduleRuntime` module key, but
 * the implementation lives at `moduleCenter.ts` (the control plane), and that
 * module exports both clients.
 *
 * Do NOT add `export const moduleRuntimeApi = moduleCenterApi` here: it shadows
 * the re-exported runtime client with the control-plane client, which has no
 * `registrations()` — a latent bug that only shows up at the call site.
 */
export * from "./moduleCenter";
