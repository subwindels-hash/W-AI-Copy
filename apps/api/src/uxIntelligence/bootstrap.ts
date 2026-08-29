/**
 * Session 192 — global bootstrap is a no-op.
 *
 * Prior to S192 the bootstrap wrote global `ux:tokens`, `ux:components`,
 * `ux:brands`, `ux:agents`, and `ux:findings` keys plus a hardcoded sample
 * finding, and the dashboard hardcoded `agentsOnline: 3` / `accessibilityOpen: 1`.
 * Both made the per-tenant dashboard a lie on a fresh org.
 *
 * Per-org bootstrap now runs lazily on first read (and stays gated behind
 * `WINDELS_DEMO_DATA`). This function remains as a hook for the server
 * start so future per-org bootstrap (e.g. catalog installation) can be
 * scheduled here.
 */
import { UxIntelligenceService as Ux } from "./uxIntelligence.service.js";
export async function bootstrapUxIntelligence(logger?: any) {
  logger?.info?.("[ux-intelligence] bootstrap: per-org bootstrap is lazy (no global write; see S192)");
  // Calling with no oid is a no-op that documents the gate state.
  await Ux.ensureBootstrapped(logger);
}
