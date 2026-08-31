/**
 * Memory Evolution client — request contract for the PHP/cPanel build.
 *
 * `api` is mocked, so what is asserted is the path, verb and body each call
 * sends. Two details matter here:
 *
 *   1. `recall` passes its filter through as query params, and the backend
 *      validates `limit` (a positive integer) — so the client must not send
 *      empty strings or booleans that would fail that check.
 *   2. `share` posts to a sub-route of the memory id, not to a top-level
 *      /share endpoint, and `consolidate` always sends a `kind` because the
 *      backend defaults it to "merge" only when the key is absent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { meApi } from "./memoryEvolution";

beforeEach(() => {
  apiFn.mockReset();
  apiFn.mockResolvedValue({});
});

describe("memory evolution read endpoints", () => {
  it("requests the dashboard rollup", async () => {
    await meApi.dashboard();
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/dashboard/rollup");
  });

  it("requests the register with no filter by default", async () => {
    await meApi.recall();
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/memories", { params: undefined });
  });

  it("passes a recall filter through as query params", async () => {
    await meApi.recall({ type: "semantic", scope: "team:platform", query: "kernel", limit: 20 });
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/memories", {
      params: { type: "semantic", scope: "team:platform", query: "kernel", limit: 20 },
    });
  });

  it("lists consolidation jobs", async () => {
    await meApi.consolidations();
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/consolidations");
  });
});

describe("memory evolution write endpoints", () => {
  it("posts a new memory", async () => {
    const input = { type: "knowledge" as const, content: "Exchange rate fallback is used.", tags: ["currency"], scope: "enterprise:knowledge", confidence: 0.92 };
    await meApi.add(input);
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/memories", { method: "POST", json: input });
  });

  it("defaults a consolidation to merge and always sends a kind", async () => {
    await meApi.consolidate();
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/consolidate", { method: "POST", json: { kind: "merge" } });
    await meApi.consolidate("deduplicate");
    expect(apiFn).toHaveBeenLastCalledWith("/memory-evolution/consolidate", { method: "POST", json: { kind: "deduplicate" } });
  });

  it("posts a share to the memory's sub-route", async () => {
    await meApi.share("mem-12345678", "agent-7");
    expect(apiFn).toHaveBeenCalledWith("/memory-evolution/memories/mem-12345678/share", {
      method: "POST",
      json: { agentId: "agent-7" },
    });
  });
});
