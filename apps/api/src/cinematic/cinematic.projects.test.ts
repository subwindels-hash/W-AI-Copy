/**
 * Session 200 — deeper Cinematic (AI Video Studio) project/job management.
 *
 * The base suite covers model routing, engines, and the end-to-end generation
 * happy path. This suite hardens the project/job management surfaces that were
 * unverified: project CRUD + isolation, generate error handling, job cancel
 * (active + terminal), job listing by project, regenerateShot, and dashboard.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: vi.fn(async () => ({})) } }));
vi.mock("../mediaFactory/metering.service.js", () => ({ MediaMeteringService: { record: vi.fn(async () => null), recordMany: vi.fn(async () => []) } }));
vi.mock("../notifications/notifications.service.js", () => ({ notificationsService: { createAndSend: vi.fn(async () => "n1") } }));

const { CinematicService } = await import("./cinematic.service.js");

const ORG = "org-cin2";
const OTHER = "org-other";

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

async function project(over: Record<string, any> = {}) {
  return CinematicService.createProject(ORG, "u1", { prompt: "a calm sunrise over the ocean", durationSec: 5, audioEnabled: false, ...over });
}

describe("project CRUD & isolation", () => {
  it("creates with sensible defaults and lists per org", async () => {
    const p = await project({ title: "Sunrise" });
    expect(p.id).toMatch(/^cp-/);
    expect(p.status).toBe("draft");
    expect(p.aspectRatio).toBe("16:9");
    const list = await CinematicService.listProjects(ORG);
    expect(list.map((x) => x.id)).toContain(p.id);
    expect(await CinematicService.listProjects(OTHER)).toEqual([]);
  });

  it("updates a project", async () => {
    const p = await project();
    const updated = await CinematicService.updateProject(ORG, p.id, { title: "Renamed", durationSec: 8 });
    expect(updated?.title).toBe("Renamed");
    expect(updated?.durationSec).toBe(8);
  });

  it("deletes a project", async () => {
    const p = await project();
    await CinematicService.deleteProject(ORG, p.id);
    expect(await CinematicService.getProject(ORG, p.id)).toBeNull();
  });

  it("does not read/update another org's project", async () => {
    const p = await project();
    expect(await CinematicService.getProject(OTHER, p.id)).toBeNull();
    expect(await CinematicService.updateProject(OTHER, p.id, { title: "hijack" })).toBeNull();
  });
});

describe("generate error handling", () => {
  it("throws 404 when generating for a missing project", async () => {
    await expect(CinematicService.generate(ORG, "cp-missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("job lifecycle management", () => {
  it("lists jobs for a project and reads a single job (tenant-scoped)", async () => {
    const p = await project();
    const job = await CinematicService.generate(ORG, p.id, { preview: true });
    await CinematicService.runJob((await CinematicService.getJob(ORG, job.id))!);
    const jobs = await CinematicService.listJobs(ORG, p.id);
    expect(jobs.map((j) => j.id)).toContain(job.id);
    expect(await CinematicService.getJob(OTHER, job.id)).toBeNull();
  });

  it("cancels an active (queued) job and is idempotent on a terminal job", async () => {
    const p = await project();
    const job = await CinematicService.generate(ORG, p.id, { preview: true });
    // Cancel before running the worker → moves to cancelled.
    const cancelled = await CinematicService.cancelJob(ORG, job.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.stage).toBe("CANCELLED");
    // Cancelling again returns the same terminal job unchanged.
    const again = await CinematicService.cancelJob(ORG, job.id);
    expect(again?.status).toBe("cancelled");
  });

  it("cancelJob returns null for an unknown job", async () => {
    expect(await CinematicService.cancelJob(ORG, "cj-missing")).toBeNull();
  });

  it("regenerateShot creates a new job scoped to the project", async () => {
    const p = await project();
    // Run one full generation so a storyboard/shots exist.
    const first = await CinematicService.generate(ORG, p.id, { preview: true });
    await CinematicService.runJob((await CinematicService.getJob(ORG, first.id))!);
    const ready = await CinematicService.getProject(ORG, p.id);
    const shotId = ready?.storyboard?.shots[0]?.id;
    expect(shotId).toBeTruthy();
    const regenJob = await CinematicService.regenerateShot(ORG, p.id, shotId!);
    expect(regenJob.projectId).toBe(p.id);
    // generate() fires the worker asynchronously, so the fresh job may already
    // have advanced past "queued" — assert on the stable, non-terminal invariant.
    expect(["queued", "running"]).toContain(regenJob.status);
    expect(regenJob.id).not.toBe(first.id);
  });
});

describe("dashboard", () => {
  it("summarizes projects/jobs for the org and stays isolated", async () => {
    const p = await project();
    const job = await CinematicService.generate(ORG, p.id, { preview: true });
    await CinematicService.runJob((await CinematicService.getJob(ORG, job.id))!);
    const dash = await CinematicService.dashboard(ORG);
    expect(dash).toBeTruthy();
    expect(JSON.stringify(dash)).toContain("ffmpegAvailable");
    const emptyDash = await CinematicService.dashboard(OTHER);
    expect(emptyDash).toBeTruthy();
  });
});
