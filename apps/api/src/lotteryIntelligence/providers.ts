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
import { EUROMILLIONS_RULES } from "@windels/shared/lotteryIntelligence";
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

/** Labelled fictional EuroMillions-format history. Never treated as official. */
export const SandboxLotteryProvider: LotteryProvider = {
  id: "sandbox",
  name: "WINDELS Sandbox Lottery Feed",
  lotteryId: "euromillions",
  rules: EUROMILLIONS_RULES,
  configured() { return true; },
  async health() {
    return snapshotHealth({
      providerId: this.id, name: this.name, status: "ONLINE",
      lastSuccessAt: new Date().toISOString(), lastError: null, errorCount: 0,
    });
  },
  async syncDraws(window) {
    const started = Date.now();
    const retrievedAt = new Date().toISOString();
    const seed: Array<[string, number[], number[]]> = [
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
    ];
    const records: NormalizedDraw[] = seed
      .map(([date, main, bonus], i) => ({
        providerId: this.id,
        providerDrawId: `sbx-em-${date.replace(/-/g, "")}`,
        lotteryId: "euromillions",
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
      providerId: this.id, name: this.name, status: "ONLINE",
      lastSuccessAt: retrievedAt, lastDrawRetrieved: records.at(-1)?.drawDate ?? null,
      responseTimeMs: Date.now() - started, lastError: null,
    });
    return { ok: true, status: "ONLINE", records, error: null, durationMs: Date.now() - started };
  },
};

function lotteryFeed() {
  const dash = resolvePlatformApi("lottery-euromillions");
  if (dash.source === "dashboard" && dash.baseUrl) {
    return {
      configured: true,
      baseUrl: dash.baseUrl,
      apiKey: dash.apiKey ?? env.WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN ?? null,
    };
  }
  const url = env.WINDELS_LOTTERY_EUROMILLIONS_FEED_URL;
  return {
    configured: Boolean(url),
    baseUrl: url ?? null,
    apiKey: env.WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN ?? null,
  };
}

export const OfficialFeedProvider: LotteryProvider = {
  id: "official-feed",
  name: "Configured official EuroMillions feed",
  lotteryId: "euromillions",
  rules: EUROMILLIONS_RULES,
  configured() {
    return lotteryFeed().configured;
  },
  async health() {
    if (!this.configured()) {
      return snapshotHealth({
        providerId: this.id, name: this.name, status: "NOT_CONFIGURED",
        lastError: "EuroMillions feed is not configured (dashboard or WINDELS_LOTTERY_EUROMILLIONS_FEED_URL)",
      });
    }
    const started = Date.now();
    const feed = lotteryFeed();
    try {
      const res = await fetch(feed.baseUrl!, {
        headers: feed.apiKey ? { Authorization: `Bearer ${feed.apiKey}` } : {},
        signal: AbortSignal.timeout(12_000),
      });
      const status: LiProviderStatus = res.ok ? "ONLINE" : res.status >= 500 ? "OFFLINE" : "DATA_ERROR";
      return snapshotHealth({
        providerId: this.id, name: this.name, status,
        lastSuccessAt: res.ok ? new Date().toISOString() : undefined,
        lastFailureAt: res.ok ? undefined : new Date().toISOString(),
        responseTimeMs: Date.now() - started,
        lastError: res.ok ? null : `HTTP ${res.status}`,
        errorCount: res.ok ? 0 : 1,
      });
    } catch (e) {
      return snapshotHealth({
        providerId: this.id, name: this.name, status: "OFFLINE",
        lastFailureAt: new Date().toISOString(),
        lastError: e instanceof Error ? e.message : String(e),
        errorCount: 1,
        responseTimeMs: Date.now() - started,
      });
    }
  },
  async syncDraws() {
    const started = Date.now();
    if (!this.configured()) {
      return {
        ok: false, status: "NOT_CONFIGURED" as const, records: [],
        error: "No official feed configured. The system will not invent EuroMillions results.",
        durationMs: Date.now() - started,
      };
    }
    try {
      const headers: Record<string, string> = {};
      if (env.WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN) {
        headers.Authorization = `Bearer ${env.WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN}`;
      }
      const res = await fetch(env.WINDELS_LOTTERY_EUROMILLIONS_FEED_URL!, {
        headers, signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        snapshotHealth({
          providerId: this.id, name: this.name, status: "DATA_ERROR",
          lastFailureAt: new Date().toISOString(), lastError: `HTTP ${res.status}`, errorCount: 1,
        });
        return { ok: false, status: "DATA_ERROR", records: [], error: `Official feed HTTP ${res.status}`, durationMs: Date.now() - started };
      }
      const text = await res.text();
      const records = parseOfficialFeed(text, this.rules);
      snapshotHealth({
        providerId: this.id, name: this.name, status: "ONLINE",
        lastSuccessAt: new Date().toISOString(),
        lastDrawRetrieved: records.at(-1)?.drawDate ?? null,
        responseTimeMs: Date.now() - started, lastError: null,
      });
      return { ok: true, status: "ONLINE", records, error: null, durationMs: Date.now() - started };
    } catch (e) {
      snapshotHealth({
        providerId: this.id, name: this.name, status: "OFFLINE",
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

export function parseOfficialFeed(body: string, rules: LiLotteryRules): NormalizedDraw[] {
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
    const bonusNumbers = parseNums(row.bonusNumbers ?? row.stars ?? row.luckyStars ?? row.lucky_stars ?? row.bonus);
    const errors = validateDrawPayload({ providerDrawId, drawDate: drawDate ?? undefined, mainNumbers, bonusNumbers }, rules);
    if (errors.length) continue;
    out.push({
      providerId: "official-feed",
      providerDrawId,
      lotteryId: "euromillions",
      drawDate: drawDate!,
      mainNumbers,
      bonusNumbers,
      jackpotMinor: typeof row.jackpotMinor === "number" ? row.jackpotMinor : typeof row.jackpot === "number" ? Math.round(row.jackpot * 100) : null,
      currency: row.currency ?? null,
      rollover: typeof row.rollover === "boolean" ? row.rollover : null,
      winners: typeof row.winners === "number" ? row.winners : null,
      prizeTable: row.prizeTable ?? null,
      source: "official-feed",
      sourceTimestamp: isoDate(row.sourceTimestamp ?? row.publishedAt) ?? retrievedAt,
      dataClass: "OFFICIAL",
      retrievedAt,
    });
  }
  return out;
}

export function providersForMode(mode: "SANDBOX" | "PAPER" | "PRODUCTION"): LotteryProvider[] {
  if (mode === "SANDBOX") return [SandboxLotteryProvider];
  const live: LotteryProvider[] = [];
  if (OfficialFeedProvider.configured()) live.push(OfficialFeedProvider);
  return live;
}

export function allLotteryProviders(): LotteryProvider[] {
  return [SandboxLotteryProvider, OfficialFeedProvider];
}
