/**
 * Session 62 — Enterprise Digital Human Platform.
 * Lifelike AI avatars built on S40 Voice Studio, S41 Voice Foundry, S42 Media Gen.
 * Types: avatars/digital humans/animation/lip-sync/emotion/gesture/eye-contact/
 * voice personalities/multilingual/receptionists/teachers/trainers/sales/news/execs.
 */

export const AVATAR_GENDERS = ["feminine","masculine","androgynous"] as const;
export type AvatarGender = typeof AVATAR_GENDERS[number];

export const AVATAR_STYLES = ["realistic","stylized","photoreal","anime","cinematic","corporate","holographic"] as const;
export type AvatarStyle = typeof AVATAR_STYLES[number];

export const AVATAR_STATUSES = ["draft","training","ready","live","paused","archived"] as const;
export type AvatarStatus = typeof AVATAR_STATUSES[number];

export const AVATAR_ROLES = [
  "virtual_receptionist", "ai_teacher", "ai_trainer", "sales_rep",
  "news_presenter", "virtual_executive", "customer_agent",
  "brand_ambassador", "companion", "healthcare_guide",
] as const;
export type AvatarRole = typeof AVATAR_ROLES[number];

export interface DigitalHuman {
  id: string;
  organizationId: string;
  name: string;
  role: AvatarRole;
  gender: AvatarGender;
  style: AvatarStyle;
  appearanceConfig: {
    skinTone?: string;
    hairColor?: string;
    hairStyle?: string;
    eyeColor?: string;
    outfit?: string;
    background?: string;
    accentColor?: string;
  };
  voiceId?: string;            // from S41 Voice Foundry
  personalityProfileId?: string;
  languages: string[];
  emotionIntensity: number;    // 0..1
  gestureIntensity: number;    // 0..1
  eyeContactStrength: number;  // 0..1
  lipSyncModel: "werpy-v2" | "neural-lipsync-3" | "synctalk-v1";
  status: AvatarStatus;
  /** Sessions STARTED. Session 168: this is not the completed count and is
   *  not the denominator for any average — see completedSessions/ratedSessions. */
  totalSessions: number;
  /** Session 168 — sessions actually ENDED. The denominator for avgSessionSec. */
  completedSessions: number;
  /** Session 168 — sessions that carried a rating. The denominator for satisfactionPct. */
  ratedSessions: number;
  /** Session 168 — `null` until a session completes. 0 claimed a measured
   *  zero-second average for an avatar nobody had used. */
  avgSessionSec: number | null;
  /** Session 168 — `null` until a session is rated. 0 claimed 0% satisfaction. */
  satisfactionPct: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface DigitalHumanSession {
  id: string;
  humanId: string;
  organizationId: string;
  startedAt: string;
  endedAt?: string;
  participantId?: string;
  language: string;
  /** Characters recorded by real turns via recordTurn(). Session 168 removed
   *  the endSession() line that overwrote this with randInt(20,180). */
  transcriptLength: number;
  /** Session 168 — measured at endSession from real start/end timestamps. */
  durationSec?: number;
  satisfactionRating?: number;
  resolution?: "resolved" | "escalated" | "abandoned";
}

export interface DigitalHumanDashboard {
  total: number;
  ready: number;
  live: number;
  training: number;
  /** Session 168 — sessions counted ONCE from the session ledger. The prior
   *  implementation summed each avatar's totalSessions AND added the ledger
   *  length, so one real session reported as 2. */
  totalSessions: number;
  /** Session 168 — `null` when no avatar carries a rating. The prior code
   *  divided by Math.max(1, humans.length), so an empty org reported 0.0%. */
  avgSatisfactionPct: number | null;
  /** Session 168 — `null` until at least one session completes. */
  avgSessionSec: number | null;
  byRole: Record<AvatarRole, number>;
  byStyle: Record<AvatarStyle, number>;
  activeSessions: number;
  recent: DigitalHuman[];
  recentSessions: DigitalHumanSession[];
  languagesSupported: number;
  /** Session 168 — field-by-field basis for every number above (S118/S121 pattern). */
  provenance?: DhProvenance;
}

/* ═════════════════════════════════════════════════════════════════════════
 * Session 168 — provenance
 * ═════════════════════════════════════════════════════════════════════════ */

export const DH_PROVENANCE_BASES = ["measured", "not_measured", "demo_seed"] as const;
export type DhProvenanceBasis = (typeof DH_PROVENANCE_BASES)[number];

export interface DhProvenanceEntry {
  field: string;
  basis: DhProvenanceBasis;
  detail: string;
}

export interface DhProvenance {
  entries: DhProvenanceEntry[];
  note: string;
}

export const DH_PROVENANCE_NOTE =
  "Avatar readiness is not a trained state: nothing in this platform trains, renders or " +
  "validates a digital human. Session 168 removed the 1.5-second setTimeout that flipped " +
  "new avatars to 'ready' and the endSession line that invented a transcript length. " +
  "Averages are null until a session actually completes.";
