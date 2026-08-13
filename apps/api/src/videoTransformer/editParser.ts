/**
 * WINDELS AI VIDEO TRANSFORMER — natural-language edit command parser (§16–17).
 *
 * Converts a free-form instruction like "Change my shirt to a black suit and
 * put me on clouds" into a structured list of edits plus preserve flags. This
 * is deterministic rule-based parsing (no LLM dependency); an LLM can refine it
 * later through the existing aiRegistry, but the pipeline never requires one.
 */
import type { EditAction, EditTarget, VtxEdit, VtxEditPlan, VtxPreserve } from "@windels/shared";

let seq = 0;
const eid = () => `edit_${Date.now().toString(36)}_${(seq++).toString(36)}`;

interface Rule {
  target: EditTarget;
  action: EditAction;
  /** Phrases that introduce this edit. */
  match: RegExp;
  /** Extracts the value (what to change to). */
  value?: (m: RegExpMatchArray, full: string) => string | undefined;
}

// Order matters: more specific rules first.
const RULES: Rule[] = [
  { target: "object_held", action: "replace",
    match: /\b(?:replace|change|turn|swap)\s+(?:the\s+)?(?:object|thing|phone|glass|drink|cup|item)\s+(?:in|on)\s+(?:my\s+)?(?:right\s+)?hand\s+(?:in)?to\s+(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "object_held", action: "replace",
    match: /\b(?:replace|change|swap|turn)\s+(?:the\s+)?(?:glass|phone|drink|cup|bottle|can|mug|coconut|object|thing)\s+(?:in[^.]*?hand\s+)?(?:in)?to?\s+(?:a\s+|an\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "object_held", action: "replace",
    match: /\b(?:replace|change|swap)\s+(?:the\s+)?(?:glass|phone|drink|cup|bottle|can|mug|coconut|object|thing)\s+with\s+(?:a\s+|an\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "object_held", action: "replace",
    match: /\b(?:the\s+)?(?:glass|phone|drink|cup|bottle|can|mug|coconut|object in my hand)\s+(?:in)?to\s+(?:a\s+|an\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "clothing", action: "replace",
    match: /\b(?:change|turn|swap|replace)\s+(?:my\s+)?(?:clothes|cloth(?:ing)?|shirt|outfit|suit|dress|attire)\s+(?:in)?to\s+(?:a\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "clothing", action: "replace",
    match: /\b(?:put\s+me\s+in|give\s+me|wear(?:ing)?)\s+(?:a\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "identity", action: "transform",
    match: /\bturn\s+me\s+in(?:to)?\s+(?:a\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "face", action: "transform",
    match: /\bchange\s+(?:my\s+)?face\b/i },
  { target: "background", action: "replace",
    match: /\b(?:put\s+me\s+(?:on|in(?:side)?)\s*|replace\s+(?:the\s+)?(?:background|room|scene|environment|kitchen|setting|place)\s+(?:with|to)\s+|change\s+(?:the\s+)?(?:background|room|scene|environment|kitchen|setting|place)\s+to\s+)(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "background", action: "replace",
    match: /\b(?:change|replace|swap)\s+(?:the\s+)?(?:background|room|scene|environment|kitchen|setting|place)\b/i,
    value: () => undefined },
  { target: "environment", action: "replace",
    match: /\b(?:put\s+me\s+(?:on|in(?:side)?)|replace\s+(?:the\s+)?environment\s+with|change\s+(?:the\s+)?environment\s+to)\s+(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "sky", action: "replace",
    match: /\bchange\s+(?:the\s+)?sky\s+(?:to|in)?to?\s+(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "weather", action: "replace",
    match: /\b(?:change|make)\s+(?:the\s+)?weather\s+(?:to)?\s*(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "lighting", action: "adjust",
    match: /\b(?:change|adjust|match)\s+(?:the\s+)?lighting\s+(?:to)?\s*(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "lighting", action: "adjust",
    match: /\b(?:golden hour|sunset|neon|cinematic lighting|studio lighting)\b/i,
    value: (m) => m[0] },
  { target: "add_object", action: "add",
    match: /\badd\s+(?:a\s+)?(.+?)\s+(?:in\s+the\s+background|behind\s+me|to\s+the\s+scene)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
  { target: "remove_object", action: "remove",
    match: /\bremove\s+(?:the\s+)?(.+?)(?:[.,;]|$)/i,
    value: (m) => m[1]?.trim() },
];

const PRESET_VALUES: Record<string, string> = {
  clouds: "top of the clouds", cloud: "top of the clouds", mars: "Mars surface",
  beach: "sunset beach", spaceship: "futuristic spaceship interior",
  castle: "medieval castle", mountain: "snowy mountain peak",
  astronaut: "astronaut in a spacesuit", king: "medieval king in royal robes",
  tuxedo: "black tuxedo", "black suit": "black luxury suit", suit: "black luxury suit",
};

function normalizeValue(raw: string | undefined, matchText: string): string {
  if (raw && raw.trim()) return raw.trim().replace(/^(?:a|an|the)\s+/i, "");
  // Fall back to a known preset if the phrase mentions one.
  for (const [key, val] of Object.entries(PRESET_VALUES)) {
    if (matchText.toLowerCase().includes(key)) return val;
  }
  return "new environment";
}

export function parseEditInstruction(prompt: string): VtxEditPlan {
  const text = prompt.trim();
  const edits: VtxEdit[] = [];
  const consumed: number[] = [];

  for (const rule of RULES) {
    rule.match.lastIndex = 0;
    const m = rule.match.exec(text);
    if (!m) continue;
    if (consumed.some((i) => Math.abs((m.index ?? 0) - i) < 6)) continue; // avoid overlapping matches
    consumed.push(m.index ?? 0);
    const raw = rule.value ? rule.value(m, text) : undefined;
    edits.push({
      id: eid(), target: rule.target, action: rule.action,
      value: normalizeValue(raw, m[0]),
    });
  }

  // If nothing specific matched but the prompt asks for a broad change, treat it
  // as an environment/style restyle rather than dropping the request.
  if (edits.length === 0) {
    const lower = text.toLowerCase();
    if (/\b(cloud|mars|beach|castle|mountain|city|space|hotel|stadium)\b/.test(lower)) {
      const place = PresetMatch(lower);
      edits.push({ id: eid(), target: "environment", action: "replace", value: place });
    } else if (/\b(restyle|cinematic|anime|photorealistic|make it)\b/.test(lower)) {
      edits.push({ id: eid(), target: "full_scene", action: "restyle", value: text });
    }
  }

  const preserve = inferPreserve(text);
  return {
    prompt: text,
    edits: dedupe(edits),
    preserve,
    style: inferStyle(text),
    references: [],
  };
}

function PresetMatch(lower: string): string {
  if (lower.includes("cloud")) return PRESET_VALUES.clouds;
  if (lower.includes("mars")) return PRESET_VALUES.mars;
  if (lower.includes("beach")) return PRESET_VALUES.beach;
  if (lower.includes("castle")) return PRESET_VALUES.castle;
  if (lower.includes("mountain")) return PRESET_VALUES.mountain;
  if (lower.includes("space") || lower.includes("spaceship")) return PRESET_VALUES.spaceship;
  if (lower.includes("hotel")) return "luxury hotel";
  if (lower.includes("city")) return "futuristic city at night";
  return lower;
}

function dedupe(edits: VtxEdit[]): VtxEdit[] {
  const seen = new Set<string>();
  return edits.filter((e) => { const k = `${e.target}:${e.action}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function inferPreserve(text: string): VtxPreserve {
  const lower = text.toLowerCase();
  const explicitly = (words: string[]) => words.some((w) => lower.includes(w));
  // Defaults preserve identity/motion/camera/audio/timing unless the user asks otherwise.
  const preserve: VtxPreserve = {
    identity: !explicitly(["different face", "change my face", "new identity", "different person"]),
    motion: !explicitly(["change movement", "different motion", "new action"]),
    camera: !explicitly(["change camera", "different angle", "new camera"]),
    audio: !explicitly(["replace audio", "new audio", "change the sound", "mute"]),
    timing: true,
  };
  if (explicitly(["keep me", "keep my", "preserve me", "same movement", "same motion", "exactly the same", "unchanged"])) {
    preserve.identity = preserve.motion = preserve.camera = true;
  }
  return preserve;
}

function inferStyle(text: string): string {
  const lower = text.toLowerCase();
  if (/\bcinematic\b/.test(lower)) return "cinematic";
  if (/\banime\b/.test(lower)) return "anime";
  if (/\bphotoreal|realistic\b/.test(lower)) return "photorealistic";
  if (/\bfantasy\b/.test(lower)) return "fantasy";
  if (/\bsci-?fi|futuristic\b/.test(lower)) return "scifi";
  return "photorealistic";
}
