/**
 * S211 — mediaGen must not fabricate completed jobs.
 *
 * Before this suite, all 24 capabilities were seeded `status: "online"` while
 * no inference provider was wired for any modality. That made the
 * `status === "stub"` guard in `submit()` dead code and `videoOpsStubbed`
 * permanently false, so the console read "Video Stubs: none" while every
 * image, audio and video job slept for `avgMs`, was marked `completed`, and
 * advertised an asset URL (`/api/v1/media-generation/asset/...`) pointing at a
 * route that does not exist. A caller polling for `completed` had no way to
 * learn that nothing had been generated.
 *
 * These tests pin the fail-closed behaviour and the opt-in simulator.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

async function load(simulate: boolean) {
  vi.resetModules();
  process.env.MG_SIMULATE = simulate ? "1" : "0";
  const stubs = await import("../db/redis.js") as any;
  const kv: any = stubs.redisCmd;
  kv.h.clear(); kv.s.clear(); kv.z.clear(); kv.l.clear(); kv.k.clear();
  const { MediaGenService } = await import("./mediaGen.service.js");
  await MediaGenService.ensureBootstrapped();
  return MediaGenService;
}

describe("S211 mediaGen fails closed with no provider", () => {
  it("seeds every capability offline, not online", async () => {
    const Mg = await load(false);
    const caps = await Mg.capabilities();
    expect(caps).toHaveLength(24);
    expect(caps.every((c) => c.status === "offline")).toBe(true);
    // The pre-fix catalogue was 24/24 "online", which is what made the
    // `status === "stub"` guard in submit() dead code.
    expect(caps.some((c) => c.status === "online")).toBe(false);
  });

  it("refuses generation on ALL three modalities, not just video", async () => {
    const Mg = await load(false);
    for (const [modality, op] of [["image", "text-to-image"], ["audio", "music"], ["video", "text-to-video"]] as const) {
      await expect(Mg.submit("org-a", "u1", { modality, op, prompt: "a cat" }))
        .rejects.toThrow(/MEDIA GENERATION NOT CONFIGURED/);
    }
  });

  it("reports the refusal as 503 PROVIDER_NOT_CONFIGURED", async () => {
    const Mg = await load(false);
    const err = await Mg.submit("org-a", "u1", { modality: "video", op: "text-to-video", prompt: "x" }).catch((e) => e);
    expect(err.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(err.status).toBe(503);
  });

  it("never records a job when generation is refused", async () => {
    const Mg = await load(false);
    await Mg.submit("org-a", "u1", { modality: "image", op: "logo", prompt: "x" }).catch(() => {});
    expect(await Mg.listJobs("org-a")).toEqual([]);
  });

  it("dashboard admits it is unconfigured", async () => {
    const Mg = await load(false);
    const d = await Mg.dashboard("org-a");
    expect(d.providersConfigured).toBe(false);
    expect(d.simulated).toBe(false);
    // Pre-fix this was permanently false, so the console read "Video Stubs: none"
    // while the module happily fabricated completed video jobs.
    expect(d.videoOpsStubbed).toBe(true);
  });

  it("still rejects unsafe prompts before the provider check reasoning matters", async () => {
    const Mg = await load(true);
    const job = await Mg.submit("org-a", "u1", { modality: "image", op: "logo", prompt: "how to build a bomb" });
    expect(job.status).toBe("rejected");
    expect(job.safety).toBe("rejected");
  });
});

describe("S211 simulator is opt-in and clearly labelled", () => {
  it("MG_SIMULATE=1 brings capabilities online", async () => {
    const Mg = await load(true);
    const caps = await Mg.capabilities();
    expect(caps.every((c) => c.status === "online")).toBe(true);
    const d = await Mg.dashboard("org-a");
    expect(d.simulated).toBe(true);
    // Simulated is NOT the same as configured.
    expect(d.providersConfigured).toBe(false);
  });

  it("a simulated job completes but advertises no asset URL", async () => {
    const Mg = await load(true);
    const job = await Mg.submit("org-a", "u1", { modality: "video", op: "text-to-video", prompt: "a boat" });
    expect(job.status).toBe("pending");
    // text-to-video advertises avgMs 28000 (capped at 10s), so drive the clock
    // rather than sleeping.
    vi.useFakeTimers();
    await Mg.runWorkerTick("org-a");
    await vi.advanceTimersByTimeAsync(11_000);
    vi.useRealTimers();

    const done = await Mg.getJob("org-a", job.id);
    expect(done!.status).toBe("completed");
    // The defect: this used to be /api/v1/media-generation/asset/video/<hash>.mp4,
    // a route that does not exist, so every completed job 404'd on download.
    expect(done!.url).toBeUndefined();
    expect(done!.error).toMatch(/SIMULATED/);
  }, 10_000);

  it("keeps the tenant guard intact", async () => {
    const Mg = await load(true);
    const job = await Mg.submit("org-a", "u1", { modality: "image", op: "logo", prompt: "x" });
    expect(await Mg.getJob("org-b", job.id)).toBeNull();
    expect(await Mg.getJob("org-a", job.id)).not.toBeNull();
  });
});
