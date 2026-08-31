/**
 * Global Platform client — request contract and null handling.
 *
 * `api` is mocked, so what is asserted is which path, verb, query and body each
 * control sends, plus the one thing that silently breaks the admin UI: the two
 * measurements Node fabricates (`replicationLagMs: 42`, and the CDN's
 * "simulated" 42 POPs / 0.87 hit rate / 12.4 GB) come back as null from the
 * PHP build, so the formatting helpers must render them as "not measured"
 * instead of "nullms" or "Invalid Date".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { platformApi, formatReplicationLag, formatBackupTime, formatCacheHitRate, formatBandwidth, purgeTone } from "./platform";

beforeEach(() => apiFn.mockReset());

const lastCall = () => apiFn.mock.calls[apiFn.mock.calls.length - 1] as [string, any];

describe("observability endpoints", () => {
  it("requests the metrics snapshot", async () => {
    await platformApi.metrics();
    expect(lastCall()[0]).toBe("/platform/metrics");
    expect(lastCall()[1]).toBeUndefined();
  });

  it("sends level, limit and search as query params on /logs", async () => {
    await platformApi.logs({ level: "error", limit: 50, search: "cdn_purge" });
    const [path, init] = lastCall();
    expect(path).toBe("/platform/logs");
    expect(init.params).toEqual({ level: "error", limit: 50, search: "cdn_purge" });
  });

  it("sends no query string at all when no filter is given", async () => {
    await platformApi.logs();
    const [, init] = lastCall();
    expect(init.params).toBeUndefined();
  });

  it("requests traces with a limit", async () => {
    await platformApi.traces(10);
    const [path, init] = lastCall();
    expect(path).toBe("/platform/traces");
    expect(init.params).toEqual({ limit: 10 });
  });

  it("requests one trace by id", async () => {
    await platformApi.trace("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    expect(lastCall()[0]).toBe("/platform/traces/a1b2c3d4e5f60718293a4b5c6d7e8f90");
  });

  it("requests one span by id", async () => {
    await platformApi.span("0102030405060708");
    expect(lastCall()[0]).toBe("/platform/spans/0102030405060708");
  });

  it("requests the AI observability window in minutes", async () => {
    await platformApi.aiObservability(1440);
    const [path, init] = lastCall();
    expect(path).toBe("/platform/ai-observability");
    expect(init.params).toEqual({ minutes: 1440 });
  });
});

describe("regions and failover", () => {
  it("lists regions", async () => {
    await platformApi.regions();
    expect(lastCall()[0]).toBe("/platform/regions");
  });

  it("reads the disaster-recovery report", async () => {
    await platformApi.dr();
    expect(lastCall()[0]).toBe("/platform/dr");
  });

  it("posts a failover with a target and reason", async () => {
    await platformApi.triggerFailover("dr-us-west-2", "DR drill");
    const [path, init] = lastCall();
    expect(path).toBe("/platform/failover");
    expect(init.method).toBe("POST");
    expect(init.json).toEqual({ toRegion: "dr-us-west-2", reason: "DR drill" });
  });

  it("clears a failover with DELETE", async () => {
    await platformApi.clearFailover();
    const [path, init] = lastCall();
    expect(path).toBe("/platform/failover");
    expect(init.method).toBe("DELETE");
  });
});

describe("cdn endpoints", () => {
  it("reads the CDN configuration", async () => {
    await platformApi.cdn();
    expect(lastCall()[0]).toBe("/platform/cdn");
  });

  it("replaces the whole rule set with PUT", async () => {
    const rules = [{ pathPattern: "/assets/*", ttlSeconds: 86400, staleWhileRevalidate: 300, cacheKeyIncludes: [], enabled: true }];
    await platformApi.updateCdnRules(rules);
    const [path, init] = lastCall();
    expect(path).toBe("/platform/cdn/rules");
    expect(init.method).toBe("PUT");
    expect(init.json).toEqual({ rules });
  });

  it("posts the paths to purge", async () => {
    await platformApi.purgeCdn(["/assets/app.js", "/assets/app.css"]);
    const [path, init] = lastCall();
    expect(path).toBe("/platform/cdn/purge");
    expect(init.method).toBe("POST");
    expect(init.json).toEqual({ paths: ["/assets/app.js", "/assets/app.css"] });
  });

  it("signs a URL with an optional TTL", async () => {
    await platformApi.signUrl("https://cdn.example.com/assets/app.js", 600);
    const [path, init] = lastCall();
    expect(path).toBe("/platform/cdn/sign-url");
    expect(init.method).toBe("POST");
    expect(init.json).toEqual({ url: "https://cdn.example.com/assets/app.js", ttlSeconds: 600 });
  });

  it("omits the TTL when the caller does not give one", async () => {
    await platformApi.signUrl("https://cdn.example.com/assets/app.js");
    expect(lastCall()[1].json).toEqual({ url: "https://cdn.example.com/assets/app.js", ttlSeconds: undefined });
  });

  it("reads the combined overview", async () => {
    await platformApi.overview();
    expect(lastCall()[0]).toBe("/platform/overview");
  });
});

// ─── the numbers Node invents, and what happens when they are absent ────────

describe("formatting measurements this build refuses to invent", () => {
  it("renders a real replication lag in milliseconds", () => {
    expect(formatReplicationLag(120)).toBe("120ms");
  });

  it("renders an absent replication lag as a dash, never 'nullms'", () => {
    expect(formatReplicationLag(null)).toBe("—");
    expect(formatReplicationLag(null)).not.toContain("null");
  });

  it("renders a missing backup as a sentence, never the epoch", () => {
    expect(formatBackupTime(null)).toBe("never recorded");
    expect(formatBackupTime(null)).not.toContain("1970");
  });

  it("renders a recorded backup as a local date", () => {
    const out = formatBackupTime("2026-08-30T12:00:00Z");
    expect(out).not.toBe("never recorded");
    expect(out).not.toContain("Invalid");
  });

  it("renders a real hit rate as a percentage", () => {
    expect(formatCacheHitRate(0.8734)).toBe("87.3%");
  });

  it("renders an absent hit rate as a dash, never 'NaN%'", () => {
    expect(formatCacheHitRate(null)).toBe("—");
    expect(formatCacheHitRate(null)).not.toContain("NaN");
  });

  it("renders bandwidth, or a dash when nothing is reported", () => {
    expect(formatBandwidth(12.4)).toBe("12.4 GB");
    expect(formatBandwidth(null)).toBe("—");
  });
});

describe("purge status tone", () => {
  it("treats a completed purge as success", () => {
    expect(purgeTone("complete")).toBe("emerald");
  });

  it("treats a pending purge as in-flight", () => {
    expect(purgeTone("pending")).toBe("amber");
  });

  it("shows a skipped purge neutrally, not as a completed job", () => {
    expect(purgeTone("skipped")).toBe("azure");
    expect(purgeTone("skipped")).not.toBe(purgeTone("complete"));
  });
});
