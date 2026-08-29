import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MediaPipelineService } from "../mediaFactory/pipeline.service.js";
import * as fs from "node:fs";
import * as path from "node:path";

const MEDIA_DIR = path.resolve(process.cwd(), "media-cache");

describe("media pipeline", () => {
  beforeAll(async () => {
    await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
  }, 10_000);

  it("reports ffmpeg availability truthfully", async () => {
    const avail = await MediaPipelineService.rendererAvailable();
    expect(typeof avail).toBe("boolean");
  });

  it("renders a real 1:1 MP4 when ffmpeg is available", async () => {
    if (!(await MediaPipelineService.rendererAvailable())) {
      // Honest skip: cannot run without ffmpeg.
      return;
    }
    const job = await MediaPipelineService.renderVideo({
      title: "Test Card",
      script: "Scene one says hello. Scene two says goodbye. Scene three wraps up.",
      aspect: "1:1",
      durationSec: 6,
    });
    expect(job.status).toBe("ready");
    expect(job.outputPath).toBeTruthy();
    expect(fs.existsSync(job.outputPath!)).toBe(true);
    const stat = fs.statSync(job.outputPath!);
    expect(stat.size).toBeGreaterThan(50_000); // > 50 KB real MP4
    expect(job.width).toBe(1080);
    expect(job.height).toBe(1080);
  }, 120_000);
});
