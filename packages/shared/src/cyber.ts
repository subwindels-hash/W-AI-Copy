/** Session 82 — AI Cybersecurity Academy, Ethical Hacking Platform & Multi-Cloud Security Ecosystem */
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

export interface CyberCourse {
  id: string;
  title: string;
  domain: CyberDomain;
  level: CyberLevel;
  durationHours: number;
  modules: number;
  enrolled: number;
  rating: number;
  certified: boolean;
  provider: "windels"|"aws"|"azure"|"gcp"|"isc2"|"offensive_security"|"partner";
}

export interface CyberLab {
  id: string;
  name: string;
  domain: CyberDomain;
  difficulty: CyberLevel;
  cloud?: "aws"|"azure"|"gcp"|"multi";
  status: "provisioning"|"ready"|"running"|"stopped"|"expired";
  expiresAt: string;
  scorePct?: number;
  flagsCaptured?: number;
  flagsTotal?: number;
}

export interface CyberChallenge {
  id: string;
  title: string;
  domain: CyberDomain;
  points: number;
  difficulty: CyberLevel;
  solvedBy: number;
  category: "ctf"|"lab"|"quiz"|"king_of_the_hill";
}

export interface CyberCertification {
  id: string;
  name: string;
  vendor: string;
  passed: boolean;
  scorePct?: number;
  achievedAt?: string;
  expiresAt?: string;
  preparationProgressPct: number;
}

export interface CyberRange {
  id: string;
  name: string;
  kind: "red_team"|"blue_team"|"purple_team"|"capture_the_flag"|"bug_bounty"|"adversary_emulation";
  cloudTargets: string[];
  players: number;
  durationHours: number;
  status: "scheduled"|"live"|"completed";
  startsAt: string;
  score?: number;
  rank?: number;
}

export interface CloudSecurityFinding {
  id: string;
  cloud: "aws"|"azure"|"gcp";
  service: string;
  severity: "low"|"medium"|"high"|"critical";
  rule: string;
  resource: string;
  status: "open"|"remediated"|"accepted";
  region: string;
}

export interface CyberDashboard {
  learners: number;
  coursesAvailable: number;
  coursesEnrolled: number;
  labsActive: number;
  challengesSolved: number;
  certificationsHeld: number;
  leaderboardRank: number;
  ctfWins: number;
  totalPoints: number;
  bugBountiesEarnedUsd: number;
  cloudFindingsOpen: number;
  cloudFindingsCritical: number;
  cloudFindingsRemediated30d: number;
  upcomingRanges: number;
  activeRanges: number;
  courses: CyberCourse[];
  labs: CyberLab[];
  challenges: CyberChallenge[];
  certifications: CyberCertification[];
  ranges: CyberRange[];
  findings: CloudSecurityFinding[];
  recentActivity: Array<{ at: string; what: string; points?: number }>;
  skillScores: Record<CyberDomain, number>;
}
