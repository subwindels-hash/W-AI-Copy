/**
 * Cinematic control engines (§10–16, §66).
 *
 * Structured interpretation of natural-language instructions into camera,
 * motion, lighting, positioning and a fully-expanded structured cinematic
 * prompt. These are deterministic planners; when a real LLM is configured
 * through the existing AI registry they can be routed through it without
 * changing the pipeline contract. They never fabricate product facts.
 */
import type {
  CameraControl, CameraType, CinematicShot, LightingControl, LightingPreset,
  MotionAction, MotionControl, Position, Positioning, ReferenceRole,
} from "@windels/shared";

const CAMERA_TYPES: Array<{ re: RegExp; type: CameraType }> = [
  { re: /\b(dolly[ -]?in|push[ -]?in)\b/i, type: "dolly_in" },
  { re: /\b(dolly[ -]?out|pull[ -]?out)\b/i, type: "dolly_out" },
  { re: /\b(drone|aerial)\b/i, type: "drone" },
  { re: /\b(tracking|follow shot|steadicam)\b/i, type: "tracking" },
  { re: /\bhand[- ]?held\b/i, type: "handheld" },
  { re: /\b(orbit|circl|360|rotate around|encircle)\b/i, type: "orbit" },
  { re: /\b(crane|jib)\b/i, type: "crane" },
  { re: /\b(fpv|first[- ]person)\b/i, type: "fpv" },
  { re: /\b(zoom in)\b/i, type: "zoom_in" },
  { re: /\b(zoom out)\b/i, type: "zoom_out" },
  { re: /\b(whip pan|fast pan)\b/i, type: "whip_pan" },
  { re: /\bstatic|fixed shot\b/i, type: "static" },
];

const ANGLES: Array<{ re: RegExp; angle: CameraControl["angle"] }> = [
  { re: /\bclose[- ]?up\b/i, angle: "close_up" },
  { re: /\bover[- ]the[- ]shoulder\b/i, angle: "over_shoulder" },
  { re: /\bfirst[- ]person|pov\b/i, angle: "first_person" },
  { re: /\blow[- ]angle\b/i, angle: "low" },
  { re: /\bhigh[- ]angle\b/i, angle: "high" },
  { re: /\bestablishing|wide shot\b/i, angle: "establishing" },
  { re: /\bmedium shot\b/i, angle: "medium" },
];

const LIGHTING: Array<{ re: RegExp; preset: LightingPreset }> = [
  { re: /\bgolden hour\b/i, preset: "golden_hour" },
  { re: /\bsunset\b/i, preset: "sunset" },
  { re: /\bsunrise\b/i, preset: "sunrise" },
  { re: /\bdaylight\b/i, preset: "daylight" },
  { re: /\b(night|moonlight)\b/i, preset: "moonlight" },
  { re: /\bstudio\b/i, preset: "studio" },
  { re: /\bneon\b/i, preset: "neon" },
  { re: /\bcine(matic)?\b/i, preset: "cinematic" },
  { re: /\bsoft light\b/i, preset: "soft" },
  { re: /\b(hard light|harsh)\b/i, preset: "hard" },
  { re: /\bbacklight|rim light\b/i, preset: "rim" },
  { re: /\bvolumetric\b/i, preset: "volumetric" },
  { re: /\bfog|mist\b/i, preset: "fog" },
  { re: /\bfirelight\b/i, preset: "firelight" },
];

const MOTIONS: Array<{ re: RegExp; action: MotionAction }> = [
  { re: /\brunning|run\b/i, action: "running" },
  { re: /\bwalking|walks?\b/i, action: "walking" },
  { re: /\bdancing|dance\b/i, action: "dancing" },
  { re: /\bsitting|sits?\b/i, action: "sitting" },
  { re: /\bturn(ing|s)?\b/i, action: "turning" },
  { re: /\bjumping|jump\b/i, action: "jumping" },
  { re: /\bfighting|fight\b/i, action: "fighting" },
  { re: /\bdriving|drive\b/i, action: "driving" },
  { re: /\bflying|fly\b/i, action: "flying" },
  { re: /\btalking|speaking|speak\b/i, action: "talking" },
  { re: /\b(smiling?|raise[sh]? (her|his)? ?hand|waving?)\b/i, action: "facial_expression" },
  { re: /\b(gesture|hand)\b/i, action: "hand_gesture" },
];

const POSITIONS: Array<{ re: RegExp; pos: Position }> = [
  { re: /\bforeground\b/i, pos: "foreground" },
  { re: /\bbackground\b/i, pos: "background" },
  { re: /\bmiddle ground\b/i, pos: "middle_ground" },
  { re: /\bon the left|left side\b/i, pos: "left" },
  { re: /\bon the right|right side\b/i, pos: "right" },
  { re: /\bcent(er|re)|middle of frame\b/i, pos: "center" },
  { re: /\bat the top\b/i, pos: "top" },
  { re: /\bat the bottom\b/i, pos: "bottom" },
];

function match<T>(text: string, table: Array<{ re: RegExp } & Record<string, unknown>>, field: string, fallback: T): T {
  for (const row of table) {
    if (row.re.test(text)) return row[field] as T;
  }
  return fallback;
}

export function parseCamera(prompt: string): CameraControl {
  const type = match(prompt, CAMERA_TYPES, "type", "dolly_in") as CameraType;
  const angle = match(prompt, ANGLES, "angle", "medium") as CameraControl["angle"];
  const speed = /slow|gently/i.test(prompt) ? "slow" : /fast|quick|rapid/i.test(prompt) ? "fast" : "normal";
  return {
    type, angle, speed,
    lensMm: /\b(?:35|50|85|24|135)mm\b/.exec(prompt)?.[0] ? Number(/\b(\d+)mm\b/.exec(prompt)![1]) : undefined,
    depthOfField: /bokeh|shallow depth|blurred background/i.test(prompt),
    focus: /focus (?:on|pull)/i.test(prompt) ? "subject" : undefined,
    shake: /handheld|shaky|documentary/i.test(prompt) ? 0.3 : 0,
  };
}

export function parseMotion(prompt: string): MotionControl {
  const m = { action: match(prompt, MOTIONS, "action", "idle") as MotionAction };
  return { action: m.action, naturalLanguage: prompt, intensity: /slow/i.test(prompt) ? 0.4 : /fast|energetic/i.test(prompt) ? 0.9 : 0.6 };
}

export function parseLighting(prompt: string): LightingControl {
  const preset = match(prompt, LIGHTING, "preset", "cinematic") as LightingPreset;
  return {
    preset,
    direction: /from behind|backlight/i.test(prompt) ? "behind" : /from (the )?side/i.test(prompt) ? "side" : "front",
    intensity: /dark|dim|moody/i.test(prompt) ? 0.5 : /bright|harsh/i.test(prompt) ? 1 : 0.8,
    naturalLanguage: prompt,
  };
}

export function parsePositions(prompt: string, subjectIds: string[]): Positioning[] {
  if (!subjectIds.length) return [];
  const out: Positioning[] = [];
  const matches = [...prompt.matchAll(/\b(\w[\w ]*?)\s+(?:on the (left|right)|in the (foreground|background|middle ground)|at the (top|bottom)|in the cent(?:er|re))/gi)];
  subjectIds.forEach((id, i) => {
    const pos = i < matches.length
      ? (POSITIONS.find((p) => matches[i]!.join(" ").match(p.re))?.pos ?? "center")
      : i === 0 ? "center" : "background";
    out.push({ subjectId: id, position: pos });
  });
  return out;
}

/**
 * Expand a short user prompt into a structured cinematic prompt (§66). This is
 * what is actually sent to the model so the user does not need technical
 * cinematography language.
 */
export function enhancePrompt(input: {
  prompt: string;
  style: string;
  camera: CameraControl;
  motion?: MotionControl;
  lighting: LightingControl;
  positions: Positioning[];
  references: Array<{ role: ReferenceRole; label?: string }>;
  durationSec: number;
  negativePrompt?: string;
}): string {
  const parts = [
    input.prompt.trim().replace(/\.$/, ""),
    `${input.style} style`,
    `camera: ${input.camera.type.replace(/_/g, " ")}${input.camera.angle ? `, ${input.camera.angle.replace(/_/g, " ")}` : ""}${input.camera.speed ? `, ${input.camera.speed} motion` : ""}`,
    `lighting: ${String(input.lighting.preset).replace(/_/g, " ")}${input.lighting.direction ? ` from ${input.lighting.direction}` : ""}`,
  ];
  if (input.motion && input.motion.action !== "idle") parts.push(`motion: ${String(input.motion.action).replace(/_/g, " ")}`);
  if (input.positions.length) parts.push(`composition: ${input.positions.map((p) => `${p.subjectId}=${p.position}`).join(", ")}`);
  if (input.references.length) parts.push(`references: ${input.references.map((r) => r.label ?? r.role).join(", ")}`);
  parts.push(`${input.durationSec}s, high detail, physically accurate, temporal consistency`);
  return parts.join(". ") + ".";
}

/** Build default shots when storyboarding is not explicitly requested. */
export function defaultShots(durationSec: number, prompt: string, maxNativeSec = 10): CinematicShot[] {
  const count = Math.max(1, Math.ceil(durationSec / maxNativeSec));
  const per = Math.round((durationSec / count) * 10) / 10;
  const camera = parseCamera(prompt);
  const lighting = parseLighting(prompt);
  const motion = parseMotion(prompt);
  const shots: CinematicShot[] = [];
  for (let i = 0; i < count; i++) {
    shots.push({
      id: `shot-${i + 1}`, index: i,
      title: count > 1 ? `Shot ${i + 1}` : "Main shot",
      description: prompt, durationSec: i === count - 1 ? Math.round((durationSec - per * (count - 1)) * 10) / 10 : per,
      camera: i === 0 ? camera : { ...camera, type: i % 2 ? "tracking" : "dolly_in" },
      motion, lighting, positions: [], characterIds: [], referenceIds: [],
      sfx: [], prompt: enhancePrompt({ prompt, style: "cinematic", camera, motion, lighting, positions: [], references: [], durationSec: per }),
      negativePrompt: "distorted hands, extra fingers, blurry, watermark, text, low quality, deformed face",
      status: "planned", attempts: 0,
    });
  }
  return shots;
}
