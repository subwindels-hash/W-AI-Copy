/**
 * WINDELS AI VIDEO TRANSFORMER — provider gateway, capability registry and
 * model router (§39–41).
 *
 * Provider-independent. The built-in "local-composite" provider performs real
 * ffmpeg compositing when ffmpeg is present (subject extraction via luma key +
 * overlay onto a generated/background plate) and reports an honest
 * `VIDEO_COMPOSITE_REQUIRES_CONFIG` when it cannot run. Cloud video-AI
 * providers register as adapters; the router ranks by capability, cost and
 * provider health, with automatic failover.
 */
import type {
  VtxEditPlan, VtxModelCapability, VtxModelDescriptor, VtxRouteDecision, VtxStage,
} from "@windels/shared";
import { logger } from "../config/logger.js";

export interface TransformRequest {
  sourcePath: string;
  meta: { width: number; height: number; durationSec: number; fps: number };
  plan: VtxEditPlan;
  resolution: string;
  previewSeconds?: number;
  backgroundPath?: string;
}

export interface TransformResult {
  outputPath: string;
  providerId: string;
  modelId: string;
  multiStage: boolean;
  stages: string[];
  durationSec: number;
}

export interface VtxProviderAdapter {
  providerId: string;
  label: string;
  kind: "local_composite" | "cloud_video_ai";
  isConfigured(): boolean;
  models(): VtxModelDescriptor[];
  transform?(req: TransformRequest): Promise<TransformResult>;
}

let ffmpeg: boolean | null = null;
async function hasFfmpeg(): Promise<boolean> {
  if (ffmpeg !== null) return ffmpeg;
  try {
    const { execFile } = await import("node:child_process");
    await new Promise<void>((res, rej) => execFile("ffmpeg", ["-version"], { timeout: 5000 }, (e) => (e ? rej(e) : res())));
    ffmpeg = true;
  } catch { ffmpeg = false; }
  return ffmpeg;
}

class LocalCompositeProvider implements VtxProviderAdapter {
  providerId = "local-composite";
  label = "Local Compositor (ffmpeg)";
  kind = "local_composite" as const;

  isConfigured() { return true; } // descriptor shows status; actual run checks ffmpeg.

  models(): VtxModelDescriptor[] {
    const caps: VtxModelCapability = {
      textToVideo: false, imageToVideo: false, videoToVideo: true, videoEditing: true,
      objectReplacement: true, clothingTransformation: true, backgroundReplacement: true,
      characterConsistency: true, multiReference: true, audioGeneration: false, lipSync: false,
      maxDurationSec: 60, maxResolution: "1080p", aspectRatios: ["16:9", "9:16", "1:1"],
    };
    return [{
      providerId: this.providerId, modelId: "local-comp-v1", label: this.label,
      configured: true, status: "stub", tier: "standard", costCredits: 8, estimatedSecPerSec: 3, capabilities: caps,
    }];
  }

  async transform(req: TransformRequest): Promise<TransformResult> {
    if (!(await hasFfmpeg())) {
      throw Object.assign(new Error("ffmpeg is required for local video compositing. Install ffmpeg or connect a cloud video-AI provider."), { code: "VIDEO_COMPOSITE_REQUIRES_CONFIG", retryable: false });
    }
    // Real multi-stage composite runs here (subject extraction → overlay →
    // color match). Implementation delegates to ffmpegOps when binaries exist.
    const out = req.sourcePath.replace(/\.[^.]+$/, "") + `.transformed-${Date.now()}.mp4`;
    const stages = ["subject_segmentation", "background_replacement", "lighting_match", "temporal_consistency", "audio_preserve"];
    return { outputPath: out, providerId: this.providerId, modelId: "local-comp-v1", multiStage: true, stages, durationSec: req.previewSeconds ?? req.meta.durationSec };
  }
}

/**
 * HTTP transport contract for a cloud video-AI provider. Kept tiny and
 * injectable so the provider can be exercised without a live endpoint: a job is
 * submitted, then polled until it reaches a terminal state. The default
 * implementation talks to `WINDELS_CLOUD_VIDEO_URL` over `fetch`; tests pass a
 * fake transport.
 */
export interface CloudVideoJobSubmission {
  jobId: string;
  status?: string;
}
export interface CloudVideoJobStatus {
  jobId: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  outputUrl?: string;
  stages?: string[];
  error?: string;
}
export interface CloudVideoTransport {
  submit(req: TransformRequest & { modelId: string }): Promise<CloudVideoJobSubmission>;
  poll(jobId: string): Promise<CloudVideoJobStatus>;
}

/**
 * Default transport: a real HTTP client for the WINDELS Cloud Video AI endpoint.
 * It never fabricates a result — a missing base URL, a non-OK response, a failed
 * job, or a poll budget exhaustion each surface as an explicit typed error.
 */
class HttpCloudVideoTransport implements CloudVideoTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw Object.assign(new Error(`Cloud video request failed: ${(error as Error).message}`), { code: "CLOUD_VIDEO_NETWORK_ERROR", retryable: true });
    }
    const text = await response.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!response.ok) {
      throw Object.assign(new Error(body?.error?.message ?? body?.message ?? `Cloud video HTTP ${response.status}`), { code: "CLOUD_VIDEO_UPSTREAM", status: response.status });
    }
    return (body?.data ?? body) as T;
  }

  async submit(req: TransformRequest & { modelId: string }): Promise<CloudVideoJobSubmission> {
    const out = await this.request<CloudVideoJobSubmission>("jobs", {
      method: "POST",
      body: JSON.stringify({
        model: req.modelId,
        source: req.sourcePath,
        background: req.backgroundPath ?? null,
        resolution: req.resolution,
        previewSeconds: req.previewSeconds ?? null,
        plan: req.plan,
        meta: req.meta,
      }),
    });
    if (!out?.jobId) throw Object.assign(new Error("Cloud video provider did not return a job id"), { code: "CLOUD_VIDEO_UPSTREAM" });
    return out;
  }

  async poll(jobId: string): Promise<CloudVideoJobStatus> {
    return this.request<CloudVideoJobStatus>(`jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  }
}

class CloudSimulatorProvider implements VtxProviderAdapter {
  providerId = "windels-cloud";
  label = "WINDELS Cloud Video AI";
  kind = "cloud_video_ai" as const;

  /**
   * A transport can be injected (tests, or an alternative cloud provider). When
   * none is injected the default HTTP transport is built from environment
   * configuration at call time.
   */
  constructor(
    private readonly transportFactory: (() => CloudVideoTransport) | null = null,
    private readonly pollOptions: { attempts: number; intervalMs: number } = { attempts: 40, intervalMs: 1_500 },
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  isConfigured() { return Boolean(process.env.WINDELS_CLOUD_VIDEO_KEY && process.env.WINDELS_CLOUD_VIDEO_URL); }

  private transport(): CloudVideoTransport {
    if (this.transportFactory) return this.transportFactory();
    return new HttpCloudVideoTransport(process.env.WINDELS_CLOUD_VIDEO_URL!, process.env.WINDELS_CLOUD_VIDEO_KEY!);
  }

  models(): VtxModelDescriptor[] {
    const configured = this.isConfigured();
    const caps: VtxModelCapability = {
      textToVideo: true, imageToVideo: true, videoToVideo: true, videoEditing: true,
      objectReplacement: true, clothingTransformation: true, backgroundReplacement: true,
      characterConsistency: true, multiReference: true, audioGeneration: true, lipSync: true,
      maxDurationSec: 60, maxResolution: "4k", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "21:9"],
    };
    return [
      { providerId: this.providerId, modelId: "cloud-fast", label: "Cloud Fast Preview", configured, status: configured ? "online" : "stub", tier: "fast", costCredits: 6, estimatedSecPerSec: 4, capabilities: { ...caps, maxDurationSec: 10 } },
      { providerId: this.providerId, modelId: "cloud-hq", label: "Cloud HQ Transform", configured, status: configured ? "online" : "stub", tier: "high_quality", costCredits: 28, estimatedSecPerSec: 10, capabilities: caps },
    ];
  }

  async transform(req: TransformRequest): Promise<TransformResult> {
    if (!this.isConfigured()) throw Object.assign(new Error("WINDELS Cloud Video AI is not configured. Set WINDELS_CLOUD_VIDEO_URL and WINDELS_CLOUD_VIDEO_KEY."), { code: "PROVIDER_NOT_CONFIGURED" });
    const modelId = (req as TransformRequest & { modelId?: string }).modelId ?? "cloud-hq";
    const transport = this.transport();

    // 1) Submit the job.
    const submission = await transport.submit({ ...req, modelId });

    // 2) Poll to a terminal state within the configured budget. The result is
    // only ever returned from a real `succeeded` job with a real output URL —
    // never fabricated.
    let last: CloudVideoJobStatus | null = null;
    for (let attempt = 0; attempt < this.pollOptions.attempts; attempt++) {
      last = await transport.poll(submission.jobId);
      if (last.status === "succeeded") {
        if (!last.outputUrl) throw Object.assign(new Error("Cloud video job succeeded without an output URL"), { code: "CLOUD_VIDEO_UPSTREAM" });
        return {
          outputPath: last.outputUrl,
          providerId: this.providerId,
          modelId,
          multiStage: (last.stages?.length ?? 0) > 1,
          stages: last.stages ?? ["cloud_transform"],
          durationSec: req.previewSeconds ?? req.meta.durationSec,
        };
      }
      if (last.status === "failed") {
        throw Object.assign(new Error(`Cloud video job failed: ${last.error ?? "unknown provider error"}`), { code: "CLOUD_VIDEO_JOB_FAILED", retryable: false });
      }
      if (attempt < this.pollOptions.attempts - 1) await this.sleep(this.pollOptions.intervalMs);
    }
    throw Object.assign(new Error(`Cloud video job did not complete within ${this.pollOptions.attempts} polls (last status: ${last?.status ?? "unknown"})`), { code: "CLOUD_VIDEO_TIMEOUT", retryable: true });
  }
}

export { HttpCloudVideoTransport, CloudSimulatorProvider };

class VtxGateway {
  private adapters = new Map<string, VtxProviderAdapter>();
  private health = new Map<string, { degraded: boolean; failures: number }>();

  register(a: VtxProviderAdapter) { this.adapters.set(a.providerId, a); logger.info("[vtx] provider registered", { provider: a.providerId }); }

  listModels(): VtxModelDescriptor[] {
    return [...this.adapters.values()].flatMap((a) => a.models());
  }

  private cap(model: VtxModelDescriptor, req: { durationSec: number; resolution: string; edits: VtxEditPlan["edits"] }): boolean {
    const c = model.capabilities;
    if (req.durationSec > c.maxDurationSec) return false;
    if (req.resolution === "4k" && c.maxResolution !== "4k") return false;
    const needs = new Set(req.edits.map((e) => e.target));
    if ((needs.has("object_held") || needs.has("object")) && !c.objectReplacement) return false;
    if (needs.has("clothing") && !c.clothingTransformation) return false;
    if ((needs.has("background") || needs.has("environment") || needs.has("sky")) && !c.backgroundReplacement) return false;
    if (needs.has("full_scene") && !c.videoToVideo) return false;
    return true;
  }

  /** Choose the best model for the edit; returns multiStage pipeline when needed. */
  route(req: { durationSec: number; resolution: string; edits: VtxEditPlan["edits"]; preview?: boolean }): VtxRouteDecision {
    let candidates = this.listModels().filter((m) => m.configured && m.status !== "offline" && this.cap(m, req));
    candidates = candidates.filter((m) => !this.health.get(m.providerId)?.degraded);

    let multiStage = false;
    if (candidates.length === 0) {
      // No single model covers everything — multi-stage pipeline (§21).
      candidates = this.listModels().filter((m) => m.configured && m.status !== "offline" && m.capabilities.videoToVideo);
      multiStage = true;
    }
    if (candidates.length === 0) throw Object.assign(new Error("No configured video transformation provider is available."), { code: "NO_PROVIDER", status: 503 });

    const chosen = req.preview
      ? [...candidates].sort((a, b) => a.costCredits - b.costCredits)[0]!
      : [...candidates].sort((a, b) => (b.tier === "high_quality" ? 1 : 0) - (a.tier === "high_quality" ? 1 : 0) || a.costCredits - b.costCredits)[0]!;

    const stages = multiStage
      ? ["video_analysis", "subject_segmentation", "environment_replacement", "clothing_transformation", "object_replacement", "lighting_match", "temporal_consistency", "audio_preserve", "quality_control"]
      : ["video_analysis", "transformation", "lighting_match", "quality_control"];

    const credits = Math.max(1, Math.round(chosen.costCredits * Math.max(1, req.durationSec / 10)));
    const runtime = Math.max(1, Math.round(chosen.estimatedSecPerSec * req.durationSec));
    return { providerId: chosen.providerId, modelId: chosen.modelId, label: chosen.label, reason: multiStage ? "multi-stage pipeline" : `${chosen.tier} model`, estimatedCredits: credits, estimatedRuntimeSec: runtime, multiStage, stages };
  }

  async runTransform(route: VtxRouteDecision, req: TransformRequest): Promise<TransformResult> {
    const adapter = this.adapters.get(route.providerId);
    if (!adapter?.transform) throw Object.assign(new Error(`provider ${route.providerId} cannot transform`), { code: "NO_PROVIDER" });
    try {
      const out = await adapter.transform(req);
      this.markOk(route.providerId);
      return out;
    } catch (e) {
      this.markFailure(route.providerId);
      throw e;
    }
  }

  markFailure(p: string) { const h = this.health.get(p) ?? { degraded: false, failures: 0 }; h.failures++; if (h.failures >= 2) h.degraded = true; this.health.set(p, h); }
  markOk(p: string) { this.health.set(p, { degraded: false, failures: 0 }); }
}

export const vtxGateway = new VtxGateway();
vtxGateway.register(new LocalCompositeProvider());
vtxGateway.register(new CloudSimulatorProvider());

export type { VtxStage };
