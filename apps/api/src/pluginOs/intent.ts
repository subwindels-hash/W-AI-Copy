/**
 * Natural-language capability discovery (§20–21, §44, §55).
 *
 * Maps a user request to a required capability, checks whether an installed
 * plugin can serve it, and otherwise recommends catalog entries to install.
 * This is deterministic keyword/intent matching so it works without an LLM;
 * an LLM can refine it via the existing aiRegistry later.
 */
import type { CapabilityRoute, IntentResolution } from "@windels/shared";
import { CapabilityRegistry } from "./capabilityRegistry.js";
import { PluginRegistry } from "./pluginRegistry.js";

interface IntentRule {
  capability: string;
  patterns: RegExp[];
}

const RULES: IntentRule[] = [
  { capability: "video.generate", patterns: [/\b(create|make|generate|produce)\b.*\b(video|advert|ad|film|clip|cinematic)\b/i, /\bvideo (generation|creation)\b/i] },
  { capability: "video.transform", patterns: [/\b(transform|edit|change|replace|put me|turn me)\b.*\b(video|background|clothes|shirt|object)\b/i, /\bvideo[- ]?to[- ]?video\b/i] },
  { capability: "video.edit", patterns: [/\b(edit|trim|cut|restyle)\b.*\bvideo\b/i] },
  { capability: "image.generate", patterns: [/\b(generate|create|make)\b.*\b(image|picture|photo|visual)\b/i] },
  { capability: "image.edit", patterns: [/\b(edit|change|remove|replace)\b.*\b(image|photo|background)\b/i] },
  { capability: "audio.generate", patterns: [/\b(generate|create)\b.*\b(audio|music|soundtrack|voice)\b/i] },
  { capability: "voice.clone", patterns: [/\b(clone|copy)\b.*\bvoice\b/i] },
  { capability: "document.read", patterns: [/\b(read|analy[sz]e|summari[sz]e|extract)\b.*\b(document|pdf|contract|report)\b/i] },
  { capability: "github.read", patterns: [/\b(repo|repository|github|pull request|pr)\b/i] },
  { capability: "github.write", patterns: [/\b(commit|push|create pr|pull request|merge)\b/i] },
  { capability: "email.send", patterns: [/\b(send|draft)\b.*\b(email|mail|message)\b/i] },
  { capability: "calendar.create", patterns: [/\b(schedule|book|create|add)\b.*\b(meeting|event|calendar|appointment)\b/i] },
  { capability: "payment.create", patterns: [/\b(pay|charge|invoice|checkout|payment)\b/i] },
  { capability: "crm.update", patterns: [/\b(update|create|add)\b.*\b(lead|contact|deal|crm)\b/i] },
  { capability: "workflow.execute", patterns: [/\b(run|execute|trigger)\b.*\bworkflow\b/i] },
];

export const IntentEngine = {
  detect(prompt: string): { capability: string; confidence: number } | null {
    for (const rule of RULES) {
      for (const re of rule.patterns) {
        const m = prompt.match(re);
        if (m) return { capability: rule.capability, confidence: 0.85 };
      }
    }
    // Fuzzy fallback on key nouns.
    if (/\bvideo\b/i.test(prompt)) return { capability: "video.generate", confidence: 0.5 };
    if (/\bimage|picture|photo\b/i.test(prompt)) return { capability: "image.generate", confidence: 0.5 };
    if (/\bmusic|audio\b/i.test(prompt)) return { capability: "audio.generate", confidence: 0.5 };
    return null;
  },

  async resolve(oid: string, userId: string | undefined, prompt: string): Promise<IntentResolution | null> {
    const intent = this.detect(prompt);
    if (!intent) return null;
    const route = await CapabilityRegistry.route({ organizationId: oid, userId, capability: intent.capability });
    const result: IntentResolution = { capability: intent.capability, confidence: intent.confidence, route };
    if (!route.installed && route.installCandidates?.length) {
      const catalog = await PluginRegistry.listCatalog({ capability: intent.capability });
      result.recommendations = catalog.slice(0, 3).map((c) => ({ id: c.manifest.id, name: c.manifest.name, reason: `provides ${intent.capability}` }));
    }
    return result;
  },
};
