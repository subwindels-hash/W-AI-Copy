/**
 * Session 82 — AI Cybersecurity Academy, Ethical Hacking Platform & Multi-Cloud Security Ecosystem
 * Session 161 — completion: the catalogue (curriculum) is separated from the
 * posture (findings, certifications, ranges, labs). Anything describing what an
 * organization has actually done is a register that starts empty. Statistics we
 * do not collect are `null`, never `0`.
 */
export const CYBER_DOMAINS = [
  "fundamentals","ethical_hacking","network_security","linux_security","windows_security",
  "active_directory","web_security","mobile_security","api_security","cloud_security",
  "container_security","kubernetes_security","iam","zero_trust","threat_hunting","forensics",
  "incident_response","malware_analysis","red_team","blue_team","purple_team","cryptography",
  "ai_security","multi_cloud","devsecops","compliance",
] as const;
export type CyberDomain = typeof CYBER_DOMAINS[number];

export const CYBER_LEVELS = ["beginner","intermediate","advanced","expert"] as const;
export type CyberLevel = typeof CYBER_LEVELS[number];

export const CYBER_CLOUDS = ["aws","azure","gcp"] as const;
export type CyberCloud = typeof CYBER_CLOUDS[number];

export const CYBER_RANGE_KINDS = [
  "red_team","blue_team","purple_team","capture_the_flag","bug_bounty","adversary_emulation",
] as const;
export type CyberRangeKind = typeof CYBER_RANGE_KINDS[number];

export const FINDING_SEVERITIES = ["low","medium","high","critical"] as const;
export type FindingSeverity = typeof FINDING_SEVERITIES[number];

export const FINDING_STATUSES = ["open","remediated","accepted"] as const;
export type FindingStatus = typeof FINDING_STATUSES[number];

/**
 * Where a record came from. A dashboard must never present an operator's note
 * or a demo seed as though a scanner measured it.
 */
export const CYBER_SOURCES = ["operator_entered","scanner_reported","demo_seed"] as const;
export type CyberSource = typeof CYBER_SOURCES[number];

/** A lab is considered expired once this long past `expiresAt`. */
export const CYBER_LAB_TTL_MS = 7_200_000;

/* ------------------------------------------------------------------ *
 * Catalogue — static curriculum. This is legitimate configuration.
 * ------------------------------------------------------------------ */

export interface CyberCourse {
  id: string;
  title: string;
  domain: CyberDomain;
  level: CyberLevel;
  durationHours: number;
  modules: number;
  /** Registry statistics we do not collect. `null`, never 0. */
  enrolled: number | null;
  rating: number | null;
  certified: boolean;
  provider: "windels"|"aws"|"azure"|"gcp"|"isc2"|"offensive_security"|"partner";
  /** Always "catalog" — a course is curriculum, not something the org did. */
  kind: "catalog";
}

export interface CyberChallenge {
  id: string;
  title: string;
  /** Authored on the definition, never assigned by list position. */
  domain: CyberDomain;
  points: number;
  difficulty: CyberLevel;
  /** Not collected across tenants. `null`, never 0. */
  solvedBy: number | null;
  category: "ctf"|"lab"|"quiz"|"king_of_the_hill";
  kind: "catalog";
}

/**
 * An exam that exists in the world and can be attempted. Carries no
 * `passed`/`scorePct` — a track is not an achievement.
 */
export interface CyberCertificationTrack {
  id: string;
  name: string;
  vendor: string;
  domain: CyberDomain;
  level: CyberLevel;
  kind: "catalog";
}

/* ------------------------------------------------------------------ *
 * Registers — what this organization actually recorded.
 * ------------------------------------------------------------------ */

/** A credential the organization recorded. Empty until someone records one. */
export interface CyberCertification {
  id: string;
  organizationId: string;
  name: string;
  vendor: string;
  passed: boolean;
  scorePct?: number;
  achievedAt?: string;
  expiresAt?: string;
  /** Preparation is tracked only when a value was supplied. */
  preparationProgressPct: number | null;
  holderUserId?: string;
  source: CyberSource;
  createdAt: string;
  updatedAt: string;
}

export interface CyberLab {
  id: string;
  organizationId?: string;
  name: string;
  domain: CyberDomain;
  difficulty: CyberLevel;
  cloud?: CyberCloud|"multi";
  status: "provisioning"|"ready"|"running"|"stopped"|"expired";
  expiresAt: string;
  scorePct?: number;
  flagsCaptured?: number;
  flagsTotal?: number;
  createdAt?: string;
  /**
   * No container or VM is provisioned by this process. A lab row is a register
   * entry; this field says so rather than letting a UI imply a live range.
   */
  provisioning?: "local_state_only";
}

export interface CyberRange {
  id: string;
  organizationId: string;
  name: string;
  kind: CyberRangeKind;
  cloudTargets: string[];
  /** Registered participants. Real count of the recorded roster. */
  players: number;
  durationHours: number;
  status: "scheduled"|"live"|"completed";
  startsAt: string;
  /** Only set once a result is recorded. */
  score?: number;
  rank?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CloudSecurityFinding {
  id: string;
  organizationId: string;
  cloud: CyberCloud;
  service: string;
  severity: FindingSeverity;
  rule: string;
  resource: string;
  status: FindingStatus;
  region: string;
  /** Who reported it. A dashboard must not imply a scanner ran. */
  source: CyberSource;
  detectedAt: string;
  /** Stamped when status moves to `remediated` — drives the real 30d window. */
  remediatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

export interface CreateFindingInput {
  cloud: CyberCloud;
  service: string;
  severity: FindingSeverity;
  rule: string;
  resource: string;
  region: string;
  source?: "operator_entered"|"scanner_reported";
  detectedAt?: string;
}

export interface UpdateFindingInput {
  status?: FindingStatus;
  severity?: FindingSeverity;
}

export interface CreateCertificationInput {
  name: string;
  vendor: string;
  passed?: boolean;
  scorePct?: number;
  achievedAt?: string;
  expiresAt?: string;
  preparationProgressPct?: number;
  holderUserId?: string;
}

export interface CreateRangeInput {
  name: string;
  kind: CyberRangeKind;
  cloudTargets?: string[];
  durationHours?: number;
  startsAt?: string;
  players?: number;
}

export interface UpdateRangeInput {
  status?: "scheduled"|"live"|"completed";
  score?: number;
  rank?: number;
  players?: number;
}

export interface StartLabInput {
  domain: CyberDomain;
  difficulty: CyberLevel;
  cloud?: CyberCloud|"multi";
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export interface CyberProvenance {
  /** Human-readable source for each headline figure. */
  learners: string;
  findings: string;
  certifications: string;
  challenges: string;
  ranges: string;
  labs: string;
}

export interface CyberDashboard {
  /** Distinct users with recorded academy activity in this org. */
  learners: number;
  coursesAvailable: number;
  coursesEnrolled: number;
  labsActive: number;
  challengesSolved: number;
  /** Count of recorded, passed certifications. */
  certificationsHeld: number;
  /** No leaderboard exists — `null`, never rank 0. */
  leaderboardRank: number | null;
  ctfWins: number;
  totalPoints: number;
  bugBountiesEarnedUsd: number;
  cloudFindingsOpen: number;
  cloudFindingsCritical: number;
  /** True 30-day window over `remediatedAt`, not a status tally. */
  cloudFindingsRemediated30d: number;
  upcomingRanges: number;
  activeRanges: number;
  /** Catalogue */
  courses: CyberCourse[];
  challenges: CyberChallenge[];
  certificationTracks: CyberCertificationTrack[];
  /** Registers */
  labs: CyberLab[];
  certifications: CyberCertification[];
  ranges: CyberRange[];
  findings: CloudSecurityFinding[];
  recentActivity: Array<{ at: string; what: string; points?: number }>;
  /** Per-domain self-assessed skill. Absent domains are unscored. */
  skillScores: Record<CyberDomain, number>;
  provenance: CyberProvenance;
}

/** Connector posture. `connected` is reserved for a live session. */
export interface CyberConnector {
  id: string;
  name: string;
  status: "ready"|"not_configured"|"configured_not_connected";
  requiresConfig: boolean;
  note: string;
}
