/**
 * Shared types — Enterprise AI Kernel (Session 39).
 * Every module communicates through the Kernel rather than directly.
 */

export type KernelComponentStatus = "booting" | "online" | "degraded" | "offline" | "stub";

export interface KernelComponent {
  key: string; name: string; status: KernelComponentStatus;
  messageRate: number; errorRate: number; lastHeartbeat: string;
}
export interface KernelEvent {
  id: string; kind: string; source: string; target?: string;
  payload: Record<string, any>; at: string;
}
export interface KernelPolicyDecision {
  allowed: boolean; reason?: string; requiredApprovals: string[];
}
export interface KernelResourceGrant {
  cpuMillicores: number; memoryMb: number; gpuCards: number; ttlSeconds?: number;
}
export interface KernelDashboard {
  components: KernelComponent[];
  events24h: number;
  avgDispatchLatencyMs: number;
  policiesEvaluated24h: number;
  policiesBlocked24h: number;
  uptimeSeconds: number;
  selfHealed24h: number;
  modelSelections24h: number;
}
