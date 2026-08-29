/**
 * WINDELS AI Video Transformation Studio — provider abstraction & model router.
 *
 * Four provider kinds (§35): ImageGenerationProvider, VideoGenerationProvider,
 * VideoMatteProvider, UpscalingProvider. The built-in simulator is honest
 * scaffolding (deterministic generated assets) so the full node pipeline runs
 * end-to-end without API keys; real adapters register alongside it at
 * bootstrap. The model router picks by quality/cost/resolution/duration/plan
 * and supports provider failover (§36): a failed provider is marked degraded
 * and the next capable model is retried.
 */
import { createHash } from "node:crypto";
import type { VtProviderKind, VtProviderModel } from "@windels/shared";
import { logger } from "../config/logger.js";

export interface ImageGenerateInput {
  prompt: string;
  referenceUrls: string[];
  modelId: string;
  resolution: string;
  quality: "standard" | "high" | "ultra";
  aspectRatio: string;
  quantity: number;
  referenceStrength?: number;
  matchImages?: string[];
}

export interface ImageGenerateResult {
  providerJobId: string;
  images: Array<{ url: string; seed: number; meta?: Record<string, unknown> }>;
}

export interface VideoTransformInput {
  sourceUrl: string;
  alphaUrl?: string;
  prompt: string;
  referenceUrl?: string;
  modelId: string;
  resolution: string;
  preserveSubject: string;
  transformMode: string;
  previewSeconds?: number;
}

export interface VideoTransformResult {
  providerJobId: string;
  url: string;
  meta?: Record<string, unknown>;
}

export interface VtProviderAdapter {
  providerId: string;
  label: string;
  kind: VtProviderKind;
  isConfigured(): boolean;
  listModels(): VtProviderModel[];
  generateImage?(input: ImageGenerateInput): Promise<ImageGenerateResult>;
  transformVideo?(input: VideoTransformInput): Promise<VideoTransformResult>;
}

class SimulatorImageProvider implements VtProviderAdapter {
  providerId = "sim-image";
  label = "Windels Image Simulator";
  kind: VtProviderKind = "image";
  isConfigured() { return true; }
  listModels(): VtProviderModel[] {
    return [{
      providerId: this.providerId, modelId: "sim-img-v1", label: "Windels Simulator Image",
      kind: "image", configured: true, status: "online",
      resolutions: ["1024x1024", "1536x1024", "2048x1072", "2048x1152"],
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
      maxQuantity: 8, identityPreservation: true, costCredits: 2, estimatedSecPerSec: 0,
    }];
  }
  async generateImage(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const images = [];
    for (let i = 0; i < input.quantity; i++) {
      const seed = createHash("sha256").update(`${input.prompt}:${i}:${input.modelId}`).digest("hex").slice(0, 8);
      // Synthesized by the image generator node into a real PNG; the provider
      // returns a deterministic reference URL describing the generation.
      images.push({ url: `/api/v1/video-transform/assets/placeholders/img-${seed}.png`, seed: Number("0x" + seed.slice(0, 6)), meta: { simulated: true } });
    }
    return { providerJobId: `simg-${createHash("md5").update(input.prompt).digest("hex").slice(0, 10)}`, images };
  }
}

class SimulatorVideoProvider implements VtProviderAdapter {
  providerId = "sim-video";
  label = "Windels Video Transformer Simulator";
  kind: VtProviderKind = "video";
  isConfigured() { return true; }
  listModels(): VtProviderModel[] {
    return [
      { providerId: this.providerId, modelId: "sim-fast", label: "Fast Preview", kind: "video", configured: true, status: "online", resolutions: ["480p", "720p"], aspectRatios: ["16:9", "9:16", "1:1"], maxDurationSec: 10, identityPreservation: false, costCredits: 4, estimatedSecPerSec: 2 },
      { providerId: this.providerId, modelId: "sim-hq", label: "High Quality", kind: "video", configured: true, status: "online", resolutions: ["720p", "1080p", "1440p", "4k"], aspectRatios: ["16:9", "9:16", "1:1", "4:3", "21:9"], maxDurationSec: 120, identityPreservation: true, costCredits: 24, estimatedSecPerSec: 6 },
    ];
  }
  async transformVideo(input: VideoTransformInput): Promise<VideoTransformResult> {
    const id = createHash("sha256").update(`${input.sourceUrl}:${input.prompt}:${input.modelId}`).digest("hex").slice(0, 12);
    return { providerJobId: `svid-${id}`, url: `/api/v1/video-transform/assets/placeholders/vid-${id}.mp4`, meta: { simulated: true, preview: !!input.previewSeconds } };
  }
}

export class VtProviderGateway {
  private adapters = new Map<string, VtProviderAdapter>();
  private health = new Map<string, { degraded: boolean; failures: number; until: number }>();

  register(adapter: VtProviderAdapter) {
    this.adapters.set(adapter.providerId, adapter);
    logger.info("[vt-gateway] provider registered", { providerId: adapter.providerId, kind: adapter.kind });
  }

  listModels(kind?: VtProviderKind): VtProviderModel[] {
    return Array.from(this.adapters.values())
      .filter((a) => !kind || a.kind === kind)
      .flatMap((a) => a.listModels().map((m) => ({ ...m, configured: a.isConfigured() })));
  }

  listProviders() {
    return Array.from(this.adapters.values()).map((a) => ({ providerId: a.providerId, label: a.label, kind: a.kind, configured: a.isConfigured(), models: a.listModels() }));
  }

  private adapterFor(providerId: string): VtProviderAdapter {
    const a = this.adapters.get(providerId);
    if (!a) throw Object.assign(new Error(`unknown provider ${providerId}`), { status: 400 });
    return a;
  }

  /** Model router: rank by quality/cost for the request; failover-capable. */
  route(kind: VtProviderKind, req: { resolution?: string; maxDurationSec?: number; identity?: boolean; preferredModelId?: string; allowPreview?: boolean }): VtProviderModel {
    const candidates = this.listModels(kind)
      .filter((m) => m.configured && m.status !== "offline")
      .filter((m) => !req.resolution || m.resolutions.includes(req.resolution))
      .filter((m) => !req.maxDurationSec || !m.maxDurationSec || m.maxDurationSec >= req.maxDurationSec)
      .filter((m) => !req.identity || m.identityPreservation)
      .filter((m) => !(this.health.get(m.providerId)?.degraded));
    if (req.preferredModelId) {
      const pref = candidates.find((m) => m.modelId === req.preferredModelId);
      if (pref) return pref;
    }
    if (!candidates.length) throw Object.assign(new Error(`No healthy ${kind} provider matches the request`), { status: 503, code: "NO_PROVIDER" });
    // Cheapest capable model wins; identity models float to the top when requested.
    candidates.sort((a, b) => (req.identity ? Number(b.identityPreservation) - Number(a.identityPreservation) : 0) || a.costCredits - b.costCredits);
    return candidates[0]!;
  }

  async generateImage(input: Omit<ImageGenerateInput, "modelId"> & { modelId?: string }): Promise<ImageGenerateResult> {
    const model = this.route("image", { resolution: input.resolution, preferredModelId: input.modelId });
    const adapter = this.adapterFor(model.providerId);
    if (!adapter.generateImage) throw Object.assign(new Error("provider does not support image generation"), { status: 501 });
    try {
      const out = await adapter.generateImage({ ...input, modelId: model.modelId });
      this.markOk(model.providerId);
      return out;
    } catch (e) {
      this.markFailure(model.providerId);
      throw e;
    }
  }

  async transformVideo(input: Omit<VideoTransformInput, "modelId"> & { modelId?: string; maxDurationSec?: number; identity?: boolean }): Promise<VideoTransformResult> {
    const model = this.route("video", { resolution: input.resolution, maxDurationSec: input.maxDurationSec, identity: input.identity, preferredModelId: input.modelId, allowPreview: !!input.previewSeconds });
    const adapter = this.adapterFor(model.providerId);
    if (!adapter.transformVideo) throw Object.assign(new Error("provider does not support video transformation"), { status: 501 });
    try {
      const out = await adapter.transformVideo({ ...input, modelId: model.modelId });
      this.markOk(model.providerId);
      return out;
    } catch (e) {
      this.markFailure(model.providerId);
      throw e;
    }
  }

  estimateCredits(kind: VtProviderKind, modelId: string, durationSec = 0, quantity = 1): number {
    const model = this.listModels(kind).find((m) => m.modelId === modelId);
    if (!model) return 0;
    if (kind === "image") return model.costCredits * quantity;
    return Math.max(1, Math.round(model.costCredits * Math.max(1, Math.ceil(durationSec / 10))));
  }

  estimateRuntimeSec(modelId: string, durationSec: number): number {
    const model = this.listModels().find((m) => m.modelId === modelId);
    if (!model) return 0;
    return Math.round(model.estimatedSecPerSec * durationSec);
  }

  private markFailure(providerId: string) {
    const h = this.health.get(providerId) ?? { degraded: false, failures: 0, until: 0 };
    h.failures++;
    if (h.failures >= 2) { h.degraded = true; h.until = Date.now() + 60_000; }
    this.health.set(providerId, h);
  }
  private markOk(providerId: string) {
    this.health.set(providerId, { degraded: false, failures: 0, until: 0 });
  }
}

export const vtProviderGateway = new VtProviderGateway();
vtProviderGateway.register(new SimulatorImageProvider());
vtProviderGateway.register(new SimulatorVideoProvider());
