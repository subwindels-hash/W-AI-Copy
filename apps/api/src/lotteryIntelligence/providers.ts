/**
 * Lottery provider abstraction.
 *
 * Official results come only from a configured feed. Missing credentials
 * yield NOT_CONFIGURED — the module never invents official draws.
 * SANDBOX emits labelled fictional history for engine/UI work.
 */
import { env } from "../config/env.js";
import { resolvePlatformApi } from "../sitePlatform/platformApis.runtime.js";
import type {
  LiDataClass,
  LiLotteryRules,
  LiProviderHealth,
  LiProviderStatus,
} from "@windels/shared/lotteryIntelligence";
import { EUROMILLIONS_RULES, POWERBALL_RULES } from "@windels/shared/lotteryIntelligence";
import { validateDrawPayload } from "./engines.js";

export interface NormalizedDraw {
  providerId: string;
  providerDrawId: string;
  lotteryId: string;
  drawDate: string;
  mainNumbers: number[];
  bonusNumbers: number[];
  jackpotMinor: number | null;
  currency: string | null;
  rollover: boolean | null;
  winners: number | null;
  prizeTable: Record<string, { winners: number | null; amountMinor: number | null }> | null;
  source: string;
  sourceTimestamp: string | null;
  dataClass: LiDataClass;
  retrievedAt: string;
}

export interface LotteryProvider {
  id: string;
  name: string;
  lotteryId: string;
  rules: LiLotteryRules;
  configured(): boolean;
  health(): Promise<LiProviderHealth>;
  syncDraws(window: { from: Date; to: Date }): Promise<{
    ok: boolean;
    status: LiProviderStatus;
    records: NormalizedDraw[];
    error: string | null;
    durationMs: number;
  }>;
}

const healthState = new Map<string, LiProviderHealth>();

export function snapshotHealth(partial: Partial<LiProviderHealth> & Pick<LiProviderHealth, "providerId" | "name">): LiProviderHealth {
  const prev = healthState.get(partial.providerId);
  const next: LiProviderHealth = {
    providerId: partial.providerId,
    name: partial.name,
    status: partial.status ?? prev?.status ?? "NOT_CONFIGURED",
    lastSuccessAt: partial.lastSuccessAt ?? prev?.lastSuccessAt ?? null,
    lastFailureAt: partial.lastFailureAt ?? prev?.lastFailureAt ?? null,
    lastDrawRetrieved: partial.lastDrawRetrieved ?? prev?.lastDrawRetrieved ?? null,
    responseTimeMs: partial.responseTimeMs ?? prev?.responseTimeMs ?? null,
    errorCount: partial.errorCount ?? prev?.errorCount ?? 0,
    validationFailures: partial.validationFailures ?? prev?.validationFailures ?? 0,
    dataFreshnessHours: partial.dataFreshnessHours ?? prev?.dataFreshnessHours ?? null,
    lastError: partial.lastError === undefined ? prev?.lastError ?? null : partial.lastError,
  };
  healthState.set(partial.providerId, next);
  return next;
}

export function listLotteryHealth(): LiProviderHealth[] {
  return [...healthState.values()];
}

function parseNums(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (typeof raw === "string") {
    return raw.split(/[,\s|-]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  }
  return [];
}

function isoDate(raw: unknown): string | null {
  if (!raw) return null;
  const t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

type SandboxSeed = Array<[string, number[], number[]]>;

function sandboxProvider(spec: {
  id: string;
  name: string;
  rules: LiLotteryRules;
  seed: SandboxSeed;
}): LotteryProvider {
  return {
    id: spec.id,
    name: spec.name,
    lotteryId: spec.rules.lotteryId,
    rules: spec.rules,
    configured() { return true; },
    async health() {
      return snapshotHealth({
        providerId: spec.id, name: spec.name, status: "ONLINE",
        lastSuccessAt: new Date().toISOString(), lastError: null, errorCount: 0,
      });
    },
    async syncDraws(window) {
      const started = Date.now();
      const retrievedAt = new Date().toISOString();
      const records: NormalizedDraw[] = spec.seed
        .map(([date, main, bonus], i) => ({
          providerId: spec.id,
          providerDrawId: `sbx-${spec.rules.lotteryId}-${date.replace(/-/g, "")}`,
          lotteryId: spec.rules.lotteryId,
          drawDate: `${date}T20:00:00.000Z`,
          mainNumbers: main,
          bonusNumbers: bonus,
          jackpotMinor: null,
          currency: null,
          rollover: i % 3 === 0,
          winners: null,
          prizeTable: null,
          source: "sandbox",
          sourceTimestamp: retrievedAt,
          dataClass: "SANDBOX" as const,
          retrievedAt,
        }))
        .filter((d) => {
          const t = Date.parse(d.drawDate);
          return t >= window.from.getTime() && t <= window.to.getTime();
        });
      snapshotHealth({
        providerId: spec.id, name: spec.name, status: "ONLINE",
        lastSuccessAt: retrievedAt, lastDrawRetrieved: records.at(-1)?.drawDate ?? null,
        responseTimeMs: Date.now() - started, lastError: null,
      });
      return { ok: true, status: "ONLINE", records, error: null, durationMs: Date.now() - started };
    },
  };
}

/** Labelled fictional EuroMillions-format history. Never treated as official. */
export const SandboxLotteryProvider: LotteryProvider = sandboxProvider({
  id: "sandbox",
  name: "WINDELS Sandbox EuroMillions Feed",
  rules: EUROMILLIONS_RULES,
  seed: [
    ["2026-01-06", [3, 12, 19, 28, 44], [2, 11]],
    ["2026-01-09", [7, 18, 24, 36, 49], [3, 8]],
    ["2026-01-13", [1, 9, 22, 31, 47], [1, 12]],
    ["2026-01-16", [5, 14, 27, 33, 41], [4, 9]],
    ["2026-01-20", [8, 16, 25, 38, 50], [6, 7]],
    ["2026-01-23", [2, 11, 20, 29, 43], [5, 10]],
    ["2026-01-27", [6, 15, 26, 34, 48], [2, 12]],
    ["2026-01-30", [4, 17, 23, 39, 46], [1, 8]],
    ["2026-02-03", [10, 21, 30, 35, 42], [3, 11]],
    ["2026-02-06", [9, 13, 28, 37, 45], [4, 6]],
    ["2026-02-10", [3, 18, 24, 32, 49], [7, 9]],
    ["2026-02-13", [7, 12, 19, 36, 44], [2, 5]],
    ["2026-02-17", [1, 16, 27, 40, 50], [8, 12]],
    ["2026-02-20", [5, 14, 22, 31, 47], [1, 10]],
    ["2026-02-24", [8, 15, 25, 38, 41], [3, 6]],
    ["2026-02-27", [2, 11, 26, 33, 48], [4, 11]],
    ["2026-03-03", [6, 20, 29, 34, 46], [5, 7]],
    ["2026-03-06", [4, 17, 23, 39, 43], [2, 9]],
    ["2026-03-10", [10, 13, 21, 35, 45], [6, 8]],
    ["2026-03-13", [9, 18, 28, 37, 42], [1, 12]],
    ["2026-03-17", [3, 12, 24, 32, 49], [7, 10]],
    ["2026-03-20", [7, 19, 27, 36, 44], [3, 5]],
    ["2026-03-24", [1, 15, 22, 40, 50], [4, 8]],
    ["2026-03-27", [5, 14, 26, 31, 47], [2, 11]],
    ["2026-03-31", [8, 16, 25, 38, 41], [9, 12]],
  ],
});

/** Labelled fictional Powerball-format history. Never treated as official. */
export const SandboxPowerballProvider: LotteryProvider = sandboxProvider({
  id: "sandbox-powerball",
  name: "WINDELS Sandbox Powerball Feed",
  rules: POWERBALL_RULES,
  seed: [
    ["2026-01-07", [4, 18, 29, 41, 62], [12]],
    ["2026-01-10", [7, 21, 33, 48, 67], [3]],
    ["2026-01-14", [2, 15, 27, 44, 58], [19]],
    ["2026-01-17", [9, 16, 30, 51, 69], [8]],
    ["2026-01-21", [5, 22, 34, 47, 61], [26]],
    ["2026-01-24", [1, 14, 28, 39, 55], [6]],
    ["2026-01-28", [11, 23, 36, 50, 64], [14]],
    ["2026-01-31", [6, 19, 31, 45, 60], [1]],
    ["2026-02-04", [8, 17, 32, 49, 66], [21]],
    ["2026-02-07", [3, 20, 35, 52, 63], [10]],
    ["2026-02-11", [12, 24, 37, 46, 68], [17]],
    ["2026-02-14", [10, 25, 38, 53, 65], [4]],
    ["2026-02-18", [13, 26, 40, 54, 59], [22]],
    ["2026-02-21", [4, 18, 33, 42, 57], [9]],
    ["2026-02-25", [7, 16, 29, 48, 62], [15]],
    ["2026-02-28", [2, 21, 34, 43, 67], [7]],
    ["2026-03-04", [9, 15, 30, 51, 64], [23]],
    ["2026-03-07", [5, 22, 36, 47, 58], [2]],
    ["2026-03-11", [1, 19, 28, 44, 61], [18]],
    ["2026-03-14", [11, 23, 37, 50, 69], [11]],
    ["2026-03-18", [6, 17, 31, 45, 56], [25]],
    ["2026-03-21", [8, 20, 32, 49, 63], [5]],
    ["2026-03-25", [3, 24, 35, 52, 66], [16]],
    ["2026-03-28", [12, 25, 38, 46, 60], [13]],
    ["2026-04-01", [10, 14, 27, 41, 55], [20]],
  ],
});

function lotteryFeed(slot: "lottery-euromillions" | "lottery-powerball") {
  const dash = resolvePlatformApi(slot);
  const envUrl = slot === "lottery-powerball"
    ? env.WINDELS_LOTTERY_POWERBALL_FEED_URL
    : env.WINDELS_LOTTERY_EUROMILLIONS_FEED_URL;
  const envToken = slot === "lottery-powerball"
    ? env.WINDELS_LOTTERY_POWERBALL_FEED_TOKEN
    : env.WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN;
  if (dash.source === "dashboard" && dash.baseUrl) {
    return {
      configured: true,
      baseUrl: dash.baseUrl,
      apiKey: dash.apiKey ?? envToken ?? null,
    };
  }
  return {
    configured: Boolean(envUrl),
    baseUrl: envUrl ?? null,
    apiKey: envToken ?? null,
  };
}

function officialFeedProvider(spec: {
  id: string;
  name: string;
  slot: "lottery-euromillions" | "lottery-powerball";
  rules: LiLotteryRules;
}): LotteryProvider {
  return {
    id: spec.id,
    name: spec.name,
    lotteryId: spec.rules.lotteryId,
    rules: spec.rules,
    configured() {
      return lotteryFeed(spec.slot).configured;
    },
    async health() {
      if (!this.configured()) {
        return snapshotHealth({
          providerId: spec.id, name: spec.name, status: "NOT_CONFIGURED",
          lastError: `${spec.rules.name} feed is not configured (dashboard slot ${spec.slot} or matching WINDELS_LOTTERY_*_FEED_URL)`,
        });
      }
      const started = Date.now();
      const feed = lotteryFeed(spec.slot);
      try {
        const res = await fetch(feed.baseUrl!, {
          headers: feed.apiKey ? { Authorization: `Bearer ${feed.apiKey}` } : {},
          signal: AbortSignal.timeout(12_000),
        });
        const status: LiProviderStatus = res.ok ? "ONLINE" : res.status >= 500 ? "OFFLINE" : "DATA_ERROR";
        return snapshotHealth({
          providerId: spec.id, name: spec.name, status,
          lastSuccessAt: res.ok ? new Date().toISOString() : undefined,
          lastFailureAt: res.ok ? undefined : new Date().toISOString(),
          responseTimeMs: Date.now() - started,
          lastError: res.ok ? null : `HTTP ${res.status}`,
          errorCount: res.ok ? 0 : 1,
        });
      } catch (e) {
        return snapshotHealth({
          providerId: spec.id, name: spec.name, status: "OFFLINE",
          lastFailureAt: new Date().toISOString(),
          lastError: e instanceof Error ? e.message : String(e),
          errorCount: 1,
          responseTimeMs: Date.now() - started,
        });
      }
    },
    async syncDraws() {
      const started = Date.now();
      const feed = lotteryFeed(spec.slot);
      if (!feed.configured || !feed.baseUrl) {
        return {
          ok: false, status: "NOT_CONFIGURED" as const, records: [],
          error: `No official ${spec.rules.name} feed configured. The system will not invent official results.`,
          durationMs: Date.now() - started,
        };
      }
      try {
        const headers: Record<string, string> = {};
        if (feed.apiKey) headers.Authorization = `Bearer ${feed.apiKey}`;
        const res = await fetch(feed.baseUrl, {
          headers, signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          snapshotHealth({
            providerId: spec.id, name: spec.name, status: "DATA_ERROR",
            lastFailureAt: new Date().toISOString(), lastError: `HTTP ${res.status}`, errorCount: 1,
          });
          return { ok: false, status: "DATA_ERROR", records: [], error: `Official feed HTTP ${res.status}`, durationMs: Date.now() - started };
        }
        const text = await res.text();
        const records = parseOfficialFeed(text, spec.rules, spec.id);
        snapshotHealth({
          providerId: spec.id, name: spec.name, status: "ONLINE",
          lastSuccessAt: new Date().toISOString(),
          lastDrawRetrieved: records.at(-1)?.drawDate ?? null,
          responseTimeMs: Date.now() - started, lastError: null,
        });
        return { ok: true, status: "ONLINE", records, error: null, durationMs: Date.now() - started };
      } catch (e) {
        snapshotHealth({
          providerId: spec.id, name: spec.name, status: "OFFLINE",
          lastFailureAt: new Date().toISOString(),
          lastError: e instanceof Error ? e.message : String(e), errorCount: 1,
        });
        return {
          ok: false, status: "OFFLINE", records: [],
          error: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - started,
        };
      }
    },
  };
}

export const OfficialFeedProvider: LotteryProvider = officialFeedProvider({
  id: "official-feed",
  name: "Configured official EuroMillions feed",
  slot: "lottery-euromillions",
  rules: EUROMILLIONS_RULES,
});

export const OfficialPowerballFeedProvider: LotteryProvider = officialFeedProvider({
  id: "official-powerball-feed",
  name: "Configured official Powerball feed",
  slot: "lottery-powerball",
  rules: POWERBALL_RULES,
});

export function parseOfficialFeed(body: string, rules: LiLotteryRules, providerId = "official-feed"): NormalizedDraw[] {
  const retrievedAt = new Date().toISOString();
  const rows: any[] = [];
  const trimmed = body.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed.draws ?? parsed.results ?? parsed.data ?? [];
    if (Array.isArray(list)) rows.push(...list);
  } else {
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const header = lines[0]?.toLowerCase() ?? "";
    const cols = header.split(/[,;\t]/).map((c) => c.trim());
    for (const line of lines.slice(1)) {
      const parts = line.split(/[,;\t]/);
      const rec: Record<string, string> = {};
      cols.forEach((c, i) => { rec[c] = parts[i] ?? ""; });
      rows.push(rec);
    }
  }
  const out: NormalizedDraw[] = [];
  for (const row of rows) {
    const providerDrawId = String(row.drawId ?? row.id ?? row.draw_id ?? row.draw ?? "");
    const drawDate = isoDate(row.drawDate ?? row.date ?? row.draw_date ?? row.drawnAt);
    const mainNumbers = parseNums(row.mainNumbers ?? row.numbers ?? row.balls ?? row.main);
    const bonusNumbers = parseNums(
      row.bonusNumbers ?? row.stars ?? row.luckyStars ?? row.lucky_stars ?? row.bonus
      ?? row.powerball ?? row.powerBall ?? row.power_ball,
    );
    const errors = validateDrawPayload({ providerDrawId, drawDate: drawDate ?? undefined, mainNumbers, bonusNumbers }, rules);
    if (errors.length) continue;
    out.push({
      providerId,
      providerDrawId,
      lotteryId: rules.lotteryId,
      drawDate: drawDate!,
      mainNumbers,
      bonusNumbers,
      jackpotMinor: typeof row.jackpotMinor === "number" ? row.jackpotMinor : typeof row.jackpot === "number" ? Math.round(row.jackpot * 100) : null,
      currency: row.currency ?? null,
      rollover: typeof row.rollover === "boolean" ? row.rollover : null,
      winners: typeof row.winners === "number" ? row.winners : null,
      prizeTable: row.prizeTable ?? null,
      source: providerId,
      sourceTimestamp: isoDate(row.sourceTimestamp ?? row.publishedAt) ?? retrievedAt,
      dataClass: "OFFICIAL",
      retrievedAt,
    });
  }
  return out;
}

export function providersForMode(mode: "SANDBOX" | "PAPER" | "PRODUCTION"): LotteryProvider[] {
  if (mode === "SANDBOX") return [SandboxLotteryProvider, SandboxPowerballProvider];
  const live: LotteryProvider[] = [];
  if (OfficialFeedProvider.configured()) live.push(OfficialFeedProvider);
  if (OfficialPowerballFeedProvider.configured()) live.push(OfficialPowerballFeedProvider);
  return live;
}

export function allLotteryProviders(): LotteryProvider[] {
  return [SandboxLotteryProvider, SandboxPowerballProvider, OfficialFeedProvider, OfficialPowerballFeedProvider];
}
