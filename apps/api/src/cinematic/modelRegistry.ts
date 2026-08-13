/**
 * WINDELS AI Video Studio — Model Capability Registry & Router (§34–36, §62–66).
 *
 * A provider-independent registry describing every video/image/audio/lip-sync
 * model's capabilities. The router selects a model by prompt, mode, duration,
 * resolution, character/audio needs, cost, plan and provider health, and
 * supports automatic failover to the next capable provider when one fails.
 *
 * Built-in simulator models make the pipeline run end-to-end without API keys
 * (honest scaffolding — same philosophy as mediaGen/videoEngine). Real provider
 * adapters register additional models at bootstrap; no core change required.
 */
import type {
  CinematicMode, CinematicModelCapability, ModelRouteDecision, VideoModelDescriptor,
} from "@windels/shared";
import { logger } from "../config/logger.js";

function baseCaps(over: Partial<CinematicModelCapability> = {}): CinematicModelCapability {
  return {
    textToVideo: true, imageToVideo: true, videoToVideo: false, multiReference: false,
    maxReferences: 1, characterConsistency: false, audioGeneration: false,
    dialogue: false, lipSync: false, maxDurationSec: 10, maxResolution: "1080p",
    supportedAspectRatios: ["16:9", "9:16", "1:1"], supportedResolutions: ["480p", "720p", "1080p"],
    ...over,
  };
}

const SEED_MODELS: VideoModelDescriptor[] = [
  {
    providerId: "windels", modelId: "windels-fast", label: "Windels Fast Preview",
    configured: true, status: "online", tier: "fast", costCredits: 4, estimatedSecPerSec: 2,
    capabilities: baseCaps({ maxDurationSec: 10, maxResolution: "720p", textToVideo: true, imageToVideo: true, multiReference: true, maxReferences: 8 }),
  },
  {
    providerId: "windels", modelId: "windels-cinema", label: "Windels Cinematic",
    configured: true, status: "online", tier: "high_quality", costCredits: 24, estimatedSecPerSec: 8,
    capabilities: baseCaps({
      maxDurationSec: 30, maxResolution: "4k", videoToVideo: true, multiReference: true, maxReferences: 50,
      characterConsistency: true, audioGeneration: true, dialogue: true, lipSync: true,
      supportedResolutions: ["480p", "720p", "1080p", "1440p", "4k"],
    }),
  },
  {
    providerId: "windels", modelId: "windels-identity", label: "Windels Identity Lock",
    configured: true, status: "online", tier: "identity", costCredits: 32, estimatedSecPerSec: 10,
    capabilities: baseCaps({
      maxDurationSec: 20, maxResolution: "1080p", videoToVideo: true, multiReference: true, maxReferences: 12,
      characterConsistency: true, supportedResolutions: ["720p", "1080p"],
    }),
  },
];

export interface RouteRequest {
  mode: CinematicMode;
  prompt: string;
  durationSec: number;
  resolution: string;
  aspectRatio: string;
  referenceCount: number;
  needsCharacterConsistency: boolean;
  needsAudio: boolean;
  needsDialogue: boolean;
  preferredModelId?: string;
  maxCredits?: number;
  preview?: boolean;
}

class ModelRegistry {
  private models = new Map<string, VideoModelDescriptor>();
  private health = new Map<string, { degraded: boolean; failures: number; until: number }>();

  register(m: VideoModelDescriptor) {
    this.models.set(`${m.providerId}/${m.modelId}`, m);
    logger.info("[cinematic-router] model registered", { model: m.modelId, provider: m.providerId });
  }

  list(): VideoModelDescriptor[] { return Array.from(this.models.values()); }

  get(providerId: string, modelId: string): VideoModelDescriptor | undefined {
    return this.models.get(`${providerId}/${modelId}`);
  }

  /** Filter candidates capable of serving the request. */
  candidates(req: RouteRequest): VideoModelDescriptor[] {
    return this.list().filter((m) => {
      if (!m.configured || m.status === "offline") return false;
      if (this.health.get(`${m.providerId}/${m.modelId}`)?.degraded) return false;
      const c = m.capabilities;
      if (req.mode === "image_to_video" && !c.imageToVideo) return false;
      if (req.mode === "video_to_video" && !c.videoToVideo) return false;
      if (req.referenceCount > c.maxReferences) return false;
      if (req.needsCharacterConsistency && !c.characterConsistency) return false;
      if (req.needsDialogue && !c.dialogue) return false;
      if (req.needsAudio && !c.audioGeneration && req.mode !== "multi_reference") return false;
      if (req.durationSec > c.maxDurationSec) return false;
      if (!c.supportedAspectRatios.includes(req.aspectRatio)) return false;
      if (!c.supportedResolutions.includes(req.resolution)) return false;
      if (req.maxCredits !== undefined && this.estimateCost(m, req.durationSec) > req.maxCredits) return false;
      return true;
    });
  }

  /**
   * Select a model. Preview/low-cost requests use the cheapest capable model;
   * identity needs use the identity tier; otherwise the highest capability tier
   * wins, with cost as tie-breaker. Returns multiShot=true when no single model
   * can produce the requested duration natively (long-form pipeline).
   */
  route(req: RouteRequest): ModelRouteDecision {
    if (req.preferredModelId) {
      const pref = this.list().find((m) => m.modelId === req.preferredModelId);
      if (pref && this.candidates(req).includes(pref)) {
        return this.decision(pref, req, `preferred model ${pref.modelId}`);
      }
    }
    let cands = this.candidates(req);
    let multiShot = false;

    if (!cands.length) {
      // No model can do the full duration in one shot — long-form multi-shot.
      const relaxed = { ...req, durationSec: Math.min(req.durationSec, 10) };
      cands = this.candidates(relaxed);
      if (cands.length) multiShot = true;
    }
    if (!cands.length) {
      throw Object.assign(new Error("No capable video model available for this request"), { status: 503, code: "NO_MODEL" });
    }

    let chosen: VideoModelDescriptor;
    if (req.preview) {
      chosen = [...cands].sort((a, b) => a.costCredits - b.costCredits)[0]!;
    } else if (req.needsCharacterConsistency) {
      chosen = cands.find((m) => m.tier === "identity") ?? cands[0]!;
    } else {
      const rank: Record<string, number> = { high_quality: 3, identity: 3, standard: 2, fast: 1 };
      chosen = [...cands].sort((a, b) => (rank[b.tier] ?? 0) - (rank[a.tier] ?? 0) || a.costCredits - b.costCredits)[0]!;
    }
    return { ...this.decision(chosen, req, `best ${req.needsCharacterConsistency ? "identity" : chosen.tier} match`), multiShot };
  }

  private decision(m: VideoModelDescriptor, req: RouteRequest, reason: string): ModelRouteDecision {
    return {
      providerId: m.providerId, modelId: m.modelId, label: m.label, reason,
      estimatedCredits: this.estimateCost(m, req.durationSec),
      estimatedRuntimeSec: Math.max(1, Math.round(m.estimatedSecPerSec * req.durationSec)),
      multiShot: false,
    };
  }

  estimateCost(m: VideoModelDescriptor, durationSec: number): number {
    // Credits scale with duration; preview/low-res discounts are applied by the caller.
    return Math.max(1, Math.round(m.costCredits * (durationSec / 10)));
  }

  // ── Failover (§36) ──
  markFailure(providerId: string, modelId: string) {
    const key = `${providerId}/${modelId}`;
    const h = this.health.get(key) ?? { degraded: false, failures: 0, until: 0 };
    h.failures++;
    if (h.failures >= 2) { h.degraded = true; h.until = Date.now() + 60_000; }
    this.health.set(key, h);
  }
  markOk(providerId: string, modelId: string) {
    this.health.set(`${providerId}/${modelId}`, { degraded: false, failures: 0, until: 0 });
  }

  /** Return the next-best model excluding the failed one, for failover. */
  failover(req: RouteRequest, failedProviderId: string, failedModelId: string): ModelRouteDecision | null {
    const cands = this.candidates(req).filter((m) => !(m.providerId === failedProviderId && m.modelId === failedModelId));
    if (!cands.length) return null;
    const chosen = cands.sort((a, b) => a.costCredits - b.costCredits)[0]!;
    return this.decision(chosen, req, `failover from ${failedModelId}`);
  }
}

export const modelRegistry = new ModelRegistry();
for (const m of SEED_MODELS) modelRegistry.register(m);
