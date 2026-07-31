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
