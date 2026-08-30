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

  // ── Trading section: per-org portfolio (regression) ────────────────
  // The two portfolio rows used to be hardcoded `null` with a "see S194" note,
  // because tradingIntel's dashboard reads a single global `ti:positions` key.
  // They now come from the org-scoped BrokerIntegrationService.
  describe("trading section", () => {
    function tradingOf(report: Awaited<ReturnType<typeof EsiAggregationService.portfolioReport>>) {
      return report.sections.find((s) => s.key === "trading")!;
    }

    it("no longer carries the placeholder 'see S194' labels", async () => {
      const t = tradingOf(await EsiAggregationService.portfolioReport(ORG));
      for (const m of t.metrics) {
        expect(m.label).not.toMatch(/S194/);
      }
    });

    it("separates global catalogue rows from per-org portfolio rows", async () => {
      const t = tradingOf(await EsiAggregationService.portfolioReport(ORG));
      const byKey = Object.fromEntries(t.metrics.map((m) => [m.key, m]));
      expect(byKey.agentsOnline.label).toMatch(/\(global\)/);
      expect(byKey.markets.label).toMatch(/\(global\)/);
      expect(byKey.indicators.label).toMatch(/\(global\)/);
      expect(byKey.positionsOpen.label).toMatch(/\(this org\)/);
      expect(byKey.pnlTodayUsd.label).toMatch(/\(this org\)/);
      expect(byKey.connectedBrokerAccounts.label).toMatch(/\(this org\)/);
    });

    it("reports an org with no connected broker as a measured zero, not null", async () => {
      const t = tradingOf(await EsiAggregationService.portfolioReport("org-no-broker-" + Date.now()));
      const byKey = Object.fromEntries(t.metrics.map((m) => [m.key, m]));
      // A reachable broker module with no accounts is a real, measured "no open
      // positions" — distinct from the module being unreachable (null).
      expect(byKey.positionsOpen.value).toBe(0);
      expect(byKey.connectedBrokerAccounts.value).toBe(0);
      expect(byKey.pnlTodayUsd.value).toBe(0);
    });

    it("keeps portfolio rows null when the broker module is unreachable", async () => {
      vi.resetModules();
      vi.doMock("../tradingIntel/brokerIntegration.service.js", () => ({
        BrokerIntegrationService: {
          dashboard: async () => { throw new Error("broker module offline"); },
        },
      }));
      const { EsiAggregationService: Svc } = await import("./esiAggregation.service.js");
      const report = await Svc.portfolioReport(ORG);
      const t = report.sections.find((s) => s.key === "trading")!;
      const byKey = Object.fromEntries(t.metrics.map((m) => [m.key, m]));
      expect(byKey.positionsOpen.value).toBeNull();
      expect(byKey.pnlTodayUsd.value).toBeNull();
      // The global catalogue rows still resolve — one module failing must not
      // blank the others.
      expect(typeof byKey.indicators.value).toBe("number");
      vi.doUnmock("../tradingIntel/brokerIntegration.service.js");
      vi.resetModules();
    });
  });
});
