/**
 * Innovation pipeline — org-scoped store + cognitive rollup.
 *
 * Backs the cognitive dashboard's innovationProposalsOpen /
 * innovationPipelineValueUsd (previously structural null). FakeKv, no real infra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { InnovationPipelineService } = await import("./innovationPipeline.service.js");
const ORG = "org-innov";
const OTHER = "org-other";

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("innovation CRUD + rollup", () => {
  it("creates and lists per-org only", async () => {
    await InnovationPipelineService.create(ORG, { title: "A", category: "infra", projectedValueUsd: 100, risk: "low", status: "proposed" });
    expect(await InnovationPipelineService.list(ORG)).toHaveLength(1);
    expect(await InnovationPipelineService.list(OTHER)).toHaveLength(0);
  });

  it("rollup counts only open proposals and sums their projected value", async () => {
    await InnovationPipelineService.create(ORG, { title: "open1", category: "x", projectedValueUsd: 1000, risk: "low", status: "approved" });
    await InnovationPipelineService.create(ORG, { title: "open2", category: "x", projectedValueUsd: 500, risk: "med", status: "executing" });
    await InnovationPipelineService.create(ORG, { title: "closed", category: "x", projectedValueUsd: 9999, risk: "high", status: "rejected" });

    const r = await InnovationPipelineService.rollup(ORG);
    expect(r.openCount).toBe(2);
    expect(r.pipelineValueUsd).toBe(1500);
    expect(r.hasData).toBe(true);
  });

  it("setStatus moves a proposal out of the open set", async () => {
    const p = await InnovationPipelineService.create(ORG, { title: "p", category: "x", projectedValueUsd: 200, risk: "low", status: "proposed" });
    expect((await InnovationPipelineService.rollup(ORG)).openCount).toBe(1);
    await InnovationPipelineService.setStatus(ORG, p.id, "rejected");
    expect((await InnovationPipelineService.rollup(ORG)).openCount).toBe(0);
  });

  it("empty org rollup has hasData=false", async () => {
    expect(await InnovationPipelineService.rollup(ORG)).toMatchObject({ openCount: 0, pipelineValueUsd: 0, hasData: false });
  });

  it("refuses status change on unknown/cross-org proposal", async () => {
    const p = await InnovationPipelineService.create(ORG, { title: "p", category: "x", projectedValueUsd: 1, risk: "low", status: "proposed" });
    await expect(InnovationPipelineService.setStatus(OTHER, p.id, "approved")).rejects.toMatchObject({ status: 404 });
  });
});
