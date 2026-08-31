// @vitest-environment happy-dom
/**
 * Benchmark Center page — a result registry, not a score generator.
 *
 * The module's defining property is that it reports what was recorded and
 * nothing else: a fresh organization shows zero runs and an all-zero area card
 * rather than a plausible-looking baseline, and recording a result requires an
 * evaluator and an evidence reference. Both are asserted from the rendered
 * output, because the fabricated-score version of this module looked exactly
 * the same on screen.
 *
 * The second thing pinned down is the record form's coercion: score and metric
 * value arrive as strings from the inputs and must be sent as numbers, and the
 * page's own fallbacks ("default", "console", "recorded via console") must not
 * be presented to the user as if they were real provenance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const dashboardFn = vi.fn();
const runsFn = vi.fn();
const recordFn = vi.fn();
const scheduleFn = vi.fn();

vi.mock("@/lib/benchmarks", () => ({
  benchmarksApi: {
    dashboard: (...a: unknown[]) => dashboardFn(...a),
    runs: (...a: unknown[]) => runsFn(...a),
    record: (...a: unknown[]) => recordFn(...a),
    schedule: (...a: unknown[]) => scheduleFn(...a),
  },
}));

import { BenchmarksPage } from "./BenchmarksPage";
import type { BmDashboard, BmRun } from "@windels/shared";

const AREA_ZEROS = {
  ai_models: 0, ai_employees: 0, ai_workflows: 0, voice_models: 0, vision_models: 0,
  translation_quality: 0, coding_performance: 0, response_accuracy: 0, latency: 0,
  resource_consumption: 0, cost_efficiency: 0, safety_metrics: 0, reliability: 0,
  user_satisfaction: 0,
};

function run(over: Partial<BmRun> = {}): BmRun {
  return {
    id: "br-aaaaaaaa",
    organizationId: "org-1",
    area: "latency",
    targetName: "gpt-4o",
    status: "completed",
    startedAt: "2026-08-31T09:00:00.000Z",
    completedAt: "2026-08-31T09:00:00.000Z",
    durationMs: 0,
    metrics: [],
    overallScore: 42,
    passed: false,
    metadata: { evaluator: "nightly-harness", evidence: "s3://reports/run-1.json", imported: true },
    ...over,
  };
}

function dashboard(over: Partial<BmDashboard> = {}): BmDashboard {
  return {
    totalRuns: 0,
    completed24h: 0,
    avgScore: 0,
    passRate: 0,
    leaderboard: [],
    areaScores: { ...AREA_ZEROS },
    recentRuns: [],
    feedbackToModelFactory: { optimizedModels: 0, pendingRecommendations: 0 },
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  dashboardFn.mockReset();
  runsFn.mockReset();
  recordFn.mockReset();
  scheduleFn.mockReset();
  dashboardFn.mockResolvedValue(dashboard());
  runsFn.mockResolvedValue([]);
  recordFn.mockResolvedValue(run());
  scheduleFn.mockResolvedValue({ id: "sc-1", area: "ai_models", cron: "0 0 * * *", enabled: true });
});

describe("BenchmarksPage — a fresh organization", () => {
  it("loads only the rollup on mount", async () => {
    render(<BenchmarksPage />);
    await waitFor(() => expect(dashboardFn).toHaveBeenCalled());
    expect(runsFn).not.toHaveBeenCalled();
  });

  it("reports zero runs rather than a plausible baseline", async () => {
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText("Total runs")).toBeTruthy());
    expect(screen.getByText("No results recorded yet.")).toBeTruthy();
    expect(screen.getByText("No runs recorded — a fresh org starts empty.")).toBeTruthy();
  });

  it("shows every evaluation area at zero, not at a seeded score", async () => {
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText("Area scores")).toBeTruthy());
    const card = screen.getByText("Area scores").closest("div[class*='rounded-xl']") as HTMLElement;
    expect(card.querySelectorAll("div.text-2xl").length).toBe(14);
    expect(Array.from(card.querySelectorAll("div.text-2xl")).every((n) => n.textContent === "0")).toBe(true);
    expect(within(card).getByText("latency")).toBeTruthy();
    expect(within(card).getByText("user satisfaction")).toBeTruthy();
  });

  it("surfaces a load failure instead of an empty centre", async () => {
    dashboardFn.mockRejectedValue(new Error("Benchmark registry unavailable"));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText(/Error: Benchmark registry unavailable/)).toBeTruthy());
  });
});

describe("BenchmarksPage — recorded results", () => {
  it("renders the aggregate numbers the API returned", async () => {
    dashboardFn.mockResolvedValue(dashboard({ totalRuns: 3, completed24h: 2, avgScore: 80, passRate: 2 / 3 }));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText("Total runs")).toBeTruthy());
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("spells out area names and shows the last recorded score", async () => {
    dashboardFn.mockResolvedValue(dashboard({ areaScores: { ...AREA_ZEROS, latency: 70 } }));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText("Area scores")).toBeTruthy());
    const card = screen.getByText("Area scores").closest("div[class*='rounded-xl']") as HTMLElement;
    expect(within(card).getByText("latency").parentElement!.textContent).toContain("70");
  });

  it("ranks the leaderboard with the target name and score", async () => {
    dashboardFn.mockResolvedValue(dashboard({
      leaderboard: [
        { area: "reliability", targetName: "steady", overallScore: 95, runs: 1 },
        { area: "latency", targetName: "slow", overallScore: 55, runs: 1 },
      ],
    }));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText("#1")).toBeTruthy());
    expect(screen.getByText("#1").parentElement!.textContent).toContain("reliability — steady");
    expect(screen.getByText("#2").parentElement!.textContent).toContain("latency — slow");
  });

  it("shows who produced a result and where it can be checked", async () => {
    dashboardFn.mockResolvedValue(dashboard({ recentRuns: [run()] }));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText(/nightly-harness · s3:\/\/reports\/run-1\.json/)).toBeTruthy());
  });

  it("says so when a result arrived without evidence", async () => {
    dashboardFn.mockResolvedValue(dashboard({
      recentRuns: [run({ metadata: { evaluator: "console", evidence: undefined as unknown as string, imported: true } })],
    }));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText(/console · no evidence/)).toBeTruthy());
  });

  it("marks a failing verdict as Fail even when the score is high", async () => {
    dashboardFn.mockResolvedValue(dashboard({ recentRuns: [run({ overallScore: 99, passed: false })] }));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByText("Recent runs")).toBeTruthy());
    const runs = screen.getByText("Recent runs").closest("div[class*='rounded-xl']") as HTMLElement;
    // "Fail" is also an option in the record form; the badge is the one that
    // sits inside the runs card.
    expect(within(runs).getByText("Fail")).toBeTruthy();
  });
});

describe("BenchmarksPage — recording a result", () => {
  it("sends numbers, the chosen area and the provenance the user typed", async () => {
    const user = userEvent.setup();
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Target name")).toBeTruthy());

    await user.selectOptions(screen.getAllByRole("combobox")[0]!, "latency");
    await user.type(screen.getByPlaceholderText("Target name"), "gpt-4o");
    await user.type(screen.getByPlaceholderText("Metric label (optional)"), "Accuracy");
    await user.type(screen.getByPlaceholderText("Metric value"), "42");
    await user.clear(screen.getByPlaceholderText("Overall score (0–100)"));
    await user.type(screen.getByPlaceholderText("Overall score (0–100)"), "42");
    await user.type(screen.getByPlaceholderText("Evaluator"), "nightly-harness");
    await user.type(screen.getByPlaceholderText("Evidence reference"), "s3://reports/run-1.json");
    await user.click(screen.getByRole("button", { name: /Record result/ }));

    await waitFor(() => expect(recordFn).toHaveBeenCalled());
    const input = recordFn.mock.calls[0]![0] as Record<string, any>;
    expect(input.area).toBe("latency");
    expect(input.targetName).toBe("gpt-4o");
    expect(input.overallScore).toBe(42);
    expect(typeof input.overallScore).toBe("number");
    expect(input.metrics).toEqual([{ key: "accuracy", label: "Accuracy", value: 42, unit: "", higherIsBetter: true }]);
    expect(input.evaluator).toBe("nightly-harness");
    expect(input.evidence).toBe("s3://reports/run-1.json");
    await waitFor(() => expect(screen.getByText("Benchmark result recorded.")).toBeTruthy());
    expect(dashboardFn.mock.calls.length).toBeGreaterThan(1);
  });

  it("records a result with no metric when only a score is supplied", async () => {
    const user = userEvent.setup();
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Evaluator")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Record result/ }));
    await waitFor(() => expect(recordFn).toHaveBeenCalled());
    const input = recordFn.mock.calls[0]![0] as Record<string, any>;
    expect(input.metrics).toEqual([]);
    // The page's own placeholders are what get recorded when the user leaves
    // provenance blank — the test names them so a future change cannot quietly
    // present them as a real evaluator.
    expect(input.evaluator).toBe("console");
    expect(input.evidence).toBe("recorded via console");
    expect(input.targetName).toBe("default");
  });

  it("surfaces a rejected record instead of pretending it worked", async () => {
    const user = userEvent.setup();
    recordFn.mockRejectedValue(new Error("evaluator must be 1 to 200 characters"));
    render(<BenchmarksPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Record result/ })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Record result/ }));
    await waitFor(() => expect(screen.getByText("evaluator must be 1 to 200 characters")).toBeTruthy());
    expect(screen.queryByText("Benchmark result recorded.")).toBeNull();
  });
});
