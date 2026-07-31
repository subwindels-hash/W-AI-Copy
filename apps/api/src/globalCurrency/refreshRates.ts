/**
 * Periodic FX rate refresh — pulls real rates from open providers
 * (frankfurter.app / open.er-api.com) and caches them in Redis so the
 * GlobalCurrencyService serves live values instead of offline seeds.
 *
 * Runs once at startup and on a 60-minute timer. If providers are
 * unreachable, falls back to existing cache or offline seeds — never
 * throws and never crashes the server.
 */
import { redisCmd as redis } from "../db/redis.js";
import { ExchangeRatesService } from "../billing/exchangeRates.js";

const K = { rates: "gcu:rates" };

export async function refreshFxRates(logger?: any) {
  const bases = ["USD", "EUR", "GBP", "NGN"];
  let ok = 0;
  let syn = 0;
  for (const base of bases) {
    try {
      const rs = await ExchangeRatesService.getRates(base);
      if (rs.synthetic) { syn++; continue; }
      // Write into the global-currency hash for seamless use
      const multi = redis.multi();
      for (const [cur, rate] of Object.entries(rs.rates)) {
        if (cur === base) continue;
        const rec = {
          from: base, to: cur, rate: +rate.toFixed(6),
          source: rs.provider, updatedAt: new Date(rs.fetchedAt).toISOString(),
        };
        multi.hset(K.rates, `${base}:${cur}`, JSON.stringify(rec));
      }
      await multi.exec();
      ok++;
    } catch (e) {
      logger?.warn?.("[global-currency] refresh failed for base", { base, err: String(e) });
    }
  }
  logger?.info?.("[global-currency] FX refresh complete", { liveBases: ok, syntheticBases: syn });
}

export function startFxRefreshJob(logger?: any, intervalMs = 3600_000) {
  // Initial refresh (non-blocking)
  refreshFxRates(logger).catch((e) => logger?.warn?.("[global-currency] initial refresh failed", { err: String(e) }));
  const handle = setInterval(() => {
    refreshFxRates(logger).catch(() => {});
  }, intervalMs);
  // Don't keep Node alive just for this job
  if ((handle as any).unref) (handle as any).unref();
  return handle;
}
