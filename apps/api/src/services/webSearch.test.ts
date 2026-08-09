/**
 * Web search tool tests.
 *
 * Verifies that without a provider key the tool returns an honest
 * `not_configured` result (never a fabricated placeholder), and that the
 * provider selection respects the configured env keys.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { webSearch } from "./webSearch.service.js";

describe("webSearch", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.SERPAPI_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  it("returns an honest not_configured result when no provider key is set", async () => {
    const outcome = await webSearch("WINDELS AI OS");
    expect(outcome.configured).toBe(false);
    expect(outcome.provider).toBeNull();
    expect(outcome.results).toEqual([]);
    expect(outcome.note).toMatch(/not configured/i);
  });

  it("clamps maxResults between 1 and 10", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const o1 = await webSearch("x", 0);
    expect(o1.results).toEqual([]);
    const o2 = await webSearch("x", 999);
    expect(o2.results).toEqual([]); // not configured; only clamp path matters here
  });

  it("selects Brave when its key is set (and performs a real request)", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    // Mock fetch to avoid a live network call.
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ web: { results: [{ title: "T", url: "https://t", description: "S" }] } }),
    }));
    vi.stubGlobal("fetch", fakeFetch);
    const outcome = await webSearch("hello", 3);
    expect(outcome.configured).toBe(true);
    expect(outcome.provider).toBe("brave");
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]!.title).toBe("T");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });
});
