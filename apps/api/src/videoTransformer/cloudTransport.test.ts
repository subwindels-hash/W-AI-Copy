/**
 * Cloud video-AI transport tests.
 *
 * Previously CloudSimulatorProvider.transform() was a hard
 * `throw new Error("Cloud transform transport not implemented in this build")`.
 * It now runs a real submit → poll → resolve lifecycle over an injectable
 * transport, and an injectable HTTP transport over an injectable `fetch`. These
 * tests exercise the happy path and every honest failure mode without a network
 * or ffmpeg — no Prisma/Redis, so they run green anywhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CloudSimulatorProvider,
  HttpCloudVideoTransport,
  type CloudVideoJobStatus,
  type CloudVideoTransport,
  type TransformRequest,
} from "./providerGateway.js";

const REQ: TransformRequest & { modelId?: string } = {
  sourcePath: "/tmp/in.mp4",
  meta: { width: 1920, height: 1080, durationSec: 12, fps: 30 },
  plan: { edits: [] } as any,
  resolution: "1080p",
  modelId: "cloud-hq",
};

const noSleep = () => Promise.resolve();

beforeEach(() => {
  process.env.WINDELS_CLOUD_VIDEO_URL = "https://cloud.example.test/api";
  process.env.WINDELS_CLOUD_VIDEO_KEY = "test-key";
});
afterEach(() => {
  delete process.env.WINDELS_CLOUD_VIDEO_URL;
  delete process.env.WINDELS_CLOUD_VIDEO_KEY;
  vi.restoreAllMocks();
});

describe("CloudSimulatorProvider.transform lifecycle", () => {
  it("submits then polls until succeeded and returns the real output URL", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ jobId: "job-1", status: "queued" })
      .mockResolvedValueOnce({ jobId: "job-1", status: "processing" })
      .mockResolvedValueOnce({ jobId: "job-1", status: "succeeded", outputUrl: "https://cdn/out.mp4", stages: ["a", "b"] });
    const transport: CloudVideoTransport = { submit: vi.fn(async () => ({ jobId: "job-1" })), poll };
    const provider = new CloudSimulatorProvider(() => transport, { attempts: 5, intervalMs: 1 }, noSleep);

    const result = await provider.transform(REQ);
    expect(result.outputPath).toBe("https://cdn/out.mp4");
    expect(result.providerId).toBe("windels-cloud");
    expect(result.modelId).toBe("cloud-hq");
    expect(result.multiStage).toBe(true);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("throws PROVIDER_NOT_CONFIGURED when env is missing", async () => {
    delete process.env.WINDELS_CLOUD_VIDEO_KEY;
    const provider = new CloudSimulatorProvider(() => ({ submit: vi.fn(), poll: vi.fn() }) as any);
    await expect(provider.transform(REQ)).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
  });

  it("surfaces a failed job as CLOUD_VIDEO_JOB_FAILED (never fabricates output)", async () => {
    const transport: CloudVideoTransport = {
      submit: vi.fn(async () => ({ jobId: "job-2" })),
      poll: vi.fn(async (): Promise<CloudVideoJobStatus> => ({ jobId: "job-2", status: "failed", error: "gpu oom" })),
    };
    const provider = new CloudSimulatorProvider(() => transport, { attempts: 3, intervalMs: 1 }, noSleep);
    await expect(provider.transform(REQ)).rejects.toMatchObject({ code: "CLOUD_VIDEO_JOB_FAILED" });
  });

  it("rejects a succeeded job that has no output URL", async () => {
    const transport: CloudVideoTransport = {
      submit: vi.fn(async () => ({ jobId: "job-3" })),
      poll: vi.fn(async (): Promise<CloudVideoJobStatus> => ({ jobId: "job-3", status: "succeeded" })),
    };
    const provider = new CloudSimulatorProvider(() => transport, { attempts: 2, intervalMs: 1 }, noSleep);
    await expect(provider.transform(REQ)).rejects.toMatchObject({ code: "CLOUD_VIDEO_UPSTREAM" });
  });

  it("times out after the poll budget is exhausted", async () => {
    const transport: CloudVideoTransport = {
      submit: vi.fn(async () => ({ jobId: "job-4" })),
      poll: vi.fn(async (): Promise<CloudVideoJobStatus> => ({ jobId: "job-4", status: "processing" })),
    };
    const provider = new CloudSimulatorProvider(() => transport, { attempts: 3, intervalMs: 1 }, noSleep);
    await expect(provider.transform(REQ)).rejects.toMatchObject({ code: "CLOUD_VIDEO_TIMEOUT" });
    expect(transport.poll).toHaveBeenCalledTimes(3);
  });
});

describe("HttpCloudVideoTransport", () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  it("submits a job with bearer auth and JSON body", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { jobId: "j9" } }));
    const t = new HttpCloudVideoTransport("https://cloud.example.test/api", "sekret", fetchMock as any);
    const out = await t.submit({ ...REQ, modelId: "cloud-fast" } as any);
    expect(out.jobId).toBe("j9");
    const [url, init] = (fetchMock.mock.calls as any[])[0]!;
    expect(String(url)).toBe("https://cloud.example.test/api/jobs");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as any).headers.authorization).toBe("Bearer sekret");
  });

  it("maps a non-OK response to CLOUD_VIDEO_UPSTREAM with status", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: "bad model" } }, 422));
    const t = new HttpCloudVideoTransport("https://cloud.example.test/api", "k", fetchMock as any);
    await expect(t.submit({ ...REQ, modelId: "x" } as any)).rejects.toMatchObject({ code: "CLOUD_VIDEO_UPSTREAM", status: 422 });
  });

  it("maps a network throw to CLOUD_VIDEO_NETWORK_ERROR", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const t = new HttpCloudVideoTransport("https://cloud.example.test/api", "k", fetchMock as any);
    await expect(t.poll("j1")).rejects.toMatchObject({ code: "CLOUD_VIDEO_NETWORK_ERROR" });
  });

  it("throws when the provider omits a job id on submit", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: {} }));
    const t = new HttpCloudVideoTransport("https://cloud.example.test/api", "k", fetchMock as any);
    await expect(t.submit({ ...REQ, modelId: "x" } as any)).rejects.toMatchObject({ code: "CLOUD_VIDEO_UPSTREAM" });
  });

  it("polls a job by id via GET", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { jobId: "j1", status: "processing" } }));
    const t = new HttpCloudVideoTransport("https://cloud.example.test/api", "k", fetchMock as any);
    const status = await t.poll("j1");
    expect(status.status).toBe("processing");
    const [url, init] = (fetchMock.mock.calls as any[])[0]!;
    expect(String(url)).toBe("https://cloud.example.test/api/jobs/j1");
    expect((init as RequestInit).method).toBe("GET");
  });
});
