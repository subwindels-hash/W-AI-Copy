/**
 * WINDELS AI OS — Music video storyboard engine (real, deterministic logic).
 *
 * Turns uploaded images + an audio analysis into a cinematic scene plan:
 *   - splits the audio into scenes aligned to detected beats / sections
 *   - assigns a camera motion per scene (pan/tilt/zoom/dolly/orbit)
 *   - applies visual effects + transitions that fit the music's energy
 *   - for multi-image / story modes, orders images as scenes (AI can also
 *     inject transition scenes when the AI registry is configured)
 *
 * Deterministic given (mode, style, aspect, image count, analysis): the same
 * inputs produce the same plan, so tests can pin the output. Everything is
 * derived from real inputs — no invented scene counts.
 */
import { makeRng } from "../utils/detRng.js";
import type {
  MvMode,
  MvStyle,
  MvAspect,
  MvScene,
  MvCameraMotion,
  MvStoryboard,
  MvAudioAnalysis,
} from "@windels/shared/musicVideo";

const CAMERA_MOTIONS: MvCameraMotion[] = [
  "pan_left", "pan_right", "tilt_up", "tilt_down",
  "zoom_in", "zoom_out", "dolly_in", "dolly_out", "orbit", "static",
];

const EFFECTS = ["lens_flare", "bloom", "motion_blur", "film_grain", "glow", "neon", "fire", "smoke", "rain", "snow", "dust", "sparks", "water", "lightning", "color_grade", "cinematic_lut", "dynamic_lighting", "slow_motion", "speed_ramp"];

const TRANSITIONS = ["cut", "fade", "crossfade", "zoom", "slide", "wipe", "glitch", "dissolve"];

const STYLE_GRADE: Record<MvStyle, string> = {
  cinematic: "teal_orange_lut", hyper_realistic: "neutral_hdr", music_video: "vibrant_pop",
  anime: "sakura_wash", cartoon: "bold_toon", children: "bright_soft", "3d": "depth_render",
  motion_graphics: "flat_vector", documentary: "natural", abstract: "surreal", luxury: "gold_black",
  corporate: "clean_corp", fantasy: "enchanted", horror: "cold_underlit", scifi: "neon_teal_cyan",
  afrofuturism: "sunset_ebony_gold", historical: "sepia_aged", custom: "custom_lut",
};

/** Intensity of a camera motion 0..1 (drives how pronounced it looks). */
const MOTION_INTENSITY: Record<MvCameraMotion, number> = {
  pan_left: 0.6, pan_right: 0.6, tilt_up: 0.6, tilt_down: 0.6,
  zoom_in: 0.8, zoom_out: 0.7, dolly_in: 0.85, dolly_out: 0.75, orbit: 0.9, static: 0.1,
};

function aspectRes(aspect: MvAspect): { w: number; h: number } {
  switch (aspect) {
    case "16:9": return { w: 1920, h: 1080 };
    case "9:16": return { w: 1080, h: 1920 };
    case "1:1": return { w: 1080, h: 1080 };
    case "4:5": return { w: 1080, h: 1350 };
    case "21:9": return { w: 2560, h: 1080 };
  }
}

function clampSec(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface PlanOptions {
  mode: MvMode;
  style: MvStyle;
  aspect: MvAspect;
  imageCount: number;
  audio: MvAudioAnalysis;
  /** set true when AI-generated transition scenes are allowed. */
  allowAiScenes: boolean;
  /** seeded rng for reproducible style choice. */
  seed: string;
}

export function buildStoryboard(opts: PlanOptions): MvStoryboard {
  const { mode, style, aspect, imageCount, audio, allowAiScenes, seed } = opts;
  const rng = makeRng(`musicVideo:${seed}:${mode}:${style}`);
  const res = aspectRes(aspect);
  const dur = Math.max(3, audio.durationSec);

  // Decide number of scenes.
  let sceneCount = 1;
  if (mode === "multi_image_story" && imageCount > 0) sceneCount = imageCount;
  else if (mode === "ai_storyboard" && imageCount > 0) sceneCount = imageCount * 2 + (allowAiScenes ? 1 : 0);
  else if (mode === "full_ai") sceneCount = clampSec(Math.round(dur / 4), 4, 16);
  sceneCount = clampSec(sceneCount, 1, 24);

  // Distribute scenes across the audio, biased toward detected beats.
  const scenes: MvScene[] = [];
  const baseDur = dur / sceneCount;
  let cursor = 0;
  for (let i = 0; i < sceneCount; i++) {
    // Prefer snapping scene starts to a nearby beat (within ~0.5s).
    const rawStart = cursor;
    let start = rawStart;
    if (audio.beatTimesSec.length) {
      const near = audio.beatTimesSec.find((b) => Math.abs(b - rawStart) < 0.6 && b >= rawStart - 0.6);
      if (near !== undefined) start = near;
    }
    const sceneDur = i === sceneCount - 1 ? dur - start : baseDur;
    const energy = energyAt(audio, start);
    const camera = pickCamera(rng, mode, energy);
    const effect = pickEffect(rng, style, energy);
    const transition = pickTransition(rng, mode, i);
    scenes.push({
      index: i,
      imageAssetId: mode !== "full_ai" ? `img-${i % Math.max(1, imageCount)}` : undefined,
      title: sceneTitle(i, mode, style),
      startSec: Math.round(start * 100) / 100,
      durationSec: Math.round(clampSec(sceneDur, 0.5, dur) * 100) / 100,
      camera,
      effect,
      transition,
      colorGrade: STYLE_GRADE[style],
    });
    cursor = start + sceneDur;
  }

  return {
    mode,
    style,
    aspect,
    scenes,
    totalDurationSec: Math.round(dur * 100) / 100,
    aiGenerated: allowAiScenes,
  };
}

function energyAt(audio: MvAudioAnalysis, sec: number): number {
  const idx = Math.min(audio.energyCurve.length - 1, Math.max(0, Math.floor(sec)));
  return audio.energyCurve[idx] ?? 0.5;
}

function pickCamera(rng: ReturnType<typeof makeRng>, mode: MvMode, energy: number): MvCameraMotion {
  // High energy → dynamic motion; low energy → gentle.
  if (energy > 0.6) return rng.randChoice<MvCameraMotion>(["zoom_in", "dolly_in", "orbit", "pan_right"]);
  if (energy < 0.25) return "static";
  const pool = mode === "single_image" ? CAMERA_MOTIONS.slice(0, 6) : CAMERA_MOTIONS;
  return rng.randChoice<MvCameraMotion>(pool);
}

function pickEffect(rng: ReturnType<typeof makeRng>, style: MvStyle, energy: number): string {
  if (energy > 0.6) return rng.randChoice<string>(["lens_flare", "glow", "neon", "sparks", "lightning", "dynamic_lighting"]);
  if (style === "horror") return rng.randChoice<string>(["film_grain", "cold_underlit", "smoke", "dust"]);
  if (style === "fantasy" || style === "anime") return rng.randChoice<string>(["glow", "bloom", "particles", "sparkles"]);
  return rng.randChoice<string>(EFFECTS);
}

function pickTransition(rng: ReturnType<typeof makeRng>, mode: MvMode, i: number): string {
  if (mode === "single_image" || i === 0) return "cut";
  return rng.randChoice<string>(TRANSITIONS);
}

function sceneTitle(i: number, mode: MvMode, style: MvStyle): string {
  if (mode === "full_ai") return `Scene ${i + 1}`;
  return `Shot ${i + 1} — ${style}`;
}
