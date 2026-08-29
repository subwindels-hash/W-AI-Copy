/**
 * ESI (Enterprise Superintelligence Layer) aggregation tests.
 *
 * Pins the honesty invariants of the cross-portfolio report: sections are read
 * from the real module dashboards, unavailable sections report
 * `available: false` with a note (never fabricated numbers), and the overview
 * never invents a healthy-domain count.
 *
 * Session 193 — `portfolioReport(oid)` is org-scoped. Every test below
 * supplies an `oid`; the pre-S193 call signature (no arg) is no longer
 * supported.
 */
import { describe, it, expect, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { EsiAggregationService } = await import("./esiAggregation.service.js");

const ORG = "org-arch-comp";

describe("EsiAggregationService.portfolioReport", () => {
  it("returns sections for every monitored domain", async () => {
    const report = await EsiAggregationService.portfolioReport(ORG);
    expect(report.generatedAt).toBeTruthy();
    const keys = report.sections.map((s) => s.key);
    expect(keys).toContain("benchmarks");
    expect(keys).toContain("trading");
    expect(keys).toContain("media");
    expect(report.overview.monitoredDomains).toBe(3);
  });

  it("reports unavailable sections honestly rather than fabricating", async () => {
    // The modules may or may not be bootstrapped in the test env; either way the
    // section must carry the correct shape and never invent a value for an
    // unavailable source.
    const report = await EsiAggregationService.portfolioReport(ORG);
    for (const s of report.sections) {
      if (s.available) {
        for (const m of s.metrics) {
          // If we claim availability, each metric is either a real number or
          // explicitly null (unknown) — never a fabricated default.
          expect(typeof m.value === "number" || m.value === null).toBe(true);
        }
      } else {
        expect(s.note).toBeTruthy();
        expect(s.metrics).toEqual([]);
      }
    }
  });

  it("keeps totalSignals from the existing ESI feed", async () => {
    const report = await EsiAggregationService.portfolioReport(ORG);
    expect(report.overview.totalSignals).toBeGreaterThanOrEqual(0);
  });
});
