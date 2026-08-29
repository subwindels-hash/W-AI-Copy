/**
 * Fabrication on LIVE paths — the class the seed gate cannot reach.
 *
 * `config/seedGate.test.ts` covers bootstraps: they run once and can be gated.
 * This file covers the other half, which the gate structurally never applied
 * to: methods that manufacture values on *every call*. A read endpoint that
 * returns invented telemetry, or a write path that stamps invented metrics onto
 * a record the user just created, is unaffected by WINDELS_DEMO_DATA — there is
 * no seed to skip.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { OpsCenterService } = await import("../enterpriseFoundation/opsCenter.service.js");
const { AiValidationService } = await import("../release/aiValidation.service.js");
const { PipelineService } = await import("../release/pipeline.service.js");
const { RagService } = await import("../mlOps/rag.service.js");
const { PromptsService } = await import("../mlOps/prompts.service.js");
const { SprintService } = await import("../program/sprint.service.js");
const { DataFabricService } = await import("../enterpriseFoundation/dataFabric.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("the executive ops dashboard reports no traffic it cannot see", () => {
  it("does not invent a multi-region estate", async () => {
    const g = await OpsCenterService.globalStatus();
    // Five named regions with per-region latency and a traffic split, from a
    // process that cannot observe any region but its own.
    expect(g.regions).toEqual([]);
    expect(g.servicesTotal).toBe(0);
    expect(g.servicesHealthy).toBe(0);
  });

  it("does not invent users, spend or a run rate", async () => {
    const g = await OpsCenterService.globalStatus();
    // Previously 24,891 active users, $18,420 spent today and a $554,000
    // monthly run rate — none of which had any backing source.
    expect(g.activeUsers).toBe(0);
    expect(g.costToday).toBe(0);
    expect(g.monthlyRunRate).toBe(0);
    expect(g.aiRequestsPerMin).toBe(0);
  });

  it("is stable across consecutive reads", async () => {
    // A literal was at least stable; anything that replaced it must not drift
    // per request either, or the dashboard becomes a random-number generator.
    const a = await OpsCenterService.globalStatus();
    const b = await OpsCenterService.globalStatus();
    expect(b.regions).toEqual(a.regions);
    expect(b.activeUsers).toBe(a.activeUsers);
    expect(b.costToday).toBe(a.costToday);
  });
});

describe("release validation cannot pass without running", () => {
  async function newRelease() {
    const rel = await PipelineService.create({
      version: "1.0.0", title: "test release", service: "api",
      strategy: "rolling", author: "tester",
    } as never);
    return rel.id;
  }

  it("starts every check unevaluated rather than passed", async () => {
    const id = await newRelease();
    const result = await AiValidationService.run(id);
    expect(result).not.toBeNull();
    // Ten checks used to ship hardcoded `passed: true`, including "Secrets
    // scan" and "Auth/Z regression".
    expect(result!.checks.every((c) => c.passed === false)).toBe(true);
    expect(result!.checks.every((c) => c.evaluated === false)).toBe(true);
    expect(result!.checks.some((c) => c.name === "Secrets scan")).toBe(true);
  });

  it("scores 0 and does not advance the release", async () => {
    const id = await newRelease();
    const result = await AiValidationService.run(id);
    // It previously scored 100 and set the release to `awaiting_approval`
    // without a single check executing.
    expect(result!.overallPassed).toBe(false);
    expect(result!.score).toBe(0);
    expect(result!.finishedAt).toBeUndefined();
    const rel = await PipelineService.get(id);
    expect((rel as { status?: string } | null)?.status).not.toBe("awaiting_approval");
  });

  it("only finalises once every check has reported", async () => {
    const id = await newRelease();
    const started = await AiValidationService.run(id);
    const names = started!.checks.map((c) => c.name);

    // Report all but the last: still not finished.
    for (const n of names.slice(0, -1)) {
      await AiValidationService.recordCheckResult(id, n, { passed: true });
    }
    let cur = await AiValidationService.get(id);
    expect(cur!.finishedAt).toBeUndefined();
    expect(cur!.overallPassed).toBe(false);

    // The last one lands — now it finalises.
    cur = await AiValidationService.recordCheckResult(id, names[names.length - 1], { passed: true });
    expect(cur!.finishedAt).toBeDefined();
    expect(cur!.overallPassed).toBe(true);
    expect(cur!.score).toBe(100);
  });

  it("rejects when a blocker genuinely fails", async () => {
    const id = await newRelease();
    const started = await AiValidationService.run(id);
    for (const c of started!.checks) {
      await AiValidationService.recordCheckResult(id, c.name, {
        passed: c.name !== "Secrets scan",
        message: c.name === "Secrets scan" ? "AWS key found in src/config" : undefined,
      });
    }
    const cur = await AiValidationService.get(id);
    expect(cur!.overallPassed).toBe(false);
    expect(cur!.score).toBeLessThan(100);
  });
});

describe("a knowledge source is never marked scanned by nobody", () => {
  it("stays indexing, with piiScanned false, until a real indexer reports", async () => {
    const k = await RagService.addSource({
      name: "policies", kind: "s3", uri: "s3://bucket/policies",
    } as never);
    // addSource used to immediately mark the source `indexed` with 20-520
    // invented documents AND set piiScanned = true, so a source could be
    // approved for retrieval on the strength of a scan that never ran.
    expect(k.status).toBe("indexing");
    expect(k.piiScanned).toBe(false);
    expect(k.documents).toBe(0);
    expect(k.vectors).toBe(0);
  });

  it("records a real indexing result, and only then reports piiScanned", async () => {
    const k = await RagService.addSource({
      name: "policies", kind: "s3", uri: "s3://bucket/policies",
    } as never);
    const done = await RagService.recordIndexResult(k.id, {
      documents: 12, chunks: 96, vectors: 96, sizeMb: 7, piiScanned: true,
    });
    expect(done!.status).toBe("indexed");
    expect(done!.documents).toBe(12);
    expect(done!.piiScanned).toBe(true);
  });

  it("does not claim a scan when the indexer did not perform one", async () => {
    const k = await RagService.addSource({
      name: "raw", kind: "s3", uri: "s3://bucket/raw",
    } as never);
    const done = await RagService.recordIndexResult(k.id, {
      documents: 5, chunks: 40, vectors: 40,
    });
    expect(done!.piiScanned).toBe(false);
  });

  it("gives a fresh index no serving telemetry", async () => {
    const idx = await RagService.createIndex({
      name: "kb", dimensions: 1536, embeddingModelId: "text-embed-3",
    } as never);
    // 12-42 ms latency and 50-1550 qps on an index holding zero vectors.
    expect(idx.avgLatencyMs).toBe(0);
    expect(idx.qps).toBe(0);
    expect(idx.vectors).toBe(0);
  });
});

describe("newly created records carry no invented adoption", () => {
  it("a registered prompt has no stars or uses", async () => {
    const p = await PromptsService.register({
      name: "summarise", slug: "summarise", category: "general",
    } as never);
    expect(p.stars).toBe(0);
    expect(p.uses).toBe(0);
  });

  it("a registered connector has no latency or error rate", async () => {
    const c = await DataFabricService.registerConnector({
      name: "warehouse", kind: "postgres", status: "connected",
    } as never);
    expect(c.latencyMs).toBe(0);
    expect(c.errorRatePct).toBe(0);
    expect(c.rowsProcessed24h).toBe(0);
  });
});

describe("sprint planning figures are measured, not drawn", () => {
  it("a new sprint projects no velocity it has not observed", async () => {
    const s = await SprintService.createSprint({ name: "S1", committedPoints: 0 });
    expect(s.velocityProjected).toBe(0);
  });

  it("an unpointed story carries no AI suggestion", async () => {
    const st = await SprintService.createStory({ title: "unpointed" });
    // suggestedPoints was a random 3-11 labelled `suggestSource: "ai_historical"`.
    expect(st.suggestedPoints).toBe(0);
    expect(st.suggestSource).toBeUndefined();
  });

  it("the burndown does not draw a remaining line from noise", async () => {
    const s = await SprintService.createSprint({ name: "S2" });
    // committedPoints is derived from the stories actually assigned, so build
    // the sprint the way the product does rather than asserting on a literal.
    const st = await SprintService.createStory({ title: "work", points: 20 });
    await SprintService.assignToSprint(st.id, s.id);
    const a = await SprintService.burndown(s.id);
    const b = await SprintService.burndown(s.id);
    // `remaining` was `ideal + noise`, so it always tracked the ideal line and
    // a struggling sprint looked identical to a healthy one.
    expect(a).not.toBeNull();
    expect(b!.days.map((d) => d.remaining)).toEqual(a!.days.map((d) => d.remaining));
    // With no story completed, nothing has burned down.
    expect(a!.days[0].remaining).toBe(20);
    // The ideal line is computable and still provided.
    expect(a!.days[0].ideal).toBe(20);
    expect(a!.days[a!.days.length - 1].ideal).toBe(0);
  });
});
