/**
 * AI Video Director (§3) — the main orchestration agent.
 *
 * Converts a user's natural-language request into a complete production plan:
 * concept, script, storyboard, scenes, camera, characters, environments. The
 * director is deterministic/planning logic here; when a real LLM is configured
 * through the existing AI registry, these planners can be routed through it
 * without changing the pipeline contract.
 *
 * It deliberately does NOT invent product facts (§11): when a marketplace
 * product is referenced, product fields are passed through verbatim and the
 * QA layer flags any scene whose copy contradicts them.
 */
import type {
  VideoCreationType,
  VideoProductRef,
  VideoProject,
  VideoScene,
  VideoScript,
  VideoStoryboard,
} from "@windels/shared";

const CAMERA_MOVEMENTS = [
  "slow dolly-in",
  "static medium shot",
  "tracking shot left-to-right",
  "close-up with subtle push",
  "wide establishing shot",
  "overhead crane down",
  "handheld energetic",
  "orbit around subject",
];

const TONES: Record<VideoCreationType, string> = {
  advertisement: "energetic, persuasive, premium",
  product: "clean, focused, informative",
  social: "fast-paced, trendy, engaging",
  short_form: "snappy, hook-first, vertical-native",
  educational: "clear, calm, instructional",
  explainer: "friendly, simple, structured",
  business_presentation: "professional, confident, corporate",
  marketing: "aspirational, benefit-driven, polished",
  cinematic: "dramatic, atmospheric, filmic",
  story: "narrative, emotional, character-driven",
  promotional: "upbeat, compelling, concise",
  ugc: "authentic, candid, phone-shot",
  music_video: "rhythmic, stylized, performance-driven",
  talking_avatar: "conversational, direct-to-camera, natural",
  image_animation: "subtle, living-photo, gentle motion",
  video_transform: "transformative, stylized, dynamic",
  image_to_video: "cinematic, grounded, photo-real",
  video_to_video: "restylized, high-impact, transformed",
};

/** Simple, deterministic extraction of a creation type from the prompt. */
export function inferCreationType(prompt: string): VideoCreationType {
  const p = prompt.toLowerCase();
  if (/\b(tiktok|reel|shorts?|short[- ]form)\b/.test(p)) return "short_form";
  if (/\b(ugc|user[- ]generated)\b/.test(p)) return "ugc";
  if (/\b(explainer|how[- ]to)\b/.test(p)) return "explainer";
  if (/\b(education|tutorial|lesson|course)\b/.test(p)) return "educational";
  if (/\b(presentation|business pitch)\b/.test(p)) return "business_presentation";
  if (/\b(cinematic|film|movie)\b/.test(p)) return "cinematic";
  if (/\b(story|narrative)\b/.test(p)) return "story";
  if (/\b(music video)\b/.test(p)) return "music_video";
  if (/\b(talking|avatar|presenter|spokesperson)\b/.test(p)) return "talking_avatar";
  if (/\b(transform|restyle)\b.*\bvideo\b/.test(p)) return "video_transform";
  if (/\banimat(e|ion)\b/.test(p)) return "image_animation";
  if (/\b(product)\b/.test(p)) return "product";
  if (/\b(market(ing)?|promo|campaign|advert|advertisement|ad|facebook|instagram)\b/.test(p)) return "advertisement";
  return "marketing";
}

export function inferTargetDuration(prompt: string, fallback: number): number {
  const m = prompt.match(/(\d{1,3})\s*(?:-)?\s*(?:second|sec|s)\b/i);
  if (m) return Math.min(120, Math.max(5, Number(m[1])));
  return fallback;
}

export function buildScript(
  prompt: string,
  creationType: VideoCreationType,
  durationSec: number,
  products: VideoProductRef[],
): VideoScript {
  const productLine = products[0]
    ? `Showcase ${products[0].name}${products[0].brand ? ` by ${products[0].brand}` : ""}.`
    : "";
  const featureBullets = products[0]?.features?.length
    ? products[0]!.features.slice(0, 3).map((f) => `Highlight: ${f}`)
    : [];

  const sections: VideoScript["sections"] = [];
  const hook = Math.max(2, Math.round(durationSec * 0.15));
  const body = Math.max(3, Math.round(durationSec * 0.65));
  const cta = Math.max(2, durationSec - hook - body);

  sections.push({ heading: "Hook", body: productLine || grabHook(prompt), durationSec: hook });
  if (featureBullets.length) {
    const per = Math.max(2, Math.round(body / featureBullets.length));
    for (const f of featureBullets) sections.push({ heading: "Benefit", body: f, durationSec: per });
  } else {
    sections.push({ heading: "Story", body: prompt, durationSec: body });
  }
  sections.push({
    heading: "Call to action",
    body: products[0] ? `Get ${products[0].name} today.` : "Learn more and get started now.",
    durationSec: cta,
  });

  const total = sections.reduce((a, s) => a + s.durationSec, 0);
  return {
    title: titleFromPrompt(prompt),
    summary: `${creationType.replace("_", " ")} video (${durationSec}s). ${productLine}`.trim(),
    tone: TONES[creationType] ?? "polished",
    totalDurationSec: total,
    sections,
    callToAction: sections[sections.length - 1]!.body,
  };
}

export function buildStoryboard(script: VideoScript, creationType: VideoCreationType): VideoStoryboard {
  const palettes: Record<string, string[]> = {
    advertisement: ["#0EA5E9", "#FFFFFF", "#0F172A"],
    cinematic: ["#111827", "#B45309", "#F59E0B"],
    educational: ["#1E3A8A", "#E0F2FE", "#0F172A"],
    marketing: ["#7C3AED", "#F5F3FF", "#0F172A"],
  };
  const style = TONES[creationType] ?? "polished";
  return {
    style,
    palette: palettes[creationType] ?? palettes.marketing!,
    frames: script.sections.map((s, i) => ({
      sceneIndex: i,
      shot: i === 0 ? "hook / hero" : i === script.sections.length - 1 ? "logo / CTA" : "supporting",
      description: s.body,
      sketchPrompt: `${style}; ${s.body}`,
      durationSec: s.durationSec,
    })),
  };
}

export function buildScenes(
  script: VideoScript,
  products: VideoProductRef[],
  aspectRatio: VideoProject["aspectRatio"],
): VideoScene[] {
  const productIds = products.map((p) => p.sourceId ?? p.name);
  return script.sections.map((section, i) => {
    const env = i === 0 ? "hero setting" : i === script.sections.length - 1 ? "clean branded backdrop" : "lifestyle context";
    return {
      index: i,
      title: section.heading,
      description: section.body,
      visualPrompt: `${script.tone}; ${section.body}; aspect ${aspectRatio}`,
      cameraMovement: CAMERA_MOVEMENTS[i % CAMERA_MOVEMENTS.length]!,
      durationSec: section.durationSec,
      environment: env,
      characterIds: [],
      productIds,
      voiceoverText: section.body,
      caption: section.body,
      transition: i === 0 ? "fade-in" : i === script.sections.length - 1 ? "fade-out" : "cross-dissolve",
      status: "planned",
    } satisfies VideoScene;
  });
}

/** Produce a full production plan for a new project. */
export function planProduction(input: {
  prompt: string;
  creationType: VideoCreationType;
  durationSec: number;
  products: VideoProductRef[];
  aspectRatio: VideoProject["aspectRatio"];
}): { script: VideoScript; storyboard: VideoStoryboard; scenes: VideoScene[] } {
  const script = buildScript(input.prompt, input.creationType, input.durationSec, input.products);
  const storyboard = buildStoryboard(script, input.creationType);
  const scenes = buildScenes(script, input.products, input.aspectRatio);
  return { script, storyboard, scenes };
}

function titleFromPrompt(prompt: string): string {
  const t = prompt.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || "Untitled video";
}

function grabHook(prompt: string): string {
  return prompt.trim() || "A compelling opening that grabs attention.";
}
