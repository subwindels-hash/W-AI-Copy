/**
 * Queue and background-worker behaviour (Phase 1 §16 and the retry/dedupe half
 * of §18's messaging tests).
 *
 * The point of the queue is that the webhook can return 200 immediately and
 * still guarantee the event is processed exactly once, or parked somewhere
 * visible if it can't be. That guarantee is what these tests check: claim
 * exclusivity, bounded retries, the dead-letter path, and the worker's
 * permanent-vs-transient failure split.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeRedis } from "./testUtils/fakeRedis.js";
import { FakePrisma, cuid } from "../../testUtils/fakePrisma.js";
import type { ParsedInboundMessage, ParsedStatusUpdate } from "./whatsappPayload.js";

const redis = new FakeRedis();
const db = new FakePrisma();

vi.mock("../../db/redis.js", () => ({ redisCmd: redis, redis, redisSub: redis }));
vi.mock("../../db/client.js", () => ({ prisma: db.client() }));

const { WhatsAppQueue, MAX_ATTEMPTS } = await import("./whatsappQueue.js");

const ORG = "org-alpha";
const CHANNEL = "chan-1";

function inbound(id: string, text = "hello"): ParsedInboundMessage {
  return {
    kind: "message",
    messageId: id,
    phoneNumberId: "109876543210987",
    displayPhoneNumber: "15550001111",
    from: "2348012345678",
    waId: "2348012345678",
    profileName: "Ada",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    messageType: "text",
    text,
    mediaId: null,
    metadata: {},
  };
}

function status(id: string, s: string): ParsedStatusUpdate {
  return {
    kind: "status",
    eventId: `${id}:${s}`,
    messageId: id,
    phoneNumberId: "109876543210987",
    status: s,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    recipientId: "2348012345678",
    errorCode: null,
    errorMessage: null,
  };
}

function seedEventRow(eventId: string) {
  const id = cuid();
  db.seed("WhatsAppWebhookEvent", [{
    id, organizationId: ORG, channelId: CHANNEL, eventId,
    eventType: "message", payloadHash: "h", processingStatus: "RECEIVED",
    attempts: 0, receivedAt: new Date(), processedAt: null, errorMessage: null,
  }]);
  return id;
}

beforeEach(() => {
  redis.reset();
  db.reset();
});

// ─── Queue mechanics ───────────────────────────────────────────────────
describe("WhatsAppQueue", () => {
  it("round-trips a job, preserving the event and reviving the timestamp as a Date", async () => {
    const job = { eventRowId: "row-1", eventId: "wamid.A", event: inbound("wamid.A", "hi") };
    await WhatsAppQueue.enqueue(job);
    expect(await WhatsAppQueue.depth()).toBe(1);

    const claimed = await WhatsAppQueue.claim();
    expect(claimed).not.toBeNull();
    expect(claimed!.eventRowId).toBe("row-1");
    expect(claimed!.event.kind).toBe("message");
    expect((claimed!.event as ParsedInboundMessage).text).toBe("hi");
    // JSON turns Dates into strings; the queue must hand the pipeline a Date.
    expect(claimed!.event.timestamp).toBeInstanceOf(Date);
    expect(await WhatsAppQueue.depth()).toBe(0);
  });

  it("is FIFO", async () => {
    for (const id of ["a", "b", "c"]) {
      await WhatsAppQueue.enqueue({ eventRowId: id, eventId: id, event: inbound(id) });
      // Release immediately so the inflight guard doesn't interfere.
    }
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      const j = await WhatsAppQueue.claim();
      order.push(j!.eventRowId);
      await WhatsAppQueue.release(j!);
    }
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("will not hand the same event to a second worker while it is in flight", async () => {
    const job = { eventRowId: "row-x", eventId: "wamid.X", event: inbound("wamid.X") };
    await WhatsAppQueue.enqueue(job);
    await WhatsAppQueue.enqueue(job); // Meta redelivered before we finished.

    const first = await WhatsAppQueue.claim();
    const second = await WhatsAppQueue.claim();
    expect(first).not.toBeNull();
    expect(second).toBeNull(); // second copy dropped, not double-processed
  });

  it("allows a re-claim after the job is released", async () => {
    const job = { eventRowId: "row-y", eventId: "wamid.Y", event: inbound("wamid.Y") };
    await WhatsAppQueue.enqueue(job);
    const first = await WhatsAppQueue.claim();
    await WhatsAppQueue.release(first!);

    await WhatsAppQueue.enqueue(job);
    expect(await WhatsAppQueue.claim()).not.toBeNull();
  });

  it("discards an unparseable job rather than crashing the worker", async () => {
    await redis.rpush("wa:queue:pending", "{not json");
    expect(await WhatsAppQueue.claim()).toBeNull();
  });

  it("re-queues a failed job while attempts remain, then parks it in the DLQ", async () => {
    const job = { eventRowId: "row-z", eventId: "wamid.Z", event: inbound("wamid.Z") };

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const r = await WhatsAppQueue.retryOrPark(job);
      expect(r.requeued).toBe(true);
      expect(r.attempts).toBe(attempt);
    }

    const final = await WhatsAppQueue.retryOrPark(job);
    expect(final.requeued).toBe(false);
    expect(final.attempts).toBe(MAX_ATTEMPTS);
    expect(await WhatsAppQueue.dlqDepth()).toBe(1);
  });

  it("replays parked jobs back onto the pending queue for recovery", async () => {
    const job = { eventRowId: "row-d", eventId: "wamid.D", event: inbound("wamid.D") };
    for (let i = 0; i < MAX_ATTEMPTS; i++) await WhatsAppQueue.retryOrPark(job);
    expect(await WhatsAppQueue.dlqDepth()).toBe(1);
    // The two attempts before the last one each re-queued the job.
    const pendingBefore = await WhatsAppQueue.depth();
    expect(pendingBefore).toBe(MAX_ATTEMPTS - 1);

    const moved = await WhatsAppQueue.replayDlq();
    expect(moved).toBe(1);
    expect(await WhatsAppQueue.dlqDepth()).toBe(0);
    expect(await WhatsAppQueue.depth()).toBe(pendingBefore + 1);
  });

  it("reports depth as zero rather than throwing when Redis is unavailable", async () => {
    redis.failNext = "llen";
    expect(await WhatsAppQueue.depth()).toBe(0);
  });
});

// ─── Worker ────────────────────────────────────────────────────────────
describe("WhatsApp worker tick", () => {
  const pipeline = { processInboundMessage: vi.fn() };
  const messages = { applyStatusUpdate: vi.fn() };

  vi.doMock("./whatsappPipeline.js", () => ({ WhatsAppPipeline: pipeline }));
  vi.doMock("./whatsappMessage.service.js", () => ({ WhatsAppMessageService: messages }));

  const load = async () => await import("./whatsappWorker.js");

  beforeEach(() => {
    pipeline.processInboundMessage.mockReset();
    messages.applyStatusUpdate.mockReset();
  });

  it("marks a processed message event PROCESSED and stamps processedAt", async () => {
    const { processQueuedJob } = await load();
    const rowId = seedEventRow("wamid.OK");
    pipeline.processInboundMessage.mockResolvedValue({ status: "processed" });

    const done = await processQueuedJob({ eventRowId: rowId, eventId: "wamid.OK", event: inbound("wamid.OK") });

    expect(done).toBe(true);
    const row = db.tables.get("WhatsAppWebhookEvent")!.find((r) => r.id === rowId)!;
    expect(row.processingStatus).toBe("PROCESSED");
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(row.attempts).toBe(1);
  });

  it("does not retry a configuration failure — retrying cannot fix it", async () => {
    const { processQueuedJob } = await load();
    const rowId = seedEventRow("wamid.CFG");
    pipeline.processInboundMessage.mockResolvedValue({
      status: "failed", reason: "AI_PROVIDER_CONFIGURATION_REQUIRED",
    });

    const terminal = await processQueuedJob({ eventRowId: rowId, eventId: "wamid.CFG", event: inbound("wamid.CFG") });

    expect(terminal).toBe(true); // terminal, no retry
    const row = db.tables.get("WhatsAppWebhookEvent")!.find((r) => r.id === rowId)!;
    expect(row.processingStatus).toBe("FAILED");
    expect(row.errorMessage).toContain("AI_PROVIDER_CONFIGURATION_REQUIRED");
  });

  it("asks for a retry when the pipeline throws (transient fault)", async () => {
    const { processQueuedJob } = await load();
    const rowId = seedEventRow("wamid.BOOM");
    pipeline.processInboundMessage.mockRejectedValue(new Error("connection reset"));

    const terminal = await processQueuedJob({ eventRowId: rowId, eventId: "wamid.BOOM", event: inbound("wamid.BOOM") });

    expect(terminal).toBe(false); // not terminal — the queue should retry
    const row = db.tables.get("WhatsAppWebhookEvent")!.find((r) => r.id === rowId)!;
    expect(row.processingStatus).toBe("FAILED");
    expect(row.errorMessage).toContain("connection reset");
  });

  it("records a rate-limited message as IGNORED, not FAILED", async () => {
    const { processQueuedJob } = await load();
    const rowId = seedEventRow("wamid.RL");
    pipeline.processInboundMessage.mockResolvedValue({ status: "rate_limited", reason: "per-contact hourly limit" });

    await processQueuedJob({ eventRowId: rowId, eventId: "wamid.RL", event: inbound("wamid.RL") });

    const row = db.tables.get("WhatsAppWebhookEvent")!.find((r) => r.id === rowId)!;
    expect(row.processingStatus).toBe("IGNORED");
  });

  it("routes a delivery status to the message service instead of the AI pipeline", async () => {
    const { processQueuedJob } = await load();
    const rowId = seedEventRow("wamid.OUT:delivered");
    messages.applyStatusUpdate.mockResolvedValue(true);

    await processQueuedJob({
      eventRowId: rowId, eventId: "wamid.OUT:delivered", event: status("wamid.OUT", "delivered"),
    });

    expect(pipeline.processInboundMessage).not.toHaveBeenCalled();
    expect(messages.applyStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({
      whatsappMessageId: "wamid.OUT", status: "delivered",
    }));
  });

  it("keeps an unhandled notification visible as IGNORED with its field recorded", async () => {
    const { processQueuedJob } = await load();
    const rowId = seedEventRow("WABA-1:account_update:abc");

    await processQueuedJob({
      eventRowId: rowId,
      eventId: "WABA-1:account_update:abc",
      event: {
        kind: "unknown", eventId: "WABA-1:account_update:abc",
        phoneNumberId: null, field: "account_update", timestamp: new Date(),
      },
    });

    const row = db.tables.get("WhatsAppWebhookEvent")!.find((r) => r.id === rowId)!;
    expect(row.processingStatus).toBe("IGNORED");
    expect(row.errorMessage).toContain("account_update");
  });

  it("drains several jobs in one tick and reports the counts", async () => {
    const { runWhatsAppWorkerTick } = await load();
    pipeline.processInboundMessage.mockResolvedValue({ status: "processed" });

    for (const id of ["m1", "m2", "m3"]) {
      const rowId = seedEventRow(id);
      await WhatsAppQueue.enqueue({ eventRowId: rowId, eventId: id, event: inbound(id) });
    }

    const result = await runWhatsAppWorkerTick();
    expect(result.handled).toBe(3);
    expect(result.failed).toBe(0);
    expect(await WhatsAppQueue.depth()).toBe(0);
  });

  it("survives a Redis outage mid-tick without throwing", async () => {
    const { runWhatsAppWorkerTick } = await load();
    redis.failNext = "lpop";
    await expect(runWhatsAppWorkerTick()).resolves.toEqual({ handled: 0, failed: 0 });
  });
});
