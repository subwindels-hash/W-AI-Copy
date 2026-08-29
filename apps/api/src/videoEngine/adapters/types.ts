/**
 * WINDELS AI Video — Provider Adapter contract.
 *
 * The Video Model Gateway (§4) never hard-codes one provider. Each provider
 * implements this interface and registers itself with `VideoProviderRegistry`.
 * A provider adapter is responsible for:
 *   - declaring which operations/resolutions/durations it supports
 *   - submitting a generation request to the downstream provider
 *   - reporting job status / result
 *
 * The built-in `SimulatorAdapter` produces deterministic placeholder clips so
 * the full pipeline is exercisable without API keys. Real providers (Runway,
 * Pika, Sora-class, Veo-class, local inference, etc.) are added by dropping a
 * new adapter file in this directory and registering it in `registry.ts`.
 */
import type {
  VideoAspectRatio,
  VideoJob,
  VideoProviderCapability,
  VideoProviderModel,
  VideoProviderOp,
  VideoQuality,
  VideoResolution,
} from "@windels/shared";

export interface VideoGenerateInput {
  op: VideoProviderOp;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  quality: VideoQuality;
  durationSec: number;
  seed?: number;
  /** For image-to-video / video-to-video / avatar. */
  inputAssetUrls?: string[];
  /** Opaque reference used for character/subject consistency. */
  consistencyKey?: string;
  /** Caller-supplied idempotency key. */
  idempotencyKey: string;
}

export interface VideoGenerateResult {
  providerJobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  /** Set once succeeded. */
  assetUrl?: string;
  bytes?: number;
  durationSec?: number;
  meta?: Record<string, unknown>;
}

export interface VideoProviderAdapter {
  readonly providerId: string;
  readonly label: string;
  listModels(): VideoProviderModel[];
  /** True when the adapter has real credentials/configured access. */
  isConfigured(): boolean;
  supports(modelId: string, op: VideoProviderOp): VideoProviderCapability | undefined;
  generate(modelId: string, input: VideoGenerateInput): Promise<VideoGenerateResult>;
  poll?(providerJobId: string): Promise<VideoGenerateResult>;
  cancel?(providerJobId: string): Promise<void>;
}

/** Re-exported for adapter implementations. */
export type { VideoJob };
