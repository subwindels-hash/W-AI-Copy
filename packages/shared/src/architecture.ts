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
