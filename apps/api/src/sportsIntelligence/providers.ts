/**
 * Sports Data Gateway — provider abstraction.
 *
 * WINDELS never depends on a vendor response shape. Every adapter converts
 * into the common SiMatch / SiOdds / SiResult documents. Credentials live
 * only in environment / encrypted config — never in frontend code.
 *
 * Providers must fail honestly: missing credentials → NOT_CONFIGURED.
 * HTTP errors → OFFLINE / RATE_LIMITED / AUTHENTICATION_ERROR / DATA_ERROR.
 * They must never invent fixtures, odds or results.
 */

import { env } from "../config/env.js";
import { resolvePlatformApi } from "../sitePlatform/platformApis.runtime.js";
import type {
  SiDataClass,
  SiInjuryNote,
  SiLeague,
  SiLineupNote,
  SiMatch,
  SiMatchStatus,
  SiOdds,
  SiOperatingMode,
  SiProviderHealth,
  SiProviderStatus,
  SiResult,
  SiTeam,
  SiTeamForm,
} from "@windels/shared/sportsIntelligence";

export interface SportsProvider {
  id: string;
  name: string;
  capabilities: Array<"fixtures" | "odds" | "results" | "injuries" | "lineups">;
  configured(): boolean;
  health(): Promise<SiProviderHealth>;
  syncFixtures(org: string, window: { from: Date; to: Date }): Promise<ProviderSyncResult<NormalizedFixture>>;
  syncOdds(org: string, matchRefs: NormalizedFixture[]): Promise<ProviderSyncResult<NormalizedOdds>>;
  syncResults(org: string, matchRefs: NormalizedFixture[]): Promise<ProviderSyncResult<NormalizedResult>>;
}

export interface ProviderSyncResult<T> {
  ok: boolean;
  status: SiProviderStatus;
  records: T[];
  invalid: number;
  missingFields: number;
  error: string | null;
  durationMs: number;
}

export interface NormalizedFixture {
  providerId: string;
  providerMatchId: string;
  providerLeagueId: string;
  leagueName: string;
  country: string | null;
  providerHomeId: string;
  homeName: string;
  providerAwayId: string;
  awayName: string;
  kickoffAt: string;
  status: SiMatchStatus;
  venue: string | null;
  homeForm: SiTeamForm | null;
  awayForm: SiTeamForm | null;
  homeXg: number | null;
  awayXg: number | null;
  homeLeaguePos: number | null;
  awayLeaguePos: number | null;
  restDaysHome: number | null;
  restDaysAway: number | null;
  injuries: SiInjuryNote[];
  lineups: SiLineupNote[];
  homeScore: number | null;
  awayScore: number | null;
  dataClass: SiDataClass;
  observedAt: string;
}

export interface NormalizedOdds {
  providerId: string;
  providerMatchId: string;
  market: SiOdds["market"];
  selection: string;
  line: number | null;
  oddsDecimal: number;
  openingOdds: number | null;
  liquidity: number | null;
  suspended: boolean;
  observedAt: string;
  dataClass: SiDataClass;
}

export interface NormalizedResult {
  providerId: string;
  providerMatchId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: SiMatchStatus;
  raw: Record<string, unknown>;
  observedAt: string;
  dataClass: SiDataClass;
}

const healthState = new Map<string, SiProviderHealth>();

export function snapshotHealth(partial: Partial<SiProviderHealth> & Pick<SiProviderHealth, "providerId" | "name">): SiProviderHealth {
  const prev = healthState.get(partial.providerId);
  const next: SiProviderHealth = {
    providerId: partial.providerId,
    name: partial.name,
    status: partial.status ?? prev?.status ?? "NOT_CONFIGURED",
    available: partial.available ?? prev?.available ?? false,
    responseTimeMs: partial.responseTimeMs ?? prev?.responseTimeMs ?? null,
    errorRate: partial.errorRate ?? prev?.errorRate ?? null,
    rateLimited: partial.rateLimited ?? prev?.rateLimited ?? false,
    lastSuccessAt: partial.lastSuccessAt ?? prev?.lastSuccessAt ?? null,
    lastFailureAt: partial.lastFailureAt ?? prev?.lastFailureAt ?? null,
    lastFixtureSyncAt: partial.lastFixtureSyncAt ?? prev?.lastFixtureSyncAt ?? null,
    lastOddsSyncAt: partial.lastOddsSyncAt ?? prev?.lastOddsSyncAt ?? null,
    lastResultSyncAt: partial.lastResultSyncAt ?? prev?.lastResultSyncAt ?? null,
    dataFreshnessMinutes: partial.dataFreshnessMinutes ?? prev?.dataFreshnessMinutes ?? null,
    recordsReceived: partial.recordsReceived ?? prev?.recordsReceived ?? 0,
    invalidRecords: partial.invalidRecords ?? prev?.invalidRecords ?? 0,
    missingFields: partial.missingFields ?? prev?.missingFields ?? 0,
    lastError: partial.lastError === undefined ? prev?.lastError ?? null : partial.lastError,
  };
  healthState.set(partial.providerId, next);
  return next;
}

export function listProviderHealth(): SiProviderHealth[] {
  return [...healthState.values()];
}

function emptySync<T>(status: SiProviderStatus, error: string | null, durationMs: number): ProviderSyncResult<T> {
  return { ok: false, status, records: [], invalid: 0, missingFields: 0, error, durationMs };
}

function classifyHttp(status: number, body: string): SiProviderStatus {
  if (status === 401 || status === 403) return "AUTHENTICATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "OFFLINE";
  if (status >= 400) return "DATA_ERROR";
  if (!body) return "DATA_ERROR";
  return "ONLINE";
}

async function httpGet(url: string, headers: Record<string, string>, timeoutMs = 12_000): Promise<{
  status: number;
  body: string;
  ms: number;
}> {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const body = await res.text();
    return { status: res.status, body, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, body: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

function mapStatus(raw: string | undefined): SiMatchStatus {
  const s = (raw ?? "").toUpperCase();
  if (["NS", "TBD", "SCHEDULED", "NOT STARTED"].includes(s)) return "SCHEDULED";
  if (["1H", "2H", "LIVE", "INPLAY", "ET"].includes(s)) return "LIVE";
  if (["HT"].includes(s)) return "HT";
  if (["FT", "AET", "PEN", "FINISHED"].includes(s)) return "FT";
  if (["PST", "POSTPONED"].includes(s)) return "POSTPONED";
  if (["CANC", "CANCELLED"].includes(s)) return "CANCELLED";
  if (["SUSP", "SUSPENDED"].includes(s)) return "SUSPENDED";
  if (["ABD", "ABANDONED"].includes(s)) return "ABANDONED";
  return "UNKNOWN";
}

/** Sandbox adapter — fictional clubs only, always labelled SANDBOX. */
export const SandboxProvider: SportsProvider = {
  id: "sandbox",
  name: "WINDELS Sandbox Sports Feed",
  capabilities: ["fixtures", "odds", "results"],
  configured() {
    return true;
  },
  async health() {
    return snapshotHealth({
      providerId: this.id,
      name: this.name,
      status: "ONLINE",
      available: true,
      responseTimeMs: 1,
      errorRate: 0,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    });
  },
  async syncFixtures(org, window) {
    const started = Date.now();
    const now = new Date();
    const kick1 = new Date(now.getTime() + 6 * 3600_000).toISOString();
    const kick2 = new Date(now.getTime() + 9 * 3600_000).toISOString();
    const kick3 = new Date(now.getTime() + 26 * 3600_000).toISOString();
    const past = new Date(now.getTime() - 26 * 3600_000).toISOString();
    const observedAt = now.toISOString();
    const form = (played: number, w: number, d: number, l: number, gf: number, ga: number): SiTeamForm => ({
      played, won: w, drawn: d, lost: l, goalsFor: gf, goalsAgainst: ga, source: "sandbox", observedAt,
    });
    const records: NormalizedFixture[] = [
      {
        providerId: this.id, providerMatchId: "sbx-m-1001", providerLeagueId: "sbx-lg-1",
        leagueName: "Sandbox Premier", country: "XX",
        providerHomeId: "sbx-t-alpha", homeName: "Sandbox Alpha",
        providerAwayId: "sbx-t-beta", awayName: "Sandbox Beta",
        kickoffAt: kick1, status: "SCHEDULED", venue: "Sandbox Arena",
        homeForm: form(10, 6, 2, 2, 18, 9), awayForm: form(10, 4, 3, 3, 13, 12),
        homeXg: 1.72, awayXg: 1.18, homeLeaguePos: 2, awayLeaguePos: 7,
        restDaysHome: 6, restDaysAway: 4, injuries: [], lineups: [],
        homeScore: null, awayScore: null, dataClass: "SANDBOX", observedAt,
      },
      {
        providerId: this.id, providerMatchId: "sbx-m-1002", providerLeagueId: "sbx-lg-1",
        leagueName: "Sandbox Premier", country: "XX",
        providerHomeId: "sbx-t-gamma", homeName: "Sandbox Gamma",
        providerAwayId: "sbx-t-delta", awayName: "Sandbox Delta",
        kickoffAt: kick2, status: "SCHEDULED", venue: "Demo Park",
        homeForm: form(10, 3, 4, 3, 11, 11), awayForm: form(10, 5, 2, 3, 16, 10),
        homeXg: 1.21, awayXg: 1.55, homeLeaguePos: 9, awayLeaguePos: 4,
        restDaysHome: 3, restDaysAway: 7, injuries: [], lineups: [],
        homeScore: null, awayScore: null, dataClass: "SANDBOX", observedAt,
      },
      {
        providerId: this.id, providerMatchId: "sbx-m-1003", providerLeagueId: "sbx-lg-2",
        leagueName: "Sandbox Championship", country: "XX",
        providerHomeId: "sbx-t-echo", homeName: "Sandbox Echo",
        providerAwayId: "sbx-t-foxtrot", awayName: "Sandbox Foxtrot",
        kickoffAt: kick3, status: "SCHEDULED", venue: "Fixture Ground",
        homeForm: form(8, 5, 1, 2, 14, 8), awayForm: form(8, 2, 3, 3, 8, 11),
        homeXg: 1.64, awayXg: 0.97, homeLeaguePos: 3, awayLeaguePos: 12,
        restDaysHome: 5, restDaysAway: 5, injuries: [], lineups: [],
        homeScore: null, awayScore: null, dataClass: "SANDBOX", observedAt,
      },
      {
        providerId: this.id, providerMatchId: "sbx-m-0900", providerLeagueId: "sbx-lg-1",
        leagueName: "Sandbox Premier", country: "XX",
        providerHomeId: "sbx-t-alpha", homeName: "Sandbox Alpha",
        providerAwayId: "sbx-t-gamma", awayName: "Sandbox Gamma",
        kickoffAt: past, status: "FT", venue: "Sandbox Arena",
        homeForm: form(9, 5, 2, 2, 16, 8), awayForm: form(9, 3, 4, 2, 10, 10),
        homeXg: 1.8, awayXg: 1.05, homeLeaguePos: 2, awayLeaguePos: 8,
        restDaysHome: 6, restDaysAway: 6, injuries: [], lineups: [],
        homeScore: 2, awayScore: 0, dataClass: "SANDBOX", observedAt,
      },
    ].filter((f) => {
      const k = Date.parse(f.kickoffAt);
      return k >= window.from.getTime() - 48 * 3600_000 && k <= window.to.getTime();
    });
    snapshotHealth({
      providerId: this.id, name: this.name, status: "ONLINE", available: true,
      lastSuccessAt: new Date().toISOString(), lastFixtureSyncAt: new Date().toISOString(),
      recordsReceived: records.length, invalidRecords: 0, responseTimeMs: Date.now() - started,
    });
    return { ok: true, status: "ONLINE", records, invalid: 0, missingFields: 0, error: null, durationMs: Date.now() - started };
  },
  async syncOdds(_org, fixtures) {
    const started = Date.now();
    const observedAt = new Date().toISOString();
    const table: Record<string, NormalizedOdds[]> = {
      "sbx-m-1001": [
        o(this.id, "sbx-m-1001", "HOME_WIN", "HOME", null, 1.72, 1.80, observedAt),
        o(this.id, "sbx-m-1001", "DRAW", "DRAW", null, 3.60, 3.50, observedAt),
        o(this.id, "sbx-m-1001", "AWAY_WIN", "AWAY", null, 4.80, 4.40, observedAt),
        o(this.id, "sbx-m-1001", "OVER_UNDER", "OVER 1.5", 1.5, 1.28, 1.30, observedAt),
        o(this.id, "sbx-m-1001", "BTTS", "YES", null, 1.85, 1.90, observedAt),
      ],
      "sbx-m-1002": [
        o(this.id, "sbx-m-1002", "HOME_WIN", "HOME", null, 2.90, 2.75, observedAt),
        o(this.id, "sbx-m-1002", "AWAY_WIN", "AWAY", null, 2.35, 2.45, observedAt),
        o(this.id, "sbx-m-1002", "OVER_UNDER", "OVER 2.5", 2.5, 1.95, 2.05, observedAt),
        o(this.id, "sbx-m-1002", "BTTS", "YES", null, 1.72, 1.70, observedAt),
      ],
      "sbx-m-1003": [
        o(this.id, "sbx-m-1003", "HOME_WIN", "HOME", null, 1.65, 1.70, observedAt),
        o(this.id, "sbx-m-1003", "OVER_UNDER", "OVER 1.5", 1.5, 1.33, 1.36, observedAt),
        o(this.id, "sbx-m-1003", "BTTS", "NO", null, 2.10, 2.00, observedAt),
      ],
      "sbx-m-0900": [
        o(this.id, "sbx-m-0900", "HOME_WIN", "HOME", null, 1.70, 1.75, observedAt),
        o(this.id, "sbx-m-0900", "OVER_UNDER", "OVER 1.5", 1.5, 1.30, 1.32, observedAt),
      ],
    };
    const records = fixtures.flatMap((f) => table[f.providerMatchId] ?? []);
    snapshotHealth({
      providerId: this.id, name: this.name, lastOddsSyncAt: new Date().toISOString(),
      recordsReceived: records.length, responseTimeMs: Date.now() - started,
    });
    return { ok: true, status: "ONLINE", records, invalid: 0, missingFields: 0, error: null, durationMs: Date.now() - started };
  },
  async syncResults(_org, fixtures) {
    const started = Date.now();
    const records: NormalizedResult[] = fixtures
      .filter((f) => f.status === "FT" && f.homeScore !== null && f.awayScore !== null)
      .map((f) => ({
        providerId: this.id,
        providerMatchId: f.providerMatchId,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: "FT",
        raw: { source: "sandbox", note: "SANDBOX result — not a live sporting event" },
        observedAt: new Date().toISOString(),
        dataClass: "SANDBOX",
      }));
    snapshotHealth({ providerId: this.id, name: this.name, lastResultSyncAt: new Date().toISOString() });
    return { ok: true, status: "ONLINE", records, invalid: 0, missingFields: 0, error: null, durationMs: Date.now() - started };
  },
};

function o(
  providerId: string, providerMatchId: string, market: SiOdds["market"],
  selection: string, line: number | null, odds: number, opening: number, observedAt: string,
): NormalizedOdds {
  return {
    providerId, providerMatchId, market, selection, line, oddsDecimal: odds, openingOdds: opening,
    liquidity: 10_000, suspended: false, observedAt, dataClass: "SANDBOX",
  };
}

function footballCreds() {
  return resolvePlatformApi(
    "sports-football",
    "WINDELS_SPORTS_API_FOOTBALL_KEY",
    env.WINDELS_SPORTS_API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io",
  );
}

function oddsCreds() {
  return resolvePlatformApi(
    "sports-odds",
    "WINDELS_SPORTS_ODDS_API_KEY",
    env.WINDELS_SPORTS_ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4",
  );
}

function apiFootballConfigured(): boolean {
  return footballCreds().configured;
}

function oddsApiConfigured(): boolean {
  return oddsCreds().configured;
}

export const ApiFootballProvider: SportsProvider = {
  id: "api-football",
  name: "API-Football",
  capabilities: ["fixtures", "results", "injuries", "lineups"],
  configured: apiFootballConfigured,
  async health() {
    if (!this.configured()) {
      return snapshotHealth({
        providerId: this.id, name: this.name, status: "NOT_CONFIGURED", available: false,
        lastError: "API-Football is not configured (dashboard or WINDELS_SPORTS_API_FOOTBALL_KEY)",
      });
    }
    const creds = footballCreds();
    const base = creds.baseUrl ?? "https://v3.football.api-sports.io";
    const res = await httpGet(`${base}/status`, { "x-apisports-key": creds.apiKey! });
    const status = res.status === 0 ? "OFFLINE" : classifyHttp(res.status, res.body);
    return snapshotHealth({
      providerId: this.id, name: this.name, status, available: status === "ONLINE" || status === "DEGRADED",
      responseTimeMs: res.ms,
      lastSuccessAt: status === "ONLINE" ? new Date().toISOString() : undefined,
      lastFailureAt: status !== "ONLINE" ? new Date().toISOString() : undefined,
      lastError: status === "ONLINE" ? null : `HTTP ${res.status}`,
    });
  },
  async syncFixtures(_org, window) {
    const started = Date.now();
    if (!this.configured()) {
      snapshotHealth({ providerId: this.id, name: this.name, status: "NOT_CONFIGURED", available: false, lastError: "API key missing" });
      return emptySync("NOT_CONFIGURED", "API-Football is not configured. Add the key in Super Admin → APIs or set WINDELS_SPORTS_API_FOOTBALL_KEY.", Date.now() - started);
    }
    const creds = footballCreds();
    const base = creds.baseUrl ?? "https://v3.football.api-sports.io";
    const from = window.from.toISOString().slice(0, 10);
    const to = window.to.toISOString().slice(0, 10);
    const res = await httpGet(`${base}/fixtures?from=${from}&to=${to}`, {
      "x-apisports-key": creds.apiKey!,
    });
    const status = res.status === 0 ? "OFFLINE" : classifyHttp(res.status, res.body);
    if (status !== "ONLINE") {
      snapshotHealth({
        providerId: this.id, name: this.name, status, available: false, lastFailureAt: new Date().toISOString(),
        lastError: `fixtures HTTP ${res.status}`, responseTimeMs: res.ms,
      });
      return emptySync(status, `Fixture sync failed (${status}).`, Date.now() - started);
    }
    let parsed: any;
    try { parsed = JSON.parse(res.body); } catch {
      return emptySync("DATA_ERROR", "Provider returned non-JSON.", Date.now() - started);
    }
    const rows = Array.isArray(parsed?.response) ? parsed.response : [];
    const records: NormalizedFixture[] = [];
    let invalid = 0;
    let missingFields = 0;
    for (const row of rows) {
      const fx = row?.fixture;
      const lg = row?.league;
      const teams = row?.teams;
      const goals = row?.goals;
      if (!fx?.id || !teams?.home?.id || !teams?.away?.id || !fx?.date) {
        invalid += 1;
        continue;
      }
      if (!lg?.name) missingFields += 1;
      records.push({
        providerId: this.id,
        providerMatchId: String(fx.id),
        providerLeagueId: String(lg?.id ?? "unknown"),
        leagueName: String(lg?.name ?? "Unknown league"),
        country: lg?.country ?? null,
        providerHomeId: String(teams.home.id),
        homeName: String(teams.home.name ?? "Home"),
        providerAwayId: String(teams.away.id),
        awayName: String(teams.away.name ?? "Away"),
        kickoffAt: new Date(fx.date).toISOString(),
        status: mapStatus(fx?.status?.short),
        venue: fx?.venue?.name ?? null,
        homeForm: null,
        awayForm: null,
        homeXg: null,
        awayXg: null,
        homeLeaguePos: null,
        awayLeaguePos: null,
        restDaysHome: null,
        restDaysAway: null,
        injuries: [],
        lineups: [],
        homeScore: typeof goals?.home === "number" ? goals.home : null,
        awayScore: typeof goals?.away === "number" ? goals.away : null,
        dataClass: "LIVE",
        observedAt: new Date().toISOString(),
      });
    }
    snapshotHealth({
      providerId: this.id, name: this.name, status: "ONLINE", available: true,
      lastSuccessAt: new Date().toISOString(), lastFixtureSyncAt: new Date().toISOString(),
      recordsReceived: records.length, invalidRecords: invalid, missingFields, responseTimeMs: res.ms, lastError: null,
    });
    return { ok: true, status: "ONLINE", records, invalid, missingFields, error: null, durationMs: Date.now() - started };
  },
  async syncOdds() {
    return emptySync("NOT_CONFIGURED", "API-Football odds are not used; configure The Odds API for market prices.", 0);
  },
  async syncResults(org, fixtures) {
    const finished = fixtures.filter((f) => f.providerId === this.id);
    const started = Date.now();
    if (!this.configured()) return emptySync("NOT_CONFIGURED", "API-Football is not configured.", Date.now() - started);
    const records: NormalizedResult[] = finished
      .filter((f) => f.homeScore !== null && f.awayScore !== null && f.status === "FT")
      .map((f) => ({
        providerId: this.id,
        providerMatchId: f.providerMatchId,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: f.status,
        raw: { source: "api-football", match: f.providerMatchId },
        observedAt: new Date().toISOString(),
        dataClass: "LIVE",
      }));
    snapshotHealth({ providerId: this.id, name: this.name, lastResultSyncAt: new Date().toISOString() });
    return { ok: true, status: "ONLINE", records, invalid: 0, missingFields: 0, error: null, durationMs: Date.now() - started };
  },
};

export const TheOddsApiProvider: SportsProvider = {
  id: "the-odds-api",
  name: "The Odds API",
  capabilities: ["odds", "fixtures"],
  configured: oddsApiConfigured,
  async health() {
    if (!this.configured()) {
      return snapshotHealth({
        providerId: this.id, name: this.name, status: "NOT_CONFIGURED", available: false,
        lastError: "The Odds API is not configured (dashboard or WINDELS_SPORTS_ODDS_API_KEY)",
      });
    }
    const creds = oddsCreds();
    const base = creds.baseUrl ?? "https://api.the-odds-api.com/v4";
    const res = await httpGet(`${base}/sports/?apiKey=${encodeURIComponent(creds.apiKey!)}`, {});
    const status = res.status === 0 ? "OFFLINE" : classifyHttp(res.status, res.body);
    return snapshotHealth({
      providerId: this.id, name: this.name, status, available: status === "ONLINE",
      responseTimeMs: res.ms,
      lastSuccessAt: status === "ONLINE" ? new Date().toISOString() : undefined,
      lastFailureAt: status !== "ONLINE" ? new Date().toISOString() : undefined,
      lastError: status === "ONLINE" ? null : `HTTP ${res.status}`,
    });
  },
  async syncFixtures(_org, _window) {
    const started = Date.now();
    if (!this.configured()) {
      return emptySync("NOT_CONFIGURED", "The Odds API is not configured. Add the key in Super Admin → APIs or set WINDELS_SPORTS_ODDS_API_KEY.", Date.now() - started);
    }
    const creds = oddsCreds();
    const base = creds.baseUrl ?? "https://api.the-odds-api.com/v4";
    const sport = env.WINDELS_SPORTS_ODDS_SPORT ?? "soccer_epl";
    const res = await httpGet(
      `${base}/sports/${encodeURIComponent(sport)}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${encodeURIComponent(creds.apiKey!)}`,
      {},
    );
    const status = res.status === 0 ? "OFFLINE" : classifyHttp(res.status, res.body);
    if (status !== "ONLINE") {
      snapshotHealth({
        providerId: this.id, name: this.name, status, lastFailureAt: new Date().toISOString(),
        lastError: `odds HTTP ${res.status}`, responseTimeMs: res.ms,
      });
      return emptySync(status, `Odds/fixture sync failed (${status}).`, Date.now() - started);
    }
    let rows: any[];
    try {
      const parsed = JSON.parse(res.body);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      return emptySync("DATA_ERROR", "The Odds API returned non-JSON.", Date.now() - started);
    }
    const records: NormalizedFixture[] = [];
    let invalid = 0;
    for (const row of rows) {
      if (!row?.id || !row?.home_team || !row?.away_team || !row?.commence_time) {
        invalid += 1;
        continue;
      }
      records.push({
        providerId: this.id,
        providerMatchId: String(row.id),
        providerLeagueId: String(row.sport_key ?? sport),
        leagueName: String(row.sport_title ?? sport),
        country: null,
        providerHomeId: slug(row.home_team),
        homeName: String(row.home_team),
        providerAwayId: slug(row.away_team),
        awayName: String(row.away_team),
        kickoffAt: new Date(row.commence_time).toISOString(),
        status: Date.parse(row.commence_time) < Date.now() ? "LIVE" : "SCHEDULED",
        venue: null,
        homeForm: null, awayForm: null, homeXg: null, awayXg: null,
        homeLeaguePos: null, awayLeaguePos: null, restDaysHome: null, restDaysAway: null,
        injuries: [], lineups: [], homeScore: null, awayScore: null,
        dataClass: "LIVE", observedAt: new Date().toISOString(),
      });
    }
    snapshotHealth({
      providerId: this.id, name: this.name, status: "ONLINE", available: true,
      lastSuccessAt: new Date().toISOString(), lastFixtureSyncAt: new Date().toISOString(),
      lastOddsSyncAt: new Date().toISOString(), recordsReceived: records.length, invalidRecords: invalid,
      responseTimeMs: res.ms, lastError: null,
    });
    return { ok: true, status: "ONLINE", records, invalid, missingFields: 0, error: null, durationMs: Date.now() - started };
  },
  async syncOdds(_org, fixtures) {
    const started = Date.now();
    if (!this.configured()) return emptySync("NOT_CONFIGURED", "The Odds API is not configured.", Date.now() - started);
    const creds = oddsCreds();
    const base = creds.baseUrl ?? "https://api.the-odds-api.com/v4";
    const sport = env.WINDELS_SPORTS_ODDS_SPORT ?? "soccer_epl";
    const res = await httpGet(
      `${base}/sports/${encodeURIComponent(sport)}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${encodeURIComponent(creds.apiKey!)}`,
      {},
    );
    const status = res.status === 0 ? "OFFLINE" : classifyHttp(res.status, res.body);
    if (status !== "ONLINE") return emptySync(status, `Odds sync failed (${status}).`, Date.now() - started);
    let rows: any[];
    try {
      const parsed = JSON.parse(res.body);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      return emptySync("DATA_ERROR", "The Odds API returned non-JSON.", Date.now() - started);
    }
    const wanted = new Set(fixtures.map((f) => f.providerMatchId));
    const records: NormalizedOdds[] = [];
    let invalid = 0;
    for (const row of rows) {
      if (wanted.size && !wanted.has(String(row.id))) continue;
      const book = Array.isArray(row.bookmakers) ? row.bookmakers[0] : null;
      const markets = Array.isArray(book?.markets) ? book.markets : [];
      for (const mk of markets) {
        const outcomes = Array.isArray(mk.outcomes) ? mk.outcomes : [];
        for (const oc of outcomes) {
          const price = Number(oc.price);
          if (!Number.isFinite(price) || price <= 1) { invalid += 1; continue; }
          const mapped = mapOddsMarket(mk.key, oc.name, oc.point, row.home_team, row.away_team);
          if (!mapped) { invalid += 1; continue; }
          records.push({
            providerId: this.id,
            providerMatchId: String(row.id),
            market: mapped.market,
            selection: mapped.selection,
            line: mapped.line,
            oddsDecimal: price,
            openingOdds: null,
            liquidity: null,
            suspended: false,
            observedAt: new Date().toISOString(),
            dataClass: "LIVE",
          });
        }
      }
    }
    snapshotHealth({
      providerId: this.id, name: this.name, lastOddsSyncAt: new Date().toISOString(),
      recordsReceived: records.length, invalidRecords: invalid, lastSuccessAt: new Date().toISOString(),
    });
    return { ok: true, status: "ONLINE", records, invalid, missingFields: 0, error: null, durationMs: Date.now() - started };
  },
  async syncResults() {
    return emptySync("NOT_CONFIGURED", "The Odds API is not used as a result verification source.", 0);
  },
};

function mapOddsMarket(
  key: string, name: string, point: unknown, home: string, away: string,
): { market: SiOdds["market"]; selection: string; line: number | null } | null {
  const n = String(name);
  if (key === "h2h") {
    if (n === home) return { market: "HOME_WIN", selection: "HOME", line: null };
    if (n === away) return { market: "AWAY_WIN", selection: "AWAY", line: null };
    if (/draw/i.test(n)) return { market: "DRAW", selection: "DRAW", line: null };
  }
  if (key === "totals") {
    const line = typeof point === "number" ? point : Number(point);
    if (!Number.isFinite(line)) return null;
    if (/over/i.test(n)) return { market: "OVER_UNDER", selection: `OVER ${line}`, line };
    if (/under/i.test(n)) return { market: "OVER_UNDER", selection: `UNDER ${line}`, line };
  }
  return null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
}

export function providersForMode(mode: SiOperatingMode): SportsProvider[] {
  if (mode === "SANDBOX") return [SandboxProvider];
  const live: SportsProvider[] = [];
  if (ApiFootballProvider.configured()) live.push(ApiFootballProvider);
  if (TheOddsApiProvider.configured()) live.push(TheOddsApiProvider);
  return live;
}

export function allProviders(): SportsProvider[] {
  return [SandboxProvider, ApiFootballProvider, TheOddsApiProvider];
}

export function toLeague(org: string, f: NormalizedFixture, now: string): SiLeague {
  return {
    id: `si-lg-${f.providerId}-${f.providerLeagueId}`,
    organizationId: org,
    providerId: f.providerId,
    providerLeagueId: f.providerLeagueId,
    name: f.leagueName,
    country: f.country,
    sport: "football",
    dataClass: f.dataClass,
    createdAt: now,
    updatedAt: now,
  };
}

export function toTeam(org: string, providerId: string, providerTeamId: string, name: string, leagueId: string, dataClass: SiDataClass, now: string): SiTeam {
  return {
    id: `si-tm-${providerId}-${providerTeamId}`,
    organizationId: org,
    providerId,
    providerTeamId,
    name,
    shortName: null,
    leagueId,
    dataClass,
    createdAt: now,
    updatedAt: now,
  };
}

export function toMatch(org: string, f: NormalizedFixture, leagueId: string, homeId: string, awayId: string, now: string): SiMatch {
  return {
    id: `si-mt-${f.providerId}-${f.providerMatchId}`,
    organizationId: org,
    providerId: f.providerId,
    providerMatchId: f.providerMatchId,
    leagueId,
    leagueName: f.leagueName,
    homeTeamId: homeId,
    homeTeamName: f.homeName,
    awayTeamId: awayId,
    awayTeamName: f.awayName,
    kickoffAt: f.kickoffAt,
    status: f.status,
    venue: f.venue,
    homeForm: f.homeForm,
    awayForm: f.awayForm,
    homeXg: f.homeXg,
    awayXg: f.awayXg,
    homeLeaguePos: f.homeLeaguePos,
    awayLeaguePos: f.awayLeaguePos,
    restDaysHome: f.restDaysHome,
    restDaysAway: f.restDaysAway,
    injuries: f.injuries,
    lineupsAvailable: f.lineups.length > 0,
    lineups: f.lineups,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    dataClass: f.dataClass,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export { healthState };
