/**
 * Session 152 — Cyber & Cloud Academy web client
 * (routes/cyberCloudAcademy.ts → /api/v1/cyber-cloud-academy).
 *
 * Typed functions for the Lecturer-AI teaching tracks: the two-track
 * catalog (Cybersecurity / Ethical Hacking + Cloud Computing), per-topic
 * lecturer mastery, the learning path with a single next-recommended node
 * per track, starting a Lecturer AI session on a topic, and topic detail
 * with mastery.
 */
import { api } from "./api";
import type {
  AcademyCatalogView,
  AcademyLevel,
  AcademyPathNode,
  AcademyProgressEntry,
  AcademyTopic,
  AcademyTrack,
} from "@windels/shared";

export type {
  AcademyCatalogView,
  AcademyLevel,
  AcademyPathNode,
  AcademyProgressEntry,
  AcademyTopic,
  AcademyTrack,
} from "@windels/shared";

export interface AcademySessionTurn {
  topic: AcademyTopic;
  turn: {
    sessionId: string;
    stage: string;
    question?: string;
    aiAvailable: boolean;
    warning?: string;
  };
}

/** The two-track catalog. */
export function getAcademyCatalog(): Promise<AcademyCatalogView> {
  return api<AcademyCatalogView>("/cyber-cloud-academy/catalog");
}

/** Per-topic mastery derived from the real lecturer state. */
export function getAcademyProgress(): Promise<AcademyProgressEntry[]> {
  return api<AcademyProgressEntry[]>("/cyber-cloud-academy/progress");
}

/** The learning path with one next-recommended node per track. */
export function getAcademyPath(): Promise<AcademyPathNode[]> {
  return api<AcademyPathNode[]>("/cyber-cloud-academy/path");
}

/** Start a Lecturer AI session on an academy topic (honest demo fallback without an AI provider). */
export function startAcademyTopic(topicId: string, level?: AcademyLevel): Promise<AcademySessionTurn> {
  return api<AcademySessionTurn>("/cyber-cloud-academy/start", {
    method: "POST",
    body: JSON.stringify({ topicId, level }),
  });
}

/** A single topic with its measured lecturer mastery. */
export function getAcademyTopic(topicId: string): Promise<{ topic: AcademyTopic; mastery: { masteryPct: number | null } | null }> {
  return api<{ topic: AcademyTopic; mastery: { masteryPct: number | null } | null }>(`/cyber-cloud-academy/topic/${topicId}`);
}
