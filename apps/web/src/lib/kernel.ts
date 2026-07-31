/**
 * Session 39 — Enterprise AI Kernel API client.
 * Every module communicates through the Kernel from Session 39 onward.
 */
import { api } from "./api";
import type { KernelComponent, KernelEvent, KernelPolicyDecision, KernelResourceGrant, KernelDashboard } from "@windels/shared";
export type { KernelComponent, KernelEvent, KernelPolicyDecision, KernelResourceGrant, KernelDashboard } from "@windels/shared";


export const krApi = {
  dashboard: () => api<KernelDashboard>("/kernel/status"),
  components: () => api<KernelComponent[]>("/kernel/components"),
  dispatch: (input: { kind: string; source: string; target?: string; payload?: Record<string, any> }) =>
    api<KernelEvent>("/kernel/dispatch", { method: "POST", json: input }),
  events: () => api<KernelEvent[]>("/kernel/events"),
  evaluatePolicy: (input: any) => api<KernelPolicyDecision>("/kernel/policy/evaluate", { method: "POST", json: input }),
  grantResources: (input: { priority: "interactive" | "batch"; gpuCards?: number }) =>
    api<KernelResourceGrant>("/kernel/resources/grant", { method: "POST", json: input }),
  selectModel: (task = "chat") => api<{ modelId: string; via: string }>("/kernel/model/select", { method: "POST", json: { task } }),
  runDiagnostics: () => api<{ healthy: boolean; degraded: string[] }>("/kernel/diagnostics/run", { method: "POST" }),
};
