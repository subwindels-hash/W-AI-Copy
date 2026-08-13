/**
 * Video Model Gateway / Abstraction Layer (§4).
 *
 *   AI Video API → Video Model Gateway → Provider Adapter → Provider
 *
 * Responsibilities:
 *   - hold the registry of provider adapters (built-in simulator + any real
 *     adapters registered at startup)
 *   - enumerate models/capabilities
 *   - select a provider/model for a request based on capability, availability,
 *     quality, cost, user plan and configured routing rules
 *   - dispatch generation to the chosen adapter
 *
 * Adding a new provider does NOT touch core architecture: implement
 * `VideoProviderAdapter`, then call `registerAdapter()` at bootstrap.
 */
import { logger } from "../config/logger.js";
import type {
  VideoProviderModel,
  VideoProviderRoute,
  VideoProviderRouteRequest,
} from "@windels/shared";
import { SimulatorAdapter } from "./adapters/simulator.js";
import type { VideoGenerateInput, VideoGenerateResult, VideoProviderAdapter } from "./adapters/types.js";

export class VideoProviderGateway {
  private adapters = new Map<string, VideoProviderAdapter>();

  registerAdapter(adapter: VideoProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
    logger.info("[video-gateway] provider registered", { providerId: adapter.providerId, label: adapter.label });
  }

  has(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  listProviders(): Array<{ providerId: string; label: string; configured: boolean; models: VideoProviderModel[] }> {
    return Array.from(this.adapters.values()).map((a) => ({
      providerId: a.providerId,
      label: a.label,
      configured: a.isConfigured(),
      models: a.listModels().map((m) => ({ ...m, configured: a.isConfigured() && m.configured })),
    }));
  }

  listModels(): VideoProviderModel[] {
    return Array.from(this.adapters.values()).flatMap((a) => a.listModels());
  }

  /**
   * Select the best model for a routing request. Scoring prefers capability
   * match, then quality, then lower cost. Offline/unconfigured models are
   * skipped unless the request explicitly prefers a provider that is the
   * simulator (always available). Real adapters can extend this with
   * plan-based and availability-aware logic via `preferredProvider`.
   */
  route(req: VideoProviderRouteRequest): VideoProviderRoute {
    const candidates: Array<{ model: VideoProviderModel; adapter: VideoProviderAdapter; cap: VideoProviderModel["capabilities"][number]; score: number }> = [];

    for (const adapter of this.adapters.values()) {
      if (!adapter.isConfigured()) continue;
      for (const model of adapter.listModels()) {
        if (model.status === "offline") continue;
        const cap = model.capabilities.find((c) => c.op === req.op);
        if (!cap) continue;
        if (!cap.resolutions.includes(req.resolution)) continue;
        if (!cap.aspectRatios.includes(req.aspectRatio)) continue;
        if (req.durationSec > cap.maxDurationSec) continue;
        if (req.needsCharacterConsistency && !cap.characterConsistency) continue;
        if (req.needsProductConsistency && !cap.productConsistency) continue;
        if (req.maxCostWeight !== undefined && cap.costWeight > req.maxCostWeight) continue;

        // Higher quality wins; lower cost breaks ties.
        const score = cap.qualityScore * 100 - cap.costWeight;
        candidates.push({ model, adapter, cap, score });
      }
    }

    if (!candidates.length) {
      throw Object.assign(new Error(`No video provider supports ${req.op} at ${req.resolution} ${req.aspectRatio} for ${req.durationSec}s`), { status: 503, code: "NO_PROVIDER" });
    }

    // Honour an explicit preference when it still satisfies capabilities.
    if (req.preferredProvider) {
      const preferred = candidates.find((c) => c.adapter.providerId === req.preferredProvider);
      if (preferred) {
        return {
          providerId: preferred.adapter.providerId,
          modelId: preferred.model.modelId,
          reason: `preferred provider ${preferred.adapter.providerId}`,
          estimatedCostMicros: this.estimateCostMicros(preferred.cap, req),
        };
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;
    return {
      providerId: best.adapter.providerId,
      modelId: best.model.modelId,
      reason: `best capability/quality/cost match (score ${best.score.toFixed(1)})`,
      estimatedCostMicros: this.estimateCostMicros(best.cap, req),
    };
  }

  /**
   * Rough pre-generation cost estimate. Real adapters should surface real
   * pricing; the simulator uses a duration/resolution-weighted micros value.
   */
  private estimateCostMicros(cap: VideoProviderModel["capabilities"][number], req: VideoProviderRouteRequest): number {
    const resMultiplier = req.resolution === "4k" ? 4 : req.resolution === "1080p" ? 2 : req.resolution === "720p" ? 1.2 : 0.6;
    const qualityMultiplier = 1; // quality factored into provider scoring, not price here
    return Math.round(cap.costWeight * req.durationSec * resMultiplier * qualityMultiplier * 500_000);
  }

  async generate(providerId: string, modelId: string, input: VideoGenerateInput): Promise<VideoGenerateResult> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw Object.assign(new Error(`Unknown video provider: ${providerId}`), { status: 400 });
    if (!adapter.isConfigured()) {
      throw Object.assign(new Error(`Video provider ${providerId} is not configured`), { status: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    const cap = adapter.supports(modelId, input.op);
    if (!cap) throw Object.assign(new Error(`Model ${modelId} does not support ${input.op}`), { status: 400 });
    if (input.durationSec > cap.maxDurationSec) {
      throw Object.assign(new Error(`Duration ${input.durationSec}s exceeds model max ${cap.maxDurationSec}s`), { status: 400 });
    }
    return adapter.generate(modelId, input);
  }
}

// Singleton gateway. The simulator is always registered so the end-to-end
// pipeline works out of the box; real adapters register alongside it.
export const videoProviderGateway = new VideoProviderGateway();
videoProviderGateway.registerAdapter(new SimulatorAdapter());
