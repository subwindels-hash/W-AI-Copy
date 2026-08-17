/**
 * Hybrid Execution bootstrap (Session 43).
 *
 * Session 194 — global bootstrap is a no-op.
 *
 * Pre-S194 the bootstrap wrote global `hx:models` and `hx:nodes` keys
 * and called `dashboard()` with no org argument. S194 made every
 * method require `oid`; per-org seeding is now lazy on first read
 * (with a one-shot adoption of the S43 global keys into the org
 * namespace). This function remains as a hook for the server start
 * so future per-org bootstrap (e.g. catalogue installation) can be
 * scheduled here.
 */
export async function bootstrapHybridExec(logger?: any) {
  logger?.info?.("[hybrid-exec] bootstrap: per-org registration is lazy (no global write; see S194)");
}
