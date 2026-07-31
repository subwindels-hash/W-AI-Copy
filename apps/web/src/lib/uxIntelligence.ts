/**
 * Session 78 — UX Intelligence, Design System & Experience API client.
 */
import { api } from "./api";
import type { UxDashboard, UxToken, UxComponent, UxAccessibilityFinding, UxAgent, UxBrandProfile } from "@windels/shared";
export type { UxDashboard, UxToken, UxComponent, UxAccessibilityFinding, UxAgent, UxBrandProfile } from "@windels/shared";

export const uxApi = {
  dashboard: () => api<UxDashboard>("/ux-intelligence/dashboard/rollup"),
  tokens: () => api<UxToken[]>("/ux-intelligence/tokens"),
  components: () => api<UxComponent[]>("/ux-intelligence/components"),
  findings: () => api<UxAccessibilityFinding[]>("/ux-intelligence/findings"),
  agents: () => api<UxAgent[]>("/ux-intelligence/agents"),
  brands: () => api<UxBrandProfile[]>("/ux-intelligence/brands"),
  devices: () => api<string[]>("/ux-intelligence/devices"),
  runQa: (scope: string = "all") => api<UxAccessibilityFinding[]>("/ux-intelligence/qa/run", { method: "POST", json: { scope } }),
};
