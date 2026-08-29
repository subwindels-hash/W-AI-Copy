/**
 * Shared types — Session 76: Final Enterprise Integration & Validation.
 *
 * Aggregates module wiring status for the cross-system integration checklist.
 * Session 76 runs after 37–75 and reports wiring status of every system to the
 * Digital Operations Center. It does NOT add new business capabilities — it
 * validates that everything already built is wired through the Kernel/AIO Bus
 * and that there are no duplicate parallel systems.
 */

export type V76SystemKey =
  | "esi" | "si" | "kernel" | "god-node" | "memory" | "knowledge-graph"
  | "ai-workforce" | "digital-twin" | "simulation" | "security" | "governance"
  | "analytics" | "marketplace" | "developer" | "notification" | "identity"
  | "api-gateway" | "aio-bus" | "trust-center" | "mission-control" | "health-ecosystem"
  | "self-hosted" | "voice-studio" | "voice-foundry" | "trading-intel"
  | "desktop" | "mobile" | "web" | "cloud" | "edge" | "airgap" | "offline"
  | "wearables" | "federated";

export type V76Status = "wired" | "stub" | "missing";

export interface V76SystemStatus {
  key: V76SystemKey;
  name: string;
  status: V76Status;
  routesThroughKernel: boolean;
  notes: string;
  duplicateOf?: string;
}

export interface V76ValidationReport {
  generatedAt: string;
  totalSystems: number;
  wired: number;
  stubs: number;
  missing: number;
  duplicatesDetected: number;
  consentGateEnforced: boolean;
  governanceGateEnforced: boolean;
  systems: V76SystemStatus[];
  checklist: { item: string; passed: boolean; detail: string }[];
}
