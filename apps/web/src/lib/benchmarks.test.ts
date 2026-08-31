/**
 * Benchmarks client — request contract for the PHP/cPanel build.
 *
 * `api` is mocked, so what is asserted is the path, verb and body each call
 * sends. The PHP routes resolve on URI first and only then on the verb, so
 * these four signatures are worth pinning — and the record payload in
 * particular, because the backend rejects a result that arrives without an
 * evaluator and an evidence reference. The client must therefore send those
 * fields through untouched rather than defaulting them away.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { benchmarksApi } from "./benchmarks";

beforeEach(() => {
  apiFn.mockReset();
  apiFn.mockResolvedValue({});
});

describe("benchmarks read endpoints", () => {
  it("requests the dashboard rollup", async () => {
    await benchmarksApi.dashboard();
    expect(apiFn).toHaveBeenCalledWith("/benchmarks/dashboard/rollup");
  });

  it("requests the run register", async () => {
    await benchmarksApi.runs();
    expect(apiFn).toHaveBeenCalledWith("/benchmarks/runs");
  });
});

describe("benchmarks write endpoints", () => {
  it("posts a recorded result with its provenance", async () => {
    const input = {
      area: "latency" as const,
      targetName: "gpt-4o",
      metrics: [{ key: "accuracy", label: "Accuracy", value: 42, unit: "%", higherIsBetter: true }],
      overallScore: 42,
      passed: false,
      evaluator: "nightly-harness",
      evidence: "s3://reports/run-1.json",
    };
    await benchmarksApi.record(input);
    expect(apiFn).toHaveBeenCalledWith("/benchmarks/run", { method: "POST", json: input });
  });

  it("posts a schedule", async () => {
    await benchmarksApi.schedule({ area: "ai_models" as const, cron: "0 3 * * *", enabled: true });
    expect(apiFn).toHaveBeenCalledWith("/benchmarks/schedule", {
      method: "POST",
      json: { area: "ai_models", cron: "0 3 * * *", enabled: true },
    });
  });

  it("does not invent an evaluator or evidence reference", async () => {
    await benchmarksApi.record({
      area: "safety_metrics" as const,
      targetName: "red-team",
      metrics: [],
      overallScore: 91,
      passed: true,
      evaluator: "red-team-2026-07",
      evidence: "https://wiki/redteam/july",
    });
    const input = apiFn.mock.calls[0]![1] as { json: Record<string, unknown> };
    expect(input.json.evaluator).toBe("red-team-2026-07");
    expect(input.json.evidence).toBe("https://wiki/redteam/july");
  });
});
