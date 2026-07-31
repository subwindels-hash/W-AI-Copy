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
  totalSessions: number;
  avgSessionSec: number;
  satisfactionPct: number;
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
  transcriptLength: number;
  satisfactionRating?: number;
  resolution?: "resolved" | "escalated" | "abandoned";
}

export interface DigitalHumanDashboard {
  total: number;
  ready: number;
  live: number;
  training: number;
  totalSessions: number;
  avgSatisfactionPct: number;
  byRole: Record<AvatarRole, number>;
  byStyle: Record<AvatarStyle, number>;
  activeSessions: number;
  recent: DigitalHuman[];
  recentSessions: DigitalHumanSession[];
  languagesSupported: number;
}
