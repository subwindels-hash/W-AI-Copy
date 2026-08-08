/**
 * Cyber & Cloud Academy — Lecturer AI teaching tracks (integration).
 *
 * Bridges the curated Cybersecurity / Ethical Hacking and Cloud Computing
 * catalog (`packages/shared/src/cyberCloudAcademy.ts`) to the real Lecturer AI
 * adaptive tutor (`education/lecturer.service.ts`).
 *
 * How it works:
 *   - `startTopic` delegates to `LecturerService.start`, so teaching runs the
 *     real ASSESS → LESSON → QUESTION → FEEDBACK loop. If no AI provider key is
 *     configured the lecturer returns its honest "demo-ai" structured fallback
 *     with a warning — nothing here is fabricated as real tutoring.
 *   - `progress` derives per-topic mastery from `LecturerService.topicMastery`,
 *     keyed by the topic's `teachingTopic` string. Never-started topics report
 *     `masteryPct: null` (never a fabricated 0).
 *   - `path` recomputes the learning path from that measured mastery and the
 *     catalog's prerequisites, marking exactly one topic `nextRecommended` per
 *     track: the first un-completed topic whose prerequisites are all met.
 */
import { LecturerService } from "./lecturer.service.js";
import {
  ACADEMY_CATALOG,
  academyTopicById,
  type AcademyCatalogView,
  type AcademyLevel,
  type AcademyPathNode,
  type AcademyProgressEntry,
  type AcademyTopic,
  type AcademyTrack,
} from "@windels/shared";

/** The lecturer's completion threshold (matches lecturer.service.ts). */
const COMPLETE_MASTERY = 85;

const LEVEL_ORDER: Record<AcademyLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3,
};

// The Lecturer AI operates at beginner/intermediate/advanced; "expert" topics
// are taught at the lecturer's advanced level.
const LECTURER_LEVEL: Record<AcademyLevel, "beginner" | "intermediate" | "advanced"> = {
  beginner: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
  expert: "advanced",
};

function pickLevel(level: AcademyLevel, masteryPct: number | null): AcademyLevel {
  if (masteryPct == null) return level;
  if (masteryPct < 35) return "beginner";
  if (masteryPct < 70) return "intermediate";
  if (masteryPct < 85) return "advanced";
  return "expert";
}

function trackOrder(track: AcademyTrack): number {
  return track === "cybersecurity" ? 0 : 1;
}

export const CyberCloudAcademyService = {
  catalog(): AcademyCatalogView {
    const tracks = {
      cybersecurity: ACADEMY_CATALOG.filter((t) => t.track === "cybersecurity"),
      cloud: ACADEMY_CATALOG.filter((t) => t.track === "cloud"),
    };
    return { tracks, total: ACADEMY_CATALOG.length };
  },

  /** Full topic record (for routes that need it). */
  getTopic(topicId: string): AcademyTopic | undefined {
    return academyTopicById(topicId);
  },

  /**
   * Start a Lecturer AI teaching session on an academy topic.
   * Throws `TopicNotFoundError` when the id is unknown.
   */
  async startTopic(
    userId: string,
    topicId: string,
    level?: AcademyLevel,
  ): Promise<{ topic: AcademyTopic; turn: Awaited<ReturnType<typeof LecturerService.start>> }> {
    const topic = academyTopicById(topicId);
    if (!topic) throw new TopicNotFoundError(topicId);
    const turn = await LecturerService.start(userId, topic.teachingTopic, LECTURER_LEVEL[level ?? topic.level]);
    return { topic, turn };
  },

  /**
   * Per-topic mastery + completion derived from the real lecturer state.
   */
  async progress(userId: string): Promise<AcademyProgressEntry[]> {
    const out: AcademyProgressEntry[] = [];
    for (const t of ACADEMY_CATALOG) {
      const m = await LecturerService.topicMastery(userId, t.teachingTopic);
      const masteryPct = m?.masteryPct ?? null;
      out.push({
        topicId: t.id,
        title: t.title,
        track: t.track,
        masteryPct,
        level: t.level,
        completed: masteryPct != null && masteryPct >= COMPLETE_MASTERY,
        started: masteryPct != null,
        recommendedLevel: pickLevel(t.level, masteryPct),
      });
    }
    // Stable ordering: track first, then catalog order.
    return out.sort((a, b) =>
      trackOrder(a.track) - trackOrder(b.track) ||
      ACADEMY_CATALOG.findIndex((x) => x.id === a.topicId) -
        ACADEMY_CATALOG.findIndex((x) => x.id === b.topicId),
    );
  },

  /**
   * Learning path with a single `nextRecommended` node per track.
   */
  async path(userId: string): Promise<AcademyPathNode[]> {
    const prog = await CyberCloudAcademyService.progress(userId);
    const byId = new Map(prog.map((p) => [p.topicId, p]));
    const nodes: AcademyPathNode[] = ACADEMY_CATALOG.map((t) => {
      const p = byId.get(t.id)!;
      const prerequisitesMet = t.prerequisites.every(
        (pid) => byId.get(pid)?.completed ?? false,
      );
      return {
        topicId: t.id,
        title: t.title,
        track: t.track,
        level: t.level,
        prerequisites: t.prerequisites,
        prerequisitesMet,
        masteryPct: p.masteryPct,
        completed: p.completed,
        started: p.started,
        nextRecommended: false,
      };
    });

    // Mark one next topic per track: first un-completed with prerequisites met.
    const marked = new Set<AcademyTrack>();
    for (const n of nodes) {
      if (marked.has(n.track)) continue;
      if (!n.completed && n.prerequisitesMet) {
        n.nextRecommended = true;
        marked.add(n.track);
      }
    }
    return nodes.sort((a, b) =>
      trackOrder(a.track) - trackOrder(b.track) ||
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
    );
  },
};

export class TopicNotFoundError extends Error {
  constructor(topicId: string) {
    super(`Academy topic not found: ${topicId}`);
    this.name = "TopicNotFoundError";
  }
}

export default CyberCloudAcademyService;
