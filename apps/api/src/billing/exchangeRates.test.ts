/**
 * WINDELS AI OS — Exchange Rate (FX) management tests.
 *
 * Covers rate fetching, Redis caching, synthetic fallback, currency conversion,
 * and stale-rate detection — against the real ExchangeRatesService with FakeKv
 * for Redis and a stubbed global.fetch to control provider responses.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { ExchangeRatesService } = await import("./exchangeRates.js");

// Build a fake fetch Response.
const jsonRes = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

// A working frankfurter-style provider.
function frankfurterResponse(base: string) {
  return { base, date: "2026-08-05", rates: { EUR: 0.92, GBP: 0.78, NGN: 1580 } };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchange rate fetching", () => {
  it("retrieves rates from the provider and parses them", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    const rs = await ExchangeRatesService.getRates("USD");
    expect(rs.base).toBe("USD");
    expect(rs.rates.EUR).toBeCloseTo(0.92, 5);
    expect(rs.rates.NGN).toBe(1580);
    expect(rs.synthetic).toBe(false);
    expect(rs.provider).toBe("frankfurter.app");
    // Should have hit the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through to a second provider when the first fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, false)) // frankfurter 500
      .mockResolvedValueOnce(jsonRes({ result: "success", base_code: "USD", rates: { EUR: 0.91, NGN: 1590 } })); // open.er-api
    const rs = await ExchangeRatesService.getRates("USD");
    expect(rs.provider).toBe("open.er-api.com");
    expect(rs.rates.NGN).toBe(1590);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles an unavailable source by returning synthetic fallback", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const rs = await ExchangeRatesService.getRates("USD");
    expect(rs.synthetic).toBe(true);
    expect(rs.provider).toBe("synthetic-fallback");
    expect(rs.rates.NGN).toBeGreaterThan(0);
    expect(rs.rates.EUR).toBeGreaterThan(0);
  });

  it("ignores malformed provider payloads and falls back", async () => {
    fetchMock.mockResolvedValue(jsonRes({ unexpected: true })); // no rates
    const rs = await ExchangeRatesService.getRates("USD");
    expect(rs.synthetic).toBe(true);
  });
});

describe("rate caching", () => {
  it("reuses a cached fresh rate without hitting the network", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    await ExchangeRatesService.getRates("USD"); // miss → fetch
    const callsAfterFetch = fetchMock.mock.calls.length;
    const second = await ExchangeRatesService.getRates("USD"); // hit cache
    expect(fetchMock.mock.calls.length).toBe(callsAfterFetch); // no new fetch
    expect(second.rates.EUR).toBeCloseTo(0.92, 5);
    expect(second.synthetic).toBe(false);
  });

  it("does not re-fetch when a fresh cached set exists even if network is down", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("EUR")));
    await ExchangeRatesService.getRates("EUR"); // cache fresh EUR
    fetchMock.mockRejectedValue(new Error("offline"));
    const rs = await ExchangeRatesService.getRates("EUR");
    expect(rs.provider).toBe("frankfurter.app");
    expect(rs.synthetic).toBe(false); // served from cache, not synthetic
  });

  it("cache key is per base currency (isolated)", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    await ExchangeRatesService.getRates("USD");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes({ base: "GBP", date: "2026-08-05", rates: { USD: 1.28 } }));
    const gbp = await ExchangeRatesService.getRates("GBP");
    expect(gbp.base).toBe("GBP");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("currency conversion", () => {
  it("converts between currencies using the rate", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    const c = await ExchangeRatesService.convert({ amount: 100, from: "USD", to: "EUR" });
    expect(c.convertedCurrency).toBe("EUR");
    expect(c.convertedAmount).toBeCloseTo(92, 4);
    expect(c.originalAmount).toBe(100);
    expect(c.originalCurrency).toBe("USD");
  });

  it("returns unity for same-currency conversion (no network)", async () => {
    const c = await ExchangeRatesService.convert({ amount: 250, from: "USD", to: "usd" });
    expect(c.rate).toBe(1);
    expect(c.convertedAmount).toBe(250);
    expect(c.provider).toBe("unity");
    expect(c.synthetic).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles rounding/precision to 4 decimals", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    const c = await ExchangeRatesService.convert({ amount: 0.1, from: "USD", to: "NGN" });
    expect(c.convertedAmount).toBe(158); // 0.1 * 1580
    expect(c.rate).toBeCloseTo(1580, 6);
  });

  it("throws FX_UNAVAILABLE when no rate can be found", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    // EUR not in synthetic USD table's exotic set and not reachable via USD inverse path.
    await expect(ExchangeRatesService.convert({ amount: 10, from: "XXX", to: "YYY" })).rejects.toMatchObject({ code: "FX_UNAVAILABLE" });
  });

  it("derives an inverse rate via USD when direct rate is missing", async () => {
    // USD base has EUR 0.92; GBP base has USD 1.28. USD->GBP direct exists (0.78).
    // Test EUR->GBP where EUR table lacks GBP: fall back via USD inverse.
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("from=EUR")) return jsonRes({ base: "EUR", date: "2026-08-05", rates: { USD: 1.09 } });
      return jsonRes({ base: "USD", date: "2026-08-05", rates: { EUR: 0.92, GBP: 0.78 } });
    });
    const c = await ExchangeRatesService.convert({ amount: 100, from: "EUR", to: "GBP" });
    expect(c.convertedAmount).toBeGreaterThan(0);
    expect(c.convertedCurrency).toBe("GBP");
  });
});

describe("stale rate detection", () => {
  it("marks a cached rate as stale once past the TTL", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    const fresh = await ExchangeRatesService.convert({ amount: 1, from: "USD", to: "EUR" });
    expect(fresh.stale).toBe(false);
    // Age the cached set beyond the 1h TTL by rewriting fetchedAt.
    const raw = JSON.parse((await kv.get("fx:rates:USD"))!);
    raw.fetchedAt = Date.now() - 3600 * 1000 - 1000;
    await kv.set("fx:rates:USD", JSON.stringify(raw));
    const stale = await ExchangeRatesService.convert({ amount: 1, from: "USD", to: "EUR" });
    expect(stale.stale).toBe(true);
    expect(stale.rate).toBeCloseTo(0.92, 5);
  });

  it("serves a stale cached rate rather than failing when offline", async () => {
    fetchMock.mockResolvedValue(jsonRes(frankfurterResponse("USD")));
    await ExchangeRatesService.getRates("USD"); // cache
    const raw = JSON.parse((await kv.get("fx:rates:USD"))!);
    raw.fetchedAt = Date.now() - 48 * 3600 * 1000; // 2 days old (stale but within STALE_TTL 2d)
    await kv.set("fx:rates:USD", JSON.stringify(raw));
    fetchMock.mockRejectedValue(new Error("offline"));
    const rs = await ExchangeRatesService.getRates("USD");
    expect(rs.rates.EUR).toBeCloseTo(0.92, 5);
    expect(rs.synthetic).toBe(false);
  });
});
