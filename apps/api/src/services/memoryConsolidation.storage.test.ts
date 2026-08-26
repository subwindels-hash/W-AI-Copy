/**
 * Memory consolidation — real storage-reduction accounting.
 *
 * `storageReduction` was hardcoded `0 // TODO: Calculate actual storage savings`.
 * consolidateCluster() now reports `bytesFreed` = (UTF-8 content bytes of the
 * deleted memories) − (bytes of the new consolidated summary), and the run
 * accumulates it into `stats.storageReduction`. These tests pin the byte math
 * with Prisma / vector-store / AI dependencies mocked — no real infra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  memories: [] as any[],
  created: [] as any[],
  deleted: [] as string[],
  summary: "SUMMARY",
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    agentMemory: {
      findMany: vi.fn(async ({ where }: any) => state.memories.filter((m) => where.id.in.includes(m.id))),
      count: vi.fn(async () => state.memories.length),
      create: vi.fn(async ({ data }: any) => { const row = { id: `c-${state.created.length + 1}`, ...data }; state.created.push(row); return row; }),
      delete: vi.fn(async ({ where }: any) => { state.deleted.push(where.id); return {}; }),
      update: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("../db/redis.js", () => ({ redisCmd: { lpush: vi.fn(), ltrim: vi.fn() } }));
vi.mock("./ai/registry.js", () => ({
  aiRegistry: { complete: vi.fn(async () => ({ content: state.summary })) },
}));
vi.mock("../config/logger.js", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./vectorStorage.service.js", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2]),
  semanticSearch: vi.fn(async () => []),
  deleteEmbedding: vi.fn(async () => {}),
  autoEmbedMemory: vi.fn(async () => {}),
}));

const svc = await import("./memoryConsolidation.service.js");

// The AI summary is mocked to a fixed string (state.summary = "SUMMARY", 7
// bytes), so bytesFreed math is fully deterministic.
const SUMMARY_BYTES = Buffer.byteLength("SUMMARY", "utf8");

function mem(id: string, content: string) {
  return { id, content, tags: [], importance: 1, type: "note", metadata: {}, createdAt: new Date(), agent: {} };
}

beforeEach(() => {
  state.memories = [];
  state.created = [];
  state.deleted = [];
});

describe("consolidateCluster bytesFreed", () => {
  it("reports positive bytes freed when deleted content exceeds the summary", async () => {
    // Two 100-byte memories; centroid retained, one deleted.
    const big = "x".repeat(100);
    state.memories = [mem("m1", big), mem("m2", big)];
    const cluster = { centroidMemoryId: "m1", memoryIds: ["m1", "m2"], avgSimilarity: 0.9, clusterType: "duplicate" as const };

    const result = await svc.consolidateCluster(cluster, "agent-1");
    expect(result).not.toBeNull();
    // Deleted m2 = 100 bytes; summary = 7 bytes.
    expect(result!.bytesFreed).toBe(100 - SUMMARY_BYTES);
    expect(state.deleted).toEqual(["m2"]);
  });

  it("counts every non-centroid member's content bytes", async () => {
    state.memories = [mem("m1", "a".repeat(40)), mem("m2", "b".repeat(60)), mem("m3", "c".repeat(50))];
    const cluster = { centroidMemoryId: "m1", memoryIds: ["m1", "m2", "m3"], avgSimilarity: 0.9, clusterType: "related" as const };

    const result = await svc.consolidateCluster(cluster, "agent-1");
    // Deleted m2 (60) + m3 (50) = 110 bytes removed, minus 7-byte summary.
    expect(result!.bytesFreed).toBe(110 - SUMMARY_BYTES);
    expect(state.deleted.sort()).toEqual(["m2", "m3"]);
  });

  it("returns null (no accounting) for a single-memory cluster", async () => {
    state.memories = [mem("only", "hello")];
    const cluster = { centroidMemoryId: "only", memoryIds: ["only"], avgSimilarity: 1, clusterType: "duplicate" as const };
    const result = await svc.consolidateCluster(cluster, "agent-1");
    expect(result).toBeNull();
    expect(state.deleted).toEqual([]);
  });
});
