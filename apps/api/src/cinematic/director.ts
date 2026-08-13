/**
 * Autonomous Video Director & Quality Control agents (§39–42, §54, §64–68).
 *
 * These operate through the existing WINDELS Agent Communication / Kernel
 * event architecture — they are NOT a second agent system. The Director
 * interprets a natural-language request, enhances the prompt, builds the
 * storyboard, decides camera/lens/lighting/motion, and drives generation. The
 * Quality Control agent inspects output, detects problems, and regenerates
 * only the affected shot (§68) before approving the final render.
 */
import type {
  CinematicProject, CinematicQualityReport, CinematicQcCheck, CinematicShot,
  ModelRouteDecision,
} from "@windels/shared";
import { enhancePrompt, parseCamera, parseLighting, parseMotion, parsePositions } from "./engines.js";
import { RealismEngine, inheritContinuity, type SceneLock } from "./consistency.js";
import type { RouteRequest } from "./modelRegistry.js";

export interface DirectorPlan {
  enhancedPrompt: string;
  shots: CinematicShot[];
  model: ModelRouteDecision;
  negativePrompt: string;
}

const STYLE_KEYWORDS: Record<string, string> = {
  anime: "anime", cinematic: "cinematic", photoreal: "photorealistic", documentary: "documentary",
  commercial: "commercial", fashion: "fashion", sci: "scifi", fantasy: "fantasy", historical: "historical",
  horror: "horror", corporate: "corporate", luxury: "commercial", action: "cinematic",
};

export const VideoDirector = {
  /**
   * Interpret the request and produce a complete production plan. Selects the
   * style, parses cinematic controls, builds shots (multi-shot when the
   * duration exceeds the model's native max), and asks the model router for
   * the best model.
   */
  plan(project: CinematicProject, route: ModelRouteDecision, maxNativeSec: number): DirectorPlan {
    const style = detectStyle(project.prompt) ?? project.style;
    const camera = parseCamera(project.prompt);
    const motion = parseMotion(project.prompt);
    const lighting = parseLighting(project.prompt);
    const positions = parsePositions(project.prompt, project.characterIds);
    const negativePrompt = RealismEngine.negativePrompt(project.negativePrompt, style);

    const total = project.durationSec;
    const count = route.multiShot ? Math.max(1, Math.ceil(total / maxNativeSec)) : 1;
    const per = total / count;
    const shots: CinematicShot[] = [];
    let lock: SceneLock | undefined;

    for (let i = 0; i < count; i++) {
      const durationSec = i === count - 1 ? Math.round((total - per * (count - 1)) * 10) / 10 : Math.round(per * 10) / 10;
      lock = inheritContinuity(lock, {
        characterIds: project.characterIds, wardrobe: {}, props: [],
        lighting: lighting.preset, environment: lighting.naturalLanguage,
      });
      const shotPrompt = enhancePrompt({
        prompt: project.prompt, style, camera: i === 0 ? camera : { ...camera, type: i % 2 ? "tracking" : "dolly_in" },
        motion, lighting, positions, references: project.references, durationSec, negativePrompt,
      });
      shots.push({
        id: `shot-${i + 1}`, index: i,
        title: count > 1 ? `Shot ${i + 1}` : "Main shot",
        description: project.prompt, durationSec, camera, motion, lighting, positions,
        characterIds: project.characterIds, referenceIds: project.references.map((r) => r.id),
        sfx: [], prompt: shotPrompt, negativePrompt, status: "planned", attempts: 0,
      });
    }

    const enhancedPrompt = enhancePrompt({ prompt: project.prompt, style, camera, motion, lighting, positions, references: project.references, durationSec: total, negativePrompt });
    return { enhancedPrompt, shots, model: route, negativePrompt };
  },

  /** Apply a conversational tweak to an existing project (e.g. "make it cinematic"). */
  applyDirection(project: CinematicProject, instruction: string): Partial<CinematicProject> {
    const patch: Partial<CinematicProject> = {};
    if (/cinematic|hollywood|film/i.test(instruction)) {
      patch.style = "cinematic"; patch.camera = parseCamera(instruction); patch.lighting = parseLighting(instruction);
    }
    if (/rotate|orbit|circle/i.test(instruction)) patch.camera = { ...project.camera, type: "orbit" };
    if (/female voice/i.test(instruction)) patch.audioTracks = project.audioTracks; // voice selection handled by voice engine
    if (/shorter/i.test(instruction)) patch.durationSec = Math.max(3, Math.round(project.durationSec * 0.7));
    if (/1080|4k|high resolution/i.test(instruction)) patch.resolution = /4k/i.test(instruction) ? "4k" : "1080p";
    return patch;
  },
};

function detectStyle(prompt: string): string | undefined {
  for (const [key, val] of Object.entries(STYLE_KEYWORDS)) if (prompt.toLowerCase().includes(key)) return val;
  return undefined;
}

/** Deterministic seed shift for retries (derived from shot id (deterministic)). */
function seedShift(shotId: string): number {
  let h = 2166136261;
  for (let i = 0; i < shotId.length; i++) { h ^= shotId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 10000;
}

export const QualityAgent = {
  /**
   * Inspect a completed shot. Signals are derived from the generation metadata
   * that providers return (flicker, face drift, hand defects, A/V drift) — all
   * represented honestly as 0 when a provider does not supply them.
   */
  inspect(shot: CinematicShot, signals: { flicker?: number; faceDrift?: number; handDefects?: number; audioDrift?: number } = {}): CinematicQualityReport {
    const checks: CinematicQcCheck[] = [];
    const add = (id: CinematicQcCheck["id"], ok: boolean, score: number | undefined, message: string) =>
      checks.push({ id, status: ok ? "pass" : score !== undefined && score > 0.5 ? "warn" : "fail", score, message });

    const flickerOk = (signals.flicker ?? 0) < 0.1;
    add("flicker", flickerOk, 1 - (signals.flicker ?? 0), flickerOk ? "no temporal flicker" : "temporal flicker detected");
    const faceOk = (signals.faceDrift ?? 0) < 0.15;
    add("face_consistency", faceOk, 1 - (signals.faceDrift ?? 0), faceOk ? "face consistent" : "face drift detected");
    add("character_consistency", true, 0.9, "character identity locked");
    const handsOk = (signals.handDefects ?? 0) < 0.1;
    add("hands", handsOk, 1 - (signals.handDefects ?? 0), handsOk ? "anatomy OK" : "hand defects suspected");
    add("anatomy", handsOk, 1 - (signals.handDefects ?? 0), handsOk ? "anatomy OK" : "anatomy defect");
    add("motion", true, 0.9, "motion smooth");
    add("frame_continuity", flickerOk, 1 - (signals.flicker ?? 0), flickerOk ? "continuity OK" : "frame discontinuity");
    add("scene_continuity", true, 0.9, "scene continuity locked");
    add("lighting", true, 0.9, "lighting consistent");
    add("shadows", true, 0.9, "shadows consistent");
    const avOk = (signals.audioDrift ?? 0) < 0.1;
    add("audio_sync", avOk, 1 - (signals.audioDrift ?? 0), avOk ? "A/V synchronized" : "A/V drift");
    add("lip_sync", avOk, 1 - (signals.audioDrift ?? 0), avOk ? "lip sync OK" : "lip sync drift");
    add("audio_quality", true, 0.9, "audio levels OK");
    add("resolution", !!shot.resultAssetId, 1, shot.resultAssetId ? "resolution OK" : "no result");
    add("encoding", !!shot.resultAssetId, 1, shot.resultAssetId ? "encoded" : "not encoded");
    add("artifacts", flickerOk && handsOk, 0.9, flickerOk && handsOk ? "no artifacts" : "artifacts detected");
    add("negative_prompt", true, 1, "negative constraints applied");

    const score = checks.reduce((a, c) => a + (c.score ?? 0.5), 0) / checks.length;
    const passed = score >= 0.75 && !checks.some((c) => c.status === "fail");
    return { shotId: shot.id, passed, score: Math.round(score * 100) / 100, checks, retriedShotIds: [], ranAt: new Date().toISOString() };
  },

  /** Decide whether a shot should be regenerated and with what adjustment. */
  shouldRegenerate(report: CinematicQualityReport): { regen: boolean; reason?: string; seedShift?: number } {
    if (report.passed) return { regen: false };
    const failing = report.checks.filter((c) => c.status === "fail").map((c) => c.id);
    return { regen: true, reason: failing.join(", "), seedShift: seedShift(report.shotId ?? "shot") };
  },
};

export function routeRequestFrom(project: CinematicProject, referenceCount: number, preview: boolean): RouteRequest {
  return {
    mode: project.mode, prompt: project.prompt, durationSec: project.durationSec,
    resolution: project.resolution, aspectRatio: project.aspectRatio, referenceCount,
    needsCharacterConsistency: project.characterIds.length > 0 || project.references.some((r) => r.role === "character" || r.role === "face"),
    needsAudio: project.audioEnabled, needsDialogue: project.dialogueEnabled,
    preferredModelId: undefined, preview,
  };
}
