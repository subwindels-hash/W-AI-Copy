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
 *  - Trading intelligence reports the catalogue state (markets, agents,
 *    indicators), which is genuinely global.
 *
 * Session 209 — the trading section's per-org column is now real. The two
 * portfolio metrics were hardcoded `null` with a "see S194" note because
 * `TradingIntelService` keeps positions under a single global `ti:positions`
 * key that belongs to no tenant. They now read
 * `BrokerIntegrationService.dashboard(oid)` — already org-scoped — so open
 * positions, connected accounts and today's realised P&L are the caller's own.
 * Catalogue rows are labelled "(global)" and portfolio rows "(this org)" so the
 * two can never be read as the same scope.
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
      // Trading intelligence — the catalogue (markets / agents / indicators) is
      // global by design; the *portfolio* is per-org.
      //
      // Before this change the two per-org metrics were hardcoded `null` with a
      // "see S194" note, because `TradingIntelService.dashboard()` reads a
      // single global `ti:positions` key that belongs to no tenant. Rather than
      // org-scope that seeded demo book, the per-org column now comes from
      // `BrokerIntegrationService.dashboard(oid)`, which is already org-scoped
      // and reports *real* connected-broker positions and realised P&L.
      //
      // The distinction is kept explicit in the labels: catalogue rows say
      // "(global)", portfolio rows say "(this org)". An org with no connected
      // broker reports 0 open positions — that is a measured zero, not a
      // structural one — while an unreachable broker module leaves the two
      // portfolio rows `null` rather than claiming a flat book.
      measure("trading", "Trading Intelligence", async () => {
        const { TradingIntelService } = await import("../tradingIntel/tradingIntel.service.js");
        const d = await TradingIntelService.dashboard(oid);

        let positionsOpen: number | null = null;
        let pnlTodayUsd: number | null = null;
        let connectedAccounts: number | null = null;
        try {
          const { BrokerIntegrationService } = await import("../tradingIntel/brokerIntegration.service.js");
          const b = await BrokerIntegrationService.dashboard(oid);
          positionsOpen = b.positions.length;
          pnlTodayUsd = Math.round(b.pnl.today);
          connectedAccounts = b.health.connectedAccounts;
        } catch {
          // Broker module unavailable — leave the per-org rows null rather than
          // reporting a zero that would read as "no open positions".
        }

        return {
          metrics: [
            { key: "agentsOnline", label: "Agents online (global)", value: d.agentsOnline ?? 0 },
            { key: "markets", label: "Markets (global)", value: Object.keys(d.markets ?? {}).length },
            { key: "indicators", label: "Indicators (global)", value: d.indicators ?? 0 },
            { key: "connectedBrokerAccounts", label: "Connected broker accounts (this org)", value: connectedAccounts },
            { key: "positionsOpen", label: "Open positions (this org)", value: positionsOpen },
            { key: "pnlTodayUsd", label: "P&L today, USD (this org)", value: pnlTodayUsd },
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
            // S211: without this row the section reports a healthy-looking
            // queue for a module that cannot generate anything. The metric
            // contract is numeric, so this is a count of usable capabilities:
            // 0 when no provider is wired (the honest answer today).
            {
              key: "capabilitiesOnline",
              label: "Capabilities online",
              value: d.providersConfigured ? d.capabilities : 0,
            },
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
