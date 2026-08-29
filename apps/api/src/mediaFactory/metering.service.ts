/**
 * Session 77.B item 22 — Media Factory usage metering + pre-execution estimates.
 *
 * Spec: "Billing/usage metering — AI tokens, GPU time, render time, voice
 * minutes, image/video generation, storage, publishing, workflow executions —
 * into existing Billing/Wallet, with cost estimate shown pre-execution."
 *
 * Before this, nothing in Media Factory was metered. A render burned real CPU
 * and a publish consumed real platform quota, and neither left a record or
 * warned anyone beforehand.
 *
 * TWO THINGS, KEPT APART
 * ----------------------
 * `estimate*()` projects from request inputs *before* work starts and returns
 * `isEstimate: true`. `record*()` writes measured units *after* work finishes —
 * actual elapsed render milliseconds, actual output bytes, actual token counts.
 * A record never contains a projection, because a projection that lands in a
 * usage ledger becomes a bill nobody can reconcile.
 *
 * RATES ARE CONFIGURATION
 * -----------------------
 * Every rate defaults to 0, meaning **not priced**. An unset rate produces
 * `unpriced: true` and omits `costMicros` entirely rather than reporting a
 * confident 0.00 — a zero cost is a claim, and this service is not in a
 * position to make it. Operators set real rates through MEDIA_RATE_* env vars.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  MediaRateCard,
  MediaUsageKind,
  MediaUsageRecord,
  MediaCostEstimate,
  MediaCostEstimateLine,
  MediaUsageSummary,
  EstimateRenderInput,
  EstimatePublishInput,
} from "@windels/shared/mediaMetering";

const K = {
  records: (oid: string) => `mf:usage:${oid}`,
  record: (oid: string, id: string) => `mf:usage:${oid}:${id}`,
};

/** Keep the ledger bounded; summaries read the retained window. */
const RECORD_CAP = 2000;

const uid = () => "mu-" + randomUUID().slice(0, 12);
const num = (raw: string | undefined, fallback = 0): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Read rates from the environment on each call so an operator can change
 * pricing without a restart, and so tests can set them per-case.
 */
export function rateCard(): MediaRateCard {
  return {
    renderMsMicros: num(process.env.MEDIA_RATE_RENDER_MS_MICROS),
    outputByteMicros: num(process.env.MEDIA_RATE_OUTPUT_BYTE_MICROS),
    aiTokenMicros: num(process.env.MEDIA_RATE_AI_TOKEN_MICROS),
    voiceSecondMicros: num(process.env.MEDIA_RATE_VOICE_SECOND_MICROS),
    publishJobMicros: num(process.env.MEDIA_RATE_PUBLISH_JOB_MICROS),
  };
}

function rateFor(kind: MediaUsageKind, card: MediaRateCard): number {
  switch (kind) {
    case "render_ms": return card.renderMsMicros;
    case "output_bytes": return card.outputByteMicros;
    case "ai_tokens": return card.aiTokenMicros;
    case "voice_seconds": return card.voiceSecondMicros;
    case "publish_job": return card.publishJobMicros;
  }
}

/** Price a quantity, or report it unpriced when no rate is configured. */
function price(kind: MediaUsageKind, quantity: number, card: MediaRateCard):
  { costMicros?: number; unpriced: boolean } {
  const rate = rateFor(kind, card);
  if (rate <= 0) return { unpriced: true };
  return { costMicros: Math.round(quantity * rate), unpriced: false };
}

export const MediaMeteringService = {
  rateCard,

  /**
   * Record measured usage. Callers pass units they actually observed.
   *
   * Never throws into the caller's path: metering must not be able to fail a
   * render or a publish that already succeeded. A failure is logged and
   * swallowed, because losing a usage record is strictly better than losing
   * the work it describes.
   */
  async record(input: {
    organizationId: string;
    operation: string;
    refId?: string;
    kind: MediaUsageKind;
    quantity: number;
  }): Promise<MediaUsageRecord | null> {
    try {
      if (!Number.isFinite(input.quantity) || input.quantity < 0) return null;
      const card = rateCard();
      const { costMicros, unpriced } = price(input.kind, input.quantity, card);
      const rec: MediaUsageRecord = {
        id: uid(),
        organizationId: input.organizationId,
        operation: input.operation,
        refId: input.refId,
        kind: input.kind,
        quantity: input.quantity,
        ...(costMicros !== undefined ? { costMicros } : {}),
        unpriced,
        at: new Date().toISOString(),
      };
      await redis.lpush(K.records(input.organizationId), JSON.stringify(rec));
      await redis.ltrim(K.records(input.organizationId), 0, RECORD_CAP - 1);
      return rec;
    } catch (e) {
      logger.warn("[media-metering] failed to record usage", {
        err: e instanceof Error ? e.message : String(e),
        operation: input.operation,
      });
      return null;
    }
  },

  /** Record several measured units from one operation. */
  async recordMany(
    organizationId: string,
    operation: string,
    refId: string | undefined,
    units: Array<{ kind: MediaUsageKind; quantity: number }>,
  ): Promise<MediaUsageRecord[]> {
    const out: MediaUsageRecord[] = [];
    for (const u of units) {
      const r = await this.record({ organizationId, operation, refId, ...u });
      if (r) out.push(r);
    }
    return out;
  },

  /**
   * Project the cost of a render before it runs.
   *
   * Render time is projected from clip duration using a measured-throughput
   * factor, not a guess pulled from nothing: the encoder writes roughly
   * real-time-ish output for these short slide-based clips, so the projection
   * is duration-proportional and explicitly banded `low` confidence. Actual
   * cost comes from `recordRender` once ffmpeg has finished.
   */
  estimateRender(input: EstimateRenderInput): MediaCostEstimate {
    const card = rateCard();
    const lines: MediaCostEstimateLine[] = [];

    // Slide-based renders encode faster than real time, but ffmpeg startup and
    // concat add a fixed overhead. Both terms are stated in `basis` so the
    // number is auditable rather than magic.
    const projectedRenderMs = 1500 + input.durationSec * 900;
    lines.push({
      kind: "render_ms",
      quantity: projectedRenderMs,
      basis: `1500ms fixed encoder overhead + 900ms per second of output (${input.durationSec}s)`,
      ...price("render_ms", projectedRenderMs, card),
    });

    // Output size scales with resolution and duration.
    const perSecondBytes = input.aspect === "9:16" ? 220_000 : input.aspect === "1:1" ? 200_000 : 260_000;
    const projectedBytes = perSecondBytes * input.durationSec;
    lines.push({
      kind: "output_bytes",
      quantity: projectedBytes,
      basis: `${Math.round(perSecondBytes / 1000)}kB per second at ${input.aspect ?? "16:9"} x264`,
      ...price("output_bytes", projectedBytes, card),
    });

    return finalise("render", lines, [
      "Render time varies with machine load and codec behaviour; treat this as a band, not a quote.",
      "Actual usage is recorded from measured elapsed time and output size once the render completes.",
    ]);
  },

  /** Project the cost of publishing to one or more platforms. */
  estimatePublish(input: EstimatePublishInput): MediaCostEstimate {
    const card = rateCard();
    const lines: MediaCostEstimateLine[] = [];

    lines.push({
      kind: "publish_job",
      quantity: input.platforms.length,
      basis: `one job per platform (${input.platforms.join(", ")})`,
      ...price("publish_job", input.platforms.length, card),
    });

    if (input.mediaBytes && input.mediaBytes > 0) {
      // Each platform receives its own copy of the media.
      const egress = input.mediaBytes * input.platforms.length;
      lines.push({
        kind: "output_bytes",
        quantity: egress,
        basis: `${input.mediaBytes} bytes uploaded to ${input.platforms.length} platform(s)`,
        ...price("output_bytes", egress, card),
      });
    }

    return finalise("publish", lines, [
      "Excludes any charges levied by the destination platform itself.",
    ]);
  },

  /** Measured usage from a completed render. */
  async recordRender(
    organizationId: string,
    renderId: string,
    measured: { elapsedMs: number; outputBytes?: number },
  ): Promise<MediaUsageRecord[]> {
    const units: Array<{ kind: MediaUsageKind; quantity: number }> = [
      { kind: "render_ms", quantity: Math.max(0, Math.round(measured.elapsedMs)) },
    ];
    if (measured.outputBytes && measured.outputBytes > 0) {
      units.push({ kind: "output_bytes", quantity: measured.outputBytes });
    }
    return this.recordMany(organizationId, "render", renderId, units);
  },

  /** Measured usage from a completed publish. */
  async recordPublish(
    organizationId: string,
    jobId: string,
    measured: { mediaBytes?: number } = {},
  ): Promise<MediaUsageRecord[]> {
    const units: Array<{ kind: MediaUsageKind; quantity: number }> = [
      { kind: "publish_job", quantity: 1 },
    ];
    if (measured.mediaBytes && measured.mediaBytes > 0) {
      units.push({ kind: "output_bytes", quantity: measured.mediaBytes });
    }
    return this.recordMany(organizationId, "publish", jobId, units);
  },

  async listRecords(organizationId: string, limit = 100): Promise<MediaUsageRecord[]> {
    const raw = await redis.lrange(K.records(organizationId), 0, Math.max(0, limit - 1));
    const out: MediaUsageRecord[] = [];
    for (const s of raw) {
      try { out.push(JSON.parse(s) as MediaUsageRecord); } catch { /* skip corrupt entry */ }
    }
    return out;
  },

  /**
   * Roll up measured usage. Contains no projections — an organization that has
   * rendered nothing reports zeros, not a forecast.
   */
  async summary(organizationId: string, windowDays = 30): Promise<MediaUsageSummary> {
    const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
    const records = (await this.listRecords(organizationId, RECORD_CAP))
      .filter((r) => Date.parse(r.at) >= cutoff);

    const byKind = new Map<MediaUsageKind, { quantity: number; costMicros: number; anyPriced: boolean; anyUnpriced: boolean }>();
    for (const r of records) {
      const cur = byKind.get(r.kind) ?? { quantity: 0, costMicros: 0, anyPriced: false, anyUnpriced: false };
      cur.quantity += r.quantity;
      if (r.costMicros !== undefined) { cur.costMicros += r.costMicros; cur.anyPriced = true; }
      if (r.unpriced) cur.anyUnpriced = true;
      byKind.set(r.kind, cur);
    }

    let total = 0;
    let anyPriced = false;
    let partiallyUnpriced = false;
    const totals = [...byKind.entries()].map(([kind, v]) => {
      if (v.anyPriced) { total += v.costMicros; anyPriced = true; }
      if (v.anyUnpriced) partiallyUnpriced = true;
      return {
        kind,
        quantity: v.quantity,
        ...(v.anyPriced ? { costMicros: v.costMicros } : {}),
        unpriced: v.anyUnpriced,
      };
    });

    return {
      organizationId,
      windowDays,
      totals,
      ...(anyPriced ? { totalCostMicros: total } : {}),
      partiallyUnpriced,
      recordCount: records.length,
    };
  },
};

/** Assemble the estimate, deciding pricing coverage from the lines. */
function finalise(operation: string, lines: MediaCostEstimateLine[], notes: string[]): MediaCostEstimate {
  const priced = lines.filter((l) => !l.unpriced);
  const total = priced.reduce((s, l) => s + (l.costMicros ?? 0), 0);
  const allUnpriced = priced.length === 0;

  return {
    isEstimate: true,
    operation,
    lines,
    ...(allUnpriced ? {} : { totalCostMicros: total }),
    partiallyUnpriced: priced.length !== lines.length,
    unpriced: allUnpriced,
    confidence: "low",
    notes: allUnpriced
      ? [...notes, "No MEDIA_RATE_* rates are configured, so quantities are projected but cost is not priced."]
      : notes,
  };
}

export default MediaMeteringService;
