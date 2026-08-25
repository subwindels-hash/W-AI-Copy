/**
 * WINDELS Sports Intelligence — orchestration service.
 *
 * Pipeline:
 *   DATA → VALIDATION → NORMALIZATION → DATA QUALITY → INTELLIGENCE →
 *   FEATURES → PREDICTION → CALIBRATION → VALUE → RISK → CORRELATION →
 *   OPTIMIZATION → VALIDATION → APPROVAL → RESULT → SETTLEMENT →
 *   PERFORMANCE → BACKTESTING → MODEL EVALUATION
 *
 * The service never fabricates missing data and never forces a ticket.
 */

import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { demoDataEnabled } from "../config/demoData.js";
import type {
  SiApproveTicketInput,
  SiAuditEntry,
  SiBacktestParams,
  SiBacktestRun,
  SiDashboard,
  SiDataClass,
  SiDecisionReport,
  SiDriftAlert,
  SiJobKind,
  SiJobRun,
  SiMatch,
  SiModelMetrics,
  SiModelVersion,
  SiOdds,
  SiOperatingMode,
  SiOverrideSettlementInput,
  SiPerformanceSnapshot,
  SiPrediction,
  SiProviderHealth,
  SiResult,
  SiTicket,
  SiTicketConfig,
  SiTicketConfigPatch,
  SiTicketSelection,
} from "@windels/shared/sportsIntelligence";
import {
  SI_CURRENT_MODEL,
  SI_DEFAULT_TICKET_CONFIG,
  SI_DISCLAIMER,
} from "@windels/shared/sportsIntelligence";
import {
  assessDataQuality,
  assessRisk,
  buildCalibrationBuckets,
  calibrateProbability,
  computePerformance,
  confidenceFrom,
  decisionFrom,
  detectDrift,
  engineerFeatures,
  expectedValue,
  impliedProbability,
  lambdasFromFeatures,
  marketProbabilityFromMatrix,
  optimizeTicket,
  pairCorrelation,
  rejectCandidate,
  scoreMatrix,
  settleSelection,
  settleTicket,
} from "./engines.js";
import {
  ApiFootballProvider,
  SandboxProvider,
  TheOddsApiProvider,
  allProviders,
  listProviderHealth,
  providersForMode,
  snapshotHealth,
  toLeague,
  toMatch,
  toTeam,
  type NormalizedFixture,
} from "./providers.js";
import { siDelete, siList, siLookupNatural, siRead, siRememberNatural, siWrite } from "./store.js";

const uid = (p: string) => p + randomUUID().replace(/-/g, "").slice(0, 12);

function inputDataVersion(match: SiMatch, odds: SiOdds | null): string {
  const raw = JSON.stringify({
    m: match.id,
    k: match.kickoffAt,
    s: match.status,
    hf: match.homeForm,
    af: match.awayForm,
    o: odds ? { id: odds.id, p: odds.oddsDecimal, t: odds.observedAt } : null,
    ls: match.lastSyncedAt,
  });
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function defaultMode(): SiOperatingMode {
  if (env.WINDELS_SPORTS_MODE) return env.WINDELS_SPORTS_MODE;
  if (demoDataEnabled()) return "SANDBOX";
  return "PAPER";
}

function dataClassFor(mode: SiOperatingMode): SiDataClass {
  return mode === "SANDBOX" ? "SANDBOX" : "LIVE";
}

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "sports-intelligence", payload });
  } catch { /* best effort */ }
}

async function audit(org: string, actorId: string | null, action: string, resourceType: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null) {
  const rec: SiAuditEntry = {
    id: uid("si-au-"),
    organizationId: org,
    actorId,
    action,
    resourceType,
    resourceId,
    before,
    after,
    reason,
    createdAt: new Date().toISOString(),
  };
  await siWrite("audit", org, rec);
  try {
    const { auditService } = await import("../audit/audit.service.js");
    await auditService.log({
      organizationId: org,
      userId: actorId ?? undefined,
      action: "data.update",
      resourceType: "custom",
      resourceId: resourceId ?? undefined,
      metadata: { module: "sports-intelligence", action, reason },
    });
  } catch { /* optional */ }
}

export const SportsIntelligenceService = {
  async getConfig(org: string): Promise<SiTicketConfig> {
    const stored = await siRead<SiTicketConfig & { organizationId: string; id: string }>("cfg", org, "active");
    if (stored) {
      const { organizationId: _o, id: _i, ...cfg } = stored as SiTicketConfig & { organizationId: string; id: string };
      return { ...SI_DEFAULT_TICKET_CONFIG, ...cfg, automatedExecution: false };
    }
    return {
      ...SI_DEFAULT_TICKET_CONFIG,
      mode: defaultMode(),
      updatedAt: "1970-01-01T00:00:00.000Z",
      updatedBy: null,
    };
  },

  async updateConfig(org: string, patch: SiTicketConfigPatch, actorId: string): Promise<SiTicketConfig> {
    const prev = await this.getConfig(org);
    if (patch.automatedExecution) {
      throw Object.assign(new Error("Automated external execution remains disabled."), { code: "AUTOMATION_DISABLED" });
    }
    if (patch.approvalMode === "AUTOMATED_EXECUTION") {
      throw Object.assign(new Error("AUTOMATED_EXECUTION is not enabled on this deployment."), { code: "AUTOMATION_DISABLED" });
    }
    if (patch.targetOddsMin !== undefined && patch.targetOddsMax !== undefined && patch.targetOddsMin > patch.targetOddsMax) {
      throw Object.assign(new Error("targetOddsMin cannot exceed targetOddsMax."), { code: "INVALID_CONFIG" });
    }
    const next: SiTicketConfig = {
      ...prev,
      ...patch,
      automatedExecution: false,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    if (next.targetOddsMin > next.targetOddsMax) {
      throw Object.assign(new Error("targetOddsMin cannot exceed targetOddsMax."), { code: "INVALID_CONFIG" });
    }
    await siWrite("cfg", org, { ...next, id: "active", organizationId: org });
    await audit(org, actorId, "sports.config.update", "config", "active", prev, next, patch.reason ?? null);
    void emitKernel("sports.config.updated", { organizationId: org, mode: next.mode });
    return next;
  },

  async dashboard(org: string): Promise<SiDashboard> {
    const config = await this.getConfig(org);
    const [matches, predictions, tickets, performance] = await Promise.all([
      this.listMatches(org),
      this.listPredictions(org),
      this.listTickets(org),
      this.performance(org, { range: "30d" }),
    ]);
    const now = Date.now();
    const upcoming = matches.filter((m) => m.status === "SCHEDULED" && Date.parse(m.kickoffAt) >= now);
    const live = matches.filter((m) => m.status === "LIVE" || m.status === "HT");
    const todayPreds = predictions.filter((p) => p.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
    const qualified = todayPreds.filter((p) => p.decision === "QUALIFIED").length;
    const rejected = todayPreds.filter((p) => p.decision !== "QUALIFIED").length;
    const dq = todayPreds.length ? todayPreds.reduce((s, p) => s + p.dataQuality.score, 0) / todayPreds.length : null;
    const conf = todayPreds.length ? todayPreds.reduce((s, p) => s + p.confidence, 0) / todayPreds.length : null;
    const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, REJECTED: 0 };
    for (const p of todayPreds) riskDistribution[p.risk] += 1;
    const providers = await this.providerHealth(org);
    const lastSync = providers
      .map((p) => p.lastFixtureSyncAt || p.lastOddsSyncAt || p.lastSuccessAt)
      .filter((x): x is string => Boolean(x))
      .sort()
      .reverse()[0] ?? null;
    const freshness = lastSync ? (Date.now() - Date.parse(lastSync)) / 60_000 : null;
    const liveProviders = providers.filter((p) => p.status === "ONLINE" || p.status === "DEGRADED");
    let aiStatus: SiDashboard["system"]["aiStatus"] = "READY";
    if (!config.enabled) aiStatus = "DISABLED";
    else if (config.mode !== "SANDBOX" && liveProviders.length === 0) aiStatus = "NO_DATA";
    else if (liveProviders.some((p) => p.status === "DEGRADED")) aiStatus = "DEGRADED";
    const latestTicket = tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return {
      mode: config.mode,
      moduleEnabled: config.enabled,
      ticketEngineEnabled: config.ticketEngineEnabled,
      dataClass: dataClassFor(config.mode),
      disclaimer: SI_DISCLAIMER,
      system: {
        providers,
        lastSyncAt: lastSync,
        dataFreshnessMinutes: freshness,
        aiStatus,
      },
      today: {
        upcomingMatches: upcoming.length,
        liveMatches: live.length,
        qualifiedPredictions: qualified,
        rejectedPredictions: rejected,
        averageDataQuality: dq,
        averageConfidence: conf,
        riskDistribution,
      },
      ticketEngine: { config, latestTicket },
      performance,
    };
  },

  async listMatches(org: string, filter?: { status?: string; live?: boolean; upcoming?: boolean }): Promise<SiMatch[]> {
    const cfg = await this.getConfig(org);
    let rows = (await siList<SiMatch>("match", org)).filter((m) => m.dataClass === dataClassFor(cfg.mode) || m.dataClass === "HISTORICAL");
    if (filter?.status) rows = rows.filter((m) => m.status === filter.status);
    if (filter?.live) rows = rows.filter((m) => m.status === "LIVE" || m.status === "HT");
    if (filter?.upcoming) rows = rows.filter((m) => m.status === "SCHEDULED");
    return rows.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  },

  async getMatch(org: string, id: string): Promise<SiMatch | null> {
    return siRead<SiMatch>("match", org, id);
  },

  async listOdds(org: string, matchId?: string): Promise<SiOdds[]> {
    const rows = await siList<SiOdds>("odds", org);
    return matchId ? rows.filter((o) => o.matchId === matchId) : rows;
  },

  async listPredictions(org: string, filter?: { matchId?: string; decision?: string }): Promise<SiPrediction[]> {
    let rows = await siList<SiPrediction>("pred", org);
    if (filter?.matchId) rows = rows.filter((p) => p.matchId === filter.matchId);
    if (filter?.decision) rows = rows.filter((p) => p.decision === filter.decision);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getPrediction(org: string, id: string): Promise<SiPrediction | null> {
    return siRead<SiPrediction>("pred", org, id);
  },

  async decisionReport(org: string, predictionId: string): Promise<SiDecisionReport | null> {
    const prediction = await this.getPrediction(org, predictionId);
    if (!prediction) return null;
    const match = await this.getMatch(org, prediction.matchId);
    const alts = (await this.listPredictions(org, { matchId: prediction.matchId }))
      .filter((p) => p.id !== prediction.id)
      .map((p) => ({
        selection: `${p.market} ${p.selection}`,
        reason: p.decision === "QUALIFIED" ? "Also qualified" : (p.rejectionReasons[0] ?? p.decision),
      }));
    return { prediction, match, why: prediction.decisionFactors, rejectedAlternatives: alts };
  },

  async listTickets(org: string): Promise<SiTicket[]> {
    return (await siList<SiTicket>("ticket", org)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getTicket(org: string, id: string): Promise<SiTicket | null> {
    return siRead<SiTicket>("ticket", org, id);
  },

  async dailyTickets(org: string, date?: string): Promise<SiTicket[]> {
    const day = date ?? new Date().toISOString().slice(0, 10);
    return (await this.listTickets(org)).filter((t) => t.createdAt.slice(0, 10) === day);
  },

  async listResults(org: string): Promise<SiResult[]> {
    return siList<SiResult>("result", org);
  },

  async listJobs(org: string): Promise<SiJobRun[]> {
    return (await siList<SiJobRun>("job", org)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 80);
  },

  async listAudit(org: string): Promise<SiAuditEntry[]> {
    return (await siList<SiAuditEntry>("audit", org)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  },

  async providerHealth(_org: string): Promise<SiProviderHealth[]> {
    const live = listProviderHealth();
    const known = allProviders();
    const byId = new Map(live.map((h) => [h.providerId, h]));
    return known.map((p) => byId.get(p.id) ?? snapshotHealth({
      providerId: p.id,
      name: p.name,
      status: p.configured() ? "OFFLINE" : "NOT_CONFIGURED",
      available: false,
      lastError: p.configured() ? "No health probe has run yet" : "Provider credentials are not configured",
    }));
  },

  async modelVersions(org: string): Promise<SiModelVersion[]> {
    const stored = await siList<SiModelVersion & { organizationId: string; id: string }>("model", org);
    if (stored.length) return stored;
    return [{
      name: SI_CURRENT_MODEL.name,
      version: SI_CURRENT_MODEL.version,
      featureVersion: SI_CURRENT_MODEL.featureVersion,
      createdAt: "2026-08-25T00:00:00.000Z",
      notes: "Initial Poisson + market-value model. Historical predictions stay pinned to this version.",
      active: true,
    }];
  },

  async modelMetrics(org: string): Promise<SiModelMetrics[]> {
    const versions = await this.modelVersions(org);
    const preds = await this.listPredictions(org);
    const out: SiModelMetrics[] = [];
    for (const v of versions) {
      const subset = preds.filter((p) => p.versions.modelVersion === v.version);
      const snap = computePerformance([], subset, {
        from: "1970-01-01T00:00:00.000Z",
        to: new Date().toISOString(),
        dataClass: subset[0]?.dataClass ?? "LIVE",
      });
      const settled = subset.filter((p) => p.result === "WON" || p.result === "LOST");
      out.push({
        modelName: v.name,
        modelVersion: v.version,
        sampleSize: settled.length,
        accuracy: snap.modelAccuracy,
        winRate: snap.modelAccuracy,
        calibrationError: snap.calibrationError,
        roi: snap.roi,
        expectedValueAccuracy: snap.expectedValue,
        drawdown: snap.maxDrawdown,
        byLeague: Object.fromEntries(Object.entries(snap.byLeague).map(([k, v2]) => [k, { n: v2.n, wins: v2.won, accuracy: v2.winRate }])),
        byMarket: Object.fromEntries(Object.entries(snap.byMarket).map(([k, v2]) => [k, { n: v2.n, wins: v2.won, accuracy: v2.winRate }])),
        computedAt: new Date().toISOString(),
        dataClass: snap.dataClass,
      });
    }
    return out;
  },

  async performance(org: string, query: { range?: string; from?: string; to?: string }): Promise<SiPerformanceSnapshot> {
    const cfg = await this.getConfig(org);
    const { from, to } = resolveRange(query);
    const tickets = await this.listTickets(org);
    const preds = await this.listPredictions(org);
    return computePerformance(tickets, preds, { from, to, dataClass: dataClassFor(cfg.mode) });
  },

  async backtest(org: string, params: SiBacktestParams, actorId: string | null): Promise<SiBacktestRun> {
    const cfg = await this.getConfig(org);
    const preds = (await this.listPredictions(org)).filter((p) => {
      const t = Date.parse(p.createdAt);
      if (t < Date.parse(params.from) || t > Date.parse(params.to)) return false;
      if (params.market && p.market !== params.market) return false;
      if (params.modelVersion && p.versions.modelVersion !== params.modelVersion) return false;
      if (params.minConfidence !== undefined && p.confidence < params.minConfidence) return false;
      if (params.minDataQuality !== undefined && p.dataQuality.score < params.minDataQuality) return false;
      if (params.oddsMin !== undefined && (p.oddsDecimal === null || p.oddsDecimal < params.oddsMin)) return false;
      if (params.oddsMax !== undefined && (p.oddsDecimal === null || p.oddsDecimal > params.oddsMax)) return false;
      if (params.leagueId) {
        /* league filter applied after match join below */
      }
      return p.result === "WON" || p.result === "LOST" || p.result === "VOID";
    });
    const matches = await this.listMatches(org);
    const byId = new Map(matches.map((m) => [m.id, m]));
    const filtered = params.leagueId
      ? preds.filter((p) => byId.get(p.matchId)?.leagueId === params.leagueId || byId.get(p.matchId)?.leagueName === params.leagueId)
      : preds;
    const fauxTickets: SiTicket[] = filtered
      .filter((p) => p.decision === "QUALIFIED")
      .map((p) => ({
        id: `bt-${p.id}`,
        organizationId: org,
        ticketCode: `BT-${p.id.slice(-6)}`,
        createdAt: p.createdAt,
        settledAt: p.createdAt,
        versions: p.versions,
        configSnapshot: cfg,
        totalOdds: p.oddsDecimal,
        selectionCount: 1,
        combinedProbability: p.calibratedProbability,
        confidence: p.confidence,
        risk: p.risk,
        correlation: "LOW",
        dataQualityAvg: p.dataQuality.score,
        status: p.result === "WON" ? "WON" : p.result === "LOST" ? "LOST" : p.result === "VOID" ? "VOID" : "PENDING",
        approvalStatus: "NOT_REQUIRED",
        approvedBy: null,
        approvedAt: null,
        approvalReason: null,
        settlementStatus: "SETTLED",
        noQualifiedReason: null,
        selections: [],
        dataClass: p.dataClass,
      }));
    const result = computePerformance(fauxTickets, filtered, {
      from: params.from,
      to: params.to,
      dataClass: dataClassFor(cfg.mode),
    });
    const run: SiBacktestRun = {
      id: uid("si-bt-"),
      organizationId: org,
      createdAt: new Date().toISOString(),
      createdBy: actorId,
      params,
      result,
      label: "HISTORICAL_SIMULATION",
    };
    await siWrite("backtest", org, run);
    await audit(org, actorId, "sports.backtest.run", "backtest", run.id, null, { params, sample: result.totalPredictions }, "historical simulation — not live performance");
    return run;
  },

  async listBacktests(org: string): Promise<SiBacktestRun[]> {
    return (await siList<SiBacktestRun>("backtest", org)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async driftAlerts(org: string): Promise<SiDriftAlert[]> {
    const stored = await siList<SiDriftAlert & { organizationId: string }>("alert", org);
    return stored;
  },

  async runJob(org: string, kind: SiJobKind, actorId: string | null = null): Promise<SiJobRun> {
    const executionId = uid("si-ex-");
    const existing = await this.listJobs(org);
    const inflight = existing.find((j) => j.kind === kind && j.status === "RUNNING");
    if (inflight) return inflight;
    const run: SiJobRun = {
      id: uid("si-jb-"),
      organizationId: org,
      kind,
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      endedAt: null,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      errors: [],
      providerId: null,
      executionId,
    };
    await siWrite("job", org, run);
    try {
      const stats = await this.executeJob(org, kind, run);
      run.status = stats.errors.length ? "FAILED" : "SUCCEEDED";
      run.recordsProcessed = stats.processed;
      run.recordsCreated = stats.created;
      run.recordsUpdated = stats.updated;
      run.errors = stats.errors;
      run.providerId = stats.providerId;
    } catch (e) {
      run.status = "FAILED";
      run.errors = [e instanceof Error ? e.message : String(e)];
    }
    run.endedAt = new Date().toISOString();
    await siWrite("job", org, run);
    void emitKernel("sports.job.completed", { organizationId: org, kind, status: run.status, executionId });
    return run;
  },

  async executeJob(org: string, kind: SiJobKind, _run: SiJobRun): Promise<{ processed: number; created: number; updated: number; errors: string[]; providerId: string | null }> {
    switch (kind) {
      case "FIXTURE_SYNC": return this.syncFixtures(org);
      case "ODDS_SYNC": return this.syncOdds(org);
      case "MATCH_STATUS_SYNC": return this.syncFixtures(org);
      case "PREDICTION_GENERATION": return this.generatePredictions(org);
      case "DATA_QUALITY": return this.recalculateQuality(org);
      case "TICKET_CANDIDATES": return this.generateDailyTicket(org, null);
      case "RESULT_SYNC": return this.syncResults(org);
      case "RESULT_VERIFICATION": return this.verifyResults(org);
      case "TICKET_SETTLEMENT": return this.settlePending(org);
      case "PERFORMANCE": return this.refreshPerformance(org);
      case "MODEL_MONITORING": return this.monitorModels(org);
      case "PROVIDER_HEALTH": return this.probeProviders(org);
      case "DATA_CLEANUP": return this.cleanup(org);
      default: return { processed: 0, created: 0, updated: 0, errors: [`Unknown job ${kind}`], providerId: null };
    }
  },

  async probeProviders(_org: string) {
    let processed = 0;
    const errors: string[] = [];
    for (const p of allProviders()) {
      try { await p.health(); processed += 1; }
      catch (e) { errors.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { processed, created: 0, updated: processed, errors, providerId: null };
  },

  async syncFixtures(org: string) {
    const cfg = await this.getConfig(org);
    if (!cfg.enabled) return { processed: 0, created: 0, updated: 0, errors: ["MODULE_DISABLED"], providerId: null };
    const providers = providersForMode(cfg.mode);
    if (providers.length === 0) {
      return { processed: 0, created: 0, updated: 0, errors: ["No sports data provider is configured. The system will not invent fixtures."], providerId: null };
    }
    const now = new Date();
    const window = { from: new Date(now.getTime() - 2 * 86400_000), to: new Date(now.getTime() + 5 * 86400_000) };
    let processed = 0, created = 0, updated = 0;
    const errors: string[] = [];
    let lastProvider: string | null = null;
    for (const provider of providers) {
      if (!provider.capabilities.includes("fixtures")) continue;
      lastProvider = provider.id;
      const res = await provider.syncFixtures(org, window);
      if (!res.ok) { errors.push(`${provider.id}: ${res.error}`); continue; }
      for (const fx of res.records) {
        const stats = await this.upsertFixture(org, fx);
        processed += 1;
        if (stats === "created") created += 1;
        else updated += 1;
      }
    }
    return { processed, created, updated, errors, providerId: lastProvider };
  },

  async upsertFixture(org: string, fx: NormalizedFixture): Promise<"created" | "updated"> {
    const now = new Date().toISOString();
    const natural = `${fx.providerId}:${fx.providerMatchId}`;
    const existingId = await siLookupNatural("match", org, natural);
    const league = toLeague(org, fx, now);
    const existingLeague = await siRead<typeof league>("league", org, league.id);
    await siWrite("league", org, existingLeague ? { ...existingLeague, ...league, createdAt: existingLeague.createdAt } : league);
    const home = toTeam(org, fx.providerId, fx.providerHomeId, fx.homeName, league.id, fx.dataClass, now);
    const away = toTeam(org, fx.providerId, fx.providerAwayId, fx.awayName, league.id, fx.dataClass, now);
    await siWrite("team", org, home);
    await siWrite("team", org, away);
    const match = toMatch(org, fx, league.id, home.id, away.id, now);
    if (existingId) {
      const prev = await siRead<SiMatch>("match", org, existingId);
      const next = { ...match, id: existingId, createdAt: prev?.createdAt ?? now };
      await siWrite("match", org, next);
      return "updated";
    }
    await siWrite("match", org, match);
    await siRememberNatural("match", org, natural, match.id);
    return "created";
  },

  async syncOdds(org: string) {
    const cfg = await this.getConfig(org);
    if (!cfg.enabled) return { processed: 0, created: 0, updated: 0, errors: ["MODULE_DISABLED"], providerId: null };
    const providers = providersForMode(cfg.mode);
    const matches = await this.listMatches(org);
    const refs: NormalizedFixture[] = matches.map((m) => ({
      providerId: m.providerId,
      providerMatchId: m.providerMatchId,
      providerLeagueId: m.leagueId,
      leagueName: m.leagueName,
      country: null,
      providerHomeId: m.homeTeamId,
      homeName: m.homeTeamName,
      providerAwayId: m.awayTeamId,
      awayName: m.awayTeamName,
      kickoffAt: m.kickoffAt,
      status: m.status,
      venue: m.venue,
      homeForm: m.homeForm,
      awayForm: m.awayForm,
      homeXg: m.homeXg,
      awayXg: m.awayXg,
      homeLeaguePos: m.homeLeaguePos,
      awayLeaguePos: m.awayLeaguePos,
      restDaysHome: m.restDaysHome,
      restDaysAway: m.restDaysAway,
      injuries: m.injuries,
      lineups: m.lineups,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      dataClass: m.dataClass,
      observedAt: m.lastSyncedAt,
    }));
    let processed = 0, created = 0, updated = 0;
    const errors: string[] = [];
    let lastProvider: string | null = null;
    for (const provider of providers) {
      if (!provider.capabilities.includes("odds")) continue;
      lastProvider = provider.id;
      const res = await provider.syncOdds(org, refs.filter((r) => r.providerId === provider.id || provider.id === "sandbox"));
      if (!res.ok) { errors.push(`${provider.id}: ${res.error}`); continue; }
      for (const od of res.records) {
        const match = matches.find((m) => m.providerMatchId === od.providerMatchId);
        if (!match) continue;
        const natural = `${match.id}:${od.market}:${od.selection}:${od.line ?? ""}`;
        const existingId = await siLookupNatural("odds", org, natural);
        const rec: SiOdds = {
          id: existingId ?? uid("si-od-"),
          organizationId: org,
          matchId: match.id,
          providerId: od.providerId,
          market: od.market,
          selection: od.selection,
          line: od.line,
          oddsDecimal: od.oddsDecimal,
          openingOdds: od.openingOdds,
          impliedProbability: impliedProbability(od.oddsDecimal) ?? 0,
          liquidity: od.liquidity,
          suspended: od.suspended,
          observedAt: od.observedAt,
          dataClass: od.dataClass,
          createdAt: new Date().toISOString(),
        };
        await siWrite("odds", org, rec);
        await siRememberNatural("odds", org, natural, rec.id);
        processed += 1;
        if (existingId) updated += 1; else created += 1;
      }
    }
    if (providers.every((p) => !p.capabilities.includes("odds"))) {
      errors.push("No odds provider is configured. Odds-dependent tickets will not be generated.");
    }
    return { processed, created, updated, errors, providerId: lastProvider };
  },

  async syncResults(org: string) {
    const cfg = await this.getConfig(org);
    const providers = providersForMode(cfg.mode);
    const matches = await this.listMatches(org);
    const refs = matches.map((m) => ({
      providerId: m.providerId, providerMatchId: m.providerMatchId, providerLeagueId: m.leagueId,
      leagueName: m.leagueName, country: null, providerHomeId: m.homeTeamId, homeName: m.homeTeamName,
      providerAwayId: m.awayTeamId, awayName: m.awayTeamName, kickoffAt: m.kickoffAt, status: m.status,
      venue: m.venue, homeForm: m.homeForm, awayForm: m.awayForm, homeXg: m.homeXg, awayXg: m.awayXg,
      homeLeaguePos: m.homeLeaguePos, awayLeaguePos: m.awayLeaguePos, restDaysHome: m.restDaysHome,
      restDaysAway: m.restDaysAway, injuries: m.injuries, lineups: m.lineups, homeScore: m.homeScore,
      awayScore: m.awayScore, dataClass: m.dataClass, observedAt: m.lastSyncedAt,
    }));
    let processed = 0, created = 0, updated = 0;
    const errors: string[] = [];
    let lastProvider: string | null = null;
    for (const provider of providers) {
      if (!provider.capabilities.includes("results") && provider.id !== "api-football" && provider.id !== "sandbox") continue;
      lastProvider = provider.id;
      const res = await provider.syncResults(org, refs);
      if (!res.ok) { errors.push(`${provider.id}: ${res.error}`); continue; }
      for (const r of res.records) {
        const match = matches.find((m) => m.providerMatchId === r.providerMatchId);
        if (!match) continue;
        const natural = `${match.id}:${r.providerId}`;
        const existingId = await siLookupNatural("result", org, natural);
        const rec: SiResult = {
          id: existingId ?? uid("si-rs-"),
          organizationId: org,
          matchId: match.id,
          providerId: r.providerId,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
          status: r.status,
          verified: false,
          verifiedAt: null,
          verificationSource: null,
          raw: r.raw,
          dataClass: r.dataClass,
          observedAt: r.observedAt,
          createdAt: new Date().toISOString(),
        };
        await siWrite("result", org, rec);
        await siRememberNatural("result", org, natural, rec.id);
        processed += 1;
        if (existingId) updated += 1; else created += 1;
      }
    }
    return { processed, created, updated, errors, providerId: lastProvider };
  },

  async verifyResults(org: string) {
    const results = await this.listResults(org);
    let updated = 0;
    for (const r of results) {
      if (r.verified) continue;
      if (r.homeScore === null || r.awayScore === null || r.status !== "FT") continue;
      const next: SiResult = {
        ...r,
        verified: true,
        verifiedAt: new Date().toISOString(),
        verificationSource: r.providerId,
      };
      await siWrite("result", org, next);
      const match = await this.getMatch(org, r.matchId);
      if (match) {
        await siWrite("match", org, { ...match, homeScore: r.homeScore, awayScore: r.awayScore, status: "FT", updatedAt: new Date().toISOString() });
      }
      updated += 1;
    }
    return { processed: results.length, created: 0, updated, errors: [], providerId: null };
  },

  async generatePredictions(org: string) {
    const cfg = await this.getConfig(org);
    if (!cfg.enabled) return { processed: 0, created: 0, updated: 0, errors: ["MODULE_DISABLED"], providerId: null };
    const matches = await this.listMatches(org, { upcoming: true });
    const live = await this.listMatches(org, { live: true });
    const pool = [...matches, ...live];
    const odds = await this.listOdds(org);
    const historical = await this.listPredictions(org);
    const buckets = buildCalibrationBuckets(historical);
    const reliability = averageReliability(await this.providerHealth(org));
    let processed = 0, created = 0, updated = 0;
    for (const match of pool) {
      const matchOdds = odds.filter((o) => o.matchId === match.id && !o.suspended);
      if (matchOdds.length === 0) {
        processed += 1;
        continue;
      }
      for (const od of matchOdds) {
        const pred = this.buildPrediction(org, match, od, cfg, buckets, reliability);
        const natural = `${match.id}:${od.market}:${od.selection}:${od.line ?? ""}:${pred.versions.modelVersion}`;
        const existingId = await siLookupNatural("pred", org, natural);
        if (existingId) {
          const prev = await siRead<SiPrediction>("pred", org, existingId);
          if (prev && prev.result !== "PENDING") continue;
          await siWrite("pred", org, { ...pred, id: existingId, createdAt: prev?.createdAt ?? pred.createdAt });
          updated += 1;
        } else {
          await siWrite("pred", org, pred);
          await siRememberNatural("pred", org, natural, pred.id);
          created += 1;
        }
        processed += 1;
      }
    }
    return { processed, created, updated, errors: [], providerId: null };
  },

  buildPrediction(
    org: string,
    match: SiMatch,
    odds: SiOdds,
    cfg: SiTicketConfig,
    buckets: ReturnType<typeof buildCalibrationBuckets>,
    reliability: number | null,
  ): SiPrediction {
    const quality = assessDataQuality({ match, odds, providerReliability: reliability, staleOddsMinutes: cfg.staleOddsMinutes });
    const features = engineerFeatures(match, odds, odds.openingOdds);
    const lam = lambdasFromFeatures(features);
    let modelProbability: number | null = null;
    if (lam) {
      const matrix = scoreMatrix(lam.home, lam.away);
      modelProbability = marketProbabilityFromMatrix(matrix, odds.market, odds.selection, odds.line);
    }
    const implied = impliedProbability(odds.oddsDecimal);
    const raw = modelProbability ?? implied;
    const { calibrated, calibratedFromHistory } = raw === null
      ? { calibrated: 0, calibratedFromHistory: false }
      : calibrateProbability(raw, buckets);
    const ev = raw === null ? null : expectedValue(calibrated, odds.oddsDecimal);
    const confidence = raw === null ? 0 : confidenceFrom(quality, features, calibratedFromHistory);
    const corr = "LOW" as const;
    const risk = assessRisk({
      calibrated, confidence, ev, odds: odds.oddsDecimal, quality,
      matchStatus: match.status, correlation: corr, selectionCount: 1, config: cfg,
    });
    const reasons = rejectCandidate({
      quality, odds, ev, risk: risk.level, correlation: corr, match,
      calibratedFromHistory, config: cfg, moduleEnabled: cfg.enabled,
      ticketEngineEnabled: cfg.ticketEngineEnabled,
    });
    const decision = raw === null ? "INSUFFICIENT_DATA" : decisionFrom(reasons, ev, risk.level);
    const factors: string[] = [];
    if (modelProbability !== null) factors.push(`Model probability ${(modelProbability * 100).toFixed(1)}% from Poisson goal model.`);
    else factors.push("Model probability unavailable — attacking/defensive averages were missing.");
    factors.push(calibratedFromHistory
      ? `Calibrated against historical buckets to ${(calibrated * 100).toFixed(1)}%.`
      : "Calibration used identity mapping (insufficient historical sample).");
    if (implied !== null) factors.push(`Market implied probability ${(implied * 100).toFixed(1)}% from odds ${odds.oddsDecimal.toFixed(2)}.`);
    if (ev !== null) factors.push(`Expected value ${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}% (not a guaranteed win).`);
    factors.push(`Data quality ${quality.score} (${quality.band}). Missing: ${quality.missingFields.join(", ") || "none"}.`);
    factors.push(`Risk ${risk.level} (score ${risk.score}).`);
    if (reasons.length) factors.push(`Rejected: ${reasons.join(", ")}.`);
    else factors.push("Decision: QUALIFIED — candidate may enter ticket optimization.");
    return {
      id: uid("si-pr-"),
      organizationId: org,
      matchId: match.id,
      market: odds.market,
      selection: odds.selection,
      line: odds.line,
      oddsId: odds.id,
      oddsDecimal: odds.oddsDecimal,
      oddsObservedAt: odds.observedAt,
      modelProbability: modelProbability ?? 0,
      calibratedProbability: calibrated,
      marketImpliedProbability: implied,
      expectedValue: ev,
      confidence,
      risk: risk.level,
      riskScore: risk.score,
      correlationHint: corr,
      dataQuality: quality,
      features,
      versions: {
        modelName: SI_CURRENT_MODEL.name,
        modelVersion: SI_CURRENT_MODEL.version,
        featureVersion: features.version,
        configVersion: SI_CURRENT_MODEL.configVersion,
        inputDataVersion: inputDataVersion(match, odds),
      },
      decision,
      rejectionReasons: reasons,
      decisionFactors: factors,
      result: "PENDING",
      dataClass: match.dataClass,
      createdAt: new Date().toISOString(),
    };
  },

  async recalculateQuality(org: string) {
    const cfg = await this.getConfig(org);
    const preds = await this.listPredictions(org);
    const matches = new Map((await this.listMatches(org)).map((m) => [m.id, m]));
    const odds = new Map((await this.listOdds(org)).map((o) => [o.id, o]));
    let updated = 0;
    for (const p of preds) {
      const match = matches.get(p.matchId);
      if (!match) continue;
      const od = p.oddsId ? odds.get(p.oddsId) ?? null : null;
      const q = assessDataQuality({ match, odds: od, providerReliability: p.dataQuality.providerReliabilityScore, staleOddsMinutes: cfg.staleOddsMinutes });
      await siWrite("pred", org, { ...p, dataQuality: q });
      updated += 1;
    }
    return { processed: preds.length, created: 0, updated, errors: [], providerId: null };
  },

  async generateDailyTicket(org: string, actorId: string | null) {
    const cfg = await this.getConfig(org);
    const day = new Date().toISOString().slice(0, 10);
    const existing = (await this.dailyTickets(org, day)).find((t) => t.status !== "CANCELLED");
    if (existing) {
      return { processed: 1, created: 0, updated: 0, errors: [], providerId: null, ticket: existing };
    }
    if (!cfg.enabled || !cfg.ticketEngineEnabled) {
      const ticket = await this.persistNoTicket(org, cfg, "Sports Intelligence or the AI Ticket Engine is disabled.");
      return { processed: 1, created: 1, updated: 0, errors: [], providerId: null, ticket };
    }
    const preds = (await this.listPredictions(org)).filter((p) => p.result === "PENDING");
    const matches = await this.listMatches(org);
    const matchMap = new Map(matches.map((m) => [m.id, m]));
    const optimized = optimizeTicket({ candidates: preds, matchesById: matchMap, config: cfg });
    if (!optimized.qualified) {
      const ticket = await this.persistNoTicket(org, cfg, optimized.reason ?? "NO QUALIFIED TICKET");
      await audit(org, actorId, "sports.ticket.none", "ticket", ticket.id, null, { reason: ticket.noQualifiedReason }, ticket.noQualifiedReason);
      return { processed: preds.length, created: 1, updated: 0, errors: [], providerId: null, ticket };
    }
    const selections: SiTicketSelection[] = optimized.selected.map((p) => {
      const m = matchMap.get(p.matchId);
      return {
        predictionId: p.id,
        matchId: p.matchId,
        leagueName: m?.leagueName ?? "Unknown",
        matchLabel: m ? `${m.homeTeamName} vs ${m.awayTeamName}` : p.matchId,
        market: p.market,
        selection: p.selection,
        line: p.line,
        oddsDecimal: p.oddsDecimal ?? 0,
        oddsObservedAt: p.oddsObservedAt ?? new Date().toISOString(),
        modelProbability: p.modelProbability,
        calibratedProbability: p.calibratedProbability,
        expectedValue: p.expectedValue,
        confidence: p.confidence,
        risk: p.risk,
        result: "PENDING",
        status: cfg.approvalMode === "USER_APPROVAL_REQUIRED" ? "AWAITING_APPROVAL" : "PENDING",
      };
    });
    const ticket: SiTicket = {
      id: uid("si-tk-"),
      organizationId: org,
      ticketCode: ticketCode(),
      createdAt: new Date().toISOString(),
      settledAt: null,
      versions: {
        modelName: SI_CURRENT_MODEL.name,
        modelVersion: SI_CURRENT_MODEL.version,
        featureVersion: SI_CURRENT_MODEL.featureVersion,
        configVersion: SI_CURRENT_MODEL.configVersion,
        inputDataVersion: createHash("sha256").update(optimized.selected.map((p) => p.id).join(",")).digest("hex").slice(0, 16),
      },
      configSnapshot: cfg,
      totalOdds: optimized.totalOdds,
      selectionCount: selections.length,
      combinedProbability: optimized.combinedProbability,
      confidence: optimized.confidence,
      risk: optimized.risk,
      correlation: optimized.correlation,
      dataQualityAvg: optimized.dataQualityAvg,
      status: cfg.approvalMode === "USER_APPROVAL_REQUIRED" ? "AWAITING_APPROVAL" : "PENDING",
      approvalStatus: cfg.approvalMode === "USER_APPROVAL_REQUIRED" ? "PENDING" : "NOT_REQUIRED",
      approvedBy: null,
      approvedAt: null,
      approvalReason: null,
      settlementStatus: "UNSETTLED",
      noQualifiedReason: null,
      selections,
      dataClass: dataClassFor(cfg.mode),
    };
    await siWrite("ticket", org, ticket);
    await audit(org, actorId, "sports.ticket.created", "ticket", ticket.id, null, { ticketCode: ticket.ticketCode, selections: ticket.selectionCount }, null);
    void emitKernel("sports.ticket.created", { organizationId: org, ticketId: ticket.id, status: ticket.status });
    return { processed: preds.length, created: 1, updated: 0, errors: [], providerId: null, ticket };
  },

  async persistNoTicket(org: string, cfg: SiTicketConfig, reason: string): Promise<SiTicket> {
    const ticket: SiTicket = {
      id: uid("si-tk-"),
      organizationId: org,
      ticketCode: ticketCode(),
      createdAt: new Date().toISOString(),
      settledAt: new Date().toISOString(),
      versions: {
        modelName: SI_CURRENT_MODEL.name,
        modelVersion: SI_CURRENT_MODEL.version,
        featureVersion: SI_CURRENT_MODEL.featureVersion,
        configVersion: SI_CURRENT_MODEL.configVersion,
        inputDataVersion: "none",
      },
      configSnapshot: cfg,
      totalOdds: null,
      selectionCount: 0,
      combinedProbability: null,
      confidence: null,
      risk: null,
      correlation: null,
      dataQualityAvg: null,
      status: "NO_QUALIFIED_TICKET",
      approvalStatus: "NOT_REQUIRED",
      approvedBy: null,
      approvedAt: null,
      approvalReason: null,
      settlementStatus: "SETTLED",
      noQualifiedReason: reason,
      selections: [],
      dataClass: dataClassFor(cfg.mode),
    };
    await siWrite("ticket", org, ticket);
    return ticket;
  },

  async approveTicket(org: string, id: string, input: SiApproveTicketInput, actorId: string): Promise<SiTicket | null> {
    const ticket = await this.getTicket(org, id);
    if (!ticket) return null;
    if (ticket.status === "NO_QUALIFIED_TICKET") {
      throw Object.assign(new Error("There is no ticket to approve."), { code: "NO_QUALIFIED_TICKET" });
    }
    const next: SiTicket = {
      ...ticket,
      approvalStatus: input.decision === "APPROVED" ? "APPROVED" : "REJECTED",
      approvedBy: actorId,
      approvedAt: new Date().toISOString(),
      approvalReason: input.reason,
      status: input.decision === "APPROVED" ? "APPROVED" : "REJECTED_APPROVAL",
    };
    await siWrite("ticket", org, next);
    await audit(org, actorId, "sports.ticket.approval", "ticket", id, { status: ticket.status }, { status: next.status }, input.reason);
    return next;
  },

  async settlePending(org: string) {
    const cfg = await this.getConfig(org);
    const results = (await this.listResults(org)).filter((r) => r.verified);
    const byMatch = new Map(results.map((r) => [r.matchId, r]));
    const preds = await this.listPredictions(org);
    let updated = 0;
    for (const p of preds) {
      if (p.result !== "PENDING") continue;
      const r = byMatch.get(p.matchId);
      if (!r || r.homeScore === null || r.awayScore === null) continue;
      const result = settleSelection(p, r.homeScore, r.awayScore);
      await siWrite("pred", org, { ...p, result });
      updated += 1;
    }
    const tickets = await this.listTickets(org);
    const predMap = new Map((await this.listPredictions(org)).map((p) => [p.id, p]));
    for (const t of tickets) {
      if (t.status === "NO_QUALIFIED_TICKET" || t.settlementStatus === "SETTLED" || t.settlementStatus === "OVERRIDDEN") continue;
      if (t.approvalStatus === "REJECTED") continue;
      const selections = t.selections.map((s) => {
        const p = predMap.get(s.predictionId);
        return p ? { ...s, result: p.result } : s;
      });
      const settled = settleTicket(selections, t.configSnapshot.voidRule ?? cfg.voidRule);
      if (settled.status === "PENDING") {
        await siWrite("ticket", org, { ...t, selections });
        continue;
      }
      await siWrite("ticket", org, {
        ...t,
        selections,
        status: settled.status,
        totalOdds: settled.totalOdds,
        settlementStatus: "SETTLED",
        settledAt: new Date().toISOString(),
      });
      updated += 1;
    }
    return { processed: tickets.length, created: 0, updated, errors: [], providerId: null };
  },

  async overrideSettlement(org: string, id: string, input: SiOverrideSettlementInput, actorId: string): Promise<SiTicket | null> {
    const ticket = await this.getTicket(org, id);
    if (!ticket) return null;
    const next: SiTicket = {
      ...ticket,
      status: input.status,
      settlementStatus: "OVERRIDDEN",
      settledAt: new Date().toISOString(),
    };
    await siWrite("ticket", org, next);
    await audit(org, actorId, "sports.ticket.override", "ticket", id, { status: ticket.status }, { status: next.status }, input.reason);
    return next;
  },

  async refreshPerformance(org: string) {
    const snap = await this.performance(org, { range: "30d" });
    return { processed: snap.totalTickets, created: 0, updated: 1, errors: [], providerId: null };
  },

  async monitorModels(org: string) {
    const current = await this.performance(org, { range: "7d" });
    const baseline = await this.performance(org, { range: "90d" });
    const alerts = detectDrift(current, baseline);
    let created = 0;
    for (const a of alerts) {
      const rec: SiDriftAlert & { organizationId: string } = {
        id: uid("si-dr-"),
        organizationId: org,
        modelName: SI_CURRENT_MODEL.name,
        modelVersion: SI_CURRENT_MODEL.version,
        kind: a.kind,
        message: a.message,
        requiresReview: a.requiresReview,
        createdAt: new Date().toISOString(),
      };
      await siWrite("alert", org, rec);
      created += 1;
    }
    return { processed: alerts.length, created, updated: 0, errors: [], providerId: null };
  },

  async cleanup(org: string) {
    const jobs = await this.listJobs(org);
    let updated = 0;
    if (jobs.length > 200) {
      const extra = jobs.slice(200);
      for (const j of extra) {
        await siDelete("job", org, j.id);
        updated += 1;
      }
    }
    return { processed: jobs.length, created: 0, updated, errors: [], providerId: null };
  },

  async runPipeline(org: string, actorId: string | null = null): Promise<{ jobs: SiJobRun[]; ticket: SiTicket | null }> {
    const jobs: SiJobRun[] = [];
    for (const kind of ["PROVIDER_HEALTH", "FIXTURE_SYNC", "ODDS_SYNC", "PREDICTION_GENERATION", "TICKET_CANDIDATES", "RESULT_SYNC", "RESULT_VERIFICATION", "TICKET_SETTLEMENT", "MODEL_MONITORING"] as SiJobKind[]) {
      jobs.push(await this.runJob(org, kind, actorId));
    }
    const ticket = (await this.dailyTickets(org))[0] ?? null;
    return { jobs, ticket };
  },

  correlationPreview(a: SiPrediction, b: SiPrediction, leagueA: string, leagueB: string) {
    return pairCorrelation(
      { matchId: a.matchId, market: a.market, selection: a.selection, leagueName: leagueA },
      { matchId: b.matchId, market: b.market, selection: b.selection, leagueName: leagueB },
    );
  },
};

function ticketCode(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `WSI-${d}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function resolveRange(query: { range?: string; from?: string; to?: string }): { from: string; to: string } {
  const now = new Date();
  const to = query.to ?? now.toISOString();
  if (query.from) return { from: query.from, to };
  const days = query.range === "today" ? 1 : query.range === "7d" ? 7 : query.range === "90d" ? 90 : 30;
  const from = new Date(now.getTime() - days * 86400_000).toISOString();
  return { from, to };
}

function averageReliability(health: SiProviderHealth[]): number | null {
  const usable = health.filter((h) => h.status === "ONLINE" || h.status === "DEGRADED");
  if (!usable.length) return null;
  const scores = usable.map((h) => {
    if (h.status === "ONLINE") return 92;
    if (h.status === "DEGRADED") return 70;
    return 40;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

void ApiFootballProvider;
void TheOddsApiProvider;
void SandboxProvider;
