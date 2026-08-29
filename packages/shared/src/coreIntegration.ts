/**
 * Shared types — Session 45: Core Enterprise Integration Layer (checkpoint).
 *
 * Verifies wiring of Sessions 38–44 into platform-wide systems. Report is the
 * Digital Operations Center checkpoint; Session 46+ must not be enabled until
 * this checkpoint reports all critical links wired.
 */

export type CeilLinkStatus = "wired" | "stub" | "missing";

export interface CeilSystemLink {
  id: string;
  name: string;
  status: CeilLinkStatus;
  routesThrough: string[];
  evidence: string;
  notes?: string;
}

export interface CeilCheckpointReport {
  generatedAt: string;
  criticalPassed: boolean;
  wired: number;
  stubs: number;
  missing: number;
  links: CeilSystemLink[];
  kernelDispatchRoundtripMs: number;
  canProceedToSession46: boolean;
  blockers: string[];
}
