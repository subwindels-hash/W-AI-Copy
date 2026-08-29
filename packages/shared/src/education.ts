/**
 * Session 67 — Enterprise Education & Learning Platform.
 * AI tutor, personalized paths, course builder, assessments, certification
 * (reuses S56.10 certification logic), corporate learning, skill tracking.
 *
 * Session 159 — honesty pass:
 * - `rating` is null when nobody has rated the item (0 would be a score).
 * - `avgMasteryPct` is null when no skills are recorded (0% would be a score).
 * - Dashboard counts are derived from stored records only. Reads never seed.
 */

export const CONTENT_KINDS = ["course","lesson","quiz","project","path","assessment","certification_prep"] as const;
export type ContentKind = typeof CONTENT_KINDS[number];

export const CONTENT_STATUS = ["draft","review","published","archived"] as const;
export type ContentStatus = typeof CONTENT_STATUS[number];

export interface LearningContent {
  id: string;
  title: string;
  kind: ContentKind;
  author: string;
  description: string;
  durationMin: number;
  difficulty: "beginner"|"intermediate"|"advanced"|"expert";
  tags: string[];
  modulesCount?: number;
  status: ContentStatus;
  /** Null when unrated — 0 is a score. */
  rating: number | null;
  enrollments: number;
  completions: number;
  certificationId?: string; // S56.10 cert
  createdAt: string;
  updatedAt: string;
}

export interface LearningPath {
  id: string;
  title: string;
  userId: string;
  goal: string;
  contentIds: string[];
  progressPct: number;
  startedAt: string;
  targetDate?: string;
  completedAt?: string;
}

export interface TutorSession {
  id: string;
  userId: string;
  topic: string;
  startedAt: string;
  endedAt?: string;
  messages: number;
  masteryDelta?: number;
  adaptiveDifficulty?: number;
}

export interface Assessment {
  id: string;
  contentId: string;
  userId: string;
  scorePct: number;
  passed: boolean;
  questions: number;
  correct: number;
  timeSpentSec: number;
  takenAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: number;   // 0..5
  target: number;  // 0..5
  lastPracticedAt?: string;
}

export interface EducationDashboard {
  totalContent: number;
  publishedContent: number;
  /** Distinct userIds on assessments, tutor sessions and paths. */
  activeLearners: number;
  completions30d: number;
  /** Null when no skills are recorded — 0% is a score. */
  avgMasteryPct: number | null;
  /** Passed assessments on certification_prep content. */
  certificationsIssued: number;
  /** Sum of assessment timeSpentSec in the last 30 days, in hours. */
  hoursLearned30d: number;
  popularContent: LearningContent[];
  recentAssessments: Assessment[];
  activeTutorSessions: number;
  skillCategories: Array<{ category: string; avgLevel: number; count: number }>;
  pathsInProgress: number;
  provenance?: {
    avgMasteryPct: string;
    activeLearners: string;
    hoursLearned30d: string;
    certificationsIssued: string;
  };
}
