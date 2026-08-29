/**
 * InfraMetrics must report measured telemetry, never synthesised traffic.
 *
 * This sampler runs on a 15s timer in production, so each fabricated value it
 * wrote became a persistent 60-minute "history" of traffic that never happened
 * (`rps = 500 + Math.random() * 1200`, p95 from a 15-50ms band, error rate
 * offset by `Math.random() - 0.6`) — and those series drove the alert
 * thresholds, so alerts fired on noise.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { InfraMetricsService } = await import("./infraMetrics.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("infra metrics are measured, not invented", () => {
  it("reports zero traffic when no requests have been served", async () => {
    const m = await InfraMetricsService.sample();
    // Previously: 500-1700 rps and a 15-50ms p95 on a process serving nothing.
    expect(m.requestRps).toBe(0);
    expect(m.requestP95Ms).toBe(0);
    expect(m.errorRatePercent).toBe(0);
  });

  it("labels the sample with its real source", async () => {
    const m = await InfraMetricsService.sample();
    // A single-process reading must never be presented as cluster-wide.
    expect(m.source).toBe("process");
    // Pod utilisation is an orchestrator concept a lone process does not have.
    expect(m.clusterPodPercent).toBe(0);
  });

  it("omits deployment readiness rather than inventing it", async () => {
    const m = await InfraMetricsService.sample();
    // Was `100 - Math.floor(Math.random() * 5)`, i.e. a plausible 96-100%.
    expect(m.deploymentReadyPercent).toBeUndefined();
  });

  it("reports CPU and memory within real bounds", async () => {
    const m = await InfraMetricsService.sample();
    expect(m.clusterCpuPercent).toBeGreaterThanOrEqual(0);
    expect(m.clusterCpuPercent).toBeLessThanOrEqual(100);
    // RSS is always non-zero for a running process, so this proves a real read.
    expect(m.clusterMemoryPercent).toBeGreaterThan(0);
    expect(m.clusterMemoryPercent).toBeLessThanOrEqual(100);
  });

  it("does not fire traffic alerts on an idle process", async () => {
    const m = await InfraMetricsService.sample();
    await InfraMetricsService.recomputeAlerts(m);
    const alerts = await InfraMetricsService.alerts();
    // The old error-rate offset could exceed the 2% threshold at random.
    expect(alerts.find((a) => a.id === "elevated-errors")).toBeUndefined();
    // Readiness is unreported, so no degraded-deployment alert either.
    expect(alerts.find((a) => a.id === "degraded-deployments")).toBeUndefined();
  });

  it("persists samples to the ring buffer", async () => {
    await InfraMetricsService.sample();
    await InfraMetricsService.sample();
    const series = await InfraMetricsService.series(10);
    expect(series.length).toBe(2);
    for (const s of series) expect(s.source).toBe("process");
  });
});
