/**
 * Built-in simulator provider adapter.
 *
 * Honest scaffolding (same philosophy as mediaGen's simulator): it exercises
 * the full pipeline — routing, queuing, rendering, QA, metering — without
 * requiring API keys. `isConfigured()` returns true because the simulator
 * needs no credentials, but every generated asset is a deterministic
 * placeholder, never represented as real footage (the QA layer enforces
 * `disclosureAiGenerated`).
 *
 * Swap in a real adapter by registering it in `registry.ts`; the gateway
 * selects providers based on capability, quality, cost and availability.
 */
import { createHash } from "node:crypto";
import type {
  VideoAspectRatio,
  VideoProviderCapability,
  VideoProviderModel,
  VideoProviderOp,
  VideoResolution,
} from "@windels/shared";
import type { VideoGenerateInput, VideoGenerateResult, VideoProviderAdapter } from "./types.js";

const ALL_ASPECTS: VideoAspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "21:9"];

function cap(
  op: VideoProviderOp,
  opts: Partial<{ resolutions: VideoResolution[]; maxDur: number; char: boolean; product: boolean; cost: number; quality: number }> = {},
): VideoProviderCapability {
  return {
    op,
    resolutions: opts.resolutions ?? ["480p", "720p", "1080p"],
    aspectRatios: ALL_ASPECTS,
    maxDurationSec: opts.maxDur ?? 30,
    characterConsistency: opts.char ?? false,
    productConsistency: opts.product ?? false,
    costWeight: opts.cost ?? 1,
    qualityScore: opts.quality ?? 0.6,
  };
}

const MODELS: VideoProviderModel[] = [
  {
    providerId: "sim",
    modelId: "sim-t2v-v1",
    label: "Windels Simulator (text-to-video)",
    status: "online",
    configured: true,
    capabilities: [
      cap("text-to-video", { maxDur: 60, quality: 0.6, cost: 1 }),
      cap("text-to-image", { quality: 0.7, cost: 0.1 }),
    ],
  },
  {
    providerId: "sim",
    modelId: "sim-i2v-v1",
    label: "Windels Simulator (image/video-to-video)",
    status: "online",
    configured: true,
    capabilities: [
      cap("image-to-video", { maxDur: 30, char: true, product: true, quality: 0.65, cost: 1.2 }),
      cap("video-to-video", { maxDur: 30, char: true, product: true, quality: 0.65, cost: 1.2 }),
    ],
  },
  {
    providerId: "sim",
    modelId: "sim-avatar-v1",
    label: "Windels Simulator (talking avatar)",
    status: "online",
    configured: true,
    capabilities: [cap("talking-avatar", { maxDur: 120, char: true, quality: 0.6, cost: 1.5 })],
  },
];

export class SimulatorAdapter implements VideoProviderAdapter {
  readonly providerId = "sim";
  readonly label = "Windels Built-in Simulator";

  listModels(): VideoProviderModel[] {
    return MODELS;
  }

  isConfigured(): boolean {
    // The simulator is always available so the pipeline runs end-to-end.
    return true;
  }

  supports(modelId: string, op: VideoProviderOp) {
    return this.listModels()
      .find((m) => m.modelId === modelId)
      ?.capabilities.find((c) => c.op === op);
  }

  async generate(_modelId: string, input: VideoGenerateInput): Promise<VideoGenerateResult> {
    // Deterministic placeholder identity derived from prompt + seed.
    const seed = input.seed ?? 0;
    const hash = createHash("sha256")
      .update(`${input.idempotencyKey}:${input.prompt}:${seed}`)
      .digest("hex")
      .slice(0, 16);
    const ext = input.op === "text-to-image" ? "png" : "mp4";
    return {
      providerJobId: `sim-${hash}`,
      status: "succeeded",
      assetUrl: `/api/v1/video/assets/placeholders/${input.op}-${hash}.${ext}`,
      durationSec: input.op === "text-to-image" ? undefined : input.durationSec,
      bytes: 0,
      meta: { simulated: true, op: input.op, seed },
    };
  }
}
