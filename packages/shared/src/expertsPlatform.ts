/**
 * Shared types — Session 77 (Part A): Enterprise Professional Intelligence Platform.
 *
 * Expert agents (gov/healthcare/pharmacy/engineering/legal), lecturer AI with
 * course library, and marketplace expert packages. All agents extend a single
 * ExpertAgent contract so they register uniformly with the AI Workforce Platform
 * and God-Node Orchestrator.
 */

export type EpExpertDomain = "government" | "healthcare" | "pharmacy" | "engineering" | "legal" | "lecturer";
export type EpDisclaimer = "informational-not-official-advice" | "educational-only" | "consult-professional";

export interface EpExpertAgent {
  id: string;
  name: string;
  domain: EpExpertDomain;
  specialization: string;
  status: "online" | "training" | "paused";
  disclaimer: EpDisclaimer;
  queries24h: number;
  accuracyScore: number;
  lastHeartbeat: string;
}

export interface EpCourse {
  id: string;
  title: string;
  author: string;
  language: string;
  level: "beginner" | "intermediate" | "advanced";
  lessons: number;
  enrolled: number;
  rating: number;
}

export interface EpExpertPackage {
  id: string;
  name: string;
  domain: EpExpertDomain;
  description: string;
  sizeMb: number;
  premium: boolean;
  installed: boolean;
  author: string;
}

export interface EpDashboard {
  experts: number;
  expertsOnline: number;
  courses: number;
  packages: number;
  queries24h: number;
  disclaimerEnforced: boolean;
}

/**
 * Result of asking a domain expert agent a question.
 *
 * Modelled as a discriminated union on `available` so a caller cannot read an
 * `answer` that was never produced. The endpoint previously returned a
 * hardcoded placeholder string in the answer slot; for the healthcare,
 * pharmacy and legal domains this platform serves, an absent answer must be
 * unmistakably absent rather than plausible-looking prose.
 *
 * `disclaimer` is present on both arms: a refusal still carries the expert's
 * consult-a-professional labelling.
 */
export type EpExpertQueryUnavailableReason =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_ERROR"
  | "AI_EMPTY_RESPONSE"
  | "EXPERT_UNAVAILABLE";

export interface EpExpertAnswer {
  expertId: string;
  disclaimer: EpDisclaimer;
  available: true;
  answer: string;
  modelSource: "real" | "demo-ai";
}

export interface EpExpertNoAnswer {
  expertId: string;
  disclaimer: EpDisclaimer;
  available: false;
  reason: EpExpertQueryUnavailableReason;
  /** Human-readable explanation of why no answer was produced. */
  message: string;
  answer?: undefined;
}

export type EpExpertQueryResult = EpExpertAnswer | EpExpertNoAnswer;
