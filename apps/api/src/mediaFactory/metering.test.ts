/**
 * Session 77.B item 22 — usage metering and pre-execution cost estimates.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Spec: "Billing/usage metering — AI tokens, GPU time, render time, voice
 * minutes, image/video generation, storage, publishing, workflow executions —
 * into existing Billing/Wallet, with cost estimate shown pre-execution."
 *
 * Nothing in Media Factory was metered: renders burned real CPU and publishes
 * consumed real platform quota, with no record and no warning beforehand.
 *
 * The properties pinned here are the ones that keep a usage ledger trustworthy,
 * and they are the ones this codebase has historically got wrong:
 *
 *   - an ESTIMATE is labelled `isEstimate: true` and never lands in the ledger;
 *   - a RECORD holds measured units only, so a summary is a measurement;
 *   - an unset rate yields `unpriced: true` with **no** `costMicros`, rather
 *     than a confident 0.00 — reporting free work is a claim, and the whole
 *     point of this pass has been to stop making claims nothing backs.
 *
 * Redis is substituted with FakeKv; no infrastructure required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeKv } from "./publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { MediaMeteringService } = await import("./metering.service.js");

const ORG = "org-meter";
const OTHER = "org-other";

const RATE_VARS = [
  "MEDIA_RATE_RENDER_MS_MICROS",
  "MEDIA_RATE_OUTPUT_BYTE_MICROS",
  "MEDIA_RATE_AI_TOKEN_MICROS",
  "MEDIA_RATE_VOICE_SECOND_MICROS",
  "MEDIA_RATE_PUBLISH_JOB_MICROS",
];

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  for (const v of RATE_VARS) delete process.env[v];
});
afterEach(() => {
  for (const v of RATE_VARS) delete process.env[v];
});

describe("unset rates report unpriced, never free", () => {
  it("omits cost entirely when no rate is configured", async () => {
    const [rec] = await MediaMeteringService.recordRender(ORG, "vid-1", { elapsedMs: 4200, outputBytes: 1_000_000 });

    expect(rec!.quantity).toBe(4200);
    expect(rec!.unpriced).toBe(true);
    // The distinction that matters: absent, not zero. A 0 would render as
    // "this cost nothing", which the service cannot know.
    expect(rec!.costMicros).toBeUndefined();
  });

  it("marks an estimate unpriced and says why", () => {
    const est = MediaMeteringService.estimateRender({ durationSec: 30 });

    expect(est.unpriced).toBe(true);
    expect(est.totalCostMicros).toBeUndefined();
    expect(est.notes.join(" ")).toMatch(/MEDIA_RATE_.*not configured|no .*rates are configured/i);
    // Quantities are still projected — the operator learns the workload even
    // without pricing.
    expect(est.lines.every((l) => l.quantity > 0)).toBe(true);
  });

  it("summary reports unpriced usage without inventing a total", async () => {
    await MediaMeteringService.recordRender(ORG, "vid-1", { elapsedMs: 1000 });
    const s = await MediaMeteringService.summary(ORG);

    expect(s.recordCount).toBe(1);
    expect(s.totalCostMicros).toBeUndefined();
    expect(s.partiallyUnpriced).toBe(true);
  });
});

describe("configured rates price measured units", () => {
  beforeEach(() => {
    process.env.MEDIA_RATE_RENDER_MS_MICROS = "2";
    process.env.MEDIA_RATE_OUTPUT_BYTE_MICROS = "0.01";
    process.env.MEDIA_RATE_PUBLISH_JOB_MICROS = "5000";
  });

  it("prices a render from its measured elapsed time", async () => {
    const recs = await MediaMeteringService.recordRender(ORG, "vid-1", { elapsedMs: 3000, outputBytes: 2_000_000 });

    const renderRec = recs.find((r) => r.kind === "render_ms")!;
    expect(renderRec.quantity).toBe(3000);
    expect(renderRec.costMicros).toBe(6000); // 3000ms x 2
    expect(renderRec.unpriced).toBe(false);

    const bytesRec = recs.find((r) => r.kind === "output_bytes")!;
    expect(bytesRec.quantity).toBe(2_000_000);
    expect(bytesRec.costMicros).toBe(20_000); // 2e6 x 0.01
  });

  it("prices a publish per platform job", async () => {
    const recs = await MediaMeteringService.recordPublish(ORG, "pj-1", { mediaBytes: 500_000 });
    const jobRec = recs.find((r) => r.kind === "publish_job")!;
    expect(jobRec.quantity).toBe(1);
    expect(jobRec.costMicros).toBe(5000);
  });

  it("totals only the priced kinds and flags the gap", async () => {
    // render_ms and output_bytes are priced; voice_seconds is not.
    await MediaMeteringService.recordRender(ORG, "vid-1", { elapsedMs: 1000, outputBytes: 100_000 });
    await MediaMeteringService.record({ organizationId: ORG, operation: "voice", kind: "voice_seconds", quantity: 60 });

    const s = await MediaMeteringService.summary(ORG);
    expect(s.totalCostMicros).toBe(2000 + 1000); // 1000x2 + 100000x0.01
    // The total is real but incomplete, and says so rather than implying
    // it covers everything.
    expect(s.partiallyUnpriced).toBe(true);
  });
});

describe("estimates are projections, kept out of the ledger", () => {
  beforeEach(() => { process.env.MEDIA_RATE_RENDER_MS_MICROS = "2"; });

  it("labels itself an estimate with a stated confidence", () => {
    const est = MediaMeteringService.estimateRender({ durationSec: 10 });
    expect(est.isEstimate).toBe(true);
    expect(["low", "medium"]).toContain(est.confidence);
  });

  it("explains the basis of every projected quantity", () => {
    const est = MediaMeteringService.estimateRender({ durationSec: 10, aspect: "9:16" });
    // A projection a user cannot audit is a magic number.
    for (const line of est.lines) expect(line.basis.length).toBeGreaterThan(10);
  });

  it("scales with duration", () => {
    const short = MediaMeteringService.estimateRender({ durationSec: 5 });
    const long = MediaMeteringService.estimateRender({ durationSec: 60 });
    const q = (e: typeof short) => e.lines.find((l) => l.kind === "render_ms")!.quantity;
    expect(q(long)).toBeGreaterThan(q(short));
  });

  it("scales publish cost with platform count", () => {
    process.env.MEDIA_RATE_PUBLISH_JOB_MICROS = "1000";
    const one = MediaMeteringService.estimatePublish({ platforms: ["youtube"] });
    const three = MediaMeteringService.estimatePublish({ platforms: ["youtube", "tiktok", "x"] });
    expect(one.totalCostMicros).toBe(1000);
    expect(three.totalCostMicros).toBe(3000);
  });

  it("writes nothing to the ledger", async () => {
    MediaMeteringService.estimateRender({ durationSec: 30 });
    MediaMeteringService.estimatePublish({ platforms: ["youtube"] });

    // The core separation: a forecast that reaches the usage ledger becomes a
    // bill nobody can reconcile.
    const s = await MediaMeteringService.summary(ORG);
    expect(s.recordCount).toBe(0);
    expect(await MediaMeteringService.listRecords(ORG)).toEqual([]);
  });
});

describe("ledger integrity", () => {
  it("keeps organizations isolated", async () => {
    await MediaMeteringService.recordRender(ORG, "vid-1", { elapsedMs: 1000 });
    expect((await MediaMeteringService.summary(ORG)).recordCount).toBe(1);
    expect((await MediaMeteringService.summary(OTHER)).recordCount).toBe(0);
  });

  it("reports zeros for an org that has done nothing", async () => {
    const s = await MediaMeteringService.summary(OTHER);
    expect(s.recordCount).toBe(0);
    expect(s.totals).toEqual([]);
    expect(s.totalCostMicros).toBeUndefined();
  });

  it("retains the ref id so usage reconciles to its job", async () => {
    await MediaMeteringService.recordPublish(ORG, "pj-42");
    const [rec] = await MediaMeteringService.listRecords(ORG);
    expect(rec!.refId).toBe("pj-42");
    expect(rec!.operation).toBe("publish");
  });

  it("rejects a negative quantity rather than storing it", async () => {
    const r = await MediaMeteringService.record({
      organizationId: ORG, operation: "render", kind: "render_ms", quantity: -5,
    });
    expect(r).toBeNull();
    expect(await MediaMeteringService.listRecords(ORG)).toEqual([]);
  });

  it("excludes records outside the requested window", async () => {
    await MediaMeteringService.recordRender(ORG, "vid-old", { elapsedMs: 1000 });
    // Rewrite the stored record to look 60 days old.
    const raw = await kv.lrange(`mf:usage:${ORG}`, 0, -1);
    const rec = JSON.parse(raw[0]!);
    rec.at = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    kv.lists.set(`mf:usage:${ORG}`, [JSON.stringify(rec)]);

    expect((await MediaMeteringService.summary(ORG, 30)).recordCount).toBe(0);
    expect((await MediaMeteringService.summary(ORG, 90)).recordCount).toBe(1);
  });

  it("never throws into the caller's path when the store fails", async () => {
    const boom = vi.spyOn(kv, "lpush").mockRejectedValueOnce(new Error("redis down"));
    // Metering must not be able to fail a render that already succeeded.
    await expect(
      MediaMeteringService.record({ organizationId: ORG, operation: "render", kind: "render_ms", quantity: 10 }),
    ).resolves.toBeNull();
    boom.mockRestore();
  });
});
