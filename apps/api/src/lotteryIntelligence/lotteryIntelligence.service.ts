/**
 * WINDELS Lottery Intelligence — orchestration.
 *
 * Official data is ingested and validated. Statistics and generators run on
 * stored draws. Scores are statistical-fit / diversity, never win chance.
 */

import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { demoDataEnabled } from "../config/demoData.js";
import type {
  LiAnalyzeInput,
  LiAuditEntry,
  LiBacktestParams,
  LiBacktestResult,
  LiConfig,
  LiConfigPatch,
  LiDashboard,
  LiDistributionSnapshot,
  LiDraw,
  LiGenerateInput,
  LiGeneratedLine,
  LiJobKind,
  LiJobRun,
  LiNumberStat,
  LiOperatingMode,
  LiPairStat,
  LiPerformance,
  LiProviderHealth,
  LiSystemInput,
  LiSystemPlan,
  LiTicket,
  LiTicketCreateInput,
  LiTicketLine,
} from "@windels/shared/lotteryIntelligence";
import {
  EUROMILLIONS_RULES,
  LI_CURRENT_MODEL,
  LI_DEFAULT_CONFIG,
  LI_DISCLAIMER,
} from "@windels/shared/lotteryIntelligence";
import {
  datasetVersion,
  distribution,
  diversityAmong,
  expandSystem,
  generateLines,
  hotCold,
  matchLine,
  numberStats,
  pairStats,
  pickWindow,
  profileCombination,
  systemLineCount,
  validateDrawPayload,
  validateLine,
} from "./engines.js";
import {
  OfficialFeedProvider,
  SandboxLotteryProvider,
  allLotteryProviders,
  listLotteryHealth,
  providersForMode,
  snapshotHealth,
  type NormalizedDraw,
} from "./providers.js";
import { liDelete, liList, liLookupNatural, liRead, liRememberNatural, liUserTicketIds, liWrite } from "./store.js";

const uid = (p: string) => p + randomUUID().replace(/-/g, "").slice(0, 12);

function defaultMode(): LiOperatingMode {
  if (env.WINDELS_LOTTERY_MODE) return env.WINDELS_LOTTERY_MODE;
  if (demoDataEnabled()) return "SANDBOX";
  return "PAPER";
}

function dataClassFor(mode: LiOperatingMode): LiDraw["dataClass"] {
  return mode === "SANDBOX" ? "SANDBOX" : "OFFICIAL";
}

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "lottery-intelligence", payload });
  } catch { /* best effort */ }
}

async function audit(org: string, actorId: string | null, action: string, resourceType: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null) {
  const rec: LiAuditEntry = {
    id: uid("li-au-"), organizationId: org, actorId, action, resourceType, resourceId, before, after, reason,
    createdAt: new Date().toISOString(),
  };
  await liWrite("audit", org, rec);
  try {
    const { auditService } = await import("../audit/audit.service.js");
    await auditService.log({
      organizationId: org, userId: actorId ?? undefined, action: "data.update",
      resourceType: "custom", resourceId: resourceId ?? undefined,
      metadata: { module: "lottery-intelligence", action, reason },
    });
  } catch { /* optional */ }
}

export const LotteryIntelligenceService = {
  rules() {
    return { ...EUROMILLIONS_RULES };
  },

  async getConfig(org: string): Promise<LiConfig> {
    const stored = await liRead<LiConfig & { organizationId: string; id: string }>("cfg", org, "active");
    if (stored) {
      const { organizationId: _o, id: _i, ...cfg } = stored as LiConfig & { organizationId: string; id: string };
      return { ...LI_DEFAULT_CONFIG, ...cfg };
    }
    return { ...LI_DEFAULT_CONFIG, mode: defaultMode(), updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null };
  },

  async updateConfig(org: string, patch: LiConfigPatch, actorId: string): Promise<LiConfig> {
    const prev = await this.getConfig(org);
    const next: LiConfig = {
      ...prev, ...patch, updatedAt: new Date().toISOString(), updatedBy: actorId,
    };
    await liWrite("cfg", org, { ...next, id: "active", organizationId: org });
    await audit(org, actorId, "lottery.config.update", "config", "active", prev, next, patch.reason ?? null);
    void emitKernel("lottery.config.updated", { organizationId: org, mode: next.mode });
    return next;
  },

  async listDraws(org: string, lotteryId = "euromillions"): Promise<LiDraw[]> {
    const cfg = await this.getConfig(org);
    return (await liList<LiDraw>("draw", org))
      .filter((d) => d.lotteryId === lotteryId)
      .filter((d) => d.dataClass === dataClassFor(cfg.mode) || d.dataClass === "UNVERIFIED")
      .sort((a, b) => b.drawDate.localeCompare(a.drawDate));
  },

  async getDraw(org: string, id: string): Promise<LiDraw | null> {
    return liRead<LiDraw>("draw", org, id);
  },

  async windowedDraws(org: string, q?: { lastN?: number; from?: string; to?: string; window?: string }): Promise<LiDraw[]> {
    const cfg = await this.getConfig(org);
    const all = (await this.listDraws(org)).filter((d) => d.validationStatus === "VALID" && d.dataClass === dataClassFor(cfg.mode));
    const lastN = q?.lastN ?? (q?.window && q.window !== "all" && q.window !== "custom" ? Number(q.window) : cfg.defaultWindow);
    return pickWindow(all, lastN, q?.from, q?.to);
  },

  async dashboard(org: string): Promise<LiDashboard> {
    const cfg = await this.getConfig(org);
    const draws = await this.listDraws(org);
    const valid = draws.filter((d) => d.validationStatus === "VALID");
    const last = valid[0] ?? null;
    const window = pickWindow(valid, cfg.defaultWindow);
    const mainStats = numberStats(window, "MAIN", EUROMILLIONS_RULES.mainMin, EUROMILLIONS_RULES.mainMax, Math.min(10, window.length));
    const bonusStats = numberStats(window, "BONUS", EUROMILLIONS_RULES.bonusMin, EUROMILLIONS_RULES.bonusMax, Math.min(10, window.length));
    const hc = hotCold(mainStats, 6);
    const hb = hotCold(bonusStats, 4);
    const providers = await this.providerHealth();
    const stale = last
      ? (Date.now() - Date.parse(last.retrievedAt)) / 36e5 > cfg.staleHours
      : cfg.mode !== "SANDBOX";
    return {
      mode: cfg.mode,
      moduleEnabled: cfg.enabled,
      lotteryEnabled: cfg.euromillionsEnabled,
      dataClass: dataClassFor(cfg.mode),
      disclaimer: LI_DISCLAIMER,
      rules: this.rules(),
      nextDrawHint: "EuroMillions draws are typically Tuesday and Friday evenings. Confirm locally — this is not an official countdown feed.",
      lastDraw: last,
      jackpotMinor: last?.jackpotMinor ?? null,
      currency: last?.currency ?? cfg.currency,
      stale,
      hotMain: hc.hot,
      coldMain: hc.cold,
      recentMain: last?.mainNumbers ?? [],
      longestGaps: [...mainStats].sort((a, b) => (b.drawsSince ?? -1) - (a.drawsSince ?? -1)).slice(0, 6).map((s) => ({ number: s.number, drawsSince: s.drawsSince })),
      hotBonus: hb.hot,
      coldBonus: hb.cold,
      recentBonus: last?.bonusNumbers ?? [],
      providers,
      performance: await this.performance(org),
    };
  },

  async numberIntelligence(org: string, kind: "MAIN" | "BONUS", q?: { lastN?: number; from?: string; to?: string; window?: string }): Promise<LiNumberStat[]> {
    const draws = await this.windowedDraws(org, q);
    const rules = this.rules();
    if (kind === "BONUS") return numberStats(draws, "BONUS", rules.bonusMin, rules.bonusMax, Math.min(10, draws.length));
    return numberStats(draws, "MAIN", rules.mainMin, rules.mainMax, Math.min(10, draws.length));
  },

  async distribution(org: string, q?: { lastN?: number; from?: string; to?: string; window?: string }): Promise<LiDistributionSnapshot> {
    return distribution(await this.windowedDraws(org, q), this.rules());
  },

  async pairs(org: string, kind: "MAIN" | "BONUS", q?: { lastN?: number }): Promise<LiPairStat[]> {
    return pairStats(await this.windowedDraws(org, q), kind, Math.min(10, q?.lastN ?? 25)).slice(0, 40);
  },

  async analyze(org: string, input: LiAnalyzeInput) {
    const rules = this.rules();
    const errors = validateLine(input.mainNumbers, input.bonusNumbers, rules);
    if (errors.length) {
      throw Object.assign(new Error(errors.join("; ")), { code: "INVALID_COMBINATION" });
    }
    const draws = await this.windowedDraws(org, { lastN: input.window });
    const stats = numberStats(draws, "MAIN", rules.mainMin, rules.mainMax, Math.min(10, draws.length));
    const dist = distribution(draws, rules);
    const profile = profileCombination(input.mainNumbers, input.bonusNumbers, rules, stats, dist);
    return {
      profile,
      disclaimer: LI_DISCLAIMER,
      note: "Statistical-fit score is not a win probability. Every valid 5+2 line has the same mathematical chance of being drawn.",
    };
  },

  async generate(org: string, input: LiGenerateInput): Promise<{ lines: LiGeneratedLine[]; disclaimer: string }> {
    const cfg = await this.getConfig(org);
    if (!cfg.enabled || !cfg.euromillionsEnabled) {
      throw Object.assign(new Error("Lottery Intelligence is disabled"), { code: "MODULE_DISABLED" });
    }
    const count = Math.min(input.count, cfg.maxGenerateLines);
    const draws = await this.windowedDraws(org, { lastN: input.window ?? cfg.defaultWindow });
    const rules = this.rules();
    const stats = [
      ...numberStats(draws, "MAIN", rules.mainMin, rules.mainMax, Math.min(10, draws.length)),
      ...numberStats(draws, "BONUS", rules.bonusMin, rules.bonusMax, Math.min(10, draws.length)),
    ];
    const dist = distribution(draws, rules);
    const lines = generateLines({
      rules, mode: input.mode, count,
      lockedMain: input.lockedMain, excludedMain: input.excludedMain,
      lockedBonus: input.lockedBonus, excludedBonus: input.excludedBonus,
      stats, dist, inputDataVersion: datasetVersion(draws),
    });
    return { lines, disclaimer: LI_DISCLAIMER };
  },

  async systemPlan(org: string, input: LiSystemInput): Promise<LiSystemPlan> {
    const cfg = await this.getConfig(org);
    const rules = this.rules();
    for (const n of input.mainPool) {
      if (n < rules.mainMin || n > rules.mainMax) throw Object.assign(new Error(`Invalid main number ${n}`), { code: "INVALID_COMBINATION" });
    }
    for (const n of input.bonusPool) {
      if (n < rules.bonusMin || n > rules.bonusMax) throw Object.assign(new Error(`Invalid ${rules.bonusLabel} ${n}`), { code: "INVALID_COMBINATION" });
    }
    const counts = systemLineCount(input.mainPool, input.bonusPool, rules);
    const expand = input.expand !== false;
    const expanded = expand
      ? expandSystem(input.mainPool, input.bonusPool, rules, cfg.maxSystemLines)
      : { lines: [], truncated: counts.totalLines > 0 };
    return {
      lotteryId: input.lotteryId,
      mainPool: [...input.mainPool].sort((a, b) => a - b),
      bonusPool: [...input.bonusPool].sort((a, b) => a - b),
      ...counts,
      estimatedCostMinor: cfg.linePriceMinor !== null ? cfg.linePriceMinor * counts.totalLines : null,
      currency: cfg.currency,
      truncated: expanded.truncated || counts.totalLines > cfg.maxSystemLines,
      lines: expanded.lines,
    };
  },

  async saveTicket(org: string, userId: string, input: LiTicketCreateInput): Promise<LiTicket> {
    const cfg = await this.getConfig(org);
    const rules = this.rules();
    const draws = await this.windowedDraws(org, { lastN: cfg.defaultWindow });
    const stats = numberStats(draws, "MAIN", rules.mainMin, rules.mainMax, 10);
    const dist = distribution(draws, rules);
    const lines: LiTicketLine[] = input.lines.map((l, i) => {
      const errors = validateLine(l.mainNumbers, l.bonusNumbers, rules);
      if (errors.length) throw Object.assign(new Error(`Line ${i + 1}: ${errors.join("; ")}`), { code: "INVALID_COMBINATION" });
      return {
        id: uid("li-ln-"),
        mainNumbers: [...l.mainNumbers].sort((a, b) => a - b),
        bonusNumbers: [...l.bonusNumbers].sort((a, b) => a - b),
        mode: l.mode ?? input.generationMode,
        profile: profileCombination(l.mainNumbers, l.bonusNumbers, rules, stats, dist),
        matchMain: null, matchBonus: null, prizeTier: null,
      };
    });
    const rec: LiTicket = {
      id: uid("li-tk-"),
      organizationId: org,
      userId,
      lotteryId: input.lotteryId,
      name: input.name,
      createdAt: new Date().toISOString(),
      drawDate: input.drawDate ?? null,
      drawId: null,
      lines,
      generationMode: input.generationMode,
      lockedMain: input.lockedMain,
      excludedMain: input.excludedMain,
      lockedBonus: input.lockedBonus,
      excludedBonus: input.excludedBonus,
      versions: {
        modelName: LI_CURRENT_MODEL.name,
        modelVersion: LI_CURRENT_MODEL.version,
        strategyVersion: LI_CURRENT_MODEL.strategyVersion,
        statsVersion: LI_CURRENT_MODEL.statsVersion,
        rulesVersion: rules.version,
        inputDataVersion: datasetVersion(draws),
      },
      status: "SAVED",
      dataClass: dataClassFor(cfg.mode),
      checkedAt: null,
    };
    await liWrite("ticket", org, rec);
    await audit(org, userId, "lottery.ticket.save", "ticket", rec.id, null, { name: rec.name, lines: rec.lines.length }, null);
    return rec;
  },

  async listTickets(org: string, userId: string, isAdmin = false): Promise<LiTicket[]> {
    if (isAdmin) {
      return (await liList<LiTicket>("ticket", org)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    const ids = await liUserTicketIds(org, userId);
    const out: LiTicket[] = [];
    for (const id of ids) {
      const t = await liRead<LiTicket>("ticket", org, id);
      if (t && t.userId === userId) out.push(t);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getTicket(org: string, userId: string, id: string, isAdmin = false): Promise<LiTicket | null> {
    const t = await liRead<LiTicket>("ticket", org, id);
    if (!t) return null;
    if (!isAdmin && t.userId !== userId) return null;
    return t;
  },

  async deleteTicket(org: string, userId: string, id: string, isAdmin = false): Promise<boolean> {
    const t = await this.getTicket(org, userId, id, isAdmin);
    if (!t) return false;
    const ok = await liDelete("ticket", org, id);
    if (ok) await audit(org, userId, "lottery.ticket.delete", "ticket", id, { name: t.name }, null, null);
    return ok;
  },

  async checkTickets(org: string) {
    const draws = (await this.listDraws(org)).filter((d) => d.verified && d.validationStatus === "VALID");
    const tickets = await liList<LiTicket>("ticket", org);
    let updated = 0;
    for (const t of tickets) {
      const draw = t.drawId
        ? draws.find((d) => d.id === t.drawId)
        : t.drawDate
          ? draws.find((d) => d.drawDate.slice(0, 10) === t.drawDate!.slice(0, 10))
          : draws[0];
      if (!draw) continue;
      const lines = t.lines.map((l) => {
        const m = matchLine(l.mainNumbers, l.bonusNumbers, draw);
        return { ...l, matchMain: m.main, matchBonus: m.bonus, prizeTier: m.tier };
      });
      await liWrite("ticket", org, {
        ...t, lines, drawId: draw.id, status: "CHECKED", checkedAt: new Date().toISOString(),
      });
      updated += 1;
    }
    return { processed: tickets.length, created: 0, updated, errors: [] as string[], providerId: null };
  },

  async backtest(org: string, params: LiBacktestParams, actorId: string | null): Promise<LiBacktestResult> {
    const cfg = await this.getConfig(org);
    const rules = this.rules();
    const draws = await this.windowedDraws(org, { lastN: params.lastN, from: params.from, to: params.to });
    const statsAll = [
      ...numberStats(draws, "MAIN", rules.mainMin, rules.mainMax, 10),
      ...numberStats(draws, "BONUS", rules.bonusMin, rules.bonusMax, 10),
    ];
    const matches: Record<string, number> = {};
    const prizeTiers: Record<string, number> = {};
    const drawResults: LiBacktestResult["drawResults"] = [];
    let linesGenerated = 0;

    const runStrategy = (mode: LiBacktestParams["strategy"]) => {
      const mAcc: Record<string, number> = {};
      const tAcc: Record<string, number> = {};
      for (let i = 0; i < draws.length; i++) {
        const history = draws.slice(0, i);
        const target = draws[i]!;
        const dist = distribution(history, rules);
        const stats = history.length
          ? [
            ...numberStats(history, "MAIN", rules.mainMin, rules.mainMax, 10),
            ...numberStats(history, "BONUS", rules.bonusMin, rules.bonusMax, 10),
          ]
          : statsAll;
        const generated = generateLines({
          rules, mode, count: params.linesPerDraw,
          lockedMain: params.lockedMain ?? [], excludedMain: params.excludedMain ?? [],
          lockedBonus: params.lockedBonus ?? [], excludedBonus: params.excludedBonus ?? [],
          stats, dist: history.length ? dist : null,
          inputDataVersion: datasetVersion(history),
        });
        let bestMain = 0, bestBonus = 0;
        let bestTier: LiBacktestResult["drawResults"][number]["bestTier"] = "NONE";
        for (const g of generated) {
          const hit = matchLine(g.mainNumbers, g.bonusNumbers, target);
          mAcc[`${hit.main}+`] = (mAcc[`${hit.main}+`] ?? 0) + 1;
          tAcc[hit.tier] = (tAcc[hit.tier] ?? 0) + 1;
          if (hit.main > bestMain || (hit.main === bestMain && hit.bonus > bestBonus)) {
            bestMain = hit.main; bestBonus = hit.bonus; bestTier = hit.tier;
          }
        }
        if (mode === params.strategy) {
          linesGenerated += generated.length;
          drawResults.push({ drawId: target.id, drawDate: target.drawDate, bestMain, bestBonus, bestTier });
        }
      }
      return { matches: mAcc, prizeTiers: tAcc };
    };

    const strategy = runStrategy(params.strategy);
    Object.assign(matches, strategy.matches);
    Object.assign(prizeTiers, strategy.prizeTiers);
    const baseline = runStrategy("RANDOM");

    const result: LiBacktestResult = {
      id: uid("li-bt-"),
      organizationId: org,
      createdAt: new Date().toISOString(),
      createdBy: actorId,
      params,
      label: "HISTORICAL_SIMULATION",
      drawsEvaluated: draws.length,
      linesGenerated,
      matches,
      prizeTiers,
      simulatedCostMinor: cfg.linePriceMinor !== null ? cfg.linePriceMinor * linesGenerated : null,
      simulatedWinningsMinor: null,
      simulatedReturn: null,
      drawResults,
      randomBaseline: baseline,
      versions: {
        modelName: LI_CURRENT_MODEL.name,
        modelVersion: LI_CURRENT_MODEL.version,
        strategyVersion: LI_CURRENT_MODEL.strategyVersion,
        statsVersion: LI_CURRENT_MODEL.statsVersion,
        rulesVersion: rules.version,
        inputDataVersion: datasetVersion(draws),
      },
      dataClass: dataClassFor(cfg.mode),
    };
    await liWrite("backtest", org, result);
    await audit(org, actorId, "lottery.backtest.run", "backtest", result.id, null, { strategy: params.strategy, draws: draws.length }, "historical simulation — not a future guarantee");
    return result;
  },

  async compareStrategies(org: string, strategies: LiBacktestParams["strategy"][], lastN: number, actorId: string | null) {
    const runs: LiBacktestResult[] = [];
    for (const strategy of strategies) {
      runs.push(await this.backtest(org, { lotteryId: "euromillions", strategy, linesPerDraw: 1, lastN }, actorId));
    }
    return {
      label: "HISTORICAL_SIMULATION",
      note: "Compared on the same stored draw window. A larger historical hit count does not prove a strategy will outperform random in future draws.",
      runs,
    };
  },

  async listBacktests(org: string): Promise<LiBacktestResult[]> {
    return (await liList<LiBacktestResult>("backtest", org)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async performance(org: string): Promise<LiPerformance> {
    const cfg = await this.getConfig(org);
    const tickets = (await liList<LiTicket>("ticket", org)).filter((t) => t.dataClass === dataClassFor(cfg.mode));
    const draws = (await this.listDraws(org)).filter((d) => d.validationStatus === "VALID");
    const prizeTiers: Record<string, number> = {};
    const mainUsage: Record<string, number> = {};
    const bonusUsage: Record<string, number> = {};
    const diversities: number[] = [];
    let totalLines = 0;
    let checked = 0;
    for (const t of tickets) {
      totalLines += t.lines.length;
      if (t.status === "CHECKED") checked += 1;
      diversities.push(diversityAmong(t.lines.map((l) => ({ mainNumbers: l.mainNumbers, bonusNumbers: l.bonusNumbers }))));
      for (const l of t.lines) {
        if (l.prizeTier && l.prizeTier !== "NONE") prizeTiers[l.prizeTier] = (prizeTiers[l.prizeTier] ?? 0) + 1;
        for (const n of l.mainNumbers) mainUsage[String(n)] = (mainUsage[String(n)] ?? 0) + 1;
        for (const n of l.bonusNumbers) bonusUsage[String(n)] = (bonusUsage[String(n)] ?? 0) + 1;
      }
    }
    return {
      dataClass: dataClassFor(cfg.mode),
      savedTickets: tickets.length,
      totalLines,
      drawsTracked: draws.length,
      checkedTickets: checked,
      prizeTiers,
      averageDiversity: diversities.length ? diversities.reduce((a, b) => a + b, 0) / diversities.length : null,
      mainUsage,
      bonusUsage,
      backtests: (await this.listBacktests(org)).length,
    };
  },

  async providerHealth(): Promise<LiProviderHealth[]> {
    const live = listLotteryHealth();
    const byId = new Map(live.map((h) => [h.providerId, h]));
    return allLotteryProviders().map((p) => byId.get(p.id) ?? snapshotHealth({
      providerId: p.id, name: p.name,
      status: p.configured() ? "OFFLINE" : "NOT_CONFIGURED",
      lastError: p.configured() ? "No probe yet" : "Provider is not configured",
    }));
  },

  async listJobs(org: string): Promise<LiJobRun[]> {
    return (await liList<LiJobRun>("job", org)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 80);
  },

  async listAudit(org: string): Promise<LiAuditEntry[]> {
    return (await liList<LiAuditEntry>("audit", org)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  },

  async runJob(org: string, kind: LiJobKind, actorId: string | null = null): Promise<LiJobRun> {
    const inflight = (await this.listJobs(org)).find((j) => j.kind === kind && j.status === "RUNNING");
    if (inflight) return inflight;
    const run: LiJobRun = {
      id: uid("li-jb-"), organizationId: org, kind, status: "RUNNING",
      startedAt: new Date().toISOString(), endedAt: null,
      recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, errors: [],
      providerId: null, executionId: uid("li-ex-"),
    };
    await liWrite("job", org, run);
    try {
      const stats = await this.executeJob(org, kind);
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
    await liWrite("job", org, run);
    void emitKernel("lottery.job.completed", { organizationId: org, kind, status: run.status });
    return run;
  },

  async executeJob(org: string, kind: LiJobKind) {
    switch (kind) {
      case "DRAW_SYNC":
      case "HISTORICAL_SYNC": return this.syncDraws(org);
      case "RESULT_VERIFICATION": return this.verifyDraws(org);
      case "STATISTICS":
      case "FREQUENCY":
      case "GAPS": return { processed: (await this.listDraws(org)).length, created: 0, updated: 0, errors: [], providerId: null };
      case "TICKET_CHECK": return this.checkTickets(org);
      case "STRATEGY_PERF": return { processed: 0, created: 0, updated: 0, errors: [], providerId: null };
      case "PROVIDER_HEALTH": {
        for (const p of allLotteryProviders()) await p.health();
        return { processed: 2, created: 0, updated: 2, errors: [], providerId: null };
      }
      case "DATA_CLEANUP": {
        const jobs = await this.listJobs(org);
        let updated = 0;
        for (const j of jobs.slice(200)) { await liDelete("job", org, j.id); updated += 1; }
        return { processed: jobs.length, created: 0, updated, errors: [], providerId: null };
      }
      default: return { processed: 0, created: 0, updated: 0, errors: [`Unknown job ${kind}`], providerId: null };
    }
  },

  async syncDraws(org: string) {
    const cfg = await this.getConfig(org);
    if (!cfg.enabled || !cfg.euromillionsEnabled) {
      return { processed: 0, created: 0, updated: 0, errors: ["MODULE_DISABLED"], providerId: null };
    }
    const providers = providersForMode(cfg.mode);
    if (!providers.length) {
      return { processed: 0, created: 0, updated: 0, errors: ["No lottery data provider is configured. Official results will not be invented."], providerId: null };
    }
    const now = new Date();
    const window = { from: new Date(now.getTime() - 400 * 86400_000), to: now };
    let processed = 0, created = 0, updated = 0;
    const errors: string[] = [];
    let lastProvider: string | null = null;
    for (const provider of providers) {
      lastProvider = provider.id;
      const res = await provider.syncDraws(window);
      if (!res.ok) { errors.push(`${provider.id}: ${res.error}`); continue; }
      for (const raw of res.records) {
        const stats = await this.upsertDraw(org, raw);
        processed += 1;
        if (stats === "created") created += 1;
        else if (stats === "updated") updated += 1;
        else errors.push(`${raw.providerDrawId}: DATA VALIDATION FAILED`);
      }
    }
    return { processed, created, updated, errors, providerId: lastProvider };
  },

  async upsertDraw(org: string, raw: NormalizedDraw): Promise<"created" | "updated" | "rejected"> {
    const rules = this.rules();
    const validationErrors = validateDrawPayload(raw, rules);
    const now = new Date().toISOString();
    const natural = `${raw.lotteryId}:${raw.providerId}:${raw.providerDrawId}`;
    const existingId = await liLookupNatural("draw", org, natural);
    if (validationErrors.length) {
      const failed: LiDraw = {
        id: existingId ?? uid("li-dr-"),
        organizationId: org,
        lotteryId: raw.lotteryId,
        providerId: raw.providerId,
        providerDrawId: raw.providerDrawId,
        drawDate: raw.drawDate,
        mainNumbers: raw.mainNumbers,
        bonusNumbers: raw.bonusNumbers,
        jackpotMinor: raw.jackpotMinor,
        currency: raw.currency,
        rollover: raw.rollover,
        winners: raw.winners,
        prizeTable: raw.prizeTable,
        source: raw.source,
        sourceTimestamp: raw.sourceTimestamp,
        retrievedAt: raw.retrievedAt,
        verified: false,
        verifiedAt: null,
        validationStatus: "DATA_VALIDATION_FAILED",
        validationErrors,
        dataClass: raw.dataClass,
        stale: false,
        createdAt: now,
        updatedAt: now,
      };
      await liWrite("draw", org, failed);
      await audit(org, null, "lottery.draw.validation_failed", "draw", failed.id, null, { errors: validationErrors }, "not inserted as official");
      return "rejected";
    }
    const rec: LiDraw = {
      id: existingId ?? uid("li-dr-"),
      organizationId: org,
      lotteryId: raw.lotteryId,
      providerId: raw.providerId,
      providerDrawId: raw.providerDrawId,
      drawDate: raw.drawDate,
      mainNumbers: [...raw.mainNumbers].sort((a, b) => a - b),
      bonusNumbers: [...raw.bonusNumbers].sort((a, b) => a - b),
      jackpotMinor: raw.jackpotMinor,
      currency: raw.currency,
      rollover: raw.rollover,
      winners: raw.winners,
      prizeTable: raw.prizeTable,
      source: raw.source,
      sourceTimestamp: raw.sourceTimestamp,
      retrievedAt: raw.retrievedAt,
      verified: raw.dataClass === "SANDBOX",
      verifiedAt: raw.dataClass === "SANDBOX" ? now : null,
      validationStatus: "VALID",
      validationErrors: [],
      dataClass: raw.dataClass,
      stale: false,
      createdAt: now,
      updatedAt: now,
    };
    if (existingId) {
      const prev = await liRead<LiDraw>("draw", org, existingId);
      if (prev?.verified && prev.dataClass !== "SANDBOX") {
        const same = prev.mainNumbers.join(",") === rec.mainNumbers.join(",") && prev.bonusNumbers.join(",") === rec.bonusNumbers.join(",");
        if (!same) {
          await audit(org, null, "lottery.draw.conflict", "draw", existingId, prev, rec, "verified official result not overwritten");
          return "updated";
        }
      }
      rec.createdAt = prev?.createdAt ?? now;
      rec.verified = prev?.verified ?? rec.verified;
      rec.verifiedAt = prev?.verifiedAt ?? rec.verifiedAt;
      rec.id = existingId;
      await liWrite("draw", org, rec);
      return "updated";
    }
    await liWrite("draw", org, rec);
    await liRememberNatural("draw", org, natural, rec.id);
    return "created";
  },

  async verifyDraws(org: string) {
    const draws = await this.listDraws(org);
    let updated = 0;
    for (const d of draws) {
      if (d.verified || d.validationStatus !== "VALID") continue;
      if (d.dataClass === "SANDBOX") {
        await liWrite("draw", org, { ...d, verified: true, verifiedAt: new Date().toISOString() });
        updated += 1;
        continue;
      }
      if (d.dataClass === "OFFICIAL") {
        await liWrite("draw", org, { ...d, verified: true, verifiedAt: new Date().toISOString() });
        updated += 1;
      }
    }
    return { processed: draws.length, created: 0, updated, errors: [] as string[], providerId: null };
  },

  async runPipeline(org: string, actorId: string | null = null) {
    const jobs: LiJobRun[] = [];
    for (const kind of ["PROVIDER_HEALTH", "DRAW_SYNC", "RESULT_VERIFICATION", "TICKET_CHECK"] as LiJobKind[]) {
      jobs.push(await this.runJob(org, kind, actorId));
    }
    return { jobs };
  },

  hashRules() {
    return createHash("sha256").update(JSON.stringify(EUROMILLIONS_RULES)).digest("hex").slice(0, 12);
  },
};

void OfficialFeedProvider;
void SandboxLotteryProvider;
