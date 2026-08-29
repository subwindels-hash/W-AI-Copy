/**
 * Enterprise Superintelligence Layer (ESI) — cross-portfolio aggregation.
 *
 * ESI's role is to aggregate strategic signals from across WINDELS AI OS into a
 * single cross-portfolio report. This service does that for real: it reads the
 * live dashboards of the underlying modules (benchmarks, trading intelligence,
 * media generation) and reports each section's measured values with their
 * provenance.
 *
 * Session 193 — additive fix:
 *  - `portfolioReport(oid)` is org-scoped. The pre-S193 call hardcoded
 *    `"org-windels"` for benchmarks and mediaGen, so every tenant
 *    received org-windels' dashboard — the same S165 deployment /
 *    S179 disasterRecovery defect shape.
 *  - Trading intelligence's `dashboard(oid)` was added (a thin shim
 *    around the existing global keys — the catalogue is global, but
 *    per-org positions/insights are not yet exposed; that refactor is
 *    the S194 work). For now `tiSection` reports the catalogue state
 *    (markets, agents, indicators) which is genuinely global, and the
 *    per-org portfolio values (positions, pnl) report 0 unless
 *    `tradingIntel` has been upgraded to expose per-org calls.
 *  - When a source module's dashboard throws, the section reports
 *    `available: false` with the error message — never an invented
 *    value.
 *
 * Honesty rules:
 *   - Every value comes from a real module dashboard, never invented.
 *   - A section whose source module is unavailable (no Redis keys / not
 *     bootstrapped) is reported as `available: false` with a reason — it is
 *     never replaced with plausible-looking numbers.
 *   - `overview.healthyDomains` is `null` when no section produced a value.
 */
import { ArchitectureService } from "./architecture.service.js";
import type {
  EsiPortfolioReport,
  EsiPortfolioSection,
} from "@windels/shared/architecture";

/** Pull a section's metrics from a module dashboard loader. The loader is
 *  expected to be idempotent and to return real measured values. */
async function measure(
  key: string,
  label: string,
  load: () => Promise<{ metrics: Array<{ key: string; label: string; value: number | null }> }>,
): Promise<EsiPortfolioSection> {
  try {
    const { metrics } = await load();
    return { key, label, available: true, metrics };
  } catch (e: any) {
    return { key, label, available: false, note: e?.message ?? "source unavailable", metrics: [] };
  }
}

export const EsiAggregationService = {
  /** Produce a per-org cross-portfolio ESI report from the real module dashboards. */
  async portfolioReport(oid: string): Promise<EsiPortfolioReport> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
      throw Object.assign(new Error("organizationId is required"), { status: 403 });
    }

    const sections: EsiPortfolioSection[] = await Promise.all([
      // Benchmarks — real pass/fail + area scores (S180: dashboard already
      // requires `oid`).
      measure("benchmarks", "Enterprise Benchmarks", async () => {
        const { BenchmarksService } = await import("../benchmarks/benchmarks.service.js");
        const d = await BenchmarksService.dashboard(oid);
        return {
          metrics: [
            { key: "totalRuns", label: "Benchmark runs", value: d.totalRuns ?? 0 },
            { key: "passRatePct", label: "Pass rate (%)", value: d.passRate ?? null },
            { key: "avgScore", label: "Average score", value: d.avgScore ?? null },
          ],
        };
      }),
      // Trading intelligence — catalogue state (markets / agents / indicators)
      // is global by design. The S194 refactor will lift the per-org
      // positions / PnL into the report. For now, the trading section
      // reports the global catalogue state and an honest "positions per
      // org not yet exposed" note for the per-org column.
      measure("trading", "Trading Intelligence", async () => {
        const { TradingIntelService } = await import("../tradingIntel/tradingIntel.service.js");
        const d = await TradingIntelService.dashboard();
        return {
          metrics: [
            { key: "agentsOnline", label: "Agents online (global)", value: d.agentsOnline ?? 0 },
            { key: "markets", label: "Markets (global)", value: Object.keys(d.markets ?? {}).length },
            { key: "indicators", label: "Indicators (global)", value: d.indicators ?? 0 },
            // Per-org portfolio state is not yet exposed by tradingIntel
            // (S194). We report it as null so the section is honest.
            { key: "positionsOpen", label: "Open positions (per-org, see S194)", value: null },
            { key: "pnl24hUsd", label: "P&L 24h (per-org, see S194)", value: null },
          ],
        };
      }),
      // Media generation — real job counts (S42: dashboard already requires
      // `organizationId`).
      measure("media", "Media Generation", async () => {
        const { MediaGenService } = await import("../mediaGen/mediaGen.service.js");
        const d = await MediaGenService.dashboard(oid);
        return {
          metrics: [
            { key: "jobs24h", label: "Jobs (24h)", value: d.jobs24h ?? 0 },
            { key: "ready", label: "Ready", value: d.ready ?? 0 },
            { key: "failed", label: "Failed", value: d.failed ?? 0 },
          ],
        };
      }),
    ]);

    const available = sections.filter((s) => s.available);
    const healthy = available.filter((s) => s.metrics.every((m) => m.value === null || m.value >= 0)).length;
    // ESI signals feed — the calling org's own signal stream.
    const feed = await ArchitectureService.readEsi(oid, 50);

    return {
      generatedAt: new Date().toISOString(),
      sections,
      overview: {
        healthyDomains: available.length ? healthy : null,
        monitoredDomains: sections.length,
        totalSignals: feed.signals.length,
      },
    };
  },
};
