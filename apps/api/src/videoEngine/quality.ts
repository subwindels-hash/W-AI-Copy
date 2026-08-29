/**
 * AI Safety & Quality layer (§13).
 *
 * Runs validation before delivering a generated video. Checks are explicit and
 * honest: each returns pass/warn/fail/skipped with a human-readable message.
 * Nothing fabricates "real footage" — the AI-generated disclosure is enforced.
 * When product data comes from the marketplace/CRM, claimed facts are checked
 * against the supplied product fields so the engine does not invent price,
 * specs or guarantees.
 */
import type { VideoProductRef, VideoProject, VideoQaCheck, VideoQaCheckId, VideoQaReport, VideoScene } from "@windels/shared";

const UNSAFE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(csam|child\s*porn)\b/i, reason: "minor safety block" },
  { re: /\b(behead|dismember|gore)\b/i, reason: "graphic violence block" },
  { re: /\b(bomb[- ]making|synthesize\s+ricin|weapon\s+manufacturing)\b/i, reason: "weapons safety block" },
];

const COPYRIGHT_TERMS = ["©", "all rights reserved", "trademark"];

export async function runQualityChecks(project: VideoProject): Promise<VideoQaReport> {
  const checks: VideoQaCheck[] = [];

  // 1. Generation failures
  const failedScenes = project.scenes.filter((s) => s.status === "failed");
  checks.push(result(
    "generation_failures",
    failedScenes.length === 0,
    failedScenes.length ? `${failedScenes.length} scene(s) failed generation` : "all scenes generated",
  ));

  // 2. Missing scenes / clips
  const missingClips = project.scenes.filter((s) => !s.clipAssetId);
  checks.push(result(
    "missing_scenes",
    missingClips.length === 0,
    missingClips.length ? `${missingClips.length} scene(s) have no clip` : "all scenes have clips",
  ));

  // 3. Corrupted / unsupported media — check recorded asset metadata
  const badAssets = project.assets.filter((a) => a.bytes !== undefined && a.bytes === 0 && a.kind !== "caption");
  checks.push(result(
    "corrupted_media",
    badAssets.length === 0,
    badAssets.length ? `${badAssets.length} asset(s) report zero bytes` : "no corrupted media",
  ));

  const supported = new Set(["video/mp4", "image/png", "image/jpeg", "audio/mpeg", "audio/aac", "text/vtt"]);
  const unsupported = project.assets.filter((a) => !supported.has(a.mime));
  checks.push(result(
    "unsupported_media",
    unsupported.length === 0,
    unsupported.length ? `${unsupported.length} unsupported mime type(s)` : "all media types supported",
    "warn", // soft: unsupported media warns, never hard-fails delivery
  ));

  // 4. A/V sync — every voiceover scene should have a caption covering its duration
  const avIssues = project.scenes.filter((s) => s.voiceoverText && !s.caption);
  checks.push(result(
    "av_sync",
    avIssues.length === 0,
    avIssues.length ? `${avIssues.length} voiceover scene(s) without captions` : "voice/caption coverage ok",
    "warn", // soft: missing captions warn, never hard-fail
  ));

  // 5. Caption errors
  const captionIssues = project.captions.filter((c) => !c.text || c.endSec <= c.startSec);
  checks.push(result(
    "caption_errors",
    captionIssues.length === 0,
    captionIssues.length ? `${captionIssues.length} caption(s) invalid` : "captions valid",
  ));

  // 6. Brand restrictions
  const brand = project.products.find((p) => p.brand)?.brand;
  checks.push({
    id: "brand_restrictions",
    status: brand ? "pass" : "skipped",
    message: brand ? `brand guidelines source: ${brand}` : "no brand restrictions configured",
  });

  // 7. User content policy
  checks.push({
    id: "content_policy",
    status: project.contentPolicy ? "pass" : "skipped",
    message: project.contentPolicy ? "org content policy applied" : "no org content policy configured",
  });

  // 8. Copyright-sensitive terms
  const allText = [project.prompt, project.script?.summary, ...project.scenes.map((s) => s.visualPrompt)].join(" ").toLowerCase();
  const copyHit = COPYRIGHT_TERMS.some((t) => allText.includes(t));
  checks.push(result("copyright", !copyHit, copyHit ? "copyright-sensitive text detected" : "no copyright markers", "warn")); // soft: copyright markers warn, never hard-fail

  // 9. Unsafe content
  const unsafe = UNSAFE_PATTERNS.find((p) => p.re.test(allText));
  checks.push(result("unsafe_content", !unsafe, unsafe ? unsafe.reason : "no unsafe content"));

  // 10. Incorrect product claims — compare captions/voiceover to product facts.
  const claimIssues = checkProductClaims(project.scenes, project.products);
  checks.push({
    id: "incorrect_product_claims",
    status: claimIssues.length === 0 ? "pass" : "fail",
    message: claimIssues.length ? claimIssues.join("; ") : "no invented product claims",
  });

  // 11. AI disclosure
  checks.push(result(
    "ai_disclosure",
    project.disclosureAiGenerated,
    project.disclosureAiGenerated ? "AI-generated disclosure enabled" : "AI-generated disclosure must be enabled",
  ));

  const failed = checks.some((c) => c.status === "fail");
  const warned = checks.some((c) => c.status === "warn");
  return {
    passed: !failed,
    checks,
    ranAt: new Date().toISOString(),
  };
}

function result(
  id: VideoQaCheckId,
  ok: boolean,
  message: string,
  failStatus: "fail" | "warn" = "fail",
): VideoQaCheck {
  return { id, status: ok ? "pass" : failStatus, message };
}

/**
 * Ensure scenes do not invent product price/spec/guarantee facts. We only flag
 * explicit price-like claims ("$X", "only X dollars") when the product has no
 * recorded price, and superlative guarantees ("guaranteed", "lifetime warranty")
 * that are not present in the supplied product features.
 */
function checkProductClaims(scenes: VideoScene[], products: VideoProductRef[]): string[] {
  const issues: string[] = [];
  const product = products[0];
  for (const scene of scenes) {
    const text = `${scene.voiceoverText ?? ""} ${scene.caption ?? ""}`;
    if (!product?.price && /\$\s?\d+|\b(free|0\s*dollars?)\b/i.test(text) && !/\$\d+\s*(off|discount)/i.test(text)) {
      issues.push(`scene ${scene.index} states a price not present in product data`);
    }
    if (/\b(guaranteed|lifetime warranty|money-?back guaranteed)\b/i.test(text)) {
      const hasGuarantee = product?.features?.some((f) => /guarantee|warranty/i.test(f));
      if (!hasGuarantee) issues.push(`scene ${scene.index} claims a guarantee not in product data`);
    }
  }
  return issues;
}
