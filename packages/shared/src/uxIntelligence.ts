/**
 * Shared types — Session 78: UI/UX Intelligence, Design System & Experience.
 *
 * Central UX Intelligence Engine that governs interface quality, a canonical
 * component registry, tokens, themes, accessibility (WCAG), responsive
 * profiles, brand identity, and AI designer/researcher/QA agents extending
 * the Session 77 ExpertAgent contract.
 */

export type UxDeviceClass = "desktop" | "tablet" | "mobile" | "foldable" | "tv" | "watch" | "automotive" | "kiosk" | "xr";

export interface UxToken {
  namespace: "color" | "typography" | "spacing" | "motion" | "breakpoint" | "radius" | "shadow";
  name: string;
  value: string;
  lastUpdated: string;
}

export interface UxComponent {
  id: string;
  name: string;
  category: "layout" | "input" | "display" | "feedback" | "navigation" | "data";
  sourcePath: string;        // pointer to existing Shadcn/Tailwind component; never duplicated
  wcagAA: boolean;
  version: string;
}

export interface UxAccessibilityFinding {
  id: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  wcagRef: string;
  component: string;
  detail: string;
  fixed: boolean;
}

export interface UxAgent {
  id: string;
  name: string;
  role: "designer" | "researcher" | "qa";
  status: "online" | "idle";
  reviews24h: number;
}

export interface UxBrandProfile {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  font: string;
  logoUrl?: string;
}

export interface UxDashboard {
  components: number;
  tokens: number;
  brands: number;
  agentsOnline: number;
  accessibilityOpen: number;
  deviceClasses: number;
  designGateActive: boolean;
}
