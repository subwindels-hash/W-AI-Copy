/**
 * A training job must never certify its own safety.
 *
 * `_simulateJob` walked every job through preparing → training → evaluating →
 * governance_review → canary → deployed on a ~450 ms-per-stage timer. Along the
 * way it invented an evaluation score (0.70–0.95) and — the serious part —
 * generated the safety checks themselves, drawing each category's score from
 * `rand(0, threshold * 0.9)`. That is **always** below the threshold, so
 * `safetyPassed` was true by construction and every model reached "deployed"
 * with a clean safety record it had never earned.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { TrainingService, SAFETY_CATS } = await import("./training.service.js");

const OID = "org-test";

async function newJob() {
  return TrainingService.startJob({
    name: "test-job", baseModel: "base-1", datasetId: "ds-1",
    strategy: "lora", hyperparams: {} as any,
    createdBy: "user-1", organizationId: OID,
  });
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("training jobs do not self-advance", () => {
  it("a new job stays queued and does not march to deployed on a timer", async () => {
    const job = await newJob();
    const before = job.status;
    // The old implementation reached "deployed" in roughly 2.7s.
    await new Promise((r) => setTimeout(r, 3000));
    const after = await TrainingService.getJob(job.id, OID);
    expect(after!.status).toBe(before);
    expect(after!.status).not.toBe("deployed");
    expect(after!.completedAt).toBeUndefined();
  }, 10_000);

  it("carries no invented evaluation score", async () => {
    const job = await newJob();
    // Was a random 0.70-0.95 assigned during the fake "evaluating" stage.
    expect(job.evalScore).toBeUndefined();
  });

  it("advances only when a trainer reports a stage", async () => {
    const job = await newJob();
    const updated = await TrainingService.reportStage(
      job.id, { status: "evaluating", progressPct: 60, evalScore: 0.81 }, OID,
    );
    expect(updated!.status).toBe("evaluating");
    expect(updated!.evalScore).toBe(0.81);
  });
});

describe("safety gate cannot be passed by construction", () => {
  it("a fresh job has no safety verdict", async () => {
    const job = await newJob();
    expect(job.safetyPassed).toBeUndefined();
  });

  it("refuses canary promotion when safety has never run", async () => {
    const job = await newJob();
    // Previously only an explicit `false` blocked promotion, so a job whose
    // checks had never executed (undefined) was promotable.
    await expect(TrainingService.promoteToCanary(job.id, 10, OID)).rejects.toThrow(/safety/i);
  });

  it("does not pass until every category has been evaluated", async () => {
    const job = await newJob();
    // Record all but the last category, each passing.
    for (const cat of SAFETY_CATS.slice(0, -1)) {
      await TrainingService.recordSafetyCheck(job.id, { category: cat, score: 0, threshold: 0.05 }, OID);
    }
    const partial = await TrainingService.getJob(job.id, OID);
    expect(partial!.safetyPassed).toBe(false);
    await expect(TrainingService.promoteToCanary(job.id, 10, OID)).rejects.toThrow(/safety/i);
  });

  it("passes only when every category is recorded and each one passes", async () => {
    const job = await newJob();
    for (const cat of SAFETY_CATS) {
      await TrainingService.recordSafetyCheck(job.id, { category: cat, score: 0.001, threshold: 0.05 }, OID);
    }
    const done = await TrainingService.getJob(job.id, OID);
    expect(done!.safetyPassed).toBe(true);
    const canary = await TrainingService.promoteToCanary(job.id, 10, OID);
    expect(canary!.status).toBe("canary");
  });

  it("a single failing category blocks the whole job", async () => {
    const job = await newJob();
    for (const cat of SAFETY_CATS) {
      const over = cat === "pii";
      await TrainingService.recordSafetyCheck(
        job.id, { category: cat, score: over ? 0.9 : 0.001, threshold: 0.05 }, OID,
      );
    }
    const done = await TrainingService.getJob(job.id, OID);
    expect(done!.safetyPassed).toBe(false);
    await expect(TrainingService.promoteToCanary(job.id, 10, OID)).rejects.toThrow(/safety/i);
  });
});
