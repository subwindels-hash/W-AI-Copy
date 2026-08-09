/**
 * Shared types — Enterprise Foundation Architecture Stubs (Phase 36 / Session 37)
 *
 * Baseline stubs for the platform-wide systems every V8+ module plugs into.
 * Session 37 does NOT implement these systems — it only establishes the shared
 * interfaces and module status registry so later sessions can build on them.
 */

export type ModuleStatus = "stub" | "in-development" | "available";

export interface ArchitectureModule {
  id: string;
  name: string;
  description: string;
  status: ModuleStatus;
  introducedInSession: number;
  apis: string[];
  dependsOn: string[];
}

export interface ArchitectureStatus {
  monorepo: "windels-ai-os-pnpm-turborepo";
  deploymentTargets: string[];
  modules: ArchitectureModule[];
}

// Superintelligence / Synthetic layer stubs
export interface SuperintelligenceSignal {
  id: string;
  source: string;
  signal: string;
  confidence: number;
  at: string;
}

export interface EsiFeed {
  signals: SuperintelligenceSignal[];
  lastUpdated: string;
}

/** One measured section of a cross-portfolio ESI report. Values are read from
 *  the underlying module dashboards and reported with their provenance; a
 *  section whose source module is unavailable reports `available: false`
 *  rather than fabricating figures. */
export interface EsiPortfolioSection {
  key: string;
  label: string;
  available: boolean;
  /** When false, a plain-language reason (e.g. "benchmarks not yet run"). */
  note?: string;
  /** Real measured values from the source module (may be empty when unavailable). */
  metrics: Array<{ key: string; label: string; value: number | null }>;
}

export interface EsiPortfolioReport {
  generatedAt: string;
  /** Sections aggregated from real module dashboards. */
  sections: EsiPortfolioSection[];
  /** Deterministic strategic overview derived from the measured sections.
   *  `null` when no section produced a value — never an invented number. */
  overview: {
    healthyDomains: number | null;
    monitoredDomains: number;
    totalSignals: number;
  };
}
