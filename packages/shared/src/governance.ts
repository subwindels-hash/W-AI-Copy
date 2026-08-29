/**
 * Session 23 — Engineering Governance shared types (Phase 22, Slices 193–198).
 */

// ─── Slice 193: Coding Standards ────────────────────────────────
export type StandardSeverity = "required" | "recommended" | "optional";

export interface CodingStandard {
  id: string;
  category: "typescript" | "react" | "node" | "styling" | "testing" | "security" | "accessibility" | "performance" | "general";
  title: string;
  description: string;
  rule: string;            // e.g. "no-explicit-any", "prefer-const"
  severity: StandardSeverity;
  examples?: { good?: string; bad?: string };
  enabled: boolean;
}

// ─── Slice 194: Repository Standards ────────────────────────────
export interface RepoStandard {
  id: string;
  area: "branching" | "commits" | "prs" | "ci" | "secrets" | "licensing" | "documentation" | "structure";
  title: string;
  description: string;
  enforced: boolean;      // true if enforced by tooling
  tooling?: string;       // e.g. "commitlint", "branch-protection"
}

// ─── Slice 195: Architecture Decision Records ───────────────────
// ADRStatus is already declared in enterprise.ts — re-use via re-export below
// to avoid duplicate-identifier errors at barrel compile.
export type { ADRStatus } from "./enterprise.js";

export interface ADR {
  id: string;
  number: number;
  title: string;
  status: import("./enterprise.js").ADRStatus;
  context: string;
  decision: string;
  consequences: string;
  authors: string[];
  date: string;            // ISO
  supersededBy?: string;   // ADR id
  tags: string[];
}

// ─── Slice 196: Code Reviews ────────────────────────────────────
export type ReviewStatus = "open" | "approved" | "changes_requested" | "merged";

export interface ReviewChecklistItem {
  id: string;
  text: string;
  category: "correctness" | "security" | "tests" | "style" | "performance" | "docs";
  required: boolean;
}

export interface CodeReview {
  id: string;
  title: string;
  author: string;
  reviewer?: string;
  status: ReviewStatus;
  prUrl?: string;
  checklist: ReviewChecklistItem[];
  comments: number;
  filesChanged: number;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
}

export interface ReviewMetrics {
  openReviews: number;
  avgReviewHours: number;
  mergedThisWeek: number;
  approvalRate: number;
  avgCommentsPerPr: number;
}

// ─── Slice 197: Dependency Management ──────────────────────────
export type DepSeverityCve = "none" | "low" | "medium" | "high" | "critical";

export interface Dependency {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion?: string;
  wantedVersion?: string;
  outdated: boolean;
  vulnerability: DepSeverityCve;
  advisoryCount: number;
  type: "production" | "development" | "peer";
  license?: string;
  lastPublishedAt?: string;
}

export interface DependencySummary {
  total: number;
  outdated: number;
  vulnerable: number;
  criticalVulns: number;
  highVulns: number;
  unlicensed: number;
  lastScanAt: string;
}

// ─── Slice 198: Security Engineering Standards ──────────────────
export type SecurityControlStatus = "implemented" | "partial" | "missing" | "not_applicable";

export interface SecurityStandard {
  id: string;
  control: string;         // e.g. "AUTH-01 MFA for admin accounts"
  category: "auth" | "encryption" | "input" | "logging" | "dependency" | "network" | "secret" | "access" | "incident" | "compliance";
  status: SecurityControlStatus;
  description: string;
  implementation?: string; // notes on how it's met
  lastTestedAt?: string;
}

export interface SecurityPosture {
  total: number;
  implemented: number;
  partial: number;
  missing: number;
  score: number;           // 0..100
  lastAuditAt?: string;
}

// ─── Aggregate dashboard ────────────────────────────────────────
export interface GovEngineeringDashboard {
  codingStandards: { total: number; required: number; enabled: number };
  repoStandards: { total: number; enforced: number };
  adrs: { total: number; accepted: number; proposed: number };
  reviews: ReviewMetrics;
  dependencies: DependencySummary;
  security: SecurityPosture;
}
