/**
 * Architecture bootstrap (Session 37) — 11500ms slot
 * Registers baseline stubs for enterprise-scale modules that later sessions build.
 *
 * Session 193 — global bootstrap is now a no-op.
 *
 * Pre-S193 the bootstrap wrote global `arch:modules` keys (every tenant
 * shared the same architecture registry) and the cross-portfolio ESI
 * report hardcoded `"org-windels"` when reading the source modules
 * (every tenant saw org-windels' dashboard).
 *
 * Per-org architecture bootstrap now happens lazily on first read for a
 * given `oid`, with a one-shot adoption of the Session 37 global keys
 * into the org namespace. This function remains as a hook for the
 * server start so future per-org architecture registration can be
 * scheduled here. The legacy global keys are NOT removed: they are
 * left in place so a rollback is possible, and the new service adopts
 * them once per org via the `arch:imported:<org>` marker.
 */
export async function bootstrapArchitecture(logger?: any): Promise<void> {
  logger?.info?.("[architecture] bootstrap: per-org registration is lazy (no global write; see S193)");
}
